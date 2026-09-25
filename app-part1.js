'use strict';

const $ = id => document.getElementById(id);
const ITEMS_PER_PAGE = 25;
const STORE_ASSESSMENT = 'smartScanner.assessment.v2';
const STORE_RESULTS = 'smartScanner.results.v2';
const STORE_THRESHOLD = 'smartScanner.masteryThreshold.v2';
const PAGE_W_MM = 148;
const PAGE_H_MM = 210;
const MARKER_MM = { tl:[6,6], tr:[142,6], br:[142,204], bl:[6,204] };
const ROW_START_MM = 67;
const ROW_GAP_MM = 8.2;
const MCQ_X_MM = [40,50,60,70,80];
const TF_X_MM = [50,66];

let assessment = null;
let pendingReview = null;
let liveStream = null;
let printAllMode = false;

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function formatNum(n){ return Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2); }
function safeJsonParse(s,fallback){ try{return JSON.parse(s)}catch(_){return fallback} }
function learnerKey(l){ return String(l?.id || l?.no || l?.name || 'UNLISTED'); }
function hashText(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
  return (h>>>0).toString(36);
}
function assessmentId(a){
  return 'A'+hashText([a.info['Assessment Title'],a.info['Subject'],a.info['Section'],a.info['Term'],a.items.length,a.items.map(x=>`${x.no}:${x.key}`).join(',')].join('|'));
}
function setStatus(id,text,kind='neutral'){
  const el=$(id); if(!el) return; el.textContent=text; el.className='status '+kind;
}
function getAllResults(){ return safeJsonParse(localStorage.getItem(STORE_RESULTS)||'{}',{}); }
function saveAllResults(x){ localStorage.setItem(STORE_RESULTS,JSON.stringify(x)); }
function activeResultSet(){ const all=getAllResults(); return assessment ? (all[assessment.id]||{}) : {}; }
function masteryThreshold(){ return clamp(Number($('masteryThreshold')?.value || localStorage.getItem(STORE_THRESHOLD) || 75),1,100); }

// ---------- APP / NAV ----------
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>showScreen(btn.dataset.screen)));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>showScreen(btn.dataset.go)));
function showScreen(id){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.screen===id));
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
  if(id==='answersheet') renderAnswerSheets('selected');
  if(id==='scanner') refreshScannerControls();
  if(id==='results') renderResults();
  if(id==='analysis') renderAnalysis();
  if(id==='reports' && typeof renderReports==='function') renderReports();
  window.scrollTo({top:0,behavior:'smooth'});
}
function updateNetwork(){
  const el=$('netBadge'); if(!el) return;
  el.textContent=navigator.onLine?'ONLINE':'OFFLINE';
  el.className='pill '+(navigator.onLine?'good':'bad');
}
window.addEventListener('online',updateNetwork); window.addEventListener('offline',updateNetwork); updateNetwork();
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{})); }

