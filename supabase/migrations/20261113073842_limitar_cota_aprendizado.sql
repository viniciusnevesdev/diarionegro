-- Limite global de chamadas à IA, independente de usuário e de workers concorrentes.
-- A cota conta tentativas antes da chamada externa, inclusive falhas e retentativas.
create table public.aprendizado_cota_diaria (
  dia date primary key,
  chamadas integer not null default 0 check (chamadas >= 0),
  atualizado_em timestamptz not null default now()
);
alter table public.aprendizado_cota_diaria enable row level security;
revoke all on public.aprendizado_cota_diaria from public, anon, authenticated;
grant select, insert, update on public.aprendizado_cota_diaria to service_role;

create function public.dn_aprendizado_reservar_cota(p_limite integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_dia date := (now() at time zone 'UTC')::date;
declare v_count integer;
begin
  if p_limite is null or p_limite < 1 or p_limite > 20 then return false; end if;
  insert into public.aprendizado_cota_diaria(dia, chamadas) values(v_dia,0)
    on conflict(dia) do nothing;
  update public.aprendizado_cota_diaria
  set chamadas=chamadas+1, atualizado_em=now()
  where dia=v_dia and chamadas < p_limite
  returning chamadas into v_count;
  return v_count is not null;
end $$;

revoke all on function public.dn_aprendizado_reservar_cota(integer)
from public, anon, authenticated;
grant execute on function public.dn_aprendizado_reservar_cota(integer)
to service_role;
