/* Full-credit / multiple-answer labels and scoring adjustments. */
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
    if(!b) return;
    if(!el.innerHTML) return;
    const note=isFullCredit(q)
      ? '<div class="feedback ok" style="margin-top:10px"><b>🎁 官方送分題</b><br>本題依考選部標準答案一律給分，不列入錯題。</div>'
      : '<div class="feedback" style="margin-top:10px"><b>⚠️ 官方複數答案</b><br>可接受答案：'+q.accepted_answers.map(i=>['A','B','C','D'][i]).join('、')+'。</div>';
    el.insertAdjacentHTML('beforeend',note);
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
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  /* Preserve the original renderer, then add labels after every render. */
  const originalRender = window.render;
  if(typeof originalRender==='function'){
    window.render=function(){ originalRender(); decorateQuestion(); decorateFeedback(); };
  }

  /* Ensure official all-credit items count as correct even when left blank. */
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
