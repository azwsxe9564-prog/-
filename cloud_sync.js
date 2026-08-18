/* Anonymous cloud sync. Publishable key is intentionally safe for browser use; RLS protects rows. */
(function(){
  const CONFIG=window.SUPABASE_CONFIG||{};
  if(!CONFIG.url||!CONFIG.key||!window.supabase)return;
  const client=window.supabase.createClient(CONFIG.url,CONFIG.key);
  const keys=['stats','favorites','uncertain','weak','progress','keywordHistory'];
  let timer=null;
  function readLocal(){const data={};keys.forEach(k=>{const v=localStorage.getItem('sw_'+k);if(v!==null){try{data[k]=JSON.parse(v)}catch{}}});return data}
  window.swCloud={client,user:null,ready:false,
    async init(){
      let s=(await client.auth.getSession()).data.session;
      if(!s){const r=await client.auth.signInAnonymously();if(r.error)throw r.error;s=r.data.session;}
      this.user=s&&s.user;this.ready=!!this.user;
      const r=await client.from('learning_records').select('data').eq('user_id',this.user.id).maybeSingle();
      if(r.error)throw r.error;
      if(r.data&&r.data.data){Object.entries(r.data.data).forEach(([k,v])=>{localStorage.setItem('sw_'+k,JSON.stringify(v));});}
      else await this.push();
      return this.user;
    },
    async push(){
      if(!this.user)return;
      const r=await client.from('learning_records').upsert({user_id:this.user.id,data:readLocal(),updated_at:new Date().toISOString()});
      if(r.error)console.warn('cloud sync failed',r.error);
    },
    schedulePush(){clearTimeout(timer);timer=setTimeout(()=>this.push(),350)}
  };
  const originalSave=window.save;
  if(originalSave){window.save=function(k,v){originalSave(k,v);if(window.swCloud&&window.swCloud.ready)window.swCloud.schedulePush();};}
  window.addEventListener('sw-local-changed',()=>{if(window.swCloud&&window.swCloud.ready)window.swCloud.schedulePush();});
})();
