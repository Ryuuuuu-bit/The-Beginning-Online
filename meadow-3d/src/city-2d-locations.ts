import {CITY,CITY_BUILDINGS,GATE_CAPTAIN,HEALER,cityNpcPlacement} from '@the-beginning-online/shared/maps';
import type {CityNpcArt} from './city-npc-sprite.ts';
import jobs from '../../shared/data/jobs.json' with {type:'json'};

export type TownNpc={id:string;art:CityNpcArt;name:string;role:string;line:string;x:number;z:number;kind:string;icon:string;color:string};
export const TOWN_NPCS:TownNpc[]=CITY.empty?[]:[
  ...CITY_BUILDINGS.map(b=>({...b.talk,id:b.id,kind:b.id,art:(b.id==='forge'?'blacksmith':b.id==='market'?'merchant':'clerk') as CityNpcArt,
    name:b.id==='forge'?'ศิลา · ช่างตีเหล็ก':b.id==='market'?'มะลิ · พ่อค้าเบ็ดเตล็ด':'นที · คนเฝ้าคลัง',role:b.name,
    icon:b.id==='forge'?'⚒':b.id==='market'?'¤':'▣',color:b.id==='forge'?'#e6ab70':b.id==='market'?'#e6cb88':'#aad4e1',
    line:b.id==='forge'?'ค้อนพร้อม เตาพร้อม! ซื้ออุปกรณ์หรือใส่การ์ดให้ของชิ้นโปรดได้ที่นี่ เตรียมอาวุธให้พร้อมก่อนออกประตูเมือง':b.id==='market'?'ก่อนออกประตูเมือง แวะซื้อยาและตรวจอุปกรณ์ก่อนนะ ของที่ไม่ใช้ก็นำมาขายได้':'ฝากสัมภาระไว้ในคลังได้เลย แล้วออกเดินทางเบา ๆ เมื่อต้องการฟื้นพลัง ให้ไปหาผู้รักษาข้างสวน'})),
  {...HEALER,id:'healer',kind:'heal',art:'healer',name:'ริน · ผู้รักษา',role:'ฟื้น HP / MP',icon:'+',color:'#ace1b7',line:'พักหายใจใต้ร่มไม้ก่อนนะ ฉันฟื้นพลังชีวิตและพลังสกิลให้เต็มได้ทุก 60 วินาที'},
  {...GATE_CAPTAIN,id:'captain',kind:'guard',art:'guard',name:'กานต์ · หัวหน้าทหารยาม',role:'แนะนำเส้นทางออกเมือง',icon:'◇',color:'#d8c598',line:'ใต้ไปทุ่งวุ้นจิ๋ว ตะวันออกไปป่าหมอก แล้วเดินทางต่อสู่ซากนครและหุบเขาหินได้จากแผนที่โลก เริ่มล่าใกล้เมืองก่อนแล้วค่อยออกไปให้ไกลขึ้น'},
  {...jobs.angel,...cityNpcPlacement('angel'),id:'angel',kind:'angel',art:'angel',name:'ทูตสวรรค์',role:'เปลี่ยนอาชีพ',icon:'✦',color:'#e9d3f4',line:'การเดินทางของเจ้ากำลังเริ่มต้น เมื่อพร้อมแล้ว จงเลือกเส้นทางอาชีพที่เป็นตัวเอง'},
];
export function nearbyTownNpc(x:number,z:number){return TOWN_NPCS.filter(n=>Math.hypot(n.x-x,n.z-z)<3).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];}

export const WAYPOINTS = CITY.empty?[]:[
  {id:'arrival',name:'ลานต้อนรับ',x:0,z:31,color:'#83dad0'},
  {id:'guild',name:'สมาคมแสงอรุณ',x:0,z:-19,color:'#b5a5ed'},
  {id:'market',name:'ตลาดสีคราม',x:30,z:4,color:'#e7c27f'},
  {id:'garden',name:'สวนธาราจันทร์',x:-12,z:23,color:'#b5d997'},
] as const;
export const CITY_EXITS = [
  {id:'south',name:'ประตูทุ่งวุ้นจิ๋ว',destination:'ทุ่งวุ้นจิ๋ว',x:0,z:44,color:'#c7d98c'},
  {id:'east',name:'ประตูป่าหมอก',destination:'ป่าหมอก',x:44,z:0,color:'#8ecdd5'},
  {id:'north',name:'ประตูซากนคร',destination:'ซากนครโบราณ · Lv.10–15',x:0,z:-44,color:'#b6b3d8'},
  {id:'west',name:'ประตูหุบเขา',destination:'หุบเขาหิน · Lv.15–20',x:-44,z:0,color:'#deb797'},
] as const;
export function nearbyWaypoint(x:number,z:number){return WAYPOINTS.find(p=>Math.hypot(x-p.x,z-p.z)<2.8);}
export function nearbyExit(x:number,z:number){return CITY_EXITS.find(p=>Math.hypot(x-p.x,z-p.z)<2.8);}
export function waypointArrival(id:string){const p=WAYPOINTS.find(p=>p.id===id);return p?{x:p.x,z:p.z+2.2}:undefined;}
