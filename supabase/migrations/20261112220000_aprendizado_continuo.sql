-- Local, aditiva. Nenhum backfill ou chamada externa durante a migration.
create table public.aprendizado_fila (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  texto text not null,
  entrada text not null,
  registrado_em timestamptz not null,
  versao text not null default 'continuo-v1',
  estado text not null default 'pendente' check (estado in ('pendente','processando','concluido')),
  tentativas integer not null default 0,
  disponivel_em timestamptz not null default now(),
  lease_token uuid,
  lease_ate timestamptz,
  resultado jsonb,
  erro text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, record_id, versao)
);
alter table public.aprendizado_fila enable row level security;
revoke all on public.aprendizado_fila from anon, authenticated;
grant select on public.aprendizado_fila to authenticated;
create policy aprendizado_own on public.aprendizado_fila for select to authenticated using(user_id = (select auth.uid()));
create index aprendizado_pendente on public.aprendizado_fila(disponivel_em, created_at) where estado <> 'concluido';

create function public.dn_aprendizado_enfileirar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.entrada in ('texto','ditado','audio_ia') and length(trim(new.texto_original)) > 0 then
    insert into public.aprendizado_fila(user_id,record_id,texto,entrada,registrado_em)
    values(new.user_id,new.id,new.texto_original,new.entrada,new.registrado_em)
    on conflict do nothing;
  end if;
  return new;
end; $$;
create trigger aprendizado_registro after insert on public.registros
for each row execute function public.dn_aprendizado_enfileirar();

