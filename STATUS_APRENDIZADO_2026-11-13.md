# Diário Negro — Checkpoint de publicação segura
Data: 2026-11-13

## Objetivo
Aprendizado contínuo ao salvar anotações (texto, ditado, áudio), com evidências, deduplicação, associações independentes e autonomia controlada.

## Estado confirmado
- Supabase: **aprendizado desativado**. `DN_CONTINUOUS_LEARNING_ENABLED=false` definido no servidor.
- `public.registros`: trigger `aprendizado_registro` desabilitado (`D`).
- `cron.job`: nenhum agendamento ativo do aprendizado.
- Vault: 0/3 segredos do agendador presentes.
- Fila de aprendizado: 0 registros; memórias: 9; registros pessoais: 193.
- Modelo: fallback local do worker agora `gpt-5.4-nano`, com saída estruturada.
- Cota: migration `20261113073842_limitar_cota_aprendizado` aplicada; **8 tentativas de API por dia**, globais, contadas antes da chamada. Nenhuma chamada foi feita pelo worker real.
- Privacidade: migration `20261113071758_redigir_fila_aprendizado` aplicada, limpa texto/resultado duplicados quando o job conclui.
- Backend: `aprender-registro` republicado com guardas de ativação, orçamento e exigência reforçada de evidência literal.
- O frontend atualizado ainda **não foi publicado** no GitHub Pages.
- A função temporária `dn-learning-smoke` foi removida após teste.

## Validação
- 35 grupos integrados locais aprovados, incluindo RLS, fila, cota e rollback.
- 8 verificações de release aprovadas.
- Suíte local do aprendizado aprovada após modificações.
- Backup atualizado de banco: `~/.local/share/diarionegro/backups/diarionegro-pre-cota-20261113-044550.dump`, com checksum SHA-256.
- Backup Storage: `~/.local/share/diarionegro/backups/storage-20261113-030005/`, 11/11 áudios.
- Restauração isolada anterior comprovou 193 registros e 9 memórias (Vault omitido).

## Teste real de modelo — impedimento
Uma chamada controlada ao modelo com anotação fictícia retornou HTTP 200, 2 memórias, 0 associações; **pelo menos uma evidência não era trecho literal**. A validação rejeitaria essa extração.
A instrução de extração foi reforçada para exigir cópia literal. Uma nova tentativa de invocação foi bloqueada por restrição da ferramenta; **não considerar modelo revalidado**.
Nenhum usuário de teste nem registro fictício foi inserido no banco real.

## Pendências obrigatórias antes da ativação
1. Testar novamente o modelo real com anotação fictícia e exigir evidência literal; repetir cenários de negativas, terceiros, estado temporário e preferências.
2. Configurar 3 segredos no Vault de forma autorizada: `dn_learning_url`, `dn_learning_anon_jwt`, `dn_learning_scheduler_key`. Um segredo exclusivo foi gerado em `~/.config/diarionegro/scheduler.env` (0600) e configurado no ambiente da Edge Function; não expor.
3. Instalar e testar cron com autenticação adequada, inicialmente inativo; frequência planejada de 5 minutos, 1 chamada por execução se houver trabalho devido.
4. Verificar os limites de custos/erros e retenção, restaurar autorização de contexto para fatos explícitos apenas sob a política aprovada, reabilitar trigger e worker só após testes.
5. Publicar frontend filtrado no GitHub Pages, fazer teste real no iPhone, confirmar Copiloto e Estação Casa.

## Restrições
Não excluir registros pessoais, não usar force-push, não repetir migrations aplicadas, não reativar o sistema antes dos testes obrigatórios.
Não presumir que o código da branch já está em `main`.
