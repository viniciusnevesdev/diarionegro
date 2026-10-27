// Real PostgreSQL + PostgREST JWT + Deno handlers + Chromium. All fixtures are local.
const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), crypto=require('node:crypto'), {spawn}=require('node:child_process'), assert=require('node:assert/strict');
module.exports=async function({ROOT,TOOLS,PG,database,admin,asUser,rpc,A,B,test}){
  process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(TOOLS,'browsers');
  const {chromium}=require(path.join(TOOLS,'js/node_modules/playwright'));
  const sdk=path.join(TOOLS,'sdk-browser.js');
  require(path.join(TOOLS,'js/node_modules/esbuild')).buildSync({stdin:{contents:"import {createClient} from '@supabase/supabase-js';window.supabase={createClient};",resolveDir:path.join(TOOLS,'js')},bundle:true,format:'iife',platform:'browser',outfile:sdk});
  const secret=crypto.randomBytes(40).toString('hex');
  function token(id,role='authenticated'){const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({sub:id,role,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return head+'.'+body+'.'+crypto.createHmac('sha256',secret).update(head+'.'+body).digest('base64url');}
  const tokenA=token(A),tokenB=token(B),anon=token(null,'anon');
  const artifacts=path.join(TOOLS,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const processes=[];let browser,server;
  const logs=[]; let fallback=false,invalidEvidence=false,failAssociation=false,failContext=false; let modelCalls=[];
  const fixtureText='Estou cantando, ouvindo música e feliz.';
  const fixtureOutput=()=>({resumo:'Canto, música e felicidade observados.',intencao:'misto',categoria:'Bem-estar',subcategoria:'Música',pessoas:[],tags:['música'],eventos:[{tipo:'atividade',nome:'cantar',estado:'ocorreu',categoria:'Bem-estar',subcategoria:'Música',momento:'',detalhes:'',confianca:.9}],emocoes:[{nome:'feliz',intensidade:7,valencia:'positiva',contexto:'registro',relevancia:7,confianca:.9}],memorias:[],associacoes:[{sujeito:'cantar',relacao:'parece associado',objeto:'felicidade',evidencia:invalidEvidence?'inventada':'cantando',justificativa:'coocorrência',confianca:.7},{sujeito:'ouvir música',relacao:'parece associado',objeto:'felicidade',evidencia:'ouvindo música',justificativa:'coocorrência',confianca:.6}]});
  function child(cmd,args,env={}){const p=spawn(cmd,args,{cwd:ROOT,env:{PATH:process.env.PATH,...env},stdio:['ignore','pipe','pipe']});p.stdout.on('data',d=>logs.push(String(d)));p.stderr.on('data',d=>logs.push(String(d)));processes.push(p);return p;}
  async function wait(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.status<500)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Service unavailable '+url+'\n'+logs.join(''));}
  try{
    await admin.query("do $$begin if not exists(select 1 from pg_roles where rolname='dn_authenticator') then create role dn_authenticator login noinherit; end if; end$$; grant anon,authenticated to dn_authenticator;");
    const config=path.join(artifacts,'postgrest.conf');
    fs.writeFileSync(config,`db-uri = "postgresql://dn_authenticator@/${database}?host=${PG.host}&port=${PG.port}"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${secret}"\nserver-host = "127.0.0.1"\nserver-port = 55440\n`);
    child(path.join(TOOLS,'postgrest'),[config]);await wait('http://127.0.0.1:55440/');
    await test('PostgREST validates JWT and isolates users',async()=>{
      const get=jwt=>fetch('http://127.0.0.1:55440/associacoes',{headers:{Authorization:'Bearer '+jwt}});
      assert.equal((await get('forged')).status,401);
      assert.equal((await get(anon)).status,401);
      assert.equal((await (await get(tokenB)).json()).length,0);
      assert((await (await get(tokenA)).json()).length>=1);
    });
    const headers={Authorization:'Bearer '+tokenA,apikey:anon,'Content-Type':'application/json'};
    const fixtureHtml=()=>`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/settings.css"><link rel="stylesheet" href="/dn-memory.css"><link rel="stylesheet" href="/dn-memory-v083.css"></head><body><dialog id="accountDialog" class="demo-dialog" open><div id="settingsMainPage"><div class="dn-settings-card"><button id="openCopilotPhrases">Memória</button></div></div><div id="copilotPhrasesPage" hidden></div></dialog><script src="/test-sdk.js"></script><script>const client=window.supabase.createClient(location.origin,${JSON.stringify(anon)},{accessToken:async()=>${JSON.stringify(tokenA)},auth:{persistSession:false,autoRefreshToken:false}});window.DN_APP_API={getClient:()=>client,getSession:()=>({user:{id:${JSON.stringify(A)}}})};window.addEventListener('dn:open-record',e=>window.openedRecord=e.detail.recordId);</script><script src="/dn-memory.js"></script><script src="/dn-memory-v083.js"></script></body></html>`;
    server=http.createServer(async(req,res)=>{try{
      const chunks=[];for await(const part of req)chunks.push(part);const raw=Buffer.concat(chunks);const url=new URL(req.url,'http://127.0.0.1:55441');
      if(url.pathname.startsWith('/rest/v1/')){
        if(failAssociation&&url.pathname.endsWith('/dn_associacao_registrar')){failAssociation=false;res.writeHead(500,{'content-type':'application/json'});return res.end(JSON.stringify({code:'XX000',message:'fixture persistence failure'}));}
        if(failContext&&url.pathname.endsWith('/dn_contexto_copiloto')){res.writeHead(500);return res.end('{}');}
        const upstream=await fetch('http://127.0.0.1:55440/'+url.pathname.slice('/rest/v1/'.length)+url.search,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length'].includes(k))),body:raw.length?raw:undefined});
        res.writeHead(upstream.status,Object.fromEntries(upstream.headers));return res.end(Buffer.from(await upstream.arrayBuffer()));
      }
      if(url.pathname.startsWith('/functions/v1/')){
        const dedicated=url.pathname.endsWith('/reanalisar-historico');
        if(dedicated&&fallback){res.writeHead(503,{'content-type':'application/json'});return res.end('{"error":"fixture dedicated unavailable"}');}
        const upstream=await fetch('http://127.0.0.1:'+(dedicated?55443:55442),{method:req.method,headers:{...headers,...req.headers,host:'127.0.0.1'},body:raw.length?raw:undefined});
        res.writeHead(upstream.status,{'content-type':'application/json'});return res.end(await upstream.text());
      }
      if(url.pathname==='/mock-model'){
        const payload=JSON.parse(raw);modelCalls.push(payload);
        const dedicated=payload.text.format.name==='reanalisacao_historica';
        const response=dedicated?fixtureOutput():{...fixtureOutput(),associacoes:undefined,memorias:undefined,tarefas:[{titulo:'NÃO EXECUTAR TAREFA FICTÍCIA'}],acoes_tarefas:[{acao:'concluir',task_id:'fake'}],memorias_sugeridas:[{texto:'NÃO ATIVAR',confianca:1}]};
        res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({output_text:JSON.stringify(response)}));
      }
      if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});return res.end(fixtureHtml());}
      const file=url.pathname==='/test-sdk.js'?sdk:path.resolve(ROOT,'.'+url.pathname);
      if(file!==sdk&&!file.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end();}
      if(!/\.(js|css)$/.test(file)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
      res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(file));
    }catch(e){res.writeHead(500);res.end(String(e));}});
    await new Promise(resolve=>server.listen(55441,'127.0.0.1',resolve));
    const empty=path.join(artifacts,'empty.ts');fs.writeFileSync(empty,'export {};');
    const imports=path.join(artifacts,'imports.json');fs.writeFileSync(imports,JSON.stringify({imports:{'jsr:@supabase/functions-js/edge-runtime.d.ts':empty}}));
    const bootstrap=path.join(artifacts,'serve.ts');fs.writeFileSync(bootstrap,`
const actualFetch=globalThis.fetch; globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.hostname==='api.openai.com')return actualFetch('http://127.0.0.1:55441/mock-model',init);if(url.hostname!=='127.0.0.1')throw new Error('External egress blocked');return actualFetch(input,init);};
Deno.env.set('SUPABASE_URL','http://127.0.0.1:55441');Deno.env.set('SUPABASE_ANON_KEY','test-anon');Deno.env.set('OPENAI_API_KEY','test-only-no-real-key');Deno.env.set('OPENAI_MODEL','test-model');
const serve=Deno.serve;Deno.serve=(handler)=>serve({hostname:'127.0.0.1',port:Number(Deno.args[1])},handler);await import(Deno.args[0]);`);
    const deno=path.join(TOOLS,'js/node_modules/deno/deno');
    for(const [name,port] of [['copiloto',55442],['reanalisar-historico',55443]]){
      child(deno,['run','--allow-read='+ROOT+','+artifacts,'--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,OPENAI_API_KEY,OPENAI_MODEL,DN_MEMORY_CONTEXT_ENABLED,DN_HISTORICAL_REANALYSIS_ENABLED','--allow-net=127.0.0.1','--import-map='+imports,bootstrap,'file://'+path.join(ROOT,'supabase/functions',name,'index.ts'),String(port)]);
      await wait('http://127.0.0.1:'+port);
    }
    process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(TOOLS,'browsers');browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:55441/');await page.waitForFunction(()=>!!window.DN_MEMORY_REANALYSIS);
    await admin.query('insert into public.registros(id,user_id,texto_original) values($1,$2,$3)',['browser-source',A,fixtureText]);
    await test('real browser reanalysis persists two independent associations',async()=>{
      const result=await page.evaluate(()=>window.DN_MEMORY_REANALYSIS.run({scope:'tudo'}));assert.equal(result.stats.failed,0);assert.equal(result.stats.associacoesCriadas,2);
      assert.equal((await admin.query("select texto_original from public.registros where id='browser-source'")).rows[0].texto_original,fixtureText);
      assert.equal((await admin.query("select count(*)::int n from public.associacoes where source_record_id='browser-source'")).rows[0].n,2);
      assert.equal((await admin.query("select count(*)::int n from public.memorias where texto='NÃO ATIVAR'")).rows[0].n,0);
    });
    await test('mobile UI separates confirmation and permission; reject preserves source',async()=>{
      await page.evaluate(()=>window.DN_MEMORY.open());
      const card=page.locator('[data-association-id]').filter({has:page.locator('[data-association-source="browser-source"]')}).first();
      await card.waitFor();await card.getByText('Histórico de decisões',{exact:true}).click();await card.locator('.dn-association-history-body strong').first().waitFor();assert((await card.locator('.dn-association-history-body').innerText()).includes('Criada'));assert.equal(await card.locator('[data-association-action="permitir_uso"]').count(),0);
      page.once('dialog',dialog=>dialog.dismiss());await card.getByRole('button',{name:'Confirmar',exact:true}).click();
      assert.equal(await card.locator('[data-association-action="permitir_uso"]').count(),0);
      page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Confirmar',exact:true}).click();
      await card.getByRole('button',{name:'Permitir uso',exact:true}).waitFor();assert((await card.innerText()).includes('Uso bloqueado'));
      page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Permitir uso',exact:true}).click();
      await card.getByRole('button',{name:'Bloquear uso',exact:true}).waitFor();
      const ctx=await asUser(A,c=>rpc(c,'dn_contexto_copiloto',['browser-allowed','interpretar']));assert(ctx.associacoes.some(a=>a.id));
      page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Bloquear uso',exact:true}).click();
      await card.getByRole('button',{name:'Permitir uso',exact:true}).waitFor();
      page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Manter em observação',exact:true}).click();
      await card.getByRole('button',{name:'Confirmar',exact:true}).waitFor();
      assert.equal(await card.getByRole('button',{name:'Permitir uso',exact:true}).count(),0);
      page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Confirmar',exact:true}).click();
      await card.getByRole('button',{name:'Permitir uso',exact:true}).waitFor();
      page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Permitir uso',exact:true}).click();
      await card.getByRole('button',{name:'Bloquear uso',exact:true}).waitFor();

      await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
      assert.equal(await page.locator('#dnMemoryPage').evaluate(el=>el.scrollWidth>el.clientWidth),false);
      page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'Rejeitar',exact:true}).click();
      await card.getByRole('button',{name:'Confirmar',exact:true}).waitFor();assert((await card.innerText()).includes('Rejeitada'));
      assert.equal((await admin.query("select texto_original from public.registros where id='browser-source'")).rows[0].texto_original,fixtureText);
    });
    await test('repeat, fallback, failure and interruption preserve originals/history',async()=>{
      let result=await page.evaluate(()=>window.DN_MEMORY_REANALYSIS.run({scope:'tudo'}));assert.equal(result.stats.associacoesReencontradas,2);
      const rejected=await admin.query("select * from public.associacoes where source_record_id='browser-source' and estado_humano='rejeitada'");assert.equal(rejected.rowCount,1);assert.equal(rejected.rows[0].uso_permitido,false);
      fallback=true;result=await page.evaluate(()=>window.DN_MEMORY_REANALYSIS.run({scope:'tudo'}));assert.equal(result.stats.associacoesIndisponiveis,1);assert.equal(result.stats.failed,0);fallback=false;
      invalidEvidence=true;result=await page.evaluate(()=>window.DN_MEMORY_REANALYSIS.run({scope:'tudo'}));assert.equal(result.stats.failed,1);invalidEvidence=false;
      failAssociation=true;result=await page.evaluate(()=>window.DN_MEMORY_REANALYSIS.run({scope:'tudo'}));assert.equal(result.stats.failed,1);
      await admin.query('insert into public.registros(id,user_id,texto_original) values($1,$2,$3)',['interruption-source',A,fixtureText]);
      result=await page.evaluate(()=>{let stop=false;return window.DN_MEMORY_REANALYSIS.run({scope:'tudo'},{shouldStop:()=>stop,onProgress:()=>{stop=true;}});});assert.equal(result.run.status,'interrompida');assert.equal(result.stats.processed,1);
      result=await page.evaluate(()=>window.DN_MEMORY_REANALYSIS.run({scope:'tudo'}));assert.equal(result.stats.failed,0);
      const snapshot=(await admin.query("select dados_json from public.interpretacoes where record_id='browser-source'")).rows[0].dados_json;assert(!snapshot.associacoes);
      assert((await admin.query("select count(*)::int n from public.interpretacoes_historico where record_id='browser-source'")).rows[0].n>=5);
    });
    await test('Deno Copiloto ignores forged rules and only loads allowed context',async()=>{
      const response=await fetch('http://127.0.0.1:55442',{method:'POST',headers,body:JSON.stringify({modo:'interpretar',texto:'teste',regras:['FORGED_RULE']})});assert.equal(response.status,200);
      const prompt=modelCalls.at(-1).input[0].content[0].text;assert(!prompt.includes('FORGED_RULE'));assert(prompt.includes('correction'));assert(prompt.includes('independent'));assert(!prompt.includes('unconfirmed'));assert(!prompt.includes('fixture-fp'));
      failContext=true;const before=modelCalls.length;const failed=await fetch('http://127.0.0.1:55442',{method:'POST',headers,body:'{"modo":"interpretar","texto":"x"}'});assert.equal(failed.status,500);assert.equal(modelCalls.length,before);failContext=false;
      const historical=await fetch('http://127.0.0.1:55442',{method:'POST',headers,body:'{"modo":"reanalisar_historico","texto":"antigo","tarefas":[{"id":"forged-task"}]}'});assert.equal(historical.status,200);const sent=JSON.stringify(modelCalls.at(-1));assert(!sent.includes('forged-task'));assert(!sent.includes('independent'));
    });
    await test('desktop and narrow mobile UI, no script errors',async()=>{
      for(const width of [320,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>window.DN_MEMORY.refresh());assert.equal(await page.locator('#dnMemoryPage').evaluate(el=>el.scrollWidth>el.clientWidth),false);}
      assert.deepEqual(pageErrors,[]);
      await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
    });
    fs.writeFileSync(path.join(artifacts,'service.log'),logs.join(''));
  }finally{
    if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));for(const p of processes)p.kill('SIGTERM');
    fs.writeFileSync(path.join(TOOLS,'artifacts','service.log'),logs.join(''));
  }
};
