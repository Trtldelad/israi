import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { IsrLogo } from "@/assets/IsrLogo";

type Conversation = {
  id: string;
  title: string;
  last_message_at: string;
};
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type Msg = { id?: string; role: "user" | "assistant"; content: string; image?: string };
type Tone = "calm" | "sharp" | "mix";
type Length = "short" | "medium" | "long";

type Settings = {
  tone: Tone;
  length: Length;
  language: "auto" | "en" | "he";
  audience: "general" | "academic" | "social";
  emoji: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  tone: "mix",
  length: "medium",
  language: "auto",
  audience: "social",
  emoji: false,
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Larger pool of dynamic suggestions
const SUGGESTION_POOLS: { tag: string; items: string[] }[] = [
  {
    tag: "Counter a post",
    items: [
      'Reply to "Israel is a settler colonial state"',
      'Reply to "From the river to the sea"',
      'Reply to "Israel is committing genocide"',
      'Reply to "Zionism is racism"',
      'Reply to "Israel equals apartheid"',
      'Reply to "Hamas is a resistance movement"',
      'Reply to "Free Palestine means free of Jews"',
      'Reply to "Jews are not indigenous to the land"',
    ],
  },
  {
    tag: "Spot the antisemitism",
    items: [
      "Is this antisemitism or fair criticism",
      "Explain the 3D test in one paragraph",
      "Old vs new antisemitism in plain words",
      "Holocaust inversion how to call it out",
      "Blood libel tropes hiding in modern posts",
      "When does anti Zionism become antisemitism",
    ],
  },
  {
    tag: "Explain and frame",
    items: [
      "What October 7 actually was in 4 lines",
      'Why "ceasefire now" misses the hostages',
      "The case for Israel in 6 sentences",
      "Indigenous peoples Jews and the land",
      "Hamas charter the 3 lines that matter",
      "Why Israel is a democracy explained simply",
    ],
  },
  {
    tag: "When NOT to reply",
    items: [
      "How to spot bad faith bait online",
      "Bot accounts how to recognize them",
      "When silence wins the argument",
      "Dogpile threads when to walk away",
    ],
  },
];

function pickSuggestions(seed: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < SUGGESTION_POOLS.length; i++) {
    const pool = SUGGESTION_POOLS[i].items;
    out.push(pool[(seed + i * 7) % pool.length]);
  }
  return out;
}

const TONES: { key: Tone; label: string; hint: string }[] = [
  { key: "calm", label: "Calm", hint: "Factual persuasive to neutrals" },
  { key: "mix", label: "Balanced", hint: "Factual with a confident edge" },
  { key: "sharp", label: "Sharp", hint: "Direct rebuttals no apologies" },
];

const SETTINGS_KEY = "isr-settings-v1";

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type Props = { guest?: boolean; onExitGuest?: () => void };