// ---------- EXCEL ----------
$('excelInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  if(typeof XLSX==='undefined'){ setStatus('uploadStatus','Excel library did not load. Reload while online.','bad'); return; }
  setStatus('uploadStatus','Reading Master Excel…','neutral');
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const a=parseWorkbook(wb,file.name);
    validateAssessment(a);
    a.id=assessmentId(a);
    assessment=a;
    localStorage.setItem(STORE_ASSESSMENT,JSON.stringify(assessment));
    const all=getAllResults(); if(!all[a.id]) all[a.id]={}; saveAllResults(all);
    setStatus('uploadStatus','Master Excel loaded successfully.','ok');
    renderAll();
  }catch(err){ console.error(err); setStatus('uploadStatus','Upload error: '+err.message,'bad'); }
  e.target.value='';
});
function rowsFromSheet(wb,names){
  const name=names.find(n=>wb.Sheets[n]);
  if(!name) throw new Error('Missing sheet: '+names[0]);
  return XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false});
}
function canonicalInfoLabel(label){
  const s=String(label||'').trim().toLowerCase().replace(/\s+/g,' ');
  const map={
    'school':'School','teacher':'Teacher','subject':'Subject','grade level':'Grade Level','section':'Section',
    'assessment title':'Assessment Title','test title':'Assessment Title','term':'Term','quarter / term':'Term','quarter/term':'Term',
    'school year':'School Year','mcq choices':'MCQ Choices','notes':'Notes'
  };
  return map[s] || String(label||'').trim();
}
function parseWorkbook(wb,fileName){
  const infoRows=rowsFromSheet(wb,['TEST INFO','TEST_INFO']);
  const info={};
  infoRows.slice(1).forEach(r=>{ const k=canonicalInfoLabel(r[0]); if(k) info[k]=String(r[1]??'').trim(); });
  if(!info['MCQ Choices']) info['MCQ Choices']='4';

  const itemRows=rowsFromSheet(wb,['ITEMS']);
  const h=(itemRows[0]||[]).map(x=>String(x).trim());
  const idx=name=>h.indexOf(name);
  const required=['Item No.','Question Type','Correct Answer','Accepted Answer(s)','Competency Code','Learning Competency / Skill','Points'];
  required.forEach(x=>{ if(idx(x)<0) throw new Error('Missing ITEMS column: '+x); });
  const items=itemRows.slice(1).map(r=>({
    no:parseInt(String(r[idx('Item No.')]||'').replace(/[^0-9-]/g,''),10)||0,
    type:normalizeType(r[idx('Question Type')]),
    key:String(r[idx('Correct Answer')]??'').trim(),
    accepted:String(r[idx('Accepted Answer(s')]??'').split(/[;|]/).map(s=>s.trim()).filter(Boolean),
    competencyCode:String(r[idx('Competency Code')]??'').trim(),
    competency:String(r[idx('Learning Competency / Skill')]??'').trim(),
    points:Number(r[idx('Points')]||1)||1,
    notes:idx('Notes')>=0?String(r[idx('Notes')]??'').trim():''
  })).filter(x=>x.no && x.type && x.key!=='').sort((a,b)=>a.no-b.no);

  let learners=[];
  if(wb.Sheets['LEARNERS']){
    const lr=rowsFromSheet(wb,['LEARNERS']);
    const lh=(lr[0]||[]).map(x=>String(x).trim()); const li=n=>lh.indexOf(n);
    const idCol=li('LRN / ID')>=0?li('LRN / ID'):li('Learner ID / LRN');
    const sexCol=li('Sex')>=0?li('Sex'):li('Gender');
    learners=lr.slice(1).map((r,k)=>({
      no:String(li('Learner No.')>=0?r[li('Learner No.')]:k+1).trim(),
      id:String(idCol>=0?r[idCol]:'').trim(),
      name:String(li('Learner Name')>=0?r[li('Learner Name')]:'').trim(),
      sex:normalizeLearnerSex(sexCol>=0?r[sexCol]:''),
      section:String(li('Section')>=0?r[li('Section')]:(info['Section']||'')).trim()
    })).filter(x=>x.name);
  }
  return {fileName,info,items,learners,loadedAt:new Date().toISOString()};
}
function normalizeLearnerSex(v){
  const s=String(v??'').trim().toUpperCase();
  if(['M','MALE','BOY'].includes(s)) return 'M';
  if(['F','FEMALE','GIRL'].includes(s)) return 'F';
  return '';
}
function normalizeType(v){
  const s=String(v||'').trim().toUpperCase().replace(/\s+/g,' ');
  if(['MCQ','MULTIPLE CHOICE','MULTIPLE-CHOICE'].includes(s)) return 'MCQ';
  if(['TRUE/FALSE','TRUE OR FALSE','T/F','TF'].includes(s)) return 'TRUE/FALSE';
  if(['NUMERICAL-BOX','NUMERIC-BOX','NUMBER-BOX','NUMERICAL','NUMERIC','NUMBER'].includes(s)) return 'NUMERICAL-BOX';
  if(['ALGEBRAIC-BOX','ALGEBRA-BOX','EXPRESSION-BOX','ALGEBRAIC','ALGEBRA','EXPRESSION','ALGEBRAIC EXPRESSION'].includes(s)) return 'ALGEBRAIC-BOX';
  if(['WORD-BOX','SHORT-ANSWER-BOX','TEXT-BOX','WORD','SHORT ANSWER','TEXT','WORD ANSWER'].includes(s)) return 'WORD-BOX';
  return '';
}
function validateAssessment(a){
  if(!a.items.length) throw new Error('No valid items found. Used rows need Item No., Question Type and Correct Answer.');
  const seen=new Set();
  a.items.forEach(it=>{ if(seen.has(it.no)) throw new Error('Duplicate Item No.: '+it.no); seen.add(it.no); });
  const n=Number(a.info['MCQ Choices']||4); if(![4,5].includes(n)) a.info['MCQ Choices']='4';
}
function mcqLabels(){ return Number(assessment?.info?.['MCQ Choices']||4)===5?['A','B','C','D','E']:['A','B','C','D']; }

