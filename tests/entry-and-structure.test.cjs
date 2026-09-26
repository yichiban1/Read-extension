// Worker/manifest contract tests. Chrome, config and Gemini are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json')));
assert.equal(manifest.action.default_popup, undefined);
assert.ok(manifest.commands._execute_action);
assert.deepEqual(manifest.permissions, ['activeTab']);
let click, listener, fail = false, sent = [], titles = [], badges = [], requests = [];
let output = { nodes: [{ label:'Document section', kind:'CONTEXT', sourceIds:['deepread-source-1'] }], focusPath:[{label:'Read this evidence',kind:'EVIDENCE',sourceIds:['deepread-source-2']}] };
const sandbox = { console, importScripts(){}, AbortController, setTimeout, clearTimeout,
  DEEPREAD_LOCAL_CONFIG:{apiKey:'test-only-placeholder'},
  chrome:{ runtime:{onInstalled:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},
    action:{onClicked:{addListener(fn){click=fn;}},async setBadgeText(value){badges.push(value);},async setTitle(value){titles.push(value);}},
    tabs:{async sendMessage(id,message){sent.push({id,message});if(fail)throw Error('no receiver');return {ok:true};}} },
  async fetch(url,options){requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}]})};}
};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','background.js'),'utf8'),sandbox);
const payload={page:{title:'Public synthetic document',hostname:'localhost'},sources:[
  {id:'deepread-source-1',tag:'h2',level:2,text:'Original structural heading'},
  {id:'deepread-source-2',tag:'p',level:0,text:'Documented evidence with explicit conditions and limited scope. '.repeat(6)}]};
const send=()=>new Promise(resolve=>listener({type:'DEEPREAD_GENERATE_PAGE_MAP',payload},{},resolve));
(async()=>{
  assert.equal(typeof click,'function');
  await click({id:1,url:'https://example.com/article'});
  assert.equal(sent.length,1);assert.equal(sent[0].message.type,'TOGGLE_DEEPREAD_GUIDE');assert.equal(badges.at(-1).text,'');
  for(const url of ['chrome://extensions','https://chromewebstore.google.com/detail/example','https://chrome.google.com/webstore/detail/example','file:///private.txt']) {
    const before=sent.length;await click({id:2,url});assert.equal(sent.length,before);assert.equal(badges.at(-1).text,'!');assert.match(titles.at(-1).title,/not Chrome pages/);
  }
  fail=true;await click({id:3,url:'https://example.com'});assert.match(titles.at(-1).title,/Refresh/);fail=false;
  await click({id:3,url:'https://example.com'});assert.equal(badges.at(-1).text,'');
  const request=sandbox.createPageMapRequest(payload);assert.match(request.input,/level=2/);assert.doesNotMatch(request.instructions,/Do not reproduce/);assert.ok(request.schema.properties.focusPath);
  let result=await send();assert.equal(result.ok,true);assert.equal(result.pageMap.focusPath.length,1);assert.equal(requests.length,1,'Atlas + Focus share a single Gemini call');
  output={nodes:[{label:'Bad citation',kind:'CONTEXT',sourceIds:['deepread-source-1','deepread-source-999']}]};
  result=await send();assert.equal(result.code,'INVALID_PROVIDER_RESPONSE','A partially invalid citation must not become a valid section');
  console.log('PASS: one-click action, restricted pages, absent receiver, recovery, shortcut, heading metadata, shared Atlas/Focus response, invalid citations. Chrome/network mocked.');
})().catch(error=>{console.error(error);process.exitCode=1;});
