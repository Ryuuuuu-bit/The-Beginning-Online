import {CITY_SPAWN} from '@the-beginning-online/shared/maps';
import {applyInventory,applyTrade,starterInventory,economyData,checkRequest,alertIntegrity,questProgress,levelRewardClaims,consumedBuffs,type Inventory,type LedgerEntry,type EconomyContext,type EconomyResult,type TradeParty,type TradeResult} from './economy.js';
import type {InventoryOp} from '@the-beginning-online/shared';
import {characterGender,creationJob,needsJob,migrateMap} from './progress.js';
import {loadGameData,newJob,normalizeJob,normalizeMastery} from '@the-beginning-online/shared';
import{randomUUID}from'node:crypto';import type{Account,AuditEntry,Character,GoogleIdentity,PasswordIdentity,Session,Store}from'./types.js';import{newUid,ADMIN_SEED_UIDS}from'./types.js';import{AppError,missing}from'../errors.js';
const now=()=>new Date().toISOString();
export class MemoryStore implements Store {
 private leases=new Map<string,string>();
 async rankingCharacters():Promise<import('@the-beginning-online/shared').RankingCharacter[]>{return [...this.chars.values()].filter(c=>!c.deletedAt).map(c=>({id:c.id,name:c.name,jobId:c.jobId??c.classId,level:c.level,xp:c.xp,kills:c.kills,titleId:c.titleId,unlockedTitles:structuredClone(c.unlockedTitles??[]),titleRecords:structuredClone(c.titleRecords??{bosses:{}})}));}
 async health(){}
 async pruneRequests(){for(const[k,r]of this.requests)if(Date.now()-r.at>86400000)this.requests.delete(k);}
 async claimLease(id:string,owner:string){this.leases.set(id,owner);}
 async renewLease(id:string,owner:string){return this.leases.get(id)===owner;}
 async releaseLease(id:string,owner:string){if(this.leases.get(id)===owner)this.leases.delete(id);}
 private ui=new Map<string,import('@the-beginning-online/shared').UISettings>();
 async uiSettings(id:string):Promise<import('@the-beginning-online/shared').UISettings>{return structuredClone(this.ui.get(id)??{scale:100,windows:{},keys:{returnCity:'KeyH'}});}
 async saveUISettings(id:string,settings:import('@the-beginning-online/shared').UISettings){this.ui.set(id,structuredClone(settings));}

