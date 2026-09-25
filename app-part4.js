function grayAt(img,x,y){
  x=clamp(Math.round(x),0,img.width-1); y=clamp(Math.round(y),0,img.height-1); const k=(y*img.width+x)*4; return (img.data[k]+img.data[k+1]+img.data[k+2])/3;
}
function darkIntegral(img,threshold=75){
  const w=img.width,h=img.height,I=new Int32Array((w+1)*(h+1));
  for(let y=1;y<=h;y++){
    let row=0,src=(y-1)*w*4;
    for(let x=1;x<=w;x++){
      const k=src+(x-1)*4,g=(img.data[k]+img.data[k+1]+img.data[k+2])/3; row += g<threshold?1:0; I[y*(w+1)+x]=I[(y-1)*(w+1)+x]+row;
    }
  }
  return I;
}
function rectSum(I,w,x0,y0,x1,y1){
  const W=w+1; x0=clamp(x0,0,w);x1=clamp(x1,0,w); const h=I.length/W-1;y0=clamp(y0,0,h);y1=clamp(y1,0,h);
  return I[y1*W+x1]-I[y0*W+x1]-I[y1*W+x0]+I[y0*W+x0];
}
function findDenseSquare(I,w,h,rx0,ry0,rx1,ry1){
  const win=Math.max(16,Math.round(Math.min(w,h)*0.026)),step=Math.max(3,Math.round(win/4));
  const xStart=Math.floor(w*rx0),xEnd=Math.floor(w*rx1),yStart=Math.floor(h*ry0),yEnd=Math.floor(h*ry1); let best=null;
  for(let y=yStart;y<=yEnd-win;y+=step){
    for(let x=xStart;x<=xEnd-win;x+=step){
      const dark=rectSum(I,w,x,y,x+win,y+win),ratio=dark/(win*win); if(!best||ratio>best.score) best={x:x+win/2,y:y+win/2,score:ratio,win};
    }
  }
  if(!best||best.score<0.48) return null;
  return best;
}
function findFourMarkers(img){
  const I=darkIntegral(img,75),w=img.width,h=img.height;
  const tl=findDenseSquare(I,w,h,0,0,.23,.21),tr=findDenseSquare(I,w,h,.77,0,1,.21),bl=findDenseSquare(I,w,h,0,.79,.23,1),br=findDenseSquare(I,w,h,.77,.79,1,1);
  if(!tl||!tr||!bl||!br) throw new Error('Could not find all 4 black corner markers. Retake the full page flatter and brighter.');
  const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y); if(Math.min(d(tl,tr),d(bl,br))<w*.55||Math.min(d(tl,bl),d(tr,br))<h*.55) throw new Error('Corner markers are too close together. Move back and capture the whole page.');
  return {tl,tr,br,bl};
}
function pointDistance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function findLocalRegistrationSquare(I,w,h,pred,pxPerMm){
  const expected=Math.max(7,3.3*pxPerMm);
  const radius=Math.max(expected*2.1,5.5*pxPerMm);
  const x0=Math.max(0,Math.floor(pred.x-radius)),x1=Math.min(w,Math.ceil(pred.x+radius));
  const y0=Math.max(0,Math.floor(pred.y-radius)),y1=Math.min(h,Math.ceil(pred.y+radius));
  let best=null;
  for(const scale of [.78,1,1.2]){
    const win=Math.max(6,Math.round(expected*scale));
    const step=Math.max(1,Math.round(win/4));
    for(let y=y0;y<=y1-win;y+=step){
      for(let x=x0;x<=x1-win;x+=step){
        const dark=rectSum(I,w,x,y,x+win,y+win),ratio=dark/(win*win);
        if(!best||ratio>best.score) best={x:x+win/2,y:y+win/2,score:ratio,win};
      }
    }
  }
  if(!best||best.score<.42) return null;
  if(pointDistance(best,pred)>radius*.92) return null;
  return best;
}
function homographyFromPointPairs(mmPts,imgPts){
  const A=[],b=[];
  for(let i=0;i<mmPts.length;i++){
    const [u,v]=mmPts[i],x=imgPts[i].x,y=imgPts[i].y;
    A.push([u,v,1,0,0,0,-x*u,-x*v]); b.push(x);
    A.push([0,0,0,u,v,1,-y*u,-y*v]); b.push(y);
  }
  if(A.length===8) return solveLinear(A,b);

  const n=8,AtA=Array.from({length:n},()=>Array(n).fill(0)),Atb=Array(n).fill(0);
  for(let r=0;r<A.length;r++){
    for(let i=0;i<n;i++){
      Atb[i]+=A[r][i]*b[r];
      for(let j=0;j<n;j++) AtA[i][j]+=A[r][i]*A[r][j];
    }
  }
  return solveLinear(AtA,Atb);
}
function calibratePage(img){
  const markers=findFourMarkers(img);
  const cornerMm=[MARKER_MM.tl,MARKER_MM.tr,MARKER_MM.br,MARKER_MM.bl];
  const cornerImg=[markers.tl,markers.tr,markers.br,markers.bl];
  let H=homographyFromPointPairs(cornerMm,cornerImg);

  const topMm=Math.hypot(MARKER_MM.tr[0]-MARKER_MM.tl[0],MARKER_MM.tr[1]-MARKER_MM.tl[1]);
  const bottomMm=Math.hypot(MARKER_MM.br[0]-MARKER_MM.bl[0],MARKER_MM.br[1]-MARKER_MM.bl[1]);
  const leftMm=Math.hypot(MARKER_MM.bl[0]-MARKER_MM.tl[0],MARKER_MM.bl[1]-MARKER_MM.tl[1]);
  const rightMm=Math.hypot(MARKER_MM.br[0]-MARKER_MM.tr[0],MARKER_MM.br[1]-MARKER_MM.tr[1]);
  const horizontal=((pointDistance(markers.tl,markers.tr)/topMm)+(pointDistance(markers.bl,markers.br)/bottomMm))/2;
  const vertical=((pointDistance(markers.tl,markers.bl)/leftMm)+(pointDistance(markers.tr,markers.br)/rightMm))/2;
  const pxPerMm=(horizontal+vertical)/2;
  const I=darkIntegral(img,85),foundMm=[],foundImg=[];

  for(const mm of REGISTRATION_MARKS_MM){
    const pred=mapH(H,mm[0],mm[1]);
    const found=findLocalRegistrationSquare(I,img.width,img.height,pred,pxPerMm);
    if(found){ foundMm.push(mm); foundImg.push(found); }
  }

  if(foundMm.length>=4){
    H=homographyFromPointPairs([...cornerMm,...foundMm],[...cornerImg,...foundImg]);
  }
  const allScores=[markers.tl.score,markers.tr.score,markers.br.score,markers.bl.score,...foundImg.map(x=>x.score)];
  return {
    markers,H,
    registrationCount:4+foundImg.length,
    score:allScores.reduce((a,b)=>a+b,0)/allScores.length
  };
}
function solveLinear(A,b){
  const n=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let i=0;i<n;i++){
    let m=i; for(let r=i+1;r<n;r++) if(Math.abs(M[r][i])>Math.abs(M[m][i]))m=r; [M[i],M[m]]=[M[m],M[i]];
    const p=M[i][i]; if(Math.abs(p)<1e-10) throw new Error('Page calibration failed.');
    for(let j=i;j<=n;j++) M[i][j]/=p;
    for(let r=0;r<n;r++) if(r!==i){ const f=M[r][i]; for(let j=i;j<=n;j++)M[r][j]-=f*M[i][j]; }
  }
  return M.map(r=>r[n]);
}
function homographyFromPageMM(q){
  return homographyFromPointPairs(
    [MARKER_MM.tl,MARKER_MM.tr,MARKER_MM.br,MARKER_MM.bl],
    q
  );
}
function mapH(H,u,v){ const[a,b,c,d,e,f,g,h]=H,den=g*u+h*v+1; return{x:(a*u+b*v+c)/den,y:(d*u+e*v+f)/den}; }
function bubbleDarkness(img,H,xmm,ymm){
  let sum=0,n=0,dark=0;
  for(let dy=-1.75;dy<=1.75;dy+=.4) for(let dx=-1.75;dx<=1.75;dx+=.4){
    if(dx*dx+dy*dy>2.7) continue;
    const p=mapH(H,xmm+dx,ymm+dy),g=grayAt(img,p.x,p.y);
    sum+=255-g; if(g<140)dark++; n++;
  }
  return {avg:sum/n,ratio:dark/n};
}
function detectBubbles(img,H,xs,y,labels){
  const vals=xs.map((x,i)=>({i,...bubbleDarkness(img,H,x,y)})).sort((a,b)=>b.avg-a.avg); const top=vals[0],second=vals[1]||{avg:0};
  const gap=top.avg-second.avg, confidence=clamp((gap/26)+(top.avg-35)/70,0,1); const value=(top.avg>43&&gap>7)?labels[top.i]:'';
  return {value,confidence,top:top.avg,gap};
}

