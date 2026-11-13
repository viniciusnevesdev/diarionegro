/* Visual regression smoke: localhost only, no personal database or API. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const tools=process.env.DN_TEST_TOOLS||'/tmp/dn-validation-tools';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(tools,'browsers');
const {chromium}=require(path.join(tools,'js/node_modules/playwright'));
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(target).pipe(res);
});
function channel(c){return Number(c)/255}
function luminance([r,g,b]){const a=[r,g,b].map(x=>{x=channel(x);return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722}
function contrast(a,b){let x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function rgb(s){let m=s.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null}
test('PWA Copiloto – mobile, themes, contrast and assets',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const port=server.address().port;
  for(const colorScheme of ['light','dark']){
   for(const width of [320,390,430]){
    const page=await browser.newPage({viewport:{width,height:844},colorScheme});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(120);
    const v=await page.evaluate(()=>{
      const css=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
      const add=document.querySelector('.dock-plus'),a=getComputedStyle(add);
      return {title:document.title,brand:document.querySelector('.brand')?.textContent?.trim(),
       bg:css.getPropertyValue('--bg').trim(),addBg:a.backgroundColor,addColor:a.color,
       themeLoaded:[...document.styleSheets].some(s=>s.href?.includes('theme-system.css')),
       overflow:document.documentElement.scrollWidth-innerWidth,bodyColor:body.color,
       rootMode:css.colorScheme};
    });
    assert.equal(v.title,'Copiloto');
    assert.equal(v.brand,'Copiloto');
    assert.equal(v.themeLoaded,true,'theme stylesheet not loaded');
    assert(v.overflow<=1,`horizontal overflow ${colorScheme} ${width}: ${v.overflow}`);
    assert(contrast(rgb(v.addBg),rgb(v.addColor))>=4.5,`add button contrast ${colorScheme}: ${JSON.stringify(v)}`);
    assert(v.bg=== (colorScheme==='dark'?'#11151f':'#f7f6f2'));
    console.log('VISUAL_PASS',colorScheme,width,'addContrast',contrast(rgb(v.addBg),rgb(v.addColor)).toFixed(2));
    await page.close();
   }
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
