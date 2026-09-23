// ---------- DASHBOARD ----------
function renderSummary(){
  const empty=$('summaryEmpty'),box=$('summaryBox');
  if(!assessment){ empty.classList.remove('hide'); box.classList.add('hide'); $('assessmentSubtitle').textContent='Upload a Master Excel to begin.'; return; }
  empty.classList.add('hide'); box.classList.remove('hide');
  $('assessmentSubtitle').textContent=[assessment.info['Subject'],assessment.info['Grade Level'],assessment.info['Section'],assessment.info['Term']].filter(Boolean).join(' • ');
  $('summaryTitle').textContent=assessment.info['Assessment Title']||'Untitled Assessment';
  $('sumItems').textContent=assessment.items.length;
  $('sumLearners').textContent=assessment.learners.length;
  $('sumCompetencies').textContent=new Set(assessment.items.map(i=>i.competencyCode||i.competency).filter(Boolean)).size;
  $('sumPages').textContent=Math.ceil(assessment.items.length/ITEMS_PER_PAGE);
  const counts={}; assessment.items.forEach(i=>counts[i.type]=(counts[i.type]||0)+1);
  $('typeBreakdown').innerHTML=Object.entries(counts).map(([k,v])=>`<span class="chip">${escapeHtml(k)}: ${v}</span>`).join('');
}
$('backupBtn').addEventListener('click',()=>{
  const payload={version:2,exportedAt:new Date().toISOString(),assessment,results:getAllResults(),masteryThreshold:masteryThreshold()};
  downloadBlob('SMART_SCANNER_BACKUP.json',new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
});
$('restoreInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  try{
    const data=JSON.parse(await file.text());
    if(!data || data.version!==2 || !data.assessment) throw new Error('This is not a SMART SCANNER V2 backup.');
    assessment=data.assessment; localStorage.setItem(STORE_ASSESSMENT,JSON.stringify(assessment)); saveAllResults(data.results||{});
    if(data.masteryThreshold) localStorage.setItem(STORE_THRESHOLD,String(data.masteryThreshold));
    setStatus('uploadStatus','Backup restored successfully.','ok'); renderAll();
  }catch(err){ alert('Restore failed: '+err.message); }
  e.target.value='';
});
$('resetAssessmentBtn').addEventListener('click',()=>{
  if(!confirm('Clear the active assessment and all SMART SCANNER V2 results stored in this browser?')) return;
  localStorage.removeItem(STORE_ASSESSMENT); localStorage.removeItem(STORE_RESULTS); assessment=null; pendingReview=null; renderAll(); setStatus('uploadStatus','Local SMART SCANNER data cleared.','neutral');
});

