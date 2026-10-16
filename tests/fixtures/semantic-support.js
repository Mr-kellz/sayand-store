'use strict';
const assert=require('node:assert/strict');
function fixture(){
 const p=(name,extra={})=>({name,price:40,quantity:5,sizes:['OS'],colors:['Green'],img:'https://example.test/image.jpg',...extra});
 return {mainStore:{announcement:{active:true,isPromo:true,promoPercent:25,promoMinAmount:15,promoEndDate:new Date(Date.now()+3600000).toISOString()},newArrivals:[p('HAT'),p('HAT 2',{salePrice:25}),p('BUBU GOWN 3',{sizes:['S','M'],sizeQuantities:{S:0,M:2},colors:['Gold']}),p('HIDDEN',{isHidden:true}),p('VIP',{isVipOnly:true}),p('SOLD',{quantity:0}),p('PREORDER',{isPreorder:true})],trending:[],sales:[],upcomingSales:[]}};
}
function database(store){const paths=[];return {paths,ref(path){paths.push(path);assert(/^(mainStore\/(newArrivals|trending|sales|upcomingSales|announcement)$|_eliaConversations\/|_eliaRequests\/)/.test(path),'Only public store data and owned conversation/receipt state');const keys=path.split('/'),copy=v=>v===undefined?null:structuredClone(v),get=()=>keys.reduce((v,k)=>v?.[k],store),set=v=>{let o=store;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=copy(v);};return {once:async()=>({val:()=>copy(get())}),set:async v=>set(v),update:async v=>set({...get(),...v}),child:k=>this.ref(path+'/'+k),remove:async()=>set(null),transaction:async f=>{const v=f(copy(get()));if(v===undefined)return {committed:false};set(v);return {committed:true};}};}};}
module.exports={fixture,database};
