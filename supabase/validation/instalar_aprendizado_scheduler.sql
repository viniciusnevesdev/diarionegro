-- Preparação para publicação; NÃO executado pela migration.
-- Requer pg_cron, pg_net e Vault já disponíveis no ambiente de validação.
-- Configure pelo Vault (fora deste arquivo):
-- dn_learning_url = URL completa de /functions/v1/aprender-registro
-- dn_learning_service_key = chave service_role; nunca disponibilize no frontend.
-- Executar somente após validar migration + Edge Function no ambiente escolhido.
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='dn_learning_url')
 or not exists(select 1 from vault.decrypted_secrets where name='dn_learning_service_key') then
   raise exception 'Configure os dois secrets no Vault antes de instalar o scheduler';
 end if;
end $$;
select cron.schedule('dn-aprendizado-continuo','* * * * *', $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='dn_learning_url'),
   headers := jsonb_build_object('Content-Type','application/json','Authorization',
     'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='dn_learning_service_key')),
   body := '{}'::jsonb, timeout_milliseconds := 120000)
 from generate_series(1,4)
 where exists(select 1 from public.aprendizado_fila where estado<>'concluido'
   and disponivel_em<=now() and (lease_ate is null or lease_ate<now()));
$job$);
