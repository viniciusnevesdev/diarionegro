-- Etapa 1: estrutura local aditiva; não aplicar remotamente sem autorização.
-- O fingerprint deve ser determinístico para a associação normalizada; o produtor
-- deve usar a mesma normalização em todas as reanálises.
create table public.associacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_record_id text not null check (length(trim(source_record_id)) > 0),
  reanalysis_id uuid,
  sujeito text not null check (length(trim(sujeito)) > 0),
  relacao text not null check (length(trim(relacao)) > 0),
  objeto text not null check (length(trim(objeto)) > 0),
  source_type text not null check (length(trim(source_type)) > 0),
  evidencia text not null check (length(trim(evidencia)) > 0),
  justificativa text not null check (length(trim(justificativa)) > 0),
  confianca_modelo numeric(5,4) not null check (confianca_modelo between 0 and 1),
  estado_humano text not null default 'em_observacao'
    check (estado_humano in ('em_observacao', 'confirmada', 'rejeitada')),
  uso_permitido boolean not null default false,
  confirmado_em timestamptz,
  confirmacao_motivo text,
  rejeitado_em timestamptz,
  rejeicao_motivo text,
  fingerprint text not null check (length(trim(fingerprint)) > 0),
  context_version text not null,
  version integer not null default 1 check (version > 0),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint associacoes_id_user_unique unique (id, user_id),
  constraint associacoes_fingerprint_unique unique (user_id, source_record_id, fingerprint),
  constraint associacoes_reanalysis_owner_fk foreign key (reanalysis_id, user_id)
    references public.reanalisacoes(id, user_id) on delete no action deferrable initially deferred,
  constraint associacoes_uso_confirmado check (not uso_permitido or estado_humano = 'confirmada'),
  constraint associacoes_confirmacao_data check (estado_humano <> 'confirmada' or confirmado_em is not null),
  constraint associacoes_rejeicao_data check (estado_humano <> 'rejeitada' or rejeitado_em is not null)
);

create index associacoes_user_estado_idx on public.associacoes (user_id, estado_humano, updated_at desc);
create index associacoes_user_uso_idx on public.associacoes (user_id, updated_at desc)
  where estado_humano = 'confirmada' and uso_permitido;
create index associacoes_user_reanalysis_idx on public.associacoes (user_id, reanalysis_id);

create table public.associacao_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  associacao_id uuid not null,
  acao text not null check (acao in ('criada', 'reencontrada', 'editada', 'confirmada', 'rejeitada', 'em_observacao', 'uso_permitido', 'uso_bloqueado')),
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text,
  origem_da_acao text not null default 'sistema',
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint associacao_historico_owner_fk foreign key (associacao_id, user_id)
    references public.associacoes(id, user_id) on delete cascade
);
create index associacao_historico_associacao_idx on public.associacao_historico (user_id, associacao_id, created_at desc);

create table public.associacao_usos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  associacao_id uuid not null,
  interaction_id text not null check (length(trim(interaction_id)) > 0),
  mode text not null default 'interpretar',
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint associacao_usos_owner_fk foreign key (associacao_id, user_id)
    references public.associacoes(id, user_id) on delete cascade,
  constraint associacao_usos_interaction_unique unique (user_id, associacao_id, interaction_id, mode)
);
create index associacao_usos_associacao_idx on public.associacao_usos (user_id, associacao_id, created_at desc);
create index associacao_usos_interaction_idx on public.associacao_usos (user_id, interaction_id);

create function public.dn_associacao_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.user_id, new.source_record_id, new.reanalysis_id,
      new.sujeito, new.relacao, new.objeto, new.source_type, new.evidencia,
      new.justificativa, new.confianca_modelo, new.fingerprint, new.context_version,
      new.metadata_json, new.created_at)
     is distinct from
     (old.id, old.user_id, old.source_record_id, old.reanalysis_id,
      old.sujeito, old.relacao, old.objeto, old.source_type, old.evidencia,
      old.justificativa, old.confianca_modelo, old.fingerprint, old.context_version,
      old.metadata_json, old.created_at) then
    raise exception 'Identidade, conteúdo e origem da associação são imutáveis';
  end if;
  if new is distinct from old then
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create function public.dn_associacao_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.associacao_historico (user_id, associacao_id, acao, valor_novo)
      values (new.user_id, new.id, 'criada', to_jsonb(new));
  elsif new is distinct from old then
    if new.estado_humano is distinct from old.estado_humano then
      insert into public.associacao_historico (user_id, associacao_id, acao, valor_anterior, valor_novo, motivo, origem_da_acao)
        values (new.user_id, new.id, new.estado_humano, to_jsonb(old), to_jsonb(new),
          case new.estado_humano when 'confirmada' then new.confirmacao_motivo when 'rejeitada' then new.rejeicao_motivo end, 'usuario');
    end if;
    if new.uso_permitido is distinct from old.uso_permitido then
      insert into public.associacao_historico (user_id, associacao_id, acao, valor_anterior, valor_novo, origem_da_acao)
        values (new.user_id, new.id, case when new.uso_permitido then 'uso_permitido' else 'uso_bloqueado' end, to_jsonb(old), to_jsonb(new), 'usuario');
    end if;
    if new.estado_humano is not distinct from old.estado_humano and new.uso_permitido is not distinct from old.uso_permitido then
      insert into public.associacao_historico (user_id, associacao_id, acao, valor_anterior, valor_novo)
        values (new.user_id, new.id, 'editada', to_jsonb(old), to_jsonb(new));
    end if;
  end if;
  return new;
