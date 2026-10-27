-- Contexto e auditoria preparados na mesma transação com identidade autenticada.
create function public.dn_contexto_copiloto(p_interaction_id text, p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_has_correction boolean;
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
  select exists(select 1 from public.memorias m where m.user_id = v_user and m.status = 'ativa'
    and m.ativa and m.confirmed_by_user and m.deleted_at is null and m.merged_into is null
    and m.origem = 'correcao_explicitamente_lembrada') into v_has_correction;
  for v_row in
    select m.id, m.texto, m.categoria, m.origem from public.memorias m
    where m.user_id = v_user and m.status = 'ativa' and m.ativa and m.confirmed_by_user
      and m.deleted_at is null and m.merged_into is null
      and (not v_has_correction or m.origem in ('correcao_explicitamente_lembrada', 'ensinado_explicitamente'))
    order by (m.origem = 'correcao_explicitamente_lembrada') desc, m.updated_at desc, m.id
    limit 60 for share
  loop
    v_memories := v_memories || jsonb_build_array(jsonb_build_object('id',v_row.id,'texto',v_row.texto,'categoria',v_row.categoria,'origem',v_row.origem));
    insert into public.memoria_usos (user_id, memoria_id, interaction_id, mode, metadata_json)
      values (v_user, v_row.id, p_interaction_id, p_mode, jsonb_build_object('source','contexto_copiloto'))
      on conflict (user_id, memoria_id, interaction_id, mode) do nothing;
    v_remaining := v_remaining - 1;
  end loop;
  -- Sem resolução semântica confiável de conflitos, uma correção ativa prevalece
  -- conservadoramente sobre todas as associações e inferências históricas.
  if not v_has_correction and v_remaining > 0 then
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
