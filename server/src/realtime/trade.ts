import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { emptyOffer, offerProblem, TRADE_KEEP_RANGE, TRADE_START_RANGE, type GameData, type Player, type TradeOffer } from "@the-beginning-online/shared";
import type { Store } from "../store/types.js";

/** The parts of a realtime peer and room that trading needs. */
export interface TradePeer {
	ws: WebSocket;
	id: string;
	accountId: string;
	ready: boolean;
	leaseOwner?: string;
	busy?: number;
	room: { key: string; saveQueue: Promise<unknown>; game: { mapId: string; players: Map<string, Player> } };
}
interface Trade {
	id: string;
	a: string;
	b: string;
	offers: Map<string, TradeOffer>;
	locked: Set<string>;
	confirmed: Set<string>;
	/** Set while the swap is being written; every change is refused until it settles. */
	settling: boolean;
}
interface Options<P extends TradePeer> {
	live: Map<string, P>;
	send: (ws: WebSocket, body: unknown) => void;
	store: Pick<Store, "trade">;
	data: GameData;
	/** Applies a settled inventory to the live player and tells the client (inv, stats). */
	settled: (peer: P, player: Player, result: { inventory: Player["inventory"]; gold: number;boundGold?:number }) => void;
	now?: () => number;
}
const INVITE_MS = 30000;

