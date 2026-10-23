# Ativar o Copiloto v0.8

A interface funciona após instalar o patch, mas as funções de IA exigem publicar duas Supabase Edge Functions:

- `copiloto`
- `transcrever-audio`

A chave OpenAI continua somente no Supabase. Não coloque `OPENAI_API_KEY` em HTML, JavaScript do PWA ou `config.js`.

Secrets:

- `OPENAI_API_KEY` — obrigatório
- `OPENAI_MODEL=gpt-6-luna` — opcional
- `OPENAI_TRANSCRIBE_MODEL=gpt-transcribe` — opcional

Depois da publicação, testes mínimos:

1. Texto: “preciso comprar luvas para trabalhar e queria pintar o cabelo”. Deve separar tarefas e dar prioridades diferentes.
2. Emoção: “estou triste e me sentindo sozinho hoje”. Deve registrar emoção e não criar tarefa automaticamente só por causa do sentimento.
3. Foto: enviar cozinha/quarto bagunçado. Deve criar sessão guiada com uma etapa por vez.
4. Correção: alterar prioridade e marcar “Lembrar para situações parecidas”. A correção deve entrar no contexto futuro.
5. Voz: gravar uma frase e confirmar transcrição + interpretação.

6. Check-in: conclua uma tarefa 7/10+ ou sessão guiada; deve oferecer check-in simples. 'Ignorar' não deve gerar emoção.