-- Somente o worker autenticado no servidor pode adquirir/concluir um trabalho.
create function public.dn_aprendizado_claim(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.aprendizado_fila;
begin
  select * into j from public.aprendizado_fila
  where (p_user is null or user_id = p_user) and estado <> 'concluido'
    and disponivel_em <= now() and (lease_ate is null or lease_ate < now())
  order by created_at for update skip locked limit 1;
  if j.id is null then return null; end if;
  update public.aprendizado_fila set estado='processando', tentativas=tentativas+1,
    lease_token=gen_random_uuid(), lease_ate=now()+interval '10 minutes'
  where id=j.id returning * into j;
  return to_jsonb(j);
end; $$;
create function public.dn_aprendizado_checkpoint(p_id uuid,p_token uuid,p_resultado jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.aprendizado_fila set resultado=p_resultado
  where id=p_id and lease_token=p_token and lease_ate>now() and estado='processando' and resultado is null;
  if not found then raise exception 'Lease inválida ou resultado já salvo'; end if;
end; $$;
create function public.dn_aprendizado_falhou(p_id uuid,p_token uuid,p_erro text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.aprendizado_fila set estado='pendente', lease_ate=null, lease_token=null,
    erro=left(p_erro,500), disponivel_em=now()+least(3600,30*power(2,least(tentativas,7))) * interval '1 second'
  where id=p_id and lease_token=p_token and estado='processando';
end; $$;

create function public.dn_aprendizado_normalizar(p_texto text) returns text
language sql immutable set search_path = '' as $$
 select trim(regexp_replace(lower(translate(normalize(p_texto, NFKC),
 'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+',' ','g'));
$$;

create function public.dn_aprendizado_aplicar(p_id uuid,p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
 j public.aprendizado_fila; m jsonb; a jsonb; old_m public.memorias; conflict_m public.memorias;
 mid uuid; fp text; ck text; conf numeric; clara boolean; ev text; txt text; inserted_id uuid;
begin
 select * into j from public.aprendizado_fila where id=p_id for update;
 if j.estado='concluido' then return; end if;
 if j.id is null or j.estado<>'processando' or p_token is null
   or j.lease_token is distinct from p_token or j.lease_ate is null or j.lease_ate<=now() or j.resultado is null then
   raise exception 'Lease inválida ou extração ausente';
 end if;
 -- Serialização por pessoa evita corridas entre registros diferentes da mesma memória.
 perform pg_advisory_xact_lock(hashtextextended(j.user_id::text,0));
 for m in select value from jsonb_array_elements(j.resultado->'memorias') loop
   txt:=trim(m->>'texto'); ev:=trim(m->>'evidencia');
   if coalesce(txt,'')='' or coalesce(ev,'')='' or position(lower(ev) in lower(j.texto))=0 then
     raise exception 'Memória sem evidência literal na fonte';
   end if;
   conf:=(m->>'confianca')::numeric;
   clara:=m->>'classificacao'='declaracao_clara' and conf>=0.9;
   fp:=m->>'fingerprint';
   if coalesce(fp,'')='' then raise exception 'Identidade de memória ausente'; end if;
   -- A auditoria mantém recusas mesmo após edição ou exclusão permanente.
   if exists(select 1 from public.memoria_historico h where h.user_id=j.user_id
     and (h.acao='excluida_permanentemente' or (h.acao in ('corrigida','editada')
       and h.valor_anterior->>'texto' is distinct from h.valor_novo->>'texto'))
     and (public.dn_aprendizado_normalizar(h.valor_anterior->>'texto')=public.dn_aprendizado_normalizar(txt)
       or (h.valor_anterior->'metadata_json'->>'aspecto'=m->>'aspecto'
         and h.valor_anterior->'metadata_json'->>'valor'=m->>'valor'))) then continue; end if;
   ck:=coalesce(nullif(m->>'canonical_key',''),fp);
   -- Inclui tombstones e memórias corrigidas: repetição não ressuscita decisões humanas.
   select * into old_m from public.memorias where user_id=j.user_id and
     (fingerprint=fp or public.dn_aprendizado_normalizar(texto)=public.dn_aprendizado_normalizar(txt)
       or (metadata_json->>'aspecto'=m->>'aspecto' and metadata_json->>'valor'=m->>'valor'))
     order by (origem='correcao_explicitamente_lembrada') desc,created_at limit 1 for update;
   if old_m.id is not null then
     mid:=old_m.id;
     -- Nova declaração literal pode resolver uma candidata criada apenas pela IA.
     -- Desconfirmação, rejeição e demais decisões humanas impedem promoção silenciosa.
     if clara and old_m.origem='inferencia_ia_nao_confirmada'
       and old_m.status in ('candidata','aguardando_confirmacao') and old_m.disabled_at is null
       and old_m.deleted_at is null and old_m.merged_into is null
       and not exists(select 1 from public.memoria_historico h where h.memoria_id=mid and h.user_id=j.user_id
         and (h.acao in ('desconfirmada','desativada','corrigida','excluida','restaurada') or h.origem_da_acao like '%usuario%'))
       and not exists(select 1 from public.memorias other where other.user_id=j.user_id and other.id<>mid
         and (other.canonical_key=ck or other.metadata_json->>'aspecto'=m->>'aspecto')
         and other.deleted_at is null and other.merged_into is null and other.status<>'substituida') then
       update public.memorias set origem='registro_declaracao_clara',status='ativa',ativa=true,
         confidence_current=greatest(confidence_current,conf),confianca=greatest(confianca,conf),
         metadata_json=metadata_json||jsonb_build_object('aprendizado_automatico',true,'aspecto',m->>'aspecto',
           'valor',m->>'valor','action_origin','aprendizado_continuo','extracao_id',j.id)
       where id=mid;
     end if;
   else
     select * into conflict_m from public.memorias where user_id=j.user_id and
       ((canonical_key=ck and not (metadata_json ? 'aspecto')) or metadata_json->>'aspecto'=m->>'aspecto')
       and deleted_at is null and merged_into is null and status not in ('substituida','excluida')
       order by confirmed_by_user desc,created_at limit 1 for update;
     insert into public.memorias(user_id,texto,tipo,categoria,origem,status,ativa,confirmed_by_user,
       confianca,confidence_initial,confidence_current,source_record_id,source_type,source_excerpt,
       fingerprint,canonical_key,metadata_json)
     values(j.user_id,txt,m->>'tipo',coalesce(nullif(m->>'categoria',''),'Outro'),
       case when clara then 'registro_declaracao_clara' else 'inferencia_ia_nao_confirmada' end,
       case when conflict_m.id is not null then 'conflitante' when clara then 'ativa' else 'aguardando_confirmacao' end,
       clara and conflict_m.id is null,false,conf,conf,conf,j.record_id,'aprendizado_continuo',ev,fp,ck,
       jsonb_build_object('action_origin','aprendizado_continuo','aprendizado_automatico',true,
         'aspecto',m->>'aspecto','valor',m->>'valor','conflito_com',conflict_m.id,'extracao_id',j.id)) returning id into mid;
     if conflict_m.id is not null then
       insert into public.memoria_fontes(user_id,memoria_id,record_id,source_type,source_excerpt,relation_type,fingerprint,metadata_json)
       values(j.user_id,mid,conflict_m.source_record_id,'memoria_existente',conflict_m.texto,'conflito',
         'conflito:'||conflict_m.id::text,jsonb_build_object('conflicting_memory_id',conflict_m.id))
       on conflict(user_id,memoria_id,fingerprint) do nothing;
     end if;
     -- Um conflito entre declarações automáticas retira a antiga do contexto até revisão.
     -- Correções/ensinos e demais decisões humanas nunca são alterados pelo worker.
     if conflict_m.id is not null and not conflict_m.confirmed_by_user
       and conflict_m.metadata_json->>'aprendizado_automatico'='true' and conflict_m.status='ativa' then
       update public.memorias set status='conflitante',ativa=false where id=conflict_m.id;
     end if;
   end if;
   insert into public.memoria_fontes(user_id,memoria_id,record_id,source_type,source_excerpt,relation_type,fingerprint,metadata_json)
   values(j.user_id,mid,j.record_id,'aprendizado_continuo',ev,
     case when old_m.id is null then 'origem' else 'reforco' end,
     'continuo:'||md5(j.record_id||':'||mid::text),jsonb_build_object('extracao_id',j.id,'modelo',j.resultado->'_meta'->>'model'))
   on conflict(user_id,memoria_id,fingerprint) do nothing returning id into inserted_id;
   if old_m.id is not null and inserted_id is not null and old_m.status='ativa' and old_m.ativa
      and old_m.deleted_at is null and old_m.disabled_at is null then
     update public.memorias set confidence_current=greatest(confidence_current,conf),
       confianca=greatest(confianca,conf) where id=mid;
   end if;
 end loop;
 for a in select value from jsonb_array_elements(j.resultado->'associacoes') loop
   ev:=trim(a->>'evidencia');
   if coalesce(ev,'')='' or position(lower(ev) in lower(j.texto))=0 then raise exception 'Associação sem fonte literal'; end if;
   fp:=a->>'fingerprint';
   -- Mesma identidade SHA-256 da v0.8.3; decisões de qualquer registro são preservadas.
   if exists(select 1 from public.associacoes where user_id=j.user_id and fingerprint=fp and estado_humano='rejeitada') then continue; end if;
   insert into public.associacoes(user_id,source_record_id,sujeito,relacao,objeto,source_type,evidencia,
     justificativa,confianca_modelo,fingerprint,context_version,metadata_json)
   values(j.user_id,j.record_id,a->>'sujeito',a->>'relacao',a->>'objeto','aprendizado_continuo',ev,
     a->>'justificativa',(a->>'confianca')::numeric,fp,j.versao,jsonb_build_object('extracao_id',j.id))
   on conflict(user_id,source_record_id,fingerprint) do nothing;
 end loop;
 insert into public.interpretacoes_historico(user_id,record_id,resumo,categoria,intencao,dados_json,origem,modelo,context_version)
 values(j.user_id,j.record_id,coalesce(j.resultado->>'resumo',''),coalesce(j.resultado->>'categoria',''),
   coalesce(j.resultado->>'intencao','registro'),j.resultado,'aprendizado_continuo',j.resultado->'_meta'->>'model',j.versao);
 update public.aprendizado_fila set estado='concluido',completed_at=now(),lease_token=null,lease_ate=null,erro=null where id=j.id;
end; $$;

revoke all on function public.dn_aprendizado_enfileirar() from public,anon,authenticated;
revoke all on function public.dn_aprendizado_claim(uuid),public.dn_aprendizado_checkpoint(uuid,uuid,jsonb),
 public.dn_aprendizado_falhou(uuid,uuid,text),public.dn_aprendizado_aplicar(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dn_aprendizado_claim(uuid),public.dn_aprendizado_checkpoint(uuid,uuid,jsonb),
 public.dn_aprendizado_falhou(uuid,uuid,text),public.dn_aprendizado_aplicar(uuid,uuid) to service_role;

-- Declarações automáticas auditadas podem compor contexto sem simular confirmação humana.
-- Contexto e auditoria preparados na mesma transação com identidade autenticada.
create or replace function public.dn_contexto_copiloto(p_interaction_id text, p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row record;
  v_memories jsonb := '[]'::jsonb;
  v_associations jsonb := '[]'::jsonb;
  v_remaining integer := 60;
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  if p_interaction_id is null or length(trim(p_interaction_id)) = 0 or length(p_interaction_id) > 128
     or p_mode is null or p_mode not in ('interpretar', 'decidir_agora') then
    raise exception 'Interação inválida' using errcode = '22023';
  end if;
  for v_row in
    select m.id, m.texto, m.categoria, m.origem from public.memorias m
    where m.user_id = v_user and m.status = 'ativa' and m.ativa and (m.confirmed_by_user or (m.origem='registro_declaracao_clara'
        and m.metadata_json->>'aprendizado_automatico'='true' and m.confidence_current>=0.9))
      and m.deleted_at is null and m.merged_into is null
    order by (m.origem = 'correcao_explicitamente_lembrada') desc, m.updated_at desc, m.id
    limit 60 for share
  loop
    v_memories := v_memories || jsonb_build_array(jsonb_build_object('id',v_row.id,'texto',v_row.texto,'categoria',v_row.categoria,'origem',v_row.origem));
    insert into public.memoria_usos (user_id, memoria_id, interaction_id, mode, metadata_json)
      values (v_user, v_row.id, p_interaction_id, p_mode, jsonb_build_object('source','contexto_copiloto'))
      on conflict (user_id, memoria_id, interaction_id, mode) do nothing;
    v_remaining := v_remaining - 1;
  end loop;
  -- Não inferir conflito por categoria ou por simples coexistência.
  if v_remaining > 0 then
    for v_row in select a.id, a.sujeito, a.relacao, a.objeto from public.associacoes a
      where a.user_id = v_user and a.estado_humano = 'confirmada' and a.uso_permitido = true
      order by a.updated_at desc, a.id limit v_remaining for share
    loop
      v_associations := v_associations || jsonb_build_array(jsonb_build_object('id',v_row.id,'sujeito',v_row.sujeito,'relacao',v_row.relacao,'objeto',v_row.objeto));
      insert into public.associacao_usos (user_id, associacao_id, interaction_id, mode, metadata_json)
        values (v_user, v_row.id, p_interaction_id, p_mode, jsonb_build_object('source','contexto_copiloto'))
        on conflict (user_id, associacao_id, interaction_id, mode) do nothing;
    end loop;
  end if;
  return jsonb_build_object('memorias',v_memories,'associacoes',v_associations);
end;
$$;
revoke all on function public.dn_contexto_copiloto(text, text) from public, anon, authenticated;
grant execute on function public.dn_contexto_copiloto(text, text) to authenticated;
