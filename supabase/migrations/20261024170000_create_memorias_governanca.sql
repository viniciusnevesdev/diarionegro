-- Diário Negro v0.8.2 — memória pessoal auditável.
-- Migration local: não aplicar no projeto remoto sem aprovação explícita.

create table if not exists public.memorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  titulo_curto text,
  tipo text not null default 'outro',
  categoria text not null default 'Outro',
  subcategoria text,
  origem text not null,
  status text not null default 'ativa',
  ativa boolean not null default true,
  confirmed_by_user boolean not null default false,
  confirmed_at timestamptz,
  confianca numeric(5,4) not null default 0.5 check (confianca between 0 and 1),
  confidence_initial numeric(5,4) not null default 0.5 check (confidence_initial between 0 and 1),
  confidence_current numeric(5,4) not null default 0.5 check (confidence_current between 0 and 1),
  source_record_id text,
  source_type text,
  source_label text,
  source_excerpt text,
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  first_learned_at timestamptz not null default now(),
  last_reinforced_at timestamptz,
  fingerprint text not null,
  canonical_key text not null,
  superseded_by uuid,
  supersedes uuid,
  merged_into uuid,
  disabled_at timestamptz,
  disabled_reason text,
  deleted_at timestamptz,
  correction_reason text,
  version integer not null default 1 check (version > 0),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memorias_id_user_unique unique (id, user_id),
  constraint memorias_tipo_check check (tipo in (
    'fato_pessoal', 'preferencia', 'regra_pessoal', 'objeto_lugar', 'rotina',
    'trabalho', 'social', 'dinheiro', 'casa', 'saude_contextual',
    'significado_pessoal', 'relacao', 'contexto_vida', 'outro'
  )),
  constraint memorias_origem_check check (origem in (
    'ensinado_explicitamente', 'correcao_explicitamente_lembrada',
    'registro_declaracao_clara', 'inferencia_ia_confirmada',
    'inferencia_ia_nao_confirmada', 'migrada_sistema_antigo', 'importada', 'outra'
  )),
  constraint memorias_status_check check (status in (
    'ativa', 'candidata', 'aguardando_confirmacao', 'desativada',
    'substituida', 'conflitante', 'excluida'
  )),
  constraint memorias_confirmation_consistent check (
    (confirmed_by_user = false) or confirmed_at is not null
  ),
  constraint memorias_deleted_consistent check (
    (deleted_at is null) or (status = 'excluida' and ativa = false)
  ),
  constraint memorias_disabled_consistent check (
    (disabled_at is null) or ativa = false
  ),
  constraint memorias_inference_not_silent_truth check (
    origem <> 'inferencia_ia_nao_confirmada'
    or (confirmed_by_user = false and status in ('candidata', 'aguardando_confirmacao', 'conflitante') and ativa = false)
  ),
  constraint memorias_superseded_by_owner_fk foreign key (superseded_by, user_id)
    references public.memorias(id, user_id) on delete set null (superseded_by),
  constraint memorias_supersedes_owner_fk foreign key (supersedes, user_id)
    references public.memorias(id, user_id) on delete set null (supersedes),
  constraint memorias_merged_into_owner_fk foreign key (merged_into, user_id)
    references public.memorias(id, user_id) on delete set null (merged_into)
);

create unique index if not exists memorias_user_fingerprint_live_unique
  on public.memorias (user_id, fingerprint)
  where deleted_at is null and merged_into is null and status <> 'substituida';
create index if not exists memorias_user_status_idx on public.memorias (user_id, status, updated_at desc);
create index if not exists memorias_user_active_idx on public.memorias (user_id, ativa, updated_at desc);
create index if not exists memorias_user_category_idx on public.memorias (user_id, categoria, updated_at desc);
create index if not exists memorias_user_created_idx on public.memorias (user_id, created_at desc);
create index if not exists memorias_user_canonical_idx on public.memorias (user_id, canonical_key);
create index if not exists memorias_source_record_idx on public.memorias (user_id, source_record_id);

