/* Continuity + concept diffusion. No polling loops or MutationObserver. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const A=['A','B','C','D'];
  const getQuiz=()=>{try{return Array.isArray(window.quiz)?window.quiz:[]}catch(e){return[]}};
  const getCur=()=>{try{return Number(window.cur)||0}catch(e){return 0}};
  const isFollow=q=>q&&/^\s*(承上題|承上题)/.test(String(q.question||''));
  function contextFor(q,index){
    if(!isFollow(q)||index<=0)return null;
    const prev=getQuiz()[index-1];
    if(!prev)return null;
    return prev;
  }
  function renderContinuity(){
    const qz=getQuiz(),i=getCur(),q=qz[i];
    const title=document.getElementById('qtext');
    if(!title||!q)return;
    const old=document.getElementById('previousQuestionContext');
    if(old)old.remove();
    const prev=contextFor(q,i);
    if(!prev)return;
    const box=document.createElement('div');
    box.id='previousQuestionContext';
    box.className='previous-question-context';
    const choices=Array.isArray(prev.choices)?prev.choices:[];
    box.innerHTML='<div class="pq-label">🔗 承上題｜上一題完整情境</div>'+
      '<div class="pq-meta">第 '+esc(prev.number??(i))+' 題｜'+esc(prev.subject||'')+'</div>'+
      '<div class="pq-question">'+esc(prev.question||'')+'</div>'+ 
      (choices.length?'<div class="pq-choices">'+choices.map((c,n)=>'<div><b>'+A[n]+'.</b> '+esc(c)+'</div>').join('')+'</div>':'');
    title.parentNode.insertBefore(box,title);
  }
  function enhanceReview(){
    const root=document.getElementById('review');
    if(!root)return;
    const cards=root.querySelectorAll('.review-item');
    if(!cards.length)return;
    const qz=getQuiz();
    cards.forEach(card=>{
      const meta=card.querySelector('.review-title');
      const text=card.querySelector('.review-question');
      if(!meta||!text||card.querySelector('.review-context'))return;
      const m=(meta.textContent||'').match(/第\s*(\d+)\s*題/);
      if(!m)return;
      const n=Number(m[1]);
      const idx=qz.findIndex(q=>Number(q.number)===n);
      if(idx<1)return;
      const q=qz[idx];
      const prev=contextFor(q,idx);
      if(!prev)return;
      const box=document.createElement('div');
      box.className='review-context';
      box.innerHTML='<div class="pq-label">🔗 承上題｜必要前題</div><div class="pq-question">'+esc(prev.question||'')+'</div>';
      text.parentNode.insertBefore(box,text);
    });
  }
  const conceptMap={
    '創傷知情':['創傷知情','安全','信任','自主','同理','復原力'],
    '人在情境中':['人在情境中','生態系統觀點','家庭系統','社會支持','環境'],
    '生態系統觀點':['生態系統觀點','人在情境中','家庭系統','社會支持','環境'],
    '同理':['同理','接納','專業關係','反映','澄清'],
    '接納':['接納','同理','專業關係','尊重','非評判'],
    '專業關係':['專業關係','同理','接納','專業界線','反移情'],
    '賦權':['賦權','優勢觀點','自主','選擇','倡導'],
    '優勢觀點':['優勢觀點','賦權','復原力','資源','能力'],
    '危機介入':['危機介入','安全','支持','危機評估','短期介入'],
    '社會支持':['社會支持','家庭','朋友','社區','正式服務'],
    '反移情':['反移情','移情','督導','自我覺察','專業界線']
  };
  function findTermInfo(term){
    const input=document.getElementById('keywordSearch');
    if(input){input.value=term;try{if(typeof window.searchKeywords==='function')window.searchKeywords();}catch(e){}}
  }
  function renderMindMap(term){
    const page=document.getElementById('keywordPage');
    if(!page)return;
    let panel=document.getElementById('conceptDiffusion');
    if(!panel){panel=document.createElement('div');panel.id='conceptDiffusion';panel.className='card';page.appendChild(panel);}
    const nodes=conceptMap[term]||[term];
    panel.innerHTML='<div class="diff-title"><b>🧠 心智圖擴散</b><span class="muted">點擊任一名詞，直接查看對應解釋</span></div><div class="diff-map">'+nodes.map((n,i)=>'<button class="diff-node '+(i===0?'core':'')+'" data-term="'+esc(n)+'">'+esc(n)+'</button>').join('<span class="diff-link">→</span>')+'</div><div id="diffHint" class="muted">目前核心：'+esc(term)+'。點擊其他節點可繼續探索。</div>';
    panel.querySelectorAll('.diff-node').forEach(btn=>btn.addEventListener('click',function(){
      const t=this.dataset.term;findTermInfo(t);renderMindMap(t);
    }));
  }
  function addMindMapTrigger(){
    const page=document.getElementById('keywordPage');
    if(!page||document.getElementById('mindMapTrigger'))return;
    const btn=document.createElement('button');
    btn.id='mindMapTrigger';btn.className='secondary';btn.textContent='🧠 心智圖擴散';
    btn.addEventListener('click',function(){
      const term=(document.getElementById('keywordSearch')||{}).value||'創傷知情';
      renderMindMap(term.trim()||'創傷知情');
    });
    const actions=page.querySelector('.actions');
    if(actions)actions.appendChild(btn);
  }
  function post(){renderContinuity();addMindMapTrigger();enhanceReview();}
  function wrap(name,after){
    const fn=window[name];
    if(typeof fn!=='function'||fn.__continuityWrapped)return;
    const w=function(){const r=fn.apply(this,arguments);setTimeout(after,0);return r};
    w.__continuityWrapped=true;window[name]=w;
  }
  function install(){
    wrap('showQuestion',renderContinuity);
    wrap('renderQuestion',renderContinuity);
    wrap('nextQuestion',renderContinuity);
    wrap('showReview',function(){post();});
    wrap('showKeyword',function(){addMindMapTrigger();});
    document.addEventListener('click',function(e){
      const t=e.target;
      if(t&&t.closest&&t.closest('#opts,#nav'))setTimeout(renderContinuity,0);
      if(t&&t.closest&&t.closest('#keywordPage'))setTimeout(function(){addMindMapTrigger();enhanceReview()},0);
    },{passive:true});
    renderContinuity();addMindMapTrigger();
  }
  const style=document.createElement('style');
  style.textContent='.previous-question-context,.review-context{background:#f7faf8;border:1px solid #cfe1d9;border-left:5px solid #2f6f5e;border-radius:12px;padding:13px 15px;margin:0 0 14px;line-height:1.85}.pq-label{font-weight:800;color:#2f6f5e;margin-bottom:4px}.pq-meta{font-size:12px;color:#71807a;margin-bottom:5px}.pq-question{font-weight:600}.pq-choices{margin-top:8px;padding-top:8px;border-top:1px dashed #d6e2dd;font-size:14px}.review-context{margin-bottom:10px}.diff-title{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.diff-map{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.diff-node{background:#eef3f0;color:#24312d;border:1px solid #cfdad5;border-radius:999px;padding:9px 13px}.diff-node.core{background:#2f6f5e;color:#fff;border-color:#2f6f5e}.diff-link{color:#71807a}.diff-node:hover{border-color:#2f6f5e;transform:translateY(-1px)}';
  document.head.appendChild(style);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
