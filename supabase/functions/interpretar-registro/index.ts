import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    resumo: { type: "string" },
    categoria: { type: "string" },
    subcategoria: { type: "string" },
    tipo: {
      type: "string",
      enum: [
        "anotacao",
        "atividade_inicio",
        "atividade_fim",
        "encontro_pessoa",
        "tarefa",
        "outro"
      ]
    },
    pessoas: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } }
  },
  required: ["resumo", "categoria", "subcategoria", "tipo", "pessoas", "tags"]
};

function getOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método não permitido" }),
        { status: 405, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const text = String(body?.texto ?? "").trim();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Texto vazio" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada no Supabase.");

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-6-luna";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "none" },
        input: [
          {
            role: "developer",
            content: [{
              type: "input_text",
              text:
                "Você interpreta registros do Diário Negro, uma caixa-preta pessoal. " +
                "Extraia somente informações sustentadas pelo texto. Não invente fatos, " +
                "nomes, lugares ou intenções. Use categorias curtas e úteis. " +
                "Use atividade_inicio quando a pessoa diz que vai começar/fazer algo e " +
                "atividade_fim quando diz que terminou/finalizou. " +
                "Se nenhuma pessoa estiver explicitamente mencionada, pessoas deve ser uma lista vazia. " +
                "Responda em português do Brasil."
            }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "interpretacao_diario_negro",
            strict: true,
            schema
          }
        }
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Falha ao consultar a OpenAI.");
    }

    const output = getOutputText(payload);
    if (!output) throw new Error("A OpenAI não retornou conteúdo.");

    const parsed = JSON.parse(output);

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || String(error) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
