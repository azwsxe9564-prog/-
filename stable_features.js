/* Stable optional features: no MutationObserver, no DOM polling loops. */
(function(){
  'use strict';
  const A=['A','B','C','D'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const accepted=q=>Array.isArray(q&&q.accepted_answers)&&q.accepted_answers.length?q.accepted_answers:[Number(q&&q.answer)];
  const isFull=q=>!!(q&&((q.is_full_credit===true)||accepted(q).length===4));
  function getWrong(){try{return Array.isArray(lastWrong)?lastWrong:[]}catch(e){return[]}}
  function getQuiz(){try{return Array.isArray(quiz)?quiz:[]}catch(e){return[]}}
  function getAnswers(){try{return answers||{}}catch(e){return{}}}
  function review(){
    const root=document.getElementById('review'); if(!root)return;
    const entries=getWrong();
    if(!entries.length){root.innerHTML='<h2>錯題檢討</h2><div class="status ok">本次沒有錯題，太好了！</div>';return;}
    const html=entries.map(e=>{
      const q=e&&e.x?e.x:e, mine=e&&Object.prototype.hasOwnProperty.call(e,'a')?e.a:null;
      if(!q)return '';
      const ans=accepted(q), choices=Array.isArray(q.choices)?q.choices:[];
      const opts=choices.map((c,i)=>{
        const good=ans.includes(i), user=Number(mine)===i;
        return '<div class="review-choice '+(good?'correct':(user?'wrong':''))+'"><b>'+A[i]+'.</b> '+esc(c)+(good?'　✓ 正確答案':'')+(user?'　← 我的答案':'')+'</div>';
      }).join('');
      const expl=q.explanation||'本題目前沒有來源解析。';
      const tag=isFull(q)?'<span class="tag">🎁 送分題</span>':(ans.length>1?'<span class="tag">⚠️ 複數答案：'+ans.map(i=>A[i]).join('、')+'</span>':'');
      return '<article class="review-item"><div class="review-title"><b>'+esc(q.year)+'｜'+esc(q.subject)+'｜第 '+esc(q.number)+' 題</b>'+tag+'</div><div class="review-question">'+esc(q.question)+'</div>'+opts+'<div class="review-answer"><b>正確答案：'+ans.map(i=>A[i]).join('、')+'</b>｜你的答案：<b>'+(mine==null?'未作答':A[Number(mine)])+'</b></div><div class="review-explanation"><b>📖 題解／解析</b><div>'+esc(expl)+'</div><small>答案以考選部測驗式試題標準答案為準</small></div></article>';
    }).join('');
    root.innerHTML='<div class="actions"><button class="secondary" onclick="goHome()">← 回首頁</button></div><h2>錯題檢討</h2><div class="muted">共 '+entries.length+' 題｜直接查看題目、四個選項、正確答案、你的答案與解析。</div>'+html;
    root.querySelectorAll('.review-item').forEach(x=>x.style.cssText='border:1px solid #dfe7e3;border-radius:16px;padding:16px;margin:14px 0;background:#fff');
    root.querySelectorAll('.review-choice').forEach(x=>{x.style.cssText='padding:11px;border:1px solid #dfe7e3;border-radius:10px;margin:7px 0;line-height:1.7';if(x.classList.contains('correct'))x.style.background='#eaf7ef';if(x.classList.contains('wrong'))x.style.background='#fff0f1'});
    root.querySelectorAll('.review-explanation').forEach(x=>x.style.cssText='margin-top:12px;background:#f8faf9;border-left:5px solid #2f6f5e;padding:14px;line-height:1.9');
  }
  function chart(){
    const r=document.getElementById('result');if(!r||r.classList.contains('hidden'))return;const qz=getQuiz();if(!qz.length)return;
    const old=document.getElementById('stableSubjectChart');if(old)old.remove();
    const aa=getAnswers(),order=['社會工作','社會工作直接服務','社會政策與社會立法','人類行為與社會環境','社會工作研究方法'];
    const rows=order.filter(s=>qz.some(q=>q.subject===s)).map(s=>{const qs=qz.filter(q=>q.subject===s),c=qs.filter(q=>accepted(q).includes(Number(aa[q.id]))||isFull(q)).length,p=Math.round(c/qs.length*100),n=Math.round(p/10);return '<div style="display:grid;grid-template-columns:140px 1fr 50px;gap:8px;align-items:center;margin:8px 0"><b>'+esc(s.replace('社會工作直接服務','社會工作實務').replace('社會工作研究方法','研究法').replace('社會政策與社會立法','社會政策').replace('人類行為與社會環境','人類行為'))+'</b><span style="font-family:monospace;letter-spacing:1px">'+'█'.repeat(n)+'░'.repeat(10-n)+'</span><b>'+p+'%</b></div>'}).join('');
    if(!rows)return;const d=document.createElement('div');d.id='stableSubjectChart';d.className='status';d.style.marginTop='12px';d.innerHTML='<h3>📊 本次各科表現</h3>'+rows;r.appendChild(d);
  }
  function install(){
    const oldReview=window.showReview;
    if(typeof oldReview==='function')window.showReview=function(){oldReview.apply(this,arguments);review();};
    const oldSubmit=window.submitQuiz;
    if(typeof oldSubmit==='function')window.submitQuiz=function(){oldSubmit.apply(this,arguments);setTimeout(chart,0);};
    const style=document.createElement('style');style.textContent='.review-question{font-size:17px;line-height:1.85;margin:10px 0 14px}.review-answer{margin-top:12px;padding:12px;background:#f3f7f5;border-radius:10px;line-height:1.8}.review-explanation small{display:block;margin-top:8px;color:#71807a}';document.head.appendChild(style);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
