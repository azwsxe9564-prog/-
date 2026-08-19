/* Context continuity + mind-map diffusion. Deliberately event-driven; no MutationObserver/polling loops. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const A=['A','B','C','D'];
  function bankQuestions(){try{return Array.isArray(window.quiz)?window.quiz:[]}catch{return[]}}
  function currentIndex(){try{return Number(window.cur)||0}catch{return 0}}
  function getQuestion(){const q=bankQuestions()[currentIndex()];return q||null}
  function isContinuation(q){return !!q && /承上題|承上题/.test(String(q.question||''))}
  function contextText(q){
    const qs=bankQuestions(); const i=currentIndex();
    if(!isContinuation(q)||i<=0)return null;
    const prev=qs[i-1]; if(!prev)return null;
    return {prev, index:i};
  }
  function renderContext(){
    const q=getQuestion();
    let box=document.getElementById('continuityContext');
    if(!box){box=document.createElement('div');box.id='continuityContext';const qt=document.getElementById('qtext');if(qt&&qt.parentNode)qt.parentNode.insertBefore(box,qt);}
    const ctx=contextText(q);
    if(!ctx){box.innerHTML='';box.style.display='none';return;}
    const p=ctx.prev; const choices=Array.isArray(p.choices)?p.choices:[];
    box.style.display='block';
    box.innerHTML='<div class="continuity-label">🔗 承上題｜請先看前一題的情境</div><div class="continuity-title">第 '+esc(p.number||ctx.index)+' 題</div><div class="continuity-question">'+esc(p.question||'')+'</div>'+
      (choices.length?'<div class="continuity-choices">'+choices.map((c,i)=>'<div><b>'+A[i]+'.</b> '+esc(c)+'</div>').join('')+'</div>':'');
  }
  function injectStyle(){
    if(document.getElementById('continuityMindmapStyle'))return;
    const s=document.createElement('style');s.id='continuityMindmapStyle';s.textContent=`
      #continuityContext{display:none;background:#f4f8f6;border:1px solid #cfe0d9;border-left:5px solid #2f6f5e;border-radius:14px;padding:14px;margin:10px 0 14px;line-height:1.8}
      .continuity-label{font-weight:800;color:#2f6f5e;margin-bottom:4px}.continuity-title{font-size:13px;color:#71807a;margin-bottom:4px}.continuity-question{font-size:16px;font-weight:700}.continuity-choices{margin-top:8px;padding-top:8px;border-top:1px solid #dfe7e3;font-size:14px}.continuity-choices div{margin:3px 0}
      #mindmapPanel{margin-top:14px;background:#fbfdfc;border:1px solid #dfe7e3;border-radius:16px;padding:14px}.mindmap-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.mindmap-head h3{margin:0}.mindmap-nodes{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.mindmap-node{border:1px solid #cfe0d9;background:#eef5f2;color:#24312d;border-radius:999px;padding:8px 12px;cursor:pointer}.mindmap-node:hover{border-color:#2f6f5e;background:#e1efe9}.mindmap-info{margin-top:12px;padding:12px;background:#fff;border-radius:12px;border:1px solid #dfe7e3;line-height:1.8}.mindmap-info h4{margin:0 0 6px;color:#2f6f5e}.mindmap-info ul{margin:6px 0;padding-left:20px}
    `;document.head.appendChild(s);
  }
  function concept(name){try{return window.G&&window.G[name]?window.G[name]:null}catch{return null}}
  function renderMindmap(rootName){
    const data=concept(rootName); if(!data)return;
    let panel=document.getElementById('mindmapPanel');
    if(!panel){panel=document.createElement('div');panel.id='mindmapPanel';const results=document.getElementById('keywordResults');if(results&&results.parentNode)results.parentNode.appendChild(panel);else return;}
    const rel=Array.isArray(data.r)?data.r:[];
    panel.innerHTML='<div class="mindmap-head"><h3>🧠 心智圖擴散</h3><span class="muted">點擊任一名詞繼續擴散</span></div><div class="mindmap-nodes"><button class="mindmap-node" data-concept="'+esc(rootName)+'">● '+esc(rootName)+'</button>'+rel.map(x=>'<button class="mindmap-node" data-concept="'+esc(x)+'">↗ '+esc(x)+'</button>').join('')+'</div><div class="mindmap-info" id="mindmapInfo"></div>';
    showConcept(rootName);
  }
  function showConcept(name){
    const d=concept(name); const info=document.getElementById('mindmapInfo'); if(!info)return;
    if(!d){info.innerHTML='<b>'+esc(name)+'</b><div class="muted">此名詞目前尚未建立完整名詞卡，可繼續搜尋。</div>';return;}
    const rel=Array.isArray(d.r)?d.r:[];
    info.innerHTML='<h4>'+esc(name)+'</h4><div>'+esc(d.s||'')+'</div>'+(d.p?'<ul>'+d.p.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+(rel.length?'<div class="muted">相關概念：'+rel.map(esc).join('、')+'</div>':'');
  }
  function install(){
    injectStyle();
    document.addEventListener('click',function(e){
      const node=e.target.closest&&e.target.closest('.mindmap-node');
      if(node){e.preventDefault();showConcept(node.dataset.concept);renderMindmap(node.dataset.concept);return;}
      setTimeout(renderContext,0);
    },true);
    document.addEventListener('input',function(e){
      if(e.target&&e.target.id==='keywordSearch')setTimeout(function(){
        const val=String(e.target.value||'').trim();
        if(val&&concept(val))renderMindmap(val);
        else if(!document.getElementById('mindmapPanel')){
          const results=document.getElementById('keywordResults');if(results){const first=results.querySelector('[data-keyword],button.keywordbtn');const n=first&&(first.dataset.keyword||first.textContent.replace(/^.*?\s/,'').trim());if(n&&concept(n))renderMindmap(n);}}
      },0);
    },true);
    document.addEventListener('click',function(e){
      const kb=e.target.closest&&e.target.closest('.keywordbtn');
      if(kb){setTimeout(function(){const n=kb.dataset.keyword||kb.textContent.trim();if(concept(n))renderMindmap(n)},0);}
    },true);
    setTimeout(renderContext,0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
