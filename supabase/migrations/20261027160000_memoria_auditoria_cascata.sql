-- Correção validada por exclusão de conta fictícia; não modifica dados existentes.
create or replace function public.dn_memoria_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  audit_action text := 'editada';
  old_value jsonb := null;
  new_value jsonb := null;
begin
  -- Durante a cascata de exclusão da conta não existe mais proprietário.
  if not exists (select 1 from auth.users where id = new.user_id) then return new; end if;
  if tg_op = 'INSERT' then
    audit_action := case when new.origem = 'importada' then 'importada' else 'criada' end;
    new_value := to_jsonb(new);
    insert into public.memoria_historico (user_id, memoria_id, acao, valor_novo, origem_da_acao)
      values (new.user_id, new.id, audit_action, new_value, coalesce(new.metadata_json->>'action_origin', 'sistema'));
    return new;
  end if;

  old_value := to_jsonb(old);
  new_value := to_jsonb(new);
  if old.deleted_at is null and new.deleted_at is not null then audit_action := 'excluida';
  elsif old.deleted_at is not null and new.deleted_at is null then audit_action := 'restaurada';
  elsif old.status <> 'conflitante' and new.status = 'conflitante' then audit_action := 'conflito_detectado';
  elsif old.status = 'conflitante' and new.status <> 'conflitante' then audit_action := 'conflito_resolvido';
  elsif old.merged_into is distinct from new.merged_into and new.merged_into is not null then audit_action := 'mesclada';
  elsif old.superseded_by is distinct from new.superseded_by and new.superseded_by is not null then audit_action := 'substituida';
  elsif old.ativa and not new.ativa then audit_action := 'desativada';
  elsif not old.ativa and new.ativa then audit_action := 'reativada';
  elsif not old.confirmed_by_user and new.confirmed_by_user then audit_action := 'confirmada';
  elsif old.confirmed_by_user and not new.confirmed_by_user then audit_action := 'desconfirmada';
  elsif old.texto is distinct from new.texto then audit_action := case when new.correction_reason is not null then 'corrigida' else 'editada' end;
  elsif old.categoria is distinct from new.categoria then audit_action := 'categoria_alterada';
  elsif old.tipo is distinct from new.tipo then audit_action := 'tipo_alterado';
  elsif old.confidence_current is distinct from new.confidence_current then audit_action := 'confianca_alterada';
  end if;

  insert into public.memoria_historico (user_id, memoria_id, acao, valor_anterior, valor_novo, motivo, origem_da_acao)
    values (new.user_id, new.id, audit_action, old_value, new_value,
      coalesce(new.correction_reason, new.disabled_reason), coalesce(new.metadata_json->>'action_origin', 'sistema'));
  return new;
end;
$$;

create or replace function public.dn_memoria_before_delete_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A exclusão da conta apaga também sua auditoria. Não criar órfãos nessa cascata.
  if exists (select 1 from auth.users where id = old.user_id) then
    insert into public.memoria_historico (user_id, memoria_id, acao, valor_anterior, origem_da_acao)
      values (old.user_id, old.id, 'excluida_permanentemente', to_jsonb(old), 'usuario');
  end if;
  return old;
end;
$$;
alter function public.dn_memoria_fonte_audit() security definer;
revoke insert on public.memoria_historico from public, anon, authenticated;
drop policy if exists memoria_historico_insert_own on public.memoria_historico;
revoke all on function public.dn_memoria_audit(), public.dn_memoria_fonte_audit(),
  public.dn_memoria_before_delete_audit(), public.dn_memoria_touch_updated_at() from public, anon, authenticated;
