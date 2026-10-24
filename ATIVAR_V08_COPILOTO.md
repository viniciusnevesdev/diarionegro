# Ativar o Copiloto v0.8

A interface funciona após instalar o patch, mas a v0.8.1 exige aplicar primeiro a migration local:

- `supabase/migrations/20261024140000_create_interpretacoes.sql`

Ela cria `public.interpretacoes`, habilita RLS e libera apenas `select`, `insert` e `update` das linhas do próprio usuário autenticado. Não exponha a tabela antes de aplicar essa proteção.

Depois da migration, publique as duas Supabase Edge Functions:

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

7. Persistência: interprete um registro na linha do tempo, recarregue a página e confirme que aparece “Ver interpretação” sem uma nova chamada à IA.
8. Tarefa existente: com “Pegar receitas no médico” aberta, registre “Hoje à tarde, depois de pegar as receitas com o médico, eu fiz a aplicação de testosterona.” Confirme a conclusão da tarefa pelo ID existente, o evento de aplicação e a ausência de tarefa duplicada.
9. Evento: registre “comecei a tomar banho” e confirme `Rotina > Cuidado pessoal`, evento `Banho` e estado `iniciado`, sem tarefa nova.
