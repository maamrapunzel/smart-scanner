(function(){
  const parts=['app-part1.js','app-part2.js','app-part3.js','app-part4.js','app-part5.js','app-part6.js'];

  function makeMasterTemplate(){
    if(typeof XLSX==='undefined'){
      alert('Excel library is not ready. Reload the app while online, then try again.');
      return;
    }
    const wb=XLSX.utils.book_new();

    const info=[
      ['SMART SCANNER MASTER TEMPLATE',''],
      ['Field','Value'],
      ['Assessment Title','Mathematics Assessment'],
      ['Subject','Mathematics 8'],
      ['Grade Level','Grade 8'],
      ['Section','Acacia'],
      ['Term','Term 2'],
      ['Teacher',''],
      ['MCQ Choices',4],
      ['Notes','Edit the yellow cells only. Keep sheet names and column headers unchanged.']
    ];
    const wsInfo=XLSX.utils.aoa_to_sheet(info);
    wsInfo['!cols']=[{wch:24},{wch:72}];
    XLSX.utils.book_append_sheet(wb,wsInfo,'TEST INFO');

    const itemRows=[['Item No.','Question Type','Correct Answer','Accepted Answer(s)','Competency Code','Learning Competency / Skill','Points','Notes']];
    for(let i=1;i<=200;i++){
      let type='',key='',code='',skill='';
      if(i<=20){ type='MCQ'; key=['A','B','C','D'][(i-1)%4]; code=i<=10?'M8-SAMPLE-01':'M8-SAMPLE-02'; skill=i<=10?'Sample Competency 1 — replace this text':'Sample Competency 2 — replace this text'; }
      else if(i<=30){ type='TRUE/FALSE'; key=i%2?'TRUE':'FALSE'; code='M8-SAMPLE-03'; skill='Sample Competency 3 — replace this text'; }
      else if(i<=36){ type='NUMERICAL-BOX'; key=String(i-25); code='M8-SAMPLE-04'; skill='Sample Numerical Skill — replace this text'; }
      else if(i<=43){ type='WORD-BOX'; key='triangle'; code='M8-SAMPLE-05'; skill='Sample Word / Short Answer Skill — replace this text'; }
      else if(i<=50){ type='ALGEBRAIC-BOX'; key='2x+6'; code='M8-SAMPLE-06'; skill='Sample Algebraic Skill — replace this text'; }
      itemRows.push([i,type,key,'',code,skill,1,'']);
    }
    const wsItems=XLSX.utils.aoa_to_sheet(itemRows);
    wsItems['!cols']=[{wch:10},{wch:18},{wch:18},{wch:25},{wch:20},{wch:50},{wch:10},{wch:28}];
    XLSX.utils.book_append_sheet(wb,wsItems,'ITEMS');

    const learnerRows=[['Learner No.','LRN / ID','Learner Name','Sex','Section']];
    for(let i=1;i<=199;i++) learnerRows.push([i,'','','','']);
    const wsLearners=XLSX.utils.aoa_to_sheet(learnerRows);
    wsLearners['!cols']=[{wch:13},{wch:20},{wch:35},{wch:10},{wch:20}];
    XLSX.utils.book_append_sheet(wb,wsLearners,'LEARNERS');

    const guide=[
      ['SMART SCANNER MASTER EXCEL — QUICK GUIDE',''],
      ['Sheet','What to fill'],
      ['TEST INFO','Enter assessment title, subject, grade level, section, term, teacher, and MCQ choices (4 or 5).'],
      ['ITEMS','One row per test item. Do not skip Item No. values within the active test.'],
      ['Question Type','Use: MCQ, TRUE/FALSE, NUMERICAL-BOX, WORD-BOX, or ALGEBRAIC-BOX. The answer sheet groups sections automatically; there is NO fixed number of items per type.'],
      ['Correct Answer','Main answer key. Examples: B, TRUE, -12, triangle, 2x+6. WORD/ALGEBRAIC print one box per character. Integer NUMERICAL answers use digit bubbles with one optional minus sign.'],
      ['Accepted Answer(s)','Optional alternatives separated by | or ;. Examples: 0.5 | 1/2 or triangle | Triangle. For box items, SMART SCANNER uses the longest listed answer to decide how many character boxes to print.'],
      ['Competency Code','Optional code such as MELC/code used by your school or subject.'],
      ['Learning Competency / Skill','Write the exact skill/competency measured by the item. Items with the same competency will be grouped automatically in mastery analysis.'],
      ['Points','Default 1. You may assign more than 1 point to an item; scoring and analysis use the Points column.'],
      ['LEARNERS','Recommended. Add learner names/IDs, Sex (M/F), and Section. Sex and Section are used for the DepEd-style Item Analysis report and personalized QR answer sheets.'],
      ['Important','Keep sheet/header names unchanged. Printed answer sheets are dynamic. Learners should use black or blue pen and make no erasures.']
    ];
    const wsGuide=XLSX.utils.aoa_to_sheet(guide);
    wsGuide['!cols']=[{wch:26},{wch:115}];
    XLSX.utils.book_append_sheet(wb,wsGuide,'GUIDE');

    XLSX.writeFile(wb,'SMART_SCANNER_MASTER_TEMPLATE.xlsx');
  }

  const downloadLink=[...document.querySelectorAll('a')].find(a=>/Download Master Excel/i.test(a.textContent||''));
  if(downloadLink){
    downloadLink.href='#';
    downloadLink.removeAttribute('download');
    downloadLink.addEventListener('click',e=>{ e.preventDefault(); makeMasterTemplate(); });
  }

  (async()=>{
    for(const src of parts){
      await new Promise((resolve,reject)=>{
        const s=document.createElement('script');
        s.src=src;
        s.onload=resolve;
        s.onerror=()=>reject(new Error('Failed to load '+src));
        document.body.appendChild(s);
      });
    }
  })().catch(err=>{
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin','<div style="padding:12px;background:#ffe4e7;color:#8d2331;font-family:Arial">SMART SCANNER failed to load. Reload while online.</div>');
  });
})();