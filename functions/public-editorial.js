'use strict';
const safeText=v=>typeof v==='string'?v.slice(0,30000):'';
function project(raw) {
 const lookbook=Object.values(raw.lookbook || {}).filter(a=>a && !a.isHidden && !a.isDraft && !a.isVipOnly).map(a=>({id:safeText(String(a.id || '')),title:safeText(a.title),subtitle:safeText(a.subtitle),description:safeText(a.description),urls:Array.isArray(a.urls)?a.urls.filter(u=>typeof u==='string'&&/^https:\/\//.test(u)).slice(0,30):[],hotspots:Object.fromEntries(Object.entries(a.hotspots || {}).filter(([k])=>/^\d+$/.test(k)).map(([k,spots])=>[k,Array.isArray(spots)?spots.filter(s=>s && Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y))).map(s=>({x:Math.max(0,Math.min(100,Number(s.x))),y:Math.max(0,Math.min(100,Number(s.y))),product:safeText(s.product)})):[]])),translations:Object.fromEntries(['it','fr','de'].filter(k=>a.translations?.[k]).map(k=>[k,Object.fromEntries(['title','subtitle','description'].map(f=>[f,safeText(a.translations[k][f])]))]))}));
 const about=raw.about?{title:safeText(raw.about.title),content:safeText(raw.about.content)}:null;
 return {lookbook,footer:{about}};
}
function handler(db){return async(req,res)=>{res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex');if(!['GET','HEAD'].includes(req.method))return res.status(405).send('Method not allowed');try{const [lookbook,about]=await Promise.all(['mainStore/lookbook','mainStore/footer/about'].map(p=>db.ref(p).once('value')));return res.json(project({lookbook:lookbook.val(),about:about.val()}));}catch(e){return res.status(503).json({error:'Editorial content unavailable'});}};}
module.exports={project,handler};