/** Player-to-player trades: invite → both place items/gold → both lock → both confirm → one atomic swap. */
export function createTrades<P extends TradePeer>(options: Options<P>) {
	const { live, send, store, data } = options, now = options.now ?? Date.now;
	const trades = new Map<string, Trade>(), tradeOf = new Map<string, string>();
	const invites = new Map<string, { from: string; until: number }>(); // target id -> inviter
	const player = (peer: P) => peer.room.game.players.get(peer.id);
	const error = (peer: P, text: string) => send(peer.ws, { t: "tradeError", text });
	const note = (peer: P, text: string) => send(peer.ws, { t: "chat", ch: "system", text, at: now() });
	const near = (a: P, b: P, range: number) => {
		const pa = player(a), pb = player(b);
		return !!pa && !!pb && a.room === b.room && !pa.dead && !pb.dead && Math.hypot(pa.x - pb.x, pa.z - pb.z) <= range;
	};
	const byName = (name: string) => {
		const key = name.normalize("NFC").toLocaleLowerCase("en-US");
		return [...live.values()].find((p) => p.ready && player(p)?.name.toLocaleLowerCase("en-US") === key);
	};
	const side = (t: Trade, id: string) => {
		const peer = live.get(id), p = peer && player(peer), offer = t.offers.get(id)!;
		return {
			name: p?.name ?? "ผู้เล่น",
			gold: offer.gold,
			locked: t.locked.has(id),
			confirmed: t.confirmed.has(id),
			// What the other side sees: template, amount and upgrades, so a +7 sword is not mistaken for a +0 one.
			items: offer.items.map((o) => {
				const item = p?.inventory?.items.find((i) => i.id === o.id);
				return { id: o.id, template: item?.template ?? "", qty: o.qty, refine: item?.refine ?? 0, cards: item?.cards ?? [], ...(item?.roll?{roll:item.roll}:{}) };
			}),
		};
	};
	function broadcast(t: Trade) {
		for (const [me, them] of [[t.a, t.b], [t.b, t.a]]) {
			const peer = live.get(me);
			if (peer) send(peer.ws, { t: "tradeState", trade: { id: t.id, settling: t.settling, you: side(t, me), them: side(t, them) } });
		}
	}
	function close(t: Trade, reason: string, done = false) {
		trades.delete(t.id);
		tradeOf.delete(t.a);
		tradeOf.delete(t.b);
		for (const id of [t.a, t.b]) {
			const peer = live.get(id);
			if (peer) send(peer.ws, { t: "tradeClosed", id: t.id, reason, done });
		}
	}
	const current = (peer: P) => {
		const id = tradeOf.get(peer.id);
		return id ? trades.get(id) : undefined;
	};

	function execute(t: Trade) {
		const pa = live.get(t.a), pb = live.get(t.b);
		if (!pa || !pb || !near(pa, pb, TRADE_KEEP_RANGE)) { close(t, "อยู่ห่างกันเกินไป การแลกถูกยกเลิก"); return; }
		const a = player(pa)!, b = player(pb)!;
		t.settling = true;
		broadcast(t);
		pa.busy = (pa.busy || 0) + 1;
		pb.busy = (pb.busy || 0) + 1;
		const room = pa.room;
		const operation = room.saveQueue.then(async () => {
			const result = await store.trade(
				{ accountId: pa.accountId, id: a.id, offer: structuredClone(t.offers.get(a.id)!), profile: structuredClone(a.profile) },
				{ accountId: pb.accountId, id: b.id, offer: structuredClone(t.offers.get(b.id)!), profile: structuredClone(b.profile) },
				{ tradeId: randomUUID(), leaseOwner: pa.leaseOwner === pb.leaseOwner ? pa.leaseOwner : undefined },
			);
			options.settled(pa, a, result.a);
			options.settled(pb, b, result.b);
			if (result.error) {
				const who = result.side === undefined ? "" : result.side === 0 ? `ของ ${a.name} ` : `ของ ${b.name} `;
				const text = result.error.startsWith("กระเป๋า") || result.error.startsWith("น้ำหนัก") ? result.error.replace(/^(กระเป๋า|น้ำหนัก)/, `$1${who}`) : result.error;
				for (const peer of [pa, pb]) error(peer, `แลกไม่สำเร็จ: ${text}`);
				// Stay open: the players can change their offers and try again.
				t.settling = false;
				t.locked.clear();
				t.confirmed.clear();
				if (trades.get(t.id) === t) broadcast(t);
				return;
			}
			close(t, "แลกของสำเร็จ", true);
			note(pa, `✦ แลกของกับ ${b.name} สำเร็จ`);
			note(pb, `✦ แลกของกับ ${a.name} สำเร็จ`);
		});
		room.saveQueue = operation
			.catch((e) => {
				console.error("Trade failed", e);
				if (trades.get(t.id) === t) close(t, "แลกไม่สำเร็จ กรุณาลองใหม่");
			})
			.finally(() => {
				pa.busy = Math.max(0, (pa.busy || 1) - 1);
				pb.busy = Math.max(0, (pb.busy || 1) - 1);
			});
	}

	return {
		handle(peer: P, m: { op: string; name?: string; id?: string; items?: { id: string; qty: number }[]; gold?: number }) {
			const me = player(peer);
			if (!me) return;
			if (m.op === "request") {
				const target = m.name ? byName(m.name) : undefined;
				if (!target || target === peer) { error(peer, "ไม่พบผู้เล่นคนนี้ในแมพ"); return; }
				if (current(peer)) { error(peer, "กำลังแลกของอยู่"); return; }
				if (tradeOf.has(target.id)) { error(peer, `${player(target)!.name} กำลังแลกของกับคนอื่นอยู่`); return; }
				if (!near(peer, target, TRADE_START_RANGE)) { error(peer, "ต้องยืนใกล้กันก่อนจึงจะแลกของได้"); return; }
				invites.set(target.id, { from: peer.id, until: now() + INVITE_MS });
				send(target.ws, { t: "tradeInvite", from: me.name });
				note(peer, `ส่งคำขอแลกของถึง ${player(target)!.name} แล้ว`);
				return;
			}
			if (m.op === "accept" || m.op === "decline") {
				const invite = invites.get(peer.id);
				invites.delete(peer.id);
				const from = invite && invite.until > now() ? live.get(invite.from) : undefined;
				if (!from) { error(peer, "คำขอแลกของหมดอายุแล้ว"); return; }
				if (m.op === "decline") { note(from, `${me.name} ปฏิเสธการแลกของ`); return; }
				if (current(peer) || tradeOf.has(from.id)) { error(peer, "อีกฝ่ายกำลังแลกของกับคนอื่นอยู่"); return; }
				if (!near(peer, from, TRADE_START_RANGE)) { error(peer, "ต้องยืนใกล้กันก่อนจึงจะแลกของได้"); return; }
				const t: Trade = { id: randomUUID(), a: from.id, b: peer.id, offers: new Map([[from.id, emptyOffer()], [peer.id, emptyOffer()]]), locked: new Set(), confirmed: new Set(), settling: false };
				trades.set(t.id, t);
				tradeOf.set(t.a, t.id);
				tradeOf.set(t.b, t.id);
				broadcast(t);
				return;
			}
			const t = current(peer);
			if (!t) { error(peer, "ยังไม่ได้แลกของกับใคร"); return; }
			if (m.op === "cancel") { close(t, `${me.name} ยกเลิกการแลก`); return; }
			if (t.settling) { error(peer, "กำลังบันทึกการแลก กรุณารอสักครู่"); return; }
			if (m.op === "offer") {
				if (t.locked.has(peer.id)) { error(peer, "ล็อกแล้ว แก้ของไม่ได้"); return; }
				const offer: TradeOffer = { items: m.items ?? [], gold: m.gold ?? 0 };
				const problem = offerProblem({ gold: me.gold, boundGold:me.boundGold, inventory: me.inventory! }, offer, data);
				if (problem) { error(peer, problem); return; }
				t.offers.set(peer.id, offer);
				// Any change unlocks both sides, so nobody confirms an offer they have not seen.
				t.locked.clear();
				t.confirmed.clear();
				broadcast(t);
				return;
			}
			if (m.op === "lock") { t.locked.add(peer.id); broadcast(t); return; }
			if (m.op === "confirm") {
				if (t.locked.size < 2) { error(peer, "รอให้ทั้งสองฝ่ายล็อกก่อน"); return; }
				t.confirmed.add(peer.id);
				if (t.confirmed.size === 2) execute(t);
				else broadcast(t);
			}
		},
		/** Disconnects and map changes end the player's trade. */
		leave(id: string, reason = "อีกฝ่ายออกจากการแลก") {
			invites.delete(id);
			const tid = tradeOf.get(id), t = tid ? trades.get(tid) : undefined;
			if (t && !t.settling) close(t, reason);
		},
		/** Cancels trades whose players walked apart and drops expired invites. */
		tick() {
			const time = now();
			for (const [id, invite] of invites) if (invite.until <= time) invites.delete(id);
			for (const t of [...trades.values()]) {
				const a = live.get(t.a), b = live.get(t.b);
				if (!t.settling && (!a || !b || !near(a, b, TRADE_KEEP_RANGE))) close(t, "อยู่ห่างกันเกินไป การแลกถูกยกเลิก");
			}
		},
		trading: (id: string) => tradeOf.has(id),
	};
}
