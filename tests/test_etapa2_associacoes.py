"""Testes locais com JavaScriptCore e cliente fictício; não testam PostgreSQL."""
import ctypes
import ctypes.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
JS = (ROOT / 'dn-memory-v083.js').read_text()
EDGE = (ROOT / 'supabase/functions/reanalisar-historico/index.ts').read_text()
SQL = (ROOT / 'supabase/migrations/20261027130000_associacoes_reencontros.sql').read_text()


class ReanalysisStaticTest(unittest.TestCase):
    def test_contract_and_safe_persistence(self):
        self.assertIn('associacoes:{type:"array",items:association}', EDGE)
        self.assertIn('não causal', EDGE)
        self.assertNotIn('window.DN_MEMORY.create(', JS)
        self.assertNotIn('window.DN_MEMORY.createCandidate(', JS)
        self.assertIn('on conflict (user_id, source_record_id, fingerprint) do nothing', SQL)
        self.assertIn("'reencontrada', 'reanalisacao_historica'", SQL)
        self.assertNotIn('update public.associacoes', SQL.lower())
        self.assertIn('r.id = v_run and r.user_id = v_user', SQL)
        self.assertIn("context_version:VERSION+'-fallback'", JS)
        self.assertLess(JS.index('await saveAssociations(rows[i]'), JS.index('await saveSnapshot(rows[i]'))


class JavaScriptCoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = ctypes.util.find_library('javascriptcoregtk-4.1') or ctypes.util.find_library('javascriptcoregtk-6.0')
        if not path:
            raise unittest.SkipTest('JavaScriptCore indisponível')
        cls.lib = ctypes.CDLL(path)
        for fn in ('JSGlobalContextCreate', 'JSStringCreateWithUTF8CString'):
            getattr(cls.lib, fn).restype = ctypes.c_void_p
        cls.lib.JSGlobalContextCreate.argtypes = [ctypes.c_void_p]
        cls.lib.JSStringCreateWithUTF8CString.argtypes = [ctypes.c_char_p]
        cls.lib.JSEvaluateScript.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)]
        cls.lib.JSEvaluateScript.restype = ctypes.c_void_p
        cls.lib.JSValueToStringCopy.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        cls.lib.JSValueToStringCopy.restype = ctypes.c_void_p
        cls.lib.JSStringGetMaximumUTF8CStringSize.argtypes = [ctypes.c_void_p]
        cls.lib.JSStringGetMaximumUTF8CStringSize.restype = ctypes.c_size_t
        cls.lib.JSStringGetUTF8CString.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
        cls.lib.JSStringRelease.argtypes = [ctypes.c_void_p]
        cls.lib.JSGlobalContextRelease.argtypes = [ctypes.c_void_p]

    def setUp(self):
        self.ctx = self.lib.JSGlobalContextCreate(None)

    def tearDown(self):
        self.lib.JSGlobalContextRelease(self.ctx)

    def evaluate(self, text):
        code = self.lib.JSStringCreateWithUTF8CString(text.encode())
        exc = ctypes.c_void_p()
        value = self.lib.JSEvaluateScript(self.ctx, code, None, None, 1, ctypes.byref(exc))
        self.lib.JSStringRelease(code)
        result = self.lib.JSValueToStringCopy(self.ctx, exc if exc.value else value, None)
        size = self.lib.JSStringGetMaximumUTF8CStringSize(result)
        buf = ctypes.create_string_buffer(size)
        self.lib.JSStringGetUTF8CString(result, buf, size)
        self.lib.JSStringRelease(result)
        text = buf.value.decode()
        if exc.value:
            self.fail(text)
        return text

    def test_complete_script_parses(self):
        import json
        self.assertEqual(self.evaluate('new Function(' + json.dumps(JS) + '); "ok"'), 'ok')

    def test_multiple_associations_reencounter_and_invalid_evidence(self):
        functions = JS[JS.index('  function normalizeAssociationPart'):JS.index('  async function latestRun')]
        # Digest simulado: verifica normalização/fluxo, não implementação criptográfica do navegador.
        harness = '''
        class TextEncoder { encode(s) { return Array.from(s, c => c.charCodeAt(0)); } }
        globalThis.crypto = {subtle:{digest: async (_alg, b) => { let h=0; for(const x of b) h=(h*31+x)>>>0; return new Uint8Array([h>>>24,h>>>16,h>>>8,h]); }}};
        const db = new Map(); const calls=[];
        function client(){return {rpc:async (_name,{p_associacao:a})=>{calls.push(a); const k=a.source_record_id+'|'+a.fingerprint; if(db.has(k)) return {data:'reencontrada'}; db.set(k,{estado:'em_observacao',uso:false}); return {data:'criada'};}};}
        ''' + functions + '''
        globalThis.result='pendente';
        (async()=>{
          const record={id:'r1',texto_original:'cantando e feliz, ouvindo música'};
          const item={sujeito:'Cantar',relacao:'parece associado',objeto:'feliz',evidencia:'cantando e feliz',justificativa:'coocorrência',confianca:.7};
          const item2={...item,sujeito:'Ouvir música',evidencia:'ouvindo música'};
          const first=await saveAssociations(record,{associacoes:[item,item2]},'run','modelo','v2');
          const saved=Array.from(db.values())[0]; saved.estado='rejeitada';
          const repeat=await saveAssociations(record,{associacoes:[{...item,sujeito:'  CANTAR  '}]},'run2','modelo','v2');
          let invalid=false; try{await saveAssociations(record,{associacoes:[{...item,evidencia:'inventada'}]},'run','modelo','v2');}catch(e){invalid=true;}
          result=JSON.stringify({first,repeat,size:db.size,state:saved.estado,uso:saved.uso,invalid,calls:calls.length,record:record.texto_original});
        })().catch(e=>result='ERRO:'+e);
        '''
        self.evaluate(harness)
        result = self.evaluate('result')
        import json
        data = json.loads(result)
        self.assertEqual(data['first'], {'created': 2, 'found': 0})
        self.assertEqual(data['repeat'], {'created': 0, 'found': 1})
        self.assertEqual((data['size'], data['state'], data['uso']), (2, 'rejeitada', False))
        self.assertTrue(data['invalid'])
        self.assertEqual(data['calls'], 3)
        self.assertEqual(data['record'], 'cantando e feliz, ouvindo música')


if __name__ == '__main__':
    unittest.main()
