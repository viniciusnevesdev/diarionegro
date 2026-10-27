import json
import pathlib
from js_runtime import evaluate_browser, parse_browser
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = "supabase/migrations/20261024170000_create_memorias_governanca.sql"


class V082MemoryTests(unittest.TestCase):
    def read(self, path):
        return (ROOT / path).read_text(encoding="utf-8")

    def run_memory_js(self, expression):
        return evaluate_browser(ROOT / 'dn-memory.js', expression)

    def test_all_browser_javascript_parses(self):
        for filename in ['app.js', 'dn-interpretations.js', 'dn-memory.js', 'copiloto.js', 'dn-ai.js', 'settings.js']:
            parse_browser(ROOT / filename)

    def test_schema_has_memory_sources_history_and_usage(self):
        sql = self.read(MIGRATION).lower()
        for table in ["public.memorias", "public.memoria_fontes", "public.memoria_historico", "public.memoria_usos"]:
            self.assertIn(f"create table if not exists {table}", sql)
        for field in ["source_record_id", "confidence_initial", "confidence_current", "fingerprint", "canonical_key", "deleted_at", "merged_into"]:
            self.assertIn(field, sql)

    def test_rls_and_ownership_are_enforced_on_every_personal_table(self):
        sql = self.read(MIGRATION).lower()
        for table in ["memorias", "memoria_fontes", "memoria_historico", "memoria_usos"]:
            self.assertIn(f"alter table public.{table} enable row level security", sql)
            self.assertIn(f'policy "{table}_select_own"', sql)
        self.assertGreaterEqual(sql.count("using ((select auth.uid()) = user_id)"), 4)
        self.assertGreaterEqual(sql.count("with check ((select auth.uid()) = user_id)"), 4)
        self.assertIn("foreign key (memoria_id, user_id)", sql)
        self.assertNotIn("to anon", sql)

    def test_inference_is_inactive_until_confirmation(self):
        value = self.run_memory_js(
            "window.DN_MEMORY.sanitizedMemory({texto:'Prefiro comprar à noite',tipo:'preferencia',origem:'inferencia_ia_nao_confirmada',ativa:true,confirmed_by_user:true,confianca:.8})"
        )
        self.assertEqual(value["status"], "aguardando_confirmacao")
        self.assertFalse(value["ativa"])
        self.assertFalse(value["confirmed_by_user"])

    def test_normalization_and_fingerprint_detect_exact_duplicate(self):
        values = self.run_memory_js(
            "[window.DN_MEMORY.fingerprint('Minha chave fica na gaveta.'),window.DN_MEMORY.fingerprint('  MINHA CHAVE fica na gaveta  ')]"
        )
        self.assertEqual(values[0], values[1])
        memory = self.read("dn-memory.js")
        self.assertIn("findDuplicate(memory", memory)
        self.assertIn("relation_type: options.source.relation_type || 'reforco'", memory)

    def test_conflict_subject_key_and_explicit_priority(self):
        keys = self.run_memory_js(
            "[window.DN_MEMORY.canonicalKey('Minha chave fica na gaveta','objeto_lugar'),window.DN_MEMORY.canonicalKey('Agora estou deixando minha chave na mesa','objeto_lugar')]"
        )
        self.assertEqual(keys[0], keys[1])
        memory = self.read("dn-memory.js")
        self.assertIn("explicitPriority", memory)
        self.assertIn("status: 'substituida'", memory)
        self.assertIn("status = 'conflitante'", self.read(MIGRATION))

    def test_inactive_deleted_and_unconfirmed_do_not_enter_context(self):
        memory = self.read("dn-memory.js")
        context = memory[memory.index("async function contextRules"):memory.index("async function recordUses")]
        self.assertIn(".in('status', ACTIVE_STATUSES)", context)
        self.assertIn(".eq('ativa', true)", context)
        self.assertIn(".is('deleted_at', null)", context)
        self.assertIn("item.origem !== 'inferencia_ia_nao_confirmada'", context)

    def test_lifecycle_and_audit_cover_edit_disable_delete_restore_merge(self):
        memory = self.read("dn-memory.js")
        sql = self.read(MIGRATION)
        for operation in ["confirm", "unconfirm", "disable", "reactivate", "softDelete", "restore", "permanentDelete", "merge"]:
            self.assertIn(operation, memory)
        for action in ["'editada'", "'desativada'", "'excluida'", "'restaurada'", "'mesclada'", "'excluida_permanentemente'"]:
            self.assertIn(action, sql)

    def test_provenance_and_multiple_sources_are_user_visible(self):
        memory = self.read("dn-memory.js")
        self.assertIn("Por que você sabe disso?", memory)
        self.assertIn("Onde isso apareceu?", memory)
        self.assertIn("Abrir registro original", memory)
        self.assertIn("memoria_fontes", memory)
        self.assertIn("relation_type", memory)

    def test_search_filters_sort_and_mobile_ui_are_present(self):
        memory = self.read("dn-memory.js")
        css = self.read("dn-memory.css")
        for token in ["dnMemorySearch", "dnMemoryStatus", "dnMemoryType", "dnMemoryOrigin", "dnMemoryConfirmed", "dnMemoryHasSource", "dnMemoryMinConfidence", "dnMemoryDateFrom", "dnMemorySort"]:
            self.assertIn(token, memory)
        self.assertIn("PAGE_SIZE = 30", memory)
        self.assertIn("@media (max-width: 390px)", css)
        self.assertNotIn("hover", css)

    def test_export_json_markdown_and_safe_import_preview(self):
        memory = self.read("dn-memory.js")
        self.assertIn("diario-negro-memorias-v1", memory)
        self.assertIn("exportMarkdown", memory)
        self.assertIn("validateImport", memory)
        self.assertIn("previewImport", memory)
        self.assertIn("Nada será persistido antes de você confirmar", memory)
        invalid = self.run_memory_js("window.DN_MEMORY.validateImport({format:'errado',memories:[]}).valid")
        self.assertFalse(invalid)

    def test_base_context_is_separate(self):
        memory = self.read("dn-memory.js")
        edge = self.read("supabase/functions/copiloto/index.ts")
        self.assertIn("BASE_CONTEXT_RULES", memory)
        self.assertIn("Regras de produto, separadas das memórias", memory)
        self.assertIn("const BASE_CONTEXT", edge)

    def test_copilot_creates_candidates_corrections_and_records_usage(self):
        copilot = self.read("copiloto.js")
        self.assertIn("origem: 'inferencia_ia_nao_confirmada'", copilot)
        self.assertIn("rememberCorrectionWithFallback", copilot)
        self.assertIn("insert into public.memoria_usos", self.read("supabase/migrations/20261027140000_contexto_copiloto_autorizado.sql"))
        self.assertIn("if (input.origem === 'inferencia_ia_nao_confirmada') return null", copilot)
        self.assertIn("data-save-memory=\"${originalIndex}\"", copilot)

    def test_legacy_migration_preserves_text_dates_sources_and_neutral_confidence(self):
        memory = self.read("dn-memory.js")
        migration = memory[memory.index("async function migrateLegacy"):memory.index("function download")]
        self.assertIn("first_learned_at: row.registrado_em", migration)
        self.assertIn("origem: 'migrada_sistema_antigo'", migration)
        self.assertIn("confianca: 0.5", migration)
        self.assertIn("record_id: row.id", migration)

    def test_existing_tasks_emotions_decide_now_and_interpretation_remain(self):
        app = self.read("app.js")
        copilot = self.read("copiloto.js")
        edge = self.read("supabase/functions/copiloto/index.ts")
        self.assertIn("window.DN_APP_API.createTaskFromAI", app)
        self.assertIn("loadRecentEmotions", copilot)
        self.assertIn('modo === "decidir_agora"', edge)
        self.assertIn("DN_INTERPRETATIONS?.persist", copilot)

    def test_no_remote_or_secret_action_was_added(self):
        changed = "\n".join(self.read(path) for path in ["dn-memory.js", MIGRATION])
        self.assertNotIn("service_role", changed.lower())
        self.assertNotIn("supabase db push", changed.lower())
        self.assertNotIn("supabase functions deploy", changed.lower())
        self.assertIn("não aplicar no projeto remoto sem aprovação explícita", changed.lower())


if __name__ == "__main__":
    unittest.main()
