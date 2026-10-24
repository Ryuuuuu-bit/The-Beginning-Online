import './portal-expansion.css';
import {REGIONS,WORLD_MAX_LEVEL,worldData} from './world-catalog';
const illustrations=Object.fromEntries(['meadow','yokai','dragon','ocean','astral','confluence'].map(id=>[id,`/assets/web/world-wallpapers-v2/${id}.webp`]));
const host=document.querySelector('#realm-new-world');
if(host)for(const [id,image]of Object.entries(illustrations)){
 const region=REGIONS.find(r=>r.id===id)!;const link=document.createElement('a');link.className='realm-region-card';link.href='/world.html?region='+id;
 const img=document.createElement('img');img.src=image;img.alt=region.name;img.loading='lazy';img.width=700;img.height=460;
 const copy=document.createElement('div'),level=document.createElement('span'),title=document.createElement('h3'),myth=document.createElement('p');
 level.textContent='Lv.'+(region.levels[0]===region.levels[1]?region.levels[0]:region.levels.join('–'));title.textContent=region.name;myth.textContent=region.myth;
 copy.append(level,title,myth);link.append(img,copy);host.append(link);
}
const regionCount=document.querySelector('[data-world-regions]');if(regionCount)regionCount.textContent=String(REGIONS.length);
const maxLevel=document.querySelector('[data-world-max]');if(maxLevel)maxLevel.textContent=String(WORLD_MAX_LEVEL);
const cards=document.querySelector('[data-world-cards]');if(cards)cards.textContent=String(worldData.items.items.filter(i=>i.type==='card').length);
const starterRoute=document.querySelector('[data-starter-route]');if(starterRoute)starterRoute.textContent='เส้นทางช่วงต้น: '+['meadow','forest','ruins','canyon'].map(id=>{const region=REGIONS.find(r=>r.id===id)!;return `${region.name} Lv.${region.levels.join('–')}`;}).join(' → ');
