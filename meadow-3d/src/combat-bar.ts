import {loadGameData,keyLabel} from '@the-beginning-online/shared';
import {itemIcon} from './item-icon';
import {KEYS} from './keys';

const data=loadGameData();
const potionCooldown=data.skills.skills.find(s=>s.id==='potion')!.cooldown;

export function mountCombatBar(drinkMana:()=>void){
 const bar=document.querySelector<HTMLElement>('.combat-ui')!;
 const auto=document.createElement('div');auto.id='combat-auto';
 auto.append(document.querySelector('#auto-hunt')!,document.querySelector('#auto-settings-button')!);
 bar.prepend(auto);
 const xp=document.createElement('div');xp.id='combat-exp';xp.innerHTML='<progress max="100" value="0" aria-label="ค่าประสบการณ์"></progress><span></span>';bar.append(xp);
 // Reserve the actual bar height, including extra skill rows and the saved UI scale.
 const root=document.documentElement;let top='',scale=root.style.getPropertyValue('--ui-scale');
 const reserve=()=>{let y=bar.getBoundingClientRect().top;for(const button of bar.querySelectorAll('button'))if(button.getClientRects().length)y=Math.min(y,button.getBoundingClientRect().top);
  const next=`${Math.round(y)}px`;if(next!==top){top=next;root.style.setProperty('--combat-top',next);}};
 const resize=new ResizeObserver(reserve);resize.observe(bar);resize.observe(document.querySelector('#ui')!);
 new MutationObserver(()=>{const next=root.style.getPropertyValue('--ui-scale');if(next!==scale){scale=next;reserve();}}).observe(root,{attributes:true,attributeFilter:['style']});
 let more=false;new MutationObserver(()=>{const next=document.body.classList.contains('more-skills');if(next!==more){more=next;reserve();}}).observe(document.body,{attributes:true,attributeFilter:['class']});
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-potion]')];
 for(const button of buttons){
  const art=itemIcon({id:button.dataset.potion==='hp'?'red_small':'blue_potion'});
  art.classList.add('potion-art');art.setAttribute('aria-hidden','true');button.querySelector('.potion-art')!.replaceWith(art);
 }
 document.querySelector<HTMLButtonElement>('#mana-potion')!.onclick=drinkMana;
 return {update(p:any){
  for(const button of buttons){
   const hp=button.dataset.potion==='hp';
   const count=hp?p.potions:(p.inventory?.items??[]).filter((i:any)=>i.location==='bag'&&data.items.items.find(t=>t.id===i.template)?.effect==='sp').reduce((n:number,i:any)=>n+i.qty,0);
   const cd=p.cd.potion||0,unavailable=count===0||p.dead||(hp?p.hp>=p.maxHp:p.mp>=p.maxMp);
   button.querySelector('b')!.textContent=String(count);
   button.querySelector('kbd')!.textContent=keyLabel(KEYS[hp?'potion':'manaPotion'][0]);
   button.querySelector('em')!.textContent=cd>.05?cd.toFixed(1):'';
   button.classList.toggle('empty',count===0);button.classList.toggle('cooling',cd>.05);
   button.setAttribute('aria-disabled',String(unavailable||cd>0));
   button.style.setProperty('--potion-sweep',`${Math.min(1,cd/potionCooldown)*360}deg`);
  }
  const percent=p.level>=data.stats.maxLevel?100:Math.min(100,p.xp/Math.max(1,p.nextXp)*100);
  xp.querySelector('progress')!.value=percent;
  xp.querySelector('span')!.textContent=p.level>=data.stats.maxLevel?'EXP · ระดับสูงสุด':`EXP ${p.xp.toLocaleString()} / ${p.nextXp.toLocaleString()} (${Math.floor(percent)}%)`;
 }};
}
