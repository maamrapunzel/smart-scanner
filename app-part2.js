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
const STORE_SHEET_LAYOUT = 'smartScanner.sheetLayout.v2';
$('sheetLearnerSelect').addEventListener('change',()=>renderAnswerSheets('selected'));
$('sheetLayoutSelect').addEventListener('change',()=>{
  localStorage.setItem(STORE_SHEET_LAYOUT,$('sheetLayoutSelect').value);
  updateSheetLayoutHint();
  renderAnswerSheets('selected');
});
$('previewSelectedBtn').addEventListener('click',()=>renderAnswerSheets('selected'));
$('printSelectedBtn').addEventListener('click',()=>printAnswerSheets('selected'));
$('printAllBtn').addEventListener('click',()=>printAnswerSheets('all'));
$('exportSelectedPngBtn').addEventListener('click',()=>exportAnswerSheetPng('selected'));
$('exportAllPngBtn').addEventListener('click',()=>exportAnswerSheetPng('all'));
window.addEventListener('afterprint',()=>{ if(printAllMode){printAllMode=false;renderAnswerSheets('selected');} });

function currentSheetLayout(){
  return $('sheetLayoutSelect')?.value || localStorage.getItem(STORE_SHEET_LAYOUT) || 'full';
}
function layoutCapacity(layout){
  return layout==='4up'?4:(layout==='2up'?2:1);
}
function updateSheetLayoutHint(){
  const layout=currentSheetLayout(),el=$('sheetLayoutHint'); if(!el) return;
  if(layout==='full') el.innerHTML='Full A4 gives the <b>best scan accuracy</b>. Print at 100% / Actual Size and keep all four black corner markers visible.';
  else if(layout==='2up') el.innerHTML='<b>2-up:</b> two answer sheets per A4 landscape page. Cut the mini sheets apart before scanning. For best results, fill the camera frame with only one mini sheet.';
  else el.innerHTML='<b>4-up:</b> four answer sheets per A4 portrait page. This saves paper but makes QR, bubbles, and markers smaller. Cut the mini sheets apart before scanning; Full A4 remains the most reliable mode.';
}
function refreshSheetLearners(){
  const sel=$('sheetLearnerSelect'); if(!sel) return;
  const prev=sel.value;
  const savedLayout=localStorage.getItem(STORE_SHEET_LAYOUT);
  if(savedLayout && $('sheetLayoutSelect')) $('sheetLayoutSelect').value=savedLayout;
  updateSheetLayoutHint();
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
function logicalAnswerPages(mode){
  if(!assessment) return [];
  const pages=Math.ceil(assessment.items.length/ITEMS_PER_PAGE),out=[];
  answerSheetLearners(mode).forEach(learner=>{
    for(let p=1;p<=pages;p++) out.push({learner,pageNo:p,totalPages:pages,html:buildAnswerPage(learner,p,pages)});
  });
  return out;
}
function renderAnswerSheets(mode='selected'){
  const c=$('sheetContainer'); c.innerHTML='';
  if(!assessment){ c.innerHTML='<div class="card empty-state no-print">Upload a Master Excel first.</div>'; return; }
  const layout=currentSheetLayout(),capacity=layoutCapacity(layout),pages=logicalAnswerPages(mode);
  for(let i=0;i<pages.length;i+=capacity){
    const chunk=pages.slice(i,i+capacity);
    const slots=Array.from({length:capacity},(_,j)=>`<div class="sheet-slot">${chunk[j]?.html||''}</div>`).join('');
    c.insertAdjacentHTML('beforeend',`<section class="print-sheet layout-${layout}" data-sheet-index="${Math.floor(i/capacity)+1}">${slots}</section>`);
  }
  generateQRCodes();
}
function setDynamicPrintPage(layout){
  let el=$('dynamicPrintPageStyle');
  if(!el){ el=document.createElement('style'); el.id='dynamicPrintPageStyle'; document.head.appendChild(el); }
  el.textContent=layout==='2up'?'@page{size:A4 landscape;margin:0}':'@page{size:A4 portrait;margin:0}';
}
function printAnswerSheets(mode){
  if(!assessment) return alert('Upload a Master Excel first.');
  printAllMode=mode==='all';
  const layout=currentSheetLayout();
  setDynamicPrintPage(layout);
  renderAnswerSheets(mode);
  setTimeout(()=>window.print(),layout==='full'?300:500);
}
async function exportAnswerSheetPng(mode){
  if(!assessment) return alert('Upload a Master Excel first.');
  if(typeof html2canvas==='undefined') return alert('PNG export library is not ready. Reload the app while online, then try again.');
  renderAnswerSheets(mode);
  const sheets=[...document.querySelectorAll('#sheetContainer .print-sheet')];
  if(!sheets.length) return;
  const oldText=mode==='all'?'Exporting all PNG files…':'Exporting PNG…';
  const button=$(mode==='all'?'exportAllPngBtn':'exportSelectedPngBtn');
  const original=button.textContent; button.disabled=true; button.textContent=oldText;
  try{
    for(let i=0;i<sheets.length;i++){
      const canvas=await html2canvas(sheets[i],{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));
      if(!blob) throw new Error('PNG conversion failed.');
      const layout=currentSheetLayout().toUpperCase();
      const learner=mode==='selected'?answerSheetLearners('selected')[0]:null;
      const learnerName=learner?.name?('_'+fileSlug(learner.name)):'';
      downloadBlob(`SMART_SCANNER_${layout}${learnerName}_${String(i+1).padStart(2,'0')}.png`,blob);
      if(sheets.length>1) await new Promise(r=>setTimeout(r,220));
    }
  }catch(err){
    console.error(err);
    alert('PNG export failed: '+err.message);
  }finally{
    button.disabled=false; button.textContent=original;
  }
}
function fileSlug(s){
  return String(s||'').trim().replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,50)||'ANSWER_SHEET';
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
    <div class="sheet-instructions">Shade one circle completely for selected-response items. For Numerical, Algebraic, or WORD items, write clearly inside the answer box. Keep all four black squares clean.</div>
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
