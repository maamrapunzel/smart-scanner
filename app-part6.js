// ---------- ANALYSIS ----------
$('masteryThreshold').addEventListener('input',()=>{ localStorage.setItem(STORE_THRESHOLD,String(masteryThreshold())); renderAnalysis(); });
function buildAnalysisData(){
  const records=Object.values(activeResultSet()),threshold=masteryThreshold(),results=records.map(r=>({rec:r,...calculateLearnerResult(r)}));
  const items=assessment.items.map(it=>{
    let correct=0,earned=0,possible=0; results.forEach(r=>{ const sc=scoreAnswer(it,r.merged[it.no]); if(sc>=it.points)correct++; earned+=sc; possible+=it.points; });
    const pct=possible?earned/possible*100:0; return {...it,correct,incorrect:Math.max(0,results.length-correct),pct:Number(pct.toFixed(1)),status:pct>=threshold?'Mastered':'Needs Reinforcement'};
  });
  const groups=new Map();
  assessment.items.forEach(it=>{
    const code=it.competencyCode||'',name=it.competency||'Unspecified Competency',key=(code||name).trim()||'UNSPECIFIED'; if(!groups.has(key))groups.set(key,{code,name,itemNos:[],earned:0,possible:0}); const g=groups.get(key);g.itemNos.push(it.no);
    results.forEach(r=>{g.earned+=scoreAnswer(it,r.merged[it.no]);g.possible+=it.points;});
  });
  const competencies=[...groups.values()].map(g=>({...g,itemCount:g.itemNos.length,pct:Number((g.possible?g.earned/g.possible*100:0).toFixed(1)),status:(g.possible?g.earned/g.possible*100:0)>=threshold?'Mastered':'Needs Reinforcement'})).sort((a,b)=>b.pct-a.pct);
  const totalPossible=assessment.items.reduce((s,i)=>s+i.points,0),mean=results.length?results.reduce((s,r)=>s+r.score,0)/results.length:0,mps=results.length?results.reduce((s,r)=>s+r.pct,0)/results.length:0,high=results.length?Math.max(...results.map(r=>r.score)):0,low=results.length?Math.min(...results.map(r=>r.score)):0;
  return {records,results,items,competencies,totalPossible,mean,mps,high,low};
}
function renderAnalysis(){
  if(!$('masteryThreshold').value) $('masteryThreshold').value=localStorage.getItem(STORE_THRESHOLD)||'75';
  const body=$('itemAnalysisBody');
  if(!assessment){ $('aLearners').textContent='0';$('aMean').textContent='0';$('aMps').textContent='0%';$('aHigh').textContent='0';$('aLow').textContent='0'; body.innerHTML='<tr><td colspan="8">Upload an assessment first.</td></tr>'; return; }
  const a=buildAnalysisData(); $('aLearners').textContent=a.results.length; $('aMean').textContent=a.results.length?`${a.mean.toFixed(1)} / ${formatNum(a.totalPossible)}`:'0'; $('aMps').textContent=a.mps.toFixed(1)+'%'; $('aHigh').textContent=a.results.length?formatNum(a.high):'0'; $('aLow').textContent=a.results.length?formatNum(a.low):'0';
  body.innerHTML=a.items.map(x=>`<tr><td>${x.no}</td><td>${escapeHtml(x.type)}</td><td>${escapeHtml(x.key)}</td><td>${x.correct}</td><td>${x.incorrect}</td><td>${x.pct.toFixed(1)}%</td><td>${escapeHtml([x.competencyCode,x.competency].filter(Boolean).join(' — ')||'—')}</td><td><span class="status-tag ${x.status==='Mastered'?'mastered':'needs'}">${x.status}</span></td></tr>`).join('')||'<tr><td colspan="8">No items.</td></tr>';
  const compBox=$('competencyCards');
  if(!a.results.length){compBox.innerHTML='<div class="empty-state">No results to analyze yet.</div>'; $('mostMastered').textContent='—';$('leastMastered').textContent='—';$('mostMasteredPct').textContent='—';$('leastMasteredPct').textContent='—'; return;}
  compBox.innerHTML=a.competencies.map(c=>`<div class="competency-row"><div class="competency-top"><span>${escapeHtml([c.code,c.name].filter(Boolean).join(' — '))}</span><span>${c.pct.toFixed(1)}%</span></div><div class="progress"><span style="width:${clamp(c.pct,0,100)}%"></span></div></div>`).join('');
  const most=a.competencies[0],least=a.competencies[a.competencies.length-1]; $('mostMastered').textContent=most?[most.code,most.name].filter(Boolean).join(' — '):'—'; $('mostMasteredPct').textContent=most?most.pct.toFixed(1)+'%':'—'; $('leastMastered').textContent=least?[least.code,least.name].filter(Boolean).join(' — '):'—'; $('leastMasteredPct').textContent=least?least.pct.toFixed(1)+'%':'—';
}

// ---------- BOOT ----------
function renderAll(){ renderSummary(); refreshSheetLearners(); renderAnswerSheets('selected'); refreshScannerControls(); renderReview(); renderResults(); renderAnalysis(); }
function loadSaved(){
  assessment=safeJsonParse(localStorage.getItem(STORE_ASSESSMENT)||'null',null); $('masteryThreshold').value=localStorage.getItem(STORE_THRESHOLD)||'75';
  if(assessment){ setStatus('uploadStatus','Saved assessment loaded from this browser.','ok'); }
  renderAll();
}
window.addEventListener('beforeunload',stopCamera);
loadSaved();
