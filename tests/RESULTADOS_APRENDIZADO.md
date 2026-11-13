# Validação isolada — aprendizado contínuo

Data: 2026-11-13. Branch: `feat/aprendizado-continuo-20261112`.

## Ambiente

Dependências somente em `/tmp/dn-validation-tools`: PostgreSQL/client/libpq 16.15 (pacotes extraídos, sem instalação no sistema), pg 8.16.3, supabase-js 2.76.1, esbuild 0.25.11, Playwright 1.56.1, Chromium 141, Deno 2.5.6. Node 24.22.1 já disponível. Lockfile npm do ambiente em `/tmp/dn-validation-tools/js/package-lock.json`.

Cluster criado com `initdb --no-locale --encoding=UTF8 -U dn_test -A trust`, usuário do processo atual, socket `/tmp/dn-validation-tools/socket`, porta 55439, `listen_addresses` vazio. Bases `dn_validation_*` e `dn_release_*` descartáveis. Nenhuma URL/credencial de produção foi usada; somente serviços HTTP locais e provedores fictícios nos testes. Dados de teste preservados em /tmp; cluster encerrado ao final.

## Comandos e resultados

- `node tests/validate_integrated.cjs`: **33 grupos aprovados**, incluindo os **10 cenários PostgreSQL/RLS** antes pendentes, três grupos do scheduler e os fluxos com PostgREST/JWT, Deno e Chromium (320, 390 e 1280 px).
- `node tests/validate_release.cjs`: **8 verificações aprovadas**: aplicação das seis migrations pendentes somente no banco local, histórico anterior intacto, fixture Estação Casa preservada, validação, backup/restauração, reaplicação segura, recusa de histórico divergente e rollback transacional.
- `python3 tests/run_learning_local.py`: **93 verificações aprovadas** (62 unittest, 10 funcionais Python, 9 worker, 7 cliente, 5 importação de áudio).
- `git diff --check`: sem erros.

## Correções verificadas

O instalador do scheduler agora recusa secrets ausentes ou vazios e instala em transação. Os testes executam o SQL real no PostgreSQL com substitutos locais de Vault, cron.schedule e net.http_post: reinstalação mantém um job, fila vazia/backoff/lease ativa/conclusão não disparam HTTP, trabalho vencido dispara quatro chamadas autenticadas. Não equivalem a executar extensões reais ou o gateway hospedado.

O preparador de release removia de `_config.yml` exclusões de `.agents`, `.aws` e `.codex` quando esses diretórios não existiam nesta worktree. Agora conserva essas exclusões; configuração original preservada.

O importador real foi executado com ElevenLabs e OpenAI simulados: preserva transcrição, owner autenticado, claim e original; duplicação não retranscreve; falhas de STT/finalização preservam áudio e reportam erro. O trigger PostgreSQL enfileira `audio_ia`, `texto` e `ditado`; o worker privado consome sem depender do app aberto.

## Falhas encontradas e limites

A primeira criação do cluster escolheu SQL_ASCII com locale C; a normalização Unicode falhou. Corrigido recriando apenas o cluster de teste em UTF-8 e preservando o anterior em `data-sql-ascii`. A suíte também parou antes da instalação completa do Playwright; repetida após finalizar dependências. Nenhuma falha permanece nas suítes finais. Avisos: API experimental de remoção de tipos do Node e download Playwright usando build Ubuntu 24.04 no Mint.

`audio_notas_finalizar` e `station_dn_registrar_resposta` não possuem definição nesta worktree. A Estação Casa local chama o segundo RPC em `app/autonomia_botoes.py:sincronizar_pendentes`; nenhum código/configuração desse projeto foi alterado. Não se presume compatibilidade integral do schema remoto.

## Antes de publicar

1. Em homologação, obter/revisar definições dos RPCs e schema real de registros (user_id, defaults, entrada, texto_original e registrado_em), confirmar que importações de áudio gravam uma entrada aceita e que respostas estruturadas não são tratadas como fatos do usuário.
2. Validar o modelo real com negativas, perguntas, citações, fatos, mudanças e correções; revisar retenção da cópia textual da fila.
3. Validar pg_cron/pg_net/Vault reais, secrets service_role JWT legados e gateway com verify_jwt=true. A chave do scheduler deve corresponder à SUPABASE_SERVICE_ROLE_KEY do worker; chave sb_secret não substitui Bearer JWT nesta implementação.
4. Testar importação ponta a ponta com app fechado e scheduler real, monitorar atraso, falhas e custos. O máximo configurado é quatro chamadas por minuto, sujeito a leases e tempos de execução.
5. Só com backup e autorização: reconciliar manifesto com histórico remoto, aplicar migration, publicar funções/módulos/frontend e instalar scheduler; ativar a flag após validação.

Nenhuma migration em produção, push ou deploy executados.