const SHEET_CONTENT_TOP_MM = 31;
const SHEET_CONTENT_BOTTOM_MM = 194;
const SHEET_CONTENT_X_MM = 8.5;
const SHEET_CONTENT_W_MM = 131;
const SHEET_BLOCK_HEAD_H_MM = 6.2;

const NUMERIC_ROW_TOP_MM = 2.5;
const NUMERIC_ROW_GAP_MM = 4.3;

const REGISTRATION_MARKS_MM = [
  [4.5,30],[143.5,30],
  [4.5,52],[143.5,52],
  [4.5,74],[143.5,74],
  [4.5,96],[143.5,96],
  [4.5,118],[143.5,118],
  [4.5,140],[143.5,140],
  [4.5,162],[143.5,162],
  [4.5,184],[143.5,184]
];

const FIXED_A5_ZONES = {
  MCQ:{key:'MCQ',letter:'A',title:'MULTIPLE CHOICE',instruction:'Shade one circle only.',x:8.5,y:31,width:75,bodyHeight:52,columns:2,capacity:20,rowHeight:5.2},
  TF:{key:'TF',letter:'B',title:'TRUE OR FALSE',instruction:'Shade T or F only.',x:86.5,y:31,width:53,bodyHeight:52,columns:2,capacity:10,rowHeight:10.4},
  NUMERIC:{key:'NUMERIC',letter:'C',title:'NUMERIC ANSWERS',instruction:'Shade one digit in each row; use minus only when needed.',x:8.5,y:91.2,width:131,bodyHeight:39.2,columns:1,capacity:6,rowHeight:5},
  WRITTEN:{key:'WRITTEN',letter:'D',title:'ALGEBRAIC / WORD ANSWERS',instruction:'Write one character or symbol per box.',x:8.5,y:138.8,width:131,bodyHeight:49,columns:2,capacity:14,rowHeight:7}
};

