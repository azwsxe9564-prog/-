/* Safe optional enhancements. Must never interfere with core quiz startup. */
(function(){
  'use strict';
  const ABCD=['A','B','C','D'];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function current(){try{return Array.isArray(window.quiz)?window.quiz[window.cur]:null;}catch(e){return null;}}
  function accepted(q){
    if(!q)return [];
    if(q.is_full_credit===true)return [0,1,2,3];
    if(Array.isArray(q.accepted_answers)&&q.accepted_answers.length)return q.accepted_answers.map(Number).filter(Number.isInteger);
    if(Number.isInteger(Number(q.answer)))return [Number(q.answer)];
    return [];
  }
  function badge(q){
    const a=accepted(q);
    if(q&&q.is_full_credit===true||a.length===4)return '<span class="tag">🎁 送分題｜本題一律給分</span>';
    if(a.length>1)return '<span class="tag">⚠️ 複數答案｜'+a.map(i=>ABCD[i]).join('、')+' 均可</span>';
    return '';
  }
  function decorateQuestion(){
    const q=current(),el=document.getElementById('qtext');
    if(!q||!el)return;
    const text=String(q.question||'');
    if(el.dataset.baseQuestion===text)return;
    el.dataset.baseQuestion=text;
    el.innerHTML=badge(q)+'<div style="margin-top:8px">'+esc(text)+'</div>';
  }
  function decorateFeedback(){
    const q=current(),el=document.getElementById('feedback');
    if(!q||!el||!el.innerHTML)return;
    const b=badge(q);
    if(!b||el.dataset.answerBadge===String(q.id))return;
    el.insertAdjacentHTML('beforeend','<div class="feedback '+(q.is_full_credit?'ok':'')+'" style="margin-top:10px"><b>'+((q.is_full_credit)?'🎁 官方送分題':'⚠️ 官方答案判定')+'</b><br>'+((q.is_full_credit)?'本題依考選部標準答案一律給分，不列入錯題。':'答案以考選部測驗式試題標準答案為準。')+'</div>');
    el.dataset.answerBadge=String(q.id);
  }
  function subjectLabel(s){
    const t=String(s||'');
    if(t.includes('研究'))return '研究法';
    if(t.includes('人類行為'))return '人類行為';
    if(t.includes('社會政策'))return '社會政策';
    if(t.includes('直接服務'))return '社會工作實務';
    return t;
  }
  function renderSubjectChart(){
    const result=document.getElementById('result');
    if(!result||result.classList.contains('hidden')||!Array.isArray(window.quiz)||!window.quiz.length)return;
    if(document.getElementById('subjectPerformance'))return;
    const order=['社會工作','社會工作直接服務','社會政策與社會立法','人類行為與社會環境','社會工作研究方法'];
    const subjects=order.filter(s=>window.quiz.some(q=>String(q.subject||'')===s));
    if(!subjects.length)return;
    const rows=subjects.map(s=>{
      const qs=window.quiz.filter(q=>String(q.subject||'')===s);
      const correct=qs.filter(q=>{const a=accepted(q);if(q.is_full_credit)return true;try{const u=window.answers&&window.answers[q.id];return u!==undefined&&a.includes(Number(u));}catch(e){return false;}}).length;
      const pct=Math.round(correct/qs.length*100),filled=Math.round(pct/10);
      return '<div class="subject-performance-row"><b>'+esc(subjectLabel(s))+'</b><span>'+('█'.repeat(filled)+'░'.repeat(10-filled))+'</span><b>'+pct+'%</b></div>';
    }).join('');
    const div=document.createElement('div');
    div.id='subjectPerformance';div.className='status';div.style.marginTop='12px';
    div.innerHTML='<h3 style="margin:0 0 10px">📊 本次各科表現</h3>'+rows;
    const style=document.createElement('style');
    style.textContent='.subject-performance-row{display:grid;grid-template-columns:140px 1fr 55px;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #e4ebe7;font-size:14px}.subject-performance-row span{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;overflow:hidden}@media(max-width:700px){.subject-performance-row{grid-template-columns:110px 1fr 50px;font-size:13px}}';
    div.appendChild(style);
    const actions=result.querySelector('.actions');
    if(actions)result.insertBefore(div,actions);else result.appendChild(div);
  }
  function bindTerms(){
    document.querySelectorAll('.mind .node').forEach(function(node){
      if(node.dataset.safeTermBound)return;
      node.dataset.safeTermBound='1';
      node.addEventListener('click',function(){
        const term=node.textContent.trim();
        let box=document.getElementById('mindTermInfo');
        if(!box){box=document.createElement('div');box.id='mindTermInfo';box.className='card';const host=document.querySelector('.mind');if(host)host.parentNode.insertBefore(box,host.nextSibling);}
        if(box){box.innerHTML='<b>🔑 '+esc(term)+'</b><div class="muted" style="margin-top:8px">可在上方關鍵名詞搜尋查看這個名詞的完整解釋。</div>';}
      });
    });
  }
  function safeDecorate(){
    try{decorateQuestion();decorateFeedback();bindTerms();}catch(e){console.warn('[enhancements]',e);}
  }
  const observer=new MutationObserver(function(){safeDecorate();});
  function start(){
    safeDecorate();
    observer.observe(document.body,{subtree:true,childList:true});
    setTimeout(safeDecorate,100);
    setTimeout(safeDecorate,500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('load',function(){setTimeout(function(){try{renderSubjectChart();}catch(e){console.warn('[chart]',e);}},50);});
  const oldSubmit=window.submitQuiz;
  if(typeof oldSubmit==='function'){
    window.submitQuiz=function(){const r=oldSubmit.apply(this,arguments);setTimeout(function(){try{renderSubjectChart();}catch(e){console.warn('[chart]',e);}},50);return r;};
  }
})();
