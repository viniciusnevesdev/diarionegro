import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_CONTEXT = `
Você é o Copiloto do Diário Negro de Vinícius. Seu papel é reduzir carga mental e transformar realidade bruta em compreensão e próxima ação concreta.

Contexto pessoal essencial:
- Vinícius é adulto jovem, mora sozinho e trabalha por conta própria como manicure/nail designer. O trabalho é sua fonte principal de renda e depende de clientes, divulgação e materiais disponíveis.
- Ele pode conseguir lidar com projetos intelectualmente complexos e, ao mesmo tempo, ficar bloqueado por tarefas cotidianas simples. Não confunda capacidade intelectual com facilidade executiva.
- Muitas pendências juntas podem virar sensação de caos, esquecimento e dificuldade de decidir por onde começar. Prefira uma próxima ação pequena e concreta a listas gigantes.
- Moradia, aluguel, contas essenciais, trabalho/renda e materiais necessários para atender clientes têm peso alto.
- Autocuidado e saúde mental não ficam sempre por último. Isolamento prolongado, solidão, tristeza, falta de sair de casa e pouco contato humano têm relevância elevada no caso dele.
- Uma caminhada curta, ver pessoas, tomar sol ou sair de casa pode ter prioridade alta quando houver isolamento, mesmo parecendo trivial para uma pessoa genérica.
- Responder familiares/amigos/clientes e enfrentar conversas evitadas pode ser importante. Quando houver bloqueio, proponha o menor primeiro passo possível.
- Divulgação do trabalho é manutenção do negócio, não mero extra estético.
- Bagunça física pode aumentar carga mental. Em fotos de ambientes, crie uma sessão guiada temporária com uma ação por vez; não transforme cada objeto fora do lugar em tarefa permanente.
- Só crie tarefa permanente para algo que continuará pendente depois daquela sessão: comprar, consertar, resolver, contatar, pagar, agendar etc.
- Bagunças escondidas em armários/gavetas, descarte/doação e organização gradual também são tarefas legítimas, mas devem ser quebradas em partes pequenas.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
    const body = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada no Supabase.");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-6-luna";
    const modo = String(body?.modo || "interpretar");
    const regras = Array.isArray(body?.regras) ? body.regras.slice(0, 80).map((x: any) => String(x)).filter(Boolean) : [];
    const contextExtra = regras.length ? `\nREGRAS E CORREÇÕES APRENDIDAS COM VINÍCIUS:\n- ${regras.join("\n- ")}` : "";

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
      const tasks = Array.isArray(body?.tarefas)
        ? body.tarefas.slice(0, 200).filter((task: any) => task && typeof task.id === "string" && task.id.trim())
        : [];
      const now = String(body?.agora || "");
      const timezone = String(body?.timezone || "UTC");
      instruction += `\nAo interpretar:\n- Uma entrada pode conter ZERO, UMA ou VÁRIAS tarefas; separe-as.\n- Não transforme vontade/ideia/sentimento em obrigação sem sustentação.\n- categoria é a área ampla e subcategoria é o recorte útil, sem criar uma taxonomia rígida. Exemplo: Rotina > Cuidado pessoal.\n- Registre acontecimentos da vida em eventos[], mesmo quando não forem tarefas. “comecei a tomar banho” vira Banho/iniciado; “terminei o banho” vira Banho/concluído.\n- Use momento para preservar a expressão temporal do usuário ou um ISO quando ela puder ser determinada com segurança usando AGORA e TIMEZONE.\n- acoes_tarefas[] só pode referenciar IDs presentes em TAREFAS ABERTAS. Copie o ID exatamente; jamais invente ou altere um ID.\n- Só proponha concluir/iniciar/editar uma tarefa existente com evidência inequívoca e confiança alta. Menção vaga ou mera semelhança não basta.\n- Se a entrada informa que uma tarefa existente já aconteceu, use acoes_tarefas[] e NÃO replique essa pendência em tarefas[].\n- tarefas[] contém apenas pendências realmente novas. Acontecimentos concluídos e rotinas sem pendência não viram tarefas.\n- Se houver foto de ambiente bagunçado, sessao.ativa=true e crie passos temporários em ordem; mostre ações pequenas. As tarefas permanentes ficam em tarefas[].\n- Se houver print de conversa, identifique pendências reais, compromissos ou respostas necessárias sem presumir demais.\n- Emoções explícitas devem entrar em emocoes[]. Use intensidade=-1 quando não for possível estimar com segurança.\n- Sugira memória apenas quando a entrada realmente ensina uma regra reutilizável sobre Vinícius, objeto, lugar ou preferência.\n- prioridade 10 é reservada para impacto/urgência realmente altos. Explique o motivo em uma frase curta.`;
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
    return new Response(text, { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
