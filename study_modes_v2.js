/* STUDY_MODES_V2 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  let mode='fast';
  let fq=[],fc=0,fa={},fu={},fw=[],fmarked=[];
  let mq=[],mc=0,ma={},mu={},mw=[],mmarked=[];

  function statsGet(){try{return JSON.parse(localStorage.getItem('sw_stats')||'{"attempts":[],"questions":{}}')}catch{return{attempts:[],questions:{}}}}
  function statsSet(s){localStorage.setItem('sw_stats',JSON.stringify(s))}
  function showOnly(id){['home','quiz','result','review','keywordPage'].forEach(x=>{const e=$(x);if(e)e.classList.toggle('hidden',x!==id)})}
  function injectStyle(){if($('studyModesV2Style'))return;const s=document.createElement('style');s.id='studyModesV2Style';s.textContent=`
    .modegrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:12px 0}@media(max-width:700px){.modegrid{grid-template-columns:1fr}}
    .modecard{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fff;color:var(--ink);text-align:left;cursor:pointer}.modecard.active{border:2px solid var(--a);background:var(--soft)}.modecard b{display:block;margin-bottom:5px}.modecard small{font-weight:400;color:var(--muted);line-height:1.6}
    .instant{border-radius:14px;padding:14px;margin-top:12px;line-height:1.7}.instant.good{background:#edf8f2;border:1px solid #cfe4d8}.instant.bad{background:#fff1f1;border:1px solid #efcccc}.instant .answer{font-size:18px;font-weight:800}
    .fast-correct{border-color:#79bf35!important;background:#edf8d9!important}.fast-wrong{border-color:#ef4d5f!important;background:#fff0f2!important}.option:disabled{cursor:default;opacity:1}
  `;document.head.appendChild(s)}

  function addPicker(){const h=$('home');if(!h||$('studyModePickerV2'))return;const box=document.createElement('div');box.id='studyModePickerV2';box.innerHTML=`<label>學習模式</label><div class="modegrid"><button type="button" id="modeFast" class="modecard active"><b>⚡ 快問快答</b><small>選完立即知道對錯、看解析，再進下一題。適合日常刷題與觀念建立。</small></button><button type="button" id="modeMock" class="modecard"><b>📝 模擬考</b><small>整份作答後才看結果，訓練正式考試節奏、判斷與時間控制。</small></button></div>`;const grid=h.querySelector('.grid');grid.parentNode.insertBefore(box,grid);$('modeFast').onclick=()=>setMode('fast');$('modeMock').onclick=()=>setMode('mock')}
  function setMode(m){mode=m==='mock'?'mock':'fast';if($('modeFast'))$('modeFast').classList.toggle('active',mode==='fast');if($('modeMock'))$('modeMock').classList.toggle('active',mode==='mock')}
  window.setStudyMode=setMode;

  function pool(){return typeof filter==='function'?filter():[]}
  function selectedCount(p){const v=$('count').value;return v==='full'?p.length:Math.min(Number(v),p.length)}

  function beginFast(){const p=pool();if(!p.length)return alert('沒有符合條件的題目');fq=[...p].sort(()=>Math.random()-.5).slice(0,selectedCount(p));fc=0;fa={};fu={};fw=[];fmarked=[];showOnly('quiz');fastRender()}
  function fastRender(){const x=fq[fc];if(!x)return;const chosen=fa[x.id],marked=!!fu[x.id],answered=chosen!==undefined,last=fc===fq.length-1;$('qno').textContent=`第 ${fc+1}／${fq.length} 題｜${x.year}｜${x.subject}｜第 ${x.number} 題`;$('qtext').textContent=x.question;$('prog').style.width=((fc+1)/fq.length*100)+'%';$('opts').innerHTML=x.choices.map((o,i)=>{let c='option';if(answered&&i===x.answer)c+=' fast-correct';if(answered&&i===chosen&&chosen!==x.answer)c+=' fast-wrong';return `<button class="${c}" ${answered?'disabled':''} onclick="window.fastChooseV2(${i})">${String.fromCharCode(65+i)}. ${esc(o)}</button>`}).join('');let feedback='';if(answered){const ok=chosen===x.answer;feedback=`<div class="instant ${ok?'good':'bad'}"><div>${ok?'🟢 答對！':'🔴 答錯'}</div><div class="answer">正確答案：${String.fromCharCode(65+x.answer)}</div>${!ok?`<div>你的答案：${String.fromCharCode(65+chosen)}</div>`:''}<div style="margin-top:8px"><b>📌 解析</b><br>${esc(x.explanation||'本題目前沒有提供解析。')}</div>${x.source?`<div class="meta" style="margin-top:8px"><a href="${esc(x.source)}" target="_blank" rel="noopener">查看原題來源</a></div>`:''}</div>`;const ks=typeof keywordMatches==='function'?keywordMatches(x):[];if(ks.length)feedback+=`<div class="keywordbar"><b>🔑 本題關鍵名詞：</b>${ks.map(k=>`<button class="keywordbtn" onclick="openKeywordPage('${String(k).replaceAll("'","\\'")}')">${esc(k)}</button>`).join('')}</div>`}$('opts').insertAdjacentHTML('afterend',`<div id="instantFeedback">${feedback}</div>`)}const acts=[`<button class="uncertain ${marked?'on':''}" onclick="window.fastToggleV2()">${marked?'✓ 已標記不確定':'⚑ 不確定'}</button>`];if(answered&&!last)acts.push('<button onclick="window.fastNextV2()">下一題</button>');if(answered&&last)acts.push('<button class="danger" onclick="window.fastSubmitV2()">完成快問快答</button>');$('navActions').innerHTML=acts.join('')}
  window.fastChooseV2=i=>{const x=fq[fc];if(fa[x.id]!==undefined)return;fa[x.id]=i;if(i!==x.answer)fw.push({x,a:i});if(fu[x.id])fmarked.push({x,a:i});fastRender()};
  window.fastToggleV2=()=>{const id=fq[fc].id;if(fu[id])delete fu[id];else fu[id]=true;fastRender()};
  window.fastNextV2=()=>{if(fc<fq.length-1){fc++;fastRender()}};

  function beginMock(){const p=pool();if(!p.length)return alert('沒有符合條件的題目');mq=[...p].sort(()=>Math.random()-.5).slice(0,selectedCount(p));mc=0;ma={};mu={};mw=[];mmarked=[];showOnly('quiz');mockRender()}
  function mockRender(){const x=mq[mc],chosen=ma[x.id],marked=!!mu[x.id],last=mc===mq.length-1;$('qno').textContent=`第 ${mc+1}／${mq.length} 題｜${x.year}｜${x.subject}｜第 ${x.number} 題`;$('qtext').textContent=x.question;$('prog').style.width=((mc+1)/mq.length*100)+'%';$('opts').innerHTML=x.choices.map((o,i)=>`<button class="option ${chosen===i?'sel':''}" onclick="window.mockChooseV2(${i})">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('');$('navActions').innerHTML=`<button class="secondary" onclick="window.mockPrevV2()" ${mc===0?'disabled':''}>上一題</button><button class="secondary" onclick="window.mockNextV2()" ${last?'disabled':''}>下一題</button><button class="uncertain ${marked?'on':''}" onclick="window.mockToggleV2()">${marked?'✓ 已標記不確定':'⚑ 不確定'}</button>${last?'<button class="danger" onclick="window.mockSubmitV2()">交卷</button>':''}`}
  window.mockChooseV2=i=>{ma[mq[mc].id]=i;mockRender()};window.mockToggleV2=()=>{const id=mq[mc].id;if(mu[id])delete mu[id];else mu[id]=true;mockRender()};window.mockNextV2=()=>{if(mc<mq.length-1){mc++;mockRender()}};window.mockPrevV2=()=>{if(mc>0){mc--;mockRender()}};

  function record(qs,answers,uncertain,modeName){const st=statsGet();let correct=0,wrong=[];qs.forEach(x=>{const a=answers[x.id],mark=!!uncertain[x.id],q=st.questions[x.id]||{wrong:0,right:0,total:0,uncertain:0,reasons:{}};q.total=(q.total||0)+1;if(mark)q.uncertain=(q.uncertain||0)+1;if(a===x.answer){correct++;q.right=(q.right||0)+1}else{q.wrong=(q.wrong||0)+1;wrong.push({x,a})}st.questions[x.id]=q});const marked=qs.filter(x=>uncertain[x.id]).map(x=>({x,a:answers[x.id]}));const score=Math.round(correct/qs.length*100);st.attempts.unshift({at:new Date().toISOString(),score,correct,total:qs.length,uncertain:marked.length,mode:modeName});st.attempts=st.attempts.slice(0,100);statsSet(st);window.lastWrong=wrong;window.lastUncertain=marked;return{correct,score,wrong,marked}}
  function result(r,total,title){showOnly('result');$('result').innerHTML=`<h2>${title}</h2><div class="statgrid"><div class="stat"><small>分數</small><b>${r.score}</b></div><div class="stat"><small>答對</small><b>${r.correct}</b></div><div class="stat"><small>答錯</small><b>${total-r.correct}</b></div><div class="stat"><small>不確定</small><b>${r.marked.length}</b></div></div><p class="muted">⚑「不確定」不影響對錯判定，只會留下學習紀錄。</p><div class="actions"><button onclick="showReview()">檢討錯題</button><button class="secondary" onclick="goHome()">回首頁</button></div>`}
  window.fastSubmitV2=()=>{const missing=fq.filter(x=>fa[x.id]===undefined).length;if(missing)return alert(`還有 ${missing} 題尚未作答，請先完成。`);result(record(fq,fa,fu,'fast'),fq.length,'快問快答完成')};
  window.mockSubmitV2=()=>{if(!confirm('確定交卷？'))return;const missing=mq.filter(x=>ma[x.id]===undefined).length;if(missing&&!confirm(`還有 ${missing} 題未作答，確定仍要交卷？`))return;result(record(mq,ma,mu,'mock'),mq.length,'模擬考完成')};

  function patch(){window.startQuiz=function(){return mode==='mock'?beginMock():beginFast()};}
  function statusFix(){const s=$('status');if(typeof BANK!=='undefined'&&Array.isArray(BANK)&&BANK.length){s.className='card ok';s.innerHTML=`<b>✓ 正式歷屆題庫已載入</b><br>110–115 年｜五科｜共 <b>${BANK.length.toLocaleString()}</b> 題選擇題<br><span class="meta">現在可以開始刷題</span>`;$('home').classList.remove('hidden');if(typeof updatePool==='function')updatePool()}}
  function boot(){injectStyle();addPicker();patch();statusFix();let n=0;const t=setInterval(()=>{addPicker();patch();statusFix();if(++n>40)clearInterval(t)},250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
