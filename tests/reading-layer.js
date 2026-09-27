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
if (view === 'tall') { document.getElementById('claim').textContent = Array(12).fill(sampleA).join(' '); article.style.maxWidth='none'; article.parentElement.style.maxWidth='none'; }
if (view === 'longoutline') article.insertAdjacentHTML('beforeend', Array.from({length:50},(_,i)=>`<h2>Research section ${i+1}</h2><p>${sampleB}</p>`).join(''));
if (view === 'long') article.insertAdjacentHTML('beforeend', Array.from({length:80},(_,i)=>`<p>Original research passage ${i+1}. ${sampleB}</p>`).join(''));
if (view === 'clutter') {
  article.style.maxWidth='640px'; article.parentElement.style.marginLeft='260px';
  document.body.insertAdjacentHTML('beforeend','<aside style="position:fixed;left:0;top:0;bottom:0;width:230px;background:#e7eae8;padding:12px;box-sizing:border-box">Host navigation and research cards</aside><aside style="position:fixed;right:0;top:0;bottom:0;width:230px;background:#e7eae8;padding:12px;box-sizing:border-box">Host related research sidebar</aside>');
}
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
const qaExplainRequests = [];
let qaToolbarListener;
globalThis.chrome = { runtime: {
  onMessage: { addListener(listener) { qaToolbarListener = listener; } },
  sendMessage(message, callback) {
    qaCounts[message.type] = (qaCounts[message.type] || 0) + 1;
    if (message.type === 'DEEPREAD_EXPLAIN_SELECTION') qaExplainRequests.push(message.payload);
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
    if (new URLSearchParams(location.search).has('aifailure')) response={ok:false,message:'Mocked provider unavailable; local navigation remains available.'};
    if (message.type === 'DEEPREAD_GENERATE_PAGE_MAP' && new URLSearchParams(location.search).has('flowzero')) response={ok:true,pageMap:{nodes:[],focusPath:[]}};
    if (message.type === 'DEEPREAD_GENERATE_PAGE_MAP' && new URLSearchParams(location.search).has('flowweak')) response={ok:true,pageMap:{nodes:[],focusPath:[{label:'Original unclassified passage',kind:'possibly illustrative or evidence',sourceIds:[first.id]}]}};
    if (new URLSearchParams(location.search).has('guidederror') && message.type==='DEEPREAD_EXPLAIN_SELECTION' && qaCounts[message.type]===1) response={ok:false,message:'Mocked Explain failure. Try again.'};
    if (new URLSearchParams(location.search).has('selectionerror') && message.type==='DEEPREAD_EXPLAIN_SELECTION' && qaCounts[message.type]===1) response={ok:false,message:'Mocked selected Explain failure. Try again.'};
    setTimeout(()=>callback(response), (new URLSearchParams(location.search).has('explainrace') || new URLSearchParams(location.search).has('guidedrace')) && message.type==='DEEPREAD_EXPLAIN_SELECTION' ? 1500 : new URLSearchParams(location.search).has('race') && message.type==='DEEPREAD_GENERATE_PAGE_MAP' ? 1800 : message.type==='DEEPREAD_SMART_READING'?380:180);
  }
} };
// Timers alone can resolve before scheduled layout in a busy iframe matrix.
// Keep the existing transition delay, then let queued layout frames settle.
const tick = (ms=280) => new Promise(resolve=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),ms));
const choose = async (mode, browse = true) => {
  const panel=document.getElementById('deepread-lens-panel');
  if (panel.hidden) document.getElementById('deepread-lens-action').click();
  document.getElementById(mode==='context'?'deepread-smart-action':'deepread-critical-action').click();
  await tick();
  if (mode==='context' && browse) {
    document.getElementById('deepread-lens-action').click();
    document.querySelector('.deepread-context-browse').click();
  }
};
const followAtlas = () => {
  const shell=document.getElementById('deepread-shell');
  if (!shell.classList.contains('deepread-shell--expanded')) document.getElementById('deepread-rail-toggle').click();
  document.getElementById('deepread-focus-action').click();
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
  let lens, panel, rail;
  const snapshot=()=>rail.getBoundingClientRect();
  const expectedOffset=()=>Math.min(28,Math.max(16,innerWidth*.02));
  const count=type=>qaCounts[type]||0;
  try {
    check(document.getElementById('deepread-shell').dataset.mode==='dormant' && !document.querySelector('.deepread-spine') && !mapping() && !DeepReadDebug.snapshot().observersActive && Object.keys(qaCounts).length===0,'Dormant load creates only launcher: no map, reading UI, observers or AI');
    const dormantRange=document.createRange(); dormantRange.selectNodeContents(document.getElementById('claim'));
    window.getSelection().addRange(dormantRange); document.dispatchEvent(new Event('selectionchange')); await tick(30);
    check(!document.getElementById('deepread-selection-action'),'Dormant selection leaves normal webpage selection alone');
    window.getSelection().removeAllRanges();
    qaToolbarListener({type:'TOGGLE_DEEPREAD_GUIDE'}, {}, () => {});
    lens=document.getElementById('deepread-lens-action'); panel=document.getElementById('deepread-lens-panel'); rail=document.querySelector('.deepread-spine');
    check(document.getElementById('deepread-shell').dataset.mode==='active'&&Object.keys(qaCounts).length===0,'Toolbar message activates mode without AI or popup');
    if(new URLSearchParams(location.search).has('hierarchyqa')) {
      const hint=document.getElementById('deepread-reading-hint');
      check(!!hint && hint.textContent.includes('Select text') && hint.textContent.includes('Understand / Examine') && hint.querySelector('[aria-label="Dismiss reading hint"]'),'First activation gives one small dismissible reading-actions hint');
      if(view==='light' && !new URLSearchParams(location.search).has('selectionerror')) { await tick(8200); check(!document.getElementById('deepread-reading-hint'),'Hint disappears naturally after its short reading window'); }
      else { hint.querySelector('button').click(); check(!document.getElementById('deepread-reading-hint'),'Hint can be dismissed without AI or blocking reading'); }
    }
    qaToolbarListener({type:'TOGGLE_DEEPREAD_GUIDE'}, {}, () => {});
    check(document.getElementById('deepread-shell').dataset.mode==='dormant','Second toolbar message returns to dormant mode');
    document.getElementById('deepread-launcher').click();
    check(document.getElementById('deepread-shell').dataset.mode==='active' && !document.querySelector('.deepread-spine').inert,'One launcher click activates the reading layer');
    check(Math.abs(document.documentElement.clientWidth-snapshot().right-expectedOffset())<2,'Rail uses viewport right offset');
    check(document.querySelectorAll('.deepread-spine > button').length===2 && document.getElementById('deepread-guide').contains(document.getElementById('deepread-focus-action')),'Persistent rail has only Atlas and Lens; Guided Read belongs to Atlas');
    check(DeepReadDebug.snapshot().builds===1 && DeepReadDebug.snapshot().validations===1 && document.querySelectorAll('#deepread-launcher').length===1,'Reactivation validates cached region and does not duplicate UI or rebuild');
    if(new URLSearchParams(location.search).has('hierarchyqa')) {
      const params=new URLSearchParams(location.search), guide=document.getElementById('deepread-guide');
      check(!document.getElementById('deepread-reading-hint'),'Reactivation never repeats the hint in this page session');
      check(document.querySelectorAll('.deepread-spine > button').length===2 && guide.contains(document.getElementById('deepread-flow-action')) && document.getElementById('deepread-flow-action').textContent==='Show structure on page','Atlas owns task-oriented structure/guide actions without more primary controls');
      lens.click();
      check(document.getElementById('deepread-smart-action').textContent.includes('Understand') && document.getElementById('deepread-critical-action').textContent.includes('Questions worth considering') && document.querySelector('.deepread-lens-tabs').getAttribute('aria-orientation')==='vertical','Lens exposes distinct Understand and Examine purposes');
      document.getElementById('deepread-rail-toggle').click(); document.getElementById('deepread-flow-action').click(); await tick();
      const savedFlow=readingFlow, item=savedFlow.items[0], fullWash=getComputedStyle(item.element).backgroundImage;
      followAtlas(); await tick();
      check(!!focusPath && readingFlow===savedFlow && getComputedStyle(item.element).backgroundImage==='none' && focusElement.classList.contains('deepread-focus-source'),'Guided spotlight takes priority while the structural map remains intact');
      document.querySelector('.deepread-focus-stop').click(); await tick();
      check(readingFlow===savedFlow && getComputedStyle(item.element).backgroundImage===fullWash && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Stopping Guide restores structural emphasis with no new Page Map');
      const claim=document.getElementById('claim'), originalStyle=claim.getAttribute('style'), sourceId=claim.getAttribute('data-deepread-source-id');
      claim.scrollIntoView({block:'center',behavior:'instant'}); await tick();
      const select = (target=claim, pointer=false) => {
        window.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange'));
        if(pointer) target.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));
        const range=document.createRange(); range.selectNodeContents(target); window.getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
        return range;
      };
      const safeAction = () => {
        const action=document.getElementById('deepread-selection-action');
        if(!action || action.hidden) return false;
        const r=action.getBoundingClientRect(), boxes=[...window.getSelection().getRangeAt(0).getClientRects()];
        return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && !boxes.some(box=>r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top);
      };
      select(claim,true);
      check(!document.getElementById('deepread-selection-action'),'Dragging selection does not produce moving action UI');
      document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})); await tick(100);
      const action=document.getElementById('deepread-selection-action'), button=action.querySelector('.deepread-selection-explain');
      check(safeAction() && action.querySelector('.deepread-selection-mark').textContent==='D' && button.getAttribute('aria-label').includes('DeepRead') && count('DEEPREAD_EXPLAIN_SELECTION')===0,'Completed selection reveals a recognisable source-adjacent action without covering selected text or sending AI');
      if(view==='light' && innerWidth>700) {
        const actionRect=action.getBoundingClientRect(), next=claim.nextElementSibling.getBoundingClientRect();
        check(!(actionRect.left<next.right && actionRect.right>next.left && actionRect.top<next.bottom && actionRect.bottom>next.top),'Article action also avoids the following paragraph when a free margin exists');
      }
      const selected=window.getSelection().toString(); button.focus({preventScroll:true});
      check(document.activeElement===button && window.getSelection().toString()===selected && getComputedStyle(button).outlineStyle!=='none','Keyboard focus is visible and preserves native text selection');
      button.click();
      check(action.dataset.state==='loading' && action.getAttribute('aria-busy')==='true' && button.disabled && count('DEEPREAD_EXPLAIN_SELECTION')===1,'Explain has a calm explicit loading state using the existing request');
      document.dispatchEvent(new Event('selectionchange'));
      check(button.disabled && count('DEEPREAD_EXPLAIN_SELECTION')===1,'Repeated same-selection notifications cannot reset loading or duplicate a request');
      await tick();
      if(params.has('selectionerror')) {
        check(action.dataset.state==='error' && !button.disabled && button.textContent==='Try again' && safeAction(),'Error offers a bounded retry on the same selection');
        button.click(); await tick();
      }
      const card=document.getElementById('deepread-explanation-card');
      check(!!card && card.dataset.state==='success' && card.querySelector('header').textContent.includes('UNDERSTAND') && card.dataset.sourceId===sourceId && qaExplainRequests[0].text===selected && !!qaExplainRequests[0].context,'Success uses the existing source-linked explanation and Understand hierarchy');
      const oldTabindex=claim.getAttribute('tabindex'); card.querySelector('.deepread-explanation-close').click();
      check(document.activeElement===claim && readingTrail.some(trace=>trace.kind==='explained'&&trace.sourceId===sourceId),'Closing a selected explanation returns focus to its source and records the existing Trail');
      claim.blur(); check(claim.getAttribute('tabindex')===oldTabindex,'Temporary source focus attribute is restored on blur');
      select(); await tick(100); document.querySelector('.deepread-selection-dismiss').click();
      check(!document.getElementById('deepread-selection-action') && document.activeElement===claim,'Explicit dismiss removes the affordance and returns source focus');
      document.dispatchEvent(new Event('selectionchange')); await tick(100);
      check(!document.getElementById('deepread-selection-action'),'A dismissed unchanged selection stays dismissed');
      select(); await tick(100); document.querySelector('.deepread-selection-explain').focus(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(!document.getElementById('deepread-selection-action') && document.activeElement===claim,'Escape dismisses the keyboard action and returns to the source');
      // Long selections and both vertical viewport edges use actual Range geometry.
      const range=select(); await tick(100);
      const bottom=range.getBoundingClientRect().bottom;
      window.scrollBy(0,bottom-(innerHeight-18)); await tick(); select(); await tick(100);
      check(safeAction(),'Selection near the viewport bottom repositions above or into a safe margin');
      window.scrollBy(0,range.getBoundingClientRect().top-12); await tick(); select(); await tick(100);
      check(safeAction(),'Selection near the viewport top remains bounded and avoids selected text');
      claim.style.maxWidth='280px'; window.dispatchEvent(new Event('resize')); await tick(100);
      check(safeAction() && document.querySelectorAll('#deepread-selection-action').length===1,'Resize remeasures the live Range without duplicate selection components');
      if(originalStyle===null) claim.removeAttribute('style'); else claim.setAttribute('style',originalStyle);
      window.dispatchEvent(new Event('resize')); await tick(100);
      select(mapping().root); await tick(100);
      check(safeAction(),'Long multi-paragraph selection can use a compact page-edge action');
      window.dispatchEvent(new Event('scroll')); await tick(100);
      check(!document.getElementById('deepread-selection-action'),'Scrolling dismisses transient selection UI and scheduled work');
      select(); await tick(100); claim.append(' A substantive change invalidates selected action geometry.'); await tick(1100);
      check(!document.getElementById('deepread-selection-action') && !readingFlow,'Source rebuild cancels the selection component and stale structural map');
      check(claim.getAttribute('tabindex')===oldTabindex,'Source rebuild restores temporary source focus attributes');
      document.getElementById('deepread-launcher').click(); select(); await tick(100);
      check(!document.getElementById('deepread-selection-action') && !document.getElementById('deepread-reading-hint') && !DeepReadDebug.snapshot().observersActive,'Dormant mode has no contextual action, hint or reading observers');
      document.getElementById('deepread-launcher').click(); select(); await tick(100);
      check(document.querySelectorAll('#deepread-selection-action').length===1 && !document.getElementById('deepread-reading-hint'),'Reactivation restores selection discovery without duplicated UI or repeated hint');
      document.querySelector('.deepread-selection-dismiss').click();
      document.getElementById('deepread-launcher').click();
      check(claim.getAttribute('tabindex')===oldTabindex,'Exit restores temporary source focus attributes');
      result.textContent=checks.join('\n')+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
      return;
    }
    if(new URLSearchParams(location.search).has('flowqa')) {
      const params=new URLSearchParams(location.search), action=document.getElementById('deepread-flow-action');
      const guide=document.getElementById('deepread-guide');
      check(guide.contains(action) && !document.getElementById('deepread-flow-layer'),'Reading Flow lives in Atlas and is initially off');
      check(readingFlowRole('main claim')==='CLAIM' && readingFlowRole('thesis')==='CLAIM' && readingFlowRole('counterpoint')==='COUNTERPOINT' && readingFlowRole('contrast')==='KEY PASSAGE' && readingFlowRole('not evidence')==='KEY PASSAGE','Role normalisation uses exact supported meanings, never substring inference');
      const builds=DeepReadDebug.snapshot().builds;
      document.getElementById('deepread-rail-toggle').click(); action.click();
      if(params.has('race')) document.getElementById('deepread-focus-action').click();
      check(count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Atlas and Flow (and pending Guided Read) share one provider request');
      await tick(params.has('race')?1950:320);
      if(params.has('aifailure') || params.has('flowzero')) {
        check(!readingFlow && !readingFlowStarting && !document.getElementById('deepread-flow-layer') && action.getAttribute('aria-pressed')==='false' && !document.getElementById('deepread-flow-status').hidden,'Failed or empty AI structure produces an honest status and no invented markers');
        if(params.has('flowzero')) { action.click(); await tick(); check(count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Empty Page Map is cached instead of repeating analysis'); }
        check(guide._deepreadNodes.length>0,'Local Atlas remains usable with zero/error structure');
      } else {
        const flow=readingFlow, map=mapping();
        check(!!flow && flow.sourceMap===map && flow.items.length>0 && flow.items.length<=7,'Flow shows only a bounded set of live AI source passages');
        check(flow.items.every(item=>map.elementsById.get(item.sourceId)===item.sourceElement && item.element.dataset.sourceId===item.sourceId),'Every marker uses its exact cited Source ID and Element');
        check(DeepReadDebug.snapshot().builds===builds,'Overlay activation does not rebuild or duplicate source analysis');
        if(params.has('flowweak')) check(flow.items.length===1 && flow.items[0].role==='KEY PASSAGE','Ambiguous returned role stays generic even without structural nodes');
        const item=flow.items[0], sourceStyle=item.sourceElement.getAttribute('style');
        item.sourceElement.scrollIntoView({block:'center',behavior:'instant'}); await tick();
        const button=item.element.querySelector('button');
        check(!item.element.hidden && !button.hidden && button.getAttribute('aria-label').includes(item.label),'Visible source has a keyboard button with role and source label');
        button.focus({preventScroll:true}); button.click(); await tick();
        check(item.sourceElement.classList.contains('deepread-source-highlight'),'Marker navigates to and emphasises the original source');
        const markers=flow.items.filter(item=>!item.element.hidden).map(item=>item.element.querySelector('button')).filter(button=>!button.hidden);
        check(markers.every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),'Visible Flow labels stay bounded at this viewport');
        if(innerWidth<=620) check(markers.every(button=>button.classList.contains('is-compact')),'Narrow viewport uses small numbered markers');
        if(view==='tall') { window.scrollBy(0,160); await tick(); check(!item.element.hidden && item.element.getBoundingClientRect().top>=11,'Tall passage marker follows its visible portion'); }
        check(item.sourceElement.getAttribute('style')===sourceStyle && !item.sourceElement.classList.contains('deepread-flow-source'),'Flow never modifies host style or adds permanent source classes');
        action.click();
        check(!readingFlow && !document.getElementById('deepread-flow-layer') && !document.querySelector('.is-flow-current'),'Off removes treatments, buttons/listeners and Spine emphasis');
        action.click(); await tick();
        check(!!readingFlow && count('DEEPREAD_GENERATE_PAGE_MAP')===1 && document.querySelectorAll('#deepread-flow-layer').length===1,'Re-enable reuses cache and creates exactly one layer');
        location.hash='measurement'; await tick();
        check(!!readingFlow && readingFlow.sourceMap===map && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Hash navigation preserves structural annotations and cache');
        if(!params.has('flowweak')) { followAtlas(); await tick(); check(!!focusPath && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Guided Read still consumes the same cached path with Flow on'); }
        document.getElementById('claim').append(' A substantive revision removes stale structural annotations.'); await tick(1100);
        check(!readingFlow && !document.getElementById('deepread-flow-layer') && mapping()!==map,'Content rebuild clears all stale annotations using existing invalidation');
        action.click(); await tick(params.has('race')?1950:320);
        check(!!readingFlow && readingFlow.sourceMap===mapping(),'Flow can use a fresh map after source rebuild');
        const clone=mapping().root.cloneNode(true); mapping().root.replaceWith(clone); await tick(1100);
        check(!readingFlow && !document.getElementById('deepread-flow-layer'),'Reading root replacement removes old markers');
        action.click(); await tick(params.has('race')?1950:320);
        history.replaceState({},'',location.pathname+location.search+'&flowroute=1'); window.dispatchEvent(new PopStateEvent('popstate'));
        check(!readingFlow && !document.getElementById('deepread-flow-layer'),'Route invalidation immediately removes Flow even when text remains the same');
        await tick(1100); action.click(); await tick(params.has('race')?1950:320);
        document.getElementById('deepread-launcher').click();
        check(!readingFlow && !readingFlowStarting && !document.getElementById('deepread-flow-layer') && !DeepReadDebug.snapshot().observersActive,'Exit removes Flow and keeps dormant observers disconnected');
        document.getElementById('deepread-launcher').click();
        check(!readingFlow,'Reactivation does not silently restore Flow');
        if(params.has('race')) {
          document.getElementById('claim').append(' New pending map revision.'); await tick(1100);
          action.click(); action.click(); await tick(1950);
          check(!readingFlow && !readingFlowStarting,'Turning off during pending request prevents late overlay creation');
          action.click(); await tick(); check(!!readingFlow,'Cancelled pending result remains reusable in shared cache');
          document.getElementById('claim').append(' Invalidate before pending result.'); await tick(1100);
          action.click(); document.getElementById('claim').append(' Another real revision.'); await tick(2100);
          check(!readingFlow && !readingFlowStarting && !guide._deepreadPageMapCache,'Rebuild rejects a stale pending Flow result');
          action.click(); document.getElementById('deepread-launcher').click(); await tick(1950);
          check(!readingFlow && !readingFlowStarting && !document.getElementById('deepread-flow-layer') && !DeepReadDebug.snapshot().observersActive,'Exit during pending Flow prevents late overlays and observers');
        }
      }
      if(deepReadActive) document.getElementById('deepread-launcher').click();
      check(!document.getElementById('deepread-flow-layer') && !DeepReadDebug.snapshot().observersActive,'All Flow scenarios finish cleanly dormant');
      result.textContent=checks.join('\n')+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
      return;
    }
    if (new URLSearchParams(location.search).has('guidedrace') || new URLSearchParams(location.search).has('guidederror')) {
      followAtlas(); await tick();
      const guided = document.getElementById('deepread-focus-panel'), action = guided.querySelector('.deepread-focus-explain');
      action.click();
      if (new URLSearchParams(location.search).has('guidederror')) {
        await tick();
        check(!action.disabled && !guided.querySelector('.deepread-focus-explain-status').hidden && !document.getElementById('deepread-explanation-card') && focusPath.index===0,'Failed Guided Explain offers retry without losing progress or inventing an answer');
        action.click(); await tick();
        check(!!document.getElementById('deepread-explanation-card') && count('DEEPREAD_EXPLAIN_SELECTION')===2,'Guided Explain retries through the same request path');
      } else {
        guided.querySelector('[data-step="next"]').click(); await tick(1600);
        check(!document.getElementById('deepread-explanation-card') && focusPath.index===1 && !action.disabled,'Moving to another passage cancels late Guided Explain');
        action.click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await tick(1600);
        check(!document.getElementById('deepread-explanation-card') && guided.hidden && !!focusPath,'Escape cancels a pending explanation and retains resumable progress');
        followAtlas(); action.click(); document.getElementById('deepread-launcher').click(); await tick(1600);
        check(!document.getElementById('deepread-explanation-card') && !focusPath && !DeepReadDebug.snapshot().observersActive,'Exit cancels pending Guided Explain without reopening dormant UI');
        document.getElementById('deepread-launcher').click(); followAtlas(); await tick(); action.click();
        document.getElementById('claim').firstChild.textContent+=' A substantive source edit invalidates this explanation.'; await tick(1700);
        check(!document.getElementById('deepread-explanation-card') && !focusPath,'Source rebuild rejects late Guided Explain and clears the old sequence');
      }
      result.textContent=checks.join('\n')+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
      return;
    }
    if(new URLSearchParams(location.search).has('aifailure')) {
      const local=document.getElementById('deepread-guide')._deepreadNodes.map(node=>node.label);
      document.getElementById('deepread-rail-toggle').click();
      check(local.length>0 && document.querySelectorAll('.deepread-structure-button').length===local.length,'Atlas opens immediately with local navigation before a provider response');
      await tick();
      check(!document.getElementById('deepread-guide')._deepreadPageMapCache && !document.querySelector('.deepread-structure-error').hidden && document.getElementById('deepread-guide')._deepreadNodes.map(node=>node.label).join()===local.join(),'Provider failure preserves every original heading and local anchor');
      document.querySelector('.deepread-structure-button').click();
      check(!!document.querySelector('.deepread-source-highlight'),'Local source navigation works after provider failure');
      result.textContent=checks.join('\n')+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
      return;
    }
    if(new URLSearchParams(location.search).has('explainrace')) {
      const originalMap=mapping(), paragraph=document.getElementById('claim');
      paragraph.scrollIntoView({block:'center',behavior:'instant'}); await tick();
      const range=document.createRange(); range.selectNodeContents(paragraph); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
      document.querySelector('.deepread-selection-explain').click();
      const newPassage=document.createElement('p'); newPassage.textContent='New original evidence was inserted before the selected passage while its explanation was pending.'; paragraph.before(newPassage);
      await tick(1100);
      check(mapping()!==originalMap && (!selectionAction || (selectionContext?.sourceId===paragraph.getAttribute('data-deepread-source-id') && !selectionAction.querySelector('button').disabled)),'Changed source IDs cancel the pending request; any renewed selection uses the current anchor');
      await tick(600);
      check(!document.getElementById('deepread-explanation-card') && count('DEEPREAD_EXPLAIN_SELECTION')===1,'Late Explain cannot attach an outdated answer to a rebuilt source map');
      document.getElementById('deepread-launcher').click();
      result.textContent=checks.join('\n')+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
      return;
    }
    if(new URLSearchParams(location.search).has('race')) {
      const focusButton=document.getElementById('deepread-focus-action');
      const atlasButton=document.getElementById('deepread-rail-toggle');
      atlasButton.click();
      check(document.querySelectorAll('.deepread-structure-button').length>0 && !document.getElementById('deepread-guide')._deepreadPageMapCache,'Local Atlas is visible while delayed AI enrichment is pending');
      const bannerUpdate=document.createElement("div");bannerUpdate.textContent="Unrelated short update";document.body.append(bannerUpdate);await tick(50);
      focusButton.click();
      check(count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Cold Focus and Atlas share a single pending request');
      document.getElementById('deepread-launcher').click(); await tick(1950);
      check(!focusPath&&document.getElementById('deepread-shell').dataset.mode==='dormant','Late response cannot reactivate a dismissed guided mode');
      document.getElementById('deepread-launcher').click(); followAtlas(); await tick();
      check(!!focusPath&&count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Restart uses cached response from the dismissed pending request');
      document.querySelector('.deepread-focus-stop').click();
      check(!focusPath&&!document.querySelector('.deepread-focus-source'),'Stop removes the path and spotlight');
      document.getElementById('claim').append(' A genuine revision must invalidate this cached path.'); await tick(1100);
      followAtlas(); document.getElementById('claim').append(' Another revision arrives while the request is pending.'); await tick(2100);
      check(!focusPath&&!document.getElementById('deepread-guide')._deepreadPageMapCache,'Source changes discard a stale in-flight path response');
      followAtlas(); await tick(1950);
      check(!!focusPath&&count('DEEPREAD_GENERATE_PAGE_MAP')===3,'Changed content can start a fresh valid path');
      result.textContent=checks.join('\n')+'\nRequests: '+JSON.stringify(qaCounts)+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
      return;
    }
    const before=document.documentElement.clientWidth-snapshot().right;
    const originalMaxWidth=document.querySelector('main').style.maxWidth;
    document.querySelector('main').style.maxWidth='420px'; window.dispatchEvent(new Event('resize')); await tick();
    check(Math.abs(document.documentElement.clientWidth-snapshot().right-before)<1,'Article width cannot move the rail');
    document.querySelector('main').style.maxWidth=originalMaxWidth; window.dispatchEvent(new Event('resize')); await tick();
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
    await choose('context', false);
    check(panel.hidden && document.getElementById('deepread-smart-overview').hidden && !document.querySelector('.deepread-smart-spine-point'),'Context restores ambient ticks without forcing an overview');
    if(view!=='zero') {
      mapping().elementsById.get(smartReadingItems[0].sourceId).scrollIntoView({block:'center',behavior:'instant'}); await tick();
      const contextMarker=[...document.querySelectorAll('.deepread-source-tick[data-mode="context"]')].find(marker=>!marker.hidden);
      check(!!contextMarker,'Context retains a visible source tick where host content leaves room');
      const contextTick=contextMarker.querySelector('button');
      contextTick.focus();
      check(document.querySelector('#deepread-xray-label .deepread-xray-excerpt')?.textContent===smartReadingItems.find(item=>item.sourceId===contextMarker.dataset.sourceId).hint && !document.querySelector('.deepread-source-peek'),'Context focus immediately reveals comprehension aid without a heavy source outline');
    }
    await choose('critical');
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
    await tick(); // Measure after the existing 190 ms Atlas transition settles.
    const guide=document.getElementById('deepread-guide').getBoundingClientRect();
    check(guide.left>=10 && guide.right<=snapshot().left-12 && guide.top>=10 && guide.bottom<=innerHeight-10,'Adaptive Atlas remains inside the viewport and inward of the rail');
    if(view==='longoutline') check(document.querySelector('.deepread-structure-list').scrollHeight>document.querySelector('.deepread-structure-list').clientHeight && document.querySelectorAll('.deepread-structure-button').length>50,'Long hierarchy remains complete in an independently scrollable outline');
    document.querySelector('.deepread-structure-button').click(); await tick();
    check(!!document.querySelector('.deepread-source-annotation[data-kind="atlas"]'),'Atlas follows source and leaves a trace');
    if(new URLSearchParams(location.search).has('flowcoexist')) {
      document.getElementById('deepread-flow-action').click(); await tick();
      check(!!readingFlow && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Reading Flow joins the complete regression loop using cached Atlas');
    }
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
      followAtlas();
      const focusPanel=document.getElementById('deepread-focus-panel');
      // Other concurrent matrix frames can take browser focus during an await.
      // Check this transfer synchronously in the frame that initiated it.
      check(focusPanel.contains(document.activeElement),'Starting Guided Read moves keyboard focus from the hidden Atlas action to visible controls');
      await tick();
      check(!!focusPath && !focusPanel.hidden && focusPath.steps.length>=2 && focusPath.steps.length<=5,'Focus Path creates a short sequence of original passages');
      check(count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Focus reuses the cached Atlas request');
      const firstFocus=focusPath.steps[0].sourceId;
      const firstRect=map.elementsById.get(firstFocus).getBoundingClientRect(),guideRect=focusPanel.getBoundingClientRect();
      if(innerHeight>=700 && view!=='tall') check(guideRect.right<=firstRect.left||guideRect.left>=firstRect.right||guideRect.bottom<=firstRect.top||guideRect.top>=firstRect.bottom,'Focus controls avoid covering the guided passage when space permits');
      if(view==='tall') check(focusPanel.classList.contains('is-compact') && guideRect.height<150 && guideRect.bottom<=innerHeight-10,'Tall full-width passage falls back to compact bounded controls when no free area exists');
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
      check(!!focusPath&&focusPanel.hidden&&document.activeElement===atlas,'Escape dismisses guided controls and returns to Atlas while preserving progress');
      followAtlas(); await tick();
      const guidedExplain=focusPanel.querySelector('.deepread-focus-explain'), beforeExplain=count('DEEPREAD_EXPLAIN_SELECTION');
      const guidedText=map.sources.find(source=>source.id===firstFocus).text;
      guidedExplain.click();
      window.dispatchEvent(new Event('scroll'));
      check(guidedExplain.disabled && guidedExplain.getAttribute('aria-busy')==='true','Guided Explain gives pending feedback and prevents duplicate clicks');
      await tick();
      const guidedCard=document.getElementById('deepread-explanation-card');
      check(!!guidedCard && guidedCard.dataset.sourceId===firstFocus && qaExplainRequests.at(-1).text===guidedText && qaExplainRequests.at(-1).sourceId===firstFocus && count('DEEPREAD_EXPLAIN_SELECTION')===beforeExplain+1,'Guided Explain sends the exact current mapped passage and source ID through existing Explain');
      check(focusPanel.hidden && !!focusPath && !!guidedCard.querySelector('.deepread-explanation-source'),'Explanation keeps progress and exposes return to original source');
      window.dispatchEvent(new Event('scroll')); await tick(30);
      check(document.getElementById('deepread-explanation-card')===guidedCard && focusPath.index===0,'Scrolling keeps mapped Guided Explain attached while preserving its sequence');
      const explanationRect=guidedCard.getBoundingClientRect();
      check(explanationRect.left>=10 && explanationRect.right<=snapshot().left-12 && explanationRect.top>=10 && explanationRect.bottom<=innerHeight-10,'Source-linked explanation remains within viewport bounds');
      guidedCard.querySelector('.deepread-explanation-close').click();
      check(!focusPanel.hidden && focusPath.index===0 && document.activeElement===guidedExplain && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Close resumes the same step and restores keyboard focus without a new Page Map');
      focusPanel.querySelector('[data-step="next"]').click(); focusPanel.querySelector('[data-step="previous"]').click();
      check(focusPath.index===0 && !focusPanel.hidden,'Previous/Next remain usable after Guided Explain');
      guidedExplain.click(); await tick(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(!document.getElementById('deepread-explanation-card') && !focusPanel.hidden && focusPath.index===0,'Escape from Guided Explain returns to the same guided passage');
      guidedExplain.click(); await tick(); document.querySelector('.deepread-explanation-source').click();
      check(!document.getElementById('deepread-explanation-card') && !focusPanel.hidden && focusPath.index===0 && map.elementsById.get(firstFocus).classList.contains('deepread-source-highlight'),'Back to passage navigates to the actual guided source and retains progress');
      await selectExplain();
      check(!!focusPath && !!document.getElementById('deepread-explanation-card') && focusPanel.hidden,'Explain takes detail priority while the guided sequence survives');
      followAtlas(); await tick();
      check(!document.getElementById('deepread-explanation-card') && !focusPanel.hidden && count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Focus resumes without another request or floating explanation');
      const beforeUnrelated=mapping();
      const buildsBeforeUnrelated=DeepReadDebug.snapshot().builds;
      const unrelated=document.createElement('div'); unrelated.textContent='Unmapped short UI'; document.body.append(unrelated); await tick(1100);
      check(mapping()===beforeUnrelated&&!!focusPath&&count('DEEPREAD_GENERATE_PAGE_MAP')===1,'Unrelated DOM updates preserve the same Source Map and path');
      check(DeepReadDebug.snapshot().builds===buildsBeforeUnrelated,'Unrelated outside-region update triggers no expensive map build');
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
        followAtlas(); await tick();
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
    if(view==='cards') {
      const previous=mapping(); document.getElementById('claim').firstChild.nodeValue='Short'; await tick(1100);
      check(mapping()!==previous && !mapping().sources.some(source=>source.text.startsWith('The council expects')),'A mapped generic source shrinking below its threshold still invalidates anchors');
    }
    if(view==='github') {
      const previous=mapping(); const code=[...document.querySelectorAll('article pre')].find(element=>element.textContent.includes('mode')); code.firstChild.nodeValue=code.textContent.replace('mode','  mode'); await tick(1100);
      check(mapping()!==previous,'Meaningful whitespace inside preformatted code invalidates its source');
    }
    document.getElementById('deepread-launcher').click();
    check(document.getElementById('deepread-shell').dataset.mode==='dormant'&&document.querySelector('.deepread-spine').inert,'Exit restores dormant state with controls inert');
    check(!DeepReadDebug.snapshot().observersActive && DeepReadDebug.snapshot().observedShadowRoots===0 && !focusPath && !document.querySelector('.deepread-source-tick'),'Exit disconnects observers and removes guided state and Lens markers');
    const exitRange=document.createRange(); exitRange.selectNodeContents(document.getElementById('claim')); window.getSelection().removeAllRanges(); window.getSelection().addRange(exitRange); document.dispatchEvent(new Event('selectionchange')); await tick(30);
    check(!document.getElementById('deepread-selection-action'),'Selection after exit cannot reopen Explain');
    if(view==='light') {
      const dormantMap=mapping(), buildCount=DeepReadDebug.snapshot().builds;
      document.getElementById('claim').append(' This passage was revised while reading mode was dormant.'); await tick(1100);
      check(mapping()===dormantMap && DeepReadDebug.snapshot().builds===buildCount,'Dormant content changes do not trigger background rebuilds');
      document.getElementById('deepread-launcher').click();
      check(mapping()!==dormantMap && DeepReadDebug.snapshot().builds===buildCount+1,'Reactivation detects substantive dormant revisions');
      const stableMap=mapping(), stableBuilds=DeepReadDebug.snapshot().builds;
      const widget=document.createElement('div'); widget.innerHTML='<button>Refresh</button><time>10:00</time><span role="status">0</span>'; document.querySelector('article').append(widget);
      for(let i=0;i<5;i++) {widget.querySelector('button').textContent='Refresh '+i;widget.querySelector('time').textContent='10:0'+i;widget.querySelector('[role="status"]').textContent=String(i);document.getElementById('claim').style.opacity=String(.9+i*.01);document.getElementById('claim').classList.toggle('qa-style');}
      await tick(1100);
      check(mapping()===stableMap && DeepReadDebug.snapshot().builds===stableBuilds,'Buttons, live counters, clocks and class/style churn cause zero rebuilds');
      widget.remove(); await tick(1000);
      const batchBuilds=DeepReadDebug.snapshot().builds;
      for(let i=0;i<4;i++) document.getElementById('claim').append(' Substantive revision '+i+'.'); await tick(1100);
      check(DeepReadDebug.snapshot().builds===batchBuilds+1 && mapping()!==stableMap,'A batch of substantive source edits performs one debounced rebuild');
      const replacedMap=mapping(); const replacement=document.querySelector('article').cloneNode(true); document.querySelector('article').replaceWith(replacement); await tick(1100);
      check(mapping()!==replacedMap && mapping().root.isConnected && DeepReadDebug.snapshot().reason==='reading-root-replaced','SPA reading-root replacement rebuilds live anchors through shallow ancestor observation');
      const hashMap=mapping(), hashBuilds=DeepReadDebug.snapshot().builds;
      location.hash='claim'; window.dispatchEvent(new PopStateEvent('popstate')); await tick(1000);
      check(mapping()===hashMap && DeepReadDebug.snapshot().builds===hashBuilds,'Hash-only route events do not rebuild document structure');
      const target=new URL(location.href); target.searchParams.set('qa-route','next'); history.pushState({},'',target); window.dispatchEvent(new PopStateEvent('popstate')); await tick(1100);
      check(DeepReadDebug.snapshot().reason==='route-change' && DeepReadDebug.snapshot().builds===hashBuilds+1,'Path/search route change validates mapping without fabricating a new source map');
      window.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); await tick(30);
      const pendingRange=document.createRange(); pendingRange.selectNodeContents(document.getElementById('claim')); window.getSelection().addRange(pendingRange); document.dispatchEvent(new Event('selectionchange'));
      document.querySelector('.deepread-selection-explain').click();
      document.getElementById('deepread-launcher').click();
      await tick();
      check(!document.getElementById('deepread-explanation-card') && !document.getElementById('deepread-selection-action') && !DeepReadDebug.snapshot().observersActive,'A late Explain response cannot reopen UI or observers after exit');
    }
    result.dataset.diagnostics=JSON.stringify(DeepReadDebug.snapshot());
    result.textContent=checks.join('\n')+'\nRequests: '+JSON.stringify(qaCounts)+'\nGemini/runtime mocked. Not unpacked Chrome acceptance.';
  } catch(error) {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const action=document.getElementById('deepread-selection-action');
    result.textContent=checks.join('\n')+'\nFAILED: '+error.message+'\nRequests: '+JSON.stringify(qaCounts)+'\nGeometry: '+JSON.stringify({viewport:[innerWidth,innerHeight],rail:rect('.deepread-spine'),guide:rect('#deepread-guide'),trace:rect('.deepread-source-annotation.is-open .deepread-trace-detail'),action:action&&{hidden:action.hidden,style:action.style.cssText,rect:action.getBoundingClientRect().toJSON()},selectionBounds:window.getSelection().rangeCount?window.getSelection().getRangeAt(0).getBoundingClientRect().toJSON():null});
  }
});
if(new URLSearchParams(location.search).has('autorun')) window.addEventListener('load',()=>document.getElementById('qa-run').click(),{once:true});
if(new URLSearchParams(location.search).has('demo')) window.addEventListener('load',async()=>{
  document.getElementById('deepread-launcher').click();
  await choose('context'); document.getElementById('deepread-lens-action').click();
  document.getElementById('claim').scrollIntoView({block:'center',behavior:'instant'});
},{once:true});

if(new URLSearchParams(location.search).has('atlasdemo')) window.addEventListener('load',async()=>{
  document.getElementById('deepread-launcher').click();
  document.getElementById('deepread-rail-toggle').click();
},{once:true});
if(new URLSearchParams(location.search).has('focusdemo')) window.addEventListener('load',()=>{
  document.getElementById('deepread-launcher').click();
  followAtlas();
},{once:true});
