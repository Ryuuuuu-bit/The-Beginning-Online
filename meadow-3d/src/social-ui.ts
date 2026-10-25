import {mountParty,type PartyState} from './party-ui';
import {titleDefinition} from '@the-beginning-online/shared';
import './social.css';

type Send = (message: unknown) => void;
interface ChatLine { titleId?:string|null; t: 'chat'; ch: 'map' | 'party' | 'whisper' | 'system' | 'loot'; from?: string; fromId?: string; to?: string; text: string; at: number; self?: boolean }

const CHANNEL_LABEL = { map: 'ทั่วไป', party: 'ปาร์ตี้', whisper: 'กระซิบ', system: 'ระบบ', loot: 'รางวัล' } as const;
const TABS = [['all', 'ทั้งหมด'], ['map', 'ทั่วไป'], ['party', 'ปาร์ตี้'], ['whisper', 'กระซิบ'], ['loot', 'รางวัล'], ['system', 'ระบบ']] as const;
type Tab = typeof TABS[number][0];
const HELP = 'คำสั่ง: /p ข้อความ (ปาร์ตี้) · /w ชื่อ ข้อความ (กระซิบ) · /r ข้อความ (ตอบกลับ) · /invite ชื่อ · /trade ชื่อ (แลกของ) · /leave · /kick ชื่อ · /lead ชื่อ';
const MAX_LINES = 80;

