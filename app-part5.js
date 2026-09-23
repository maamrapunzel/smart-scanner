// ---------- SCORING ----------
function normalizeText(s){ return String(s??'').trim().replace(/\s+/g,' ').toUpperCase(); }
function normalizeNumeric(s){
  const t=String(s??'').trim().replace(/,/g,''); if(!t) return NaN;
  if(/^[-+]?\d+\s*\/\s*\d+$/.test(t)){ const [a,b]=t.split('/').map(Number); return b? a/b:NaN; }
  return Number(t);
}
function normalizeExprText(s){
  return String(s??'').trim().toLowerCase().replace(/\s+/g,'').replace(/[−–—]/g,'-').replace(/×/g,'*').replace(/÷/g,'/').replace(/²/g,'^2').replace(/³/g,'^3');
}
function scoreAnswer(it,ans){
  const keys=[it.key,...it.accepted].filter(x=>String(x).trim()!==''); if(String(ans??'').trim()==='') return 0;
  if(it.type==='MCQ'||it.type==='TRUE/FALSE') return keys.some(k=>normalizeText(k)===normalizeText(ans))?it.points:0;
  if(['NUMERICAL','NUMERICAL-BOX'].includes(it.type)){
    const a=normalizeNumeric(ans); return keys.some(k=>{const b=normalizeNumeric(k);return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-9})?it.points:0;
  }
  if(['ALGEBRAIC','ALGEBRAIC-BOX'].includes(it.type)) return keys.some(k=>normalizeExprText(k)===normalizeExprText(ans))?it.points:0;
  if(['WORD','WORD-BOX'].includes(it.type)) return keys.some(k=>normalizeText(k)===normalizeText(ans))?it.points:0;
  return 0;
}
function calculateLearnerResult(rec){
  const merged={}; Object.values(rec.pages||{}).forEach(p=>Object.assign(merged,p.answers||{})); let score=0,total=0,pending=0;
  assessment.items.forEach(it=>{ total+=it.points; score+=scoreAnswer(it,merged[it.no]); if(['NUMERICAL','ALGEBRAIC','WORD','NUMERICAL-BOX','ALGEBRAIC-BOX','WORD-BOX'].includes(it.type)&&!String(merged[it.no]||'').trim())pending++; });
  return {score,total,pct:total?score/total*100:0,merged,pending};
}

// ---------- RESULTS / EXPORT ----------
function renderResults(){
  const body=$('resultsBody'); body.innerHTML=''; if(!assessment){body.innerHTML='<tr><td colspan="8">Upload an assessment first.</td></tr>';return;}
  const set=activeResultSet(),totalPages=Math.ceil(assessment.items.length/ITEMS_PER_PAGE); let n=0;
  Object.values(set).sort((a,b)=>String(a.learner?.name||'').localeCompare(String(b.learner?.name||''))).forEach(rec=>{
    n++; const s=calculateLearnerResult(rec),pages=Object.keys(rec.pages||{}).length; body.insertAdjacentHTML('beforeend',`<tr><td>${n}</td><td>${escapeHtml(rec.learner.name)}</td><td>${escapeHtml(rec.learner.id||rec.learner.no||'')}</td><td>${pages}/${totalPages}</td><td>${formatNum(s.score)}</td><td>${formatNum(s.total)}</td><td>${s.pct.toFixed(1)}%</td><td>${s.pending}</td></tr>`);
  });
  if(!n) body.innerHTML='<tr><td colspan="8" class="empty-state">No saved results yet.</td></tr>';
}
$('exportCsvBtn').addEventListener('click',()=>{
  if(!assessment) return alert('Upload an assessment first.'); const rows=resultsRows(); const csv=rows.map(r=>r.map(csvCell).join(',')).join('\r\n'); downloadBlob('SMART_SCANNER_RESULTS.csv',new Blob([csv],{type:'text/csv;charset=utf-8'}));
});
$('exportExcelBtn').addEventListener('click',()=>{
  if(!assessment) return alert('Upload an assessment first.'); if(typeof XLSX==='undefined') return alert('Excel library is unavailable. Reload while online.');
  const wb=XLSX.utils.book_new(); const a=buildAnalysisData();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resultsRows()),'RESULTS');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(responseRows()),'RESPONSES');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Item','Type','Key','Correct','Incorrect / Blank','% Correct','Competency Code','Learning Competency','Status'],...a.items.map(x=>[x.no,x.type,x.key,x.correct,x.incorrect,x.pct,x.competencyCode,x.competency,x.status])]),'ITEM ANALYSIS');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Competency Code','Learning Competency','Items','Mastery %','Status'],...a.competencies.map(x=>[x.code,x.name,x.itemCount,x.pct,x.status])]),'COMPETENCIES');
  XLSX.writeFile(wb,'SMART_SCANNER_RESULTS_AND_ANALYSIS.xlsx');
});
$('clearResultsBtn').addEventListener('click',()=>{
  if(!assessment||!confirm('Delete all saved results for this active assessment?')) return; const all=getAllResults(); all[assessment.id]={}; saveAllResults(all); renderResults(); renderAnalysis();
});
function resultsRows(){
  const hdr=['Learner No.','LRN / ID','Learner Name','Section','Score','Total','Percent','Pending Review',...assessment.items.map(i=>'Q'+i.no)]; const rows=[hdr];
  Object.values(activeResultSet()).forEach(rec=>{ const s=calculateLearnerResult(rec); rows.push([rec.learner.no,rec.learner.id,rec.learner.name,rec.learner.section,s.score,s.total,Number(s.pct.toFixed(2)),s.pending,...assessment.items.map(i=>s.merged[i.no]||'')]); }); return rows;
}
function responseRows(){
  const rows=[['Learner','LRN / ID','Item','Type','Response','Correct Answer','Score','Points','Competency Code','Learning Competency']];
  Object.values(activeResultSet()).forEach(rec=>{ const s=calculateLearnerResult(rec); assessment.items.forEach(it=>rows.push([rec.learner.name,rec.learner.id,it.no,it.type,s.merged[it.no]||'',it.key,scoreAnswer(it,s.merged[it.no]),it.points,it.competencyCode,it.competency])); }); return rows;
}
function csvCell(v){ return '"'+String(v??'').replace(/"/g,'""')+'"'; }
function downloadBlob(filename,blob){ const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500); }