end;
$$;
create trigger associacoes_touch before update on public.associacoes for each row execute function public.dn_associacao_touch();
create trigger associacoes_audit after insert or update on public.associacoes for each row execute function public.dn_associacao_audit();

alter table public.associacoes enable row level security;
alter table public.associacao_historico enable row level security;
alter table public.associacao_usos enable row level security;
revoke all on table public.associacoes, public.associacao_historico, public.associacao_usos from public, anon, authenticated;
grant select on public.associacoes, public.associacao_historico, public.associacao_usos to authenticated;
grant insert (user_id, source_record_id, reanalysis_id, sujeito, relacao, objeto,
  source_type, evidencia, justificativa, confianca_modelo, fingerprint, context_version, metadata_json)
  on public.associacoes to authenticated;
grant insert on public.associacao_usos to authenticated;

create policy associacoes_select_own on public.associacoes for select to authenticated using ((select auth.uid()) = user_id);
create policy associacoes_insert_own on public.associacoes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy associacao_historico_select_own on public.associacao_historico for select to authenticated using ((select auth.uid()) = user_id);
create policy associacao_usos_select_own on public.associacao_usos for select to authenticated using ((select auth.uid()) = user_id);
create policy associacao_usos_insert_own on public.associacao_usos for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.associacoes a where a.id = associacao_usos.associacao_id and a.user_id = associacao_usos.user_id
      and a.estado_humano = 'confirmada' and a.uso_permitido
  )
);

-- A escrita de decisões só é exposta por esta operação explícita. A autenticação
-- identifica a conta, mas não prova que quem chamou é uma pessoa, não um robô.
create function public.dn_associacao_decidir(p_associacao_id uuid, p_acao text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.associacoes%rowtype;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  if p_acao is null or p_acao not in ('confirmar', 'rejeitar', 'observar', 'permitir_uso', 'bloquear_uso') then
    raise exception 'Ação inválida' using errcode = '22023';
  end if;
  select * into v_row from public.associacoes
    where id = p_associacao_id and user_id = v_user_id for update;
  if not found then
    raise exception 'Associação não encontrada' using errcode = 'P0002';
  end if;
  if p_acao = 'permitir_uso' and v_row.estado_humano <> 'confirmada' then
    raise exception 'Confirmação necessária antes de permitir uso' using errcode = '23514';
  end if;
  update public.associacoes set
    estado_humano = case p_acao when 'confirmar' then 'confirmada' when 'rejeitar' then 'rejeitada' when 'observar' then 'em_observacao' else estado_humano end,
    uso_permitido = case p_acao when 'rejeitar' then false when 'observar' then false when 'permitir_uso' then true when 'bloquear_uso' then false else uso_permitido end,
    confirmado_em = case when p_acao = 'confirmar' and estado_humano <> 'confirmada' then now() else confirmado_em end,
    confirmacao_motivo = case when p_acao = 'confirmar' and estado_humano <> 'confirmada' then p_motivo else confirmacao_motivo end,
    rejeitado_em = case when p_acao = 'rejeitar' and estado_humano <> 'rejeitada' then now() else rejeitado_em end,
    rejeicao_motivo = case when p_acao = 'rejeitar' and estado_humano <> 'rejeitada' then p_motivo else rejeicao_motivo end
    where id = v_row.id and user_id = v_user_id;
end;
$$;
revoke all on function public.dn_associacao_touch(), public.dn_associacao_audit() from public, anon, authenticated;
revoke all on function public.dn_associacao_decidir(uuid, text, text) from public, anon, authenticated;
grant execute on function public.dn_associacao_decidir(uuid, text, text) to authenticated;
