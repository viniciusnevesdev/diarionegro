import pathlib
import subprocess
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class V081Tests(unittest.TestCase):
    def read(self, path):
        return (ROOT / path).read_text(encoding="utf-8")

    def test_browser_javascript_parses(self):
        parser = (
            "ObjC.import('Foundation');"
            "function run(argv){"
            "const s=$.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null).js;"
            "new Function(s); return 'ok';}"
        )
        for filename in ["app.js", "dn-interpretations.js", "copiloto.js", "dn-ai.js"]:
            result = subprocess.run(
                ["osascript", "-l", "JavaScript", "-e", parser, str(ROOT / filename)],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, f"{filename}: {result.stderr}")

    def test_migration_has_owner_rls_and_minimum_grants(self):
        sql = self.read("supabase/migrations/20261024140000_create_interpretacoes.sql").lower()
        self.assertIn("unique (user_id, record_id)", sql)
        self.assertIn("enable row level security", sql)
        self.assertIn("grant select, insert, update", sql)
        self.assertNotIn("grant delete", sql)
        self.assertIn("using ((select auth.uid()) = user_id)", sql)
        self.assertIn("with check ((select auth.uid()) = user_id)", sql)

    def test_interpretation_contract_covers_events_category_and_task_actions(self):
        edge = self.read("supabase/functions/copiloto/index.ts")
        for field in ['"subcategoria"', '"eventos"', '"acoes_tarefas"']:
            self.assertIn(field, edge)
        self.assertIn('enum: ["iniciar","concluir","editar"]', edge)
        self.assertIn('“comecei a tomar banho” vira Banho/iniciado', edge)
        self.assertIn('“terminei o banho” vira Banho/concluído', edge)
        self.assertIn("única fonte válida de task_id", edge)
        self.assertIn("NÃO replique essa pendência em tarefas[]", edge)

    def test_normal_mode_sends_real_open_tasks_time_and_timezone(self):
        shared = self.read("dn-interpretations.js")
        copilot = self.read("copiloto.js")
        timeline = self.read("dn-ai.js")
        self.assertIn("task.status !== 'done'", shared)
        self.assertIn("id: String(task.id)", shared)
        self.assertIn("agora: new Date().toISOString()", shared)
        self.assertIn("resolvedOptions().timeZone", shared)
        self.assertIn("...interpretationContext()", copilot)
        self.assertIn("DN_INTERPRETATIONS?.requestContext", timeline)

    def test_task_actions_require_received_id_and_high_confidence(self):
        shared = self.read("dn-interpretations.js")
        self.assertIn("const AUTO_ACTION_CONFIDENCE = 0.85", shared)
        self.assertIn("available.has(taskId)", shared)
        self.assertIn("confidence >= AUTO_ACTION_CONFIDENCE", shared)
        self.assertIn("window.DN_APP_API.completeTask(taskId)", shared)
        self.assertIn("window.DN_APP_API.startTask(taskId)", shared)
        self.assertIn("window.DN_APP_API.editTask(taskId", shared)

        behavior = (
            "ObjC.import('Foundation');"
            "function run(argv){"
            "globalThis.window={DN_APP_API:{getTasks:()=>[{id:'task-real',title:'Pegar receitas no médico',status:'open'},{id:'task-done',title:'Resolvida',status:'done'}]}};"
            "const s=$.NSString.stringWithContentsOfFileEncodingError(argv[0],$.NSUTF8StringEncoding,null).js;eval(s);"
            "const p=window.DN_INTERPRETATIONS.planTaskActions({acoes_tarefas:["
            "{acao:'concluir',task_id:'task-real',novo_titulo:'',confianca:.96},"
            "{acao:'concluir',task_id:'invented',novo_titulo:'',confianca:.99},"
            "{acao:'concluir',task_id:'task-done',novo_titulo:'',confianca:.99},"
            "{acao:'editar',task_id:'task-real',novo_titulo:'',confianca:.99}"
            "]});return JSON.stringify(p.map(x=>x.valid));}"
        )
        result = subprocess.run(
            ["osascript", "-l", "JavaScript", "-e", behavior, str(ROOT / "dn-interpretations.js")],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "[true,false,false,false]")

    def test_new_task_flow_is_preserved(self):
        copilot = self.read("copiloto.js")
        timeline = self.read("dn-ai.js")
        self.assertIn("window.DN_APP_API.createTaskFromAI", copilot)
        self.assertIn("sourceRecordId: sourceId", copilot)
        self.assertIn("createTask({ sourceRecordId: id", timeline)

    def test_persisted_interpretation_is_loaded_without_reapplying_effects(self):
        shared = self.read("dn-interpretations.js")
        timeline = self.read("dn-ai.js")
        self.assertIn(".from('interpretacoes')", shared)
        self.assertIn(".eq('user_id', session.user.id)", shared)
        self.assertIn("onConflict: 'user_id,record_id'", shared)
        persisted_branch = timeline[timeline.index("if (persisted && button.dataset.force !== '1')"):]
        persisted_branch = persisted_branch[:persisted_branch.index("return;")]
        self.assertNotIn("syncTaskIfNeeded", persisted_branch)
        self.assertIn("button.textContent = 'Interpretar novamente'", persisted_branch)


if __name__ == "__main__":
    unittest.main()
