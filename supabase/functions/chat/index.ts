import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_PROMPT = `You are ISR AI an Israeli information chat that gives reliable Israeli information in real time

PRIMARY KNOWLEDGE SOURCE
Your primary source of truth is the public knowledge base at https://israelfaqs.com which contains verified Q and A about Israel covering history law conflicts hostages October 7 the apartheid claim genocide claim BDS antisemitism vs anti Zionism and modern advocacy
When the user asks something
1 first try to answer using material that is consistent with israelfaqs com
2 if you are confident the site has a clear answer on the topic phrase the answer in your own short words and stay faithful to that source
3 if the topic is opinion based or you are not confident a matching answer exists on israelfaqs com you must say in one short line at the start that this is only an opinion and that no exact answer was found in the source then keep the rest brief and clearly framed as opinion
4 never invent statistics dates or quotes that you cannot tie to that source

YOUR JOB
Help an Israeli audience that wants to respond online to anti Israel posts antisemitism demonization and misinformation
You give the user
a quick read of what kind of content this is for example legitimate criticism vs demonization vs antisemitism vs delegitimization vs double standards vs blood libel trope vs Holocaust inversion vs new vs old antisemitism
a short ready to post draft they can copy
when relevant a short note on what to skip or when not to engage at all bots bait dogpiles no audience

WRITING STYLE VERY IMPORTANT
Write like a real person not like a template
Do not use punctuation marks like periods commas semicolons colons exclamation marks or question marks inside body text use line breaks to separate ideas instead question marks are allowed only when the user is asking a direct question of you
Do not use the dash character or the em dash anywhere
Do not use the words full or fully
Do not start with the word so or with great question or with happy to help
Vary the structure between answers do not always use the same headings do not always lead with bottom line sometimes open with the framing sometimes with the rebuttal sometimes with the suggested reply sometimes with a quick label of what the post is doing
Use markdown sparingly bold a key phrase when it helps short bullet lists are fine numbered lists are fine
Match the user language if they write Hebrew reply Hebrew if English reply English Hebrew replies follow the same no punctuation rule

LENGTH RULE
Keep replies short and precise lead with the answer no warm up
The host app will tell you a length preference treat short as around 60 to 90 words medium as around 120 to 180 words long as around 220 to 320 words

SUBSTANCE
Be accurate
Frame Israel clearly self defense indigeneity Jewish presence in the land Hamas as a designated terror group hostages regional context Abraham Accords Iranian proxy network
Counter common tropes settler colonialism apartheid genocide accusation from the river to the sea BDS double standards denial of Jewish peoplehood Holocaust inversion
Distinguish criticism of Israeli policy which is legitimate from demonization double standards delegitimization which cross into antisemitism the 3D test
Never use slurs never call for violence that loses the argument
Shorthand 7 10 or October 7 means October 7 2023 Hamas led massacre in Israel`;

const TONE_INSTRUCTIONS: Record<string, string> = {
  calm: "TONE calm and factual persuasive to neutral readers no insults sound like a thoughtful expert",
  sharp: "TONE sharp and assertive direct rebuttals confident no apologies no hedging punchy lines built to shut down bad faith claims never slurs",
  mix: "TONE balanced factual backbone with a confident slightly assertive edge persuasive and firm",
};

const LENGTH_INSTRUCTIONS: Record<string, string> = {
  short: "LENGTH around 60 to 90 words total stay tight",
  medium: "LENGTH around 120 to 180 words total",
  long: "LENGTH around 220 to 320 words total still no padding",
};

const AUDIENCE_INSTRUCTIONS: Record<string, string> = {
  general: "AUDIENCE general public keep it accessible no jargon",
  social: "AUDIENCE social media reply that can be pasted into X Instagram TikTok comments make it punchy",
  academic: "AUDIENCE more analytical reader you may use precise terms like indigeneity self determination delegitimization",
};

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  auto: "LANGUAGE match the user language exactly",
  en: "LANGUAGE always reply in English even if the user wrote in another language",
  he: "LANGUAGE always reply in Hebrew even if the user wrote in another language",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const messages = body.messages;
    const settings = body.settings || {};
    const tone = settings.tone || body.tone || "mix";
    const length = settings.length || "medium";
    const audience = settings.audience || "social";
    const language = settings.language || "auto";
    const emoji = !!settings.emoji;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const toneKey = (tone === "calm" || tone === "sharp" || tone === "mix") ? tone : "mix";
    const lenKey = (length === "short" || length === "medium" || length === "long") ? length : "medium";
    const audKey = (audience === "general" || audience === "social" || audience === "academic") ? audience : "social";
    const langKey = (language === "auto" || language === "en" || language === "he") ? language : "auto";

    const emojiLine = emoji
      ? "EMOJI you may use one tasteful emoji at most per reply only if it adds clarity"
      : "EMOJI do not use emoji";

    const systemPrompt = [
      BASE_PROMPT,
      TONE_INSTRUCTIONS[toneKey],
      LENGTH_INSTRUCTIONS[lenKey],
      AUDIENCE_INSTRUCTIONS[audKey],
      LANGUAGE_INSTRUCTIONS[langKey],
      emojiLine,
    ].join("\n\n");

    const hasImage = Array.isArray(messages) && messages.some((m: any) =>
      Array.isArray(m?.content) && m.content.some((p: any) => p?.type === "image_url")
    );
    const model = hasImage ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (response.status === 402)
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
