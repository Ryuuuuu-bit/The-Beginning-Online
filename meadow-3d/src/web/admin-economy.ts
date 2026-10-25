import {api,ApiError} from './api';
import type {EconomyReport} from '../../../server/src/economy-report';
import items from '../../../shared/data/items.json';
import './admin-economy.css';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const number=(n:number)=>n.toLocaleString('th-TH',{maximumFractionDigits:0});
const time=(value:string)=>new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const labels:Record<string,string>={pickup:'ดรอปมอนสเตอร์',drop:'ดรอปมอนสเตอร์',quest:'เควสต์',level_reward:'รางวัลเลเวล',npc_sell:'ขายของให้ร้าน',npc_buy:'ซื้อของ / ตีบวก / เจาะช่อง',craft:'คราฟต์',admin:'GM / ย้ายข้อมูล',trade_in:'แลกเปลี่ยน · รับทอง',trade_out:'แลกเปลี่ยน · ส่งทอง'};
function rows(selector:string,values:(string|number)[][]){const body=$(selector+' tbody');body.replaceChildren();for(const valuesOfRow of values){const row=document.createElement('tr');for(const value of valuesOfRow){const cell=document.createElement('td');cell.textContent=typeof value==='number'?number(value):value;row.append(cell);}body.append(row);}if(!values.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=4;cell.textContent='ยังไม่มีธุรกรรมในช่วงเวลานี้';row.append(cell);body.append(row);}}
function draw(report:EconomyReport){
 const metrics=$('.economy-metrics');metrics.replaceChildren();
 for(const [label,value,kind,detail] of [['ทองเข้า',report.incoming,'in','รายรับจากระบบเกม'],['ทองออก',report.outgoing,'out','ใช้จ่ายออกจากระบบเกม'],['สุทธิ',report.net,'net','ทองเข้า − ทองออก'],['ทองคงเหลือ',report.wallets.total,'wallet','รวมตัวละครที่ยังใช้งานอยู่']] as const){const card=document.createElement('article');card.className='metric '+kind;const title=document.createElement('span'),amount=document.createElement('strong'),hint=document.createElement('small');title.textContent=label;amount.textContent=number(value);hint.textContent=detail;card.append(title,amount,hint);metrics.append(card);}
 const chart=$('.economy-chart');chart.replaceChildren();const max=Math.max(1,...report.hourly.flatMap(h=>[h.incoming,h.outgoing]));
 for(const hour of report.hourly){const bin=document.createElement('span');bin.className='economy-bin';bin.title=`${time(hour.at)} · เข้า ${number(hour.incoming)} · ออก ${number(hour.outgoing)} · สุทธิ ${number(hour.net)}`;bin.setAttribute('aria-hidden','true');for(const [kind,value] of [['in',hour.incoming],['out',hour.outgoing]] as const){const bar=document.createElement('i');bar.className=kind;bar.style.height=(value/max*100)+'%';bin.append(bar);}chart.append(bin);}
 let axis=document.querySelector<HTMLElement>('.economy-axis');if(!axis){axis=document.createElement('p');axis.className='economy-axis';chart.after(axis);}axis.replaceChildren();for(const value of [report.hourly[0],report.hourly[Math.floor(report.hourly.length/2)],report.hourly.at(-1)!]){const label=document.createElement('span');label.textContent=time(value.at);axis.append(label);}
 rows('#economy-hourly',report.hourly.map(h=>[time(h.at),h.incoming,h.outgoing,h.net]));
 rows('#economy-flows',report.flows.map(f=>[labels[f.kind]??f.kind,f.incoming,f.outgoing,f.requests]));
 const names=new Map(items.items.map(i=>[i.id,i.nameTh]));rows('#economy-items',report.items.map(i=>[names.get(i.template)??i.template,i.created,i.consumed]));
 $('#economy-wallets').textContent=`${number(report.wallets.characters)} ตัวละคร · ทองเฉลี่ย ${number(report.wallets.average)} ต่อตัวละคร · ข้อมูล ณ ${time(report.asOf)} (ไทย)`;
}
async function load(){
 const range=$<HTMLSelectElement>('#economy-range'),button=$<HTMLButtonElement>('#economy-refresh'),status=$('#economy-status');range.disabled=button.disabled=true;status.textContent='กำลังอ่านธุรกรรม…';
 try{const report=await api<EconomyReport>('/admin/economy?days='+range.value);draw(report);$('#economy-content').hidden=false;status.textContent='ข้อมูลจากบัญชีธุรกรรมฝั่งเซิร์ฟเวอร์ · อ่านอย่างเดียว';}
 catch(error){$('#economy-content').hidden=true;status.textContent=error instanceof Error?error.message:'โหลดข้อมูลไม่สำเร็จ';if(error instanceof ApiError&&error.status===403){const login=document.createElement('a');login.href='/login.html';login.textContent='เข้าสู่ระบบแอดมิน →';status.append(document.createElement('br'),login);}}
 finally{range.disabled=button.disabled=false;}
}
$('form').addEventListener('submit',e=>{e.preventDefault();void load();});$('#economy-range').addEventListener('change',()=>void load());void load();
