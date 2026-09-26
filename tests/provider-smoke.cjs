// Optional real provider smoke test: sends ONLY the synthetic public fixture.
// No browser/extension acceptance is implied. Never print config or fetch URLs.
if (!process.argv.includes('--real')) { console.log('Use --real to send the public synthetic fixture to the configured Gemini model.');process.exit(0); }
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
if(!fs.existsSync(path.join(root,'config.local.js'))){console.log('SKIPPED: no local Gemini configuration.');process.exit(0);}
const html=fs.readFileSync(path.join(__dirname,'reading-layer.html'),'utf8').split('<article>')[1].split('</article>')[0];
const blocks=[...html.matchAll(/<(h[1-6]|p)(?: [^>]*)?>([^<]+)<\/\1>/g)];
const sources=blocks.slice(0,30).map((match,i)=>({id:'deepread-source-'+(i+1),tag:match[1],level:/^h/.test(match[1])?Number(match[1][1]):0,text:match[2]}));
const sandbox={console:{log(){},warn(){},error(){}},AbortController,setTimeout,clearTimeout,fetch,
  importScripts(name){if(name==='config.local.js')vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),sandbox);},
  chrome:{runtime:{onInstalled:{addListener(){}},onMessage:{addListener(){}}}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),sandbox);
(async()=>{
  const began=Date.now();const result=await sandbox.handlePageMap({page:{title:'A city reads its river — synthetic test article',hostname:'localhost'},sources});
  const report={realGemini:true,browserExtension:false,ok:result.ok,elapsedSeconds:Math.round((Date.now()-began)/1000),code:result.code||null,nodes:result.pageMap?.nodes||[],focusPath:result.pageMap?.focusPath||[]};
  // Public synthetic labels/citations only; no key, private text or request URL.
  console.log(JSON.stringify(report,null,2));
  if(!result.ok)process.exitCode=1;
})().catch(()=>{console.log('FAILED: provider smoke test could not complete. No credentials logged.');process.exitCode=1;});
