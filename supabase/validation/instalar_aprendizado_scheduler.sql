-- Scheduler limitado a 1 chamada a cada 5 minutos, somente se houver trabalho devido.
-- Credencial exclusiva para o scheduler; nunca usa service_role nas tabelas Vault.
-- Requer Vault, pg_cron, pg_net e três secrets presentes:
-- dn_learning_url, dn_learning_anon_jwt, dn_learning_scheduler_key.
-- A Edge Function continua com verify_jwt=true; a segunda credencial privada
-- autoriza apenas o processamento da fila, não concede acesso à Data API.
begin;
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='cron' and p.proname='schedule')
 or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='net' and p.proname='http_post')
 or to_regclass('vault.decrypted_secrets') is null then
   raise exception 'Habilite pg_cron, pg_net e Vault antes de instalar o scheduler';
 end if;
 if (select count(*) from vault.decrypted_secrets
     where name in ('dn_learning_url','dn_learning_anon_jwt','dn_learning_scheduler_key')
       and nullif(trim(decrypted_secret),'') is not null) <> 3 then
   raise exception 'Configure os tres secrets no Vault antes de instalar o scheduler';
 end if;
end $$;
select cron.schedule('dn-aprendizado-continuo','*/5 * * * *', $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='dn_learning_url'),
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='dn_learning_anon_jwt'),
     'x-dn-scheduler',(select decrypted_secret from vault.decrypted_secrets where name='dn_learning_scheduler_key')),
   body := '{}'::jsonb, timeout_milliseconds := 120000)
 where exists(select 1 from public.aprendizado_fila where estado<>'concluido'
   and disponivel_em<=now() and (lease_ate is null or lease_ate<now()));
$job$);
commit;
