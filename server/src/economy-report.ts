export const EXTERNAL_GOLD_KINDS=['admin','trade_in','trade_out'];
export interface EconomyFlow {kind:string;incoming:number;outgoing:number;requests:number}
export interface EconomyHour {at:string;incoming:number;outgoing:number}
export interface EconomyMaterial {template:string;kind:string;positive:number;negative:number}
export interface EconomyReport {
 asOf:string;days:1|7;wallets:{characters:number;total:number;average:number};
 incoming:number;outgoing:number;net:number;flows:EconomyFlow[];hourly:(EconomyHour&{net:number})[];
 items:{template:string;created:number;consumed:number}[];
}
export function makeEconomyReport(days:1|7,now:number,wallets:{characters:number;total:number},flows:EconomyFlow[],hours:EconomyHour[],materials:EconomyMaterial[]):EconomyReport{
 const game=flows.filter(f=>!EXTERNAL_GOLD_KINDS.includes(f.kind));
 const incoming=game.reduce((n,f)=>n+f.incoming,0),outgoing=game.reduce((n,f)=>n+f.outgoing,0);
 const hourly:EconomyReport['hourly']=[],hour=3600000;
 const bins=new Map(hours.map(h=>[Date.parse(h.at),h]));
 for(let at=Math.floor((now-days*86400000)/hour)*hour;at<=now;at+=hour){const value=bins.get(at);const incoming=value?.incoming??0,outgoing=value?.outgoing??0;hourly.push({at:new Date(at).toISOString(),incoming,outgoing,net:incoming-outgoing});}
 const items=new Map<string,{template:string;created:number;consumed:number}>();
 for(const m of materials){
  let created=0,consumed=0;
  if(['pickup','drop','npc_buy','level_reward'].includes(m.kind))created=m.positive;
  else if(['npc_sell','use','discard'].includes(m.kind))consumed=m.positive;
  else if(['quest','craft','salvage'].includes(m.kind)){created=m.positive;consumed=m.negative;}
  if(!created&&!consumed)continue;
  const row=items.get(m.template)??{template:m.template,created:0,consumed:0};row.created+=created;row.consumed+=consumed;items.set(m.template,row);
 }
 return {asOf:new Date(now).toISOString(),days,wallets:{...wallets,average:wallets.characters?wallets.total/wallets.characters:0},incoming,outgoing,net:incoming-outgoing,
  flows:flows.filter(f=>f.incoming||f.outgoing).sort((a,b)=>b.incoming+b.outgoing-a.incoming-a.outgoing),hourly,
  items:[...items.values()].sort((a,b)=>b.created+b.consumed-a.created-a.consumed).slice(0,20)};
}