 private accounts=new Map<string,Account>();private sessions=new Map<string,Session>();private chars=new Map<string,Character>();
 private inventories=new Map<string,Inventory>();
 private requests=new Map<string,{at:number;result:EconomyResult}>();
 private ledger:{character:string;entry:LedgerEntry}[]=[];
 /** Mirrors migration 016: each seed uid becomes admin once, as soon as its account exists. */
 async init(){for(const uid of ADMIN_SEED_UIDS){if(this.seeded.has(uid))continue;const a=[...this.accounts.values()].find(a=>a.uid===uid);if(!a)continue;this.seeded.add(uid);a.isAdmin=true;this.audits.push({at:now(),action:'admin.seed',targetUid:uid,detail:{source:'016_admin.sql'}});}}
 async close(){}
 private seeded=new Set<string>();private audits:AuditEntry[]=[];
 async accountByUid(uid:string){const a=[...this.accounts.values()].find(a=>a.uid===uid);return a?{...a}:undefined;}
 async adminAccounts(){return[...this.accounts.values()].filter(a=>a.isAdmin).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(a=>({...a}));}
 async setAdmin(targetUid:string,admin:boolean,actor:{accountId:string;uid:string}){const a=[...this.accounts.values()].find(a=>a.uid===targetUid);if(!a)throw new AppError(404,'NOT_FOUND','ไม่พบบัญชี UID นี้');const changed=!!a.isAdmin!==admin;
  if(changed&&!admin&&[...this.accounts.values()].filter(x=>x.isAdmin).length<=1)throw new AppError(409,'LAST_ADMIN','เป็นแอดมินคนสุดท้าย ลบสิทธิ์ไม่ได้');
  if(changed){a.isAdmin=admin;this.audits.push({at:now(),actorAccountId:actor.accountId,actorUid:actor.uid,action:admin?'admin.add':'admin.remove',targetUid});}return{account:{...a},changed};}
 async audit(entry:AuditEntry){this.audits.push({at:now(),...structuredClone(entry)});if(this.audits.length>10000)this.audits.splice(0,this.audits.length-10000);}
 async auditLog(limit=50){return structuredClone(this.audits.slice(-limit).reverse());}
 private econCharacter(accountId:string,id:string) {const c=this.chars.get(id);if(!c||c.accountId!==accountId||c.deletedAt)throw missing();if(!this.inventories.has(id)){const inv=starterInventory(c.potions,randomUUID);this.inventories.set(id,inv);this.ledger.push({character:id,entry:{kind:'admin',qty:0,goldDelta:c.gold}},...inv.items.map(i=>({character:id,entry:{kind:'admin',template:i.template,itemId:i.id,qty:i.qty,goldDelta:0}})));}return c;}
 async inventory(accountId:string,id:string):Promise<EconomyResult> {const c=this.econCharacter(accountId,id);return structuredClone({inventory:this.inventories.get(id)!,gold:c.gold,claimedLevelRewards:c.upgradedLevelRewards??[],legacyLevelRewards:c.claimedLevelRewards??[],consumableBuffs:c.consumableBuffs??{}});}
 async inventoryOp(accountId:string,id:string,req:string,op:InventoryOp,context:EconomyContext):Promise<EconomyResult> {
  checkRequest(req);if(context.leaseOwner&&this.leases.get(id)!==context.leaseOwner)throw Error('Lease lost');const c=this.econCharacter(accountId,id),key=id+':'+req,previous=this.requests.get(key);
  if(previous&&Date.now()-previous.at<86400000)return {...structuredClone(previous.result),duplicate:true};
  let result:EconomyResult;
  try{const claimed=levelRewardClaims(c,op),buffs=consumedBuffs(c,op,this.inventories.get(id)!),progress=questProgress(c,context);const out=applyInventory({gold:c.gold,inventory:this.inventories.get(id)!},{...op,legacyLevels:c.claimedLevelRewards??[]},op.op==='levelReward'?{...context.profile,level:c.level}:context.profile,economyData,randomUUID);if(progress)Object.assign(c,progress);if(claimed)c.upgradedLevelRewards=claimed;if(buffs)c.consumableBuffs=buffs;this.inventories.set(id,out.state.inventory);c.gold=out.state.gold;if(context.bossLoot){if(context.bossLoot===true||context.bossLoot==='king_jelly')c.bossReadyAt=Date.now()+600000;else c.bossCooldowns={...c.bossCooldowns,[context.bossLoot]:Date.now()+600000};}this.ledger.push(...out.ledger.map(entry=>({character:id,entry})));result={...out.state,effect:out.effect,claimedLevelRewards:c.upgradedLevelRewards??[],legacyLevelRewards:c.claimedLevelRewards??[],consumableBuffs:c.consumableBuffs??{}};}
  catch(e){result={inventory:this.inventories.get(id)!,gold:c.gold,claimedLevelRewards:c.upgradedLevelRewards??[],legacyLevelRewards:c.claimedLevelRewards??[],consumableBuffs:c.consumableBuffs??{},error:(e as Error).message};}
  this.requests.set(key,{at:Date.now(),result:structuredClone(result)});
  for(const[k,r]of this.requests)if(Date.now()-r.at>86400000)this.requests.delete(k);
  return structuredClone(result);
 }
 async trade(a:TradeParty,b:TradeParty,context:{tradeId:string;leaseOwner?:string}):Promise<TradeResult> {
  for(const p of [a,b])if(context.leaseOwner&&this.leases.get(p.id)!==context.leaseOwner)throw Error('Lease lost');
  const ca=this.econCharacter(a.accountId,a.id),cb=this.econCharacter(b.accountId,b.id);
  const state=(c:Character)=>({gold:c.gold,inventory:this.inventories.get(c.id)!});
  try{const out=applyTrade({state:state(ca),offer:a.offer,profile:a.profile},{state:state(cb),offer:b.offer,profile:b.profile},economyData);
   for(const [c,side] of [[ca,out.a],[cb,out.b]] as const){this.inventories.set(c.id,side.state.inventory);c.gold=side.state.gold;this.ledger.push(...side.ledger.map(entry=>({character:c.id,entry})));}
   return structuredClone({a:{inventory:out.a.state.inventory,gold:ca.gold},b:{inventory:out.b.state.inventory,gold:cb.gold}});}
  catch(e){return structuredClone({a:state(ca),b:state(cb),error:(e as Error).message,side:(e as {side?:number}).side});}
 }
 async integrity(){const issues:string[]=[],seen=new Set<string>();for(const[id,inv]of this.inventories){const c=this.chars.get(id)!;if(c.gold!==this.ledger.filter(l=>l.character===id).reduce((n,l)=>n+l.entry.goldDelta,0))issues.push(id+': gold != ledger');for(const i of inv.items){if(i.qty<=0)issues.push(id+': negative stack');if(!i.id.startsWith('stack:')){if(seen.has(i.id))issues.push('duplicate '+i.id);seen.add(i.id);}}}return alertIntegrity(issues);}