// ---------- ANSWER SHEETS ----------
$('sheetLearnerSelect').addEventListener('change',()=>renderAnswerSheets('selected'));
$('previewSelectedBtn').addEventListener('click',()=>renderAnswerSheets('selected'));
$('printSelectedBtn').addEventListener('click',()=>{ printAllMode=false; renderAnswerSheets('selected'); setTimeout(()=>window.print(),250); });
$('printAllBtn').addEventListener('click',()=>{ printAllMode=true; renderAnswerSheets('all'); setTimeout(()=>window.print(),500); });
window.addEventListener('afterprint',()=>{ if(printAllMode){printAllMode=false;renderAnswerSheets('selected');} });
function refreshSheetLearners(){
  const sel=$('sheetLearnerSelect'); if(!sel) return;
  const prev=sel.value;
  if(!assessment){ sel.innerHTML='<option value="">Upload assessment first</option>'; return; }
  if(!assessment.learners.length){ sel.innerHTML='<option value="generic">Generic / Blank Learner</option>'; return; }
  sel.innerHTML=assessment.learners.map((l,i)=>`<option value="${i}">${escapeHtml(l.no)} — ${escapeHtml(l.name)}</option>`).join('');
  if([...sel.options].some(o=>o.value===prev)) sel.value=prev;
}
function answerSheetLearners(mode){
  if(!assessment) return [];
  if(!assessment.learners.length) return [{no:'',id:'',name:'',section:assessment.info['Section']||'',generic:true}];
  if(mode==='all') return assessment.learners;
  const i=Number($('sheetLearnerSelect').value||0); return [assessment.learners[i]||assessment.learners[0]];
}
function renderAnswerSheets(mode='selected'){
  const c=$('sheetContainer'); c.innerHTML='';
  if(!assessment){ c.innerHTML='<div class="card empty-state no-print">Upload a Master Excel first.</div>'; return; }
  const pages=Math.ceil(assessment.items.length/ITEMS_PER_PAGE);
  answerSheetLearners(mode).forEach(learner=>{
    for(let p=1;p<=pages;p++) c.insertAdjacentHTML('beforeend',buildAnswerPage(learner,p,pages));
  });
  generateQRCodes();
}
function buildAnswerPage(learner,pageNo,totalPages){
  const key=learnerKey(learner);
  const qrText=learner.generic?'':`SS2|${assessment.id}|${encodeURIComponent(key)}|${pageNo}`;
  const items=assessment.items.slice((pageNo-1)*ITEMS_PER_PAGE,pageNo*ITEMS_PER_PAGE);
  const rows=items.map((it,idx)=>buildAnswerRow(it,idx)).join('');
  return `<section class="answer-page">
    <div class="marker m-tl"></div><div class="marker m-tr"></div><div class="marker m-bl"></div><div class="marker m-br"></div>
    <div class="sheet-head"><h3>SMART SCANNER ANSWER SHEET</h3><div class="meta">${escapeHtml(assessment.info['Assessment Title']||'Assessment')} • ${escapeHtml(assessment.info['Subject']||'')} • ${escapeHtml(assessment.info['Term']||'')}</div></div>
    <div class="sheet-student">
      <div class="sheet-line"><b>Name:</b>${escapeHtml(learner.name||'')}</div><div class="sheet-line"><b>LRN / ID:</b>${escapeHtml(learner.id||'')}</div>
      <div class="sheet-line"><b>Section:</b>${escapeHtml(learner.section||assessment.info['Section']||'')}</div><div class="sheet-line"><b>Learner No.:</b>${escapeHtml(learner.no||'')}</div>
    </div>
    ${qrText?`<div class="sheet-qr" data-qr="${escapeHtml(qrText)}"></div>`:''}
    <div class="sheet-instructions">Shade one circle completely for selected-response items. For Numerical/Algebraic, write clearly inside the answer box. Keep all four black squares clean.</div>
    <div class="sheet-page-label">PAGE ${pageNo} OF ${totalPages}</div>
    ${rows}
    <div class="sheet-sign">School: ${escapeHtml(assessment.info['School']||'')} &nbsp;&nbsp; Teacher: ${escapeHtml(assessment.info['Teacher']||'')}</div>
    <div class="sheet-footer">SMART SCANNER • Scan • Check • Analyze • Record</div>
  </section>`;
}
function buildAnswerRow(it,idx){
  const y=ROW_START_MM+idx*ROW_GAP_MM;
  let control='';
  if(it.type==='MCQ'){
    control=mcqLabels().map((lab,j)=>`<span class="sheet-bubble" style="left:${MCQ_X_MM[j]-2.75}mm">${lab}</span>`).join('');
  }else if(it.type==='TRUE/FALSE'){
    control=`<span class="sheet-bubble" style="left:${TF_X_MM[0]-2.75}mm">T</span><span class="sheet-bubble" style="left:${TF_X_MM[1]-2.75}mm">F</span>`;
  }else{
    control='<span class="write-area"></span>';
  }
  return `<div class="sheet-row" style="top:${y-3.7}mm"><span class="item-no">${it.no}.</span><span class="item-type">${escapeHtml(it.type)}</span>${control}</div>`;
}
function generateQRCodes(){
  document.querySelectorAll('.sheet-qr[data-qr]').forEach(el=>{
    el.innerHTML='';
    if(typeof QRCode==='undefined'){ el.textContent='QR'; return; }
    new QRCode(el,{text:el.dataset.qr,width:112,height:112,correctLevel:QRCode.CorrectLevel.M});
  });
}

