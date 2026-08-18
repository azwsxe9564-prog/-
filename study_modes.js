/* STUDY_MODES_V1
   Two study modes:
   - fast: immediate feedback after each answer
   - mock: existing full-exam flow with review after submission
*/
(function(){
  'use strict';
  const $id=id=>document.getElementById(id);
  const esc2=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  let originalStartQuiz=null;
  let fastQuiz=[],fastCur=0,fastAns={},fastUncertain={},fastWrong=[],fastMarked=[],fastStartedAt=0;

  function addStyles(){
    if($id('studyModesStyle')) return;
    const st=document.createElement('style');st.id='studyModesStyle';
    st.textContent=`
      .modegrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:12px 0}
      @media(max-width:700px){.modegrid{grid-template-columns:1fr}}
      .modecard{border:1px solid var(--line);border-radius:14px;padding:13px;background:#fff;cursor:pointer;text-align:left}
      .modecard.active{border:2px solid var(--a);background:var(--soft)}
      .modecard b{display:block;margin-bottom:4px}.modecard small{color:var(--muted);line-height:1.6}
      .instant{border-radius:14px;padding:14px;margin-top:12px;line-height:1.7}
      .instant.ok{background:#edf8f2;border:1px solid #cfe4d8}.instant.bad{background:#fff1f1;border:1px solid #efcccc}
      .instant .answer{font-size:18px;font-weight:800}.fastmeta{font-size:12px;color:var(--muted)}
      .keywordHint{margin-top:10px}
    `;document.head.appendChild(st);
  }

  function addModePicker(){
    const home=$id('home'); if(!home||$id('studyModePicker')) return;
    const p=document.createElement('div');p.id='studyModePicker';p.innerHTML=`
      <label>學習模式</label>
      <div class="modegrid">
        <button type="button" class="modecard active" data-mode="fast" onclick="window.setStudyMode('fast')"><b>⚡ 快問快答</b><small>選完立即知道對錯、看解析，再進下一題。適合日常刷題。</small></button>
        <button type="button" class="modecard" data-mode="mock" onclick="window.setStudyMode('mock')"><b>📝 模擬考</b><small>整份作答後才看結果，訓練正式考試節奏與時間控制。</small></button>
      </div>`;
    const grid=home.querySelector('.grid');grid.parentNode.insertBefore(p,grid);
    window.setStudyMode('fast');
  }

  window.setStudyMode=function(mode){
    window.currentStudyMode=mode==='mock'?'mock':'fast';
    document.querySelectorAll('#studyModePicker .modecard').forEach(b=>b.classList.toggle('active',b.dataset.mode===window.currentStudyMode));
  };

  function hideAll(){['home','result','review','keywordPage'].forEach(id=>{const e=$id(id);if(e)e.classList.add('hidden')});}

  function startFastQuiz(){
    const pool=typeof filter==='function'?filter():[];
    if(!pool.length){alert('沒有符合條件的題目');return;}
    const count=$id('count').value==='full'?pool.length:Number($id('count').value);
    fastQuiz=[...pool].sort(()=>Math.random()-.5).slice(0,Math.min(count,pool.length));
    fastCur=0;fastAns={};fastUncertain={};fastWrong=[];fastMarked=[];fastStartedAt=Date.now();
    hideAll();$id('quiz').classList.remove('hidden');
    fastRender();
  }

  function fastRender(){
    const x=fastQuiz[fastCur];if(!x)return;
    const id=x.id,chosen=fastAns[id],marked=!!fastUncertain[id],answered=chosen!==undefined,last=fastCur===fastQuiz.length-1;
    $id('qno').textContent=`第 ${fastCur+1}／${fastQuiz.length} 題｜${x.year}｜${x.subject}｜第 ${x.number} 題`;
    $id('qtext').textContent=x.question;
    $id('prog').style.width=((fastCur+1)/fastQuiz.length*100)+'%';
    $id('opts').innerHTML=x.choices.map((o,i)=>{
      let cls='option';
      if(answered&&i===x.answer)cls+=' fast-correct';
      if(answered&&i===chosen&&chosen!==x.answer)cls+=' fast-wrong';
      if(!answered&&chosen===i)cls+=' sel';
      return `<button class="${cls}" ${answered?'disabled':''} onclick="window.fastChoose(${i})">${String.fromCharCode(65+i)}. ${esc2(o)}</button>`;
    }).join('');
    let feedback='';
    if(answered){
      const ok=chosen===x.answer;
      feedback=`<div class="instant ${ok?'ok':'bad'}"><div>${ok?'🟢 答對！':'🔴 答錯'}</div><div class="answer">正確答案：${String.fromCharCode(65+x.answer)}</div>${!ok?`<div>你的答案：${String.fromCharCode(65+chosen)}</div>`:''}<div style="margin-top:8px"><b>📌 解析</b><br>${esc2(x.explanation||'本題目前沒有提供解析。')}</div>${x.source?`<div class="fastmeta" style="margin-top:8px"><a href="${esc2(x.source)}" target="_blank" rel="noopener">查看原題來源</a></div>`:''}</div>`;
      const keywords=typeof keywordMatches==='function'?keywordMatches(x):[];
      if(keywords.length){feedback+=`<div class="keywordHint"><b>🔑 關鍵名詞：</b>${keywords.map(k=>`<button class="keywordbtn" onclick="openKeywordPage('${String(k).replaceAll("'","\\'")}')">${esc2(k)}</button>`).join('')}</div>`;}
    }
    $id('opts').insertAdjacentHTML('afterend',`<div id="fastFeedback">${feedback}</div>`);
    const actions=[];
    actions.push(`<button class="uncertain ${marked?'on':''}" onclick="window.fastToggleUncertain()">${marked?'✓ 已標記不確定':'⚑ 不確定'}</button>`);
    if(answered&&!last)actions.push('<button onclick="window.fastNext()">下一題</button>');
    if(answered&&last)actions.push('<button class="danger" onclick="window.fastSubmit()">完成快問快答</button>');
    $id('navActions').innerHTML=actions.join('');
  }

  window.fastChoose=function(i){
    const x=fastQuiz[fastCur];if(!x||fastAns[x.id]!==undefined)return;
    fastAns[x.id]=i;
    const ok=i===x.answer;
    const marked=!!fastUncertain[x.id];
    if(!ok)fastWrong.push({x,a:i});
    if(marked)fastMarked.push({x,a:i});
    fastRender();
  };
  window.fastToggleUncertain=function(){
    const id=fastQuiz[fastCur].id;
    if(fastUncertain[id])delete fastUncertain[id];else fastUncertain[id]=true;
    fastRender();
  };
  window.fastNext=function(){if(fastCur<fastQuiz.length-1){fastCur++;fastRender();}};

  function recordFastResults(){
    const st=typeof load==='function'?load('stats',{attempts:[],questions:{}}):{attempts:[],questions:{}};
    let correct=0;
    fastQuiz.forEach(x=>{
      const a=fastAns[x.id],marked=!!fastUncertain[x.id];
      const q=st.questions[x.id]||{wrong:0,right:0,total:0,uncertain:0,reasons:{}};
      q.total=(q.total||0)+1;
      if(marked)q.uncertain=(q.uncertain||0)+1;
      if(a===x.answer){correct++;q.right=(q.right||0)+1}else q.wrong=(q.wrong||0)+1;
      st.questions[x.id]=q;
    });
    const score=Math.round(correct/fastQuiz.length*100);
    st.attempts.unshift({at:new Date().toISOString(),score,correct,total:fastQuiz.length,uncertain:fastMarked.length,mode:'fast'});
    st.attempts=st.attempts.slice(0,100);
    if(typeof save==='function')save('stats',st);
    window.lastWrong=fastWrong;window.lastUncertain=fastMarked;
    return {correct,score,st};
  }

  window.fastSubmit=function(){
    const missing=fastQuiz.filter(x=>fastAns[x.id]===undefined).length;
    if(missing){alert(`還有 ${missing} 題尚未作答，請先完成。`);return;}
    const r=recordFastResults();
    $id('quiz').classList.add('hidden');$id('result').classList.remove('hidden');
    $id('result').innerHTML=`<h2>快問快答完成</h2><div class="statgrid"><div class="stat"><small>分數</small><b>${r.score}</b></div><div class="stat"><small>答對</small><b>${r.correct}</b></div><div class="stat"><small>答錯</small><b>${fastQuiz.length-r.correct}</b></div><div class="stat"><small>不確定</small><b>${fastMarked.length}</b></div></div><p class="muted">⚡ 本模式每題立即回饋；錯題與不確定紀錄仍會累積到你的個人學習資料。</p><div class="actions"><button onclick="showReview()">檢討錯題</button><button class="secondary" onclick="goHome()">回首頁</button></div>`;
  };

  function patchStart(){
    if(typeof window.startQuiz!=='function'||originalStartQuiz)return;
    originalStartQuiz=window.startQuiz;
    window.startQuiz=function(){
      if(window.currentStudyMode==='mock')return originalStartQuiz();
      return startFastQuiz();
    };
  }

  function patchStatus(){
    const s=$id('status');if(!s)return;
    if(typeof BANK!=='undefined'&&Array.isArray(BANK)&&BANK.length>0){
      s.className='card ok';
      s.innerHTML=`<b>✓ 正式歷屆題庫已載入</b><br>110–115 年｜五科｜共 <b>${BANK.length.toLocaleString()}</b> 題選擇題<br><span class="meta">現在可以開始刷題</span>`;
      const h=$id('home');if(h)h.classList.remove('hidden');if(typeof updatePool==='function')updatePool();
    }
  }

  function boot(){
    addStyles();addModePicker();patchStart();patchStatus();
    let n=0;const t=setInterval(()=>{addModePicker();patchStart();patchStatus();if(++n>30)clearInterval(t)},300);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
