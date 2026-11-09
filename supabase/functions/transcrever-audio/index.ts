import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Diário Negro / Copiloto: mantém contrato {audio_base64,mime} -> {text}.
// Preferência do usuário em public.audio_transcricao_preferencias (padrão ElevenLabs).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const HEADERS = { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const LIMIT = 15 * 1024 * 1024;
const reply = (status:number, json:unknown) => new Response(JSON.stringify(json), { status, headers: HEADERS });

function typeFor(mime:unknown):[string,string] | null {
  const type=String(mime||"audio/mp4").split(";")[0].trim().toLowerCase();
  if(["audio/mp4","audio/m4a","audio/x-m4a","video/mp4"].includes(type)) return ["m4a","audio/mp4"];
  if(["audio/webm","video/webm"].includes(type)) return ["webm","audio/webm"];
  if(["audio/wav","audio/x-wav","audio/wave"].includes(type)) return ["wav","audio/wav"];
  if(["audio/mpeg","audio/mp3"].includes(type)) return ["mp3","audio/mpeg"];
  if(type==="audio/ogg") return ["ogg","audio/ogg"];
  return null;
}

async function selectedProvider(req:Request):Promise<"elevenlabs"|"openai"> {
  const host=Deno.env.get("SUPABASE_URL");
  let key="";
  try { key=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""; } catch (_){}
  key=key||Deno.env.get("SUPABASE_ANON_KEY")||"";
  const authorization=req.headers.get("authorization");
  if(!host||!key||!authorization?.startsWith("Bearer ")) throw Error("config_unavailable");
  // Respeita RLS: somente a linha do usuário autenticado na requisição.
  const response=await fetch(host+"/rest/v1/audio_transcricao_preferencias?select=provedor&limit=1",{
    headers:{apikey:key,authorization,accept:"application/json"},
    signal:AbortSignal.timeout(10000),
  });
  if(!response.ok) throw Error("preference_http_"+response.status);
  const result=await response.json();
  if(!Array.isArray(result)) throw Error("preference_invalid");
  const provider=result[0]?.provedor??"elevenlabs";
  if(provider!=="elevenlabs" && provider!=="openai") throw Error("provider_invalid");
  return provider;
}

Deno.serve(async (req:Request) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  if(req.method!=="POST") return reply(405,{error:"Método não permitido."});
  let provider:"elevenlabs"|"openai";
  try { provider=await selectedProvider(req); }
  catch (_) { return reply(503,{error:"Não foi possível consultar a preferência de transcrição no Supabase."}); }
  const apiKey=Deno.env.get(provider==="elevenlabs"?"ELEVENLABS_API_KEY":"OPENAI_API_KEY");
  if(!apiKey) return reply(503,{error:provider==="elevenlabs"?"Chave ElevenLabs não configurada.":"Chave OpenAI não configurada."});

  let body:any;
  try { body=await req.json(); } catch (_) { return reply(400,{error:"Requisição inválida."}); }
  const type=typeFor(body?.mime),base64=body?.audio_base64;
  if(!type) return reply(415,{error:"Formato de áudio não suportado."});
  if(typeof base64!=="string"||!base64||base64.length>Math.ceil(LIMIT*4/3)+16)
    return reply(413,{error:"Áudio vazio ou maior que 15 MB."});
  let bytes:Uint8Array;
  try {
    const raw=atob(base64);
    if(raw.length<16||raw.length>LIMIT) throw Error("size");
    bytes=Uint8Array.from(raw,(letter)=>letter.charCodeAt(0));
  } catch (_) { return reply(400,{error:"Áudio inválido."}); }

  const [ext,mime]=type;
  const form=new FormData();
  form.set("file",new File([bytes],"gravacao."+ext,{type:mime}));
  let endpoint:string,headers:Record<string,string>;
  if(provider==="elevenlabs"){
    endpoint="https://api.elevenlabs.io/v1/speech-to-text";
    headers={"xi-api-key":apiKey};
    form.set("model_id","scribe_v2");
    form.set("language_code","por");
    form.set("diarize","false");
    form.set("tag_audio_events","false");
  } else {
    endpoint="https://api.openai.com/v1/audio/transcriptions";
    headers={"Authorization":"Bearer "+apiKey};
    form.set("model","gpt-4o-transcribe");
    form.set("language","pt");
  }
  try {
    const response=await fetch(endpoint,{
      method:"POST",headers,body:form,signal:AbortSignal.timeout(120000),
    });
    if(!response.ok)return reply(502,{error:"Falha na transcrição pelo provedor escolhido ("+response.status+")."});
    const data=await response.json();
    if(typeof data?.text!=="string")return reply(502,{error:"A transcrição recebida não é válida."});
    return reply(200,{text:data.text});
  } catch (_) { return reply(502,{error:"Não foi possível concluir a transcrição."}); }
});
