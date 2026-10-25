import { loadGameData, questStatus, questResetAt, objectiveProgress, questsFor, emptyQuests, type QuestState, type QuestGiver, type Inventory } from '@the-beginning-online/shared';
import './npc-dialog.css';
import './quest.css';
import { itemIcon } from './item-icon';
import { questDestination, type QuestDestination } from './quest-navigation';
import { MAP_INFO, type MapId } from '@the-beginning-online/shared/maps';

const data = loadGameData();
export const GIVER_NAME: Record<QuestGiver, string> = { guard: 'หัวหน้าทหารประตู', heal: 'นักบวชหมอ', forge: 'ช่างตีเหล็ก', market: 'พ่อค้าเบ็ดเตล็ด', storage: 'คนเฝ้าคลัง' };
const itemName = (id: string) => data.items.items.find(i => i.id === id)?.nameTh ?? id;
const isGiver = (kind: string): kind is QuestGiver => kind in GIVER_NAME;
interface PlayerView { level: number; x: number; z: number; inventory?: Inventory }

/** NPC quest dialogs and the journal tracker. The server validates every accept/turn-in. */
export function mountQuests(options: { send: (m: unknown) => void; player: () => PlayerView; map: () => MapId; navigate: (point: QuestDestination) => void; notice: (text: string, chat?: 'system' | 'loot') => void }) {
	let state: QuestState = emptyQuests(), ready = new Set<string>(), openGiver: QuestGiver | null = null, onChange: (() => void) | null = null;
	let submittedFocus: HTMLButtonElement | null = null;
	let category: 'story'|'daily'|'weekly' = 'story';
	const tracker = document.createElement('ol');
	tracker.id = 'quest-tracker';
	document.querySelector('#ui .quest')?.append(tracker);

	const rewardText = (q: (typeof data.quests.quests)[number]) =>
		[q.rewards.exp && `ประสบการณ์ ${q.rewards.exp}`, q.rewards.jobExp && `อาชีพ ${q.rewards.jobExp}`, q.rewards.gold && `${q.rewards.gold} ${q.id==='storage_ledger'?'ทองแจก (โอนไม่ได้)':'ทอง'}`, q.objectives.some(o=>o.kind==='collect')&&'ถ้าใช้ของผูกตัวส่งภารกิจ ทองรางวัลจะโอนไม่ได้', ...q.rewards.items.map(i => `${itemName(i.template)} ×${i.qty}`)].filter(Boolean).join(' · ');

	function renderTracker() {
		const p = options.player();
		tracker.replaceChildren();
		for (const id of Object.keys(state.active)) {
			const q = data.quests.quests.find(q => q.id === id);
			if (!q) continue;
			const li = document.createElement('li');
			const progress = objectiveProgress(q, state, p.inventory);
			const done = progress.every((n, i) => n >= q.objectives[i].count);
			li.classList.toggle('ready', done);
			const title = document.createElement('b');
			title.textContent = q.nameTh;
			li.append(title);
			if (done) {
				const s = document.createElement('small');
				s.textContent = `✓ กลับไปส่งที่${GIVER_NAME[q.giver]}`;
				li.append(s);
			} else
				q.objectives.forEach((o, i) => {
					const s = document.createElement('small');
					s.textContent = `${o.label} ${progress[i]} / ${o.count}`;
					li.append(s);
				});
			const destination=questDestination(data,q,progress,options.map(),p);
			if(destination){const go=document.createElement('button');go.type='button';go.className='quest-navigate';go.textContent=done?'↗ นำทางไปส่งเควสต์':'↗ นำทางไปเป้าหมาย';go.title=`${destination.name} · ${MAP_INFO[destination.map].name}`;go.onclick=()=>options.navigate(destination);li.append(go);}
			tracker.append(li);
		}
		tracker.hidden = !tracker.children.length;
	}
	function checkReady() {
		const p = options.player();
		for (const id of Object.keys(state.active)) {
			const q = data.quests.quests.find(q => q.id === id)!;
			const isReady = questStatus(q, state, p.level, Date.now(), p.inventory) === 'ready';
			if (isReady && !ready.has(id)) options.notice(`✓ ${q.nameTh} ครบแล้ว · กลับไปส่งที่${GIVER_NAME[q.giver]}`, 'system');
			if (isReady) ready.add(id);
			else ready.delete(id);
		}
		for (const id of [...ready]) if (!state.active[id]) ready.delete(id);
	}

	/** Quests this NPC shows in one category: open ones first, story quests a few levels ahead as locked rows. */
	function visible(giver: QuestGiver, period: 'story'|'daily'|'weekly') {
		const p = options.player(), now = Date.now();
		const priority = { ready: 0, active: 1, available: 2, cooldown: 3, done: 4, locked: 5 };
		return questsFor(giver, data).map(q => ({ q, status: questStatus(q, state, p.level, now, p.inventory) }))
			.filter(({q,status})=>(q.repeatPeriod??'story')===period &&
			 (q.repeatPeriod ? ['active','ready'].includes(status)||(p.level>=q.level&&p.level<=(q.maxLevel??100)) : status!=='locked'||(q.requires.every(r=>state.done[r]!==undefined)&&p.level<q.level&&q.level<=p.level+5))).sort((a, b) => priority[a.status] - priority[b.status]);
	}
	const svg = (body: string, color = '#e8cb8f') => `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.6" aria-hidden="true">${body}</svg>`;
	const KILL = svg('<path d="M3 13L12 4M10 2.5l3.5 3.5M2.5 10.5l3 3"/>'), BAG = svg('<path d="M3 6h10l-1 8H4z"/><path d="M6 6V4.5a2 2 0 0 1 4 0V6"/>'), LOCK = svg('<rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>', '#71877f');

	/** Quest section for an NPC dialog (ui-mockup/npc-dialogs.html): category tabs, quest cards, locked rows. */
	function section(giver: QuestGiver) {
		const p = options.player(), now = Date.now();
		const box = document.createElement('section');
		box.className = 'npc-quests';
		const categories=document.createElement('nav');categories.className='quest-categories';categories.setAttribute('aria-label','ประเภทภารกิจ');
		for(const [id,label] of [['story','เส้นทางผจญภัย'],['daily','ประจำวัน'],['weekly','ประจำสัปดาห์']] as const){
		 const open=visible(giver,id).filter(x=>x.status!=='locked'),hot=open.some(x=>x.status==='available'||x.status==='ready');
		 const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(category===id));
		 const n=document.createElement('span');n.className='quest-count'+(hot?' hot':'');n.textContent=String(open.length);b.append(label,n);
		 b.onclick=()=>{category=id;const next=section(giver);box.replaceWith(next);next.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();};categories.append(b);
		}box.append(categories);
		const list = visible(giver, category);
		const cards = document.createElement('div');
		cards.className = 'npc-quest-list';
		const locked = document.createElement('details');
		locked.className = 'npc-locked';
		locked.open = true;
		const summary = document.createElement('summary');
		summary.textContent = `เควสที่ยังล็อก · ${list.filter(q => q.status === 'locked').length}`;
		locked.append(summary);
		for (const { q, status } of list) {
			if (status === 'locked') {
				const row = document.createElement('div');
				row.className = 'npc-locked-row';
				row.dataset.quest = q.id;
				row.innerHTML = LOCK;
				const name = document.createElement('b'), note = document.createElement('small'), tag = document.createElement('span');
				name.textContent = q.nameTh;
				note.textContent = `ปลดล็อกที่ Lv.${q.level} · อีก ${q.level - p.level} เลเวล`;
				tag.textContent = 'ยังล็อก';
				const copy = document.createElement('div');
				copy.append(name, note);
				row.append(copy, tag);
				locked.append(row);
				continue;
			}
			const card = document.createElement('article');
			card.className = 'npc-quest';
			card.dataset.status = status;
			card.dataset.quest = q.id;
			const main = document.createElement('div');
			main.className = 'quest-main';
			const top = document.createElement('div');
			top.className = 'quest-top';
			const head = document.createElement('h3');
			head.textContent = q.nameTh;
			const badge = document.createElement('span');
			badge.className = 'quest-badge';
			badge.textContent = { available: 'รับได้', active: 'กำลังทำ', ready: 'ส่งได้', done: 'สำเร็จแล้ว', cooldown: 'รอรอบใหม่', locked: '' }[status];
			const lv = document.createElement('span');
			lv.className = 'quest-level';
			lv.textContent = q.repeatPeriod ? `Lv.${q.level}–${q.maxLevel}` : `Lv.${q.level}+`;
			top.append(head, badge, lv);
			const text = document.createElement('p');
			text.textContent = status === 'done' || status === 'cooldown' ? q.complete : q.offer;
			main.append(top, text);
			if(q.repeatPeriod){const reset=document.createElement('p');reset.className='quest-reset';reset.textContent=`รีเซ็ต${q.repeatPeriod==='weekly'?'วันจันทร์':'ทุกวัน'} 00:00 น. (ไทย)`;
			 if(status==='cooldown')reset.textContent+=' · รับอีกครั้ง '+new Date(questResetAt(q,state.done[q.id])).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});main.append(reset);}
			const progress = objectiveProgress(q, state, p.inventory);
			if (status !== 'done' && status !== 'cooldown') {
				const goals = document.createElement('ul');
				goals.className = 'quest-goals';
				q.objectives.forEach((o, i) => {
					const li = document.createElement('li'), label = document.createElement('span'), count = document.createElement('b');
					li.innerHTML = o.kind === 'collect' ? BAG : KILL;
					label.textContent = o.kind === 'collect' ? `นำ${o.label}มา` : o.label;
					count.textContent = status === 'available' ? `× ${o.count}` : `${Math.min(progress[i], o.count)} / ${o.count}`;
					li.append(label, count);
					if (status !== 'available') { const bar = document.createElement('i'); bar.className = 'quest-bar'; bar.style.setProperty('--v', `${Math.min(1, progress[i] / o.count) * 100}%`); li.append(bar); }
					goals.append(li);
				});
				main.append(goals);
			}
			if (status === 'cooldown' && q.repeatHours) {
				const s = document.createElement('p');
				s.className = 'quest-reset';
				s.textContent = `รอบใหม่ในอีกประมาณ ${Math.ceil(((state.done[q.id] ?? 0) + q.repeatHours * 3600000 - now) / 3600000)} ชั่วโมง`;
				main.append(s);
			}
			const side = document.createElement('div');
			side.className = 'quest-side';
			const title = document.createElement('small');
			title.textContent = 'รางวัล';
			const rewards = document.createElement('div');
			rewards.className = 'quest-rewards';
			const chip = (kind: string, text: string, icon?: HTMLElement) => { const c = document.createElement('span'); c.className = `quest-reward ${kind}`; c.append(icon ?? document.createElement('i'), text); rewards.append(c); };
			if (q.rewards.exp) chip('exp', `EXP ${q.rewards.exp.toLocaleString('en-US')}`);
			if (q.rewards.jobExp) chip('job', `อาชีพ ${q.rewards.jobExp.toLocaleString('en-US')}`);
			if (q.rewards.gold) chip('gold', `${q.rewards.gold.toLocaleString('en-US')} ${q.id==='storage_ledger'?'ทองแจก':'ทอง'}`);
			for (const item of q.rewards.items) { const t = data.items.items.find(t => t.id === item.template); if (t) chip('item', `${t.nameTh} ×${item.qty}`, itemIcon(t)); }
			side.append(title, rewards);
			if (q.objectives.some(o => o.kind === 'collect') || q.id === 'storage_ledger') { const note = document.createElement('p'); note.className = 'quest-note'; note.textContent = q.id === 'storage_ledger' ? 'ทองแจกโอนไม่ได้' : 'ถ้าใช้ของผูกตัวส่งภารกิจ ทองรางวัลจะโอนไม่ได้'; side.append(note); }
			if (q.repeatHours) { const note = document.createElement('p'); note.className = 'quest-note'; note.textContent = `ทำซ้ำได้ทุก ${q.repeatHours} ชั่วโมง`; side.append(note); }
			const actions = document.createElement('div');
			actions.className = 'quest-actions';
			const button = (label: string, op: string, kind = '') => {
				const b = document.createElement('button');
				b.type = 'button';
				b.dataset.op = op;
				b.textContent = label;
				if (kind) b.className = kind;
				b.onclick = () => { submittedFocus = document.activeElement === b ? b : null; b.disabled = true; options.send({ t: 'quest', op, id: q.id }); };
				actions.append(b);
			};
			if (status === 'available') button('รับเควสต์', 'accept', 'primary');
			if (status === 'ready') button('ส่งเควสต์ · รับรางวัล', 'turnIn', 'primary');
			if (status === 'active') {
				const destination = questDestination(data, q, progress, options.map(), p);
				if (destination) { const go = document.createElement('button'); go.type = 'button'; go.className = 'quest-go'; go.dataset.op = 'navigate'; go.textContent = '↗ นำทางไปเป้าหมาย'; go.title = `${destination.name} · ${MAP_INFO[destination.map].name}`; go.onclick = () => { go.closest('dialog')?.close(); options.navigate(destination); }; actions.append(go); }
			}
			if (status === 'active' || status === 'ready') button('ละทิ้ง', 'abandon', 'quest-abandon');
			if (actions.children.length) side.append(actions);
			card.append(main, side);
			cards.append(card);
		}
		box.append(cards);
		if (locked.querySelector('.npc-locked-row')) box.append(locked);
		if (!list.length) {
			const empty = document.createElement('p');
			empty.className = 'quest-empty';
			empty.textContent = 'ตอนนี้ยังไม่มีงานให้ทำในหมวดนี้';
			box.append(empty);
		}
		return box;
	}
	return {
		/** Has something to offer or collect at this NPC (used to open the dialog instead of a shop). */
		pending(kind: string) {
			if (!isGiver(kind)) return false;
			const p = options.player();
			return questsFor(kind, data).some(q => ['available', 'active', 'ready'].includes(questStatus(q, state, p.level, Date.now(), p.inventory)));
		},
		hasQuests: (kind: string) => isGiver(kind),
		/** Renders the quest section into a container; re-renders on quest updates while open. */
		mount(kind: string, container: HTMLElement) {
			if (!isGiver(kind)) return;
			if(openGiver!==kind)category='story';
			openGiver = kind;
			const draw = () => {
				const old = container.querySelector('.npc-quests');
				const focused = document.activeElement instanceof HTMLElement && old?.contains(document.activeElement) ? document.activeElement : document.activeElement === document.body ? submittedFocus : null;
				submittedFocus = null;
				const next = section(kind);
				const locked = next.querySelector<HTMLDetailsElement>('.npc-locked');
				if (locked) locked.open = old?.querySelector<HTMLDetailsElement>('.npc-locked')?.open ?? true;
				old?.remove(); container.append(next);
				if (focused) {
					const id = focused.closest<HTMLElement>('[data-quest]')?.dataset.quest;
					const card = id ? next.querySelector(`[data-quest="${CSS.escape(id)}"]`) : null;
					const target = card?.querySelector<HTMLElement>(`[data-op="${focused.dataset.op}"]`) ?? card?.querySelector<HTMLElement>('button') ?? next.querySelector<HTMLElement>('summary') ?? container.closest('dialog')?.querySelector<HTMLElement>('.npc-close');
					target?.focus({ preventScroll: true });
				}
			};
			onChange = draw;
			draw();
		},
		unmount() { openGiver = null; onChange = null; submittedFocus = null; },
		receive(m: any) {
			if (m.t === 'quests') { state = m.state; checkReady(); renderTracker(); onChange?.(); return true; }
			if (m.t === 'questError') { options.notice(m.text); onChange?.(); return true; }
			return false;
		},
		event(e: any) {
			if (e.type !== 'questComplete') return;
			const q = data.quests.quests.find(q => q.id === e.id);
			if (q) options.notice(`✦ ส่งเควสต์ ${q.nameTh} · ${rewardText(q)}`, 'loot');
		},
		/** Call when the bag changes so collect objectives refresh. */
		refresh() { checkReady(); renderTracker(); if (openGiver) onChange?.(); },
		get state() { return state; },
	};
}
