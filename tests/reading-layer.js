// Test-only runtime. No Gemini calls. Real source mapping + content UI scripts.
const view = new URLSearchParams(location.search).get('view') || 'light';
document.body.classList.add(view);
const qaCounts = {};
globalThis.chrome = { runtime: {
  onMessage: { addListener() {} },
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
    else if (message.type === 'DEEPREAD_GENERATE_PAGE_MAP') response = { ok:true, pageMap:{nodes:sources.filter(s=>/^h[1-6]$/.test(s.tag)).slice(0,6).map(s=>({label:s.text,kind:'section',sourceIds:[s.id]}))} };
    else response = { ok:true, explanation:{plainLanguage:'The proposal expects the trees to help, but the strongest promised outcome depends on conditions.', context:'This passage introduces the plan and its expected effect.', analogy:'Think of the model as a weather forecast with assumptions.'} };
    setTimeout(()=>callback(response), 180);
  }
} };
const tick = () => new Promise(resolve=>setTimeout(resolve,250));
document.getElementById('qa-run').addEventListener('click', async () => {
  const result = document.getElementById('qa-result');
  result.textContent = 'Running interaction checks…';
  const checks = [];
  const check = (condition, label) => { checks.push(`${condition ? 'PASS' : 'FAIL'} ${label}`); if (!condition) throw new Error(label); };
  try {
    check(document.querySelectorAll('.deepread-spine-point').length>0 && Object.keys(qaCounts).length===0, 'Initial Spine uses real sources without AI');
    const atlas = document.getElementById('deepread-rail-toggle');
    atlas.click(); await tick();
    atlas.click(); atlas.click();
    check(qaCounts.DEEPREAD_GENERATE_PAGE_MAP===1, 'Reading Atlas reuses Page Map cache');
    document.querySelector('.deepread-structure-button').click(); await tick();
    check(!!document.querySelector('.deepread-source-annotation[data-kind="atlas"]'), 'Atlas navigation leaves a source-linked trace');
    document.getElementById('deepread-smart-action').click();
    document.getElementById('deepread-critical-action').click();
    await tick();
    check(qaCounts.DEEPREAD_SMART_READING===1 && qaCounts.DEEPREAD_CRITICAL_READING===1, 'Independent concurrent Lens requests');
    const critical = document.getElementById('deepread-critical-action');
    check(critical.querySelector('.deepread-critical-action-count').textContent===(view==='zero'?'0':'3'), 'Critical result count / valid zero');
    const points = [...document.querySelectorAll('.deepread-smart-spine-item,.deepread-critical-spine-item')].map(e=>e.getBoundingClientRect()).sort((a,b)=>a.top-b.top);
    check(points.every((r,i)=>!i || r.top>=points[i-1].bottom-1), 'Smart / Critical markers do not overlap');
    const bounds = critical.getBoundingClientRect();
    check(bounds.top>=0 && bounds.right<=innerWidth && bounds.bottom<=innerHeight, 'Control within viewport, including short window');
    const overview = document.getElementById('deepread-critical-overview');
    const row = overview.querySelector('button');
    row.focus();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    check(overview.hidden && document.activeElement===critical, 'Escape restores focus from hidden overview');
    critical.click();
    location.hash='measurement';
    await new Promise(resolve=>setTimeout(resolve,1100));
    critical.click();
    check(qaCounts.DEEPREAD_CRITICAL_READING===1 && qaCounts.DEEPREAD_SMART_READING===1, 'Anchor navigation preserves both Lens caches');
    if (overview.hidden) critical.click();
    overview.querySelector('.deepread-critical-overview-off').click();
    critical.click();
    check(qaCounts.DEEPREAD_CRITICAL_READING===1, 'Turn off / on reuses cached results');
    if (view!=='zero') {
      overview.querySelector('.deepread-critical-overview-item').click();
      await tick();
      const note = document.querySelector('.deepread-source-annotation[data-kind="critical"]');
      check(!!document.querySelector('.deepread-source-highlight') && !!note, 'Critical source spotlight and trace');
      const detail = note.querySelector('.deepread-trace-detail').getBoundingClientRect();
      check(detail.left>=7 && detail.right<=innerWidth-7 && detail.top>=7 && detail.bottom<=innerHeight-7, 'Expanded trace within viewport');
      const related = note.querySelector('.deepread-trace-source-links button');
      check(!!related, 'Multiple citations have a navigable related passage');
      related.click();
      check(document.querySelector('.deepread-source-highlight')?.textContent.includes('models shade'), 'Related citation follows the correct original paragraph');
      // Genuine page Selection -> existing Explain action -> saved response.
      window.scrollTo(0,0); await tick();
      const paragraph = document.getElementById('claim');
      const range = document.createRange(); range.selectNodeContents(paragraph);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await tick();
      document.querySelector('.deepread-selection-explain').click(); await tick();
      check(!!document.getElementById('deepread-explanation-card'), 'Selected original text still opens Explain');
      document.querySelector('.deepread-explanation-close').click();
      document.querySelector('.deepread-source-annotation[data-kind="explained"] .deepread-trace-toggle').click();
      check(qaCounts.DEEPREAD_EXPLAIN_SELECTION===1, 'Explained trace reuses response');
      document.getElementById('deepread-smart-action').click();
      document.querySelector('.deepread-smart-overview-item').click(); await tick();
      const kinds = new Set([...document.querySelectorAll('.deepread-source-annotation')].map(e=>e.dataset.kind));
      check(['atlas','smart','critical','explained'].every(kind=>kinds.has(kind)), 'All four trace kinds coexist');
      const point = document.querySelector('.deepread-critical-spine-point'); point.focus();
      check(!!document.querySelector('.deepread-source-peek'), 'Keyboard focus X-Rays a real Critical source');
      window.dispatchEvent(new Event('scroll'));
      check(document.getElementById('deepread-smart-overview').hidden && overview.hidden, 'Scrolling closes both Lens overviews');
      for (let i=1;i<4;i++) {
        document.getElementById('deepread-smart-action').click();
        document.querySelectorAll('.deepread-smart-overview-item')[i].click(); await tick();
      }
      check(document.querySelectorAll('.deepread-source-annotation').length===5, 'Reading Trail stays bounded to five traces');
      const spine=document.querySelector('.deepread-spine').getBoundingClientRect();
      const markers=[...document.querySelectorAll('.deepread-margin-item')].filter(e=>!e.hidden).map(e=>e.getBoundingClientRect());
      check(markers.every(r=>r.right<=spine.left-14 || r.left>=spine.right+4), 'Margin markers leave Spine and controls unobstructed');
    }
    result.textContent=checks.join('\n')+'\nRequests: '+JSON.stringify(qaCounts)+'\nRuntime and Gemini mocked; not Chrome extension acceptance.';
  } catch (error) { result.textContent=checks.join('\n')+'\nFAILED: '+error.message+'\nRequests: '+JSON.stringify(qaCounts); }
});
if (new URLSearchParams(location.search).has('autorun')) {
  window.addEventListener('load', () => document.getElementById('qa-run').click(), { once: true });
}
if (new URLSearchParams(location.search).has('demo')) {
  window.addEventListener('load', async () => {
    document.getElementById('deepread-smart-action').click();
    document.getElementById('deepread-critical-action').click();
    await tick();
    document.getElementById('deepread-smart-action').click();
    document.querySelector('.deepread-smart-overview-item').click();
    document.getElementById('deepread-critical-action').click();
    document.querySelector('.deepread-critical-overview-item').click();
  }, { once:true });
}
