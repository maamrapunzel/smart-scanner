'use strict';

const $ = id => document.getElementById(id);
const ITEMS_PER_PAGE = 25;
const STORE_ASSESSMENT = 'smartScanner.assessment.v2';
const STORE_RESULTS = 'smartScanner.results.v2';
const STORE_THRESHOLD = 'smartScanner.masteryThreshold.v2';
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARKER_MM = { tl:[10,10], tr:[200,10], br:[200,287], bl:[10,287] };
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

const SHEET_CONTENT_TOP_MM = 55;
const SHEET_CONTENT_BOTTOM_MM = 268;
const SHEET_CONTENT_X_MM = 17;
const SHEET_CONTENT_W_MM = 176;
const SHEET_BLOCK_GAP_MM = 2.6;
const SHEET_HALF_GAP_MM = 3;
const SHEET_HALF_W_MM = (SHEET_CONTENT_W_MM-SHEET_HALF_GAP_MM)/2;
const SHEET_BLOCK_HEAD_H_MM = 6.2;

const BASIC_ROW_H_MM = 5.35;
const BOX_ROW_H_MM = 6.8;
const NUMERIC_ROW_TOP_MM = 3.0;
const NUMERIC_ROW_GAP_MM = 3.55;

const REGISTRATION_MARKS_MM = [
  [10,58],[200,58],
  [10,96],[200,96],
  [10,134],[200,134],
  [10,172],[200,172],
  [10,210],[200,210],
  [10,248],[200,248]
];

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
  const start=13.2,end=Math.max(start+1,width-4.3);
  const step=count>1?Math.min(7.0,(end-start)/(count-1)):0;
  return Array.from({length:count},(_,i)=>start+i*step);
}
function tfBubbleXOffsets(width){
  const a=Math.min(width-15,18);
  const b=Math.min(width-4.5,31);
  return [a,Math.max(a+9,b)];
}
function numericSignXOffset(){ return 7.5; }
function numericDigitBubbleXOffsets(width){
  const start=12.3,end=Math.max(start+27,width-3.7);
  const step=Math.min(3.45,(end-start)/9);
  return Array.from({length:10},(_,i)=>start+i*step);
}
function sheetItemHeight(kind,it){
  if(kind==='NUMERIC'){
    const spec=numericBubbleSpec(it);
    if(spec.auto) return 3.5+spec.digits*NUMERIC_ROW_GAP_MM;
    return BOX_ROW_H_MM;
  }
  if(kind==='WRITTEN') return BOX_ROW_H_MM;
  return BASIC_ROW_H_MM;
}
function sheetBlockGroups(){
  if(!assessment) return [];
  const buckets=new Map();
  const meta={
    MCQ:{key:'MCQ',title:'MULTIPLE CHOICE',instruction:'Shade one circle only.'},
    WRITTEN:{key:'WRITTEN',title:'ALGEBRAIC / WORD ANSWERS',instruction:'Write one character or symbol per box.'},
    NUMERIC:{key:'NUMERIC',title:'NUMERIC ANSWERS',instruction:'Shade one digit in each row; use minus only when needed.'},
    TF:{key:'TF',title:'TRUE OR FALSE',instruction:'Shade T or F only.'}
  };
  assessment.items.forEach((it,index)=>{
    const t=canonicalSheetType(it.type);
    const key=t==='MCQ'?'MCQ':t==='TRUE/FALSE'?'TF':t==='NUMERICAL-BOX'?'NUMERIC':'WRITTEN';
    if(!buckets.has(key)) buckets.set(key,{...meta[key],items:[],firstIndex:index});
    buckets.get(key).items.push(it);
  });
  return [...buckets.values()]
    .sort((a,b)=>a.firstIndex-b.firstIndex)
    .map((g,i)=>({...g,letter:String.fromCharCode(65+i)}));
}
function groupLongestAnswer(group){
  return Math.max(1,...group.items.map(boxCountForSheetItem));
}
function sectionInnerColumns(group,width){
  const n=group.items.length;
  let minSub=42,maxCap=4,targetPerCol=12;
  if(group.key==='MCQ'){
    minSub=mcqLabels().length===5?41:36; maxCap=4; targetPerCol=13;
  }else if(group.key==='TF'){
    minSub=29; maxCap=4; targetPerCol=14;
  }else if(group.key==='WRITTEN'){
    const longest=groupLongestAnswer(group);
    minSub=longest>12?78:longest>8?57:40;
    maxCap=4; targetPerCol=12;
  }else if(group.key==='NUMERIC'){
    minSub=41; maxCap=4; targetPerCol=12;
  }
  const maxCols=Math.max(1,Math.min(maxCap,Math.floor(width/minSub)));
  return clamp(Math.ceil(n/targetPerCol),1,maxCols);
}
function sectionMetrics(group,width){
  const cols=sectionInnerColumns(group,width);
  const n=group.items.length;
  const subWidth=width/cols;
  const placements=[];
  let idx=0,maxH=0;

  for(let col=0;col<cols;col++){
    const remaining=n-idx,remainingCols=cols-col;
    const count=Math.ceil(remaining/remainingCols);
    let cy=0;
    for(let k=0;k<count && idx<n;k++,idx++){
      const it=group.items[idx],h=sheetItemHeight(group.key,it);
      placements.push({
        it,kind:group.key,
        relX:col*subWidth,relY:cy,
        width:subWidth,height:h,
        numericSpec:group.key==='NUMERIC'?numericBubbleSpec(it):null
      });
      cy+=h;
    }
    maxH=Math.max(maxH,cy);
  }
  return {cols,subWidth,placements,bodyHeight:maxH,totalHeight:SHEET_BLOCK_HEAD_H_MM+maxH};
}
function makeCompactSection(group,x,y,width,continuation=false){
  const m=sectionMetrics(group,width);
  const sec={
    key:group.key,letter:group.letter,title:group.title,instruction:group.instruction,
    x,y,width,continuation,columns:m.cols,bodyHeight:m.bodyHeight,items:[]
  };
  const bodyTop=y+SHEET_BLOCK_HEAD_H_MM;
  sec.items=m.placements.map(p=>({
    ...p,x:x+p.relX,y:bodyTop+p.relY
  }));
  return sec;
}
function buildSinglePageStrategy(groups,mode){
  const page={sections:[],items:[]};
  let y=SHEET_CONTENT_TOP_MM,i=0;
  while(i<groups.length){
    if(mode==='pairs' && i+1<groups.length){
      const left=makeCompactSection(groups[i],SHEET_CONTENT_X_MM,y,SHEET_HALF_W_MM,false);
      const right=makeCompactSection(groups[i+1],SHEET_CONTENT_X_MM+SHEET_HALF_W_MM+SHEET_HALF_GAP_MM,y,SHEET_HALF_W_MM,false);
      const h=Math.max(SHEET_BLOCK_HEAD_H_MM+left.bodyHeight,SHEET_BLOCK_HEAD_H_MM+right.bodyHeight);
      if(y+h<=SHEET_CONTENT_BOTTOM_MM){
        page.sections.push(left,right); page.items.push(...left.items,...right.items);
        y+=h+SHEET_BLOCK_GAP_MM; i+=2; continue;
      }
    }
    const full=makeCompactSection(groups[i],SHEET_CONTENT_X_MM,y,SHEET_CONTENT_W_MM,false);
    const h=SHEET_BLOCK_HEAD_H_MM+full.bodyHeight;
    if(y+h>SHEET_CONTENT_BOTTOM_MM) return null;
    page.sections.push(full); page.items.push(...full.items);
    y+=h+SHEET_BLOCK_GAP_MM; i++;
  }
  return page;
}
function buildFallbackPages(groups){
  const pages=[];
  let page={sections:[],items:[]},y=SHEET_CONTENT_TOP_MM;
  const pushPage=()=>{ if(page.items.length) pages.push(page); page={sections:[],items:[]}; y=SHEET_CONTENT_TOP_MM; };

  for(const original of groups){
    let remaining=[...original.items],continuation=false;
    while(remaining.length){
      let best=null;
      for(let count=1;count<=remaining.length;count++){
        const trialGroup={...original,items:remaining.slice(0,count)};
        const sec=makeCompactSection(trialGroup,SHEET_CONTENT_X_MM,y,SHEET_CONTENT_W_MM,continuation);
        if(y+SHEET_BLOCK_HEAD_H_MM+sec.bodyHeight<=SHEET_CONTENT_BOTTOM_MM) best={count,sec};
        else break;
      }
      if(!best){
        if(page.items.length){ pushPage(); continue; }
        const trialGroup={...original,items:[remaining[0]]};
        best={count:1,sec:makeCompactSection(trialGroup,SHEET_CONTENT_X_MM,y,SHEET_CONTENT_W_MM,continuation)};
      }
      page.sections.push(best.sec); page.items.push(...best.sec.items);
      y+=SHEET_BLOCK_HEAD_H_MM+best.sec.bodyHeight+SHEET_BLOCK_GAP_MM;
      remaining=remaining.slice(best.count); continuation=true;
      if(remaining.length) pushPage();
    }
  }
  if(page.items.length) pages.push(page);
  return pages;
}
function buildSectionedLayoutPages(){
  if(!assessment) return [];
  const groups=sheetBlockGroups();
  if(!groups.length) return [];
  const paired=buildSinglePageStrategy(groups,'pairs');
  if(paired) return [paired];
  const full=buildSinglePageStrategy(groups,'full');
  if(full) return [full];
  return buildFallbackPages(groups);
}
function answerLayoutPage(pageNo){
  return buildSectionedLayoutPages()[Math.max(0,Number(pageNo||1)-1)] || {sections:[],items:[]};
}