export function Chat({ guest = false, onExitGuest }: Props = {}) {
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 9999));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const suggestions = useMemo(() => pickSuggestions(seed), [seed]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const loadConversations = async () => {
    if (guest || !user) return;
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,last_message_at")
      .order("last_message_at", { ascending: false });
    if (error) return;
    setConversations(data ?? []);
  };

  const loadMessages = async (cid: string) => {
    if (guest) return;
    const { data, error } = await supabase
      .from("messages")
      .select("id,role,content")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    if (error) return;
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );
  };

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, user?.id]);

  useEffect(() => {
    if (activeId && !guest) void loadMessages(activeId);
    else if (!activeId) setMessages([]);
    setSeed(Math.floor(Math.random() * 9999));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setPendingImage(null);
    setSeed(Math.floor(Math.random() * 9999));
    taRef.current?.focus();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newChat();
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (mod && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (shortcutsOpen) setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, shortcutsOpen]);

  const deleteConv = async (id: string) => {
    if (guest) return;
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) return toast.error("Could not delete");
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    await loadConversations();
  };

  const renameConv = async (id: string, currentTitle: string) => {
    if (guest) return;
    const next = window.prompt("Rename conversation", currentTitle);
    if (!next || next.trim() === "") return;
    const { error } = await supabase
      .from("conversations")
      .update({ title: next.trim().slice(0, 60) })
      .eq("id", id);
    if (error) return toast.error("Could not rename");
    await loadConversations();
  };

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (f.size > 6 * 1024 * 1024) return toast.error("Image too large", { description: "Max 6MB" });
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
    };
    reader.readAsDataURL(f);
  };

  // Core send: takes the messages history to send to the model.
  // If overrideMessages is provided, use that instead of building from current state.
  const runCompletion = async (
    historyForModel: Msg[],
    convIdForSave: string | null,
    onAssistantText: (text: string) => void
  ): Promise<string> => {
    const payloadMessages = historyForModel.map((m) => {
      if (m.image) {
        const parts: ContentPart[] = [
          { type: "text", text: m.content || "Please analyze this image" },
          { type: "image_url", image_url: { url: m.image } },
        ];
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    let assistantText = "";
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? SUPABASE_KEY;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({ messages: payloadMessages, settings }),
    });

    if (!resp.ok || !resp.body) {
      if (resp.status === 429) toast.error("Rate limited", { description: "Please try again in a moment" });
      else if (resp.status === 402) toast.error("Out of AI credits", { description: "Add credits in workspace settings" });
      else toast.error("AI error", { description: `Status ${resp.status}` });
      return "";
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;
    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          done = true;
          break;
        }
        try {
          const json = JSON.parse(payload);
          const c = json.choices?.[0]?.delta?.content;
          if (c) {
            assistantText += c;
            onAssistantText(assistantText);
          }
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }

    if (assistantText && !guest && convIdForSave && user) {
      await supabase.from("messages").insert({
        conversation_id: convIdForSave,
        user_id: user.id,
        role: "assistant",
        content: assistantText,
      });
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", convIdForSave);
    }
    return assistantText;
  };

  const send = async () => {
    const content = input.trim();
    const img = pendingImage;
    if ((!content && !img) || streaming) return;
    if (!guest && !user) return;

    let convId = activeId;
    if (!guest && user && !convId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title: "New chat" })
        .select()
        .single();
      if (error || !data) return toast.error("Could not start conversation");
      convId = data.id;
      setActiveId(convId);
    }

    const userMsg: Msg = {
      role: "user",
      content: content || (img ? "Analyze this image and tell me what to reply" : ""),
      image: img ?? undefined,
    };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setPendingImage(null);
    setStreaming(true);

    if (!guest && convId && user) {
      const persisted = userMsg.image ? `${userMsg.content}\n\n[image attached]` : userMsg.content;
      await supabase.from("messages").insert({
        conversation_id: convId,
        user_id: user.id,
        role: "user",
        content: persisted,
      });
    }

    const onText = (text: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: text } : m));
        }
        return [...prev, { role: "assistant", content: text }];
      });
    };

    try {
      const assistantText = await runCompletion(newHistory, convId, onText);

      if (assistantText && !guest && convId && user) {
        const currentConv = conversations.find((c) => c.id === convId);
        const isWeak = !currentConv || currentConv.title === "New chat" || currentConv.title.length < 5;
        if (isWeak) {
          try {
            const { data: sd } = await supabase.auth.getSession();
            const tk = sd.session?.access_token ?? SUPABASE_KEY;
            const titleHist = newHistory.map((m) => ({ role: m.role, content: m.content || "image" }));
            const tr = await fetch(`${SUPABASE_URL}/functions/v1/title`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tk}`,
                apikey: SUPABASE_KEY,
              },
              body: JSON.stringify({
                messages: [...titleHist, { role: "assistant", content: assistantText }].slice(-6),
              }),
            });
            if (tr.ok) {
              const { title } = await tr.json();
              if (title) {
                await supabase.from("conversations").update({ title }).eq("id", convId);
              }
            }
          } catch {
            /* ignore */
          }
        }
        await loadConversations();
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setStreaming(false);
    }
  };

  // Regenerate last assistant message with a different wording
  const regenerate = async () => {
    if (streaming) return;
    // find last assistant index
    const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === "assistant");
    if (lastAssistantIdx === -1) return;
    const realIdx = messages.length - 1 - lastAssistantIdx;
    const trimmed = messages.slice(0, realIdx);
    setMessages(trimmed);
    setStreaming(true);

    // append a regenerate hint to the last user message (in-memory only)
    const hinted: Msg[] = trimmed.map((m, i) => {
      if (i === trimmed.length - 1 && m.role === "user") {
        return { ...m, content: m.content + "\n\nRephrase the answer with different wording and structure keep it accurate" };
      }
      return m;
    });

    const onText = (text: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: text } : m));
        }
        return [...prev, { role: "assistant", content: text }];
      });
    };

    try {
      await runCompletion(hinted, activeId, onText);
    } finally {
      setStreaming(false);
    }
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingValue(messages[idx].content);
  };
  const cancelEdit = () => {
    setEditingIdx(null);
    setEditingValue("");
  };
  const submitEdit = async () => {
    if (editingIdx == null) return;
    const newContent = editingValue.trim();
    if (!newContent) return;
    const trimmed = messages.slice(0, editingIdx + 1).map((m, i) =>
      i === editingIdx ? { ...m, content: newContent } : m
    );
    setMessages(trimmed);
    setEditingIdx(null);
    setEditingValue("");
    setStreaming(true);

    const onText = (text: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: text } : m));
        }
        return [...prev, { role: "assistant", content: text }];
      });
    };

    try {
      await runCompletion(trimmed, activeId, onText);
    } finally {
      setStreaming(false);
    }
  };

  const initials = useMemo(() => {
    const n = user?.user_metadata?.full_name || user?.email || (guest ? "Guest" : "");
    return String(n).trim().slice(0, 1).toUpperCase() || "G";
  }, [user, guest]);

  const avatarUrl: string | undefined = user?.user_metadata?.avatar_url;

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden relative">
      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 size-[420px] rounded-full bg-foreground/[0.035] blur-3xl animate-orb-slow" />
        <div className="absolute bottom-0 right-0 size-[520px] rounded-full bg-foreground/[0.04] blur-3xl animate-orb-slower" />
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0 md:w-72" : "-translate-x-full md:translate-x-0 md:w-0"
        } fixed md:static inset-y-0 left-0 z-30 w-72 bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border flex flex-col transition-all duration-500 [transition-timing-function:var(--easing-apple)] overflow-hidden`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2.5">
            <IsrLogo className="text-foreground" size={26} />
            <span className="text-sm font-semibold tracking-tight">ISR AI</span>
            {guest && <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-0.5">Guest</span>}
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="size-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close sidebar"
            title="Close sidebar  Cmd B"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6 9 12l6 6" />
            </svg>
          </button>
        </div>

        <div className="p-3 shrink-0">
          <button
            onClick={newChat}
            className="w-full h-10 rounded-full bg-foreground text-background text-sm font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] shadow-[var(--shadow-soft)]"
          >
            <span className="text-base leading-none">+</span> New chat
            <span className="ml-2 text-[10px] opacity-60 hidden md:inline">⌘K</span>
          </button>
        </div>

        <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium shrink-0">
          {guest ? "Guest session" : "Conversations"}
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll px-2 pb-3">
          {guest && (
            <div className="text-xs text-muted-foreground px-3 py-2 leading-relaxed">
              Your guest chat is not saved Sign in to keep your history
            </div>
          )}
          {!guest && conversations.length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-2">No chats yet</div>
          )}
          {!guest && conversations.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all duration-300 mb-0.5 ${
                activeId === c.id
                  ? "bg-sidebar-accent text-foreground"
                  : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground"
              }`}
              style={{ animation: `apple-slide-in-left 0.4s var(--easing-apple) ${i * 0.03}s both` }}
            >
              <span className="truncate text-sm flex-1">{c.title}</span>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void renameConv(c.id, c.title);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
                >
                  Rename
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteConv(c.id);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-sidebar-border p-3 flex items-center gap-3 shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" width={32} height={32} />
          ) : (
            <div className="size-8 rounded-full bg-foreground text-background grid place-items-center text-base font-serif font-medium shadow-2xl">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">
              {guest ? "Guest" : user?.user_metadata?.full_name || user?.email}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {guest ? "Not signed in" : user?.email}
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="size-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Settings"
            title="Settings  Cmd ,"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {guest ? (
            <button onClick={onExitGuest} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </button>
          ) : (
            <button onClick={() => signOut()} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </button>
          )}
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-foreground/30 animate-apple-fade"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="apple-blur sticky top-0 z-10 h-14 border-b border-border flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="size-8 rounded-full hover:bg-accent grid place-items-center transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Toggle sidebar"
            title="Toggle sidebar  Cmd B"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <IsrLogo className="text-foreground md:hidden" size={22} />
          <div className="text-sm font-semibold tracking-tight truncate">
            {guest ? "Guest chat" : conversations.find((c) => c.id === activeId)?.title || "New chat"}
          </div>

          <div className="ml-auto hidden sm:flex items-center gap-1 p-1 rounded-full bg-muted border border-border">
            {TONES.map((t) => (
              <button
                key={t.key}
                onClick={() => setSettings((s) => ({ ...s, tone: t.key }))}
                title={t.hint}
                className={`px-3 h-7 rounded-full text-[11px] font-medium transition-all duration-300 ${
                  settings.tone === t.key
                    ? "bg-foreground text-background shadow-[var(--shadow-soft)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="size-8 rounded-full hover:bg-accent grid place-items-center transition-colors text-muted-foreground hover:text-foreground"
            title="Keyboard shortcuts  Cmd /"
            aria-label="Keyboard shortcuts"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
            </svg>
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
            {messages.length === 0 && !streaming && (
              <div className="text-center pt-10 animate-apple-up">
                <div className="mx-auto mb-5 animate-pop inline-block">
                  <IsrLogo className="text-foreground" size={64} />
                </div>
                <div className="text-4xl md:text-5xl font-semibold tracking-[-0.045em]">
                  How can I help you reply
                </div>

                <div className="mt-5 sm:hidden flex justify-center">
                  <div className="flex items-center gap-1 p-1 rounded-full bg-muted border border-border">
                    {TONES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setSettings((s) => ({ ...s, tone: t.key }))}
                        className={`px-3 h-7 rounded-full text-[11px] font-medium transition-all duration-300 ${
                          settings.tone === t.key ? "bg-foreground text-background" : "text-muted-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-8 grid sm:grid-cols-2 gap-2.5 text-left max-w-xl mx-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={`${seed}-${i}`}
                      onClick={() => setInput(s)}
                      className="group relative text-sm text-left p-4 rounded-2xl border border-border bg-card hover:bg-accent transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
                      style={{ animation: `apple-fade-up 0.6s var(--easing-apple) ${0.1 + i * 0.07}s both` }}
                    >
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                        {SUGGESTION_POOLS[i].tag}
                      </div>
                      <div className="font-medium leading-snug">{s}</div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setSeed(Math.floor(Math.random() * 9999))}
                  className="mt-5 text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                >
                  <span>↻</span> Refresh
                </button>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble
                key={i}
                msg={m}
                streaming={streaming && i === messages.length - 1 && m.role === "assistant"}
                isEditing={editingIdx === i}
                editingValue={editingValue}
                onEditingChange={setEditingValue}
                onEdit={() => startEdit(i)}
                onCancelEdit={cancelEdit}
                onSubmitEdit={() => void submitEdit()}
                onRegenerate={() => void regenerate()}
                showRegenerate={
                  m.role === "assistant" &&
                  i === messages.length - 1 &&
                  !streaming
                }
              />
            ))}

            {streaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3 animate-apple-up">
                <Avatar role="assistant" />
                <div className="px-4 py-3 rounded-2xl bg-muted text-sm text-muted-foreground">
                  <span className="shimmer-text">Drafting your reply</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-background/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
            {pendingImage && (
              <div className="mb-2 inline-flex items-center gap-2 p-1.5 pr-3 rounded-2xl border border-border bg-card animate-pop">
                <img src={pendingImage} alt="attachment" className="size-12 rounded-xl object-cover" />
                <span className="text-xs text-muted-foreground">Image ready describe it or just send</span>
                <button
                  onClick={() => setPendingImage(null)}
                  className="size-6 rounded-full hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 pl-2 shadow-[var(--shadow-soft)] focus-within:border-foreground transition-all duration-300">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={streaming}
                className="size-9 shrink-0 rounded-full hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-all duration-300 disabled:opacity-40"
                aria-label="Attach image"
                title="Attach image"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.5V7a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h7" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.5-3.5L9 20" />
                  <path d="M19 17v6M16 20h6" />
                </svg>
              </button>
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={pendingImage ? "Add context optional" : "Paste a post or ask what to reply"}
                className="flex-1 resize-none bg-transparent outline-none text-[15px] py-2.5 placeholder:text-muted-foreground max-h-[200px] thin-scroll"
              />
              <button
                onClick={() => void send()}
                disabled={(!input.trim() && !pendingImage) || streaming}
                className={`size-9 shrink-0 rounded-full bg-foreground text-background grid place-items-center transition-all duration-300 hover:scale-[1.05] active:scale-95 disabled:opacity-40 disabled:scale-100 ${
                  streaming ? "animate-pulse-ring" : ""
                }`}
                aria-label="Send"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsPanel onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div className="size-7 shrink-0 rounded-full bg-muted border border-border grid place-items-center text-[11px] font-medium text-foreground">
        You
      </div>
    );
  }
  return (
    <div className="size-7 shrink-0 rounded-full bg-foreground grid place-items-center overflow-hidden text-background">
      <IsrLogo size={20} />
    </div>
  );
}

type BubbleProps = {
  msg: Msg;
  streaming: boolean;
  isEditing: boolean;
  editingValue: string;
  onEditingChange: (v: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  onRegenerate: () => void;
  showRegenerate: boolean;
};

function Bubble({
  msg,
  streaming,
  isEditing,
  editingValue,
  onEditingChange,
  onEdit,
  onCancelEdit,
  onSubmitEdit,
  onRegenerate,
  showRegenerate,
}: BubbleProps) {
  const isUser = msg.role === "user";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className={`flex gap-3 animate-apple-up ${isUser ? "justify-end" : ""}`}>
      {!isUser && <Avatar role="assistant" />}
      <div className={`group max-w-[82%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl text-[15px] leading-relaxed ${
            isUser ? "bg-foreground text-background px-4 py-2.5" : "bg-muted text-foreground px-4 py-3 md-body"
          } ${streaming ? "typing-caret" : ""}`}
        >
          {msg.image && (
            <img src={msg.image} alt="attachment" className="mb-2 max-h-64 rounded-xl border border-border" />
          )}
          {isEditing ? (
            <div className="flex flex-col gap-2 min-w-[260px]">
              <textarea
                value={editingValue}
                onChange={(e) => onEditingChange(e.target.value)}
                rows={Math.min(8, Math.max(2, editingValue.split("\n").length))}
                className="w-full resize-none bg-background/20 text-background outline-none text-[15px] rounded-lg p-2"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={onCancelEdit} className="text-[11px] opacity-80 hover:opacity-100 px-2 py-1 rounded">
                  Cancel
                </button>
                <button onClick={onSubmitEdit} className="text-[11px] bg-background text-foreground px-2.5 py-1 rounded font-medium">
                  Send
                </button>
              </div>
            </div>
          ) : isUser ? (
            msg.content
          ) : (
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          )}
        </div>

        {!isEditing && msg.content && !streaming && (
          <div className={`mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? "" : ""}`}>
            <IconButton title="Copy" onClick={copy}>
              <svg viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            </IconButton>
            {isUser && (
              <IconButton title="Edit" onClick={onEdit}>
                <svg viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </IconButton>
            )}
            {showRegenerate && (
              <IconButton title="Try a different wording" onClick={onRegenerate}>
                <svg viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
              </IconButton>
            )}
          </div>
        )}
      </div>
      {isUser && <Avatar role="user" />}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="size-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {children}
    </button>
  );
}

function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-apple-fade">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] animate-apple-up">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-base font-semibold tracking-tight">Settings</div>
            <div className="text-xs text-muted-foreground">Customize how ISR replies</div>
          </div>
          <button onClick={onClose} className="size-7 grid place-items-center rounded-full hover:bg-accent text-muted-foreground hover:text-foreground" aria-label="Close">
            ×
          </button>
        </div>

        <div className="space-y-5">
          <Field label="Tone">
            <Pills
              value={settings.tone}
              options={[
                { v: "calm", label: "Calm" },
                { v: "mix", label: "Balanced" },
                { v: "sharp", label: "Sharp" },
              ]}
              onChange={(v) => onChange({ ...settings, tone: v as Tone })}
            />
          </Field>
          <Field label="Reply length">
            <Pills
              value={settings.length}
              options={[
                { v: "short", label: "Short" },
                { v: "medium", label: "Medium" },
                { v: "long", label: "Long" },
              ]}
              onChange={(v) => onChange({ ...settings, length: v as Length })}
            />
          </Field>
          <Field label="Audience">
            <Pills
              value={settings.audience}
              options={[
                { v: "general", label: "General" },
                { v: "social", label: "Social media" },
                { v: "academic", label: "Academic" },
              ]}
              onChange={(v) => onChange({ ...settings, audience: v as Settings["audience"] })}
            />
          </Field>
          <Field label="Language">
            <Pills
              value={settings.language}
              options={[
                { v: "auto", label: "Auto" },
                { v: "en", label: "English" },
                { v: "he", label: "עברית" },
              ]}
              onChange={(v) => onChange({ ...settings, language: v as Settings["language"] })}
            />
          </Field>
          <Field label="Allow emoji">
            <button
              onClick={() => onChange({ ...settings, emoji: !settings.emoji })}
              className={`h-7 w-12 rounded-full border border-border transition-colors relative ${
                settings.emoji ? "bg-foreground" : "bg-muted"
              }`}
              aria-pressed={settings.emoji}
            >
              <span
                className={`absolute top-0.5 size-6 rounded-full bg-background transition-transform ${
                  settings.emoji ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </Field>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full h-10 rounded-full bg-foreground text-background text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform shadow-[var(--shadow-soft)]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm font-medium">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Pills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-muted border border-border">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-3 h-7 rounded-full text-[11px] font-medium transition-all duration-300 ${
            value === o.v
              ? "bg-foreground text-background shadow-[var(--shadow-soft)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const rows: { keys: string; desc: string }[] = [
    { keys: "⌘ K", desc: "New chat" },
    { keys: "⌘ B", desc: "Toggle sidebar" },
    { keys: "⌘ ,", desc: "Open settings" },
    { keys: "⌘ /", desc: "Show this list" },
    { keys: "Enter", desc: "Send message" },
    { keys: "Shift Enter", desc: "New line" },
    { keys: "Esc", desc: "Close panel" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-apple-fade">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] animate-apple-up">
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold tracking-tight">Keyboard shortcuts</div>
          <button onClick={onClose} className="size-7 grid place-items-center rounded-full hover:bg-accent text-muted-foreground hover:text-foreground" aria-label="Close">
            ×
          </button>
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.keys} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{r.desc}</span>
              <kbd className="px-2 py-0.5 rounded-md border border-border bg-muted text-[11px] font-mono">
                {r.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
