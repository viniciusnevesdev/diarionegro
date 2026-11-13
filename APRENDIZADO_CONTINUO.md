# Aprendizado pessoal contínuo — implementação local

Branch: `feat/aprendizado-continuo-20261112`. Nenhuma publicação, migration remota ou alteração de produção foi executada.

## Implementação

- Migration aditiva `20261112220000_aprendizado_continuo.sql`: trigger na inserção de `registros` enfileira entradas `texto`, `ditado` e `audio_ia`, independentemente do produtor. Não varre nem reanalisa dados antigos. Eventos de tarefas, emoções, correções e exclusões não geram extração.
- `dn-learning.js`: acorda o worker após salvamento no app/Copiloto, login, retorno ao app e reconexão. Verifica pendências a cada 30 segundos enquanto o app está visível. Coalesce chamadas concorrentes, não chama a Edge Function para fila vazia e mostra o estado na tela de memória. A timeline consome os mesmos registros: não depende de abri-la ou interpretá-los manualmente.
- `aprender-registro`: verifica a sessão no servidor; o cliente não escolhe usuário, texto ou resultado. Usa o schema de extração da v0.8.3 compartilhado em `_shared/extracao.ts`. Não usa contexto pessoal anterior como evidência, nem schemas/APIs de tarefas.
- Declarações claras com confiança >= 0,90 podem virar memórias ativas de origem `registro_declaracao_clara`. Não simula confirmação humana: `confirmed_by_user` continua falso. Somente essa origem com marca de aprendizado automático é elegível no contexto, além das memórias já confirmadas.
- Inferências ficam inativas e aguardam confirmação. Associações independentes entram `em_observacao`, sem autorização de uso. Confirmar e autorizar continuam decisões separadas.
- Reutiliza `memorias`, `memoria_fontes`, `memoria_historico`, `interpretacoes_historico`, associações, auditoria e a tela existente de correção. O snapshot operacional `interpretacoes` e seus efeitos sobre tarefas não são sobrescritos pelo aprendizado.
- Identidade textual FNV e canonicalização compatíveis com a memória existente. Aspecto e valor extraídos ajudam a deduplicar paráfrases e reconhecer mudanças. Cada registro independente acrescenta uma fonte; repetir o mesmo trabalho não acrescenta outra.
- Contradições criam memória conflitante e fonte do conflito. Duas declarações automáticas conflitantes saem do contexto até revisão; ensino/correção e decisões humanas existentes permanecem intactos. Não substitui fatos antigos silenciosamente.
- Rejeições de associações bloqueiam reencontros em outras fontes. Desativação, desconfirmação, edição e exclusão de memórias são respeitadas; o histórico também impede recriar conteúdo corrigido ou excluído permanentemente.
- A edição preserva metadados de origem, invalida a identidade semântica anterior e registra a correção humana de uma memória automática. Não reativa uma memória desativada ao editá-la.
- Não altera Estação Casa, tabelas existentes de registros, funções de importação/transcrição ou dados anteriores. O gatilho observa a fronteira comum de persistência.

## Falhas, concorrência e custos

A fila é durável, tem unicidade por pessoa/registro/versão, RLS de leitura própria e mutações reservadas ao servidor (`service_role`). Claims usam `SKIP LOCKED`, token de lease e prazo de dez minutos; o consumo do provedor tem timeout de 90 segundos. Falhas têm espera exponencial, limitada a uma hora. Falhas em uma entrada não impedem processar as demais.

O resultado é salvo em checkpoint antes da transação que aplica memórias, fontes, associações, histórico e conclusão. Após falha nessa aplicação, o worker usa o resultado salvo e não consulta o modelo novamente. A aplicação tem trava por pessoa para evitar duplicação entre registros concorrentes. Jobs concluídos não são reprocessados.

Limite distribuído: se o provedor concluir e o processo morrer antes de salvar o checkpoint, uma retomada pode exigir nova consulta. Não há garantia de cobrança exatamente uma vez nesse intervalo. Os testes usam provedor fictício: a classificação semântica e a estabilidade de aspecto/valor ainda precisam de avaliação em ambiente de validação.

## Testes executados

Comando reproduzível, sem rede/credenciais: `python3 tests/run_learning_local.py` (Node 24).

