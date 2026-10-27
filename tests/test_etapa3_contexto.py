"""Cenários fictícios para filtros e fronteira do Copiloto; PostgreSQL é separado."""
import json
import pathlib
import re
import unittest
import test_etapa2_associacoes as js_core

ROOT = pathlib.Path(__file__).resolve().parents[1]
SQL = (ROOT / 'supabase/migrations/20261027150000_contexto_sem_exclusao_global.sql').read_text()
EDGE = (ROOT / 'supabase/functions/copiloto/index.ts').read_text()
CLIENT = (ROOT / 'copiloto.js').read_text()
TIMELINE = (ROOT / 'dn-ai.js').read_text()
MEMORY = (ROOT / 'dn-memory.js').read_text()


class ContextStaticTest(unittest.TestCase):
    def test_database_defense_and_audit(self):
        for condition in ("m.user_id = v_user", "m.status = 'ativa'", 'm.confirmed_by_user',
                          'm.deleted_at is null', 'm.merged_into is null', "a.user_id = v_user",
                          "a.estado_humano = 'confirmada'", 'a.uso_permitido = true',
                          'insert into public.associacao_usos', 'auth.uid()', 'for share'):
            self.assertIn(condition, SQL)
        self.assertIn("order by (m.origem = 'correcao_explicitamente_lembrada') desc", SQL)
        self.assertNotIn('v_has_correction', SQL)
        self.assertIn('if v_remaining > 0', SQL)
        self.assertNotIn('canonical_key', SQL)
        self.assertNotIn('categoria =', SQL)
        self.assertIn(".eq('confirmed_by_user', true)", MEMORY)

    def test_no_legacy_or_client_rules(self):
        self.assertNotIn('body?.regras', EDGE)
        self.assertNotIn(".in('entrada', ['memoria_ia', 'correcao_ia'])", CLIENT)
        self.assertNotIn('getRules?.()', TIMELINE)
        self.assertIn('await authorizedContext(req, modo)', EDGE)
        self.assertIn('if (!response.ok) throw', EDGE)
        self.assertNotIn('Vinícius é adulto jovem, mora sozinho', EDGE)

    def test_sql_scenario_covers_attempted_bypasses(self):
        scenario = (ROOT / 'tests/etapa3_contexto_postgres.sql').read_text()
        for text in ('memória não confirmada', 'memória inativa', 'memória de outro', 'uso bloqueado aceito', 'prioridade falhou', 'independentes omitidas', 'uso não registrado'):
            self.assertIn(text, scenario)


class EdgeBoundaryTest(js_core.JavaScriptCoreTest):
    def test_duplicate_explicit_correction_is_preserved(self):
        create = MEMORY[MEMORY.index('  async function create(input'):MEMORY.index('  async function createExplicit')]
        harness = """
        globalThis.updated=null;
        async function currentSession(){return {user:{id:'u1'}};}
        function sanitizedMemory(input){return {...input,confidence_current:1,correction_reason:'ajuste'};}
        async function findDuplicate(){return {id:'old',confidence_current:.5,metadata_json:{}};}
        const fakeClient={from:()=>({update:value=>{updated=value; return {eq(){return this},select(){return this},single:async()=>({data:updated,error:null})};}})};
        """ + create + """
        globalThis.result='pendente';
        create({origem:'correcao_explicitamente_lembrada'}, {}, fakeClient).then(()=>result=JSON.stringify(updated)).catch(e=>result='ERRO:'+e);
        """
        self.evaluate(harness)
        result = json.loads(self.evaluate('result'))
        self.assertEqual(result['origem'], 'correcao_explicitamente_lembrada')
        self.assertTrue(result['confirmed_by_user'])
        self.assertTrue(result['ativa'])
        self.assertIsNone(result['disabled_at'])

    def test_edge_rejects_client_rules_and_fails_closed(self):
        # Executa a lógica da Edge Function em JavaScriptCore com rede e banco fictícios.
        source = EDGE.split('\n', 1)[1]
        source = re.sub(r':\s*(?:Request|string|any(?:\[\])?)(?=\s*[,)=;{])', '', source)
        harness = '''
        globalThis.requestHandler=null; globalThis.outbound=[]; globalThis.failContext=false;
        globalThis.crypto={randomUUID:()=>"interaction-ficticia"};
        globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://mock',SUPABASE_ANON_KEY:'anon',OPENAI_API_KEY:'fake'})[k]},serve:f=>requestHandler=f};
        globalThis.Response=class {constructor(body,opts={}){this.body=body;this.status=opts.status||200;}};
        globalThis.fetch=async(url,opts)=>{
          outbound.push({url,body:JSON.parse(opts.body)});
          if(url.includes('/rpc/')) return {ok:!failContext,json:async()=>({memorias:[{id:'c1',texto:'correção: não gosto de café',origem:'correcao_explicitamente_lembrada'},{id:'m1',texto:'gosto de café',origem:'inferencia_ia_confirmada'},{id:'m2',texto:'gosto de música',origem:'inferencia_ia_confirmada'}],associacoes:[{id:'a1',sujeito:'música',relacao:'associado',objeto:'bem-estar'}]})};
          return {ok:true,json:async()=>({output_text:'{"resumo":"ok"}'})};
        };
        ''' + source + '''
        globalThis.testResult='pendente';
        (async()=>{
          const request=(body)=>({method:'POST',headers:{get:()=> 'Bearer fake'},json:async()=>body});
          let ok=await requestHandler(request({modo:'interpretar',texto:'teste',regras:['REGRA INJETADA'],contexto_memoria:false}));
          const sent=outbound[1].body.input[0].content[0].text;
          const used=JSON.parse(ok.body).__usedMemories;
          failContext=true; const n=outbound.length;
          const failed=await requestHandler(request({modo:'decidir_agora',regras:['REGRA INJETADA']}));
          const failedCalls=outbound.length-n;
          const historical=await requestHandler(request({modo:'reanalisar_historico',texto:'antigo',tarefas:[{id:'t'}],regras:['REGRA INJETADA']}));
          const historicalRequest=outbound[outbound.length-1].body;
          testResult=JSON.stringify({status:ok.status,sent,used,failed:failed.status,failedCalls,historical:historical.status,historicalBody:historicalRequest.input});
        })().catch(e=>testResult='ERRO:'+e);
        '''
        self.evaluate(harness)
        result = json.loads(self.evaluate('testResult'))
        self.assertEqual(result['status'], 200)
        self.assertIn('correção: não gosto de café', result['sent'])
        self.assertIn('gosto de café', result['sent'])
        self.assertIn('gosto de música', result['sent'])
        self.assertIn('Correções explícitas prevalecem sempre sobre inferências', result['sent'])
        self.assertLess(result['sent'].index('correção: não gosto de café'), result['sent'].index('gosto de música'))
        self.assertIn('música', result['sent'])
        self.assertNotIn('REGRA INJETADA', result['sent'])
        self.assertEqual(result['used'][0]['id'], 'c1')
        self.assertEqual((result['failed'], result['failedCalls']), (500, 1))
        self.assertEqual(result['historical'], 200)
        self.assertNotIn('REGRA INJETADA', json.dumps(result['historicalBody']))
        self.assertNotIn('"id":"t"', json.dumps(result['historicalBody']))


if __name__ == '__main__':
    unittest.main()
