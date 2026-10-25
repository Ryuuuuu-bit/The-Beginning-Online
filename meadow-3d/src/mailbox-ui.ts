import {levelReward,loadGameData} from '@the-beginning-online/shared';
import {itemIcon} from './item-icon';
import './mailbox.css';

export function mountMailbox(o:{send:(message:unknown)=>void;onOpen:()=>void;you:()=>string}){
 const data=loadGameData(),menu=document.querySelector<HTMLDialogElement>('#game-menu-window')!,menuButton=document.querySelector<HTMLButtonElement>('#game-menu')!;
 const button=document.createElement('button');button.id='mailbox-button';button.type='button';button.className='menu-tile';button.dataset.icon='mail';button.innerHTML='<i aria-hidden="true"></i><span>กล่องจดหมาย</span><b class="mail-count"></b>';menu.querySelector('.menu-grid')!.append(button);
 const panel=document.createElement('dialog');panel.id='mailbox-window';panel.setAttribute('aria-labelledby','mailbox-title');
 panel.innerHTML=`<header><div><small>ADVENTURER’S MAIL</small><h2 id="mailbox-title">รางวัลเลเวล</h2><p>เสบียงพร้อมแล้ว ออกเดินทางต่อได้เลย</p></div><button type="button" aria-label="ปิดกล่องจดหมาย">×</button></header>
 <section class="mail-overview" aria-label="สรุปรางวัล"><div><span class="mail-current-level"></span><strong class="mail-ready-count"></strong></div><button type="button" id="mailbox-claim-all">รับทั้งหมด</button></section>
 <nav aria-label="กรองรางวัล"><button type="button" data-filter="ready">รับได้ <b></b></button><button type="button" data-filter="locked">ยังไม่ถึงเลเวล <b></b></button><button type="button" data-filter="claimed">รับแล้ว <b></b></button></nav>
 <p class="mailbox-status" role="status"></p><div class="mailbox-list" aria-label="รายการรางวัล"></div>
 <footer><span>◆ ของผูกตัวละคร · ขาย / เทรดไม่ได้</span><details><summary>เงื่อนไขการรับ</summary><p>แต่ละเลเวลรับได้ครั้งเดียวต่อบัญชี ลบตัวละครแล้วสิทธิ์ไม่คืน · ขนาดยาตามเลเวลตอนรับ · ถ้ากระเป๋าหรือน้ำหนักไม่พอ รางวัลจะยังอยู่ · ไม่หมดอายุ</p></details></footer>`;
 document.body.append(panel);
 let level=0,claimed:number[]=[],legacy:number[]=[],pending=false,filter='ready',feedback='';
 const levels=Array.from({length:data.stats.maxLevel},(_,i)=>i+1);
 const stateOf=(n:number)=>claimed.includes(n)?'claimed':n>level?'locked':'ready';
 const available=()=>levels.filter(n=>stateOf(n)==='ready');
 function claim(n?:number){pending=true;feedback='';draw();o.send({t:'mailbox',op:'claim',req:crypto.randomUUID(),...(n===undefined?{}:{level:n})});}
 function draw(){
  const ready=available(),count=ready.length;
  button.querySelector('b')!.textContent=count?String(count):'';
  button.ariaLabel=`กล่องจดหมาย · รางวัลรับได้ ${count} รายการ`;
  menuButton.dataset.mailCount=count?String(count):'';menuButton.ariaLabel=count?`เมนู · มีรางวัลเลเวล ${count} รายการ`:'เมนู';
  if(!panel.open)return;
  panel.querySelector('.mail-current-level')!.textContent=level?`นักผจญภัย Lv.${level}`:'กำลังโหลดตัวละคร…';
  panel.querySelector('.mail-ready-count')!.textContent=count?`มีรางวัลพร้อมรับ ${count} ชุด`:'รับรางวัลที่ปลดล็อกครบแล้ว';
  panel.querySelector('.mailbox-status')!.textContent=pending?'กำลังส่งของเข้ากระเป๋า…':feedback||'กล่องพิเศษทุก 5 เลเวล · เลือกรับทีละชุด หรือรับทั้งหมดได้';
  const all=panel.querySelector<HTMLButtonElement>('#mailbox-claim-all')!;all.disabled=pending||!count;all.textContent=count?`รับทั้งหมด · ${count} ชุด`:'ไม่มีรางวัลค้าง';all.onclick=()=>claim();
  panel.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b=>{b.setAttribute('aria-pressed',String(filter===b.dataset.filter));b.querySelector('b')!.textContent=String(levels.filter(n=>stateOf(n)===b.dataset.filter).length);b.onclick=()=>{filter=b.dataset.filter!;draw();};});
  const list=panel.querySelector('.mailbox-list')!;list.replaceChildren();
  for(const n of levels.filter(n=>stateOf(n)===filter)){
   const state=stateOf(n),reward=levelReward(n,data,legacy.includes(n),Math.max(level,n));
   const row=document.createElement('article'),levelTag=document.createElement('div'),copy=document.createElement('div'),title=document.createElement('h3'),items=document.createElement('ul'),receive=document.createElement('button');
   row.className=`mailbox-${state}${reward.special?' mailbox-special':''}`;
   levelTag.className='mail-level';levelTag.innerHTML=`<span>Lv.</span><b>${n}</b>`;
   copy.className='mail-content';title.textContent=`${legacy.includes(n)?'ส่วนเพิ่ม · ':''}${reward.special?'กล่องพิเศษ':'รางวัล'} Lv.${n}`;
   const badge=document.createElement('span');badge.className='mail-badge';badge.textContent=state==='claimed'?'✓ รับแล้ว':state==='locked'?`ปลดล็อกอีก ${n-level} เลเวล`:'พร้อมรับ';
   items.className='mail-items';
   const addItem=(icon:HTMLElement,name:string,amount:string)=>{const li=document.createElement('li'),label=document.createElement('span'),qty=document.createElement('b');icon.setAttribute('aria-hidden','true');label.textContent=name;qty.textContent=amount;li.append(icon,label,qty);items.append(li);};
   if(reward.gold){const coin=document.createElement('span');coin.className='mail-coin';coin.textContent='◈';addItem(coin,'ทอง',reward.gold.toLocaleString('en-US'));}
   for(const item of reward.items){const t=data.items.items.find(t=>t.id===item.template)!;addItem(itemIcon(t),t.nameTh,`×${item.qty}`);}
   receive.type='button';receive.textContent=state==='claimed'?'รับแล้ว':state==='locked'?`ปลดล็อก Lv.${n}`:'รับรางวัล';receive.disabled=pending||state!=='ready';receive.onclick=()=>claim(n);
   copy.append(title,badge,items);row.append(levelTag,copy,receive);list.append(row);
  }
  if(!list.children.length){const empty=document.createElement('div');empty.className='mail-empty';const title=document.createElement('strong'),note=document.createElement('p');title.textContent=level<1?'กำลังโหลดรางวัล…':filter==='ready'?'รับเสบียงครบแล้ว':filter==='claimed'?'ยังไม่มีรางวัลที่รับแล้ว':'ปลดล็อกครบทุกเลเวลแล้ว';note.textContent=filter==='ready'?'เพิ่มเลเวลเพื่อปลดล็อกรางวัลชุดถัดไป หรือดูรายการใน “ยังไม่ถึงเลเวล”':'รางวัลที่รับสำเร็จจะบันทึกกับบัญชีของคุณ';empty.append(title,note);list.append(empty);}
 }
 button.onclick=()=>{menu.close();o.onOpen();feedback='';filter=level<1||available().length?'ready':levels.some(n=>stateOf(n)==='locked')?'locked':'claimed';panel.showModal();draw();o.send({t:'mailbox',op:'list'});};
 panel.querySelector('header button')!.addEventListener('click',()=>panel.close());
 draw();o.send({t:'mailbox',op:'list'});
 return {receive(message:any){
  if(message.t==='mailbox'){const received=message.claimed.length-claimed.length;feedback=message.error??(pending&&received>0?`รับรางวัลสำเร็จ ${received} รายการ`:'');level=message.level;claimed=[...message.claimed];legacy=[...(message.legacy??[])];pending=false;draw();return true;}
  if(message.t==='ev')for(const event of message.list)if(event.type==='level'&&event.playerId===o.you()){level=event.level;draw();}
  return false;
 }};
}
