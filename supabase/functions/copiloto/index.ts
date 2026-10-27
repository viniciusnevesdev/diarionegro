import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_CONTEXT = `
Você é o Copiloto do Diário Negro de Vinícius. Seu papel é reduzir carga mental e transformar realidade bruta em compreensão e próxima ação concreta.

- Só crie tarefa permanente para algo que continuará pendente depois daquela sessão: comprar, consertar, resolver, contatar, pagar, agendar etc.
- Nem tudo que ele menciona é tarefa. Diferencie tarefa, compromisso, vontade, ideia, registro e sentimento.
- Emoções explícitas são dados importantes. Registre tristeza, solidão, alívio, orgulho, tranquilidade etc. sem diagnosticar e sem transformar emoção em tarefa.
- Relações observadas entre emoções e acontecimentos são associações, não causalidade. Use linguagem como “parece estar associado” quando apropriado.
- Tarefas antigas podem estar bloqueadas, não necessariamente desimportantes.
- Tarefas básicas de manutenção da vida (suprimentos, familiares, descarte, armários/gavetas, higiene, alimentação, burocracia) não são secundárias só por serem comuns.
- Se algo está pendente há semanas ou meses, não reduza prioridade automaticamente: pode haver bloqueio persistente.
- Prioridade é de 0 a 10 e deve ser PERSONALIZADA para Vinícius. Considere urgência, prazo, risco, dinheiro, moradia, trabalho, saúde/bem-estar, relações, tempo pendente, bloqueio e poder de destravar outras áreas.
- Prioridade não é igual a “fazer agora”. Considere energia, duração, contexto e dependências.
- Nunca invente fatos, prazos, pessoas, locais ou emoções que não estejam sustentados pela entrada/contexto.
- Responda em português do Brasil, de forma direta e prática.
`;

const taskSchema = {
  type: "object", additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    prioridade: { type: "integer", minimum: 0, maximum: 10 },
    motivo_prioridade: { type: "string" },
    area: { type: "string" },
    prazo: { type: "string" },
    energia: { type: "string", enum: ["baixa", "media", "alta"] },
    duracao_min: { type: "integer", minimum: 0, maximum: 600 },
    confianca: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["titulo","prioridade","motivo_prioridade","area","prazo","energia","duracao_min","confianca"]
};

const emotionSchema = {
  type: "object", additionalProperties: false,
  properties: {
    nome: { type: "string" },
    intensidade: { type: "integer", minimum: -1, maximum: 10 },
    valencia: { type: "string", enum: ["negativa", "neutra", "positiva", "mista"] },
    contexto: { type: "string" },
    relevancia: { type: "integer", minimum: 0, maximum: 10 },
    confianca: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["nome","intensidade","valencia","contexto","relevancia","confianca"]
};

const eventSchema = {
  type: "object", additionalProperties: false,
  properties: {
    tipo: { type: "string", enum: ["atividade","saude","medicamento","compra","social","trabalho","deslocamento","compromisso","outro"] },
    nome: { type: "string" },
    estado: { type: "string", enum: ["ocorreu","iniciado","concluído","tomado","comprado","agendado","cancelado"] },
    categoria: { type: "string" },
    subcategoria: { type: "string" },
    momento: { type: "string" },
    detalhes: { type: "string" },
    confianca: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["tipo","nome","estado","categoria","subcategoria","momento","detalhes","confianca"]
};

const taskActionSchema = {
  type: "object", additionalProperties: false,
  properties: {
    acao: { type: "string", enum: ["iniciar","concluir","editar"] },
    task_id: { type: "string" },
    titulo_referencia: { type: "string" },
    novo_titulo: { type: "string" },
    evidencia: { type: "string" },
    confianca: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["acao","task_id","titulo_referencia","novo_titulo","evidencia","confianca"]
};

const interpretSchema = {
  type: "object", additionalProperties: false,
  properties: {
    resumo: { type: "string" },
    intencao: { type: "string", enum: ["registro","tarefas","sessao_guiada","emocao","misto"] },
    categoria: { type: "string" },
    subcategoria: { type: "string" },
    pessoas: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    eventos: { type: "array", items: eventSchema },
    acoes_tarefas: { type: "array", items: taskActionSchema },
    tarefas: { type: "array", items: taskSchema },
    emocoes: { type: "array", items: emotionSchema },
    sessao: {
      type: "object", additionalProperties: false,
      properties: {
        ativa: { type: "boolean" },
        titulo: { type: "string" },
        ambiente: { type: "string" },
        passos: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            properties: {
              instrucao: { type: "string" },
              motivo: { type: "string" },
              duracao_min: { type: "integer", minimum: 0, maximum: 120 }
            },
            required: ["instrucao","motivo","duracao_min"]
          }
        }
      },
      required: ["ativa","titulo","ambiente","passos"]
    },
    memorias_sugeridas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          texto: { type: "string" },
          tipo: { type: "string", enum: ["regra","preferencia","local_objeto","contexto_pessoal"] },
          confianca: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["texto","tipo","confianca"]
      }
    }
  },
  required: ["resumo","intencao","categoria","subcategoria","pessoas","tags","eventos","acoes_tarefas","tarefas","emocoes","sessao","memorias_sugeridas"]
};