function canonicalSheetType(type){
  if(type==='MCQ') return 'MCQ';
  if(type==='TRUE/FALSE') return 'TRUE/FALSE';
  if(['WORD','WORD-BOX'].includes(type)) return 'WORD-BOX';
  if(['ALGEBRAIC','ALGEBRAIC-BOX'].includes(type)) return 'ALGEBRAIC-BOX';
  if(['NUMERICAL','NUMERICAL-BOX'].includes(type)) return 'NUMERICAL-BOX';
  return type;
}
function numericBubbleSpec(it){
  const all=[it.key,...(it.accepted||[])].map(v=>String(v??'').trim()).filter(Boolean);
  const integerOnly=all.length>0 && all.every(v=>/^[+-]?\d+$/.test(v));
  const digits=Math.max(1,...all.map(v=>v.replace(/^[+-]/,'').length));
  return {auto:integerOnly,digits:clamp(digits,1,6)};
}
function boxCountForSheetItem(it){
  const answers=[it.key,...(it.accepted||[])].map(v=>String(v??'').replace(/\s+/g,''));
  return clamp(Math.max(1,...answers.map(v=>v.length)),1,16);
}
function mcqBubbleXOffsets(width){
  const count=mcqLabels().length;
  const start=12.5,end=Math.max(start+1,width-4.1);
  const step=count>1?(end-start)/(count-1):0;
  return Array.from({length:count},(_,i)=>start+i*step);
}
function tfBubbleXOffsets(width){
  const a=Math.min(width-13,13.2);
  const b=Math.min(width-4.2,22.2);
  return [a,Math.max(a+8,b)];
}
function numericSignXOffset(){ return 9.5; }
function numericDigitBubbleXOffsets(width){
  const start=20,end=Math.max(start+36,width-5);
  const step=(end-start)/9;
  return Array.from({length:10},(_,i)=>start+i*step);
}
function fixedNumericItemHeight(it){
  const spec=numericBubbleSpec(it);
  if(!spec.auto) return 7;
  return 5+(spec.digits-1)*NUMERIC_ROW_GAP_MM;
}
function fixedSheetBuckets(){
  const buckets={MCQ:[],TF:[],NUMERIC:[],WRITTEN:[]};
  if(!assessment) return buckets;
  assessment.items.forEach(it=>{
    const t=canonicalSheetType(it.type);
    if(t==='MCQ') buckets.MCQ.push(it);
    else if(t==='TRUE/FALSE') buckets.TF.push(it);
    else if(t==='NUMERICAL-BOX') buckets.NUMERIC.push(it);
    else buckets.WRITTEN.push(it);
  });
  return buckets;
}
function canUseFixedA5Template(buckets){
  if((assessment?.items?.length||0)>50) return false;
  if(buckets.MCQ.length>FIXED_A5_ZONES.MCQ.capacity) return false;
  if(buckets.TF.length>FIXED_A5_ZONES.TF.capacity) return false;
  if(buckets.WRITTEN.length>FIXED_A5_ZONES.WRITTEN.capacity) return false;
  if(buckets.NUMERIC.length>FIXED_A5_ZONES.NUMERIC.capacity) return false;
  const numericHeight=buckets.NUMERIC.reduce((s,it)=>s+fixedNumericItemHeight(it),0);
  return numericHeight<=FIXED_A5_ZONES.NUMERIC.bodyHeight+.01;
}
function makeFixedA5Section(zone,items){
  const subWidth=zone.width/zone.columns;
  const rowsPerCol=Math.ceil(zone.capacity/zone.columns);
  const placements=[];
  items.forEach((it,index)=>{
    const col=zone.columns===1?0:Math.floor(index/rowsPerCol);
    const row=zone.columns===1?index:index%rowsPerCol;
    let relY=row*zone.rowHeight,height=zone.rowHeight;
    if(zone.key==='NUMERIC'){
      relY=items.slice(0,index).reduce((s,x)=>s+fixedNumericItemHeight(x),0);
      height=fixedNumericItemHeight(it);
    }
    placements.push({
      it,kind:zone.key,
      x:zone.x+col*subWidth,
      y:zone.y+SHEET_BLOCK_HEAD_H_MM+relY,
      width:subWidth,
      height,
      numericSpec:zone.key==='NUMERIC'?numericBubbleSpec(it):null
    });
  });
  return {
    ...zone,
    continuation:false,
    items:placements,
    templateFixed:true
  };
}
function buildFixedA5WireframePage(){
  const buckets=fixedSheetBuckets();
  if(!canUseFixedA5Template(buckets)) return null;
  const sections=[
    makeFixedA5Section(FIXED_A5_ZONES.MCQ,buckets.MCQ),
    makeFixedA5Section(FIXED_A5_ZONES.TF,buckets.TF),
    makeFixedA5Section(FIXED_A5_ZONES.NUMERIC,buckets.NUMERIC),
    makeFixedA5Section(FIXED_A5_ZONES.WRITTEN,buckets.WRITTEN)
  ];
  return {
    fixedTemplate:true,
    templateName:'A5-50-MIXED',
    sections,
    items:sections.flatMap(s=>s.items)
  };
}

