"""Interface de associações com dados e Supabase fictícios; sem banco ou navegador."""
import json
import pathlib
import unittest
import test_etapa2_associacoes as js_core

ROOT = pathlib.Path(__file__).resolve().parents[1]
MEMORY = (ROOT / 'dn-memory.js').read_text()
REANALYSIS = (ROOT / 'dn-memory-v083.js').read_text()
CSS = (ROOT / 'dn-memory-v083.css').read_text()


class StaticUiTest(unittest.TestCase):
    def test_section_loading_errors_and_explicit_actions(self):
        for text in ('id="dnAssociationsSection"', 'Carregando associações…', 'Nenhuma associação ainda.',
                     'PGRST202', '42883', 'data-association-source', 'dn:open-record',
                     "window.confirm(ASSOCIATION_ACTIONS[action])", "client.rpc('dn_associacao_decidir'", 'associationBusy'):
            self.assertIn(text, MEMORY)
        for action in ('confirmar', 'rejeitar', 'observar', 'permitir_uso', 'bloquear_uso'):
            self.assertIn(action, MEMORY)
        self.assertNotIn("client.from('registros').update", MEMORY)
        self.assertIn('grid-template-columns: 1fr', CSS)
        self.assertIn('min-height: 44px', CSS)

    def test_reanalysis_counts_are_separate(self):
        for text in ('associacoesCriadas', 'associacoesReencontradas', 'associacoesIndisponiveis',
                     'associações novas', 'associações reencontradas', 'memórias criadas', 'Revisar associações'):
            self.assertIn(text, REANALYSIS)
        self.assertNotIn('Declarações claras podem virar memória', REANALYSIS)


class AssociationUiJsTest(js_core.JavaScriptCoreTest):
    def test_real_functions_with_mock_data(self):
        functions = MEMORY[MEMORY.index('  const ASSOCIATION_STATES'):MEMORY.index('  async function openPage()')]
        harness = '''
        const PAGE_SIZE=30;
        const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
        const formatDate=()=> 'data fictícia'; const confidencePercent=v=>Math.round(Number(v)*100)+'%';
        function isUnavailableError(e){return e.code==='PGRST205';}
        async function currentSession(){return {user:{id:'usuario-1'}};}
        let filters=[],rpcCalls=[];
        const client={from:(name)=>({select(){return this},eq(k,v){filters.push([name,k,v]);return this},order(){return this},range:async()=>({data:[{id:'a'}],count:1,error:null})}),rpc:async(n,p)=>{rpcCalls.push([n,p]);return {error:null}}};
        ''' + functions + '''
        globalThis.result='pendente';
        (async()=>{
          const common={id:'a1',sujeito:'<script>',relacao:'parece associado',objeto:'humor',source_record_id:'r1',source_type:'histórico',evidencia:'fictícia',justificativa:'coocorrência',confianca_modelo:.7,context_version:'v2'};
          const obs=associationCardHtml({...common,estado_humano:'em_observacao',uso_permitido:false});
          const confirmed=associationCardHtml({...common,estado_humano:'confirmada',uso_permitido:false});
          const allowed=associationCardHtml({...common,estado_humano:'confirmada',uso_permitido:true});
          const rejected=associationCardHtml({...common,estado_humano:'rejeitada',uso_permitido:false});
          const unknown=associationCardHtml({...common,estado_humano:'desconhecido',uso_permitido:true});
          const list=await listAssociations(0,client);
          await decideAssociation('a1','confirmar',client);
          let invalid=false;try{await decideAssociation('a1','delete',client)}catch(e){invalid=true;}
          result=JSON.stringify({obs,confirmed,allowed,rejected,unknown,list,filters,rpcCalls,invalid,missing:associationError({code:'PGRST202'})});
        })().catch(e=>result='ERRO:'+e);
        '''
        self.evaluate(harness)
        value = json.loads(self.evaluate('result'))
        self.assertIn('&lt;script&gt;', value['obs'])
        self.assertNotIn('data-association-action="permitir_uso"', value['obs'])
        self.assertIn('Uso bloqueado', value['obs'])
        self.assertIn('data-association-action="permitir_uso"', value['confirmed'])
        self.assertNotIn('data-association-action="bloquear_uso"', value['confirmed'])
        self.assertIn('data-association-action="bloquear_uso"', value['allowed'])
        self.assertNotIn('data-association-action="permitir_uso"', value['rejected'])
        self.assertNotIn('data-association-action=', value['unknown'])
        self.assertIn(['associacoes', 'user_id', 'usuario-1'], value['filters'])
        self.assertEqual(value['list']['count'], 1)
        self.assertEqual(value['rpcCalls'], [['dn_associacao_decidir', {'p_associacao_id': 'a1', 'p_acao': 'confirmar', 'p_motivo': None}]])
        self.assertTrue(value['invalid'])
        self.assertIn('não disponíveis', value['missing'])

    def test_click_requires_confirmation_and_handles_rpc_error(self):
        listener = MEMORY[MEMORY.index("    $('#dnAssociationsList')?.addEventListener('click'"):MEMORY.index("    $('#dnMemoryTeach')?.addEventListener")]
        harness = """
        let handler; let calls=0; let allow=false; let fail=false; let associationBusy=false; let associationPage=0;
        const ASSOCIATION_ACTIONS={rejeitar:'Confirmar rejeição?'};
        const status={textContent:''};
        const window={confirm:()=>allow};
        const card={dataset:{associationId:'id-ficticio'},querySelectorAll:()=>[button]};
        const button={dataset:{associationAction:'rejeitar'},disabled:false,closest:()=>card};
        const event={target:{closest:s=>s==='[data-association-action]'?button:null}};
        function $(s){if(s==='#dnAssociationsList')return {addEventListener:(_t,fn)=>handler=fn};return status;}
        async function decideAssociation(){calls++;if(fail)throw new Error('falha fictícia');}
        async function renderAssociations(){} function associationError(e){return e.message;}
        """ + listener + """
        globalThis.result='pendente';
        (async()=>{await handler(event);const canceled=calls;allow=true;await handler(event);const accepted=calls;fail=true;await handler(event);result=JSON.stringify({canceled,accepted,calls,status:status.textContent,disabled:button.disabled});})().catch(e=>result='ERRO:'+e);
        """
        self.evaluate(harness)
        value = json.loads(self.evaluate('result'))
        self.assertEqual((value['canceled'], value['accepted'], value['calls']), (0, 1, 2))
        self.assertEqual(value['status'], 'falha fictícia')
        self.assertFalse(value['disabled'])

    def test_both_javascript_files_parse(self):
        for source in (MEMORY, REANALYSIS):
            self.assertEqual(self.evaluate('new Function(' + json.dumps(source) + '); "ok"'), 'ok')


if __name__ == '__main__':
    unittest.main()
