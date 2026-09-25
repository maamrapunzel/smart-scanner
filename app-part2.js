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
  if(layout==='full') el.innerHTML='<b>A5 Single:</b> one full-size A5 answer sheet per learner. This gives the largest bubbles and answer boxes. Print at 100% / Actual Size and keep every black registration square visible.';
  else if(layout==='2up') el.innerHTML='<b>2-up:</b> two full-size A5 answer sheets on one A4 landscape page. Cut them apart before scanning.';
  else el.innerHTML='<b>4-up:</b> four reduced A5 sheets on one A4 portrait page. This is paper-saving but smaller; A5 Single or 2-up A4 is recommended for 50-item tests.';
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
  el.textContent=layout==='full'?'@page{size:A5 portrait;margin:0}':(layout==='2up'?'@page{size:A4 landscape;margin:0}':'@page{size:A4 portrait;margin:0}');
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
  const registrationHtml=REGISTRATION_MARKS_MM.map(([x,y])=>`<span class="registration-marker" style="left:${x-1.5}mm;top:${y-1.5}mm"></span>`).join('');
  return `<section class="answer-page block-answer-sheet compact-50-sheet ${layoutPage.fixedTemplate?'fixed-a5-template':'fallback-a5-template'}">
    <div class="marker m-tl"></div><div class="marker m-tr"></div><div class="marker m-bl"></div><div class="marker m-br"></div>
    ${registrationHtml}

    <div class="sheet-head">
      <h3>SMART SCANNER ANSWER SHEET</h3>
      <div class="meta">${escapeHtml(assessment.info['Assessment Title']||'Assessment')} &nbsp;•&nbsp; ${escapeHtml(assessment.info['Subject']||'')} &nbsp;•&nbsp; ${escapeHtml(assessment.info['Term']||'')}</div>
    </div>

    <div class="sheet-rule">PEN ONLY • NO ERASURES • SHADE COMPLETELY • DO NOT FOLD</div>

    <div class="sheet-student">
      <div class="sheet-line"><b>Name:</b>${escapeHtml(learner.name||'')}</div>
      <div class="sheet-line score-line"><b>Score:</b><span class="score-space"></span><span class="score-total">/ ${formatNum(totalPoints)}</span></div>
      <div class="sheet-line"><b>Section:</b>${escapeHtml(learner.section||assessment.info['Section']||'')}</div>
      <div class="sheet-line"><b>Learner No.:</b>${escapeHtml(learner.no||'')}</div>
    </div>

    ${qrText?`<div class="sheet-qr" data-qr="${escapeHtml(qrText)}"></div>`:''}
    <div class="sheet-page-label">PAGE ${pageNo} OF ${totalPages}</div>

    ${sectionHtml}

    <div class="sheet-marking-guide">
      <b>MARKING:</b>
      <span class="mark-good">●</span><span>Correct mark</span>
      <span class="mark-bad">✕ &nbsp; ✓ &nbsp; ◐</span><span>Incorrect marks</span>
      <span class="mark-note">Use black or blue pen • No erasures • Keep all black registration squares clean</span>
    </div>
  </section>`;
}
function buildSectionBlock(sec){
  const cont=sec.continuation?' (cont.)':'';
  const nums=(sec.items||[]).map(x=>Number(x.it?.no)).filter(Number.isFinite);
  const range=nums.length?` (Items ${Math.min(...nums)}–${Math.max(...nums)})`:'';
  const head=`<div class="answer-block-head" style="left:${sec.x}mm;top:${sec.y}mm;width:${sec.width}mm">
    <b>${sec.letter}. ${escapeHtml(sec.title)}${range}${cont}</b>
    <span>${escapeHtml(sec.instruction)}</span>
  </div>`;
  const outline=`<div class="answer-block-outline" style="left:${sec.x}mm;top:${sec.y}mm;width:${sec.width}mm;height:${SHEET_BLOCK_HEAD_H_MM+sec.bodyHeight}mm"></div>`;
  const dividers=sec.columns>1?Array.from({length:sec.columns-1},(_,i)=>{
    const left=sec.x+(sec.width/sec.columns)*(i+1);
    return `<span class="compact-column-divider" style="left:${left}mm;top:${sec.y+SHEET_BLOCK_HEAD_H_MM}mm;height:${sec.bodyHeight}mm"></span>`;
  }).join(''):'';
  return outline+head+dividers+sec.items.map(buildSectionedItem).join('');
}
function boxCountForItem(it){
  return boxCountForSheetItem(it);
}
function characterBoxesHtml(it,layout){
  const count=Math.max(7,boxCountForItem(it));
  const left=10.5;
  const available=Math.max(12,layout.width-left-2.5);
  const gap=count>10?.28:.42;
  const size=clamp((available-gap*(count-1))/count,3.0,6.4);
  return `<span class="block-char-boxes" style="left:${left}mm;top:.65mm;gap:${gap}mm">${Array.from({length:count},()=>`<span class="block-char-box" style="width:${size}mm;height:${size}mm"></span>`).join('')}</span>`;
}
function buildSectionedItem(layout){
  const it=layout.it;
  if(layout.kind==='MCQ'){
    const labels=mcqLabels(),xs=mcqBubbleXOffsets(layout.width);
    const bubbleTop=Math.max(.2,(layout.height-4.8)/2);
    const bubbles=labels.map((lab,j)=>`<span class="block-bubble" style="left:${xs[j]-2.4}mm;top:${bubbleTop}mm">${lab}</span>`).join('');
    return `<div class="block-sheet-row" style="left:${layout.x}mm;top:${layout.y}mm;width:${layout.width}mm;height:${layout.height}mm">
      <span class="block-item-no">${it.no}.</span>${bubbles}
    </div>`;
  }
  if(layout.kind==='TF'){
    const xs=tfBubbleXOffsets(layout.width);
    const bubbleTop=Math.max(.2,(layout.height-4.8)/2);
    const bubbles=['T','F'].map((lab,j)=>`<span class="block-bubble" style="left:${xs[j]-2.4}mm;top:${bubbleTop}mm">${lab}</span>`).join('');
    return `<div class="block-sheet-row" style="left:${layout.x}mm;top:${layout.y}mm;width:${layout.width}mm;height:${layout.height}mm">
      <span class="block-item-no">${it.no}.</span>${bubbles}
    </div>`;
  }
  if(layout.kind==='NUMERIC' && layout.numericSpec?.auto) return buildNumericBubbleItem(layout);
  return `<div class="block-written-row" style="left:${layout.x}mm;top:${layout.y}mm;width:${layout.width}mm;height:${layout.height}mm">
    <span class="block-item-no">${it.no}.</span>${characterBoxesHtml(it,layout)}
  </div>`;
}
function buildNumericBubbleItem(layout){
  const it=layout.it,spec=layout.numericSpec;
  const signX=numericSignXOffset();
  const xs=numericDigitBubbleXOffsets(layout.width);
  const signY=NUMERIC_ROW_TOP_MM;
  const sign=`<span class="numeric-sign-bubble" style="left:${signX-2.05}mm;top:${signY-2.05}mm">−</span>`;
  const rows=Array.from({length:spec.digits},(_,digitIndex)=>{
    const y=NUMERIC_ROW_TOP_MM+digitIndex*NUMERIC_ROW_GAP_MM;
    const bubbles=Array.from({length:10},(_,n)=>`<span class="numeric-h-bubble" style="left:${xs[n]-2.05}mm;top:${y-2.05}mm">${n}</span>`).join('');
    return bubbles;
  }).join('');
  return `<div class="numeric-horizontal-item" style="left:${layout.x}mm;top:${layout.y}mm;width:${layout.width}mm;height:${layout.height}mm">
    <span class="numeric-h-item-no">${it.no}.</span>${sign}${rows}
  </div>`;
}
function generateQRCodes(){
  document.querySelectorAll('.sheet-qr[data-qr]').forEach(el=>{
    el.innerHTML='';
    if(typeof QRCode==='undefined'){ el.textContent='QR'; return; }
    new QRCode(el,{text:el.dataset.qr,width:112,height:112,correctLevel:QRCode.CorrectLevel.M});
  });
}
