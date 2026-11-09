# Atalho Áudio Notas — integração com Diário Negro

## Seletor de transcrição (09/11/2026)
O Diário Negro exibe **Ajustes → Copiloto → Transcrição de áudio**, com dois botões:
- **ElevenLabs** → Scribe v2 (padrão)
- **OpenAI** → GPT-4o Transcribe

A preferência é salva em `public.audio_transcricao_preferencias`, com RLS por usuário, e vale para as próximas transcrições do **Copiloto** (`transcrever-audio`) e **Atalho Áudio Notas** (`importar-audio-notas`). Não reprocessa notas já importadas.
Cada requisição consulta o Supabase. Sem opção salva, a escolha é ElevenLabs. Se a consulta falhar, a transcrição é recusada; **não há fallback silencioso para outro provedor**.

## Segurança e estado
- ElevenLabs usa o secret `ELEVENLABS_API_KEY`; OpenAI usa `OPENAI_API_KEY`. Secrets exclusivamente no Supabase.
- O Atalho usa token próprio no header `x-audio-token`, validado antes do upload; nunca coloque as chaves dos provedores no iPhone.
- O bucket `audio-notas` continua privado. Áudio original é armazenado; transcrição e data real vão ao banco do Diário Negro.
- Processamento é idempotente: reenvio do mesmo áudio e data não gera nova transcrição automática.
- Ainda é necessário conferir as chaves dos provedores em Edge Functions → Secrets e testar um áudio real. Os testes automatizados foram mocks, **sem custo de API**.
- Recorte de silêncio na cópia e automação de envio em lote pelo iOS ainda são pendências independentes.
- A escolha de provedor não altera o motor de interpretação do Copiloto, que é separado da transcrição.

## Data original no nome (09/11/2026)
- Padrão documentado no desenho do atalho de gravação: `DN_yyyy-MM-dd_HH-mm-ss.m4a`, ex.: `DN_2026-11-09_04-25-30.m4a`.
- A função `importar-audio-notas` v4 extrai a data/hora do nome (quando reconhecível) e salva como `capturado_em`, preservando o horário efetivo de gravação em vez do horário de transcrição.
- Quando o nome não contém a data, utiliza `capturado_em` enviado pelo Atalhos (metadado de criação).
- Se houver offset na data enviada pelo iPhone, é usado para converter o horário do nome; caso contrário, o padrão é `-03:00` (São Paulo).
- Resposta de importação bem-sucedida indica `origem_data: nome` ou `metadados`.
- A função **não muda nomes de arquivos no iPhone**. O formulário do atalho pode enviar o nome explicitamente em `nome`; se ausente, a função lê `file.name` do multipart.
- A ação Repetir com Cada Item no Atalhos processa sequencialmente. Falta validar upload real no iOS e configurar a automação pessoal por hora do dia. Execuções suspensas pelo iOS ou interrompidas pela rede exigem revisão e retomada; não presumir execução garantida em background.
