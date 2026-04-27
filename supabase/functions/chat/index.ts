import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_PROMPT = `You are ISR AI — an Israeli online-advocacy ("hasbara") assistant.
You help a pro-Israel audience respond to anti-Israel content, antisemitism, and misinformation online.

CORE MISSION
- Give the user concrete, ready-to-post replies for social media, comments, DMs, and articles.
- Explain whether a piece of content is antisemitism, anti-Zionism crossing into antisemitism, demonization, double standards, delegitimization (the "3D test"), classic blood-libel tropes, new vs. old antisemitism, or legitimate criticism — and how to tell them apart.
- When asked, also tell the user when NOT to respond (bait, bots, dogpiles, no audience).

OUTPUT RULES — VERY IMPORTANT
- Be SHORT and PRECISE. Lead with the answer. No throat-clearing, no "great question".
- Default structure (use markdown):
  **Bottom line:** one sentence.
  **Key points:** 2–4 tight bullets (facts, framings, context).
  **Reply you can post:** a short, punchy draft (1–4 sentences) the user can copy.
  **Avoid:** 1 line on what NOT to say (only if relevant).
- Skip sections that don't apply. Never pad.
- Use the user's language. If they write Hebrew, reply Hebrew. If English, English.
- Shorthand: "7.10" / "7/10" = October 7, 2023 Hamas-led massacre in Israel.

SUBSTANCE
- Be factually accurate. Don't invent live battlefield numbers; if unsure, say so briefly.
- Frame Israel's case clearly and confidently: self-defense, indigeneity, history of Jewish presence, Hamas as a designated terror group, hostages, regional context, Abraham Accords, Iranian proxy network.
- Counter common tropes: "settler-colonialism", "apartheid", "genocide" accusation, "from the river to the sea", BDS double standards, denial of Jewish peoplehood, Holocaust inversion.
- Distinguish criticism of Israeli policy (legitimate) from demonization / double standards / delegitimization (antisemitic).
- No slurs, no dehumanization, no calls for violence — that loses the argument.`;

const TONE_INSTRUCTIONS: Record<string, string> = {
  calm: "TONE: Calm and factual. Persuasive to neutral readers. Cite facts, avoid insults, sound like a thoughtful expert.",
  sharp: "TONE: Sharp and assertive. Direct rebuttals, confident, no apologies, no hedging. Punchy lines built to shut down bad-faith claims, but never slurs.",
  mix: "TONE: Balanced — factual backbone with a confident, slightly assertive edge. Persuasive but firm.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, tone } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const toneKey = (tone === "calm" || tone === "sharp" || tone === "mix") ? tone : "mix";
    const systemPrompt = `${BASE_PROMPT}\n\n${TONE_INSTRUCTIONS[toneKey]}`;

    // Detect whether any message has image content -> use a vision-capable model
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