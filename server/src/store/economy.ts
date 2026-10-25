import {
	applyInventory,
	starterInventory,
	loadGameData,
	type Inventory,
	type InventoryOp,
	type CharacterInput,
	type LedgerEntry,
	type TradeOffer,
	applyTrade,
	validateRewardLevels,consumableBuffKey,extendConsumableBuff,type ConsumableBuffs,
} from "@the-beginning-online/shared";
import { randomUUID } from "node:crypto";
import type { Character, Progress } from './types.js';
export type QuestProgress = Pick<Progress, 'level' | 'xp' | 'jobLevel' | 'jobExp' | 'skillPoints' | 'statPoints' | 'baseStats' | 'autoAllocCursor' | 'quests'>;
export interface EconomyResult {
	claimedLevelRewards?: number[];legacyLevelRewards?:number[];consumableBuffs?:ConsumableBuffs;
	inventory: Inventory;
	gold: number;
	effect?: { kind: string; amount: number; duration?:number };
	error?: string;
	duplicate?: boolean;
}
export interface EconomyContext {
	/** Server-staged quest completion, committed with its rewards under the character lock. */
	quest?: { id: string; acceptedAt: number; progress: QuestProgress };
	leaseOwner?:string;bossLoot?:boolean|string;profile: CharacterInput;
	room?: string;
	tick?: number;
}
export interface IntegrityResult {
	ok: boolean;
	issues: string[];
}
export interface EconomyStore {
	economyReport(days:1|7):Promise<import('../economy-report.js').EconomyReport>;
	inventory(accountId: string, id: string): Promise<EconomyResult>;
	inventoryOp(
		accountId: string,
		id: string,
		req: string,
		op: InventoryOp,
		context: EconomyContext,
	): Promise<EconomyResult>;
	integrity(): Promise<IntegrityResult>;
	/**
	 * Swaps two characters' trade offers in one transaction (both locked in id order, both leases checked).
	 * On a rule error nothing changes and `error` (Thai) says why; `side` 0/1 names the party it is about.
	 */
	trade(a: TradeParty, b: TradeParty, context: { tradeId: string; leaseOwner?: string }): Promise<TradeResult>;
}
export interface TradeParty { accountId: string; id: string; offer: TradeOffer; profile: CharacterInput }
export interface TradeResult { a: EconomyResult; b: EconomyResult; error?: string; side?: number }
export const economyData = loadGameData();
export function levelRewardClaims(character:Character,op:InventoryOp){
 if(op.op!=='levelReward')return;
 const levels=validateRewardLevels(op.levels,character.level,economyData.stats.maxLevel),claimed=character.upgradedLevelRewards??[];
 if(levels.some(level=>claimed.includes(level)))throw Error('รับรางวัลเลเวลนี้แล้ว');
 return [...claimed,...levels].sort((a,b)=>a-b);
}
export function consumedBuffs(character:Character,op:InventoryOp,inv:Inventory,now=Date.now()){
 if(op.op!=='use')return;
 const item=inv.items.find(i=>i.id===op.id),template=economyData.items.items.find(t=>t.id===item?.template),key=consumableBuffKey(template?.effect??'');
 if(!key)return;
 return extendConsumableBuff(character.consumableBuffs,key,template!.amount!,template!.duration??3600,now);
}
export { applyInventory, starterInventory, randomUUID, applyTrade };
export type { Inventory, InventoryOp, LedgerEntry };
export function questProgress(character: Character, context: EconomyContext): QuestProgress | undefined {
	const quest = context.quest;
	if (!quest) return;
	if (character.quests?.active[quest.id]?.at !== quest.acceptedAt ||
		!quest.progress.quests?.done[quest.id] || quest.progress.quests.active[quest.id])
		throw Error('Quest turn-in is no longer active');
	return structuredClone(quest.progress);
}
export function checkRequest(req: string) {
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			req,
		)
	)
		throw Error("Invalid request UUID");
}
export function alertIntegrity(issues: string[]): IntegrityResult {
	if (issues.length) console.error("ECONOMY_ALERT", JSON.stringify(issues));
	return { ok: !issues.length, issues };
}
