import './levelup.css';

type Point = { x: number; y: number };
/** Screen positions of the local hero's feet and head, or null while off screen. */
type HeroScreen = () => { feet: Point; head: Point } | null;
interface Stats { maxHp: number; maxMp: number }

/** Level-up presentation: gold fireflies spiral up the hero into an orb, then a compact banner names the
 *  new level and what it gave. Level and job level that land together share one banner. */
export function mountLevelUp(options: { hero: HeroScreen; stats: () => Stats }) {
	const ui = document.querySelector('#ui')!;
	const fx = document.createElement('div');
	fx.id = 'levelup-fx';
	fx.setAttribute('aria-hidden', 'true');
	const banner = document.createElement('section');
	banner.id = 'levelup';
	banner.hidden = true;
	banner.setAttribute('role', 'status');
	banner.innerHTML = '<div class="lu-eyebrow"></div><div class="lu-num"></div><p class="lu-sub" hidden></p><div class="lu-gains"></div><div class="lu-also" hidden></div><p class="lu-hint"></p>';
	ui.append(fx, banner);
	const $ = (s: string) => banner.querySelector<HTMLElement>(s)!;

	let raf = 0, hideTimer = 0, flushTimer = 0;
	let pending: { level?: { level: number; granted: number; before: Stats }; job?: { jobLevel: number; granted: number } } = {};

	function fireflies() {
		cancelAnimationFrame(raf);
		fx.replaceChildren();
		if (document.hidden) return;
		const orb = document.createElement('i'), burst = document.createElement('i');
		orb.className = 'orb';
		burst.className = 'burst';
		const N = 28;
		const dots = Array.from({ length: N }, (_, i) => {
			const el = document.createElement('i');
			el.className = 'fly';
			return { el, a0: (i / N) * Math.PI * 6, delay: (i / N) * 0.55, spread: (Math.random() - 0.5) * 1.2 };
		});
		fx.append(...dots.map(d => d.el), orb, burst);
		const t0 = performance.now();
		const tick = (now: number) => {
			const t = (now - t0) / 1000, at = options.hero();
			if (!at) { fx.replaceChildren(); return; }
			// Sizes follow the hero's on-screen height so zoom and phone screens keep the same look.
			const tall = Math.max(40, at.feet.y - at.head.y), top = -(tall * 1.25 + 30), radius = tall * 0.8, size = Math.min(1.4, Math.max(0.6, tall / 90));
			const place = (el: HTMLElement, x: number, y: number, scale: number, opacity: number) => {
				el.style.transform = `translate(${(at.feet.x + x).toFixed(1)}px,${(at.feet.y + y).toFixed(1)}px) scale(${scale.toFixed(2)})`;
				el.style.opacity = opacity.toFixed(2);
			};
			for (const d of dots) {
				const k = Math.min(1, Math.max(0, (t - d.delay) / 1.35));
				if (t < 1.95) {
					const r = radius * (1 - k) + 12, ang = d.a0 + k * 7.5, z = Math.sin(ang);
					place(d.el, Math.cos(ang) * r, top * Math.pow(k, 1.1) - 4, 0.75 + 0.35 * (z + 1) / 2, (k > 0 ? Math.min(1, k * 6) : 0) * (0.55 + 0.45 * (z + 1) / 2));
				} else {
					const u = Math.min(1, (t - 1.95) / 1), ang = d.a0 + d.spread;
					place(d.el, Math.cos(ang) * (14 + u * tall * 1.6), top + Math.sin(ang) * (10 + u * tall) + u * 40, 1.1, 1 - u);
				}
			}
			const g = Math.max(0, Math.min(1, (t - 1.3) / 0.6));
			place(orb, 0, top, size * (0.3 + g * 0.9 + (t > 1.95 ? (t - 1.95) * 1.2 : 0)), t < 1.95 ? g : Math.max(0, 1 - (t - 1.95) / 0.5));
			const b = Math.max(0, (t - 1.95) / 0.8);
			place(burst, 0, top, size * (0.3 + b * 1.4), b > 0 && b < 1 ? 1 - b : 0);
			if (t < 3.2) raf = requestAnimationFrame(tick);
			else fx.replaceChildren();
		};
		raf = requestAnimationFrame(tick);
	}

	function chip(label: string, value: string, opts: { dot?: string; key?: boolean } = {}) {
		const el = document.createElement('div');
		el.className = 'lu-gain' + (opts.key ? ' key' : '');
		if (opts.dot) { const i = document.createElement('i'); i.style.setProperty('--dot', opts.dot); el.append(i); }
		const b = document.createElement('b');
		b.textContent = value;
		el.append(label + ' ', b);
		return el;
	}

	function show() {
		const { level, job } = pending;
		pending = {};
		if (!level && !job) return;
		const milestone = !level && job?.jobLevel === 40;
		banner.classList.toggle('job', !level);
		$('.lu-eyebrow').textContent = level ? 'LEVEL UP' : milestone ? 'JOB LEVEL 40' : 'JOB LEVEL UP';
		$('.lu-num').textContent = String(level ? level.level : job!.jobLevel);
		const sub = $('.lu-sub');
		sub.hidden = !milestone;
		sub.textContent = milestone ? 'พัฒนาสายการเล่นต่อได้ในสมุดสกิล · เซราฟช่วยแนะนำเป้าหมายถัดไปได้' : '';
		const gains = $('.lu-gains');
		gains.replaceChildren();
		if (level) {
			const now = options.stats(), hp = Math.round(now.maxHp - level.before.maxHp), mp = Math.round(now.maxMp - level.before.maxMp);
			if (hp > 0) gains.append(chip('HP สูงสุด', `+${hp}`, { dot: '#e8656a' }));
			if (mp > 0) gains.append(chip('MP สูงสุด', `+${mp}`, { dot: '#5fb6e8' }));
			gains.append(chip('แต้มสเตตัส', `+${level.granted}`, { key: true }));
		} else if (job && !milestone) gains.append(chip('แต้มสกิล', `+${job.granted}`, { key: true }));
		const also = $('.lu-also');
		also.hidden = !(level && job);
		if (level && job) also.innerHTML = `<b>อาชีพ ${job.jobLevel}</b><span>ระดับอาชีพเพิ่มขึ้น ·</span><em>+${job.granted} แต้มสกิล</em>`;
		$('.lu-hint').innerHTML = level && job ? 'กด <kbd>C</kbd> สเตตัส · <kbd>K</kbd> สกิล' : level ? 'กด <kbd>C</kbd> จัดสรรแต้มสเตตัส' : 'กด <kbd>K</kbd> เปิดสมุดสกิล';
		const life = milestone ? 5.2 : level && job ? 4.6 : 3.9;
		banner.style.setProperty('--life', `${life}s`);
		banner.hidden = false;
		// Sit below the target / boss frame when one occupies the top centre.
		banner.style.top = '';
		let top = parseFloat(getComputedStyle(banner).top) || 64;
		for (const el of document.querySelectorAll<HTMLElement>('#target,#boss-hud')) {
			if (el.hidden) continue;
			const r = el.getBoundingClientRect();
			if (r.height && r.top < 220 && r.left < innerWidth / 2 + 320 && r.right > innerWidth / 2 - 320) top = Math.max(top, r.bottom + 12);
		}
		banner.style.top = `${Math.round(top)}px`;
		banner.classList.remove('play');
		void banner.offsetWidth;
		banner.classList.add('play');
		clearTimeout(hideTimer);
		hideTimer = window.setTimeout(() => {
			banner.hidden = true;
			banner.classList.remove('play');
			const badge = document.querySelector<HTMLElement>('#ui .avatar b');
			if (badge && level) { badge.classList.remove('lu-ping'); void badge.offsetWidth; badge.classList.add('lu-ping'); setTimeout(() => badge.classList.remove('lu-ping'), 2600); }
		}, life * 1000);
	}
	// Level and job level from one kill arrive in the same event batch; wait a beat so they share a banner,
	// and so the next snapshot has carried the new max HP/MP.
	const queue = () => { clearTimeout(flushTimer); flushTimer = window.setTimeout(show, 450); };

	return {
		level(e: { level: number; granted?: number }) {
			if (!pending.level && !pending.job) fireflies();
			pending.level = { level: e.level, granted: e.granted || 3, before: pending.level?.before ?? { ...options.stats() } };
			queue();
		},
		jobLevel(e: { jobLevel: number; granted: number }) {
			if (!pending.level && !pending.job) fireflies();
			pending.job = { jobLevel: e.jobLevel, granted: (pending.job?.granted ?? 0) + e.granted };
			queue();
		},
	};
}
