-- Retencao minima: documentos originais e evidencias ficam nas tabelas proprias.
-- A fila e apenas transporte; limpar duplicatas textuais depois da conclusao.
-- Nenhuma entrada pendente/processando e modificada.
create function public.dn_aprendizado_redigir_concluido()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.estado = 'concluido' then
    new.texto := '';
    new.resultado := null;
    new.erro := null;
  end if;
  return new;
end; $$;

revoke all on function public.dn_aprendizado_redigir_concluido() from public, anon, authenticated;

create trigger aprendizado_fila_redigir_concluido
before insert or update on public.aprendizado_fila
for each row execute function public.dn_aprendizado_redigir_concluido();

-- Saneamento dos trabalhos ja concluidos, sem apagar status, origem ou auditoria.
update public.aprendizado_fila
set texto = '', resultado = null, erro = null
where estado = 'concluido'
  and (texto <> '' or resultado is not null or erro is not null);
