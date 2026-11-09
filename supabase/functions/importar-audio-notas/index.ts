// Atalho áudio notas — importação independente do MacBook.
// Escolha compartilhada (ElevenLabs Scribe v2 ou OpenAI GPT-4o Transcribe) via Supabase.
const MAX_AUDIO = 20 * 1024 * 1024;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
let newKey = "";
try { newKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch (_) {}
const serviceKey = newKey || legacyKey;
const send = (status, value) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const keyHeaders = () => ({
  apikey: serviceKey,
  ...(serviceKey.split(".").length === 3 ? { authorization: "Bearer " + serviceKey } : {}),
});
async function rpc(name, args) {
  if (!SUPABASE_URL || !serviceKey) throw Error("supabase_unconfigured");
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { ...keyHeaders(), "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("rpc_" + name + "_" + response.status);
  return response.json();
}
function mimeFor(file) {
  const name = String(file.name || "").toLowerCase();
  const head = new Uint8Array(16);
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    head.set(bytes.slice(0, 16));
    const isMp4 = String.fromCharCode(...head.slice(4, 8)) === "ftyp";
    const isMp3 = String.fromCharCode(...head.slice(0, 3)) === "ID3" ||
      (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    const isWav = String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...head.slice(8, 12)) === "WAVE";
    const isWebm = head[0] === 0x1a && head[1] === 0x45 &&
      head[2] === 0xdf && head[3] === 0xa3;
    if (isMp4 || (name.endsWith(".m4a") && isMp4))
      return { mime: "audio/mp4", ext: "m4a", buffer };
    if (isMp3) return { mime: "audio/mpeg", ext: "mp3", buffer };
    if (isWav) return { mime: "audio/wav", ext: "wav", buffer };
    if (isWebm) return { mime: "audio/webm", ext: "webm", buffer };
    throw Error("unsupported_audio");
  });
}
async function sha256(buffer) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return [...hash].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A data presente no nome da gravação tem prioridade sobre a criação do arquivo,
// que pode mudar durante cópia/importação. Suporta DN_2026-11-09_04-25-30.m4a.
// Um nome sem data válida recorre a capturado_em (metadado do Atalhos).
function captureFromFileName(name, fallback) {
  const match = String(name || "").match(/(?:^|[^0-9])(\d{4})-(\d{2})-(\d{2})[_T ](\d{2})[-:](\d{2})[-:](\d{2})(?:[^0-9]|$)/);
  if (!match) return null;
  const [,year,month,day,hour,minute,second] = match;
  // Captura por nome não carrega fuso; adota o offset informado pelo iPhone,
  // ou -03:00 (São Paulo), configurado neste projeto.
  const offset = String(fallback || "").match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] || "-03:00";
  const label = year + "-" + month + "-" + day + "T" + hour + ":" + minute + ":" + second;
  const date = new Date(label + offset);
  if (!Number.isFinite(date.getTime())) throw Error("invalid_filename_date");
  const offsetMinutes = offset === "Z" ? 0 : ((offset[0] === "-" ? -1 : 1) *
    (Number(offset.slice(1,3)) * 60 + Number(offset.slice(4,6))));
  const check = new Date(date.getTime() + offsetMinutes * 60000).toISOString().slice(0,19);
  if (check !== label) throw Error("invalid_filename_date");
  return date;
}

