/* Remove legacy login / guest UI. Learning remains login-free with anonymous cloud backup. */
(function(){
  const TERMS=['Email 登入','Google 登入','遊客模式','登入後才能跨裝置保存學習紀錄','登入後所有紀錄雲端同步'];
  function removeLegacyAuth(){
    const candidates=[...document.querySelectorAll('body *')];
    candidates.forEach(el=>{
      if(el.id==='status'||el.id==='home'||el.id==='quiz'||el.id==='result'||el.id==='review'||el.id==='keywordPage')return;
      const text=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(!text||!TERMS.some(t=>text.includes(t)))return;
      const parent=el.closest('.card')||el.closest('section')||el;
      if(parent&&parent!==document.body) parent.remove();
    });
  }
  function start(){
    removeLegacyAuth();
    const observer=new MutationObserver(removeLegacyAuth);
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