/* Readable fallback only when the fixed 50-item template cannot hold the assessment. */
function fallbackGroups(){
  const buckets=fixedSheetBuckets();
  return [
    {...FIXED_A5_ZONES.MCQ,items:buckets.MCQ},
    {...FIXED_A5_ZONES.TF,items:buckets.TF},
    {...FIXED_A5_ZONES.NUMERIC,items:buckets.NUMERIC},
    {...FIXED_A5_ZONES.WRITTEN,items:buckets.WRITTEN}
  ].filter(g=>g.items.length);
}
function fallbackSection(group,items,y){
  const width=SHEET_CONTENT_W_MM,cols=group.key==='MCQ'?2:(group.key==='TF'?2:(group.key==='WRITTEN'?2:1));
  const subWidth=width/cols,rows=Math.ceil(items.length/cols);
  const rowH=group.key==='MCQ'?5.4:group.key==='TF'?7:group.key==='WRITTEN'?7:6;
  const sec={
    ...group,x:SHEET_CONTENT_X_MM,y,width,columns:cols,
    bodyHeight:group.key==='NUMERIC'
      ?items.reduce((s,it)=>s+fixedNumericItemHeight(it),0)
      :rows*rowH,
    items:[],continuation:false,templateFixed:false
  };
  items.forEach((it,index)=>{
    const col=cols===1?0:Math.floor(index/rows);
    const row=cols===1?index:index%rows;
    let relY=row*rowH,height=rowH;
    if(group.key==='NUMERIC'){
      relY=items.slice(0,index).reduce((s,x)=>s+fixedNumericItemHeight(x),0);
      height=fixedNumericItemHeight(it);
    }
    sec.items.push({
      it,kind:group.key,x:SHEET_CONTENT_X_MM+col*subWidth,
      y:y+SHEET_BLOCK_HEAD_H_MM+relY,width:subWidth,height,
      numericSpec:group.key==='NUMERIC'?numericBubbleSpec(it):null
    });
  });
  return sec;
}
function buildFallbackPages(){
  const groups=fallbackGroups(),pages=[];
  let page={fixedTemplate:false,sections:[],items:[]},y=SHEET_CONTENT_TOP_MM;
  const push=()=>{if(page.items.length) pages.push(page);page={fixedTemplate:false,sections:[],items:[]};y=SHEET_CONTENT_TOP_MM;};
  for(const group of groups){
    let remaining=[...group.items];
    while(remaining.length){
      let best=null;
      for(let n=1;n<=remaining.length;n++){
        const sec=fallbackSection(group,remaining.slice(0,n),y);
        if(y+SHEET_BLOCK_HEAD_H_MM+sec.bodyHeight<=SHEET_CONTENT_BOTTOM_MM) best={n,sec};
        else break;
      }
      if(!best){ if(page.items.length){push();continue;} best={n:1,sec:fallbackSection(group,[remaining[0]],y)}; }
      page.sections.push(best.sec);page.items.push(...best.sec.items);
      y+=SHEET_BLOCK_HEAD_H_MM+best.sec.bodyHeight+2;
      remaining=remaining.slice(best.n);
      if(remaining.length) push();
    }
  }
  if(page.items.length) pages.push(page);
  return pages;
}
function buildSectionedLayoutPages(){
  if(!assessment) return [];
  const fixed=buildFixedA5WireframePage();
  if(fixed) return [fixed];
  return buildFallbackPages();
}
function answerLayoutPage(pageNo){
  return buildSectionedLayoutPages()[Math.max(0,Number(pageNo||1)-1)] || {sections:[],items:[]};
}

