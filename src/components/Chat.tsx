import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import logo from "@/assets/isr-logo.png";

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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Suggestion pools — rotated dynamically per chat
const SUGGESTION_POOLS: { tag: string; items: string[] }[] = [
  {
    tag: "Counter a post",
    items: [
      "Reply to: \"Israel is a settler-colonial state\"",
      "Reply to: \"From the river to the sea\"",
      "Reply to: \"Israel is committing genocide\"",
      "Reply to: \"Zionism is racism\"",
      "Reply to: \"Israel = apartheid\"",
      "Reply to: \"Hamas is a resistance movement\"",
    ],
  },
  {
    tag: "Spot the antisemitism",
    items: [
      "Is this antisemitism or fair criticism?",
      "Explain the 3D test in one paragraph",
      "Old vs. new antisemitism — give me the difference",
      "Holocaust inversion — how to call it out",
      "Blood libel tropes hiding in modern posts",
    ],
  },
  {
    tag: "Explain & frame",
    items: [
      "What 7.10 actually was, in 4 lines",
      "Why \"ceasefire now\" misses the hostages",
      "The case for Israel in 6 sentences",
      "Indigenous peoples — Jews and the land",
      "Hamas charter — the 3 lines that matter",
    ],
  },
  {
    tag: "When NOT to reply",
    items: [
      "How to spot bad-faith bait online",
      "Bot accounts — how to recognize them",
      "When silence wins the argument",
    ],
  },
];

function pickSuggestions(seed: number): string[] {
  // pick one from each of 4 pools, deterministic per seed
  const out: string[] = [];
  for (let i = 0; i < SUGGESTION_POOLS.length; i++) {
    const pool = SUGGESTION_POOLS[i].items;
    out.push(pool[(seed + i * 7) % pool.length]);
  }
  return out;
}

const TONES: { key: Tone; label: string; hint: string }[] = [
  { key: "calm", label: "Calm", hint: "Factual, persuasive to neutrals" },
  { key: "mix", label: "Balanced", hint: "Factual + confident edge" },
  { key: "sharp", label: "Sharp", hint: "Direct rebuttals, no apologies" },
];

