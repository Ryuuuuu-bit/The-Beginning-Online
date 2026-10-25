import {levelReward,loadGameData} from '@the-beginning-online/shared';
import {itemIcon} from './item-icon';
import './mailbox.css';

export function mountMailbox(o:{send:(message:unknown)=>void;onOpen:()=>void;you:()=>string}){
 const data=loadGameData(),menu=document.querySelector<HTMLDialogElement>('#game-menu-window')!,menuButton=document.querySelector<HTMLButtonElement>('#game-menu')!;
 const button=document.createElement('button');button.id='mailbox-button';button.type='button';button.className='menu-tile';button.dataset.icon='mail';button.innerHTML='<i aria-hidden="true"></i><span>กล่องจดหมาย</span><b class="mail-count"></b>';menu.querySelector('.menu-grid')!.append(button);
 const panel=document.createElement('dialog');panel.id='mailbox-window';panel.setAttribute('aria-labelledby','mailbox-title');
 // Reward road (ui-mockup/levelrewards.html): ready summary + next chest, coin road Lv.1–max, cards for the picked level.
 const CHEST='/assets/ui/chest-open.svg';
 panel.innerHTML=`<i class="mr-corner tl"></i><i class="mr-corner tr"></i><i class="mr-corner bl"></i><i class="mr-corner br"></i>
 <header class="mr-head"><span class="mr-emblem" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7h18v13H3z"/><path d="M3 7l9 7 9-7"/></svg></span><div><small>ADVENTURER’S MAIL</small><h2 id="mailbox-title">รางวัลเลเวล</h2></div><button type="button" class="mr-close" aria-label="ปิดกล่องจดหมาย">×</button></header>
 <section class="mr-hero" aria-label="สรุปรางวัล"><div class="mr-now"><div class="mr-medal"><span class="mr-face"></span><b class="mr-lv"></b></div><div class="mr-copy"><small class="mr-sub"></small><strong class="mr-ready"></strong><p>ของเข้ากระเป๋าทันที · กระเป๋าเต็มก็ไม่หาย รางวัลรอไว้ให้</p><button type="button" id="mailbox-claim-all"><span></span><b></b></button></div></div><div class="mr-next"></div></section>
 <div class="mr-road-head"><h3>เส้นทางรางวัล</h3><span>กล่องพิเศษทุก 5 เลเวล</span><div class="mr-jump"><button type="button" data-jump="ready">ที่รับได้</button><button type="button" data-jump="next">กล่องถัดไป</button><button type="button" data-jump="first">Lv.1</button><button type="button" data-jump="last">Lv.${data.stats.maxLevel}</button></div><div class="mr-legend"><span><i class="ready"></i>รับได้</span><span><i class="claimed"></i>รับแล้ว</span><span><i class="locked"></i>ยังไม่ถึง</span></div></div>
 <div class="mr-road"><div class="mr-track" aria-label="เลือกเลเวล"><i class="mr-fill"></i></div></div>
 <article class="mr-detail" aria-live="polite"></article>
 <footer class="mr-foot"><span>◆ ของผูกตัวละคร · ขาย / เทรดไม่ได้ · แต่ละเลเวลรับได้ครั้งเดียวต่อบัญชี</span><details><summary>เงื่อนไขการรับ</summary><p>ทองแจกใช้กับร้านและช่างได้ แต่โอนไม่ได้ · ใช้ทองปกติก่อน หากใช้ทองแจกซื้อหรืออัปเกรด ของจะผูกตัวละคร · แต่ละเลเวลรับได้ครั้งเดียวต่อบัญชี ลบตัวละครแล้วสิทธิ์ไม่คืน · ขนาดยาตามเลเวลตอนรับ · ถ้ากระเป๋าหรือน้ำหนักไม่พอ รางวัลจะยังอยู่ · ไม่หมดอายุ</p></details></footer>
 <p class="mr-toast" role="status"></p>`;
 document.body.append(panel);
 let level=0,claimed:number[]=[],legacy:number[]=[],pending=false,feedback='',selected=0,toastTimer=0;
 const levels=Array.from({length:data.stats.maxLevel},(_,i)=>i+1);
 const stateOf=(n:number)=>claimed.includes(n)?'claimed':n>level?'locked':'ready';
 const available=()=>levels.filter(n=>stateOf(n)==='ready');
 const nextChest=()=>Math.min(data.stats.maxLevel,Math.ceil((level+1)/5)*5);
 const $=<T extends HTMLElement=HTMLElement>(s:string)=>panel.querySelector<T>(s)!;
 const reward=(n:number)=>levelReward(n,data,legacy.includes(n),Math.max(level,n));
 const template=(id:string)=>data.items.items.find(t=>t.id===id)!;
 const track=$('.mr-track'),road=$('.mr-road');
 const nodes=levels.map(n=>{const b=document.createElement('button');b.type='button';b.className='mr-node'+(n%5===0?' big':'');b.dataset.level=String(n);b.ariaLabel=`รางวัลเลเวล ${n}`;
  b.innerHTML=(n%5===0?`<span class="mr-chest"><img alt="" src="${CHEST}"></span>`:'<span class="mr-coin"></span>')+`<span class="mr-tag">Lv.${n}</span>`;b.onclick=()=>pick(n);track.append(b);return b;});
 const you=document.createElement('span');you.className='mr-you';you.innerHTML='<i></i><b>คุณ</b>';
 function claim(n?:number){pending=true;feedback='';draw();o.send({t:'mailbox',op:'claim',req:crypto.randomUUID(),...(n===undefined?{}:{level:n})});}
 function pick(n:number){selected=n;draw();const b=nodes[n-1];road.scrollTo({left:b.offsetLeft-road.clientWidth/2+b.offsetWidth/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
 function tiles(n:number){
  const r=reward(n),out:HTMLElement[]=[];
  const tile=(icon:HTMLElement,qty:string,name:string,kind='')=>{const t=document.createElement('div'),copy=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span');t.className='mr-tile'+(kind?' '+kind:'');icon.classList.add('mr-ic');icon.setAttribute('aria-hidden','true');b.textContent=qty;s.textContent=name;copy.append(b,s);t.append(icon,copy);out.push(t);};
  if(r.gold){const coin=document.createElement('span');coin.className='mr-gold-ic';tile(coin,r.gold.toLocaleString('en-US'),'ทองแจก','gold');}
  for(const item of r.items){const t=template(item.template);tile(itemIcon(t),`×${item.qty}`,t.nameTh,t.slot?'gear':'');}
  return out;
 }
 function draw(){
  const ready=available(),count=ready.length;
  button.querySelector('b')!.textContent=count?String(count):'';
  button.ariaLabel=`กล่องจดหมาย · รางวัลรับได้ ${count} รายการ`;
  menuButton.dataset.mailCount=count?String(count):'';menuButton.ariaLabel=count?`เมนู · มีรางวัลเลเวล ${count} รายการ`:'เมนู';
  if(!panel.open)return;
  if(!selected)selected=ready[0]??Math.max(1,level);
  $('.mr-lv').textContent=level?`Lv.${level}`:'…';
  $('.mr-sub').textContent=level?`นักผจญภัย · ระดับ ${level}`:'กำลังโหลดตัวละคร…';
  $('.mr-ready').innerHTML=count?`มีรางวัลพร้อมรับ <em>${count} ชุด</em>`:level?'รับรางวัลที่ปลดล็อกครบแล้ว':'กำลังโหลดรางวัล…';
  $('.mr-medal').style.setProperty('--p',String(level?((level%5)/5*100)||100:0));
  const all=$<HTMLButtonElement>('#mailbox-claim-all'),allCount=all.querySelector('b')!;all.disabled=pending||!count;all.querySelector('span')!.textContent=pending?'กำลังส่งของ…':count?'รับทั้งหมด':'ไม่มีรางวัลค้าง';allCount.textContent=String(count);allCount.hidden=!count;all.onclick=()=>claim();
  const nx=nextChest(),next=$('.mr-next');
  if(level>=data.stats.maxLevel)next.innerHTML=`<img class="mr-big-chest" alt="" src="${CHEST}"><small>เส้นทางรางวัล</small><b>ปลดล็อกครบทุกเลเวลแล้ว</b>`;
  else if(level){const r=reward(nx);next.innerHTML=`<img class="mr-big-chest" alt="" src="${CHEST}"><span class="mr-count">อีก <b>${nx-level}</b> เลเวล</span><small>กล่องพิเศษถัดไป</small><b>Lv.${nx}${r.gold?` · ทองแจก ${r.gold.toLocaleString('en-US')}`:''}</b><div class="mr-mini"></div>`;
   const mini=next.querySelector('.mr-mini')!;for(const item of r.items){const t=template(item.template),i=itemIcon(t);i.title=t.nameTh;mini.append(i);}}
  for(const b of nodes){const n=Number(b.dataset.level),st=stateOf(n);b.classList.remove('ready','claimed','locked');b.classList.add(st);b.classList.toggle('sel',n===selected);b.setAttribute('aria-pressed',String(n===selected));
   const coin=b.querySelector('.mr-coin');if(coin)coin.textContent=st==='claimed'?'✓':String(n);}
  if(level){const here=nodes[Math.min(level,levels.length)-1];if(you.parentElement!==here)here.append(you);$('.mr-fill').style.width=`${here.offsetLeft+here.offsetWidth/2-24}px`;}
  const n=selected,st=stateOf(n),r=reward(n),d=$('.mr-detail');
  d.className=`mr-detail ${st}${r.special?' special':''}`;
  const side=document.createElement('div');side.className='mr-side';
  side.innerHTML=(r.special?`<img alt="" src="${CHEST}">`:'<span class="mr-orb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 10h16v10H4z"/><path d="M2.5 7h19v3h-19z"/><path d="M12 7v13"/><path d="M12 7c-2-3-6-3-5 0M12 7c2-3 6-3 5 0"/></svg></span>')+`<b>${n}</b><small>${r.special?'SPECIAL':'LEVEL'}</small>`;
  const main=document.createElement('div');main.className='mr-main';
  const top=document.createElement('div');top.className='mr-top';
  const title=document.createElement('h3');title.textContent=`${legacy.includes(n)?'ส่วนเพิ่ม · ':''}${r.special?'กล่องพิเศษ':'รางวัล'} Lv.${n}`;
  const chip=document.createElement('span');chip.className=`mr-chip ${st}`;chip.textContent=st==='claimed'?'✓ รับแล้ว':st==='locked'?`อีก ${n-level} เลเวล`:'● พร้อมรับ';top.append(title,chip);
  const items=document.createElement('div');items.className='mr-items';items.append(...tiles(n));
  const foot=document.createElement('div');foot.className='mr-dfoot';
  const note=document.createElement('p');note.textContent=st==='locked'?`เก็บ EXP ถึง Lv.${n} เพื่อปลดล็อก`:st==='claimed'?'รับรางวัลชุดนี้ไปแล้ว':r.special?'กล่องพิเศษ: มีทองแจก ของสวมใส่ และยาพิเศษ':'ยาจะเป็นขนาดตามเลเวลตอนกดรับ';
  const receive=document.createElement('button');receive.type='button';receive.className='mr-claim';receive.textContent=st==='claimed'?'รับแล้ว':st==='locked'?`ปลดล็อกที่ Lv.${n}`:'รับรางวัลนี้';receive.disabled=pending||st!=='ready';receive.onclick=()=>claim(n);
  foot.append(note,receive);main.append(top,items,foot);d.replaceChildren(side,main);
  const toast=$('.mr-toast');if(pending||feedback)toast.textContent=pending?'กำลังส่งของเข้ากระเป๋า…':feedback;toast.classList.toggle('on',!!(pending||feedback));
 }
 panel.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach(b=>b.onclick=()=>{const j=b.dataset.jump;pick(j==='ready'?available()[0]??Math.max(1,level):j==='next'?nextChest():j==='first'?1:levels.length);});
 button.onclick=()=>{menu.close();o.onOpen();feedback='';selected=0;panel.showModal();draw();pick(selected);o.send({t:'mailbox',op:'list'});};
 $('.mr-close').addEventListener('click',()=>panel.close());
 draw();o.send({t:'mailbox',op:'list'});
 return {receive(message:any){
  if(message.t==='mailbox'){const received=message.claimed.length-claimed.length,wasLoaded=level>0;feedback=message.error??(pending&&received>0?`✓ ส่งเข้ากระเป๋าแล้ว ${received} ชุด`:'');level=message.level;claimed=[...message.claimed];legacy=[...(message.legacy??[])];pending=false;
   if(panel.open&&(!wasLoaded||(received>0&&stateOf(selected)!=='ready'))){const n=available()[0]??Math.max(1,level);pick(n);}else draw();
   clearTimeout(toastTimer);if(feedback)toastTimer=window.setTimeout(()=>{feedback='';draw();},2400);return true;}
  if(message.t==='ev')for(const event of message.list)if(event.type==='level'&&event.playerId===o.you()){level=event.level;draw();}
  return false;
 }};
}
