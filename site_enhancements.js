/* Full-credit / multiple-answer labels, scoring adjustments, and per-subject performance chart. */
(function(){
  function currentQuestion(){
    try { return (typeof quiz !== 'undefined' && quiz && quiz[cur]) || null; } catch(e){ return null; }
  }
  function isFullCredit(x){ return !!(x && (x.is_full_credit || (Array.isArray(x.accepted_answers) && x.accepted_answers.length===4))); }
  function isMultiple(x){ return !!(x && !isFullCredit(x) && Array.isArray(x.accepted_answers) && x.accepted_answers.length>1); }
  function badge(x){
    if(isFullCredit(x)) return '<span class="tag full-credit-tag">🎁 送分題｜本題一律給分</span>';
    if(isMultiple(x)) return '<span class="tag multi-answer-tag">⚠️ 複數答案｜'+x.accepted_answers.map(i=>['A','B','C','D'][i]).join('、')+' 均可</span>';
    return '';
  }
  function decorateQuestion(){
    const q=currentQuestion(), el=document.getElementById('qtext');
    if(!q || !el) return;
    el.innerHTML=badge(q)+'<div style="margin-top:8px">'+escapeHtml(q.question||'')+'</div>';
  }
  function decorateFeedback(){
    const q=currentQuestion(), el=document.getElementById('feedback');
    if(!q || !el) return;
    const b=badge(q);
    if(!b || !el.innerHTML || el.dataset.answerBadge===String(q.id)) return;
    const note=isFullCredit(q)
      ? '<div class="feedback ok" style="margin-top:10px"><b>🎁 官方送分題</b><br>本題依考選部標準答案一律給分，不列入錯題。</div>'
      : '<div class="feedback" style="margin-top:10px"><b>⚠️ 官方複數答案</b><br>可接受答案：'+q.accepted_answers.map(i=>['A','B','C','D'][i]).join('、')+'。</div>';
    el.insertAdjacentHTML('beforeend',note);
    el.dataset.answerBadge=String(q.id);
  }
  function accepted(x){
    if(isFullCredit(x)) return true;
    const a=answers && answers[x.id];
    return a!==undefined && Array.isArray(x.accepted_answers) && x.accepted_answers.includes(Number(a));
  }
  function subjectLabel(s){
    const t=String(s||'');
    if(t.includes('社會工作研究')) return '研究法';
    if(t.includes('人類行為')) return '人類行為';
    if(t.includes('社會政策')) return '社會政策';
    if(t.includes('直接服務')) return '社會工作實務';
    if(t==='社會工作') return '社會工作';
    return t;
  }
  function subjectOrder(){return ['社會工作','社會工作直接服務','社會政策與社會立法','人類行為與社會環境','社會工作研究方法'];}
  function renderSubjectChart(){
    const result=document.getElementById('result');
    if(!result || result.classList.contains('hidden') || typeof quiz==='undefined' || !Array.isArray(quiz) || !quiz.length) return;
    let old=document.getElementById('subjectPerformance');
    if(old) old.remove();
    const present=subjectOrder().filter(s=>(quiz||[]).some(q=>String(q.subject||'')===s));
    const extras=[...new Set((quiz||[]).map(q=>q.subject).filter(Boolean))].filter(s=>!subjectOrder().includes(s));
    const subjects=[...present,...extras];
    if(!subjects.length) return;
    const rows=subjects.map(s=>{
      const qs=(quiz||[]).filter(q=>String(q.subject||'')===s);
      const correct=qs.filter(accepted).length;
      const pct=Math.round((correct/qs.length)*100);
      const filled=Math.round(pct/10);
      const bar='█'.repeat(filled)+'░'.repeat(10-filled);
      let level=pct>=80?'🟢 穩定':pct>=70?'🟡 尚可':pct>=60?'🟠 需要加強':'🔴 優先複習';
      return '<div class="subject-performance-row"><div class="subject-performance-name">'+escapeHtml(subjectLabel(s))+'</div><div class="subject-performance-bar">'+bar+'</div><b class="subject-performance-pct">'+pct+'%</b><span class="subject-performance-level">'+level+'</span><span class="subject-performance-count">'+correct+'/'+qs.length+'</span></div>';
    }).join('');
    const div=document.createElement('div');
    div.id='subjectPerformance';
    div.className='status';
    div.style.marginTop='12px';
    div.innerHTML='<h3 style="margin:0 0 12px">📊 本次各科表現</h3><div class="muted" style="margin-bottom:10px">依照本次實際作答題目計算；送分題依官方規則計入正確。</div><div>'+rows+'</div>';
    const style=document.createElement('style');
    style.textContent='.subject-performance-row{display:grid;grid-template-columns:minmax(120px,1.3fr) minmax(150px,2fr) 52px 92px 52px;gap:8px;align-items:center;padding:9px 0;border-top:1px solid #e4ebe7;font-size:14px}.subject-performance-name{font-weight:700}.subject-performance-bar{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.5px;white-space:nowrap;overflow:hidden}.subject-performance-pct{text-align:right}.subject-performance-level{font-size:12px}.subject-performance-count{font-size:12px;color:var(--muted);text-align:right}@media(max-width:700px){.subject-performance-row{grid-template-columns:1fr auto;gap:4px 8px}.subject-performance-name{grid-column:1}.subject-performance-pct{grid-column:2}.subject-performance-bar{grid-column:1 / -1;grid-row:2;font-size:13px}.subject-performance-level{grid-column:1}.subject-performance-count{grid-column:2}}';
    div.appendChild(style);
    const actions=result.querySelector('.actions');
    if(actions) result.insertBefore(div,actions); else result.appendChild(div);
  }
  function decorateResult(){
    const result=document.getElementById('result');
    if(!result || result.classList.contains('hidden') || typeof quiz==='undefined') return;
    const full=(quiz||[]).filter(isFullCredit).length;
    const multi=(quiz||[]).filter(isMultiple).length;
    let old=document.getElementById('fullCreditSummary');
    if(old) old.remove();
    const div=document.createElement('div'); div.id='fullCreditSummary'; div.className='status ok'; div.style.marginTop='12px';
    div.innerHTML='<b>答案判定標示</b><br>🎁 送分題：<b>'+full+'</b> 題｜⚠️ 複數答案：<b>'+multi+'</b> 題';
    const actions=result.querySelector('.actions');
    if(actions) result.insertBefore(div,actions); else result.appendChild(div);
    renderSubjectChart();
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  const originalRender = window.render;
  if(typeof originalRender==='function'){
    window.render=function(){ originalRender(); decorateQuestion(); decorateFeedback(); };
  }
  const originalSubmit = window.submitQuiz;
  if(typeof originalSubmit==='function'){
    window.submitQuiz=function(){
      const saved={};
      try{
        (quiz||[]).forEach(x=>{
          if(isFullCredit(x) && answers[x.id]===undefined){ saved[x.id]=undefined; answers[x.id]=0; }
        });
        originalSubmit();
      } finally {
        Object.keys(saved).forEach(id=>delete answers[id]);
      }
    };
  }
  const observer=new MutationObserver(function(){
    decorateQuestion();
    decorateFeedback();
    decorateResult();
  });
  observer.observe(document.body,{subtree:true,childList:true});
  window.setTimeout(function(){decorateQuestion();decorateFeedback();decorateResult();},50);
})();