async function run(req) {
  if (req.method === "GET") return send(200, { ok: true, project: "atalho-audio-notas", transcription: "elevenlabs_scribe_v2_or_openai_gpt4o_transcribe", status: "online" });
  if (req.method !== "POST") return send(405, { ok: false, error: "method_not_allowed" });
  const token = req.headers.get("x-audio-token") || "";
  if (token.length < 40 || token.length > 250) return send(401, { ok: false, error: "unauthorized" });
  if (!SUPABASE_URL || !serviceKey) return send(503, { ok: false, error: "backend_unconfigured" });
  let owner;
  try {
    owner = await rpc("audio_notas_auth", { p_token_atalho: token });
  } catch (_) {
    return send(503, { ok: false, error: "authentication_service_unavailable" });
  }
  if (typeof owner !== "string" || !/^[0-9a-f-]{36}$/i.test(owner))
    return send(401, { ok: false, error: "unauthorized" });

  // A preferência é a mesma definida em Ajustes no Diário Negro.
  // Supabase RLS no frontend; aqui, acesso exclusivo com owner autenticado pelo token.
  let provider = "elevenlabs";
  try {
    const config = await fetch(SUPABASE_URL +
      "/rest/v1/audio_transcricao_preferencias?owner_id=eq." +
      encodeURIComponent(owner) + "&select=provedor&limit=1", {
      headers: { ...keyHeaders(), accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!config.ok) throw Error("config_http_" + config.status);
    const prefs = await config.json();
    if (!Array.isArray(prefs)) throw Error("invalid_preferences");
    provider = prefs[0]?.provedor || "elevenlabs";
    if (provider !== "elevenlabs" && provider !== "openai")
      throw Error("invalid_provider");
  } catch (_) {
    return send(503, { ok: false, error: "transcription_preference_unavailable" });
  }
  let providerKey = Deno.env.get(provider === "elevenlabs" ? "ELEVENLABS_API_KEY" : "OPENAI_API_KEY") || "";
  if (provider === "elevenlabs" && !providerKey) {
    try { providerKey = await rpc("audio_notas_scribe_key", { p_owner: owner }); } catch (_) {}
  }
  if (providerKey.length < 20)
    return send(503, { ok: false, error: provider + "_secret_not_configured", provedor: provider });

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().startsWith("multipart/form-data"))
    return send(415, { ok: false, error: "multipart_required" });
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_AUDIO * 2 + 20000) return send(413, { ok: false, error: "audio_too_large" });

  let form;
  try { form = await req.formData(); } catch (_) { return send(400, { ok: false, error: "invalid_form" }); }
  const file = form.get("audio") || form.get("file");
  if (!(file instanceof File) || file.size < 1000 || file.size > MAX_AUDIO)
    return send(400, { ok: false, error: "invalid_audio" });
  const fileName = String(form.get("nome") || file.name || "").slice(0, 150);
  if (!fileName.trim()) return send(400, { ok: false, error: "file_name_required" });
  const captured = String(form.get("capturado_em") || "");
  let captureDate;
  let captureSource;
  try {
    const fromName = captureFromFileName(fileName, captured);
    captureDate = fromName || new Date(captured);
    captureSource = fromName ? "nome" : "metadados";
  } catch (_) {
    return send(400, { ok: false, error: "invalid_filename_timestamp" });
  }
  if (!Number.isFinite(captureDate?.valueOf()) ||
      captureDate.valueOf() < Date.parse("2020-01-01") ||
      captureDate.valueOf() > Date.now() + 86400000)
    return send(400, { ok: false, error: "captured_at_required_iso8601" });

  let original;
  try { original = await mimeFor(file); }
  catch (_) { return send(415, { ok: false, error: "unsupported_audio" }); }
  const hash = await sha256(original.buffer);
  // O arquivo original fica intacto; cópia opcional pode ser usada somente na transcrição.
  const clipped = form.get("audio_recortado");
  let toTranscribe = original;
  if (clipped instanceof File && clipped.size >= 1000 && clipped.size <= MAX_AUDIO) {
    try { toTranscribe = await mimeFor(clipped); }
    catch (_) { return send(415, { ok: false, error: "unsupported_trimmed_audio" }); }
  }
  let reservation;
  try {
    reservation = await rpc("audio_notas_reservar", {
      p_owner: owner, p_hash: hash,
      p_capturado_em: captureDate.toISOString(), p_nome: fileName,
      p_mime: original.mime, p_tamanho: original.buffer.byteLength,
    });
  } catch (_) { return send(503, { ok: false, error: "reservation_failed" }); }
  if (!reservation?.ok || !reservation?.id) return send(503, { ok: false, error: "reservation_failed" });
  if (reservation.novo !== true)
    return send(200, { ok: reservation.status === "transcrito" || reservation.status === "sem_fala" || reservation.status === "processando",
      duplicado: true, id: reservation.id, status: reservation.status,
      capturado_em: captureDate.toISOString(), origem_data: captureSource,
      registro_id: reservation.registro_id || null });

  const id = reservation.id;
  const claim = reservation.claim_id;
  const storagePath = owner + "/" + id + "/original." + original.ext;
  const safeError = async (step, storage = null) => {
    try { await rpc("audio_notas_erro", { p_owner: owner, p_id: id, p_claim_id: claim, p_caminho: storage, p_codigo: step }); }
    catch (_) {}
  };
  try {
    const up = await fetch(
      SUPABASE_URL + "/storage/v1/object/audio-notas/" + storagePath, {
        method: "POST",
        headers: { ...keyHeaders(), "content-type": original.mime, "x-upsert": "false" },
        body: new Uint8Array(original.buffer),
        signal: AbortSignal.timeout(40000),
      });
    if (!up.ok) {
      await safeError("storage");
      return send(502, { ok: false, id, status: "erro_storage", error: "audio_not_stored" });
    }
  } catch (_) {
    await safeError("storage");
    return send(502, { ok: false, id, status: "erro_storage", error: "audio_not_stored" });
  }
  // O provedor é escolhido no início de cada importação; sem fallback automático.
  const upload = new FormData();
  upload.set("file", new File([toTranscribe.buffer], "audio." + toTranscribe.ext, { type: toTranscribe.mime }));
  let endpoint, providerHeaders, model;
  if (provider === "elevenlabs") {
    endpoint = "https://api.elevenlabs.io/v1/speech-to-text";
    providerHeaders = { "xi-api-key": providerKey };
    model = "scribe_v2";
    upload.set("model_id", model);
    upload.set("language_code", "por");
    upload.set("diarize", "false");
    upload.set("tag_audio_events", "false");
  } else {
    endpoint = "https://api.openai.com/v1/audio/transcriptions";
    providerHeaders = { "Authorization": "Bearer " + providerKey };
    model = "gpt-4o-transcribe";
    upload.set("model", model);
    upload.set("language", "pt");
  }
  let transcript;
  try {
    const stt = await fetch(endpoint, {
      method: "POST", headers: providerHeaders, body: upload,
      signal: AbortSignal.timeout(120000),
    });
    if (!stt.ok) throw Error("stt_http_" + stt.status);
    const data = await stt.json();
    if (typeof data?.text !== "string" || data.text.length > 30000)
      throw Error("stt_invalid_result");
    transcript = data.text.trim();
  } catch (_) {
    await safeError("stt", storagePath);
    return send(502, { ok: false, id, status: "erro_stt",
      error: "transcription_failed", provedor: provider,
      audio_preservado: true, nova_tentativa_automatica: false });
  }
  try {
    const saved = await rpc("audio_notas_finalizar", {
      p_owner: owner, p_id: id, p_claim_id: claim, p_caminho: storagePath, p_texto: transcript,
    });
    if (!saved?.ok) throw Error("finalize_unconfirmed");
    return send(200, { ok: true, id, status: saved.status,
      registro_id: saved.registro_id || null, transcricao: transcript,
      audio_preservado: true, provedor: provider, modelo: model,
      capturado_em: captureDate.toISOString(), origem_data: captureSource });
  } catch (_) {
    await safeError("banco", storagePath);
    return send(502, { ok: false, id, status: "erro_banco", error: "transcript_not_confirmed",
      audio_preservado: true, nova_tentativa_automatica: false });
  }
}
Deno.serve((request) => run(request).catch(() => send(500, { ok: false, error: "internal_error" })));
