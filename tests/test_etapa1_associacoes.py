"""Verificações estáticas da migration; não substituem testes PostgreSQL/RLS."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SQL = (ROOT / 'supabase/migrations/20261027120000_create_associacoes_governanca.sql').read_text()


class AssociacoesSchemaTest(unittest.TestCase):
    def test_tables_rls_and_owner_keys(self):
        for table in ('associacoes', 'associacao_historico', 'associacao_usos'):
            self.assertIn(f'create table public.{table}', SQL)
            self.assertIn(f'alter table public.{table} enable row level security', SQL)
            self.assertIn(f'create policy {table}_select_own', SQL)
        self.assertIn('foreign key (associacao_id, user_id)', SQL)
        self.assertIn('foreign key (reanalysis_id, user_id)', SQL)

    def test_safe_state_and_duplicate_constraints(self):
        self.assertIn("default 'em_observacao'", SQL)
        self.assertIn("('em_observacao', 'confirmada', 'rejeitada')", SQL)
        self.assertIn('uso_permitido boolean not null default false', SQL)
        self.assertIn("not uso_permitido or estado_humano = 'confirmada'", SQL)
        self.assertIn('unique (user_id, source_record_id, fingerprint)', SQL)
        self.assertIn("a.estado_humano = 'confirmada' and a.uso_permitido", SQL)
        self.assertIn('a.user_id = associacao_usos.user_id', SQL)

    def test_audit_actions_and_access(self):
        for action in ('criada', 'reencontrada', 'confirmada', 'rejeitada', 'em_observacao', 'uso_permitido', 'uso_bloqueado'):
            self.assertIn("'" + action + "'", SQL)
        self.assertIn('after insert or update on public.associacoes', SQL)
        self.assertNotIn('grant delete', SQL)

    def test_writes_require_explicit_decision_and_audit_is_protected(self):
        self.assertNotIn('grant select, insert on public.associacao_historico', SQL)
        self.assertNotIn('associacao_historico_insert_own', SQL)
        self.assertNotIn('grant select, insert, update on public.associacoes', SQL)
        self.assertIn('language plpgsql security definer set search_path', SQL)
        self.assertIn('where id = p_associacao_id and user_id = v_user_id for update', SQL)
        self.assertIn('grant execute on function public.dn_associacao_decidir', SQL)
        self.assertIn('new.source_record_id, new.reanalysis_id', SQL)
        self.assertIn('old.source_record_id, old.reanalysis_id', SQL)
        self.assertIn('references public.reanalisacoes(id, user_id) on delete no action deferrable initially deferred', SQL)

    def test_database_scenario_includes_attempted_violations(self):
        scenario = (ROOT / 'tests/etapa1_associacoes_postgres.sql').read_text()
        for phrase in ('inserção arbitrária no histórico permitida', 'confirmação direta permitida',
                       'alteração de origem permitida', 'decisão entre usuários permitida',
                       'duplicata permitida', 'trigger de imutabilidade falhou',
                       'exclusão isolada de reanálise permitida', 'referência cruzada permitida',
                       'cascata de conta incompleta'):
            self.assertIn(phrase, scenario)
        self.assertIn('rollback;', scenario)


if __name__ == '__main__':
    unittest.main()
