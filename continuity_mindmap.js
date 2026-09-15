/* Continuity context + concept diffusion. Defensive, no observers or polling. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const A=['A','B','C','D'];
  function currentQuiz(){try{return Array.isArray(quiz)?quiz:[]}catch(e){return[]}}
  function currentIndex(){try{return Number(cur)||0}catch(e){return 0}}
  function isFollow(q){return !!q&&/^\s*(承上題|承上题)/.test(String(q.question||''))}
  function contextFor(q,i){if(!isFollow(q)||i<1)return null;return currentQuiz()[i-1]||null}
  function renderContinuity(){
    const qz=currentQuiz(),i=currentIndex(),q=qz[i],title=document.getElementById('qtext');
    const old=document.getElementById('previousQuestionContext');if(old)old.remove();
    if(!title||!q)return;
    const prev=contextFor(q,i);if(!prev)return;
    const box=document.createElement('section');box.id='previousQuestionContext';box.className='previous-question-context';
    const choices=Array.isArray(prev.choices)?prev.choices:[];
    box.innerHTML='<div class="pq-label">🔗 承上題｜上一題完整脈絡</div><div class="pq-meta">第 '+esc(prev.number??i)+' 題｜'+esc(prev.subject||'')+'</div><div class="pq-question">'+esc(prev.question||'')+'</div>'+(choices.length?'<div class="pq-choices">'+choices.map((c,n)=>'<div><b>'+A[n]+'.</b> '+esc(c)+'</div>').join('')+'</div>':'');
    title.parentNode.insertBefore(box,title);
  }
  const concepts={
    '創傷知情':['安全','信任與透明','同儕支持','合作','賦權與選擇','文化／性別／歷史脈絡'],
    '人在情境中':['生態系統觀點','個人','家庭','團體與組織','社區','政策與文化脈絡'],
    '生態系統觀點':['人在情境中','微視系統','中介系統','外部系統','鉅視系統','時間系統'],
    '同理':['積極傾聽','情感反映','澄清','接納','專業關係'],
    '接納':['尊重','非評判態度','同理','個別化','專業關係'],
    '專業關係':['同理','接納','真誠','保密','專業界線'],
    '賦權':['優勢觀點','自主與選擇','資源連結','倡導','充權'],
    '優勢觀點':['賦權','復原力','能力與資源','希望','合作關係'],
    '危機介入':['安全評估','建立關係','問題界定','資源動員','短期目標'],
    '社會支持':['情緒性支持','工具性支持','資訊性支持','正式支持','非正式支持']
  };
  const definitions={
    '安全':'優先建立身體與心理安全，降低再次受創或被威脅的風險。',
    '信任與透明':'清楚說明角色、流程、限制與選擇，避免隱瞞或不可預期的安排。',
    '同儕支持':'運用具有相似經驗者的支持，促進理解、希望與連結。',
    '合作':'服務對象是共同決策者，社工與其協商目標及介入方式。',
    '賦權與選擇':'尊重服務對象的自主性，提供可理解的選項並支持其作決定。',
    '人在情境中':'理解個人與其家庭、社區、制度及文化環境持續互動，不能脫離脈絡評估。',
    '生態系統觀點':'從個人與多層次環境的互動理解問題、優勢及可介入的系統。',
    '微視系統':'個人直接參與的環境，例如家庭、同儕與學校。',
    '中介系統':'個人所處兩個或多個微視系統之間的互動。',
    '外部系統':'個人未直接參與、但會間接影響其生活的制度或環境。',
    '鉅視系統':'文化、價值、法律、政策與社會結構等較大脈絡。',
    '時間系統':'生命歷程及歷史事件隨時間造成的影響。',
    '同理':'理解並適切回應服務對象的感受與觀點，不等於認同所有行為。',
    '接納':'尊重服務對象的尊嚴與獨特性，避免以道德評判取代專業理解。',
    '專業界線':'維持專業角色、權力與關係的適當界限，避免剝削或利益衝突。',
    '優勢觀點':'從個人、家庭與社區的能力、資源及復原力出發，而非只聚焦缺陷。',
    '復原力':'個人或系統面對逆境時調適、恢復或持續發展的能力與歷程。',
    '危機介入':'針對急性危機進行安全評估、穩定情緒、動員支持並建立可行的短期計畫。',
    '社會支持':'由人際網絡或正式服務提供的情緒、資訊或實際協助。'
  };
  function keywordPage(){return document.getElementById('keywordPage')||document.getElementById('keywords')||document.getElementById('keyword-page')}
  function findTermInfo(term){
    const input=document.getElementById('keywordSearch');
    if(input){input.value=term;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    const info=document.getElementById('conceptDefinition');
    if(info){info.textContent=definitions[term]||'目前名詞庫尚無此詞的完整解釋，請以題庫與教材核對。';}
  }
  function renderMindMap(term){
    const page=keywordPage();if(!page)return;
    let panel=document.getElementById('conceptDiffusion');
    if(!panel){panel=document.createElement('section');panel.id='conceptDiffusion';panel.className='card';page.appendChild(panel)}
    const nodes=concepts[term]||[...(concepts['人在情境中']||[])];
    panel.innerHTML='<div class="diff-title"><b>🧠 心智圖擴散</b><span class="muted">點選節點查看解釋並繼續擴散</span></div><div class="diff-map"><button type="button" class="diff-node core" data-term="'+esc(term)+'">'+esc(term)+'</button><span class="diff-link">→</span>'+nodes.map(n=>'<button type="button" class="diff-node" data-term="'+esc(n)+'">'+esc(n)+'</button>').join('')+'</div><div id="conceptDefinition" class="explain">'+esc(definitions[term]||'選擇任一名詞查看解釋。')+'</div>';
    panel.querySelectorAll('.diff-node').forEach(btn=>btn.addEventListener('click',()=>{const t=btn.dataset.term;findTermInfo(t);renderMindMap(t)}));
  }
  function addMindMapTrigger(){
    const page=keywordPage();if(!page||document.getElementById('mindMapTrigger'))return;
    const btn=document.createElement('button');btn.type='button';btn.id='mindMapTrigger';btn.className='secondary';btn.textContent='🧠 心智圖擴散';
    btn.addEventListener('click',()=>{const input=document.getElementById('keywordSearch');renderMindMap((input&&input.value.trim())||'人在情境中')});
    const actions=page.querySelector('.actions');if(actions)actions.appendChild(btn);else page.appendChild(btn);
  }
  function install(){
    const originalRender=window.render;
    if(typeof originalRender==='function'&&!originalRender.__continuityWrapped){const wrapped=function(){const r=originalRender.apply(this,arguments);renderContinuity();return r};wrapped.__continuityWrapped=true;window.render=wrapped;}
    const originalReview=window.showReview;
    if(typeof originalReview==='function'&&!originalReview.__continuityWrapped){const wrapped=function(){const r=originalReview.apply(this,arguments);return r};wrapped.__continuityWrapped=true;window.showReview=wrapped;}
    document.addEventListener('click',e=>{const t=e.target;if(t&&t.closest&&t.closest('#navActions'))renderContinuity();if(t&&t.closest&&t.closest('#keywordPage'))addMindMapTrigger()},{passive:true});
    renderContinuity();addMindMapTrigger();
  }
  const style=document.createElement('style');style.textContent='.previous-question-context{background:#f7faf8;border:1px solid #cfe1d9;border-left:5px solid #2f6f5e;border-radius:12px;padding:13px 15px;margin:0 0 14px;line-height:1.85}.pq-label{font-weight:800;color:#2f6f5e;margin-bottom:4px}.pq-meta{font-size:12px;color:#71807a;margin-bottom:5px}.pq-question{font-weight:600}.pq-choices{margin-top:8px;padding-top:8px;border-top:1px dashed #d6e2dd;font-size:14px}.diff-title{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.diff-map{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.diff-node{background:#eef3f0;color:#24312d;border:1px solid #cfdad5;border-radius:999px;padding:9px 13px}.diff-node.core{background:#2f6f5e;color:#fff;border-color:#2f6f5e}.diff-link{color:#71807a}';document.head.appendChild(style);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  }
})();
