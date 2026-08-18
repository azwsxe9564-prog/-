/* Personal-use progress panel + anonymous cloud sync bootstrap + inline wrong-question review. */
(function(){
  const KEY='sw_stats';
  function get(){try{return JSON.parse(localStorage.getItem(KEY)||'{"attempts":[],"questions":{}}')}catch(e){return {attempts:[],questions:{}}}}
  function put(v){localStorage.setItem(KEY,JSON.stringify(v));window.dispatchEvent(new Event('sw-local-changed'))}
  function fmt(iso){try{return new Date(iso).toLocaleString('zh-TW',{hour12:false})}catch(e){return iso||''}}
  function escape(s){return String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
  function panel(){
    let p=document.getElementById('localProgressPanel');if(p)return p;
    p=document.createElement('section');p.id='localProgressPanel';p.className='card hidden';
    p.innerHTML='<h2>📚 我的學習紀錄</h2><p class="muted">☁️ 不需登入，學習紀錄會自動同步雲端；本機也保留一份。建議偶爾下載備份。</p><div id="cloudState" class="meta">雲端同步：連線中…</div><div id="localSummary"></div><div class="actions"><button onclick="localShowHistory()">📊 歷次模擬考</button><button class="secondary" onclick="localExport()">📤 匯出備份</button><label class="secondary" style="display:inline-flex;align-items:center;padding:11px 15px;border-radius:10px;cursor:pointer"><input type="file" id="localImportFile" accept="application/json" style="display:none" onchange="localImport(event)">📥 匯入備份</label><button class="danger" onclick="localClear()">🗑️ 清除全部紀錄</button><button class="secondary" onclick="goHome()">回首頁</button></div><div id="localHistory"></div>';
    document.querySelector('.wrap').appendChild(p);return p;
  }
  function render(){const p=panel(),s=get(),a=s.attempts||[],qs=s.questions||{},keys=Object.values(qs);const total=keys.reduce((n,q)=>n+(q.total||0),0),wrong=keys.reduce((n,q)=>n+(q.wrong||0),0),rate=total?Math.round((total-wrong)/total*100):0;p.querySelector('#localSummary').innerHTML='<div class="statgrid"><div class="stat"><small>模擬考次數</small><b>'+a.length+'</b></div><div class="stat"><small>累積作答</small><b>'+total+'</b></div><div class="stat"><small>累積正確率</small><b>'+rate+'%</b></div><div class="stat"><small>錯題</small><b>'+wrong+'</b></div></div>';const c=p.querySelector('#cloudState');if(c)c.textContent=window.swCloud&&window.swCloud.ready?'☁️ 雲端同步已啟用':'☁️ 雲端同步準備中／離線模式'}
  window.showStats=function(){['home','quiz','result','review'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.add('hidden')});render();document.getElementById('localProgressPanel').classList.remove('hidden');localShowHistory()}
  window.localShowHistory=function(){const s=get(),a=s.attempts||[],e=document.getElementById('localHistory');e.innerHTML='<h3>歷次模擬考</h3>'+(a.length?a.slice(0,50).map((x,i)=>'<div class="wrong"><b>第 '+(a.length-i)+' 次</b><span class="tag">'+escape(fmt(x.at))+'</span><p>分數：<b>'+x.score+'%</b>　答對：'+x.correct+'/'+x.total+'　不確定：'+(x.uncertain||0)+'</p></div>').join(''):'<p class="muted">尚無模擬考紀錄。</p>')}
  window.localExport=function(){const data={version:2,exportedAt:new Date().toISOString(),stats:get()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='socialwork-study-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url)}
  window.localImport=function(ev){const f=ev.target.files&&ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=async function(){try{const d=JSON.parse(r.result);if(!d.stats||!d.stats.questions||!Array.isArray(d.stats.attempts))throw Error();if(!confirm('匯入會覆蓋目前學習紀錄，確定嗎？'))return;put(d.stats);render();localShowHistory();if(window.swCloud&&window.swCloud.ready)await window.swCloud.push();alert('學習紀錄已匯入並同步雲端。')}catch(e){alert('備份檔格式不正確。')}};r.readAsText(f);ev.target.value=''}
  window.localClear=async function(){if(!confirm('確定清除本機學習紀錄？雲端紀錄不會被刪除。'))return;localStorage.removeItem(KEY);render();localShowHistory()}
  const oldStart=window.startQuiz;if(typeof oldStart==='function')window.startQuiz=function(){const p=document.getElementById('localProgressPanel');if(p)p.classList.add('hidden');return oldStart.apply(this,arguments)};

  /* Post-exam review: show the complete wrong question and every choice inline. */
  window.showReview=function(){
    const review=document.getElementById('review'),result=document.getElementById('result');
    if(!review)return;
    if(result)result.classList.add('hidden');
    review.classList.remove('hidden');
    const st=get();
    const wrong=window.lastWrong||[];
    const uncertainList=window.lastUncertain||[];
    review.innerHTML='<h2>錯題檢討</h2><p class="muted">直接查看完整題目與全部選項。紅色＝你的錯誤答案，綠色＝官方答案，不需要另外跳轉。</p>'+
      (wrong.length?wrong.map(function(item){
        const x=item.x,a=item.a,q=st.questions[x.id]||{};
        const marked=uncertainList.some(z=>z.x&&z.x.id===x.id);
        const choices=(x.choices||[]).map(function(o,i){
          const letter=String.fromCharCode(65+i),mine=a===i,correct=x.answer===i;
          const cls=correct?'review-correct':(mine?'review-wrong':'');
          const badge=correct?'　✓ 官方答案':(mine?'　✗ 你的答案':'');
          return '<div class="review-option '+cls+'"><b>'+letter+'.</b> '+escape(o)+badge+'</div>';
        }).join('');
        return '<article class="wrong review-question"><div><b>'+escape(x.year)+'｜'+escape(x.subject)+'｜第 '+escape(x.number)+' 題</b>'+(marked?'<span class="tag">⚑ 曾標記不確定</span>':'')+'</div>'+
          '<h3 class="review-question-text">'+escape(x.question)+'</h3>'+choices+
          '<div class="explain"><b>正確答案：'+String.fromCharCode(65+x.answer)+'</b><br>'+escape(x.explanation||'本題解析請以題庫來源提供的解析為準。')+'</div>'+ 
          '<p class="meta">你的答案：'+(a==null?'未作答':String.fromCharCode(65+a))+'｜累計錯誤：'+(q.wrong||0)+' 次｜曾標記不確定：'+(q.uncertain||0)+' 次</p>'+ 
          (x.source?'<p class="meta"><a href="'+escape(x.source)+'" target="_blank" rel="noopener">原始題目</a></p>':'')+
          '</article>';
      }).join(''):'<p>本次沒有錯題。</p>')+
      '<div class="actions"><button onclick="goHome()">回首頁</button></div>';
    if(!document.getElementById('reviewInlineStyle')){
      const style=document.createElement('style');style.id='reviewInlineStyle';style.textContent='.review-question{margin-bottom:20px}.review-question-text{line-height:1.8;margin:14px 0}.review-option{padding:13px 14px;border:1px solid #dfe7e3;border-radius:10px;margin:7px 0;background:#fff;line-height:1.7}.review-option.review-wrong{background:#fff1f1;border-color:#e58d8d;color:#8d2525}.review-option.review-correct{background:#edf8df;border-color:#8bc83f;color:#315d14}.review-option b{margin-right:5px}';document.head.appendChild(style);
    }
  };

  setTimeout(function(){if(document.getElementById('home')){const b=document.createElement('button');b.className='secondary';b.textContent='📚 我的學習紀錄';b.onclick=showStats;const actions=document.querySelector('#home .actions');if(actions&&!actions.querySelector('[data-local-stats]')){b.dataset.localStats='1';actions.appendChild(b)} }},300);
  function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
  (async function bootstrapCloud(){
    try{
      window.SUPABASE_CONFIG={url:'https://qphaiblahlglcoyieyzm.supabase.co',key:'sb_publishable_yAozNhLoMK7UnZKxO9wBSA_tXMfZWhp'};
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      await loadScript('cloud_sync.js?v=20260818');
      if(window.swCloud){await window.swCloud.init();const c=document.getElementById('cloudState');if(c)c.textContent='☁️ 雲端同步已啟用'}
    }catch(e){console.warn('cloud sync unavailable; local mode remains active',e);const c=document.getElementById('cloudState');if(c)c.textContent='☁️ 雲端暫時無法連線，本機紀錄仍正常保存'}
  })();
})();
