/* Auditoria visual offline: não utiliza credenciais, APIs ou contas pessoais. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('/tmp/dn-validation-tools/js/node_modules/playwright');
const base='/tmp/copiloto-visual-audit';
const dirs={antes:base+'/antes',publicado:base+'/publicado',corrigido:path.resolve(__dirname,'..')};
const out=base+'/capturas';
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 const [,version,...parts]=u.pathname.split('/');
 const directory=dirs[version];
 if(!directory){res.writeHead(404);return res.end();}
 const file=path.resolve(directory,parts.join('/')||'index.html');
 if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
const color=s=>{let m=s.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
const luminance=rgb=>{let a=rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};
const contrast=(a,b)=>{if(!a||!b)return null;let x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const report={started:new Date().toISOString(),shots:[],checks:[],failures:[]};
function check(ok,label,details){report.checks.push({ok:!!ok,label,details});if(!ok)report.failures.push({label,details});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const variant of ['antes','publicado','corrigido']){
   for(const scheme of ['light','dark']){
    const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:scheme,reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin+'/'+variant+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(240);
    const home=await page.evaluate(()=>{
      const css=sel=>{let el=document.querySelector(sel);if(!el)return null;let s=getComputedStyle(el);return {color:s.color,bg:s.backgroundColor,background:s.background,minHeight:s.minHeight,top:Math.round(el.getBoundingClientRect().top),bottom:Math.round(el.getBoundingClientRect().bottom)}};
      const root=getComputedStyle(document.documentElement);
      return {title:document.title,effective:document.documentElement.dataset.theme||'media-only',
       danger:root.getPropertyValue('--color-danger').trim(),success:root.getPropertyValue('--color-success').trim(),
       warning:root.getPropertyValue('--color-warning').trim(),info:root.getPropertyValue('--color-info').trim(),
       dock:css('.dock-plus'),smallAdd:css('.mini-add-btn'),
       primary:css('.primary-btn'),scrollOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    await page.screenshot({path:out+'/'+variant+'-'+scheme+'-home.png',fullPage:false});
    await page.evaluate(()=>{const d=document.getElementById('accountDialog');if(d&&!d.open)d.showModal();});
    await page.waitForTimeout(120);
    const settings=await page.evaluate(()=>{
      const dlg=document.getElementById('accountDialog');
      const group=document.querySelector('input[name="copilotoTheme"]');
      const row=document.querySelector('.dn-settings-section-title');
      const s= row?getComputedStyle(row):null;
      return {dialogOpen:dlg?.open,
       themeOptions:[...document.querySelectorAll('input[name="copilotoTheme"]')].map(x=>({value:x.value,checked:x.checked})),
       sectionTextColor:s?.color,
       horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
       headerTitle:document.querySelector('#settingsMainPage h1')?.textContent};
    });
    await page.screenshot({path:out+'/'+variant+'-'+scheme+'-settings.png',fullPage:false});
    report.shots.push({variant,scheme,home,settings,errors});
    check(home.scrollOverflow<=1,variant+' '+scheme+' homepage horizontal overflow',home.scrollOverflow);
    check(settings.horizontalOverflow<=1,variant+' '+scheme+' settings overflow',settings.horizontalOverflow);
    if(variant==='corrigido'){
      check(home.danger==='#EA292C',scheme+' canonical danger',home.danger);
      check(home.success==='#259859',scheme+' canonical success',home.success);
      check(home.warning.toLowerCase()==='#fd9900',scheme+' canonical warning',home.warning);
      check(home.info.toLowerCase()==='#193b8e',scheme+' canonical info',home.info);
      check(home.dock?.background.includes('gradient')||home.dock?.background.includes('radial-gradient'),scheme+' original add gradient',home.dock?.background);
      check(home.smallAdd?.minHeight==='36px',scheme+' legacy small add dimension',home.smallAdd?.minHeight);
      check(settings.themeOptions.length===3,scheme+' three theme options',settings.themeOptions);
      check(home.effective===scheme,scheme+' automatic theme matches system',home.effective);
    }
    await context.close();
   }
  }
  // Representative modal and memory component visual checks in both themes, offline.
  for(const scheme of ['light','dark']){
    const c=await browser.newContext({viewport:{width:390,height:844},colorScheme:scheme,reducedMotion:'reduce'});
    const page=await c.newPage();
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin+'/corrigido/index.html',{waitUntil:'domcontentloaded'});
    for(const id of ['loginDialog','registerDialog','habitFormDialog','taskFormDialog']){
      const ok=await page.evaluate(id=>{
        const dialog=document.getElementById(id);
        if(!dialog)return false;
        if(!dialog.open)dialog.showModal();
        return true;
      },id);
      check(ok,scheme+' dialog exists '+id,ok);
      await page.waitForTimeout(35);
      await page.screenshot({path:out+'/corrigido-'+scheme+'-'+id+'.png',fullPage:false});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      check(overflow<=1,scheme+' dialog no horizontal overflow '+id,overflow);
      await page.evaluate(id=>document.getElementById(id).close(),id);
    }
    await page.evaluate(()=>{
      const dlg=document.getElementById('accountDialog');if(!dlg.open)dlg.showModal();
      const memory=document.getElementById('dnMemoryPage');
      const settings=document.getElementById('settingsMainPage');
      if(memory && settings){
        settings.hidden=true;
        memory.hidden=false;
        let list=memory.querySelector('.dn-memory-list');
        if(list && !list.children.length){
          const card=document.createElement('article');
          card.className='dn-memory-card';
          card.innerHTML='<div class="dn-memory-card-top">EXEMPLO FICTÍCIO · para testar contraste</div><h3>Exemplo fictício: prefiro música instrumental</h3><p>Memória simulada, sem dados pessoais</p><div class="dn-memory-card-actions"><button type="button">Detalhes</button></div>';
          list.append(card);
        }
      }
    });
    const memoryVisible=await page.evaluate(()=>!!document.getElementById('dnMemoryPage') && !document.getElementById('dnMemoryPage').hidden);
    check(memoryVisible,scheme+' memory page present in offline fixture',memoryVisible);
    if(memoryVisible){
      await page.screenshot({path:out+'/corrigido-'+scheme+'-memory.png',fullPage:false});
      const n=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      check(n<=1,scheme+' memory viewport no horizontal overflow',n);
    }
    await c.close();
  }
  // Focused interactive checks: persistence, overrides, auto updates
  const context=await browser.newContext({viewport:{width:320,height:700},colorScheme:'light'});
  const page=await context.newPage();await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin+'/corrigido/index.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.getElementById('accountDialog').showModal());
  await page.locator('input[name="copilotoTheme"][value="dark"]').check({force:true});
  let a=await page.evaluate(()=>({preference:localStorage.getItem('copiloto-theme-preference-v1'),effective:document.documentElement.dataset.theme}));
  check(a.preference==='dark'&&a.effective==='dark','dark selection overrides light system',a);
  await page.reload({waitUntil:'domcontentloaded'});
  a=await page.evaluate(()=>({effective:document.documentElement.dataset.theme,preference:window.COPILOTO_THEME.getPreference()}));
  check(a.effective==='dark'&&a.preference==='dark','dark selection persists reload',a);
  await page.evaluate(()=>window.COPILOTO_THEME.setPreference('auto'));
  a=await page.evaluate(()=>({effective:document.documentElement.dataset.theme,preference:window.COPILOTO_THEME.getPreference()}));
  check(a.effective==='light'&&a.preference==='auto','automatic returns to light',a);
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForTimeout(70);
  a=await page.evaluate(()=>document.documentElement.dataset.theme);
  check(a==='dark','automatic reacts to OS changes',a);
  await page.emulateMedia({colorScheme:'light'});
  await page.evaluate(()=>window.COPILOTO_THEME.setPreference('light'));
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForTimeout(70);
  a=await page.evaluate(()=>document.documentElement.dataset.theme);
  check(a==='light','forced light ignores OS dark',a);
  await context.close();
  // Menu and action IDs comparison: ensure no unrelated removal.
  const html=v=>fs.readFileSync(dirs[v]+'/index.html','utf8');
  const ids=v=>new Set([...html(v).matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  const nav=v=>[...html(v).matchAll(/<nav class="bottom-dock[^>]*>([\s\S]*?)<\/nav>/g)].flatMap(m=>[...m[1].matchAll(/<button\b[^>]*(?:id="([^"]+)"|data-demo="([^"]+)")[^>]*>/g)].map(x=>x[1]||x[2]));
  let before=ids('antes'),live=ids('publicado'),fixed=ids('corrigido');
  const removed=[...live].filter(x=>!fixed.has(x));
  const newIds=[...fixed].filter(x=>!live.has(x));
  check(removed.length===0,'no existing element ID removed',removed);
  check(JSON.stringify(nav('publicado'))===JSON.stringify(nav('corrigido')),'navigation view markers unchanged',nav('corrigido'));
  report.menus={original:nav('antes'),published:nav('publicado'),corrected:nav('corrigido'),
     idsOriginal:before.size,idsPublished:live.size,idsCorrected:fixed.size,
     removed,added:newIds};
  fs.writeFileSync(out+'/relatorio.json',JSON.stringify(report,null,2));
  console.log('BROWSER_AUDIT',report.checks.length,'checks',report.failures.length,'failures','captures',report.shots.length*2);
  console.log('FAILURES',JSON.stringify(report.failures).slice(0,2800));
  console.log('MENU_DIFF',JSON.stringify(report.menus));
  console.log('VISUAL',JSON.stringify(report.shots.filter(x=>x.variant==='corrigido').map(x=>({theme:x.scheme,home:x.home,settings:x.settings}))).slice(0,2500));
  if(report.failures.length)process.exitCode=1;
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error('AUDIT_FATAL',e.stack);process.exitCode=1;server.close();});