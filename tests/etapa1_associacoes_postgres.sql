-- SOMENTE em banco PostgreSQL vazio e descartável: psql -X -v ON_ERROR_STOP=1 -f tests/etapa1_associacoes_postgres.sql
-- Cria roles, auth e tabelas de teste; tudo é revertido ao final.
begin;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
\ir ../supabase/migrations/20261024223500_create_reanalise_historica.sql
\ir ../supabase/migrations/20261027120000_create_associacoes_governanca.sql
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.reanalisacoes (id, user_id, context_version) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'teste'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'teste');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.associacoes (user_id, source_record_id, reanalysis_id, sujeito, relacao, objeto, source_type, evidencia, justificativa, confianca_modelo, fingerprint, context_version)
values ('00000000-0000-0000-0000-000000000001', 'registro-ficticio', '10000000-0000-0000-0000-000000000001', 'cantar', 'associado', 'humor', 'teste', 'trecho fictício', 'coocorrência', .5, 'fp-1', 'teste');
create function pg_temp.check_protections() returns void language plpgsql as $$
declare v_id uuid; v_count integer;
begin
  select id into strict v_id from public.associacoes where fingerprint = 'fp-1';
  begin
    insert into public.associacao_historico (user_id, associacao_id, acao) values (auth.uid(), v_id, 'confirmada');
    raise exception 'inserção arbitrária no histórico permitida';
  exception when insufficient_privilege then null; end;
  begin
    update public.associacoes set estado_humano = 'confirmada', confirmado_em = now() where id = v_id;
    raise exception 'confirmação direta permitida';
  exception when insufficient_privilege then null; end;
  begin
    update public.associacoes set source_record_id = 'alterado' where id = v_id;
    raise exception 'alteração de origem permitida';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.associacoes (user_id, source_record_id, sujeito, relacao, objeto, source_type, evidencia, justificativa, confianca_modelo, fingerprint, context_version, estado_humano, confirmado_em)
      values (auth.uid(), 'outro', 'a', 'b', 'c', 'teste', 'x', 'y', .5, 'fp-2', 'teste', 'confirmada', now());
    raise exception 'inserção de decisão permitida';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.associacoes (user_id, source_record_id, sujeito, relacao, objeto, source_type, evidencia, justificativa, confianca_modelo, fingerprint, context_version)
      values (auth.uid(), 'registro-ficticio', 'a', 'b', 'c', 'teste', 'x', 'y', .5, 'fp-1', 'teste');
    raise exception 'duplicata permitida';
  exception when unique_violation then null; end;
  begin
    perform public.dn_associacao_decidir(v_id, 'permitir_uso', null);
    raise exception 'uso em observação permitido';
  exception when check_violation then null; end;
  perform public.dn_associacao_decidir(v_id, 'confirmar', 'decisão fictícia');
  select count(*) into v_count from public.associacoes where id = v_id and estado_humano = 'confirmada' and not uso_permitido;
  if v_count <> 1 then raise exception 'confirmação liberou uso'; end if;
  perform public.dn_associacao_decidir(v_id, 'permitir_uso', null);
  perform public.dn_associacao_decidir(v_id, 'rejeitar', 'decisão fictícia');
  select count(*) into v_count from public.associacoes where id = v_id and estado_humano = 'rejeitada' and not uso_permitido;
  if v_count <> 1 then raise exception 'rejeição não bloqueou uso'; end if;
  select count(*) into v_count from public.associacao_historico where associacao_id = v_id;
  if v_count <> 5 then raise exception 'histórico inesperado: %', v_count; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  select count(*) into v_count from public.associacoes where id = v_id;
  if v_count <> 0 then raise exception 'isolamento RLS falhou'; end if;
  begin
    perform public.dn_associacao_decidir(v_id, 'confirmar', null);
    raise exception 'decisão entre usuários permitida';
  exception when no_data_found then null; end;
end $$;
select pg_temp.check_protections();
reset role;
-- Mesmo com privilégios de proprietário, o trigger protege origem e identidade.
do $$ begin
  begin
    update public.associacoes set source_record_id = 'alterado';
    raise exception 'trigger de imutabilidade falhou';
  exception when raise_exception then
    if sqlerrm = 'trigger de imutabilidade falhou' then raise; end if;
  end;
end $$;
-- O proprietário testa as FKs após todas as inserções pendentes.
set constraints associacoes_reanalysis_owner_fk immediate;
set constraints associacoes_reanalysis_owner_fk deferred;
do $$ begin
  begin
    delete from public.reanalisacoes where id = '10000000-0000-0000-0000-000000000001';
    set constraints associacoes_reanalysis_owner_fk immediate;
    raise exception 'exclusão isolada de reanálise permitida';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.associacoes (user_id, source_record_id, reanalysis_id, sujeito, relacao, objeto, source_type, evidencia, justificativa, confianca_modelo, fingerprint, context_version)
      values ('00000000-0000-0000-0000-000000000001', 'outro', '10000000-0000-0000-0000-000000000002', 'a', 'b', 'c', 'teste', 'x', 'y', .5, 'cruzado', 'teste');
    set constraints associacoes_reanalysis_owner_fk immediate;
    raise exception 'referência cruzada permitida';
  exception when foreign_key_violation then null; end;
end $$;
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
set constraints associacoes_reanalysis_owner_fk immediate;
do $$ begin
  if exists (select 1 from public.reanalisacoes where user_id = '00000000-0000-0000-0000-000000000001')
    or exists (select 1 from public.associacoes where user_id = '00000000-0000-0000-0000-000000000001')
    or exists (select 1 from public.associacao_historico where user_id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'cascata de conta incompleta';
  end if;
  if not exists (select 1 from public.reanalisacoes where user_id = '00000000-0000-0000-0000-000000000002') then
    raise exception 'cascata afetou outro usuário';
  end if;
end $$;
rollback;
