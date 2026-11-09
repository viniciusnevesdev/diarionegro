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
