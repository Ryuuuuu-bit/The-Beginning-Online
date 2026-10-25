import { loadGameData, questStatus, questResetAt, objectiveProgress, questsFor, emptyQuests, type QuestState, type QuestGiver, type Inventory } from '@the-beginning-online/shared';
import './quest.css';
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

	/** Quest section for an NPC dialog. */
	function section(giver: QuestGiver) {
		const p = options.player(), now = Date.now();
		const box = document.createElement('section');
		box.className = 'npc-quests';
		const categories=document.createElement('nav');categories.className='quest-categories';categories.setAttribute('aria-label','ประเภทภารกิจ');
		for(const [id,label] of [['story','เส้นทางผจญภัย'],['daily','ประจำวัน'],['weekly','ประจำสัปดาห์']] as const){
		 const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(category===id));
		 b.onclick=()=>{category=id;const next=section(giver);box.replaceWith(next);next.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus();};categories.append(b);
		}box.append(categories);
		const list = questsFor(giver, data).map(q => ({ q, status: questStatus(q, state, p.level, now, p.inventory) }))
			.filter(({q,status})=>(q.repeatPeriod??'story')===category &&
			 (q.repeatPeriod ? ['active','ready'].includes(status)||(p.level>=q.level&&p.level<=(q.maxLevel??100)) : status!=='locked'||(q.requires.every(r=>state.done[r]!==undefined)&&p.level<q.level&&q.level<=p.level+5)));
		for (const { q, status } of list) {
			const card = document.createElement('article');
			card.className = 'npc-quest';
			card.dataset.status = status;
			const head = document.createElement('h3');
			head.textContent = q.nameTh;
			const badge = document.createElement('span');
			badge.className = 'quest-badge';
			badge.textContent = { available: 'ใหม่', active: 'กำลังทำ', ready: 'ส่งได้', done: 'สำเร็จแล้ว', cooldown: 'รอรอบใหม่', locked: `ต้องการระดับ ${q.level}` }[status];
			head.append(badge);
			const text = document.createElement('p');
			text.textContent = status === 'done' || status === 'cooldown' ? q.complete : q.offer;
			card.append(head, text);
			if(q.repeatPeriod){const reset=document.createElement('p');reset.className='quest-reset';reset.textContent=`Lv.${q.level}–${q.maxLevel} · รีเซ็ต${q.repeatPeriod==='weekly'?'วันจันทร์':'ทุกวัน'} 00:00 น. (ไทย)`;
			 if(status==='cooldown')reset.textContent+=' · รับอีกครั้ง '+new Date(questResetAt(q,state.done[q.id])).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});card.append(reset);}
			if (status !== 'done') {
				const goals = document.createElement('ul');
				const progress = objectiveProgress(q, state, p.inventory);
				q.objectives.forEach((o, i) => {
					const li = document.createElement('li');
					const count = status === 'available' || status === 'locked' ? o.count : `${progress[i]} / ${o.count}`;
					li.textContent = o.kind === 'collect' ? `นำ${o.label}มา ${count}` : `${o.label} ${count}`;
					goals.append(li);
				});
				const rewards = document.createElement('p');
				rewards.className = 'quest-rewards';
				rewards.textContent = 'รางวัล: ' + rewardText(q) + (q.repeatHours ? ` · ทำซ้ำได้ทุก ${q.repeatHours} ชั่วโมง` : '');
				card.append(goals, rewards);
			}
			if (status === 'cooldown') {
				const left = Math.ceil(((state.done[q.id] ?? 0) + (q.repeatHours ?? 0) * 3600000 - now) / 3600000);
				const s = document.createElement('p');
				s.className = 'quest-rewards';
				s.textContent = `รอบใหม่ในอีกประมาณ ${left} ชั่วโมง`;
				card.append(s);
			}
			const actions = document.createElement('div');
			actions.className = 'quest-actions';
			const button = (label: string, op: string, primary = false) => {
				const b = document.createElement('button');
				b.type = 'button';
				b.textContent = label;
				if (primary) b.className = 'primary';
				b.onclick = () => { b.disabled = true; options.send({ t: 'quest', op, id: q.id }); };
				actions.append(b);
			};
			if (status === 'available') button('รับเควสต์', 'accept', true);
			if (status === 'ready') button('ส่งเควสต์', 'turnIn', true);
			if (status === 'active' || status === 'ready') button('ละทิ้ง', 'abandon');
			if (actions.children.length) card.append(actions);
			box.append(card);
		}
		if (!list.length) {
			const empty = document.createElement('p');
			empty.className = 'quest-rewards';
			empty.textContent = 'ตอนนี้ยังไม่มีงานให้ทำ';
			box.append(empty);
		}
		return box;
	}

	return {
		/** Has something to offer or collect at this NPC (used to open the dialog instead of a shop). */
		pending(kind: string) {
			if (!isGiver(kind)) return false;
			const p = options.player();
			return questsFor(kind, data).some(q => ['available', 'ready'].includes(questStatus(q, state, p.level, Date.now(), p.inventory)));
		},
		hasQuests: (kind: string) => isGiver(kind),
		/** Renders the quest section into a container; re-renders on quest updates while open. */
		mount(kind: string, container: HTMLElement) {
			if (!isGiver(kind)) return;
			if(openGiver!==kind)category='story';
			openGiver = kind;
			const draw = () => { container.querySelector('.npc-quests')?.remove(); container.append(section(kind)); };
			onChange = draw;
			draw();
		},
		unmount() { openGiver = null; onChange = null; },
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
