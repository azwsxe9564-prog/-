/* Learning records and sync-code transfer. */
(function () {
  'use strict';
  const KEY = 'sw_stats', SEEN = 'sw_seen_v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {attempts:[],questions:{}}; } catch (_) { return {attempts:[],questions:{}}; } };
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  function makePanel() {
    let p = document.getElementById('localProgressPanel');
    if (p) return p;
    p = document.createElement('section'); p.id = 'localProgressPanel'; p.className = 'card hidden';
    p.innerHTML = '<h2>📚 我的學習紀錄</h2><p class="muted">跨裝置使用：舊裝置匯出同步碼，在新裝置匯入。</p><div id="localSummary"></div><div class="actions"><button onclick="localExport()">📤 匯出同步碼</button><button class="secondary" onclick="localImportPrompt()">📥 匯入同步碼</button><button class="secondary" onclick="localExportFile()">下載備份檔</button><button class="secondary" onclick="localShowHistory()">歷次模擬考</button><button class="secondary" onclick="goHome()">回首頁</button></div><div id="localHistory"></div>';
    document.querySelector('.wrap').appendChild(p); return p;
  }
  function refresh() {
    const s = read(), a = s.attempts || [], q = Object.values(s.questions || {}), total = q.reduce((n,x)=>n+Number(x.total||0),0), right = q.reduce((n,x)=>n+Number(x.right||0),0);
    makePanel().querySelector('#localSummary').innerHTML = '<div class="statgrid"><div class="stat"><small>模擬考次數</small><b>'+a.length+'</b></div><div class="stat"><small>累積作答</small><b>'+total+'</b></div><div class="stat"><small>累積正確率</small><b>'+(total?Math.round(right/total*100):0)+'%</b></div></div>';
  }
  window.showStats = function () {
    ['home','quiz','result','review'].forEach(id => { const el=document.getElementById(id); if(el)el.classList.add('hidden'); });
    refresh(); makePanel().classList.remove('hidden'); window.localShowHistory();
  };
  window.localShowHistory = function () {
    const a=read().attempts||[]; makePanel().querySelector('#localHistory').innerHTML='<h3>歷次模擬考</h3>'+(a.length?a.slice(0,50).map((x,i)=>'<div class="wrong"><b>第 '+(a.length-i)+' 次</b><p>'+esc(new Date(x.at).toLocaleString('zh-TW'))+'｜'+x.score+' 分｜'+x.correct+'/'+x.total+'</p></div>').join(''):'<p class="muted">尚無紀錄。</p>');
  };
  function pack(){return {format:'socialwork-sync',version:1,stats:read(),seen:(()=>{try{return JSON.parse(localStorage.getItem(SEEN)||'{}')}catch(_){return {}}})()};}
  function encode(data){const bytes=new TextEncoder().encode(JSON.stringify(data));let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return 'SW1'+btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
  function decode(code){code=String(code).trim().replace(/^SW1/,'').replace(/-/g,'+').replace(/_/g,'/');code+='='.repeat((4-code.length%4)%4);return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code),c=>c.charCodeAt(0))));}
  window.localExport=function(){const code=encode(pack()),w=window.open('','_blank');if(w){w.document.write('<meta charset="utf-8"><p>複製以下同步碼，貼到另一台裝置匯入：</p><textarea style="width:98%;height:75vh"></textarea>');const t=w.document.querySelector('textarea');t.value=code;t.select();}else prompt('請複製同步碼：',code);};
  window.localImportPrompt=function(){const code=prompt('貼上舊裝置的同步碼（SW1 開頭）：');if(!code)return;try{const d=decode(code);if(d.format!=='socialwork-sync'||d.version!==1||!d.stats)throw Error();if(!confirm('將合併同步碼與本機紀錄，不會直接覆蓋。繼續？'))return;const old=read(),attempts=new Map();[...(old.attempts||[]),...(d.stats.attempts||[])].forEach(a=>attempts.set([a.at,a.score,a.total,a.correct].join('|'),a));const questions={...old.questions};Object.entries(d.stats.questions||{}).forEach(([id,b])=>{const a=questions[id]||{},q={...a,...b};['wrong','right','total','uncertain'].forEach(k=>q[k]=Math.max(Number(a[k]||0),Number(b[k]||0)));q.reasons={...(a.reasons||{}),...(b.reasons||{})};questions[id]=q;});localStorage.setItem(KEY,JSON.stringify({attempts:[...attempts.values()].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,100),questions}));const seen=pack().seen;Object.entries(d.seen||{}).forEach(([k,v])=>seen[k]=[...new Set([...(seen[k]||[]),...(Array.isArray(v)?v:[])])]);localStorage.setItem(SEEN,JSON.stringify(seen));refresh();window.localShowHistory();alert('匯入完成，紀錄已合併。');}catch(_){alert('同步碼無效，請重新複製。')}};
  window.localExportFile=function(){const u=URL.createObjectURL(new Blob([JSON.stringify(pack(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='socialwork-backup.json';a.click();URL.revokeObjectURL(u);};
  const homeActions=document.querySelector('#home .actions');
  if(homeActions&&!homeActions.querySelector('[data-sync-entry]')){const b=document.createElement('button');b.className='secondary';b.textContent='📚 學習紀錄／同步碼';b.dataset.syncEntry='1';b.addEventListener('click',window.showStats);homeActions.appendChild(b);}
})();