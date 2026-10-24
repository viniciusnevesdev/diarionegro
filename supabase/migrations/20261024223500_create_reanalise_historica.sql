-- Diário Negro v0.8.3 — reanálise histórica versionada.
-- Espelha a estrutura aplicada ao Supabase remoto em 2026-10-24.

create table if not exists public.reanalisacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  escopo text not null default 'desatualizados',
  status text not null default 'executando',
  context_version text not null,
  modelo text,
  filtro_inicio timestamptz,
  filtro_fim timestamptz,
  total_registros integer not null default 0 check (total_registros >= 0),
  processados integer not null default 0 check (processados >= 0),
  falhas integer not null default 0 check (falhas >= 0),
  memorias_criadas integer not null default 0 check (memorias_criadas >= 0),
  memorias_reforcadas integer not null default 0 check (memorias_reforcadas >= 0),
  candidatos_criados integer not null default 0 check (candidatos_criados >= 0),
  conflitos_detectados integer not null default 0 check (conflitos_detectados >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reanalisacoes_id_user_unique unique (id, user_id),
  constraint reanalisacoes_escopo_check check (escopo in ('nunca_analisados','desatualizados','periodo','tudo')),
  constraint reanalisacoes_status_check check (status in ('executando','concluida','interrompida','falhou'))
);

create index if not exists reanalisacoes_user_created_idx
  on public.reanalisacoes (user_id, created_at desc);
create index if not exists reanalisacoes_user_status_idx
  on public.reanalisacoes (user_id, status, updated_at desc);

create table if not exists public.interpretacoes_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  reanalysis_id uuid,
  resumo text not null default '',
  categoria text not null default '',
  subcategoria text not null default '',
  intencao text not null default '',
  dados_json jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_json) = 'object'),
  origem text not null default 'reanalisar_historico',
  modelo text,
  context_version text not null,
  created_at timestamptz not null default now(),
  constraint interpretacoes_historico_reanalysis_owner_fk
    foreign key (reanalysis_id, user_id)
    references public.reanalisacoes(id, user_id) on delete set null (reanalysis_id)
);

create index if not exists interpretacoes_historico_record_idx
  on public.interpretacoes_historico (user_id, record_id, created_at desc);
create index if not exists interpretacoes_historico_version_idx
  on public.interpretacoes_historico (user_id, context_version, created_at desc);
create index if not exists interpretacoes_historico_run_idx
  on public.interpretacoes_historico (user_id, reanalysis_id, created_at);

alter table public.reanalisacoes enable row level security;
alter table public.interpretacoes_historico enable row level security;

grant select, insert, update on table public.reanalisacoes to authenticated;
grant select, insert on table public.interpretacoes_historico to authenticated;

create policy "reanalisacoes_select_own" on public.reanalisacoes
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "reanalisacoes_insert_own" on public.reanalisacoes
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "reanalisacoes_update_own" on public.reanalisacoes
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "interpretacoes_historico_select_own" on public.interpretacoes_historico
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "interpretacoes_historico_insert_own" on public.interpretacoes_historico
for insert to authenticated
with check ((select auth.uid()) = user_id);
