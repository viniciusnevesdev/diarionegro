import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    const body = await req.json();
    const base64 = String(body?.audio_base64 || "");
    if (!base64) throw new Error("Áudio vazio.");
    const mime = String(body?.mime || "audio/mp4");
    const ext = mime.includes("webm") ? "webm" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "m4a";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new File([bytes], `audio.${ext}`, { type: mime }));
    form.append("model", Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-transcribe");
    form.append("language", "pt");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: form
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "Falha na transcrição.");
    return new Response(JSON.stringify({ text: String(payload?.text || "") }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
