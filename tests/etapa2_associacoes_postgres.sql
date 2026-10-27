-- SOMENTE banco PostgreSQL vazio e descartável, com permissões para criar roles.
-- psql -X -v ON_ERROR_STOP=1 -f tests/etapa2_associacoes_postgres.sql
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
\ir ../supabase/migrations/20261027130000_associacoes_reencontros.sql
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.reanalisacoes (id,user_id,context_version) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','teste'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','teste');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare a jsonb := '{"source_record_id":"r1","reanalysis_id":"10000000-0000-0000-0000-000000000001","sujeito":"cantar","relacao":"associado","objeto":"felicidade","evidencia":"canto e feliz","justificativa":"coocorrência","confianca_modelo":0.7,"fingerprint":"fp1","context_version":"teste","modelo":"ficticio"}'::jsonb;
 v_id uuid; v_n integer;
begin
 if public.dn_associacao_registrar(a) <> 'criada' then raise exception 'não criou'; end if;
 if public.dn_associacao_registrar(a || '{"sujeito":"música","fingerprint":"fp2"}'::jsonb) <> 'criada' then raise exception 'segunda associação não criada'; end if;
 select id into strict v_id from public.associacoes where fingerprint='fp1';
 perform public.dn_associacao_decidir(v_id,'rejeitar','decisão fictícia');
 if public.dn_associacao_registrar(a) <> 'reencontrada' then raise exception 'não reencontrou'; end if;
 select count(*) into v_n from public.associacoes where source_record_id='r1';
 if v_n <> 2 then raise exception 'duplicação'; end if;
 select count(*) into v_n from public.associacoes where id=v_id and estado_humano='rejeitada' and not uso_permitido and confianca_modelo=0.7;
 if v_n <> 1 then raise exception 'decisão alterada'; end if;
 select count(*) into v_n from public.associacao_historico where associacao_id=v_id and acao='reencontrada';
 if v_n <> 1 then raise exception 'reencontro ausente'; end if;
 begin
   perform public.dn_associacao_registrar(a || '{"reanalysis_id":"10000000-0000-0000-0000-000000000002"}'::jsonb);
   raise exception 'reanálise de outro usuário aceita';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
