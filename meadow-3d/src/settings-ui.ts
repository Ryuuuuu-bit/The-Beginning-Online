/**
 * Settings window (เมนู → ตั้งค่า, or ตั้งค่าปุ่ม in the skill book). The sections themselves are mounted by
 * their own modules (skills-ui #key-settings, audio-settings-ui, hud-qol #hud-settings);
 * this only moves those live nodes into tabs, so their listeners and server sync are unchanged.
 */
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
// Auto-potion lives only in the ตั้งค่า AUTO window now (one editor for the one rule).
type Tab = "keys" | "sound" | "help";
const TABS: [Tab, string][] = [
	["keys", "ปุ่มลัด"],
	["sound", "เสียงและการแสดงผล"],
	["help", "ช่วยเหลือ"],
];

export function mountSettingsWindow(o: { onOpen: () => void; keysChanged: () => void; portalMotion:boolean; setPortalMotion:(enabled:boolean)=>void }) {
	const panel = document.createElement("dialog");
	panel.id = "settings-window";
	panel.setAttribute("aria-labelledby", "settings-title");
	panel.innerHTML = `<button class="close" data-close aria-label="ปิด">×</button><header class="g-head"><h2 id="settings-title">ตั้งค่า</h2><span class="g-sub">บันทึกอัตโนมัติ</span></header>
		<nav class="settings-tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}">${label}</button>`).join("")}</nav>
		<section class="settings-pane" data-pane="keys"><p class="caption">แถบสกิล</p><p class="settings-hint">แตะช่องแล้วกดปุ่มที่ต้องการ</p><div class="settings-keys-host"></div><div class="settings-actions"><p id="key-status" role="status"></p></div><p class="caption">ปุ่มอื่น ๆ และหน้าจอ</p><div class="settings-hud-host"></div></section>
		<section class="settings-pane" data-pane="sound"><section class="settings-display"><h3>คุณภาพภาพ</h3><p class="settings-hint">เลือกภาพสูง ภาพต่ำ หรือปรับอัตโนมัติ</p><div class="settings-quality-host"></div></section></section>
		<section class="settings-pane" data-pane="help"><h3>คู่มือการเล่น</h3><p class="settings-hint">ดูวิธีควบคุม หรือเปิดตัวช่วยนำทางในเกม</p><div class="settings-help-host"></div></section>`;
	document.body.append(panel);

	const keys = $("#key-settings"),
		audio = $("#audio-settings"),
		hud = $("#hud-settings"),
		reset = $("#skills-reset-keys");
	panel.querySelector(".settings-keys-host")!.append(keys);
	panel.querySelector(".settings-actions")!.append(reset);
	panel.querySelector(".settings-hud-host")!.append(hud);
	panel.querySelector('[data-pane="sound"]')!.append(audio);
	const quality = $("#quality");
	quality.classList.remove('menu-tile', 'menu-quality');
	panel.querySelector('.settings-quality-host')!.append(quality);
	const portalMotion=document.createElement('label');
	portalMotion.innerHTML='<input type="checkbox"> เคลื่อนไหววงวาร์ป <small>(เปิดเพื่อหมุน แม้ระบบตั้งลดการเคลื่อนไหว)</small>';
	const motion=portalMotion.querySelector('input')!;motion.checked=o.portalMotion;
	motion.onchange=()=>o.setPortalMotion(motion.checked);
	panel.querySelector('.settings-quality-host')!.append(portalMotion);
	const help = $("#help");
	help.className = 'settings-action';
	help.textContent = 'เปิดคู่มือการเล่น';
	help.addEventListener('click', () => panel.close(), {capture:true});
	panel.querySelector('.settings-help-host')!.append(help);
	// these used to be folded away inside the skill book; here the tab decides what shows
	for (const el of [keys, audio]) el.hidden = false;

	let tab: Tab = "sound";
	function show(next: Tab) {
		tab = next;
		panel.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
		panel.querySelectorAll<HTMLElement>("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== tab));
		if (tab === "keys") o.keysChanged();
	}
	panel.addEventListener("click", (e) => {
		const t = e.target as HTMLElement;
		if (t.closest("[data-close]")) panel.close();
		const b = t.closest<HTMLElement>("[data-tab]");
		if (b) show(b.dataset.tab as Tab);
	});
	function open(at: Tab = tab) {
		document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => d !== panel && d.close());
		o.onOpen();
		if (!panel.open) panel.showModal();
		show(at);
	}
	$("#skills-settings").onclick = () => open("keys");
	return {
		open,
		get isOpen() {
			return panel.open;
		},
	};
}