create table if not exists public.memoria_fontes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memoria_id uuid not null,
  record_id text,
  source_type text not null default 'outra',
  source_label text,
  source_excerpt text,
  relation_type text not null default 'reforco',
  confidence_contribution numeric(5,4) check (confidence_contribution between -1 and 1),
  fingerprint text not null,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint memoria_fontes_owner_fk foreign key (memoria_id, user_id)
    references public.memorias(id, user_id) on delete cascade,
  constraint memoria_fontes_relation_check check (relation_type in (
    'origem', 'reforco', 'correcao', 'confirmacao', 'conflito', 'importacao', 'outra'
  )),
  constraint memoria_fontes_user_fingerprint_unique unique (user_id, memoria_id, fingerprint)
);

create index if not exists memoria_fontes_memoria_idx on public.memoria_fontes (user_id, memoria_id, created_at);
create index if not exists memoria_fontes_record_idx on public.memoria_fontes (user_id, record_id);

create table if not exists public.memoria_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memoria_id uuid,
  acao text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text,
  origem_da_acao text not null default 'sistema',
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint memoria_historico_owner_fk foreign key (memoria_id, user_id)
    references public.memorias(id, user_id) on delete set null (memoria_id),
  constraint memoria_historico_acao_check check (acao in (
    'criada', 'confirmada', 'desconfirmada', 'editada', 'corrigida', 'desativada',
    'reativada', 'excluida', 'restaurada', 'excluida_permanentemente', 'mesclada',
    'substituida', 'confianca_alterada', 'categoria_alterada', 'tipo_alterado',
    'fonte_adicionada', 'conflito_detectado', 'conflito_resolvido', 'importada'
  ))
);

create index if not exists memoria_historico_memoria_idx
  on public.memoria_historico (user_id, memoria_id, created_at desc);

create table if not exists public.memoria_usos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memoria_id uuid not null,
  interaction_id text not null,
  mode text not null default 'interpretar',
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint memoria_usos_owner_fk foreign key (memoria_id, user_id)
    references public.memorias(id, user_id) on delete cascade,
  constraint memoria_usos_interaction_unique unique (user_id, memoria_id, interaction_id, mode)
);

create index if not exists memoria_usos_memoria_idx on public.memoria_usos (user_id, memoria_id, created_at desc);
create index if not exists memoria_usos_interaction_idx on public.memoria_usos (user_id, interaction_id);

create or replace function public.dn_memoria_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new is distinct from old then new.version = old.version + 1; end if;
  return new;
end;
$$;

create or replace function public.dn_memoria_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  audit_action text := 'editada';
  old_value jsonb := null;
  new_value jsonb := null;
begin
  if tg_op = 'INSERT' then
    audit_action := case when new.origem = 'importada' then 'importada' else 'criada' end;
    new_value := to_jsonb(new);
    insert into public.memoria_historico (user_id, memoria_id, acao, valor_novo, origem_da_acao)
      values (new.user_id, new.id, audit_action, new_value, coalesce(new.metadata_json->>'action_origin', 'sistema'));
    return new;
  end if;

  old_value := to_jsonb(old);
  new_value := to_jsonb(new);
  if old.deleted_at is null and new.deleted_at is not null then audit_action := 'excluida';
  elsif old.deleted_at is not null and new.deleted_at is null then audit_action := 'restaurada';
  elsif old.status <> 'conflitante' and new.status = 'conflitante' then audit_action := 'conflito_detectado';
  elsif old.status = 'conflitante' and new.status <> 'conflitante' then audit_action := 'conflito_resolvido';
  elsif old.merged_into is distinct from new.merged_into and new.merged_into is not null then audit_action := 'mesclada';
  elsif old.superseded_by is distinct from new.superseded_by and new.superseded_by is not null then audit_action := 'substituida';
  elsif old.ativa and not new.ativa then audit_action := 'desativada';
  elsif not old.ativa and new.ativa then audit_action := 'reativada';
  elsif not old.confirmed_by_user and new.confirmed_by_user then audit_action := 'confirmada';
  elsif old.confirmed_by_user and not new.confirmed_by_user then audit_action := 'desconfirmada';
  elsif old.texto is distinct from new.texto then audit_action := case when new.correction_reason is not null then 'corrigida' else 'editada' end;
  elsif old.categoria is distinct from new.categoria then audit_action := 'categoria_alterada';
  elsif old.tipo is distinct from new.tipo then audit_action := 'tipo_alterado';
  elsif old.confidence_current is distinct from new.confidence_current then audit_action := 'confianca_alterada';
  end if;

  insert into public.memoria_historico (user_id, memoria_id, acao, valor_anterior, valor_novo, motivo, origem_da_acao)
    values (new.user_id, new.id, audit_action, old_value, new_value,
      coalesce(new.correction_reason, new.disabled_reason), coalesce(new.metadata_json->>'action_origin', 'sistema'));
  return new;
