import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.QA_OUTPUT, base='http://127.0.0.1:3000';
const password='Pr183-Synthetic-Only!2026', email='pr183-isolated@example.invalid';
const browser=await chromium.launch({args:['--no-proxy-server']});
const results=[], observations=[];let seq=0;
function safeURL(url){assert(!url.includes(password)&&!url.includes(encodeURIComponent(password)),'Password in URL');const u=new URL(url);assert(!u.searchParams.has('password'),'Password query parameter');}
async function run(name,fn,options={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000},...options});
 await context.route('**/*',r=>['127.0.0.1','localhost','pr183-local.supabase.co'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 const requests=[];context.on('request',r=>requests.push({method:r.method(),url:r.url(),hasPassword:!!r.postData()?.includes(password)}));
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});const page=await context.newPage();seq++;
 try{await fn(page,context,requests);for(const r of requests){safeURL(r.url);assert(!(r.method==='GET'&&r.hasPassword),'GET request contains password');}const cdp=await context.newCDPSession(page);const history=await cdp.send('Page.getNavigationHistory');for(const entry of history.entries)safeURL(entry.url);writeFileSync(`${out}/${seq}-history.json`,JSON.stringify(history.entries.map(({url,title})=>({url,title})),null,2));safeURL(page.url());results.push({name,status:'PASS'});}
 catch(e){console.log(String(e.message).replaceAll(password,'[REDACTED]').slice(0,1800));results.push({name,status:'FAIL',error:String(e.message).replaceAll(password,'[REDACTED]').slice(0,1800)});}
 finally{observations.push({name,requests:requests.map(r=>({method:r.method,url:new URL(r.url).pathname,hasPasswordBody:r.hasPassword}))});await page.screenshot({path:`${out}/${seq}.png`,fullPage:true}).catch(()=>{});await context.tracing.stop({path:`${out}/${seq}-raw.zip`});await context.close();writeFileSync(`${out}/results.json`,JSON.stringify({applicationCommit:process.env.NEXT_PUBLIC_BUILD_SHA,scope:'Login security only; 18 approved paper cases not repeated',results},null,2));console.log(`${results.at(-1).status}: ${name}`);}
}
async function ssrSafe(page){const form=page.locator('form.access-form');await form.waitFor({state:'attached'});assert.equal(await form.getAttribute('method'),'post');assert(await form.locator('[name=email]').isDisabled());assert(await form.locator('[name=password]').isDisabled());assert(await form.locator('[type=submit]').isDisabled());return form;}
async function ready(page){await page.goto(base+'/login',{timeout:120000});await page.locator('form.access-form [name=password]').waitFor({state:'visible',timeout:120000});await page.waitForFunction(()=>!document.querySelector('form.access-form button[type=submit]')?.disabled,null,{timeout:120000});}
await run('JavaScript disabled: SSR controls disabled and native fallback POST',async(page,context,requests)=>{
 await page.goto(base+'/login',{timeout:120000});const form=await ssrSafe(page);assert.match(await form.locator('noscript').textContent(),/JavaScript/);await page.screenshot({path:`${out}/nojs-before-submit.png`,fullPage:true});
 const before=requests.length;
 // Exercise the native transport even if the disabled controls are bypassed programmatically.
 await Promise.all([page.waitForRequest(r=>r.isNavigationRequest()&&r.method()==='POST'),form.evaluate(f=>HTMLFormElement.prototype.submit.call(f))]);
 await page.waitForLoadState('domcontentloaded');assert(requests.slice(before).some(r=>r.method==='POST'));assert(!requests.slice(before).some(r=>r.hasPassword));
},{javaScriptEnabled:false});
await run('Delayed hydration: blocked controls, Enter safe, then canonical login',async(page,context,requests)=>{
 let release;const gate=new Promise(r=>release=r);await context.route('**/*.js*',async r=>{await gate;await r.continue();});
 try{await page.goto(base+'/',{waitUntil:'commit',timeout:120000});await ssrSafe(page);await page.screenshot({path:`${out}/pre-hydration.png`,fullPage:true});const before=requests.filter(r=>r.method==='POST').length;await page.keyboard.press('Enter');assert.equal(requests.filter(r=>r.method==='POST').length,before);}finally{release();}
 await page.waitForFunction(()=>!document.querySelector('form.access-form button[type=submit]')?.disabled,null,{timeout:120000});
 await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'INGRESAR A ORBIT',exact:true}).click();await page.waitForURL('**/operations',{timeout:120000});assert(requests.some(r=>r.method==='POST'&&r.hasPassword));
 await page.reload();await page.waitForURL('**/operations');
});
await run('Hydrated invalid credentials: error preserved, no credential URL',async page=>{
 await ready(page);await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password+'-invalid');await page.getByRole('button',{name:'INGRESAR A ORBIT',exact:true}).click();await page.getByRole('alert').waitFor({timeout:60000});assert.match(page.url(),/login|\/$/);await page.waitForFunction(()=>!document.querySelector('form.access-form button[type=submit]')?.disabled,null,{timeout:30000});
});
await run('Hydrated validation and password visibility preserve access behavior',async(page,context,requests)=>{
 await ready(page);const before=requests.filter(r=>r.method==='POST').length;await page.getByRole('button',{name:'INGRESAR A ORBIT',exact:true}).click();await page.locator('#email-error').waitFor();assert.equal(requests.filter(r=>r.method==='POST').length,before);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();assert.equal(await page.locator('#password').getAttribute('type'),'text');await page.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();assert.equal(await page.locator('#password').getAttribute('type'),'password');
});
await run('Unauthenticated protected routes remain inaccessible',async page=>{
 await page.goto(base+'/operations',{timeout:120000});await page.waitForURL(url=>url.pathname==='/'||url.pathname==='/login');await page.locator('form.access-form').waitFor({state:'attached',timeout:60000});await page.goto(base+'/staff-portal',{timeout:120000});await page.waitForURL(/login/);
});
await browser.close();
const logs=readFileSync(`${out}/next.log`,'utf8');const logSafe=![password,encodeURIComponent(password),'password='].some(value=>logs.includes(value));results.push({name:'Server logs contain no password or password query',status:logSafe?'PASS':'FAIL'});
writeFileSync(`${out}/network-summary.json`,JSON.stringify(observations,null,2));writeFileSync(`${out}/results.json`,JSON.stringify({applicationCommit:process.env.NEXT_PUBLIC_BUILD_SHA,scope:'Login security only; 18 approved paper cases not repeated',results},null,2));process.exitCode=results.some(r=>r.status!=='PASS')?1:0;
