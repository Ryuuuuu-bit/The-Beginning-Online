import {randomInt} from 'node:crypto';
import type {EconomyStore as importEconomyStore} from './economy.js';
import type {Stat,JobProgress} from '@the-beginning-online/shared';
/** `uid`: short public id (9 digits) shown to players; immutable, never derived from email/Google. `id` stays the internal UUID. */
export interface Account {id:string;uid:string;kind:'guest'|'google'|'password';googleSub?:string;username?:string;usernameKey?:string;passwordHash?:string;displayName:string;createdAt:string;lastLoginAt:string;guestKeyHash?:string;/** Stored admin role (migration 016). Check it through admin.ts, never directly. */isAdmin?:boolean}
export interface PasswordIdentity {username:string;usernameKey:string;passwordHash:string}
export interface Session {id:string;accountId:string;tokenHash:string;expiresAt:string;createdAt:string;userAgent:string;selectedCharacterId?:string}
export interface Character extends Partial<JobProgress> {claimedLevelRewards?:number[];gender?:'male'|'female';titleId?:string|null;unlockedTitles?:string[];titleRecords?:import('@the-beginning-online/shared').TitleRecords;bossCooldowns?:Record<string,number>;quests?:import('@the-beginning-online/shared').QuestState;bossReadyAt?:number;autoSeconds?:number;mapId?:import("@the-beginning-online/shared").MapId;healerReadyAt?:number;returnReadyAt?:number;audioSettings?:import("@the-beginning-online/shared").AudioSettings;autoPotion?:import("@the-beginning-online/shared").AutoPotion;jobsVersion?:number;autoAllocate?:boolean;autoAllocCursor?:number;baseStats:Record<Stat,number>;race:string;classId:string;statPoints:number;dataVersion:number;id:string;accountId:string;name:string;nameKey:string;level:number;xp:number;gold:number;kills:number;potions:number;posX?:number;posZ?:number;createdAt:string;lastPlayedAt:string;deletedAt?:string}
export type Progress=Pick<Character,'titleId'|'unlockedTitles'|'titleRecords'|'level'|'xp'|'gold'|'kills'|'potions'|'posX'|'posZ'|'baseStats'|'race'|'classId'|'statPoints'|'dataVersion'|'autoAllocate'|'autoAllocCursor'|'jobId'|'jobLevel'|'jobExp'|'skillPoints'|'skills'|'hotbar'|'jobsVersion'|'masteries'|'masteryExp'|'masteryVersion'|'audioSettings'|'autoPotion'|'mapId'|'healerReadyAt'|'autoSeconds'|'returnReadyAt'|'bossReadyAt'|'quests'|'bossCooldowns'>;
export interface GoogleIdentity {sub:string;name:string}
/** One GM action: who did it (account + public uid), what, to whom, when. */
export interface AuditEntry {at?:string;actorAccountId?:string;actorUid?:string;action:string;targetUid?:string;detail?:Record<string,unknown>}
/** Accounts seeded as admin once (migration 016); a later revoke is not undone on the next boot. */
export const ADMIN_SEED_UIDS=['269718289'];
export interface Store extends importEconomyStore {
 rankingCharacters():Promise<import('@the-beginning-online/shared').RankingCharacter[]>;
 health():Promise<void>;
 pruneRequests():Promise<void>;
 claimLease(id:string,owner:string):Promise<void>;
 renewLease(id:string,owner:string):Promise<boolean>;
 releaseLease(id:string,owner:string):Promise<void>;
 uiSettings(accountId:string):Promise<import('@the-beginning-online/shared').UISettings>;
 saveUISettings(accountId:string,settings:import('@the-beginning-online/shared').UISettings):Promise<void>;
 init():Promise<void>;close():Promise<void>;
 createGuest(guestKeyHash:string):Promise<Account>;resumeGuest(hash:string):Promise<Account|undefined>;google(identity:GoogleIdentity,guestId?:string):Promise<Account>;account(id:string):Promise<Account|undefined>;
 /** Creates a password account, or converts guest `guestId` in place (keeping characters, uid; revoking its sessions). 409 USERNAME_TAKEN. */
 registerPassword(identity:PasswordIdentity,guestId?:string):Promise<Account>;
 /** Looks up by case-folded username; includes passwordHash. Bumps nothing. */
 passwordAccount(usernameKey:string):Promise<Account|undefined>;
 loggedIn(accountId:string):Promise<void>;
 /** Replaces the hash and revokes every session of the account. */
 changePassword(accountId:string,passwordHash:string):Promise<void>;
 accountByUid(uid:string):Promise<Account|undefined>;
 /** Accounts with the stored admin role, oldest first. */
 adminAccounts():Promise<Account[]>;
 /** Grants/revokes the stored admin role by public uid and audits it atomically. 404 NOT_FOUND; 409 LAST_ADMIN when revoking the last stored admin. */
 setAdmin(targetUid:string,admin:boolean,actor:{accountId:string;uid:string}):Promise<{account:Account;changed:boolean}>;
 audit(entry:AuditEntry):Promise<void>;
 /** Newest first. */
 auditLog(limit?:number):Promise<AuditEntry[]>;
 createSession(session:Session):Promise<void>;session(hash:string):Promise<Session|undefined>;revoke(hash:string):Promise<void>;select(sessionId:string,characterId:string):Promise<void>;
 characters(accountId:string):Promise<Character[]>;character(accountId:string,id:string):Promise<Character|undefined>;createCharacter(accountId:string,name:string,nameKey:string,jobId?:string,gender?:'male'|'female'):Promise<Character>;chooseJob(accountId:string,id:string,jobId:string):Promise<Character>;deleteCharacter(accountId:string,id:string):Promise<void>;saveProgress(accountId:string,id:string,body:Progress,leaseOwner?:string):Promise<Character>;
}
export const publicAccount=({guestKeyHash,googleSub,passwordHash,usernameKey,isAdmin,...safe}:Account)=>safe;
export const newUid=()=>String(randomInt(100000000,1000000000));
