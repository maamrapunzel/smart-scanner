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
  $('sumPages').textContent=buildSectionedLayoutPages().length;
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
  const layouts=buildSectionedLayoutPages(),out=[],totalPages=layouts.length;
  answerSheetLearners(mode).forEach(learner=>{
    layouts.forEach((layoutPage,i)=>{
      const pageNo=i+1;
      out.push({learner,pageNo,totalPages,html:buildAnswerPage(learner,pageNo,totalPages,layoutPage)});
    });
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
      sheets[i].classList.add('png-export');
      const canvas=await html2canvas(sheets[i],{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false});
      sheets[i].classList.remove('png-export');
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
function buildAnswerPage(learner,pageNo,totalPages,layoutPage){
  const key=learnerKey(learner);
  const qrText=learner.generic?'':`SS2|${assessment.id}|${encodeURIComponent(key)}|${pageNo}`;
  const totalPoints=assessment.items.reduce((sum,it)=>sum+(Number(it.points)||0),0);
  const sectionHtml=layoutPage.sections.map(buildSectionBlock).join('');
  return `<section class="answer-page sectioned-sheet">
    <div class="marker m-tl"></div><div class="marker m-tr"></div><div class="marker m-bl"></div><div class="marker m-br"></div>
    <div class="sheet-head"><h3>SMART SCANNER ANSWER SHEET</h3><div class="meta">${escapeHtml(assessment.info['Assessment Title']||'Assessment')} • ${escapeHtml(assessment.info['Subject']||'')} • ${escapeHtml(assessment.info['Term']||'')}</div></div>
    <div class="sheet-rule">PEN ONLY • NO ERASURES • SHADE COMPLETELY • DO NOT FOLD</div>
    <div class="sheet-student">
      <div class="sheet-line"><b>Name:</b>${escapeHtml(learner.name||'')}</div><div class="sheet-line score-line"><b>Score:</b><span class="score-space"></span><span class="score-total">/ ${formatNum(totalPoints)}</span></div>
      <div class="sheet-line"><b>Section:</b>${escapeHtml(learner.section||assessment.info['Section']||'')}</div><div class="sheet-line"><b>Learner No.:</b>${escapeHtml(learner.no||'')}</div>
    </div>
    ${qrText?`<div class="sheet-qr" data-qr="${escapeHtml(qrText)}"></div>`:''}
    <div class="sheet-page-label">PAGE ${pageNo} OF ${totalPages}</div>
    ${sectionHtml}
    <div class="sheet-sign">School: ${escapeHtml(assessment.info['School']||'')} &nbsp;&nbsp; Teacher: ${escapeHtml(assessment.info['Teacher']||'')}</div>
    <div class="sheet-footer">Use black or blue pen. No erasures. Keep all four black squares clean.</div>
  </section>`;
}
function buildSectionBlock(sec){
  const cont=sec.continuation?' (cont.)':'';
  const head=`<div class="sheet-section-head" style="top:${sec.y}mm"><b>${sec.letter}. ${escapeHtml(sec.title)}${cont}</b><span>${escapeHtml(sec.instruction)}</span></div>`;
  const divider=sec.columns===2
    ? `<div class="sheet-section-divider" style="top:${sec.y+SECTION_HEAD_H_MM}mm;height:${sec.bodyHeight}mm"></div>`
    : '';
  return head+divider+sec.items.map(buildSectionedItem).join('');
}
function boxCountForItem(it){
  const answers=[it.key,...(it.accepted||[])].map(v=>String(v??'').replace(/\s+/g,''));
  const longest=Math.max(1,...answers.map(v=>v.length));
  return clamp(longest,1,16);
}
function characterBoxesHtml(it,xOffset=0){
  const count=boxCountForItem(it);
  return `<span class="char-boxes" style="left:${36+xOffset}mm">${Array.from({length:count},()=>'<span class="char-box"></span>').join('')}</span>`;
}
function buildSectionedItem(layout){
  const it=layout.it,t=layout.type,x=layout.xOffset||0;
  const itemLeft=19+x;
  if(t==='MCQ'){
    const bubbles=mcqLabels().map((lab,j)=>`<span class="sheet-bubble" style="left:${MCQ_X_MM[j]+x-2.4}mm">${lab}</span>`).join('');
    return `<div class="sheet-row" style="top:${layout.y}mm"><span class="item-no" style="left:${itemLeft}mm">${it.no}.</span>${bubbles}</div>`;
  }
  if(t==='TRUE/FALSE'){
    return `<div class="sheet-row" style="top:${layout.y}mm"><span class="item-no" style="left:${itemLeft}mm">${it.no}.</span><span class="sheet-bubble" style="left:${TF_X_MM[0]+x-2.4}mm">T</span><span class="sheet-bubble" style="left:${TF_X_MM[1]+x-2.4}mm">F</span></div>`;
  }
  if(t==='NUMERICAL-BOX' && layout.numericSpec?.auto) return buildNumericBubbleItem(layout);
  return `<div class="sheet-row box-row" style="top:${layout.y}mm"><span class="item-no" style="left:${itemLeft}mm">${it.no}.</span>${characterBoxesHtml(it,x)}</div>`;
}
function buildNumericBubbleItem(layout){
  const it=layout.it,spec=layout.numericSpec,top=layout.y;
  const labels=Array.from({length:10},(_,n)=>n);
  const sign=`<span class="numeric-col-label" style="left:${NUMERIC_SIGN_X_MM-5}mm">−</span><span class="numeric-mini-bubble sign-bubble" style="left:${NUMERIC_SIGN_X_MM-1.6}mm;top:${NUMERIC_DIGIT_Y0_MM-1.6}mm">−</span>`;
  const cols=Array.from({length:spec.digits},(_,col)=>{
    const x=NUMERIC_DIGIT_X0_MM+col*NUMERIC_DIGIT_X_STEP_MM;
    const bubbles=labels.map(n=>{
      const y=NUMERIC_DIGIT_Y0_MM+n*NUMERIC_DIGIT_Y_STEP_MM;
      return `<span class="numeric-mini-bubble" style="left:${x-1.6}mm;top:${y-1.6}mm">${n}</span>`;
    }).join('');
    return `<span class="numeric-col-label" style="left:${x-6}mm">Digit ${col+1}</span>${bubbles}`;
  }).join('');
  return `<div class="numeric-item" style="top:${top}mm;height:${layout.height}mm"><span class="numeric-item-no">${it.no}.</span>${sign}${cols}</div>`;
}
function generateQRCodes(){
  document.querySelectorAll('.sheet-qr[data-qr]').forEach(el=>{
    el.innerHTML='';
    if(typeof QRCode==='undefined'){ el.textContent='QR'; return; }
    new QRCode(el,{text:el.dataset.qr,width:112,height:112,correctLevel:QRCode.CorrectLevel.M});
  });
}
