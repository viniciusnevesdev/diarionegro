-- Read-only catalog inspection. Run ONLY with separate authorization for target.
begin read only;
select current_database(), current_user, version();
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in
 ('registros','interpretacoes','memorias','memoria_fontes','memoria_historico','memoria_usos','reanalisacoes','interpretacoes_historico','associacoes','associacao_historico','associacao_usos')
order by table_name, ordinal_position;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public' order by tablename,policyname;
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('registros','memorias','associacoes','associacao_historico','associacao_usos');
select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text,conname;
select p.oid::regprocedure, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'dn_%' order by p.proname;
select grantee, table_name, privilege_type from information_schema.table_privileges
where table_schema='public' and table_name in ('associacoes','associacao_historico','associacao_usos','memoria_historico') order by table_name,grantee,privilege_type;
select to_regclass('supabase_migrations.schema_migrations') as migration_history;
rollback;
