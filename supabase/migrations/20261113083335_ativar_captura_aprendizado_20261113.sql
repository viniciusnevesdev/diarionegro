do $activate$
declare state_before text; state_after text;
begin
  perform set_config('lock_timeout','3s',true);
  select tgenabled::text into state_before from pg_trigger
  where tgrelid='public.registros'::regclass and tgname='aprendizado_registro';
  if state_before is distinct from 'D' then
    raise exception 'Estado inesperado do trigger: %', state_before;
  end if;
  if exists(select 1 from public.aprendizado_fila where estado<>'concluido') then
    raise exception 'Existem trabalhos pendentes; ativacao cancelada';
  end if;
  if (select count(*) from vault.secrets where name in
      ('dn_learning_url','dn_learning_anon_jwt','dn_learning_scheduler_key'))<>3 then
    raise exception 'Segredos Vault incompletos';
  end if;
  if not exists(select 1 from cron.job
    where jobname='dn-aprendizado-continuo' and active
      and schedule='*/5 * * * *') then
    raise exception 'Scheduler nao validado';
  end if;
  execute 'alter table public.registros enable trigger aprendizado_registro';
  select tgenabled::text into state_after from pg_trigger
  where tgrelid='public.registros'::regclass and tgname='aprendizado_registro';
  if state_after is distinct from 'O' then
    raise exception 'Falha ao habilitar trigger: %', state_after;
  end if;
end
$activate$;