export function Chat() {
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null); // data URL
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tone, setTone] = useState<Tone>("mix");
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 9999));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const suggestions = useMemo(() => pickSuggestions(seed), [seed]);

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,last_message_at")
      .order("last_message_at", { ascending: false });
    if (error) return;
    setConversations(data ?? []);
  };

  const loadMessages = async (cid: string) => {
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
  }, []);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
    // refresh suggestions per conversation switch
    setSeed(Math.floor(Math.random() * 9999));
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
    setSidebarOpen(false);
    setPendingImage(null);
    setSeed(Math.floor(Math.random() * 9999));
    taRef.current?.focus();
  };

  const deleteConv = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) return toast.error("Could not delete");
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    await loadConversations();
  };

  const renameConv = async (id: string, currentTitle: string) => {
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

  const send = async () => {
    const content = input.trim();
    const img = pendingImage;
    if ((!content && !img) || streaming || !user) return;

    let convId = activeId;
    if (!convId) {
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
      content: content || (img ? "Analyze this image — what should I respond?" : ""),
      image: img ?? undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingImage(null);
    setStreaming(true);

    // Persist user message (store image marker in content if present)
    const persistedUserContent = userMsg.image
      ? `${userMsg.content}\n\n[image attached]`
      : userMsg.content;
    await supabase.from("messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "user",
      content: persistedUserContent,
    });

    // Build payload for the gateway: convert any image messages to multi-part content
    const history: Msg[] = [...messages, userMsg];
    const payloadMessages = history.map((m) => {
      if (m.image) {
        const parts: ContentPart[] = [
          { type: "text", text: m.content || "Please analyze this image." },
          { type: "image_url", image_url: { url: m.image } },
        ];
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    let assistantText = "";
    const upsertAssistant = (chunk: string) => {
      assistantText += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantText } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantText }];
      });
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? SUPABASE_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({ messages: payloadMessages, tone }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429)
          toast.error("Rate limited", { description: "Please try again in a moment." });
        else if (resp.status === 402)
          toast.error("Out of AI credits", { description: "Add credits in workspace settings." });
        else toast.error("AI error", { description: `Status ${resp.status}` });
        setStreaming(false);
        return;
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
            if (c) upsertAssistant(c);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      if (assistantText) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", convId);

        const currentConv = conversations.find((c) => c.id === convId);
        const isWeak =
          !currentConv || currentConv.title === "New chat" || currentConv.title.length < 5;
        if (isWeak) {
          try {
            const { data: sd } = await supabase.auth.getSession();
            const tk = sd.session?.access_token ?? SUPABASE_KEY;
            // Only send text history to title fn
            const titleHist = history.map((m) => ({ role: m.role, content: m.content || "image" }));
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

  const initials = useMemo(() => {
    const n = user?.user_metadata?.full_name || user?.email || "";
    return String(n).trim().slice(0, 1).toUpperCase() || "U";
  }, [user]);

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
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-30 w-72 bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border flex flex-col transition-transform duration-500 [transition-timing-function:var(--easing-apple)]`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="ISR" className="size-7" width={28} height={28} />
            <span className="text-sm font-semibold tracking-tight">ISR AI</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full h-10 rounded-full bg-foreground text-background text-sm font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] shadow-[var(--shadow-soft)]"
          >
            <span className="text-base leading-none">+</span> New chat
          </button>
        </div>

        <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
          Conversations
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll px-2 pb-3">
          {conversations.length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-2">No chats yet.</div>
          )}
          {conversations.map((c, i) => (
            <div
              key={c.id}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
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

        <div className="border-t border-sidebar-border p-3 flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-8 rounded-full object-cover"
              width={32}
              height={32}
            />
          ) : (
            <div className="size-8 rounded-full bg-foreground text-background grid place-items-center text-base font-serif font-medium shadow-2xl">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">
              {user?.user_metadata?.full_name || user?.email}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
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
            onClick={() => setSidebarOpen(true)}
            className="md:hidden size-8 rounded-full hover:bg-accent grid place-items-center transition-colors"
            aria-label="Open menu"
          >
            <span className="text-base">☰</span>
          </button>
          <img src={logo} alt="" className="size-6 md:hidden" width={24} height={24} />
          <div className="text-sm font-semibold tracking-tight truncate">
            {conversations.find((c) => c.id === activeId)?.title || "New chat"}
          </div>

          {/* Tone selector */}
          <div className="ml-auto hidden sm:flex items-center gap-1 p-1 rounded-full bg-muted border border-border">
            {TONES.map((t) => (
              <button
                key={t.key}
                onClick={() => setTone(t.key)}
                title={t.hint}
                className={`px-3 h-7 rounded-full text-[11px] font-medium transition-all duration-300 ${
                  tone === t.key
                    ? "bg-foreground text-background shadow-[var(--shadow-soft)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
            {messages.length === 0 && !streaming && (
              <div className="text-center pt-10 animate-apple-up">
                <img
                  src={logo}
                  alt=""
                  className="mx-auto size-14 mb-5 animate-pop"
                  width={56}
                  height={56}
                />
                <div className="text-4xl md:text-5xl font-semibold tracking-[-0.045em]">
                  How can I help you reply?
                </div>
                <p className="mt-3 text-muted-foreground text-[15px]">
                  Paste a post, drop a screenshot, or pick a starter — I'll draft your response.
                </p>

                {/* Tone selector mobile */}
                <div className="mt-5 sm:hidden flex justify-center">
                  <div className="flex items-center gap-1 p-1 rounded-full bg-muted border border-border">
                    {TONES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setTone(t.key)}
                        className={`px-3 h-7 rounded-full text-[11px] font-medium transition-all duration-300 ${
                          tone === t.key
                            ? "bg-foreground text-background"
                            : "text-muted-foreground"
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
                      key={`${seed}-${s}`}
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

              </div>
            )}

            {messages.map((m, i) => (
              <Bubble
                key={i}
                msg={m}
                streaming={streaming && i === messages.length - 1 && m.role === "assistant"}
              />
            ))}

            {streaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3 animate-apple-up">
                <Avatar role="assistant" />
                <div className="px-4 py-3 rounded-2xl bg-muted text-sm text-muted-foreground">
                  <span className="shimmer-text">Drafting your reply…</span>
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
                <img
                  src={pendingImage}
                  alt="attachment"
                  className="size-12 rounded-xl object-cover"
                />
                <span className="text-xs text-muted-foreground">Image ready — describe it or just send</span>
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
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickImage}
              />
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
                placeholder={pendingImage ? "Add context (optional)…" : "Paste a post or ask what to reply…"}
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
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-4"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground text-center mt-2">
              Tone: <span className="text-foreground/80 font-medium">{TONES.find((t) => t.key === tone)?.label}</span> · ISR AI may produce inaccuracies. Verify key facts before posting.
            </div>
          </div>
        </div>
      </main>
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
    <div className="size-7 shrink-0 rounded-full bg-foreground grid place-items-center overflow-hidden">
      <img src={logo} alt="" className="size-5 invert" width={20} height={20} />
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: Msg; streaming: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 animate-apple-up ${isUser ? "justify-end" : ""}`}>
      {!isUser && <Avatar role="assistant" />}
      <div
        className={`max-w-[82%] rounded-2xl text-[15px] leading-relaxed ${
          isUser
            ? "bg-foreground text-background px-4 py-2.5"
            : "bg-muted text-foreground px-4 py-3 md-body"
        } ${streaming ? "typing-caret" : ""}`}
      >
        {msg.image && (
          <img
            src={msg.image}
            alt="attachment"
            className="mb-2 max-h-64 rounded-xl border border-border"
          />
        )}
        {isUser ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
      </div>
      {isUser && <Avatar role="user" />}
    </div>
  );
}