- 62 testes unittest existentes: passaram.
- 10 verificações funcionais da v0.8.3: passaram.
- 9 cenários executando o worker real com autenticação, banco e provedor fictícios: passaram. Incluem aprendizado de áudio, idempotência, checkpoint, falhas do provedor/persistência, fonte inventada, isolamento de identidade e associações independentes.
- 7 cenários do cliente: passaram. Incluem concorrência, fila vazia, offline, logout/troca de conta, retomada, integração e correção com proveniência.
- Verificação TypeScript das duas funções e módulos compartilhados: passou com declaração local do runtime Deno; verificações sintáticas dos JavaScripts alterados e `git diff --check`: passaram.

**88 verificações locais passaram.** Não equivalem a validação real de RLS ou do modelo.

`tests/learning_postgres.cjs` acrescenta 10 cenários à suíte `node tests/validate_integrated.cjs`: fila por caminho, lease/idempotência, evidências, contradições, prioridade humana, hipóteses, rejeições, desativação, rollback/retomada e segurança. O teste de release também inclui a nova migration, preservando fixtures da Estação Casa e o histórico anterior.

**Banco validado em 2026-11-13:** os 10 cenários PostgreSQL/RLS passaram em PostgreSQL 16.15 descartável, UTF-8. A suíte integrada completa passou com 33 grupos, incluindo três novos grupos do scheduler e remoção da fila na exclusão de conta. As oito verificações de release passaram, incluindo backup/restauração e preservação da fixture Estação Casa. Consulte o registro detalhado em `tests/RESULTADOS_APRENDIZADO.md`.

O importador real foi executado com storage, STT e RPC simulados: cinco cenários passaram para ElevenLabs/OpenAI, duplicação e falhas. Isso confirma o contrato até `audio_notas_finalizar`, mas não a implementação desse RPC remoto, ausente no repositório. Não foi consultado banco remoto.

## Preparação para publicar

`python3 scripts/publicacao_governanca.py preparar` gera apenas artefatos locais em `dist/`: frontend com allowlist, hashes, SQL de aplicação/validação e manifesto. A nova migration é pendente no manifesto; o baseline anterior não foi alterado. O pacote inclui os módulos compartilhados e o worker no recibo de integridade. As rotinas de contingência desativam também `DN_CONTINUOUS_LEARNING_ENABLED`, preservando fila e dados.

Antes de qualquer publicação:

1. Suítes integrada e de release aprovadas no ambiente isolado. Antes de publicar, verificar em homologação o schema real de `registros`, propriedade `user_id`, defaults e labels de entrada usados pelo RPC `audio_notas_finalizar` e pela Estação Casa. Esses RPCs não têm definição nesta worktree; a cobertura do trigger depende de gravarem texto bruto em uma das três entradas aceitas.
2. Validar cenários reais de linguagem: fatos explícitos, citações de terceiros, perguntas, negativas, preferências independentes, mudanças e correções. Confirmar políticas de retenção da cópia textual na fila e efeitos da exclusão de conta.
3. Após validação, backup e autorização de publicação, aplicar a migration e publicar `aprender-registro` e a reanálise com `_shared`, mantendo JWT verificado. Configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` e modelo nos secrets do servidor.
4. Instalar `supabase/validation/instalar_aprendizado_scheduler.sql` com pg_cron, pg_net e Vault. Configurar no Vault `dn_learning_url` e `dn_learning_service_key`; nunca no frontend. O scheduler processa até quatro entradas por minuto, com controle de concorrência no banco. É necessário para importações com o app fechado; com o app aberto, o cliente inicia imediatamente.
5. Validar frontend e importação com o app fechado. A ativação exige scheduler ativo e os dois secrets. Aumentar a capacidade somente conforme fila observada. Verificar filas pendentes, falhas e histórico. Habilitar `DN_CONTINUOUS_LEARNING_ENABLED` apenas depois dessas verificações. Para pausar, definir `false`; não excluir filas nem fontes.

As proteções de histórico do publicador recusam migrations remotas inesperadas; inspecionar e reconciliar o manifesto em revisão se o ambiente tiver evoluído. Não executar reparo automático nem reaplicar migrations antigas.

## Registro Git

A implementação inicial foi salva em `9108a6c59fb6d0e0ccaf98570c96f4282b0d930e`. As correções e os resultados posteriores são registrados nesta mesma branch, sem push ou deploy.
