-- SOMENTE PostgreSQL vazio e descartável; psql -X -v ON_ERROR_STOP=1 -f tests/etapa3_contexto_postgres.sql
begin;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
\ir ../supabase/migrations/20261024170000_create_memorias_governanca.sql
\ir ../supabase/migrations/20261024223500_create_reanalise_historica.sql
\ir ../supabase/migrations/20261027120000_create_associacoes_governanca.sql
\ir ../supabase/migrations/20261027140000_contexto_copiloto_autorizado.sql
\ir ../supabase/migrations/20261027150000_contexto_sem_exclusao_global.sql
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.memorias (user_id,texto,origem,status,ativa,confirmed_by_user,confirmed_at,fingerprint,canonical_key) values
 ('00000000-0000-0000-0000-000000000001','memória autorizada','ensinado_explicitamente','ativa',true,true,now(),'m1','m1'),
 ('00000000-0000-0000-0000-000000000001','memória não confirmada','registro_declaracao_clara','ativa',true,false,null,'m2','m2'),
 ('00000000-0000-0000-0000-000000000001','memória inativa','ensinado_explicitamente','desativada',false,true,now(),'m3','m3'),
 ('00000000-0000-0000-0000-000000000002','memória de outro','ensinado_explicitamente','ativa',true,true,now(),'m4','m4'),
 ('00000000-0000-0000-0000-000000000001','inferência confirmada','inferencia_ia_confirmada','ativa',true,true,now(),'m5','m5'),
 ('00000000-0000-0000-0000-000000000001','gosto de café','inferencia_ia_confirmada','ativa',true,true,now(),'m6','cafe'),
 ('00000000-0000-0000-0000-000000000001','inferência substituída','inferencia_ia_confirmada','substituida',false,true,now(),'m7','cafe');
insert into public.associacoes (id,user_id,source_record_id,sujeito,relacao,objeto,source_type,evidencia,justificativa,confianca_modelo,fingerprint,context_version) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','r1','a1','associado','b','teste','e','j',.5,'a1','teste'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','r1','a2','associado','b','teste','e','j',.5,'a2','teste'),
 ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','r1','a3','associado','b','teste','e','j',.5,'a3','teste'),
 ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','r1','a4','associado','b','teste','e','j',.5,'a4','teste'),
 ('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','r2','a5','associado','b','teste','e','j',.5,'a5','teste');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select public.dn_associacao_decidir('20000000-0000-0000-0000-000000000005','confirmar',null);
select public.dn_associacao_decidir('20000000-0000-0000-0000-000000000005','permitir_uso',null);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.dn_associacao_decidir('20000000-0000-0000-0000-000000000001','confirmar',null);
select public.dn_associacao_decidir('20000000-0000-0000-0000-000000000001','permitir_uso',null);
select public.dn_associacao_decidir('20000000-0000-0000-0000-000000000002','confirmar',null);
select public.dn_associacao_decidir('20000000-0000-0000-0000-000000000003','rejeitar',null);
do $$ declare ctx jsonb; n integer; begin
 ctx := public.dn_contexto_copiloto('interacao1','interpretar');
 if jsonb_array_length(ctx->'memorias') <> 3 or jsonb_array_length(ctx->'associacoes') <> 1 then raise exception 'filtros falharam: %',ctx; end if;
 if ctx::text like '%não confirmada%' or ctx::text like '%outro%' or ctx::text like '%inativa%' then raise exception 'memória bloqueada vazou'; end if;
 select count(*) into n from public.associacao_usos where interaction_id='interacao1' and associacao_id='20000000-0000-0000-0000-000000000001';
 if n <> 1 then raise exception 'uso não registrado'; end if;
 begin
  insert into public.associacao_usos(user_id,associacao_id,interaction_id) values (auth.uid(),'20000000-0000-0000-0000-000000000002','contorno');
  raise exception 'uso bloqueado aceito';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.memorias(user_id,texto,origem,status,ativa,confirmed_by_user,confirmed_at,fingerprint,canonical_key)
 values ('00000000-0000-0000-0000-000000000001','correção explícita: não gosto de café','correcao_explicitamente_lembrada','ativa',true,true,now(),'cor','cafe');
set local role authenticated;
do $$ declare ctx jsonb; begin
 ctx := public.dn_contexto_copiloto('interacao2','decidir_agora');
 if ctx->'memorias'->0->>'texto' <> 'correção explícita: não gosto de café' then raise exception 'prioridade falhou: %',ctx; end if;
 if ctx::text not like '%inferência confirmada%' or ctx::text not like '%gosto de café%' or jsonb_array_length(ctx->'associacoes') <> 1 then raise exception 'independentes omitidas: %',ctx; end if;
 if ctx::text like '%inferência substituída%' or ctx::text like '%não confirmada%' then raise exception 'memória bloqueada vazou: %',ctx; end if;
end $$;
rollback;
