import {CRAFT_RECIPES,FORGE_FRAGMENT,salvageQuote,requiredEquipmentLevel,type GameData,type Inventory} from '@the-beginning-online/shared';
import {itemIcon} from './item-icon';
import './forge-crafting.css';

export function renderForgeCrafting(o:{data:GameData;inventory:Inventory;gold:number;mode:'craft'|'salvage';busy:boolean;request:(op:string,args:unknown)=>void}){
 const root=document.createElement('section');root.id='forge-crafting';
 const fragments=o.inventory.items.filter(i=>i.location==='bag'&&i.template===FORGE_FRAGMENT).reduce((n,i)=>n+i.qty,0);
 const head=document.createElement('header');head.innerHTML='<div><small>THE FORGE / RECLAIM & CREATE</small><h3></h3></div><strong></strong>';
 head.querySelector('h3')!.textContent=o.mode==='craft'?'หลอมเศษผลึกให้เป็นของมีค่า':'เปลี่ยนอุปกรณ์เหลือใช้เป็นวัตถุดิบ';head.querySelector('strong')!.textContent=`เศษผลึกช่าง ${fragments.toLocaleString('th-TH')}`;root.append(head);
 const note=document.createElement('p');note.className='forge-note';note.textContent=o.mode==='craft'?'รับเศษผลึกจากเควสต์หรือย่อยอุปกรณ์ · คราฟต์สำเร็จแน่นอน · หินใช้ตีบวกหรือแลกเปลี่ยนได้':'เลือกอุปกรณ์จากดรอปหรือร้านที่อยู่ในกระเป๋า · ของเริ่มต้น ของแจก และของที่ติดการ์ดย่อยไม่ได้ · เศษผลึกผูกบัญชี';root.append(note);
 const list=document.createElement('div');list.className='forge-recipes';root.append(list);
 const row=(name:string,icon:HTMLElement,copy:string,label:string,disabled:boolean,run:()=>void)=>{
  const card=document.createElement('article'),body=document.createElement('div'),title=document.createElement('h4'),detail=document.createElement('p'),button=document.createElement('button');title.textContent=name;detail.textContent=copy;body.append(title,detail);button.type='button';button.textContent=label;button.disabled=disabled||o.busy;button.onclick=run;card.append(icon,body,button);list.append(card);
 };
 if(o.mode==='craft')for(const recipe of CRAFT_RECIPES){
  const template=o.data.items.items.find(t=>t.id===recipe.template)!;
  row(template.nameTh+' ×1',itemIcon(template),`ใช้เศษผลึกช่าง ${recipe.fragments} ชิ้น + ${recipe.gold} ทอง`,'คราฟต์',fragments<recipe.fragments||o.gold<recipe.gold,()=>o.request('craft',{template:recipe.template}));
 }else for(const item of o.inventory.items){
  const qty=salvageQuote(item,o.data);if(typeof qty!=='number')continue;
  const template=o.data.items.items.find(t=>t.id===item.template)!;
  const name=`${item.refine?'+'+item.refine+' ':''}${template.nameTh}`;
  row(name,itemIcon(template),`Lv.${requiredEquipmentLevel(template.level,item)} → เศษผลึกช่าง ${qty} ชิ้น`,`ย่อย · ${qty} ชิ้น`,false,()=>{
   const dialog=document.createElement('dialog');dialog.id='forge-salvage-confirm';dialog.setAttribute('aria-labelledby','salvage-confirm-title');
   dialog.innerHTML='<small>RECLAIM EQUIPMENT</small><h2 id="salvage-confirm-title">ย่อยอุปกรณ์ชิ้นนี้?</h2><p class="salvage-name"></p><p class="salvage-yield"></p><p class="salvage-warning">อุปกรณ์ ค่าตีบวก และช่องเสริมจะหายไปถาวร ไม่คืนทองหรือหินตีบวก</p><footer><button type="button" class="salvage-cancel">เก็บอุปกรณ์ไว้</button><button type="button" class="salvage-confirm">ยืนยันย่อย</button></footer>';
   dialog.querySelector('.salvage-name')!.textContent=name;dialog.querySelector('.salvage-yield')!.textContent=`ได้รับเศษผลึกช่าง ${qty} ชิ้น (ผูกบัญชี)`;
   const cancel=dialog.querySelector<HTMLButtonElement>('.salvage-cancel')!;cancel.onclick=()=>dialog.close();
   dialog.querySelector<HTMLButtonElement>('.salvage-confirm')!.onclick=()=>{dialog.close();o.request('salvage',{id:item.id});};
   dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();cancel.focus();
  });
 }
 if(!list.children.length){const empty=document.createElement('p');empty.className='forge-empty';empty.textContent='ยังไม่มีอุปกรณ์ที่ย่อยได้ · เก็บอุปกรณ์ดรอปที่ไม่ใช้ แล้วถอดไว้ในกระเป๋าก่อนมาหาช่าง';list.append(empty);}
 return root;
}
