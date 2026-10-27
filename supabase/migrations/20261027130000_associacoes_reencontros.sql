-- Persistência idempotente da Etapa 2. A decisão e a origem existente nunca são alteradas.
create function public.dn_associacao_registrar(p_associacao jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_run uuid;
  v_conf numeric;
begin
  if v_user is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  if jsonb_typeof(p_associacao) is distinct from 'object' then raise exception 'Associação inválida'; end if;
  v_run := (p_associacao->>'reanalysis_id')::uuid;
  if v_run is null or not exists (select 1 from public.reanalisacoes r where r.id = v_run and r.user_id = v_user) then
    raise exception 'Reanálise não encontrada' using errcode = '42501';
  end if;
  v_conf := (p_associacao->>'confianca_modelo')::numeric;
  insert into public.associacoes (user_id, source_record_id, reanalysis_id, sujeito, relacao, objeto,
    source_type, evidencia, justificativa, confianca_modelo, fingerprint, context_version, metadata_json)
  values (v_user, p_associacao->>'source_record_id', v_run, p_associacao->>'sujeito',
    p_associacao->>'relacao', p_associacao->>'objeto', 'reanalisacao_historica',
    p_associacao->>'evidencia', p_associacao->>'justificativa', v_conf,
    p_associacao->>'fingerprint', p_associacao->>'context_version',
    jsonb_build_object('modelo', p_associacao->>'modelo', 'fingerprint_version', 'sha256-nfkc-v1'))
  on conflict (user_id, source_record_id, fingerprint) do nothing returning id into v_id;
  if v_id is not null then return 'criada'; end if;
  select id into strict v_id from public.associacoes where user_id = v_user
    and source_record_id = p_associacao->>'source_record_id' and fingerprint = p_associacao->>'fingerprint';
  insert into public.associacao_historico (user_id, associacao_id, acao, origem_da_acao, metadata_json)
  values (v_user, v_id, 'reencontrada', 'reanalisacao_historica',
    jsonb_build_object('reanalysis_id', v_run, 'source_record_id', p_associacao->>'source_record_id',
      'evidencia', p_associacao->>'evidencia', 'justificativa', p_associacao->>'justificativa',
      'confianca_modelo', v_conf, 'modelo', p_associacao->>'modelo', 'context_version', p_associacao->>'context_version'));
  return 'reencontrada';
end;
$$;
revoke all on function public.dn_associacao_registrar(jsonb) from public, anon, authenticated;
grant execute on function public.dn_associacao_registrar(jsonb) to authenticated;
