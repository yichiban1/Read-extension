// Test-only runtime. No Gemini calls. Real source mapping + content UI scripts.
const view = new URLSearchParams(location.search).get('view') || 'light';
document.body.classList.add(view);
const article = document.querySelector('article');
const sampleA = 'The council expects planting trees beside the river to reduce summer temperatures. Its draft says the project will eliminate heat stress across the neighbourhood. The team will measure seasonal conditions before the final design is approved.';
const sampleB = 'The proposal models shade and evaporation together. The model uses average wind conditions and assumes that young trees survive their first three summers. Maintenance and water availability are documented as conditions for the estimate.';
if (view === 'short') article.innerHTML = `<h1>A brief field report</h1><p id="claim">${sampleA}</p><p id="measurement">${sampleB}</p>`;
if (view === 'fallback') document.querySelector('main').innerHTML = `<article><h1>Field note</h1><p id="claim">${sampleA}</p></article><section><p id="measurement">${sampleB}</p></section><nav><p id="excluded-nav">${sampleA}</p></nav><section class="comments"><p id="excluded-comments">${sampleB}</p></section>`;
if (view === 'table') article.innerHTML = `<h1>Field measurements</h1><table><tr><th>Sampling method and conditions</th><td id="claim">${sampleA}</td></tr><tr><th>Model assumptions</th><td id="measurement"><p>${sampleB}</p></td></tr></table><dl><dt>Evapotranspiration</dt><dd>Water moves from soil and plants into the air. Cooling depends on water availability, leaf area and local weather, so results vary by season.</dd></dl><figure><figcaption>The figure compares temperatures measured on two afternoons. The observations describe local conditions and do not cover overnight cooling.</figcaption></figure><div><span>This generic text block explains how the documented maintenance conditions affect the expected result without duplicating another source.</span></div><div role="heading" aria-level="2">Measurement limits</div>`;

