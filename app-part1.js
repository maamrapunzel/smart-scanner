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
    learners=lr.slice(1).map((r,k)=>({
      no:String(li('Learner No.')>=0?r[li('Learner No.')]:k+1).trim(),
      id:String(li('LRN / ID')>=0?r[li('LRN / ID')]:'').trim(),
      name:String(li('Learner Name')>=0?r[li('Learner Name')]:'').trim(),
      section:String(li('Section')>=0?r[li('Section')]:(info['Section']||'')).trim()
    })).filter(x=>x.name);
  }
  return {fileName,info,items,learners,loadedAt:new Date().toISOString()};
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

const SHEET_CONTENT_TOP_MM = 66;
const SHEET_CONTENT_BOTTOM_MM = 270;
const SECTION_HEAD_H_MM = 8;
const BASIC_ROW_H_MM = 7;
const BOX_ROW_H_MM = 8;
const NUMERIC_BLOCK_H_MM = 42;
const NUMERIC_SIGN_X_MM = 43;
const NUMERIC_DIGIT_X0_MM = 63;
const NUMERIC_DIGIT_X_STEP_MM = 16;
const NUMERIC_DIGIT_Y0_MM = 10.5;
const NUMERIC_DIGIT_Y_STEP_MM = 3.05;

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
function sheetItemHeight(it){
  const t=canonicalSheetType(it.type);
  if(t==='NUMERICAL-BOX' && numericBubbleSpec(it).auto) return NUMERIC_BLOCK_H_MM;
  if(t==='WORD-BOX' || t==='ALGEBRAIC-BOX' || t==='NUMERICAL-BOX') return BOX_ROW_H_MM;
  return BASIC_ROW_H_MM;
}
function sheetSectionDefinitions(){
  return [
    {type:'MCQ',title:'MULTIPLE CHOICE',instruction:'Shade one circle only.'},
    {type:'TRUE/FALSE',title:'TRUE OR FALSE',instruction:'Shade T or F only.'},
    {type:'WORD-BOX',title:'WORD / TEXT ANSWERS',instruction:'Write one character per box.'},
    {type:'ALGEBRAIC-BOX',title:'ALGEBRAIC ANSWERS',instruction:'Write one character or symbol per box.'},
    {type:'NUMERICAL-BOX',title:'NUMERIC ANSWERS',instruction:'Shade one digit per column. Use the single minus sign only when needed.'}
  ];
}
function sectionColumnCount(def,group){
  if(def.type==='MCQ' || def.type==='TRUE/FALSE') return group.length>=6?2:1;
  if(def.type==='WORD-BOX' || def.type==='ALGEBRAIC-BOX'){
    const longest=Math.max(1,...group.map(it=>{
      const answers=[it.key,...(it.accepted||[])].map(v=>String(v??'').replace(/\s+/g,''));
      return Math.max(1,...answers.map(v=>v.length));
    }));
    return group.length>=4 && longest<=8 ? 2 : 1;
  }
  return 1;
}
function buildSectionedLayoutPages(){
  if(!assessment) return [];
  const pages=[];
  const newPage=()=>{ const p={sections:[],items:[]}; pages.push(p); return p; };
  let page=newPage(), y=SHEET_CONTENT_TOP_MM, visibleIndex=0;

  for(const def of sheetSectionDefinitions()){
    const group=assessment.items.filter(it=>canonicalSheetType(it.type)===def.type);
    if(!group.length) continue;
    const letter=String.fromCharCode(65+visibleIndex++);
    const columns=sectionColumnCount(def,group);
    const rowH=def.type==='NUMERICAL-BOX' ? NUMERIC_BLOCK_H_MM :
      ((def.type==='WORD-BOX'||def.type==='ALGEBRAIC-BOX') ? BOX_ROW_H_MM : BASIC_ROW_H_MM);
    let idx=0, continuation=false;

    while(idx<group.length){
      let availableRows=Math.floor((SHEET_CONTENT_BOTTOM_MM-y-SECTION_HEAD_H_MM)/rowH);
      if(availableRows<1){
        if(page.items.length){ page=newPage(); y=SHEET_CONTENT_TOP_MM; continue; }
        availableRows=1;
      }
      const remaining=group.length-idx;
      const capacity=Math.max(1,availableRows*columns);
      const count=Math.min(remaining,capacity);
      const chunk=group.slice(idx,idx+count);
      const rowsUsed=columns===2?Math.ceil(chunk.length/2):chunk.length;
      const sec={...def,letter,y,continuation,columns,items:[],bodyHeight:rowsUsed*rowH};
      page.sections.push(sec);
      const bodyTop=y+SECTION_HEAD_H_MM;

      if(columns===2){
        const leftCount=Math.ceil(chunk.length/2);
        chunk.forEach((it,k)=>{
          const col=k<leftCount?0:1;
          const row=col===0?k:k-leftCount;
          const layout={
            it,type:def.type,y:bodyTop+row*rowH,height:rowH,
            xOffset:col*88,column:col,columns,
            numericSpec:def.type==='NUMERICAL-BOX'?numericBubbleSpec(it):null
          };
          sec.items.push(layout); page.items.push(layout);
        });
      }else{
        chunk.forEach((it,row)=>{
          const layout={
            it,type:def.type,y:bodyTop+row*rowH,height:sheetItemHeight(it),
            xOffset:0,column:0,columns:1,
            numericSpec:def.type==='NUMERICAL-BOX'?numericBubbleSpec(it):null
          };
          sec.items.push(layout); page.items.push(layout);
        });
      }

      idx+=count;
      y=bodyTop+rowsUsed*rowH+2.5;
      continuation=true;
      if(idx<group.length){ page=newPage(); y=SHEET_CONTENT_TOP_MM; }
    }
  }
  return pages.filter(p=>p.items.length);
}
function answerLayoutPage(pageNo){
  return buildSectionedLayoutPages()[Math.max(0,Number(pageNo||1)-1)] || {sections:[],items:[]};
}

