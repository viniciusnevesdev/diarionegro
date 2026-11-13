-- Espelho historico exato da contencao aplicada no Supabase em 13/11/2026.
-- Projeto htaflxymnkdretchfskn; migration remota 20261113065053.
-- Nao reexecutar em producao. Guarda impede sobrescrever alteracoes inesperadas.
-- Nenhum registro, memoria, fila ou funcao e excluido.
DO $contain$
DECLARE
  v_current text;
  v_original_predicate text := $predicate$(m.confirmed_by_user or (m.origem='registro_declaracao_clara'
        and m.metadata_json->>'aprendizado_automatico'='true' and m.confidence_current>=0.9))$predicate$;
  v_trigger_state text;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  SELECT tgenabled::text INTO v_trigger_state
    FROM pg_trigger WHERE tgrelid='public.registros'::regclass AND tgname='aprendizado_registro';
  IF v_trigger_state IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'Cancelado: estado do trigger mudou (%)', v_trigger_state;
  END IF;
  v_current := pg_get_functiondef('public.dn_contexto_copiloto(text,text)'::regprocedure);
  IF md5(v_current) <> '6b7a1eecd944b7fb761c459e3a141a03' THEN
    RAISE EXCEPTION 'Cancelado: definicao do contexto mudou; revisar novamente';
  END IF;
  IF strpos(v_current, v_original_predicate) = 0 OR
     length(v_current) - length(replace(v_current, v_original_predicate, '')) <> length(v_original_predicate) THEN
    RAISE EXCEPTION 'Cancelado: predicado inesperado';
  END IF;
  EXECUTE 'ALTER TABLE public.registros DISABLE TRIGGER aprendizado_registro';
  EXECUTE replace(v_current, v_original_predicate, 'm.confirmed_by_user');
  IF (SELECT tgenabled::text FROM pg_trigger
      WHERE tgrelid='public.registros'::regclass AND tgname='aprendizado_registro') IS DISTINCT FROM 'D' THEN
    RAISE EXCEPTION 'Cancelado: trigger nao ficou desabilitado';
  END IF;
END
$contain$;
