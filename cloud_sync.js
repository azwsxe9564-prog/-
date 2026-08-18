/* Login-free anonymous cloud backup. No Google/OAuth UI. */
(function(){
  const SUPABASE_URL='https://qphaiblahlglcoyieyzm.supabase.co';
  const SUPABASE_KEY='sb_publishable_yAozNhLoMK7UnZKxO9wBSA_tXMfZWhp';
  const TABLE='learning_records';
  const keys=['stats','favorites','uncertain','weak','progress','keywordHistory'];
  const client=window.supabase&&window.supabase.createClient
    ?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})
    :null;
  let timer=null;
  let syncing=false;

  function readLocal(){
    const data={};
    keys.forEach(k=>{
      const v=localStorage.getItem('sw_'+k);
      if(v!==null){try{data[k]=JSON.parse(v)}catch{}}
    });
    return data;
  }

  function mergeValues(cloud,local){
    if(local===undefined)return cloud;
    if(cloud===undefined)return local;
    if(Array.isArray(cloud)&&Array.isArray(local)){
      const out=[...cloud,...local],seen=new Set();
      return out.filter(v=>{const id=v&&typeof v==='object'?(v.id||v.at||JSON.stringify(v)):String(v);if(seen.has(id))return false;seen.add(id);return true}).slice(-500);
    }
    if(cloud&&typeof cloud==='object'&&local&&typeof local==='object')return {...cloud,...local};
    return local;
  }

  function mergeData(cloud,local){
    const out={...cloud};
    keys.forEach(k=>{out[k]=mergeValues(cloud&&cloud[k],local&&local[k]);});
    return out;
  }

  async function ensureSession(){
    if(!client)return null;
    const current=await client.auth.getSession();
    if(current.data&&current.data.session)return current.data.session;
    const created=await client.auth.signInAnonymously();
    if(created.error){
      console.warn('[cloud] anonymous backup unavailable:',created.error.message);
      return null;
    }
    return created.data&&created.data.session||null;
  }

  async function pull(){
    if(!client)return null;
    const session=await ensureSession();
    if(!session)return null;
    const result=await client.from(TABLE).select('data').eq('user_id',session.user.id).maybeSingle();
    if(result.error){console.warn('[cloud] restore failed:',result.error.message);return null;}
    return result.data&&result.data.data||null;
  }

  async function push(){
    if(!client||!window.swCloud||!window.swCloud.user||syncing)return;
    syncing=true;
    try{
      const payload=readLocal();
      const result=await client.from(TABLE).upsert({
        user_id:window.swCloud.user.id,
        data:payload,
        updated_at:new Date().toISOString()
      },{onConflict:'user_id'});
      if(result.error)console.warn('[cloud] backup failed:',result.error.message);
    }finally{syncing=false;}
  }

  function schedulePush(){clearTimeout(timer);timer=setTimeout(push,700);}

  const originalSave=window.save;
  if(originalSave){
    window.save=function(k,v){
      originalSave.apply(this,arguments);
      if(window.swCloud&&window.swCloud.ready)schedulePush();
    };
  }

  window.swCloud={
    user:null,
    ready:false,
    async init(){
      if(!client)return false;
      try{
        const session=await ensureSession();
        if(!session)return false;
        this.user=session.user;
        const cloud=await pull();
        if(cloud){
          const merged=mergeData(cloud,readLocal());
          Object.entries(merged).forEach(([k,v])=>localStorage.setItem('sw_'+k,JSON.stringify(v)));
        }
        this.ready=true;
        await push();
        return true;
      }catch(e){
        console.warn('[cloud] init failed:',e.message||e);
        return false;
      }
    },
    schedulePush,
    push
  };

  if(client){
    client.auth.onAuthStateChange(function(_event,session){
      if(session){window.swCloud.user=session.user;window.swCloud.ready=true;schedulePush();}
    });
  }

  function start(){window.swCloud.init();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  window.addEventListener('online',schedulePush);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')push();});
  setInterval(push,30000);
})();