end;
$$;

create or replace function public.dn_memoria_fonte_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.memoria_historico (user_id, memoria_id, acao, valor_novo, origem_da_acao)
    values (new.user_id, new.memoria_id, 'fonte_adicionada', to_jsonb(new), 'sistema');
  update public.memorias
    set last_reinforced_at = greatest(coalesce(last_reinforced_at, first_learned_at), new.created_at)
    where id = new.memoria_id and user_id = new.user_id;
  return new;
end;
$$;

create or replace function public.dn_memoria_before_delete_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.memoria_historico (user_id, memoria_id, acao, valor_anterior, origem_da_acao)
    values (old.user_id, old.id, 'excluida_permanentemente', to_jsonb(old), 'usuario');
  return old;
end;
$$;

drop trigger if exists memorias_touch_updated_at on public.memorias;
create trigger memorias_touch_updated_at before update on public.memorias
  for each row execute function public.dn_memoria_touch_updated_at();
drop trigger if exists memorias_audit on public.memorias;
create trigger memorias_audit after insert or update on public.memorias
  for each row execute function public.dn_memoria_audit();
drop trigger if exists memoria_fontes_audit on public.memoria_fontes;
create trigger memoria_fontes_audit after insert on public.memoria_fontes
  for each row execute function public.dn_memoria_fonte_audit();
drop trigger if exists memorias_before_delete_audit on public.memorias;
create trigger memorias_before_delete_audit before delete on public.memorias
  for each row execute function public.dn_memoria_before_delete_audit();

alter table public.memorias enable row level security;
alter table public.memoria_fontes enable row level security;
alter table public.memoria_historico enable row level security;
alter table public.memoria_usos enable row level security;

revoke all on table public.memorias, public.memoria_fontes, public.memoria_historico, public.memoria_usos from anon, authenticated;
grant select, insert, update, delete on table public.memorias to authenticated;
grant select, insert, update, delete on table public.memoria_fontes to authenticated;
grant select, insert on table public.memoria_historico to authenticated;
grant select, insert, delete on table public.memoria_usos to authenticated;

create policy "memorias_select_own" on public.memorias for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "memorias_insert_own" on public.memorias for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "memorias_update_own" on public.memorias for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "memorias_delete_own" on public.memorias for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "memoria_fontes_select_own" on public.memoria_fontes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "memoria_fontes_insert_own" on public.memoria_fontes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "memoria_fontes_update_own" on public.memoria_fontes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "memoria_fontes_delete_own" on public.memoria_fontes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "memoria_historico_select_own" on public.memoria_historico for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "memoria_historico_insert_own" on public.memoria_historico for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "memoria_usos_select_own" on public.memoria_usos for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "memoria_usos_insert_own" on public.memoria_usos for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "memoria_usos_delete_own" on public.memoria_usos for delete to authenticated
  using ((select auth.uid()) = user_id);
