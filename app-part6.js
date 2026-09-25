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

// ---------- DEPED-STYLE REPORTS ----------
function reportLearnerMeta(learner){
  const roster=(assessment?.learners||[]).find(x=>learnerKey(x)===learnerKey(learner))
    || (assessment?.learners||[]).find(x=>x.id&&learner?.id&&String(x.id)===String(learner.id))
    || (assessment?.learners||[]).find(x=>String(x.name||'').trim().toUpperCase()===String(learner?.name||'').trim().toUpperCase());
  const src=roster||learner||{};
  return {
    ...src,
    section:String(src.section||assessment?.info?.['Section']||'Unspecified').trim()||'Unspecified',
    sex:normalizeLearnerSex(src.sex||src.gender||'')
  };
}
function reportCompetitionRanks(values){
  const sorted=[...values].sort((a,b)=>b-a);
  return values.map(v=>sorted.indexOf(v)+1);
}
function reportPct(n,d){ return d?Number((n/d*100).toFixed(2)):0; }
function buildDepEdReportData(){
  if(!assessment) return null;
  const totalPossible=assessment.items.reduce((s,i)=>s+(Number(i.points)||0),0);
  const resultRecords=Object.values(activeResultSet()).map(rec=>{
    const learner=reportLearnerMeta(rec.learner);
    return {rec,learner,...calculateLearnerResult(rec)};
  });
  const roster=(assessment.learners||[]).map(reportLearnerMeta);
  const sections=[];
  const addSection=s=>{ const v=String(s||'').trim()||'Unspecified'; if(!sections.includes(v)) sections.push(v); };
  roster.forEach(l=>addSection(l.section));
  resultRecords.forEach(r=>addSection(r.learner.section));
  if(!sections.length) addSection(assessment.info['Section']||'Section');

  const recordsBySection=Object.fromEntries(sections.map(s=>[s,resultRecords.filter(r=>r.learner.section===s)]));
  const rosterBySection=Object.fromEntries(sections.map(s=>[s,roster.filter(l=>l.section===s)]));

  const countsBySection={};
  const ranksBySection={};
  sections.forEach(sec=>{
    const recs=recordsBySection[sec];
    countsBySection[sec]=assessment.items.map(it=>recs.filter(r=>scoreAnswer(it,r.merged[it.no])>=it.points).length);
    ranksBySection[sec]=reportCompetitionRanks(countsBySection[sec]);
  });

  const totalCorrectByItem=assessment.items.map((_,i)=>sections.reduce((sum,sec)=>sum+countsBySection[sec][i],0));
  const overallRanks=reportCompetitionRanks(totalCorrectByItem);
  const totalTakers=resultRecords.length;

  const items=assessment.items.map((it,i)=>({
    no:it.no,
    type:it.type,
    competencyCode:it.competencyCode,
    competency:it.competency,
    sections:sections.map(sec=>({section:sec,correct:countsBySection[sec][i],rank:ranksBySection[sec][i]})),
    total:totalCorrectByItem[i],
    rank:overallRanks[i],
    pct:reportPct(totalCorrectByItem[i],totalTakers)
  }));

  function summarize(sec,recs,students){
    const rosterM=students.filter(x=>x.sex==='M').length,rosterF=students.filter(x=>x.sex==='F').length;
    const takersM=recs.filter(x=>x.learner.sex==='M').length,takersF=recs.filter(x=>x.learner.sex==='F').length;
    const studentsTotal=Math.max(students.length,recs.length);
    const takersTotal=recs.length;
    const scores=recs.map(x=>x.score);
    const mean=takersTotal?scores.reduce((a,b)=>a+b,0)/takersTotal:0;
    const mps=totalPossible?mean/totalPossible*100:0;
    const pl=mps+(100-mps)*0.02;
    const achieved=recs.filter(x=>x.pct>=75),below=recs.filter(x=>x.pct<75);
    const achievedM=achieved.filter(x=>x.learner.sex==='M').length,achievedF=achieved.filter(x=>x.learner.sex==='F').length;
    const belowM=below.filter(x=>x.learner.sex==='M').length,belowF=below.filter(x=>x.learner.sex==='F').length;
    return {
      section:sec,
      studentsM:rosterM,studentsF:rosterF,studentsTotal,
      takersM,takersF,takersTotal,
      nonTakersM:Math.max(0,rosterM-takersM),nonTakersF:Math.max(0,rosterF-takersF),nonTakersTotal:Math.max(0,studentsTotal-takersTotal),
      mean:Number(mean.toFixed(2)),mps:Number(mps.toFixed(2)),pl:Number(pl.toFixed(2)),
      achievedM,achievedF,achievedTotal:achieved.length,achievedPct:reportPct(achieved.length,takersTotal),
      achievedMPct:reportPct(achievedM,takersM),achievedFPct:reportPct(achievedF,takersF),
      belowM,belowF,belowTotal:below.length,belowPct:reportPct(below.length,takersTotal),
      belowMPct:reportPct(belowM,takersM),belowFPct:reportPct(belowF,takersF),
      high:scores.length?Math.max(...scores):0,low:scores.length?Math.min(...scores):0,
      unknownSexStudents:Math.max(0,studentsTotal-rosterM-rosterF),
      unknownSexTakers:Math.max(0,takersTotal-takersM-takersF)
    };
  }

  const sectionSummaries=sections.map(sec=>summarize(sec,recordsBySection[sec],rosterBySection[sec]));
  const overall=summarize('OVERALL',resultRecords,roster);
  return {sections,items,sectionSummaries,overall,totalPossible,totalTakers};
}
function renderReports(){
  const itemHead=$('reportItemHead'),itemBody=$('reportItemBody'),sectionBody=$('reportSectionBody');
  if(!itemHead||!itemBody||!sectionBody) return;
  if(!assessment){
    $('rTakers').textContent='0';$('rMean').textContent='0';$('rMps').textContent='0%';$('rMpl').textContent='0';$('rHighLow').textContent='0 / 0';
    itemHead.innerHTML='<tr><th>Upload an assessment first.</th></tr>'; itemBody.innerHTML=''; sectionBody.innerHTML='';
    return;
  }
  const r=buildDepEdReportData();
  $('rTakers').textContent=r.overall.takersTotal;
  $('rMean').textContent=r.overall.takersTotal?`${r.overall.mean.toFixed(2)} / ${formatNum(r.totalPossible)}`:'0';
  $('rMps').textContent=r.overall.mps.toFixed(2)+'%';
  $('rMpl').textContent=`${r.overall.achievedTotal} (${r.overall.achievedPct.toFixed(1)}%)`;
  $('rHighLow').textContent=r.overall.takersTotal?`${formatNum(r.overall.high)} / ${formatNum(r.overall.low)}`:'0 / 0';

  itemHead.innerHTML=`<tr><th rowspan="2">Item</th>${r.sections.map(s=>`<th colspan="2">${escapeHtml(s)}</th>`).join('')}<th rowspan="2">Total</th><th rowspan="2">Rank</th><th rowspan="2">% Correct</th></tr>
    <tr>${r.sections.map(()=>'<th>Correct</th><th>Rank</th>').join('')}</tr>`;
  itemBody.innerHTML=r.items.map(it=>`<tr><td>${it.no}</td>${it.sections.map(s=>`<td>${s.correct}</td><td>${s.rank}</td>`).join('')}<td><b>${it.total}</b></td><td>${it.rank}</td><td>${it.pct.toFixed(2)}%</td></tr>`).join('');

  sectionBody.innerHTML=[...r.sectionSummaries,r.overall].map(s=>`<tr>
    <td><b>${escapeHtml(s.section)}</b></td>
    <td>${s.studentsM}</td><td>${s.studentsF}</td><td>${s.studentsTotal}</td>
    <td>${s.takersM}</td><td>${s.takersF}</td><td>${s.takersTotal}</td>
    <td>${s.nonTakersTotal}</td><td>${s.mean.toFixed(2)}</td><td>${s.mps.toFixed(2)}%</td><td>${s.pl.toFixed(2)}%</td>
    <td>${s.achievedM}</td><td>${s.achievedF}</td><td>${s.achievedTotal}</td><td>${s.achievedPct.toFixed(2)}%</td>
    <td>${s.belowM}</td><td>${s.belowF}</td><td>${s.belowTotal}</td><td>${s.belowPct.toFixed(2)}%</td>
    <td>${formatNum(s.high)}</td><td>${formatNum(s.low)}</td>
  </tr>`).join('');

  const noSex=(assessment.learners||[]).length>0 && !(assessment.learners||[]).some(l=>normalizeLearnerSex(l.sex||l.gender||''));
  $('reportSexNote')?.classList.toggle('hide',!noSex);
}
function buildDepEdAnalysisSheet(){
  const r=buildDepEdReportData();
  if(!r) return null;
  const sectionPairs=r.sections.length*2;
  const totalCol=1+sectionPairs;
  const rankCol=totalCol+1;
  const pctCol=rankCol+1;
  const width=pctCol+1;
  const rows=[];
  const blank=()=>Array(width).fill('');

  let row=blank(); row[0]=assessment.info['School']||''; rows.push(row);
  row=blank(); row[0]=[assessment.info['Subject'],assessment.info['Grade Level']].filter(Boolean).join(' '); rows.push(row);
  row=blank(); row[0]='ITEM ANALYSIS'; rows.push(row);
  row=blank(); row[0]=[assessment.info['Term'],assessment.info['School Year']].filter(Boolean).join(' • '); rows.push(row);
  rows.push(blank());

  row=blank(); row[0]='ITEM NO.'; row[1]='NUMBER OF CORRECT RESPONSE BY SECTION'; row[totalCol]='TOTAL'; row[rankCol]='RANK'; row[pctCol]='Percentage of Correct Response'; rows.push(row);
  row=blank();
  r.sections.forEach((s,i)=>{row[1+i*2]=s;row[2+i*2]='RANK';});
  rows.push(row);

  r.items.forEach(it=>{
    row=blank(); row[0]=it.no;
    it.sections.forEach((s,i)=>{row[1+i*2]=s.correct;row[2+i*2]=s.rank;});
    row[totalCol]=it.total; row[rankCol]=it.rank; row[pctCol]=it.pct;
    rows.push(row);
  });

  row=blank(); row[0]='TOTAL CORRECT RESPONSES';
  r.sections.forEach((s,i)=>{
    row[1+i*2]=r.items.reduce((sum,it)=>sum+it.sections[i].correct,0);
  });
  row[totalCol]=r.items.reduce((sum,it)=>sum+it.total,0); rows.push(row);
  rows.push(blank());

  const summaryHeader=(label)=>{
    const x=blank(); x[0]=label;
    r.sections.forEach((s,i)=>{x[1+i*2]='M';x[2+i*2]='F';});
    x[totalCol]='M';x[rankCol]='F';x[pctCol]='TOTAL'; return x;
  };
  const summaryMF=(label,fieldM,fieldF,fieldTotal)=>{
    const x=blank(); x[0]=label;
    r.sectionSummaries.forEach((s,i)=>{x[1+i*2]=s[fieldM];x[2+i*2]=s[fieldF];});
    x[totalCol]=r.overall[fieldM];x[rankCol]=r.overall[fieldF];x[pctCol]=r.overall[fieldTotal]; return x;
  };
  const summarySingle=(label,field)=>{
    const x=blank(); x[0]=label;
    r.sectionSummaries.forEach((s,i)=>{x[1+i*2]=s[field];});
    x[totalCol]=r.overall[field]; return x;
  };

  rows.push(summaryHeader('NO. OF STUDENTS'));
  rows.push(summaryMF('', 'studentsM','studentsF','studentsTotal'));
  rows.push(summarySingle('TOTAL STUDENTS','studentsTotal'));
  rows.push(summaryHeader('NO. OF TAKERS'));
  rows.push(summaryMF('', 'takersM','takersF','takersTotal'));
  rows.push(summaryHeader('LEARNERS WHO DID NOT TAKE THE TEST'));
  rows.push(summaryMF('', 'nonTakersM','nonTakersF','nonTakersTotal'));
  rows.push(summarySingle('MEAN','mean'));
  rows.push(summarySingle('MPS','mps'));
  rows.push(summarySingle('PL','pl'));
  rows.push(summaryHeader('LEARNERS WHO ACHIEVED OR EXCEEDED 75% MPL'));
  rows.push(summaryMF('', 'achievedM','achievedF','achievedTotal'));
  row=blank(); row[0]='% OF LEARNERS WHO ACHIEVED OR EXCEEDED 75% MPL';
  r.sectionSummaries.forEach((s,i)=>{row[1+i*2]=s.achievedMPct;row[2+i*2]=s.achievedFPct;});
  row[totalCol]=r.overall.achievedMPct;row[rankCol]=r.overall.achievedFPct;row[pctCol]=r.overall.achievedPct; rows.push(row);
  rows.push(summaryHeader('LEARNERS BELOW 75% MPL'));
  rows.push(summaryMF('', 'belowM','belowF','belowTotal'));
  row=blank(); row[0]='% OF LEARNERS BELOW 75% MPL';
  r.sectionSummaries.forEach((s,i)=>{row[1+i*2]=s.belowMPct;row[2+i*2]=s.belowFPct;});
  row[totalCol]=r.overall.belowMPct;row[rankCol]=r.overall.belowFPct;row[pctCol]=r.overall.belowPct; rows.push(row);
  rows.push(summarySingle('HIGHEST SCORE','high'));
  rows.push(summarySingle('LOWEST SCORE','low'));

  if(r.overall.unknownSexStudents||r.overall.unknownSexTakers){
    rows.push(blank());
    row=blank(); row[0]='NOTE'; row[1]='Some learners have no Sex (M/F) value in the LEARNERS sheet. Total counts remain correct; male/female breakdown excludes unspecified sex.'; rows.push(row);
  }

  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:42},...Array.from({length:sectionPairs},(_,i)=>({wch:i%2===0?13:8})),{wch:11},{wch:9},{wch:23}];
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:pctCol}},
    {s:{r:1,c:0},e:{r:1,c:pctCol}},
    {s:{r:2,c:0},e:{r:2,c:pctCol}},
    {s:{r:3,c:0},e:{r:3,c:pctCol}},
    ...(sectionPairs? [{s:{r:5,c:1},e:{r:5,c:sectionPairs}}]:[])
  ];
  return ws;
}
function exportDepEdAnalysis(){
  if(!assessment) return alert('Upload an assessment first.');
  if(typeof XLSX==='undefined') return alert('Excel library is unavailable. Reload while online.');
  const wb=XLSX.utils.book_new();
  const ws=buildDepEdAnalysisSheet();
  XLSX.utils.book_append_sheet(wb,ws,'ITEM ANALYSIS');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resultsRows()),'LEARNER RESULTS');
  XLSX.writeFile(wb,'SMART_SCANNER_DEPED_ITEM_ANALYSIS.xlsx');
}
$('exportDepEdAnalysisBtn')?.addEventListener('click',exportDepEdAnalysis);

// ---------- BOOT ----------
function renderAll(){ renderSummary(); refreshSheetLearners(); renderAnswerSheets('selected'); refreshScannerControls(); renderReview(); renderResults(); renderAnalysis(); renderReports(); }
function loadSaved(){
  assessment=safeJsonParse(localStorage.getItem(STORE_ASSESSMENT)||'null',null); $('masteryThreshold').value=localStorage.getItem(STORE_THRESHOLD)||'75';
  if(assessment){ setStatus('uploadStatus','Saved assessment loaded from this browser.','ok'); }
  renderAll();
}
window.addEventListener('beforeunload',stopCamera);
loadSaved();
