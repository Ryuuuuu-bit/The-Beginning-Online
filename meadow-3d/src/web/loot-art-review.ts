import './loot-art-review.css';
import {loadGameData,STARTER_UNIQUES,consumableBuffText} from '@the-beginning-online/shared';
import {cardEffects,modifierText} from '../card-text';
import {dropOwners} from './world-catalog';
import {itemIconCell} from '../item-icon';
import {PAINTED_ITEM_ART} from '../item-art-data';
import {CLASS_ITEM_ART} from '../class-item-art-data';

const data=loadGameData(),grid=document.querySelector<HTMLElement>('#art-grid')!;
const search=document.querySelector<HTMLInputElement>('#art-search')!,kind=document.querySelector<HTMLSelectElement>('#art-kind')!,size=document.querySelector<HTMLSelectElement>('#art-size')!;
const publicCatalog=document.body.hasAttribute('data-item-catalog');
const category=(id:string)=>id.startsWith('card_')?'card':id.startsWith('unique_')?'unique':data.items.items.find(i=>i.id===id)?.slot?'gear':data.items.items.find(i=>i.id===id)?.type==='consumable'?'consumable':'material';
const names={card:'การ์ด',unique:'Unique',gear:'อุปกรณ์',material:'วัตถุดิบ',consumable:'ของใช้'};
function icon(id:string){
 const resolved=itemIconCell(id),image=document.createElement(resolved.image?'img':'span');
 if(image instanceof HTMLImageElement){image.src=resolved.image!;image.alt='';image.width=96;image.height=96;image.decoding='async';}
 else {image.className='art-atlas';image.style.backgroundImage=`url(/assets/items/${resolved.v2?'items-v2.webp':'items-v1-alpha.webp'})`;image.style.backgroundPosition=resolved.position;image.setAttribute('aria-hidden','true');}
 return image;
}
function render(){
 const query=search.value.trim().toLocaleLowerCase();
 const items=data.items.items.filter(item=>(publicCatalog||Object.hasOwn(PAINTED_ITEM_ART,item.id)||Object.hasOwn(CLASS_ITEM_ART,item.id))&&(kind.value==='all'||category(item.id)===kind.value)&&(!query||(item.nameTh+' '+item.id).toLocaleLowerCase().includes(query)));
 grid.replaceChildren(...items.map(item=>{
  const article=document.createElement('article');article.className='art-item art-'+category(item.id);article.dataset.item=item.id;
  const image=icon(item.id);if(image instanceof HTMLImageElement)image.alt=item.nameTh;
  const name=document.createElement('h2');name.textContent=item.nameTh;
  const caption=document.createElement('p');caption.textContent=names[category(item.id)]+' · Lv.'+item.level;
  article.append(image,name,caption);
  if(publicCatalog){const button=document.createElement('button');button.type='button';button.textContent='ดูรายละเอียด';button.setAttribute('aria-label','ดูรายละเอียด '+item.nameTh);button.onclick=()=>showItem(item.id);article.append(button);}
  return article;
 }));
 document.querySelector('#art-count')!.textContent=items.length+' ชิ้น';
}
search.addEventListener('input',render);kind.addEventListener('change',render);
size.addEventListener('change',()=>grid.style.setProperty('--art-size',size.value+'px'));
render();
function showItem(id:string){
 const item=data.items.items.find(i=>i.id===id);if(!item)return;
 const dialog=document.querySelector<HTMLDialogElement>('#item-detail')!,content=dialog.querySelector('#item-detail-content')!;content.replaceChildren();
 const title=document.createElement('h2');title.id='item-title';title.textContent=item.nameTh;content.append(icon(id),title);
 const level=document.createElement('p');level.textContent=names[category(id)]+' · ระดับที่ใช้ '+item.level;content.append(level);
 const card=data.cards.cards.find(c=>c.id===id);if(card){const slot=document.createElement('p');const labels={weapon:'อาวุธ',armour:'เกราะ',shield:'โล่',garment:'ผ้าคลุม',footgear:'รองเท้า',accessory:'เครื่องประดับ'};slot.textContent='ติดตั้งใน: '+(labels[card.slot]??card.slot)+'ที่มีช่องการ์ด';content.append(slot);}
 const unique=STARTER_UNIQUES[id],effects=id.startsWith('card_')?[cardEffects(data,id)]:[...item.modifiers.map(modifierText).filter(Boolean),...(unique?[...unique.rolls.map(r=>`${r.name} ${r.min}–${r.max}`),...unique.lines]:[])];
 if(category(id)==='gear'&&id.startsWith('field_'))effects.unshift('อุปกรณ์ฐานสำหรับสุ่มออฟ · ค่าของจริงขึ้นกับระดับไอเทมและผลสุ่ม');
 if(item.atk)effects.push('พลังโจมตีฐาน '+item.atk);if(item.matk)effects.push('พลังเวทฐาน '+item.matk);
 const buff=consumableBuffText(item);if(buff)effects.push(buff);
 if(item.effect==='hp'||item.effect==='sp')effects.push(`ฟื้น ${item.effect.toUpperCase()} ${item.amount?.toLocaleString('en-US')}`);
 const lines=document.createElement('ul');for(const effect of effects.filter(Boolean)){const line=document.createElement('li');line.textContent=effect;lines.append(line);}content.append(lines);
 const prices=document.createElement('p'),offers=Object.entries(data.economy.shops).filter(([,shop])=>shop[id]!==undefined);
 const shopNames:Record<string,string>={market:'ร้านเบ็ดเตล็ด',forge:'ร้านตีเหล็ก'};
 prices.textContent=offers.map(([shop,stock])=>`${shopNames[shop]??shop}: ซื้อ ${stock[id].toLocaleString('en-US')} ทอง`).concat(`ราคาขายคืนฐาน ${Math.floor(item.npcPrice*data.economy.sellMultiplier).toLocaleString('en-US')} ทอง`).join(' · ');content.append(prices);
 const heading=document.createElement('h3');heading.textContent='พบได้จาก';content.append(heading);
 const owners=dropOwners(id);
 for(const monster of owners){const a=document.createElement('a');a.href='/monsters.html#'+encodeURIComponent(monster.id);a.textContent=monster.nameTh+' · Lv.'+monster.level;a.className='item-drop-owner';content.append(a);}
 if(!owners.length){const note=document.createElement('p');note.textContent=['exp_boost_scroll','drop_boost_scroll'].includes(id)?'กล่องจดหมายรางวัล Lv.1, 30, 60 และ 90':offers.length?'ซื้อได้จากร้านในนครที่ถูกลืมเลือน':'ไม่มีรายชื่อมอนสเตอร์ที่ดรอปโดยตรงในข้อมูลปัจจุบัน';content.append(note);}
 dialog.querySelector<HTMLButtonElement>('.item-detail-close')!.onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();
}
if(publicCatalog){
 const query=new URLSearchParams(location.search),selectedKind=query.get('kind');if([...kind.options].some(o=>o.value===selectedKind))kind.value=selectedKind!;
 const selectedItem=query.get('item');render();if(selectedItem)showItem(selectedItem);
}