// Distinct layout families, still synthetic and explicitly labelled as such.
if (view === 'hierarchy' || view === 'wiki') {
  const section = article.querySelectorAll('h2')[1];
  section.insertAdjacentHTML('afterend', '<h3>Model inputs</h3><h4>Water assumptions</h4><p>Local water availability affects the estimates and is explicitly treated as uncertain in the model.</p><h3>Alternative inputs</h3>');
}
if (view === 'github') { article.className='markdown-body'; article.insertAdjacentHTML('beforeend','<h2>API usage</h2><pre>read(document, { mode: "source" })</pre><h3>Options</h3><p>The API accepts documented options and retains the original document as the navigable reading surface.</p>'); }
if (view === 'columns') { article.style.columns='2'; article.style.columnGap='40px'; }
if (view === 'cards') {
  article.innerHTML = `<h1>Readable research cards</h1><div id="claim">${sampleA}</div><div id="measurement">${sampleB}</div>` + Array.from({length:6},(_,i)=>`<div style="padding:22px;border:1px solid #aaa;margin:12px 0">Research card ${i+1}. ${sampleB}</div>`).join('');
}
if (view === 'inferred') article.innerHTML = `<p id="claim">${sampleA}</p><p id="measurement">${sampleB}</p><p>The report recommends another season of measurement before committing to construction, and records the remaining limits of the estimates.</p>`;
if (view === 'coverage') document.querySelector('main').innerHTML = `<article><h1>Small semantic introduction</h1><p id="claim">${sampleA}</p><p id="measurement">${sampleB}</p></article><section><h2>Body outside article</h2>${Array.from({length:8},(_,i)=>`<p>Detailed body passage ${i+1}. ${sampleB}</p>`).join('')}</section><nav><p id="excluded-nav">${sampleA}</p></nav><div class="newsletter"><p id="excluded-newsletter">${sampleB}</p></div>`;
if (view === 'shadow') {
  const host=document.createElement('reading-section'); article.append(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML='<h2>Open component section</h2><p id="shadow-passage">The open component contains readable evidence about documented water and maintenance conditions, and should remain anchored to its actual paragraph.</p><section><reading-nested></reading-nested></section><slot name=detail></slot><nav><p>Navigation content must not appear in the map even inside a shadow root.</p></nav>';
  const slotted=document.createElement('p');slotted.slot='detail';slotted.textContent='Slotted original evidence follows the nested component in the composed document and must be mapped exactly once.';host.append(slotted);
  root.querySelector('reading-nested').attachShadow({mode:'open'}).innerHTML='<h3>Nested evidence</h3><p>This nested component documents the limits of the sampling period and calls for additional measurement.</p>';
}

const qaCounts = {};
let qaToolbarListener;
globalThis.chrome = { runtime: {
  onMessage: { addListener(listener) { qaToolbarListener = listener; } },
  sendMessage(message, callback) {
    qaCounts[message.type] = (qaCounts[message.type] || 0) + 1;
    const sources = message.payload?.sources || [];
    const first = sources.find(s => s.text.includes('council expects')) || sources[0];
    const second = sources.find(s => s.text.includes('models shade')) || sources[1];
    const last = sources.at(-1);
    let response;
    if (message.type === 'DEEPREAD_CRITICAL_READING') response = { ok:true, criticalReading:{items: view === 'zero' ? [] : [
      { label:'Conditions for the promised outcome', type:'causal', sourceIds:[first.id, second.id], prompt:'Consider what conditions would need to hold for the project to eliminate heat stress across the neighbourhood?' },
      { label:'Limits of the short measurement period', type:'evidence', sourceIds:[second.id], prompt:'Check which observations support the model and which conditions still need measurement?' },
      { label:'Scope of the conclusion', type:'uncertainty', sourceIds:[last.id], prompt:'Consider how far these local observations can support conclusions about other neighbourhoods?' }
    ] } };
    else if (message.type === 'DEEPREAD_SMART_READING') response = { ok:true, smartReading:{items: view === 'zero' ? [] : sources.slice(0,5).map((s,i) => ({
      label:['Urban heat stress','Cooling model','Sampling period','Local conditions','Evapotranspiration'][i],
      type:'context', sourceId:s.id, hint:'This mock comprehension aid explains the context without evaluating the author.'
    })) } };
    else if (message.type === 'DEEPREAD_GENERATE_PAGE_MAP') response = { ok:true, pageMap:{nodes:(sources.filter(s=>/^h[1-6]$/.test(s.tag)).length>=2 ? sources.filter(s=>/^h[1-6]$/.test(s.tag)) : sources.filter(s=>s.text.length>=36).slice(0,5)).map(s=>({label:s.text.slice(0,70),kind:'CONTEXT',sourceIds:[s.id]})), focusPath:sources.filter(s=>!/^h[1-6]$/.test(s.tag)&&s.text.length>=36).slice(0,5).map((s,i)=>({label:'Read original passage '+(i+1),kind:['CONTEXT','CLAIM','EVIDENCE','CONTRAST','CONCLUSION'][i],sourceIds:[s.id]}))} };
    else response = { ok:true, explanation:{plainLanguage:'The proposal expects the trees to help, but the strongest promised outcome depends on conditions.', context:'This passage introduces the plan and its expected effect.', analogy:'Think of the model as a weather forecast with assumptions.'} };
    setTimeout(()=>callback(response), new URLSearchParams(location.search).has('race') && message.type==='DEEPREAD_GENERATE_PAGE_MAP' ? 1800 : message.type==='DEEPREAD_SMART_READING'?380:180);
  }
} };
const tick = (ms=280) => new Promise(resolve=>setTimeout(resolve,ms));
const choose = async mode => {
  const panel=document.getElementById('deepread-lens-panel');
  if (panel.hidden) document.getElementById('deepread-lens-action').click();
  document.getElementById(mode==='context'?'deepread-smart-action':'deepread-critical-action').click();
  await tick();
};
const selectExplain = async () => {
  const paragraph=document.getElementById('claim');
  paragraph.scrollIntoView({block:'center',behavior:'instant'}); await tick();
  window.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); await tick(30);
  const range=document.createRange(); range.selectNodeContents(paragraph);
  window.getSelection().addRange(range);
  document.dispatchEvent(new Event('selectionchange')); await tick();
  document.querySelector('.deepread-selection-explain').click(); await tick();
};
document.getElementById('qa-run').addEventListener('click', async () => {
  const result=document.getElementById('qa-result'); result.textContent='Running interaction checks…';
  const checks=[];
  const check=(condition,label)=>{ checks.push(`${condition?'PASS':'FAIL'} ${label}`); if(!condition) throw new Error(label); };
  const mapping=()=>globalThis.DeepReadSourceMapping.getCurrentMap();
  const lens=document.getElementById('deepread-lens-action');
  const panel=document.getElementById('deepread-lens-panel');
  const rail=document.querySelector('.deepread-spine');
  const snapshot=()=>rail.getBoundingClientRect();
  const expectedOffset=()=>Math.min(28,Math.max(16,innerWidth*.02));
  const count=type=>qaCounts[type]||0;
  try {
    check(document.getElementById('deepread-shell').dataset.mode==='dormant' && document.querySelector('.deepread-spine').inert && Object.keys(qaCounts).length===0,'Dormant mode exposes only the tiny launcher without AI');
    qaToolbarListener({type:'TOGGLE_DEEPREAD_GUIDE'}, {}, () => {});
    check(document.getElementById('deepread-shell').dataset.mode==='active'&&Object.keys(qaCounts).length===0,'Toolbar message activates mode without AI or popup');
    qaToolbarListener({type:'TOGGLE_DEEPREAD_GUIDE'}, {}, () => {});
    check(document.getElementById('deepread-shell').dataset.mode==='dormant','Second toolbar message returns to dormant mode');
    document.getElementById('deepread-launcher').click();
    check(document.getElementById('deepread-shell').dataset.mode==='active' && !document.querySelector('.deepread-spine').inert,'One launcher click activates the reading layer');
    check(Math.abs(document.documentElement.clientWidth-snapshot().right-expectedOffset())<2,'Rail uses viewport right offset');
    check(document.querySelectorAll('.deepread-spine > button').length===3,'Atlas, Lens and Focus Path share the persistent rail');
    if(new URLSearchParams(location.search).has('race')) {
      const focusButton=document.getElementById('deepread-focus-action');
      const atlasButton=document.getElementById('deepread-rail-toggle');
      atlasButton.click();
      const bannerUpdate=document.createElement("div");bannerUpdate.textContent="Unrelated short update";document.body.append(bannerUpdate);await tick(50);
      focusButton.click();
      check(count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Cold Focus and Atlas share a single pending request');
      document.getElementById('deepread-launcher').click(); await tick(1950);
      check(!focusPath&&document.getElementById('deepread-shell').dataset.mode==='dormant','Late response cannot reactivate a dismissed guided mode');
      document.getElementById('deepread-launcher').click(); focusButton.click(); await tick();
      check(!!focusPath&&count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Restart uses cached response from the dismissed pending request');
      document.querySelector('.deepread-focus-stop').click();
      check(!focusPath&&!document.querySelector('.deepread-focus-source'),'Stop removes the path and spotlight');
      document.getElementById('claim').append(' A genuine revision must invalidate this cached path.'); await tick(1100);
      focusButton.click(); document.getElementById('claim').append(' Another revision arrives while the request is pending.'); await tick(2100);
      check(!focusPath&&!document.getElementById('deepread-guide')._deepreadPageMapCache,'Source changes discard a stale in-flight path response');
      focusButton.click(); await tick(1950);
      check(!!focusPath&&count('DEEPREAD_GENERATE_PAGE_MAP')===3,'Changed content can start a fresh valid path');
      result.textContent=checks.join('\n')+'\nRequests: '+JSON.stringify(qaCounts)+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
      return;
    }
    const before=document.documentElement.clientWidth-snapshot().right;
    document.querySelector('main').style.maxWidth='420px'; window.dispatchEvent(new Event('resize')); await tick();
    check(Math.abs(document.documentElement.clientWidth-snapshot().right-before)<1,'Article width cannot move the rail');
    document.querySelector('main').style.removeProperty('max-width'); window.dispatchEvent(new Event('resize')); await tick();
    const map=mapping();
    if(view==='fallback') {
      check(map.fallbackReason==='broader-readable-region' && map.root.tagName==='MAIN','Insufficient article broadens to a coherent main');
      check(!document.getElementById('excluded-nav').hasAttribute('data-deepread-source-id') && !document.getElementById('excluded-comments').hasAttribute('data-deepread-source-id'),'Fallback excludes navigation and comments');
    }
    if(view==='table') {
      check(['td','th','dt','dd','figcaption','span'].every(tag=>map.sources.some(s=>s.tag===tag)),'Tables, definitions, captions and generic sources are covered');
      check(new Set(map.sources.map(s=>s.text)).size===map.sources.length,'Nested table paragraphs are not mapped twice');
      check(map.sources.some(s=>s.level===2 && s.tag==='div'),'Role headings stay mapped');
    }
    if(view==='coverage') {
      check(map.fallbackReason==='low-coverage-broader-region' && map.coverage>.9,'Low coverage broadens even an already substantial article');
      check(map.sources.some(source=>source.text.includes('Detailed body passage 8')) && !document.getElementById('excluded-newsletter').hasAttribute('data-deepread-source-id'),'Coverage recovers body and excludes newsletter');
    }
    if(view==='shadow') {
      check(map.openShadowRoots.length===2 && map.sources.some(source=>source.text.startsWith('This nested component')),'Open and nested shadow content maps to live elements');
      check(map.sources.filter(source=>source.text.startsWith('Slotted original')).length===1 && map.sources.findIndex(source=>source.text.startsWith('Slotted original'))>map.sources.findIndex(source=>source.text.startsWith('This nested component')),'Slotted content retains composed order with no duplicate anchors');
      check(!map.sources.some(source=>source.text.startsWith('Navigation content')),'Shadow exclusions traverse the host boundary');
      const shadowSource=map.sources.find(source=>source.text.startsWith('The open component'));
      check(globalThis.DeepReadSourceMapping.scrollToSourceId(shadowSource.id) && map.elementsById.get(shadowSource.id).classList.contains('deepread-source-highlight'),'Shadow source navigation uses the real connected element');
      await tick(1000);
    }
    const localNodes=document.getElementById('deepread-guide')._deepreadNodes;
    if(map.sources.filter(isHeadingSource).length>=2) check(localNodes.length===map.sources.filter(isHeadingSource).length,'Local Atlas retains every mapped heading instead of sampling away sections');
    if(view==='hierarchy'||view==='wiki') check(localNodes.map(node=>node.level).includes(4) && localNodes.some(node=>node.level===3&&node.depth===2),'Atlas preserves nested H1/H2/H3/H4 hierarchy before AI');
    lens.click();
    check(Object.keys(qaCounts).length===0 && !panel.hidden,'Opening Lens choices alone sends no request');
    const context=document.getElementById('deepread-smart-action'); const critical=document.getElementById('deepread-critical-action');
    context.focus(); context.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    check(document.activeElement===critical && Object.keys(qaCounts).length===0,'Arrow keys focus choices without starting analysis');
    context.click(); critical.click(); await tick(480);
    check(count('DEEPREAD_SMART_READING')===1 && count('DEEPREAD_CRITICAL_READING')===1,'Each mode requests once during quick switching');
    check(document.getElementById('deepread-shell').dataset.lensMode==='critical' && document.querySelectorAll('.deepread-smart-spine-point').length===0 && document.querySelectorAll('.deepread-source-tick[data-mode="context"]').length===0,'Late Context response does not reactivate hidden mode');
    check(lens.querySelector('.deepread-lens-count').textContent===(view==='zero'?'0':'3'),'Active mode count includes valid zero');
    await choose('context'); await choose('critical');
    if(panel.hidden) lens.click();
    const panelRect=panel.getBoundingClientRect();
    const overviewRect=document.getElementById('deepread-critical-overview').getBoundingClientRect();
    check(panelRect.left>=11 && panelRect.right<snapshot().left && panelRect.top>=11 && panelRect.bottom<=innerHeight-11 && overviewRect.left>=panelRect.left && overviewRect.right<=panelRect.right,'Lens results stay inside one inward surface');
    check(count('DEEPREAD_SMART_READING')===1 && count('DEEPREAD_CRITICAL_READING')===1,'Both mode caches survive switching');
    check(document.querySelectorAll('.deepread-critical-spine-point').length===(view==='zero'?0:3),'Only active mode has global positions');
    document.getElementById('deepread-critical-overview').querySelector('button').focus();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    check(panel.hidden && document.activeElement===lens,'Escape closes Lens and returns to persistent control');
    lens.click();
    location.hash='measurement'; await tick(1100); await choose('critical');
    check(count('DEEPREAD_CRITICAL_READING')===1 && count('DEEPREAD_SMART_READING')===1,'Anchor navigation preserves both mode caches');
    document.querySelector('.deepread-critical-overview-off').click();
    check(document.getElementById('deepread-shell').dataset.lensMode==='none' && document.querySelectorAll('.deepread-source-tick').length===0,'Turning Lens off removes mode ticks');
    await choose('critical'); check(count('DEEPREAD_CRITICAL_READING')===1,'Turning Lens back on restores cache');
    const atlas=document.getElementById('deepread-rail-toggle'); atlas.click(); await tick();
    atlas.click(); atlas.click();
    check(count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Atlas reuses Page Map');
    const guide=document.getElementById('deepread-guide').getBoundingClientRect();
    check(guide.right<=snapshot().left && Math.abs(snapshot().left-guide.right-20)<2,'Atlas grows inward from the same rail');
    document.querySelector('.deepread-structure-button').click(); await tick();
    check(!!document.querySelector('.deepread-source-annotation[data-kind="atlas"]'),'Atlas follows source and leaves a trace');
    if(view!=='zero') {
      await choose('critical');
      const points=[...document.querySelectorAll('.deepread-spine-point,.deepread-critical-spine-point')].map(e=>e.getBoundingClientRect()).sort((a,b)=>a.top-b.top);
      check(points.every((r,i)=>!i||r.top>=points[i-1].bottom-1),'Global finding positions do not collide');
      lens.click(); // close overview before checking source-edge affordances
      const tickElement=[...document.querySelectorAll('.deepread-source-tick')].find(e=>!e.hidden);
      check(!!tickElement,'Active Lens visibly marks a real source edge');
      const tickRect=tickElement.getBoundingClientRect();
      const sourceRect=map.elementsById.get(tickElement.dataset.sourceId).getBoundingClientRect();
      check(tickRect.right<=sourceRect.left || tickRect.left>=sourceRect.right,'Source tick does not cover original text');
      tickElement.querySelector('button').focus();
      check(!!document.querySelector('.deepread-source-peek') && !!document.getElementById('deepread-xray-label'),'Keyboard tick focus previews the original passage');
      tickElement.querySelector('button').click(); await tick();
      check(panel.hidden && !!document.querySelector('.deepread-source-annotation[data-kind="critical"].is-open'),'Critical tick opens one source-attached detail');
      // Open the first finding explicitly so the multiple-citation contract is deterministic.
      await choose('critical'); document.querySelector('.deepread-critical-overview-item').click(); await tick();
      const note=document.querySelector('.deepread-source-annotation[data-kind="critical"].is-open');
      const detail=note.querySelector('.deepread-trace-detail').getBoundingClientRect();
      check(detail.left>=7 && detail.right<=snapshot().left-29 && detail.top>=7 && detail.bottom<=innerHeight-7,'Expanded trace stays inside viewport and inward of rail');
      const related=note.querySelector('.deepread-trace-source-links button'); check(!!related,'Multiple Critical citations remain navigable');
      related.click(); check(document.querySelector('.deepread-source-highlight')?.textContent.includes('models shade'),'Related source is the real cited passage');
      await selectExplain();
      check(!!document.getElementById('deepread-explanation-card') && panel.hidden && document.querySelectorAll('.deepread-source-annotation.is-open').length===0,'Explain takes priority over Lens and trace details');
      document.querySelector('.deepread-explanation-close').click();
      document.querySelector('.deepread-source-annotation[data-kind="explained"] .deepread-trace-toggle').click();
      check(count('DEEPREAD_EXPLAIN_SELECTION')===1,'Explained trace reuses saved response');
      await choose('context');
      check(!document.getElementById('deepread-explanation-card') && document.querySelectorAll('.deepread-source-annotation.is-open').length===0,'Lens overview reduces competing details');
      document.querySelector('.deepread-smart-overview-item').click(); await tick();
      check(document.querySelectorAll('.deepread-source-annotation.is-open').length===1,'Expanded traces remain one at a time');
      for(let i=1;i<smartReadingItems.length;i++) {
        await choose('context'); document.querySelectorAll('.deepread-smart-overview-item')[i].click(); await tick();
      }
      check(readingTrail.length<=5 && readingTrail.length>=3,'Reading Trail remains bounded and source-linked');
      check(document.querySelectorAll('.deepread-source-annotation.is-latest').length===1 && document.querySelectorAll('.deepread-source-annotation.is-history').length>=2,'Latest trace has priority; older traces recede');
      const margins=[...document.querySelectorAll('.deepread-margin-item')].filter(e=>!e.hidden).map(e=>e.getBoundingClientRect());
      check(margins.every(r=>r.right<=snapshot().left-24),'No annotation lives outside the rail');
      await choose('critical'); window.dispatchEvent(new Event('scroll'));
      check(panel.hidden,'Continuing to read closes Lens details');
      const focusAction=document.getElementById('deepread-focus-action');
      focusAction.click(); await tick();
      const focusPanel=document.getElementById('deepread-focus-panel');
      check(!!focusPath && !focusPanel.hidden && focusPath.steps.length>=2 && focusPath.steps.length<=5,'Focus Path creates a short sequence of original passages');
      check(count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Focus reuses the cached Atlas request');
      const firstFocus=focusPath.steps[0].sourceId;
      const firstRect=map.elementsById.get(firstFocus).getBoundingClientRect(),guideRect=focusPanel.getBoundingClientRect();
      if(innerHeight>=700) check(guideRect.right<=firstRect.left||guideRect.left>=firstRect.right||guideRect.bottom<=firstRect.top||guideRect.top>=firstRect.bottom,'Focus controls avoid covering the guided passage when space permits');
      check(map.elementsById.get(firstFocus).classList.contains('deepread-focus-source'),'Focus spotlights the real first passage');
      focusPanel.querySelector('[data-step="next"]').click();
      check(focusPath.index===1 && document.querySelectorAll('.deepread-focus-source').length===1 && focusPanel.querySelector('.deepread-focus-progress').textContent.startsWith('2 /'),'Next moves source and progress with one spotlight');
      focusPanel.querySelector('[data-step="previous"]').click();
      check(focusPath.index===0 && focusPanel.querySelector('[data-step="previous"]').disabled,'Previous returns to first source and respects boundaries');
      location.hash='measurement'; await tick(1050);
      check(!!focusPath && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Focus survives ordinary anchor navigation');
      const focusRect=focusPanel.getBoundingClientRect();
      check(focusRect.left>=10&&focusRect.right<snapshot().left&&focusRect.bottom<=innerHeight-10,'Focus surface fits inward of the rail at this viewport');
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(!!focusPath&&focusPanel.hidden&&document.activeElement===focusAction,'Escape dismisses the guide surface and preserves resumable progress');
      focusAction.click(); await tick();
      await selectExplain();
      check(!!focusPath && !!document.getElementById('deepread-explanation-card') && focusPanel.hidden,'Explain takes detail priority while the guided sequence survives');
      focusAction.click(); await tick();
      check(!document.getElementById('deepread-explanation-card') && !focusPanel.hidden && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Focus resumes without another request or floating explanation');
      const beforeUnrelated=mapping();
      const unrelated=document.createElement('div'); unrelated.textContent='Unmapped short UI'; document.body.append(unrelated); await tick(1100);
      check(mapping()===beforeUnrelated&&!!focusPath&&count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Unrelated DOM updates preserve the same Source Map and path');
      unrelated.remove(); await tick(1000);
      if(view==='inferred') {
        const guide=document.getElementById('deepread-guide');
        check(guide._deepreadNodes.every(node=>node.inferred),'Weak headings use ordered inferred sections instead of a heading hierarchy');
        renderAiPageMap(guide,[{label:'First range',kind:'CONTEXT',sourceIds:[map.sources[0].id,map.sources[1].id]},{label:'Overlapping range',kind:'CLAIM',sourceIds:[map.sources[1].id]},{label:'Conclusion',kind:'CONCLUSION',sourceIds:[map.sources[2].id]}],map);
        check(guide._deepreadNodes.length===2&&!guide._deepreadNodes.some(node=>node.label==='Overlapping range'),'Inferred overlapping section ranges are rejected');
        renderAiPageMap(guide,guide._deepreadPageMapCache.nodes,map);
      }
      if(view==='shadow') {
        const old=mapping(); old.elementsById.get(old.sources.find(source=>source.text.startsWith('The open component')).id).append(' New substantive evidence has been added.'); await tick(1100);
        check(mapping()!==old&&!focusPath,'Open shadow text changes safely reset guided reading');
        focusAction.click(); await tick();
      }
      // Mutation rebuild should invalidate map caches, not silently reuse old findings.
      const oldMap=mapping(); const claim=document.getElementById('claim'); claim.append(' The draft has now been revised to record an additional condition.');
      await tick(1150);
      check(mapping()!==oldMap && readingTrail.length===0 && !focusPath && !document.querySelector('.deepread-focus-source'),'Genuine source changes reset Focus, spotlight, map and session trail');
      await choose('context'); await choose('critical');
      check(count('DEEPREAD_SMART_READING')===2 && count('DEEPREAD_CRITICAL_READING')===2,'Changed Source Map requests fresh results for each mode');
      atlas.click(); await tick(); check(count('DEEPREAD_GENERATE_PAGE_MAP')===(view==='shadow'?3:2),'Changed Source Map refreshes Atlas');
      atlas.click();
    }
    document.getElementById('deepread-launcher').click();
    check(document.getElementById('deepread-shell').dataset.mode==='dormant'&&document.querySelector('.deepread-spine').inert,'Exit restores dormant state with controls inert');
    result.textContent=checks.join('\n')+'\nRequests: '+JSON.stringify(qaCounts)+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
  } catch(error) { result.textContent=checks.join('\n')+'\nFAILED: '+error.message+'\nRequests: '+JSON.stringify(qaCounts); }
});
if(new URLSearchParams(location.search).has('autorun')) window.addEventListener('load',()=>document.getElementById('qa-run').click(),{once:true});
if(new URLSearchParams(location.search).has('demo')) window.addEventListener('load',async()=>{
  await choose('context'); document.getElementById('deepread-lens-action').click();
  document.getElementById('claim').scrollIntoView({block:'center',behavior:'instant'});
},{once:true});

if(new URLSearchParams(location.search).has('atlasdemo')) window.addEventListener('load',async()=>{
  document.getElementById('deepread-launcher').click();
  document.getElementById('deepread-rail-toggle').click();
},{once:true});
if(new URLSearchParams(location.search).has('focusdemo')) window.addEventListener('load',()=>{
  document.getElementById('deepread-launcher').click();
  document.getElementById('deepread-focus-action').click();
},{once:true});
