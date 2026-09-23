// ---------- CAMERA / SCANNER ----------
$('startCameraBtn').addEventListener('click',startCamera);
$('stopCameraBtn').addEventListener('click',stopCamera);
$('captureBtn').addEventListener('click',captureAndRead);
$('photoInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  try{
    const img=await fileToImage(file); showImagePreview(img.src); await processSource(img);
  }catch(err){ console.error(err); setStatus('scanStatus','Could not open/read photo: '+err.message,'bad'); }
  e.target.value='';
});
$('clearReviewBtn').addEventListener('click',()=>{pendingReview=null;renderReview();setStatus('scanStatus','Review cleared.','neutral');});
$('savePageBtn').addEventListener('click',savePageResult);
async function startCamera(){
  if(!assessment){ setStatus('scanStatus','Upload a Master Excel first.','bad'); return; }
  if(!navigator.mediaDevices?.getUserMedia){ setStatus('scanStatus','Live camera is not supported here. Use Upload Photo.','bad'); return; }
  try{
    stopCamera();
    liveStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:2560}},audio:false});
    $('liveVideo').srcObject=liveStream; $('liveVideo').classList.remove('hide'); $('photoPreview').classList.add('hide'); $('cameraPlaceholder').classList.add('hide');
    setStatus('scanStatus','Camera ready. Fill the frame with the whole answer sheet.','ok');
  }catch(err){ setStatus('scanStatus','Camera error: '+err.message+'. You can use Upload Photo instead.','bad'); }
}
function stopCamera(){ if(liveStream){ liveStream.getTracks().forEach(t=>t.stop()); liveStream=null; } $('liveVideo').srcObject=null; }
async function captureAndRead(){
  if(!assessment){ setStatus('scanStatus','Upload a Master Excel first.','bad'); return; }
  const v=$('liveVideo'); if(!v.videoWidth){ setStatus('scanStatus','Start the camera first, or upload a photo.','bad'); return; }
  setStatus('scanStatus','Capturing and reading page…','neutral');
  await processSource(v);
}
function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(); const url=URL.createObjectURL(file);
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)}; img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Invalid image file'))}; img.src=url;
  });
}
function showImagePreview(src){ $('photoPreview').src=src; $('photoPreview').classList.remove('hide'); $('liveVideo').classList.add('hide'); $('cameraPlaceholder').classList.add('hide'); }
function refreshScannerControls(){
  const ls=$('learnerSelect'),ps=$('pageSelect');
  if(!assessment){ ls.innerHTML='<option>Upload assessment first</option>'; ps.innerHTML='<option>1</option>'; return; }
  const learners=assessment.learners.length?assessment.learners:[{no:'',id:'',name:'Manual / Unlisted Learner',section:assessment.info['Section']||''}];
  const old=ls.value; ls.innerHTML=learners.map((l,i)=>`<option value="${i}">${escapeHtml(l.no||i+1)} — ${escapeHtml(l.name)}</option>`).join(''); if([...ls.options].some(o=>o.value===old))ls.value=old;
  const pages=buildSectionedLayoutPages().length; const oldp=ps.value; ps.innerHTML=Array.from({length:pages},(_,i)=>`<option value="${i+1}">Page ${i+1}</option>`).join(''); if([...ps.options].some(o=>o.value===oldp))ps.value=oldp;
}
function sourceToImageData(source){
  const c=$('workCanvas'),ctx=c.getContext('2d',{willReadFrequently:true});
  const sw=source.videoWidth||source.naturalWidth||source.width, sh=source.videoHeight||source.naturalHeight||source.height;
  if(!sw||!sh) throw new Error('Image dimensions are not available.');
  const maxW=1450,scale=Math.min(1,maxW/sw); c.width=Math.round(sw*scale); c.height=Math.round(sh*scale); ctx.drawImage(source,0,0,c.width,c.height);
  return {canvas:c,data:ctx.getImageData(0,0,c.width,c.height)};
}
async function processSource(source){
  if(!assessment) return;
  try{
    setStatus('scanStatus','Reading QR and page markers…','neutral');
    const {canvas,data}=sourceToImageData(source);
    const qr=readQr(data);
    if(qr) applyQrSelection(qr); else $('qrStatus').textContent='QR: not detected — using manual learner/page selection';
    const pageNo=Number($('pageSelect').value||1);
    const result=analyzeImage(data,canvas,pageNo);
    pendingReview={pageNo,answers:result.answers,crops:result.crops,metrics:result.metrics,markerScore:result.markerScore};
    renderReview();
    const unread=Object.values(result.answers).filter(v=>!v).length;
    setStatus('scanStatus',`Page ${pageNo} read. Review ${unread?'unread/manual items':'detected answers'} before saving.`,'ok');
  }catch(err){ console.error(err); pendingReview=null; renderReview(); setStatus('scanStatus','Scan failed: '+err.message,'bad'); }
}
function readQr(img){
  if(typeof jsQR==='undefined') return null;
  try{
    const qr=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'}); if(!qr?.data?.startsWith('SS2|')) return null;
    const parts=qr.data.split('|'); if(parts.length<4) return null;
    return {assessmentId:parts[1],learnerKey:decodeURIComponent(parts[2]),pageNo:Number(parts[3])||1,raw:qr.data};
  }catch(_){ return null; }
}
function applyQrSelection(qr){
  if(qr.assessmentId!==assessment.id){ $('qrStatus').textContent='QR: different assessment detected — verify paper'; return; }
  let matched=false;
  assessment.learners.forEach((l,i)=>{ if(learnerKey(l)===qr.learnerKey){ $('learnerSelect').value=String(i); matched=true; } });
  if([...$('pageSelect').options].some(o=>Number(o.value)===qr.pageNo)) $('pageSelect').value=String(qr.pageNo);
  $('qrStatus').textContent=matched?`QR: learner + page identified automatically (Page ${qr.pageNo})`:`QR: page identified; learner not found in current list`;
}
function analyzeImage(img,canvas,pageNo){
  const markers=findFourMarkers(img);
  const H=homographyFromPageMM([markers.tl,markers.tr,markers.br,markers.bl]);
  const page=answerLayoutPage(pageNo);
  const answers={},crops={},metrics={};

  page.items.forEach(layout=>{
    const it=layout.it;

    if(layout.kind==='MCQ'){
      const y=layout.y+BASIC_ROW_H_MM/2;
      const xs=mcqLabels().map((_,j)=>layout.x+BLOCK_MCQ_BUBBLE_X_OFF[j]);
      const r=detectBubbles(img,H,xs,y,mcqLabels());
      answers[it.no]=r.value; metrics[it.no]=r;
      return;
    }

    if(layout.kind==='TF'){
      const y=layout.y+BASIC_ROW_H_MM/2;
      const xs=BLOCK_TF_BUBBLE_X_OFF.map(v=>layout.x+v);
      const r=detectBubbles(img,H,xs,y,['TRUE','FALSE']);
      answers[it.no]=r.value; metrics[it.no]=r;
      return;
    }

    if(layout.kind==='NUMERIC' && layout.numericSpec?.auto){
      const r=detectNumericBubbleAnswer(img,H,layout);
      answers[it.no]=r.value; metrics[it.no]=r;
      return;
    }

    answers[it.no]='';
    metrics[it.no]={value:'',confidence:0,manual:true};
    crops[it.no]=makeCropDataUrl(
      canvas,H,
      layout.x+14,layout.y,
      layout.x+layout.width-3,
      Math.min(layout.y+layout.height,SHEET_CONTENT_BOTTOM_MM)
    );
  });

  const markerScore=(markers.tl.score+markers.tr.score+markers.br.score+markers.bl.score)/4;
  return {answers,crops,metrics,markerScore};
}
