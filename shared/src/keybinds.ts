/**
 * Rebindable action keys (KeyboardEvent.code), shared by the client controller, the settings window
 * and the server's validation. Movement (WASD / arrows), Escape and map (M) stay fixed; hotbar slots have their
 * own per-slot keys on the job bar.
 */
export const KEY_ACTIONS = [
	"attack",
	"dash",
	"potion",
	"manaPotion",
	"auto",
	"talk",
	"nextTarget",
	"inventory",
	"skills",
	"stats",
	"returnCity",
] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];
export type KeyBindings = Record<KeyAction, string>;

export const DEFAULT_KEYS: KeyBindings = {
	attack: "Space",
	dash: "ShiftLeft",
	potion: "KeyQ",
	manaPotion: "KeyE",
	auto: "KeyT",
	talk: "KeyF",
	nextTarget: "Tab",
	inventory: "KeyI",
	skills: "KeyK",
	stats: "KeyC",
	returnCity: "KeyH",
};
/** Second keys kept from the old fixed layout; live only while the action still has its default key. */
export const ALT_KEYS: Partial<KeyBindings> = { attack: "KeyJ", dash: "ShiftRight" };
export const FIXED_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "KeyM"] as const;
export const BINDABLE_KEY =
	/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space|Tab|ShiftLeft|ShiftRight|Backquote|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Numpad[0-9])$/;

/** Saved keys over the defaults; anything malformed or fixed falls back to the default for that action. */
export function resolveKeys(saved?: Partial<Record<string, string>> | null, hotbarKeys: readonly string[] = []): KeyBindings {
	const out = { ...DEFAULT_KEYS };
	const explicit = new Set<KeyAction>();
	for (const action of KEY_ACTIONS) {
		const code = saved?.[action];
		// Old profiles used F for AUTO before a separate talk binding existed.
		if (action === 'auto' && code === 'KeyF' && saved?.talk === undefined) continue;
		if (typeof code === "string" && BINDABLE_KEY.test(code) && !(FIXED_KEYS as readonly string[]).includes(code)) {out[action] = code;explicit.add(action);}
	}
	// New defaults must not take a saved action/hotbar key; explicit conflicts remain invalid.
	for (const action of KEY_ACTIONS) {
		if (explicit.has(action) && ((action !== 'potion' && action !== 'manaPotion') || !hotbarKeys.includes(out[action]))) continue;
		const occupied = new Set([...hotbarKeys,...FIXED_KEYS,...KEY_ACTIONS.filter(a=>a!==action).flatMap(a=>[out[a],...(ALT_KEYS[a]?[ALT_KEYS[a]!]:[])])]);
		out[action] = [DEFAULT_KEYS[action],'KeyR',...'QVBGZXEUYOPLNF'.split('').map(k=>'Key'+k),...Array.from({length:12},(_,i)=>'F'+(i+1))].find(code=>!occupied.has(code))!;
	}
	return out;
}
/** Every code each action listens to: its key, plus its old alternate while it keeps the default and nothing else uses it. */
export function actionKeys(b: KeyBindings): Record<KeyAction, string[]> {
	const primaries = new Set(Object.values(b));
	const out = {} as Record<KeyAction, string[]>;
	for (const action of KEY_ACTIONS) {
		const alt = ALT_KEYS[action];
		out[action] = [b[action], ...(alt && b[action] === DEFAULT_KEYS[action] && !primaries.has(alt) ? [alt] : [])];
	}
	return out;
}
/** Codes a hotbar slot may not take: movement, Escape, map and every live action key. */
export function reservedKeys(b: KeyBindings): string[] {
	return [...FIXED_KEYS, ...Object.values(actionKeys(b)).flat()];
}
/** Why these bindings are not allowed (Thai message for the player), or null when they are fine. */
export function bindingProblem(b: KeyBindings, hotbarKeys: readonly string[] = []): string | null {
	const seen = new Map<string, KeyAction>();
	for (const action of KEY_ACTIONS) {
		const code = b[action];
		if (!BINDABLE_KEY.test(code)) return "ใช้ปุ่มนี้ไม่ได้";
		if ((FIXED_KEYS as readonly string[]).includes(code)) return "ปุ่มเดิน, Esc และ M (แผนที่) เปลี่ยนไม่ได้";
		if (seen.has(code)) return "ปุ่มนี้ถูกใช้อยู่แล้ว";
		seen.set(code, action);
		if (hotbarKeys.includes(code)) return "ปุ่มนี้ใช้กับช่องแถบสกิลอยู่";
	}
	return null;
}
/** Short label for a key on buttons and in the settings list. */
export function keyLabel(code: string) {
	return (
		({ Space: "Space", ShiftLeft: "⇧", ShiftRight: "⇧R", Tab: "Tab", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\" } as Record<string, string>)[code] ??
		code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num")
	);
}
