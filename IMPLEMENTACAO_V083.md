# Diário Negro v0.8.3 — Memória + Reanálise histórica

## O que muda

- refina a tela **Memória do Copiloto** usando `tokens.css`, `glass-system.js`, `MAPA_ICONES_V08.md` e `dn-symbols.js` como fontes de verdade visual;
- mantém o sistema v0.8.2 existente intacto e adiciona a v0.8.3 como uma camada compatível;
- mantém Ensinar, fontes, histórico, confirmação, conflitos, exportação/importação e migração do legado;
- adiciona **Reanalisar histórico** como função permanente;
- oferece quatro escopos: desde a última versão, nunca reanalisados, período específico e tudo;
- preserva cada interpretação em `interpretacoes_historico` e mantém o snapshot mais recente em `interpretacoes`;
- registra cada execução em `reanalisacoes`, com progresso e estatísticas;
- reanalisa apenas entradas brutas do usuário: `texto`, `ditado` e `audio_ia`;
- não recria, conclui, edita nem reabre tarefas antigas;
- declarações claras podem virar memória ativa com o registro original como fonte;
- inferências entram como `aguardando_confirmacao` e ficam inativas até confirmação;
- deduplicação, reforço e conflitos reutilizam a governança de memória já existente.

## Banco

Migration:

`supabase/migrations/20261024223500_create_reanalise_historica.sql`

Cria:

- `public.reanalisacoes`
- `public.interpretacoes_historico`

As duas tabelas têm RLS por `user_id`. A migration já foi aplicada ao projeto remoto.

## Edge Function

Função dedicada:

`supabase/functions/reanalisar-historico/index.ts`

O arquivo da função dedicada fica pronto em `supabase/functions/reanalisar-historico/index.ts`. A publicação automática da função não foi confirmada neste ambiente; por isso a camada v0.8.3 inclui fallback seguro para o `copiloto` já ativo. O schema dedicado não possui tarefas nem ações sobre tarefas.

## Interface

A v0.8.3 adiciona `dn-memory-v083.js` e `dn-memory-v083.css` sobre a tela existente. A organização passa a destacar:

1. resumo de memória;
2. cartão **Reanalisar histórico**;
3. busca e filtros;
4. lista de memórias;
5. dados/manutenção recolhidos;
6. contexto-base recolhido.

Os ícones vêm exclusivamente de `DN_SYMBOLS`, e o CSS consome os tokens globais existentes sem criar outro design system.

## Validação executada

- 10/10 testes da v0.8.3 passaram;
- `dn-memory-v083.js` passou em `node --check`;
- a Edge Function passou em verificação TypeScript com declaração do runtime Deno;
- as tabelas remotas foram verificadas com RLS ativo;
- a publicação da Edge Function dedicada não foi confirmada; o frontend possui fallback seguro para o `copiloto` já ativo.
