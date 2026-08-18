/* Optional Google login + cloud sync. Guest mode remains fully usable. */
const SUPABASE_URL='https://qphaiblahlglcoyieyzm.supabase.co';
const SUPABASE_KEY='sb_publishable_yAozNhLoMK7UnZKxO9wBSA_tXMfZWhp';
let swAuth=null;
function swSupabase(){
  if(swAuth)return swAuth;
  if(!window.supabase)return null;
  swAuth=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  return swAuth;
}
async function swInitAuth(){
  const s=swSupabase(); if(!s)return;
  const {data}=await s.auth.getSession(); swRenderAuth(data.session);
  s.auth.onAuthStateChange((_event,session)=>{swRenderAuth(session); if(session) swSyncFromCloud();});
}
function swRenderAuth(session){
  const el=document.getElementById('authBox'); if(!el)return;
  if(session){
    const name=session.user.user_metadata?.full_name||session.user.email||'Google 使用者';
    el.innerHTML=`<div class="authUser">🔵 ${esc(name)} <button class="secondary" onclick="swSignOut()">登出</button></div>`;
  }else{
    el.innerHTML=`<button onclick="swGoogleLogin()">🔵 使用 Google 登入</button><div class="meta">不登入也可以完整刷題；登入後可跨裝置保存學習紀錄。</div>`;
  }
}
async function swGoogleLogin(){
  const s=swSupabase(); if(!s)return alert('登入服務尚未載入，請稍後再試。');
  const {error}=await s.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
  if(error)alert('Google 登入失敗：'+error.message);
}
async function swSignOut(){const s=swSupabase();if(s)await s.auth.signOut();}
function swLocalData(){return load('stats',{attempts:[],questions:{}})}
async function swSyncFromCloud(){
  const s=swSupabase(); if(!s)return; const {data:{session}}=await s.auth.getSession(); if(!session)return;
  const local=swLocalData();
  const {data,error}=await s.from('user_learning').select('data').eq('user_id',session.user.id).maybeSingle();
  if(error)return console.warn(error);
  if(data?.data){
    const cloud=data.data;
    const merged={attempts:[...(local.attempts||[]),...(cloud.attempts||[])].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,200),questions:{...(cloud.questions||{}),...(local.questions||{})}};
    save('stats',merged);
  }
  await swPushLocal();
}
async function swPushLocal(){
  const s=swSupabase();if(!s)return;const {data:{session}}=await s.auth.getSession();if(!session)return;
  const payload=swLocalData();
  await s.from('user_learning').upsert({user_id:session.user.id,data:payload},{onConflict:'user_id'});
}
window.swPushLocal=swPushLocal;
