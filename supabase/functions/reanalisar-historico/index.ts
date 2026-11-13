import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const VERSION="0.8.3-reanalysis-v2";

import { schema, outputText } from "../_shared/extracao.ts";

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  try{
    if(req.method!=="POST")return new Response(JSON.stringify({error:"Método não permitido"}),{status:405,headers:{...CORS,"Content-Type":"application/json"}});
    if(Deno.env.get("DN_HISTORICAL_REANALYSIS_ENABLED")==="false") throw new Error("Reanálise histórica temporariamente indisponível.");
    const body=await req.json(),apiKey=Deno.env.get("OPENAI_API_KEY"); if(!apiKey)throw new Error("OPENAI_API_KEY não configurada no Supabase.");
    const model=Deno.env.get("OPENAI_MODEL")||"gpt-6-luna",texto=String(body?.texto||"").trim(); if(!texto)throw new Error("Registro histórico vazio.");
    const instruction=`Você reanalisa um registro histórico do Diário Negro. Regras obrigatórias:\n- Analise somente o registro fornecido; não crie, conclua, edite nem reabra tarefas atuais.\n- Não use conhecimento externo ou contexto pessoal prévio como evidência para criar memórias.\n- Declaração clara e reutilizável do próprio registro pode ser classificacao=declaracao_clara.\n- Dedução, associação ou padrão deve ser classificacao=inferencia e nunca fato observado.\n- Separe hipóteses em associacoes[] independentes: sujeito, relacao, objeto, evidencia literal curta, justificativa e confianca. Uma anotação pode ter várias associações.\n- Use linguagem de associação não causal para mera coexistência; não infira que uma coisa causa outra.\n- eventos[] e emocoes[] descrevem observações; não transforme hipóteses em fatos.\n- Se não houver hipótese sustentada, retorne associacoes=[].\n- Emoções e acontecimentos momentâneos não viram memória permanente só por existirem.\n- Prefira memorias=[] quando não houver conhecimento reutilizável seguro.\n- evidencia deve ser um trecho curto do próprio registro.\n- Não invente pessoas, relações, locais, preferências, causas, diagnósticos ou fatos ausentes.\n- A data é contexto histórico; não presuma que a informação continua verdadeira hoje.\n- eventos[] e emocoes[] descrevem o passado e não geram ações atuais.`;
    const user=`REGISTRO HISTÓRICO:\n${texto}\n\nREGISTRADO_EM: ${String(body?.registrado_em||"")}\nTIMEZONE: ${String(body?.timezone||"UTC")}\nTIPO_DE_ENTRADA: ${String(body?.entrada||"texto")}\nVERSAO: ${VERSION}`;
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,reasoning:{effort:"none"},input:[{role:"developer",content:[{type:"input_text",text:instruction}]},{role:"user",content:[{type:"input_text",text:user}]}],text:{format:{type:"json_schema",name:"reanalisacao_historica",strict:true,schema}}})});
    const payload=await response.json(); if(!response.ok)throw new Error(payload?.error?.message||"Falha ao consultar a OpenAI."); const text=outputText(payload); if(!text)throw new Error("A OpenAI não retornou conteúdo."); const parsed=JSON.parse(text);
    return new Response(JSON.stringify({...parsed,_meta:{model,context_version:VERSION}}),{headers:{...CORS,"Content-Type":"application/json"}});
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error ? error.message : String(error)}),{status:500,headers:{...CORS,"Content-Type":"application/json"}});}
});
