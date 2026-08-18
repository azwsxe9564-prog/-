/* Personal-use local progress: no account, no server, export/import backup. */
(function(){
  const KEY='sw_stats';
  function get(){try{return JSON.parse(localStorage.getItem(KEY)||'{"attempts":[],"questions":{}}')}catch(e){return {attempts:[],questions:{}}}}
  function put(v){localStorage.setItem(KEY,JSON.stringify(v))}
  function fmt(iso){try{return new Date(iso).toLocaleString('zh-TW',{hour12:false})}catch(e){return iso||''}}
  function escape(s){return String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
  function panel(){
    let p=document.getElementById('localProgressPanel'); if(p)return p;
    p=document.createElement('section');p.id='localProgressPanel';p.className='card hidden';
    p.innerHTML='<h2>📚 我的學習紀錄</h2><p class="muted">資料只保存在目前裝置的瀏覽器，不需要登入。換裝置前請先匯出備份。</p><div id="localSummary"></div><div class="actions"><button onclick="localShowHistory()">📊 歷次模擬考</button><button class="secondary" onclick="localExport()">📤 匯出備份</button><label class="secondary" style="display:inline-flex;align-items:center;padding:11px 15px;border-radius:10px;cursor:pointer"><input type="file" id="localImportFile" accept="application/json" style="display:none" onchange="localImport(event)">📥 匯入備份</label><button class="danger" onclick="localClear()">🗑️ 清除全部紀錄</button><button class="secondary" onclick="goHome()">回首頁</button></div><div id="localHistory"></div>';
    document.querySelector('.wrap').appendChild(p); return p;
  }
  function render(){const p=panel(),s=get(),a=s.attempts||[],qs=s.questions||{},keys=Object.values(qs);const total=keys.reduce((n,q)=>n+(q.total||0),0),wrong=keys.reduce((n,q)=>n+(q.wrong||0),0),rate=total?Math.round((total-wrong)/total*100):0;p.querySelector('#localSummary').innerHTML='<div class="statgrid"><div class="stat"><small>模擬考次數</small><b>'+a.length+'</b></div><div class="stat"><small>累積作答</small><b>'+total+'</b></div><div class="stat"><small>累積正確率</small><b>'+rate+'%</b></div><div class="stat"><small>錯題</small><b>'+wrong+'</b></div></div>'}
  window.showStats=function(){['home','quiz','result','review'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.add('hidden')});render();document.getElementById('localProgressPanel').classList.remove('hidden');localShowHistory()}
  window.localShowHistory=function(){const s=get(),a=s.attempts||[],e=document.getElementById('localHistory');e.innerHTML='<h3>歷次模擬考</h3>'+(a.length?a.slice(0,50).map((x,i)=>'<div class="wrong"><b>第 '+(a.length-i)+' 次</b><span class="tag">'+escape(fmt(x.at))+'</span><p>分數：<b>'+x.score+'%</b>　答對：'+x.correct+'/'+x.total+'　不確定：'+(x.uncertain||0)+'</p></div>').join(''):'<p class="muted">尚無模擬考紀錄。</p>')}
  window.localExport=function(){const data={version:1,exportedAt:new Date().toISOString(),stats:get()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='socialwork-study-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url)}
  window.localImport=function(ev){const f=ev.target.files&&ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=function(){try{const d=JSON.parse(r.result);if(!d.stats||!d.stats.questions||!Array.isArray(d.stats.attempts))throw Error();if(!confirm('匯入會覆蓋目前學習紀錄，確定嗎？'))return;put(d.stats);render();localShowHistory();alert('學習紀錄已匯入。')}catch(e){alert('備份檔格式不正確。')}};r.readAsText(f);ev.target.value=''}
  window.localClear=function(){if(!confirm('確定清除所有本機學習紀錄？此動作無法復原。'))return;localStorage.removeItem(KEY);render();localShowHistory()}
  const oldStart=window.startQuiz;if(typeof oldStart==='function')window.startQuiz=function(){const p=document.getElementById('localProgressPanel');if(p)p.classList.add('hidden');return oldStart.apply(this,arguments)};
  setTimeout(function(){if(document.getElementById('home')){const b=document.createElement('button');b.className='secondary';b.textContent='📚 我的學習紀錄';b.onclick=showStats;const actions=document.querySelector('#home .actions');if(actions&&!actions.querySelector('[data-local-stats]')){b.dataset.localStats='1';actions.appendChild(b)}}},300);
})();
