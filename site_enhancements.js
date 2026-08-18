/* Full-credit / multiple-answer labels, scoring adjustments, subject performance chart, and clickable mind-map term definitions. */
(function(){
  function currentQuestion(){ try { return (typeof quiz !== 'undefined' && quiz && quiz[cur]) || null; } catch(e) { return null; } }
  function isFullCredit(x){ return !!(x && (x.is_full_credit || (Array.isArray(x.accepted_answers) && x.accepted_answers.length===4))); }
  function isMultiple(x){ return !!(x && !isFullCredit(x) && Array.isArray(x.accepted_answers) && x.accepted_answers.length>1); }
  function badge(x){ if(isFullCredit(x)) return '<span class="tag full-credit-tag">🎁 送分題｜本題一律給分</span>'; if(isMultiple(x)) return '<span class="tag multi-answer-tag">⚠️ 複數答案｜'+x.accepted_answers.map(i=>['A','B','C','D'][i]).join('、')+' 均可</span>'; return ''; }
  function decorateQuestion(){ const q=currentQuestion(),el=document.getElementById('qtext'); if(!q||!el)return; el.innerHTML=badge(q)+'<div style="margin-top:8px">'+escapeHtml(q.question||'')+'</div>'; }
  function decorateFeedback(){ const q=currentQuestion(),el=document.getElementById('feedback'); if(!q||!el)return; const b=badge(q); if(!b||!el.innerHTML||el.dataset.answerBadge===String(q.id))return; const note=isFullCredit(q)?'<div class="feedback ok" style="margin-top:10px"><b>🎁 官方送分題</b><br>本題依考選部標準答案一律給分，不列入錯題。</div>':'<div class="feedback" style="margin-top:10px"><b>⚠️ 官方複數答案</b><br>可接受答案：'+q.accepted_answers.map(i=>['A','B','C','D'][i]).join('、')+'。</div>'; el.insertAdjacentHTML('beforeend',note);el.dataset.answerBadge=String(q.id); }
  function accepted(x){ if(isFullCredit(x))return true; const a=answers&&answers[x.id]; return a!==undefined&&Array.isArray(x.accepted_answers)&&x.accepted_answers.includes(Number(a)); }
  function subjectLabel(s){ const t=String(s||'');if(t.includes('社會工作研究'))return'研究法';if(t.includes('人類行為'))return'人類行為';if(t.includes('社會政策'))return'社會政策';if(t.includes('直接服務'))return'社會工作實務';if(t==='社會工作')return'社會工作';return t; }
  function subjectOrder(){return['社會工作','社會工作直接服務','社會政策與社會立法','人類行為與社會環境','社會工作研究方法'];}
  function renderSubjectChart(){ const result=document.getElementById('result');if(!result||result.classList.contains('hidden')||typeof quiz==='undefined'||!Array.isArray(quiz)||!quiz.length)return;let old=document.getElementById('subjectPerformance');if(old)old.remove();const present=subjectOrder().filter(s=>(quiz||[]).some(q=>String(q.subject||'')===s));const extras=[...new Set((quiz||[]).map(q=>q.subject).filter(Boolean))].filter(s=>!subjectOrder().includes(s));const subjects=[...present,...extras];if(!subjects.length)return;const rows=subjects.map(s=>{const qs=(quiz||[]).filter(q=>String(q.subject||'')===s);const correct=qs.filter(accepted).length;const pct=Math.round((correct/qs.length)*100);const filled=Math.round(pct/10);const bar='█'.repeat(filled)+'░'.repeat(10-filled);let level=pct>=80?'🟢 穩定':pct>=70?'🟡 尚可':pct>=60?'🟠 需要加強':'🔴 優先複習';return'<div class="subject-performance-row"><div class="subject-performance-name">'+escapeHtml(subjectLabel(s))+'</div><div class="subject-performance-bar">'+bar+'</div><b class="subject-performance-pct">'+pct+'%</b><span class="subject-performance-level">'+level+'</span><span class="subject-performance-count">'+correct+'/'+qs.length+'</span></div>';}).join('');const div=document.createElement('div');div.id='subjectPerformance';div.className='status';div.style.marginTop='12px';div.innerHTML='<h3 style="margin:0 0 12px">📊 本次各科表現</h3><div class="muted" style="margin-bottom:10px">依照本次實際作答題目計算；送分題依官方規則計入正確。</div><div>'+rows+'</div>';const style=document.createElement('style');style.textContent='.subject-performance-row{display:grid;grid-template-columns:minmax(120px,1.3fr) minmax(150px,2fr) 52px 92px 52px;gap:8px;align-items:center;padding:9px 0;border-top:1px solid #e4ebe7;font-size:14px}.subject-performance-name{font-weight:700}.subject-performance-bar{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.5px;white-space:nowrap;overflow:hidden}.subject-performance-pct{text-align:right}.subject-performance-level{font-size:12px}.subject-performance-count{font-size:12px;color:var(--muted);text-align:right}@media(max-width:700px){.subject-performance-row{grid-template-columns:1fr auto;gap:4px 8px}.subject-performance-name{grid-column:1}.subject-performance-pct{grid-column:2}.subject-performance-bar{grid-column:1 / -1;grid-row:2;font-size:13px}.subject-performance-level{grid-column:1}.subject-performance-count{grid-column:2}}';div.appendChild(style);const actions=result.querySelector('.actions');if(actions)result.insertBefore(div,actions);else result.appendChild(div); }
  function decorateResult(){ const result=document.getElementById('result');if(!result||result.classList.contains('hidden')||typeof quiz==='undefined')return;const full=(quiz||[]).filter(isFullCredit).length;const multi=(quiz||[]).filter(isMultiple).length;let old=document.getElementById('fullCreditSummary');if(old)old.remove();const div=document.createElement('div');div.id='fullCreditSummary';div.className='status ok';div.style.marginTop='12px';div.innerHTML='<b>答案判定標示</b><br>🎁 送分題：<b>'+full+'</b> 題｜⚠️ 複數答案：<b>'+multi+'</b> 題';const actions=result.querySelector('.actions');if(actions)result.insertBefore(div,actions);else result.appendChild(div);renderSubjectChart(); }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  const originalRender=window.render;if(typeof originalRender==='function'){window.render=function(){originalRender();decorateQuestion();decorateFeedback();};}
  const originalSubmit=window.submitQuiz;if(typeof originalSubmit==='function'){window.submitQuiz=function(){const saved={};try{(quiz||[]).forEach(x=>{if(isFullCredit(x)&&answers[x.id]===undefined){saved[x.id]=undefined;answers[x.id]=0;}});originalSubmit();}finally{Object.keys(saved).forEach(id=>delete answers[id]);}};}
  const observer=new MutationObserver(function(){decorateQuestion();decorateFeedback();decorateResult();bindMindTerms();});observer.observe(document.body,{subtree:true,childList:true});window.setTimeout(function(){decorateQuestion();decorateFeedback();decorateResult();bindMindTerms();},50);

  /* Click any mind-map term to show its matching core definition immediately. */
  const TERM_INFO={
    '人在情境中':{title:'人在情境中',body:'理解個人時，不能只看個人的特質或問題，也要同時考量其所處的家庭、社區、組織與社會環境，以及這些脈絡如何影響個人的生活與行為。'},
    '生態系統觀點':{title:'生態系統觀點',body:'從個人與環境之間的互動來理解問題，關注不同系統彼此的影響，以及個人與環境是否存在適配或失配。'},
    '個人 ↔ 環境':{title:'個人 ↔ 環境',body:'強調個人與環境是相互影響的。評估問題時，不只問「個人出了什麼問題」，也要看環境是否提供足夠資源、支持與適當條件。'},
    '家庭／組織／社區':{title:'家庭／組織／社區',body:'屬於理解個人處境時可觀察的環境脈絡。家庭、組織與社區可能提供支持，也可能成為壓力或限制來源。'},
    '整體性評估':{title:'整體性評估',body:'不只聚焦單一症狀或事件，而是整合個人、家庭、環境、資源、優勢與問題脈絡，形成較完整的評估。'},
    '專業關係':{title:'專業關係',body:'社工與服務對象之間為助人目的所建立的有界線關係，包含信任、尊重、合作與專業界線。'},
    '接納':{title:'接納',body:'尊重服務對象作為一個獨特的人，理解其感受與處境，而不是以個人的價值標準否定或評斷對方。'},
    '同理':{title:'同理',body:'嘗試從服務對象的觀點理解其感受、想法與經驗，並讓對方感受到自己被理解。'},
    '合作目標':{title:'合作目標',body:'由社工與服務對象共同討論並形成的工作方向，強調服務對象的參與與自主，而非由社工單方面決定。'},
    '福利政策':{title:'福利政策',body:'政府或社會為回應社會需求、分配福利資源與促進社會福祉所形成的政策安排。'},
    '資源分配':{title:'資源分配',body:'討論有限的社會資源如何在不同人口、需求與群體之間分配，是社會政策的重要議題。'},
    '公平／正義':{title:'公平／正義',body:'關注福利資源、權利與機會的分配是否合理，以及不同群體是否受到公平對待。'},
    '制度設計':{title:'制度設計',body:'將政策目標轉化為具體制度與服務安排，包括資格、給付、服務方式與執行機制等。'},
    '發展階段':{title:'發展階段',body:'將人的發展視為具有不同階段與任務的歷程，理解各階段可能出現的身心與社會發展特徵。'},
    '心理社會發展':{title:'心理社會發展',body:'強調人的心理發展與社會環境、社會關係之間的互動，常用於理解不同生命階段的發展任務。'},
    '環境脈絡':{title:'環境脈絡',body:'指影響個人生活與行為的家庭、社區、文化、制度與社會條件等背景。'},
    '信度':{title:'信度',body:'測量工具結果的一致性或穩定程度。信度高表示在相同或相近條件下，測量結果較為一致。'},
    '一致性':{title:'一致性',body:'測量結果在不同題目、評分者或測量時點之間維持一致的程度，屬於信度概念的重要面向。'},
    '穩定性':{title:'穩定性',body:'同一測量工具在不同時間重複測量時，結果維持相近的程度。'},
    '效度':{title:'效度',body:'測量工具是否真正測量到它所要測量的概念或特質。'},
    '測量':{title:'測量',body:'依據一定規則，將研究對象的特徵或概念轉化為可觀察、可記錄或可比較的數值或類別。'}
  };
  function showTerm(term){
    const info=TERM_INFO[term]||{title:term,body:'目前核心名詞庫尚未建立這個名詞的完整解釋。可先將它加入名詞庫，之後再補充定義。'};
    let box=document.getElementById('mindTermInfo');
    if(!box){box=document.createElement('div');box.id='mindTermInfo';box.className='mind-term-info';const anchor=document.querySelector('.mind.show')||document.querySelector('.mind');if(anchor)anchor.parentNode.insertBefore(box,anchor.nextSibling);else return;}
    box.innerHTML='<div class="mind-term-head"><b>🔑 '+escapeHtml(info.title)+'</b><button type="button" class="secondary mind-term-close">關閉</button></div><div class="mind-term-body">'+escapeHtml(info.body)+'</div>';
    box.classList.add('show');
    box.querySelector('.mind-term-close').onclick=function(){box.classList.remove('show')};
  }
  function bindMindTerms(){
    document.querySelectorAll('.mind .node').forEach(function(node){
      if(node.dataset.termBound)return;
      node.dataset.termBound='1';
      const term=node.textContent.trim();
      node.setAttribute('role','button');node.setAttribute('tabindex','0');node.title='點擊查看名詞解釋';node.classList.add('mind-clickable');
      node.addEventListener('click',function(e){e.preventDefault();showTerm(term)});
      node.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();showTerm(term)}});
    });
  }
  const mindStyle=document.createElement('style');mindStyle.textContent='.mind .mind-clickable{cursor:pointer;transition:transform .15s,box-shadow .15s}.mind .mind-clickable:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(47,111,94,.12)}.mind .mind-clickable:focus{outline:2px solid #2f6f5e;outline-offset:2px}.mind-term-info{background:#fff;border:1px solid #dfe7e3;border-radius:14px;padding:14px;margin-top:12px;box-shadow:0 3px 12px rgba(36,49,45,.06)}.mind-term-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:18px;color:#2f6f5e}.mind-term-close{font-size:12px;padding:7px 10px}.mind-term-body{margin-top:9px;line-height:1.8;color:#40504a}';document.head.appendChild(mindStyle);

  /* Passwordless email login + cloud learning sync */
  const SUPABASE_URL='https://qphaiblahlglcoyieyzm.supabase.co';
  const SUPABASE_KEY=window.SUPABASE_PUBLISHABLE_KEY||'';
  let sb=null,authUser=null;
  const LOCAL_KEYS=['stats','studyStats','study_history','examHistory','favorites','bookmarks','wrongQuestions','uncertainQuestions','personalStrength','learningProgress'];
  function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
  function getLocalSnapshot(){const data={};for(const k of LOCAL_KEYS){try{const v=localStorage.getItem(k);if(v!==null)data[k]=JSON.parse(v);}catch(e){}}return data;}
  function mergeSnapshots(a,b){const out={...(a||{})};for(const [k,v] of Object.entries(b||{})){if(out[k]===undefined)out[k]=v;else if(Array.isArray(out[k])&&Array.isArray(v)){const seen=new Set(out[k].map(x=>JSON.stringify(x)));for(const x of v){const z=JSON.stringify(x);if(!seen.has(z)){out[k].push(x);seen.add(z);}}}else if(v&&typeof v==='object'&&out[k]&&typeof out[k]==='object')out[k]={...out[k],...v};else out[k]=v;}return out;}
  async function syncToCloud(){if(!sb||!authUser)return;const local=getLocalSnapshot();const {data,error}=await sb.from('user_learning').select('data').eq('user_id',authUser.id).maybeSingle();if(error)throw error;const cloud=(data&&data.data)||{};const merged=mergeSnapshots(cloud,local);const {error:upErr}=await sb.from('user_learning').upsert({user_id:authUser.id,data:merged},{onConflict:'user_id'});if(upErr)throw upErr;for(const [k,v] of Object.entries(merged)){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}return merged;}
  async function restoreFromCloud(){if(!sb||!authUser)return;const {data,error}=await sb.from('user_learning').select('data').eq('user_id',authUser.id).maybeSingle();if(error)throw error;const cloud=(data&&data.data)||{};for(const [k,v] of Object.entries(cloud)){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}}
  function authPanel(){if(document.getElementById('authPanel'))return;const home=document.getElementById('home');if(!home)return;const box=document.createElement('div');box.id='authPanel';box.className='card';box.innerHTML='<div id="authState"><b>👻 遊客模式</b><div class="muted">不用登入也可以完整刷題。登入後才能跨裝置保存學習紀錄。</div><div class="actions"><button id="loginBtn">📧 Email 登入</button></div></div>';home.parentNode.insertBefore(box,home);document.getElementById('loginBtn').onclick=showLogin;}
  function showLogin(){const old=document.getElementById('loginModal');if(old)old.remove();const d=document.createElement('div');d.id='loginModal';d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9999';d.innerHTML='<div class="card" style="max-width:420px;width:100%;margin:0"><h2>📧 Email 登入</h2><p class="muted">輸入 Email，我們會寄一封一次性登入連結給你，不需要設定密碼。</p><input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email"><div id="authMsg" class="muted" style="margin-top:10px"></div><div class="actions"><button id="sendMagic">寄送登入連結</button><button class="secondary" onclick="document.getElementById(\'loginModal\').remove()">取消</button></div></div>';document.body.appendChild(d);document.getElementById('sendMagic').onclick=sendMagicLink;}
  async function sendMagicLink(){const email=document.getElementById('authEmail').value.trim();const msg=document.getElementById('authMsg');if(!email){msg.textContent='請輸入 Email。';return;}if(!sb){msg.textContent='登入服務尚未設定完成。';return;}msg.textContent='寄送中……';const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.href}});msg.textContent=error?('登入信寄送失敗：'+error.message):'已寄出！請到信箱點擊登入連結。';}
  async function initAuth(){try{await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');if(!SUPABASE_KEY){authPanel();return;}sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);authPanel();const {data}=await sb.auth.getSession();authUser=data.session?.user||null;renderAuthState();if(authUser){await restoreFromCloud();}sb.auth.onAuthStateChange(async(_event,session)=>{authUser=session?.user||null;renderAuthState();if(authUser){try{await syncToCloud();}catch(e){console.error('cloud sync',e);}}});}catch(e){console.error('Auth init failed',e);}}
  function renderAuthState(){const el=document.getElementById('authState');if(!el)return;if(authUser){el.innerHTML='<b>☁️ 已登入</b><div class="muted">'+escapeHtml(authUser.email||'')+'<br>學習紀錄會同步到雲端，可跨手機／電腦繼續。</div><div class="actions"><button id="syncNow">☁️ 立即同步</button><button id="logoutBtn" class="secondary">登出</button></div>';document.getElementById('syncNow').onclick=async()=>{try{await syncToCloud();alert('已同步學習紀錄。');}catch(e){alert('同步失敗：'+e.message);}};document.getElementById('logoutBtn').onclick=async()=>{await sb.auth.signOut();};}else{el.innerHTML='<b>👻 遊客模式</b><div class="muted">不用登入也可以完整刷題。登入後才能跨裝置保存學習紀錄。</div><div class="actions"><button id="loginBtn">📧 Email 登入</button></div>';document.getElementById('loginBtn').onclick=showLogin;}}
  window.showEmailLogin=showLogin;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAuth);else initAuth();
})();
