/* Public paths only. Never request mainStore or footer parents. */
(() => {
  'use strict';
  const paths = ['newArrivals','trending','sales','announcement','contact','siteContent',...['shipping','returns','size','privacy','terms','cookie','contact','faq'].map(k=>'footer/'+k)];
  const fields=['name','price','originalPrice','salePrice','salePercent','saleEndDate','description','details','images','img','category','sizes','sizeQuantities','colors','measurements','quantity','isOutOfStock','isVipOnly','isPreorder','preorderPrice','expectedShipDate','image','related','translations'];
  const project=(path,value)=>['newArrivals','trending','sales','upcomingSales'].includes(path)?Object.values(value || {}).filter(p=>p && !p.isHidden && !p.isDraft).map(p=>Object.fromEntries(fields.filter(k=>Object.prototype.hasOwnProperty.call(p,k)).map(k=>[k,p[k]]))).map(p=>p.isPreorder ? {...p,launchPrice:p.price,price:Number(p.preorderPrice)>0?p.preorderPrice:p.price,images:p.images || [p.image || p.img].filter(Boolean)} : p):value;
  async function editorial(data){try{const r=await fetch('/api/public-editorial');if(!r.ok)throw Error('Editorial unavailable');const value=await r.json();data.lookbook=value.lookbook || [];data.footer={...data.footer,...value.footer};}catch(e){data.lookbook=[];console.error(e.message);}}
  async function preorders(data) { try { const r=await fetch('/api/public-preorders'); if(!r.ok)throw Error('Preorders unavailable'); data.upcomingSales=project('upcomingSales',await r.json()); } catch(e) { data.upcomingSales=[];console.error(e.message); } }
  const assign = (data,path,value) => { value=project(path,value);const parts=path.split('/');if(parts.length===1)data[path]=value;else(data[parts[0]] ||= {})[parts[1]]=value; };
  const snapshot = data => ({val:()=>data,exists:()=>true});
  window.SayandPublicStore = {
    async once() {
      const data={};
      await Promise.all(paths.map(async path=>assign(data,path,(await firebase.database().ref('mainStore/'+path).once('value')).val())));
      await Promise.all([editorial(data),preorders(data)]);
      return snapshot(data);
    },
    on(event,callback,onError) {
      const data={}, ready=new Set(), refs=[];let initial=false;
      for(const path of paths) {
        const ref=firebase.database().ref('mainStore/'+path);
        const listener=ref.on('value', snap=>{assign(data,path,snap.val());ready.add(path);if(ready.size===paths.length){if(initial)callback(snapshot(data));else {initial=true;Promise.all([editorial(data),preorders(data)]).then(()=>callback(snapshot(data)));}}},error=>{if(onError)onError(error);else console.error('Public content unavailable',path,error.code);});
        refs.push([ref,listener]);
      }
      return ()=>refs.forEach(([ref,listener])=>ref.off('value',listener));
    }
  };
})();