const decideSchema = {
  type: "object", additionalProperties: false,
  properties: {
    task_id: { type: "string" },
    titulo: { type: "string" },
    prioridade: { type: "integer", minimum: 0, maximum: 10 },
    motivo: { type: "string" },
    primeiro_passo: { type: "string" },
    tipo: { type: "string", enum: ["tarefa","autocuidado","social","sessao","nenhuma"] }
  },
  required: ["task_id","titulo","prioridade","motivo","primeiro_passo","tipo"]
};

function outputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of payload?.output ?? []) for (const content of item?.content ?? []) {
    if (content?.type === "output_text" && typeof content?.text === "string") return content.text;
  }
  return "";
}

async function authorizedContext(req: Request, mode: string) {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("authorization");
  if (!url || !key || !authorization) throw new Error("Contexto autorizado indisponível.");
  const response = await fetch(`${url}/rest/v1/rpc/dn_contexto_copiloto`, {
    method: "POST", headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({p_interaction_id: crypto.randomUUID(), p_mode: mode})
  });
  if (!response.ok) throw new Error("Não foi possível verificar o contexto autorizado.");
  const context = await response.json();
  if (!Array.isArray(context?.memorias) || !Array.isArray(context?.associacoes)) throw new Error("Contexto autorizado inválido.");
  return context;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
    const body = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada no Supabase.");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-6-luna";
    const modo = String(body?.modo || "interpretar");
    if (modo !== "interpretar" && modo !== "decidir_agora" && modo !== "reanalisar_historico") throw new Error("Modo inválido.");
    if (modo === "reanalisar_historico" && Deno.env.get("DN_HISTORICAL_REANALYSIS_ENABLED") === "false") throw new Error("Reanálise histórica temporariamente indisponível.");
    // Nunca confiar em regras fornecidas pelo cliente. Reanálise histórica pode
    // explicitamente dispensar todo contexto pessoal, sem caminho alternativo.
    const context = modo === "reanalisar_historico" || Deno.env.get("DN_MEMORY_CONTEXT_ENABLED") === "false" ? {memorias: [], associacoes: []} : await authorizedContext(req, modo);
    const corrections = context.memorias.filter((m: any) => m.origem === "correcao_explicitamente_lembrada");
    const memories = context.memorias.filter((m: any) => m.origem !== "correcao_explicitamente_lembrada");
    const contextExtra = `\nCONTEXTO AUTORIZADO. Correções explícitas prevalecem sempre sobre inferências; associações são hipóteses, não causas ou regras.\nCORREÇÕES EXPLÍCITAS: ${JSON.stringify(corrections.map((m: any) => m.texto))}\nMEMÓRIAS CONFIRMADAS: ${JSON.stringify(memories.map((m: any) => m.texto))}\nASSOCIAÇÕES CONFIRMADAS E AUTORIZADAS: ${JSON.stringify(context.associacoes.map((a: any) => ({sujeito:a.sujeito,relacao:a.relacao,objeto:a.objeto})))}`;

    let schema: any = interpretSchema;
    let userText = String(body?.texto || "").trim();
    let instruction = BASE_CONTEXT + contextExtra;

    if (modo === "decidir_agora") {
      schema = decideSchema;
      const tasks = Array.isArray(body?.tarefas) ? body.tarefas : [];
      const emotions = Array.isArray(body?.emocoes) ? body.emocoes : [];
      instruction += `\nEscolha UMA única próxima ação plausível agora. Não escolha mecanicamente a maior nota: considere impacto, bloqueios e emoções recentes. Se uma tarefa grande for escolhida, primeiro_passo deve ser uma microação concreta. Se não houver tarefa adequada, uma ação de autocuidado/social só pode ser sugerida se o contexto a sustentar. Use task_id exatamente como recebido quando escolher uma tarefa existente.`;
      userText = `AGORA: ${String(body?.agora || "")}\n\nTAREFAS ATUAIS:\n${JSON.stringify(tasks)}\n\nEMOÇÕES/ESTADOS RECENTES (com horário):\n${JSON.stringify(emotions)}\n\nEscolha o que fazer agora.`;
    } else {
      const tasks = modo !== "reanalisar_historico" && Array.isArray(body?.tarefas)
        ? body.tarefas.slice(0, 200).filter((task: any) => task && typeof task.id === "string" && task.id.trim())
        : [];
      const now = String(body?.agora || "");
      const timezone = String(body?.timezone || "UTC");
      instruction += `\nAo interpretar:\n- Uma entrada pode conter ZERO, UMA ou VÁRIAS tarefas; separe-as.\n- Não transforme vontade/ideia/sentimento em obrigação sem sustentação.\n- categoria é a área ampla e subcategoria é o recorte útil, sem criar uma taxonomia rígida. Exemplo: Rotina > Cuidado pessoal.\n- Registre acontecimentos da vida em eventos[], mesmo quando não forem tarefas. “comecei a tomar banho” vira Banho/iniciado; “terminei o banho” vira Banho/concluído.\n- Use momento para preservar a expressão temporal do usuário ou um ISO quando ela puder ser determinada com segurança usando AGORA e TIMEZONE.\n- acoes_tarefas[] só pode referenciar IDs presentes em TAREFAS ABERTAS. Copie o ID exatamente; jamais invente ou altere um ID.\n- Só proponha concluir/iniciar/editar uma tarefa existente com evidência inequívoca e confiança alta. Menção vaga ou mera semelhança não basta.\n- Se a entrada informa que uma tarefa existente já aconteceu, use acoes_tarefas[] e NÃO replique essa pendência em tarefas[].\n- tarefas[] contém apenas pendências realmente novas. Acontecimentos concluídos e rotinas sem pendência não viram tarefas.\n- Se houver foto de ambiente bagunçado, sessao.ativa=true e crie passos temporários em ordem; mostre ações pequenas. As tarefas permanentes ficam em tarefas[].\n- Se houver print de conversa, identifique pendências reais, compromissos ou respostas necessárias sem presumir demais.\n- Emoções explícitas devem entrar em emocoes[]. Use intensidade=-1 quando não for possível estimar com segurança.\n- Sugira memória apenas quando a entrada realmente ensina uma regra reutilizável sobre Vinícius, objeto, lugar ou preferência. Não sugira acontecimentos triviais isolados nem estados momentâneos.\n- memorias_sugeridas[] representa candidatos: o cliente deve guardá-los como inferências não confirmadas e eles não podem valer como verdade até confirmação explícita do usuário.\n- prioridade 10 é reservada para impacto/urgência realmente altos. Explique o motivo em uma frase curta.`;
      if (modo === "reanalisar_historico") instruction += "\nReanalise somente o registro histórico, sem criar, concluir, editar ou reabrir tarefas atuais; não use contexto pessoal anterior.";
      if (!userText) userText = "Analise esta entrada visual e transforme-a em contexto, tarefas permanentes, emoções e/ou sessão guiada conforme apropriado.";
      userText = `ENTRADA DO USUÁRIO:\n${userText}\n\nAGORA: ${now}\nTIMEZONE: ${timezone}\n\nTAREFAS ABERTAS (única fonte válida de task_id):\n${JSON.stringify(tasks)}`;
    }

    const content: any[] = [{ type: "input_text", text: userText }];
    const image = String(body?.imagem_data_url || "");
    if (image.startsWith("data:image/")) content.push({ type: "input_image", image_url: image, detail: "auto" });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "none" },
        input: [
          { role: "developer", content: [{ type: "input_text", text: instruction }] },
          { role: "user", content }
        ],
        text: { format: { type: "json_schema", name: modo === "decidir_agora" ? "proxima_acao" : "interpretacao_copiloto", strict: true, schema } }
      })
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "Falha ao consultar a OpenAI.");
    const text = outputText(payload);
    if (!text) throw new Error("A OpenAI não retornou conteúdo.");
    const result = JSON.parse(text);
    result.__usedMemories = context.memorias;
    return new Response(JSON.stringify(result), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
