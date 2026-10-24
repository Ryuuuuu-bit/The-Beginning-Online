import {levelReward,loadGameData} from '@the-beginning-online/shared';
import './mailbox.css';

export function mountMailbox(o:{send:(message:unknown)=>void;onOpen:()=>void;you:()=>string}){
 const data=loadGameData(),menu=document.querySelector<HTMLDialogElement>('#game-menu-window')!,menuButton=document.querySelector<HTMLButtonElement>('#game-menu')!;
 const button=document.createElement('button');button.id='mailbox-button';button.type='button';button.className='menu-tile';button.innerHTML='<i aria-hidden="true">✉</i><span>กล่องจดหมาย</span><b class="mail-count"></b>';menu.querySelector('.menu-grid')!.append(button);
 const panel=document.createElement('dialog');panel.id='mailbox-window';panel.setAttribute('aria-labelledby','mailbox-title');
 panel.innerHTML='<header><div><small>MAILBOX</small><h2 id="mailbox-title">รางวัลเลเวล</h2></div><button type="button" aria-label="ปิดกล่องจดหมาย">×</button></header><p>รางวัล Lv.1–100 · ขนาดยาตามเลเวลผู้เล่นตอนรับ · รับครั้งเดียว · ไม่หมดอายุ</p><nav aria-label="กรองรางวัล"><button type="button" data-filter="ready">รับได้</button><button type="button" data-filter="all">ทั้งหมด</button><button type="button" id="mailbox-claim-all">รับทั้งหมด</button></nav><p class="mailbox-status" role="status"></p><div class="mailbox-list"></div>';
 document.body.append(panel);
 let level=0,claimed:number[]=[],legacy:number[]=[],pending=false,filter='ready',feedback='';
 const available=()=>Array.from({length:Math.max(0,level)},(_,i)=>i+1).filter(n=>!claimed.includes(n));
 function claim(n?:number){pending=true;feedback='';draw();o.send({t:'mailbox',op:'claim',req:crypto.randomUUID(),...(n===undefined?{}:{level:n})});}
 function draw(){
  const ready=available(),count=ready.length;
  button.querySelector('b')!.textContent=count?String(count):'';
  button.ariaLabel=`กล่องจดหมาย · รางวัลรับได้ ${count} รายการ`;
  menuButton.dataset.mailCount=count?String(count):'';menuButton.ariaLabel=count?`เมนู · มีรางวัลเลเวล ${count} รายการ`:'เมนู';
  if(!panel.open)return;
  panel.querySelector('.mailbox-status')!.textContent=pending?'กำลังรับรางวัล…':feedback||`Lv.${level} · รับได้ ${count} รายการ · ถ้ากระเป๋าหรือน้ำหนักไม่พอ รางวัลจะยังคงอยู่`;
  const all=panel.querySelector<HTMLButtonElement>('#mailbox-claim-all')!;all.disabled=pending||!count;all.onclick=()=>claim();
  panel.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b=>{b.setAttribute('aria-pressed',String(filter===b.dataset.filter));b.onclick=()=>{filter=b.dataset.filter!;draw();};});
  const list=panel.querySelector('.mailbox-list')!;list.replaceChildren();
  for(const n of filter==='ready'?ready:Array.from({length:data.stats.maxLevel},(_,i)=>i+1)){
   const reward=levelReward(n,data,legacy.includes(n),Math.max(level,n)),row=document.createElement('article'),copy=document.createElement('div'),title=document.createElement('h3'),items=document.createElement('p'),receive=document.createElement('button');
   row.className=reward.special?'mailbox-special':'';title.textContent=`${legacy.includes(n)?'ส่วนเพิ่ม · ':''}${reward.special?'กล่องพิเศษ':'รางวัล'} Lv.${n}`;
   items.textContent=[...(reward.gold?[`${reward.gold.toLocaleString('en-US')} ทอง`]:[]),...reward.items.map(i=>{const t=data.items.items.find(t=>t.id===i.template)!;return `${t.nameTh} ×${i.qty}${t.slot?' (ผูกมัด)':''}`;})].join(' · ');
   receive.type='button';receive.textContent=claimed.includes(n)?'รับแล้ว':n>level?`ปลดล็อก Lv.${n}`:'รับรางวัล';receive.disabled=pending||claimed.includes(n)||n>level;receive.onclick=()=>claim(n);
   copy.append(title,items);row.append(copy,receive);list.append(row);
  }
  if(!list.children.length){const empty=document.createElement('p');empty.textContent=level<1?'กำลังโหลดรางวัล':'รับรางวัลที่ปลดล็อกครบแล้ว · ดูรางวัลถัดไปได้ที่ “ทั้งหมด”';list.append(empty);}
 }
 button.onclick=()=>{menu.close();o.onOpen();feedback='';panel.showModal();draw();o.send({t:'mailbox',op:'list'});};
 panel.querySelector('header button')!.addEventListener('click',()=>panel.close());
 draw();o.send({t:'mailbox',op:'list'});
 return {receive(message:any){
  if(message.t==='mailbox'){const received=message.claimed.length-claimed.length;feedback=message.error??(pending&&received>0?`รับรางวัลสำเร็จ ${received} รายการ`:'');level=message.level;claimed=[...message.claimed];legacy=[...(message.legacy??[])];pending=false;draw();return true;}
  if(message.t==='ev')for(const event of message.list)if(event.type==='level'&&event.playerId===o.you()){level=event.level;draw();}
  return false;
 }};
}
