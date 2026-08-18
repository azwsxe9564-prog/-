/* Login disabled. The study site is guest-only. */
(function(){
  window.swInitAuth=function(){
    const el=document.getElementById('authBox');
    if(el) el.remove();
  };
  window.swGoogleLogin=async function(){};
  window.swSignOut=async function(){};
  window.swPushLocal=async function(){};
})();
