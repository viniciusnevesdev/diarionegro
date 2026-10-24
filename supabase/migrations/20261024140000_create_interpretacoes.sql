create table if not exists public.interpretacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  resumo text not null default '',
  categoria text not null default '',
  subcategoria text not null default '',
  intencao text not null default '',
  dados_json jsonb not null default '{}'::jsonb,
  origem text not null default 'copiloto',
  modelo text,
  context_version text not null default '0.8.1',
  efeitos_aplicados_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interpretacoes_user_record_unique unique (user_id, record_id),
  constraint interpretacoes_dados_json_object check (jsonb_typeof(dados_json) = 'object')
);

create index if not exists interpretacoes_user_id_idx
  on public.interpretacoes (user_id);

create index if not exists interpretacoes_user_updated_at_idx
  on public.interpretacoes (user_id, updated_at desc);

alter table public.interpretacoes enable row level security;

revoke all on table public.interpretacoes from anon, authenticated;
grant select, insert, update on table public.interpretacoes to authenticated;

create policy "interpretacoes_select_own"
  on public.interpretacoes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "interpretacoes_insert_own"
  on public.interpretacoes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "interpretacoes_update_own"
  on public.interpretacoes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
