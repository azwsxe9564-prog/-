/* Anonymous cloud sync for the personal study app. Requires Supabase publishable/anon key in SUPABASE_CONFIG below. */
(function(){
  const CONFIG=window.SUPABASE_CONFIG||{};
  if(!CONFIG.url||!CONFIG.key||!window.supabase)return;
  const client=window.supabase.createClient(CONFIG.url,CONFIG.key);
  window.swCloud={client,user:null,ready:false,
    async init(){
      let {data}=await client.auth.getSession();
      if(!data.session){const r=await client.auth.signInAnonymously(); if(r.error)throw r.error; data=r.data;}
      this.user=data.session&&data.session.user; this.ready=!!this.user;
      await this.pull();
      return this.user;
    },
    async pull(){
      if(!this.user)return;
      const r=await client.from('learning_records').select('data').eq('user_id',this.user.id).maybeSingle();
      if(r.error)throw r.error;
      if(r.data&&r.data.data){const remote=r.data.data; Object.keys(remote).forEach(k=>{if(remote[k]!==undefined)localStorage.setItem('sw_'+k,JSON.stringify(remote[k]));});}
    },
    async push(){
      if(!this.user)return;
      const keys=['stats','favorites','uncertain','weak','progress','keywordHistory'];
      const data={}; keys.forEach(k=>{const v=localStorage.getItem('sw_'+k);if(v!==null){try{data[k]=JSON.parse(v)}catch{}}});
      const r=await client.from('learning_records').upsert({user_id:this.user.id,data,updated_at:new Date().toISOString()});
      if(r.error)console.warn('cloud sync failed',r.error);
    }
  };
  const originalSave=window.save;
  if(originalSave){window.save=function(k,v){originalSave(k,v);if(window.swCloud&&window.swCloud.ready)window.swCloud.push();};}
  window.addEventListener('load',async()=>{try{await window.swCloud.init();}catch(e){console.warn('anonymous cloud unavailable; local mode remains active',e);}});
})();