function miniBubbleDarkness(img,H,xmm,ymm){
  let sum=0,n=0,dark=0;
  for(let dy=-1.25;dy<=1.25;dy+=.32) for(let dx=-1.25;dx<=1.25;dx+=.32){
    if(dx*dx+dy*dy>1.55) continue;
    const p=mapH(H,xmm+dx,ymm+dy),g=grayAt(img,p.x,p.y);
    sum+=255-g; if(g<135) dark++; n++;
  }
  return {avg:sum/n,ratio:dark/n};
}
function detectNumericDigitRow(img,H,layout,digitIndex){
  const y=layout.y+window.NUMERIC_ROW_TOP_MM+digitIndex*window.NUMERIC_ROW_GAP_MM;
  const xs=numericDigitBubbleXOffsets(layout.width);
  const vals=Array.from({length:10},(_,digit)=>{
    const x=layout.x+xs[digit];
    return {digit,...miniBubbleDarkness(img,H,x,y)};
  }).sort((a,b)=>b.avg-a.avg);

  const top=vals[0],second=vals[1]||{avg:0},gap=top.avg-second.avg;
  const confidence=clamp((gap/22)+(top.avg-30)/75,0,1);
  return {value:(top.avg>39&&gap>5)?String(top.digit):'',confidence,top:top.avg,gap};
}
function detectNumericBubbleAnswer(img,H,layout){
  const spec=layout.numericSpec||{digits:1};
  const digits=[],conf=[];

  for(let digitIndex=0;digitIndex<spec.digits;digitIndex++){
    const r=detectNumericDigitRow(img,H,layout,digitIndex);
    digits.push(r.value);
    conf.push(r.confidence);
  }

  const signX=layout.x+numericSignXOffset();
  const signY=layout.y+window.NUMERIC_ROW_TOP_MM;
  const sign=miniBubbleDarkness(img,H,signX,signY);
  const negative=sign.avg>78;
  const complete=digits.every(Boolean);
  const value=complete?(negative?'-':'')+digits.join(''):'';

  return {
    value,
    confidence:conf.length?Math.min(...conf):0,
    autoNumeric:true,
    signDarkness:sign.avg
  };
}
function makeCropDataUrl(src,H,x1,y1,x2,y2){
  const pts=[mapH(H,x1,y1),mapH(H,x2,y1),mapH(H,x2,y2),mapH(H,x1,y2)],xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const minX=clamp(Math.floor(Math.min(...xs)),0,src.width-1),minY=clamp(Math.floor(Math.min(...ys)),0,src.height-1),maxX=clamp(Math.ceil(Math.max(...xs)),1,src.width),maxY=clamp(Math.ceil(Math.max(...ys)),1,src.height);
  const c=document.createElement('canvas'); c.width=Math.max(1,maxX-minX); c.height=Math.max(1,maxY-minY); c.getContext('2d').drawImage(src,minX,minY,c.width,c.height,0,0,c.width,c.height); return c.toDataURL('image/jpeg',.82);
}
function renderReview(){
  const box=$('reviewList');
  if(!pendingReview){ box.innerHTML='<div class="empty-state">No scanned page yet.</div>'; $('reviewCount').textContent='0'; return; }
  const pageItems=answerLayoutPage(pendingReview.pageNo).items.map(x=>x.it); $('reviewCount').textContent=String(pageItems.length);
  box.innerHTML=pageItems.map(it=>{
    const v=pendingReview.answers[it.no]||'',m=pendingReview.metrics[it.no]||{},conf=Math.round((m.confidence||0)*100);
    let control='';
    if(it.type==='MCQ') control=`<div class="review-control-row"><select data-review="${it.no}"><option value="">— unread —</option>${mcqLabels().map(x=>`<option value="${x}" ${v===x?'selected':''}>${x}</option>`).join('')}</select><span class="answer-confidence ${conf>=65?'high':'low'}">${conf}%</span></div>`;
    else if(it.type==='TRUE/FALSE') control=`<div class="review-control-row"><select data-review="${it.no}"><option value="">— unread —</option><option value="TRUE" ${v==='TRUE'?'selected':''}>TRUE</option><option value="FALSE" ${v==='FALSE'?'selected':''}>FALSE</option></select><span class="answer-confidence ${conf>=65?'high':'low'}">${conf}%</span></div>`;
    else control=`${pendingReview.crops[it.no]?`<img class="crop-preview" src="${pendingReview.crops[it.no]}" alt="Item ${it.no} cropped answer">`:''}<input type="text" data-review="${it.no}" value="${escapeHtml(v)}" placeholder="Type learner answer after reviewing the crop">${m.autoNumeric?`<span class="answer-confidence ${conf>=65?'high':'low'}">${conf}% auto-read</span>`:''}`;
    return `<div class="review-item"><div class="review-head"><span>Item ${it.no}</span><span>${escapeHtml(it.type)}</span></div><div class="review-meta">Key: ${escapeHtml(it.key)}${it.accepted.length?' • Accepted: '+escapeHtml(it.accepted.join(' | ')):''}${it.competencyCode?' • '+escapeHtml(it.competencyCode):''}</div>${control}</div>`;
  }).join('');
}
function selectedLearner(){
  const learners=assessment.learners.length?assessment.learners:[{no:'',id:'',name:'Manual / Unlisted Learner',section:assessment.info['Section']||''}]; return learners[Number($('learnerSelect').value||0)]||learners[0];
}
function savePageResult(){
  if(!assessment||!pendingReview){ setStatus('scanStatus','Nothing to save.','bad'); return; }
  document.querySelectorAll('[data-review]').forEach(el=>pendingReview.answers[Number(el.dataset.review)]=String(el.value||'').trim());
  const learner=selectedLearner(),all=getAllResults(); all[assessment.id]=all[assessment.id]||{}; const key=learnerKey(learner);
  all[assessment.id][key]=all[assessment.id][key]||{learner,pages:{}};
  all[assessment.id][key].learner=learner; all[assessment.id][key].pages[pendingReview.pageNo]={answers:pendingReview.answers,savedAt:new Date().toISOString()}; saveAllResults(all);
  setStatus('scanStatus',`Page ${pendingReview.pageNo} saved for ${learner.name}.`,'ok'); pendingReview=null; renderReview(); renderResults(); renderAnalysis();
}