/** Chat box (Enter to type), party frame and invite prompts. Server is authoritative for filtering and limits. */
export function mountSocial(options: { send: Send; you: () => string; enabled: () => boolean; onOpen?:()=>void; /** GM announcements also go up on screen. */ announce?: (text: string) => void; /** Ask a player to trade. */ trade?: (name: string) => void }) {
	const ui = document.querySelector('#ui')!;
	const box = document.createElement('section');
	box.id = 'chat';
	box.setAttribute('aria-label', 'แชท');
	box.innerHTML = '<nav id="chat-tabs" role="tablist" aria-label="กรองแชท"></nav><ol id="chat-log" aria-live="polite"></ol><form id="chat-form" autocomplete="off"><button type="button" id="chat-channel" title="เปลี่ยนช่องแชท (Tab)"></button><input id="chat-input" maxlength="120" enterkeyhint="send" placeholder="Enter เพื่อพิมพ์ · /help"><button type="submit" id="chat-send" aria-label="ส่ง">➤</button></form>';
	const toggle = document.createElement('button');
	toggle.id = 'chat-toggle';
	toggle.type = 'button';
	toggle.setAttribute('aria-label', 'แชท');
	toggle.textContent = '💬';
	ui.append(box,toggle);
	const partyUI=mountParty({...options,chat:()=>{setChannel('party');open();},whisper:name=>{whisperTo=name;setChannel('whisper');open();}});
	const log = box.querySelector<HTMLOListElement>('#chat-log')!, form = box.querySelector<HTMLFormElement>('#chat-form')!;
	const input = box.querySelector<HTMLInputElement>('#chat-input')!, channelButton = box.querySelector<HTMLButtonElement>('#chat-channel')!;
	const tabs = box.querySelector<HTMLElement>('#chat-tabs')!;
	input.setAttribute('aria-label', 'ข้อความแชท');
	log.setAttribute('role', 'log');
	log.setAttribute('aria-label', 'ข้อความแชท');
	log.tabIndex = 0;
	const latest = document.createElement('button');
	latest.type = 'button'; latest.id = 'chat-latest'; latest.textContent = 'ข้อความใหม่ ↓'; latest.hidden = true;
	log.after(latest);
	const unread = {map: 0, party: 0, whisper: 0, system: 0, loot: 0};
	let filter: Tab = 'all';
	const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 12;
	const visible = (ch: ChatLine['ch']) => filter === 'all' || filter === ch;
	const isOpen = () => !matchMedia('(max-width:650px)').matches || box.classList.contains('open');
	function paintUnread() {
		for (const b of tabs.children as HTMLCollectionOf<HTMLElement>) {
			const key = b.dataset.tab as Tab, count = key === 'all' ? Object.values(unread).reduce((a,b)=>a+b,0) : unread[key];
			if (count) b.dataset.unread = String(Math.min(99,count)); else delete b.dataset.unread;
		}
		const total = unread.map + unread.party + unread.whisper;
		if (total) toggle.dataset.unread = String(Math.min(99,total)); else delete toggle.dataset.unread;
	}
	function markRead() {
		if (!isOpen() || !atBottom()) return;
		for (const ch of Object.keys(unread) as ChatLine['ch'][]) if (visible(ch)) unread[ch] = 0;
		latest.hidden = true; paintUnread();
	}
	latest.onclick = () => { log.scrollTop = log.scrollHeight; markRead(); };
	log.addEventListener('scroll', markRead);
	try { const saved = localStorage.getItem('chat-filter'); if (TABS.some(([k]) => k === saved)) filter = saved as Tab; } catch { /* storage blocked */ }
	const setFilter = (next: Tab) => {
		filter = next;
		log.dataset.filter = next;
		for (const b of tabs.children as HTMLCollectionOf<HTMLElement>) { const selected = b.dataset.tab === next; b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1; }
		log.scrollTop = log.scrollHeight;
		markRead();
		try { localStorage.setItem('chat-filter', next); } catch { /* storage blocked */ }
	};
	for (const [key, label] of TABS) {
		const b = document.createElement('button');
		b.type = 'button';
		b.role = 'tab';
		b.dataset.tab = key;
		b.setAttribute('aria-controls', 'chat-log');
		b.textContent = label;
		b.onclick = () => setFilter(key);
		b.onkeydown = e => {
			const index = TABS.findIndex(([k]) => k === key);
			const next = e.key === 'ArrowRight' ? (index+1)%TABS.length : e.key === 'ArrowLeft' ? (index+TABS.length-1)%TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length-1 : -1;
			if (next < 0) return;
			e.preventDefault(); setFilter(TABS[next][0]); (tabs.children[next] as HTMLElement).focus();
		};
		tabs.append(b);
	}
	setFilter(filter);
	let lastLoot: { li: HTMLLIElement; xp: number; gold: number; at: number } | null = null;
	let lastItems: { li: HTMLLIElement; items: Map<string, number>; at: number } | null = null;
	const recentNotes = new Map<string, number>();
	let channel: 'map' | 'party' | 'whisper' = 'map', whisperTo = '', lastWhisper = '', party: PartyState | null = null;

	const setChannel = (next: typeof channel, reveal = true) => {
		channel = next;
		channelButton.textContent = next === 'whisper' && whisperTo ? `กระซิบ ${whisperTo}` : CHANNEL_LABEL[next];
		channelButton.dataset.ch = next;
		if (reveal && !visible(next)) setFilter(next);
	};
	setChannel('map',false);
	/** Actions on a player named in chat: whisper, party invite, trade. */
	const menu = document.createElement('div');
	menu.className = 'chat-player-menu';
	menu.hidden = true;
	box.append(menu);
	document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target as Node)) menu.hidden = true; });
	function playerMenu(name: string, anchor: HTMLElement) {
		const item = (text: string, run: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = () => { menu.hidden = true; run(); }; return b; };
		const title = document.createElement('strong');
		title.textContent = name;
		menu.replaceChildren(title,
			item('กระซิบ', () => { whisperTo = name; setChannel('whisper'); open(); }),
			item('เชิญปาร์ตี้', () => options.send({ t: 'party', op: 'invite', name })),
			...(options.trade ? [item('แลกของ', () => options.trade!(name))] : []));
		menu.style.left = anchor.offsetLeft + 'px';
		menu.style.top = Math.max(0, anchor.offsetTop - log.scrollTop) + 'px';
		menu.hidden = false;
	}
	const line = (m: ChatLine, history = false) => {
		const follow = atBottom(), scrollTop = log.scrollTop;
		const li = document.createElement('li');
		li.dataset.ch = m.ch;
		li.dataset.message = JSON.stringify([m.ch,m.fromId,m.from,m.to,m.at,m.text]);
		if (m.ch === 'party' || m.ch === 'whisper') {
			const tag = document.createElement('span');
			tag.className = 'chat-tag';
			tag.textContent = `[${CHANNEL_LABEL[m.ch]}]`;
			li.append(tag);
		} else if (!m.from) {
			const mark = document.createElement('span');
			mark.className = 'chat-mark';
			mark.textContent = m.ch === 'loot' ? '◆' : '·';
			li.append(mark);
		}
        const title=titleDefinition(m.titleId);if(title){const badge=document.createElement('span');badge.className='chat-title';badge.textContent=title.name;badge.style.color=title.color;li.append(badge);}
		if (m.from) {
			const who = document.createElement('button');
			who.type = 'button';
			who.className = 'chat-name';
			who.textContent = m.ch === 'whisper' ? (m.self ? `ถึง ${m.to}` : `จาก ${m.from}`) : m.from;
			const name = m.ch === 'whisper' && m.self ? m.to! : m.from;
			who.title = `กระซิบหา ${name}`;
			who.onclick = (e) => { if (m.self && m.ch !== 'whisper') return; playerMenu(name, e.currentTarget as HTMLElement); };
			li.append(who, document.createTextNode(': '));
		}
		const body = document.createElement('span');
		body.className = 'chat-text';
		body.textContent = m.text;
		li.append(body);
		log.append(li);
		let removedHeight = 0;
		while (log.children.length > MAX_LINES) { removedHeight += (log.firstElementChild as HTMLElement).offsetHeight; log.firstElementChild!.remove(); }
		log.scrollTop = follow ? log.scrollHeight : Math.max(0,scrollTop-removedHeight);
		if (!history && !m.self && m.fromId !== options.you() && (!isOpen() || !visible(m.ch) || !follow)) {
			unread[m.ch]++; paintUnread();
		}
		if (!follow && visible(m.ch)) latest.hidden = false;
		box.classList.add('recent');
		clearTimeout((box as any).fade);
		(box as any).fade = setTimeout(() => box.classList.remove('recent'), 8000);
		return li;
	};
	const system = (text: string) => line({ t: 'chat', ch: 'system', text, at: Date.now() });
	const error = (text: string) => { if (!visible('system')) setFilter('all'); system(text); return false; };
	const lootText = (xp: number, gold: number) => `ได้รับ ${xp.toLocaleString()} EXP · ◈ ${gold.toLocaleString()} ทอง`;
	const itemsText = (items: Map<string, number>) => `เก็บได้ ${[...items].map(([name, qty]) => `${name} ×${qty}`).join(' · ')}`;
	const bump = (li: HTMLLIElement) => { li.classList.remove('bump'); void li.offsetWidth; li.classList.add('bump'); box.classList.add('recent'); clearTimeout((box as any).fade); (box as any).fade = setTimeout(() => box.classList.remove('recent'), 8000); };
	const open = () => {
		if (!options.enabled()) return;
		const wasHidden = !isOpen();
		box.classList.add('open', 'typing');
		if (wasHidden) log.scrollTop = log.scrollHeight;
		markRead();
		input.focus();
	};
	const close = () => { box.classList.remove('typing'); input.blur(); if (matchMedia('(max-width:650px)').matches) box.classList.remove('open'); };

	function submit(raw: string) {
		if (!options.enabled()) return false;
		const text = raw.trim();
		if (!text) return false;
		const [cmd, ...rest] = text.split(/\s+/);
		const arg = rest.join(' ').trim();
		const sendChat = (ch: typeof channel, text: string, to?: string) => {
			if (ch === 'party' && !party) return error('คุณยังไม่ได้อยู่ในปาร์ตี้');
			if (ch === 'whisper' && !to) return error('ใช้ /w ชื่อ ข้อความ');
			if (!visible(ch)) setFilter(ch);
			options.send({t:'chat',ch,text,...(ch === 'whisper' ? {to} : {})});
		};
		switch (cmd.toLowerCase()) {
			case '/help': if (!visible('system')) setFilter('all'); system(HELP); return;
			case '/p': if (arg) return sendChat('party',arg); if (!party) return error('คุณยังไม่ได้อยู่ในปาร์ตี้'); setChannel('party'); return;
			case '/m': case '/g': if (arg) return sendChat('map',arg); setChannel('map'); return;
			case '/w': {
				const [to, ...msg] = rest;
				if (!to) return error('ใช้ /w ชื่อ ข้อความ');
				whisperTo = to;
				if (msg.length) return sendChat('whisper',msg.join(' '),to);
				else setChannel('whisper');
				return;
			}
			case '/r': if (!lastWhisper) return error('ยังไม่มีใครกระซิบหาคุณ'); if (arg) return sendChat('whisper',arg,lastWhisper); whisperTo = lastWhisper; setChannel('whisper'); return;
			case '/invite': if (arg) options.send({ t: 'party', op: 'invite', name: arg }); else system('ใช้ /invite ชื่อ'); return;
			case '/trade': if (arg && options.trade) options.trade(arg); else system('ใช้ /trade ชื่อ'); return;
			case '/leave': options.send({ t: 'party', op: 'leave' }); return;
			case '/kick': if (arg) options.send({ t: 'party', op: 'kick', name: arg }); return;
			case '/lead': if (arg) options.send({ t: 'party', op: 'lead', name: arg }); return;
		}
		// Any other command is the server's to answer (it never broadcasts it); players just get "unknown command".
		if (text.startsWith('/')) { options.send({ t: 'chat', ch: 'map', text }); return; }
		return sendChat(channel,text,whisperTo);
	}
	let composing = false;
	input.addEventListener('compositionstart', () => { composing = true; });
	input.addEventListener('compositionend', () => { composing = false; });
	form.onsubmit = e => { e.preventDefault(); if (composing || submit(input.value) === false) return; input.value = ''; close(); };
	input.addEventListener('keydown', e => {
		if (e.isComposing || composing || e.keyCode === 229) return;
		if (e.key === 'Escape') { e.preventDefault(); input.value = ''; close(); }
	});
	channelButton.title = 'เปลี่ยนช่องแชท';
	channelButton.onclick = () => { setChannel(channel === 'map' ? (party ? 'party' : whisperTo ? 'whisper' : 'map') : channel === 'party' && whisperTo ? 'whisper' : 'map'); input.focus(); };
	input.addEventListener('focus', () => { box.classList.add('open', 'typing'); markRead(); });
	box.addEventListener('focusin', () => options.onOpen?.());
	box.addEventListener('keydown', e => e.stopPropagation());
	box.addEventListener('focusout', e => { if (box.contains(e.relatedTarget as Node)) return; box.classList.remove('typing'); if (!matchMedia('(max-width:650px)').matches) box.classList.remove('open'); });
	toggle.onclick = () => { if (box.classList.contains('open')) { box.classList.remove('open', 'typing'); input.blur(); } else open(); };
	// Enter opens chat unless the player is already typing somewhere or a dialog is open.
	window.addEventListener('keydown', e => {
		if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
		const target = e.target as HTMLElement | null;
		if (target?.matches?.('input,textarea,select,button,[role="button"]') || target?.isContentEditable || document.querySelector('dialog[open]')) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		open();
	}, true);

	/** Own-HUD only: other players never see it. */
	function gmBadge(on: boolean) {
		let badge = document.querySelector<HTMLElement>('#gm-badge');
		if (on && !badge) {
			badge = document.createElement('b');
			badge.id = 'gm-badge';
			badge.textContent = 'GM';
			badge.title = 'บัญชีแอดมิน · พิมพ์ /gm help';
			document.querySelector('#player-name')?.after(badge);
		}
		if (badge) badge.hidden = !on;
	}


	return {
		/** Feed every server message; returns true when it was a social message. */
		receive(m: any) {
			const handled=partyUI.receive(m);
			if(m.t==='partyState'){party=m.party;if(!party&&channel==='party')setChannel('map');return true;}
			if(handled)return true;
			if (m.t === 'chat') { if (m.ch === 'whisper' && !m.self) lastWhisper = m.from; line(m); if (m.ch === 'system' && !m.from && m.text.startsWith('📢')) options.announce?.(m.text); return true; }
			if (m.t === 'chatHistory') { const seen = new Set([...log.children].map(li => (li as HTMLElement).dataset.message)); for (const h of m.list) { const key = JSON.stringify([h.ch,h.fromId,h.from,h.to,h.at,h.text]); if (!seen.has(key)) { line(h,true); seen.add(key); } } return true; }
			if (m.t === 'chatError') { error(m.text); return true; }
			if (m.t === 'gmRole') { gmBadge(!!m.admin); return true; }
			return false;
		},
		/** EXP/gold from a kill; bursts within a few seconds merge into one line. */
		loot(xp: number, gold: number) {
			const now = Date.now();
			if (lastLoot && now - lastLoot.at < 6000 && log.lastElementChild === lastLoot.li) {
				const follow = atBottom();
				lastLoot.xp += xp; lastLoot.gold += gold; lastLoot.at = now;
				lastLoot.li.querySelector('.chat-text')!.textContent = lootText(lastLoot.xp, lastLoot.gold);
				if (follow) log.scrollTop = log.scrollHeight;
				lastLoot.li.classList.remove('bump'); void lastLoot.li.offsetWidth; lastLoot.li.classList.add('bump');
				box.classList.add('recent'); clearTimeout((box as any).fade); (box as any).fade = setTimeout(() => box.classList.remove('recent'), 8000);
				return;
			}
			const li = line({ t: 'chat', ch: 'loot', text: lootText(xp, gold), at: now });
			lastLoot = { li, xp, gold, at: now };
		},
		/** Items picked up; pickups within a few seconds merge into one line, adding up repeats. */
		items(list: { name: string; qty: number }[]) {
			if (!list.length) return;
			const now = Date.now();
			if (lastItems && now - lastItems.at < 6000 && log.lastElementChild === lastItems.li) {
				const follow = atBottom();
				for (const { name, qty } of list) lastItems.items.set(name, (lastItems.items.get(name) ?? 0) + qty);
				lastItems.at = now;
				lastItems.li.querySelector('.chat-text')!.textContent = itemsText(lastItems.items);
				if (follow) log.scrollTop = log.scrollHeight;
				bump(lastItems.li);
				return;
			}
			const items = new Map<string, number>();
			for (const { name, qty } of list) items.set(name, (items.get(name) ?? 0) + qty);
			lastItems = { li: line({ t: 'chat', ch: 'loot', text: itemsText(items), at: now }), items, at: now };
		},
		/** A game notice kept in the log: rewards and progress under รางวัล, the rest under ระบบ. Repeats within 5 s are dropped. */
		note(ch: 'system' | 'loot', text: string) {
			const now = Date.now();
			if (now - (recentNotes.get(text) ?? 0) < 5000) return;
			recentNotes.set(text, now);
			for (const [k, at] of recentNotes) if (now - at > 5000) recentNotes.delete(k);
			line({ t: 'chat', ch, text, at: now });
		},
		/** Invite from elsewhere in the UI (e.g. clicking another player). */
		invite(name: string) { partyUI.invite(name); },
		openParty:partyUI.open,
        get allyTarget(){return partyUI.allyTarget;},
		get typing() { return document.activeElement === input; },
	};
}
