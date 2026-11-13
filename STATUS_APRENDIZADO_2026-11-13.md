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

---

## Atualização da retentativa — 13/11/2026 (substitui o estado operacional antigo acima)

- Supabase Vault: **3/3 entradas configuradas e verificadas** (`dn_learning_url`, `dn_learning_anon_jwt`, `dn_learning_scheduler_key`). A chave privada existe também no ambiente do worker; nunca registrar valores.
- Agendamento pg_cron: `dn-aprendizado-continuo` instalado, **ativo**, com expressão `*/5 * * * *`. Sem trabalho devido, não envia chamadas. A captura de registros continua desabilitada e o worker continua pausado por `DN_CONTINUOUS_LEARNING_ENABLED=false`.
- Teste de comunicação banco → Edge Function usando JWT e segredo do Vault: HTTP **503, Aprendizado pausado** (esperado), sem chamada ao modelo.
- Teste real de IA, **seis solicitações com frases totalmente fictícias**:
  * Primeira rodada: três saídas com evidências literais, porém classificações indevidas de emoção passageira, pergunta e fala de terceiro.
  * Segunda rodada: preferência duradoura identificada corretamente; pergunta e emoção transitória excluídas; ainda houve erro com frase de terceiro.
  * Novo filtro independente `sourceEligible` no worker descarta evidências que representem perguntas, relatos temporários e fala citada. O caso de terceiro foi reproduzido em teste unitário com descarte da informação falsa. Evidência inventada continua bloqueada.
  * Após correção, suíte de worker **11/11 aprovada**, além da suíte local completa.
- Backend `aprender-registro` versão **8** implantada com novo prompt e filtro, `verify_jwt=true`.
- Endpoint temporário para homologação `dn-learning-homologar` **excluído** ao finalizar, sem dados pessoais.
- Conferência remota após os testes: **195 registros pessoais**, **9 memórias**, **0 itens na fila**, 3 segredos Vault, 1 agendamento cron. A diferença de 193 para 195 registros ocorreu durante a conversa, sem atribuirmos origem e sem inspecionar conteúdo.
- Migrações de privacidade e cota já aplicadas; os limites de **8 tentativas por dia** valem para o worker, não para a função de teste removida.
- Todos os dados pessoais, a Estação Casa e o Cronômetro preservados. Nenhuma memória foi criada por testes sintéticos.

### Pendências atualizadas
- O app público ainda requer publicação de frontend em GitHub Pages e teste pelo iPhone.
- Captura automática, worker e política de uso do contexto permanecem contidos até validação de liberação controlada. A IA real mostrou falhas semânticas que justificaram o filtro adicional; o filtro passou nos casos testados, mas não é garantia universal.
- Antes de ativar, confirmar critérios de aceitação, política de autorização humana, orçamento e diagnóstico de fila após publicação.

---

## Ativação operacional confirmada — 13/11/2026

Esta seção prevalece sobre os estados de "pausado" e "pendente" das etapas anteriores, que foram preservados como histórico.

- Publicação GitHub Pages: `main` atualizado e site conferido por comparação byte a byte de `index.html` e `dn-learning.js`. Frontend serve corretamente via HTTPS.
- Banco: backup pré-ativação `~/.local/share/diarionegro/backups/diarionegro-pre-ativacao-20261113-053041.dump` com SHA-256 confirmado. Backups anteriores preservados.
- Edge Function `aprender-registro`: versão 9 registrada no Supabase, verificação JWT habilitada, proteção de evidências, exclusão de falas de terceiros, sentimentos transitórios e perguntas nos casos testados.
- Flag de servidor `DN_CONTINUOUS_LEARNING_ENABLED=true` configurada. Com gatilho ainda desligado, teste end-to-end via pg_net → Edge Function → RPC real: HTTP 200 `{"processed":0}`, sem consumir IA nem criar dados.
- Gatilho `aprendizado_registro`: **habilitado**, estado `O`. Migration remota `20261113083335_ativar_captura_aprendizado_20261113` aplicada com guardas de estado, Vault, fila e cron. SQL espelhado localmente em `supabase/migrations/`.
- Scheduler `dn-aprendizado-continuo`: ativo a cada 5 minutos, com três segredos no Vault. Chama o worker apenas quando houver trabalhos devidos.
- Política de contexto: `dn_contexto_copiloto` continua usando somente memórias **confirmadas por humano**. O aprendizado pode coletar e registrar dados, mas não autoriza por conta própria o uso dessas novas memórias nas respostas do Copiloto.
- Cota do worker: máximo de 8 tentativas de chamada ao modelo por dia, compartilhadas, com fila de retomada.
- Estado no momento da ativação: **195 registros existentes, 9 memórias existentes, 0 itens pendentes**. Nenhum backfill/reanálise histórica, nenhum registro de teste inserido.
- Homologação: 35 grupos de integração, 6 verificações de release, 11 testes do worker e 7 testes Python de publicação aprovados após sincronizar o histórico remoto.
- Endpoint temporário `dn-learning-homologar` removido. Os únicos testes diretos ao modelo usaram frases inventadas, não dados do usuário.
- Ainda pendente: observar o primeiro registro real no iPhone, confirmar finalização da fila, criação de fontes/memórias e revisão humana de possíveis falsos positivos. Não declarar que o primeiro aprendizado já aconteceu antes dessa evidência.