 private uid(){let uid=newUid();while([...this.accounts.values()].some(a=>a.uid===uid))uid=newUid();return uid;}
 /** Backfill for accounts restored without a uid (mirrors migration 015); a uid, once set, is never rewritten. */
 private withUid(a:Account){if(!a.uid)a.uid=this.uid();return a;}
 async createGuest(guestKeyHash:string){const a:Account={id:randomUUID(),uid:this.uid(),kind:'guest',displayName:'Guest · '+randomUUID().slice(0,6),guestKeyHash,createdAt:now(),lastLoginAt:now()};this.accounts.set(a.id,a);return{...a};}
 async resumeGuest(hash:string){const a=[...this.accounts.values()].find(a=>a.kind==='guest'&&a.guestKeyHash===hash);if(a)a.lastLoginAt=now();return a?{...this.withUid(a)}:undefined;}
 async account(id:string){const a=this.accounts.get(id);return a?{...this.withUid(a)}:undefined;}
 async registerPassword(identity:PasswordIdentity,guestId?:string){if([...this.accounts.values()].some(a=>a.usernameKey===identity.usernameKey))throw new AppError(409,'USERNAME_TAKEN','ชื่อผู้ใช้นี้มีผู้ใช้แล้ว');const guest=guestId?this.accounts.get(guestId):undefined;
  if(guest?.kind==='guest'){Object.assign(this.withUid(guest),{kind:'password',...identity,displayName:identity.username,lastLoginAt:now()});delete guest.guestKeyHash;for(const[h,s]of this.sessions)if(s.accountId===guest.id)this.sessions.delete(h);return{...guest};}
  const a:Account={id:randomUUID(),uid:this.uid(),kind:'password',...identity,displayName:identity.username,createdAt:now(),lastLoginAt:now()};this.accounts.set(a.id,a);return{...a};}
 async passwordAccount(usernameKey:string){const a=[...this.accounts.values()].find(a=>a.kind==='password'&&a.usernameKey===usernameKey);return a?{...this.withUid(a)}:undefined;}
 async loggedIn(id:string){const a=this.accounts.get(id);if(a)a.lastLoginAt=now();}
 async changePassword(id:string,passwordHash:string){const a=this.accounts.get(id);if(!a||a.kind!=='password')throw new AppError(404,'NOT_FOUND','ไม่พบบัญชีนี้');a.passwordHash=passwordHash;for(const[h,s]of this.sessions)if(s.accountId===id)this.sessions.delete(h);}
 async google(identity:GoogleIdentity,guestId?:string){const bound=[...this.accounts.values()].find(a=>a.googleSub===identity.sub),guest=guestId?this.accounts.get(guestId):undefined;
  if(guest?.kind==='guest'){if(bound&&bound.id!==guest.id)throw new AppError(409,'GOOGLE_ALREADY_LINKED','Google นี้ผูกกับบัญชีอื่นแล้ว กรุณาออกจาก Guest ก่อนเข้าสู่บัญชีนั้น');this.withUid(guest);guest.kind='google';guest.googleSub=identity.sub;guest.displayName=identity.name;delete guest.guestKeyHash;guest.lastLoginAt=now();for(const[h,s]of this.sessions)if(s.accountId===guest.id)this.sessions.delete(h);return{...guest};}
  if(bound){bound.lastLoginAt=now();return{...this.withUid(bound)};}const a:Account={id:randomUUID(),uid:this.uid(),kind:'google',googleSub:identity.sub,displayName:identity.name,createdAt:now(),lastLoginAt:now()};this.accounts.set(a.id,a);return{...a};
 }
 async createSession(s:Session){this.sessions.set(s.tokenHash,{...s});}
 async session(hash:string){const s=this.sessions.get(hash);if(!s)return;if(Date.parse(s.expiresAt)<=Date.now()){this.sessions.delete(hash);return;}return{...s};}
 async revoke(hash:string){this.sessions.delete(hash);}
 async select(sessionId:string,characterId:string){const s=[...this.sessions.values()].find(s=>s.id===sessionId),c=this.chars.get(characterId);if(!s||!c||c.deletedAt||c.accountId!==s.accountId)throw missing();s.selectedCharacterId=characterId;c.lastPlayedAt=now();}
 async characters(accountId:string){return[...this.chars.values()].filter(c=>c.accountId===accountId&&!c.deletedAt).map(c=>{if((c.jobsVersion??0)<3||(c.masteryVersion??0)<1||!c.masteryExp){Object.assign(c,normalizeJob(c));c.classId=c.jobId!;c.jobsVersion=3;}return structuredClone(migrateMap(c));});}
 async character(accountId:string,id:string){const c=this.chars.get(id);if(c&&c.accountId===accountId&&!c.deletedAt){if((c.jobsVersion??0)<3||(c.masteryVersion??0)<1||!c.masteryExp){Object.assign(c,normalizeJob(c));c.classId=c.jobId!;c.jobsVersion=3;}return structuredClone(migrateMap(c));}return undefined;}
 async createCharacter(accountId:string,name:string,nameKey:string,jobId="swordsman",gender:'male'|'female'='male'){creationJob(jobId);characterGender(gender);const active=[...this.chars.values()].filter(c=>!c.deletedAt);if(active.filter(c=>c.accountId===accountId).length>=3)throw new AppError(409,'SLOTS_FULL','สร้างตัวละครได้สูงสุด 3 ตัว');if(active.some(c=>c.nameKey===nameKey))throw new AppError(409,'NAME_TAKEN','ชื่อนี้มีผู้ใช้แล้ว');const defaults=loadGameData().stats.defaultBuild;const c:Character={gender,mapId:"city_plaza",posX:CITY_SPAWN.x,posZ:CITY_SPAWN.z,healerReadyAt:0,baseStats:{...defaults.baseStats},race:defaults.race,classId:jobId,...newJob(jobId),jobsVersion:3,statPoints:0,autoAllocate:true,autoAllocCursor:0,dataVersion:1,id:randomUUID(),accountId,name,nameKey,level:1,xp:0,gold:0,kills:0,potions:5,createdAt:now(),lastPlayedAt:now()};this.chars.set(c.id,c);return{...c};}
 async chooseJob(accountId:string,id:string,jobId:string){creationJob(jobId);const c=this.chars.get(id);if(!c||c.accountId!==accountId||c.deletedAt)throw missing();if(!needsJob(c))throw new AppError(409,'JOB_ALREADY_CHOSEN','เลือกอาชีพแล้ว');Object.assign(c,newJob(jobId),{classId:jobId,jobsVersion:3});return structuredClone(migrateMap(c));}
 async deleteCharacter(accountId:string,id:string){const c=this.chars.get(id);if(!c||c.accountId!==accountId||c.deletedAt)throw missing();c.deletedAt=now();for(const s of this.sessions.values())if(s.selectedCharacterId===id)delete s.selectedCharacterId;}
 async saveProgress(accountId:string,id:string,body:import('./types.js').Progress,leaseOwner?:string){if(leaseOwner&&this.leases.get(id)!==leaseOwner)throw Error('Lease lost');const c=this.chars.get(id);if(!c||c.accountId!==accountId||c.deletedAt)throw missing();const {gold,potions,...progress}=structuredClone(body);delete (progress as Partial<Character>).claimedLevelRewards;delete (progress as Partial<Character>).upgradedLevelRewards;delete (progress as Partial<Character>).consumableBuffs;const mastery=normalizeMastery({skills:progress.skills===undefined?c.skills:progress.skills,masteries:progress.masteries===undefined?c.masteries:progress.masteries,masteryExp:progress.masteryExp===undefined?c.masteryExp:progress.masteryExp,masteryVersion:progress.masteryVersion===undefined?c.masteryVersion:progress.masteryVersion});Object.assign(c,progress,mastery,this.inventories.has(id)?{}:{gold,potions},{lastPlayedAt:now()});return{...c};}
}
