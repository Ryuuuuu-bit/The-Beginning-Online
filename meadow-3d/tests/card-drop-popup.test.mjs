import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadGameData } from '@the-beginning-online/shared';
import { mountCardDrop } from '../src/card-drop-ui.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const branch = source.match(/case'cardDrop':(.*?)break;/)[1];

test('card celebration is shown only for the loot owner', () => {
 const shown = [], loot = [{ template: 'card_jelly_pink', qty: 2 }];
 const context = { e: { playerId: 'other', loot }, net: { you: 'me' }, cardDrop: { show: items => shown.push(items) } };
 runInNewContext(branch, context);
 assert.equal(shown.length, 0);
 context.e.playerId = 'me';
 runInNewContext(branch, context);
 assert.deepEqual(shown, [loot]);
});

test('card panel uses real art/effects, preserves consecutive drops, closes and expires', t => {
 class Element {
  children = []; style = {}; dataset = {}; parts = new Map(); classList = { add() {} };
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this[key] = value; }
  querySelector(key) { if (!this.parts.has(key)) this.parts.set(key, new Element()); return this.parts.get(key); }
 }
 const host = new Element(), timers = new Map(); let nextTimer = 0;
 const previous = { document: globalThis.document, window: globalThis.window };
 t.after(() => { globalThis.document = previous.document; globalThis.window = previous.window; });
 globalThis.document = { createElement: () => new Element(), querySelector: () => host };
 globalThis.window = { setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; }, clearTimeout: id => timers.delete(id) };
 const ui = mountCardDrop(loadGameData()), popup = host.children[0], list = popup.querySelector('.card-drop-list');
 ui.show([{ template: 'jelly_slime', qty: 1 }, { template: 'unknown-card', qty: 1 }]);
 assert.equal(popup.hidden, true);
 assert.equal(timers.size, 0);
 ui.show([{ template: 'card_jelly_pink', qty: 2 }]);
 assert.equal(popup.hidden, false);
 assert.equal(popup.role, 'status');
 const [art, info] = list.children[0].children;
 assert.match(art.children[0].style.backgroundImage, /card_jelly_pink/);
 assert.match(info.children[0].textContent, /×2$/);
 assert.match(info.children[1].textContent, /เกราะ/);
 assert.match(info.children[2].textContent, /VIT.*3.*HP.*150/);
 ui.show([{ template: 'card_king_jelly', qty: 1 }]);
 assert.equal(list.children.length, 2);
 assert.equal(timers.size, 1);
 assert.equal([...timers.values()][0].ms, 10000);
 popup.querySelector('button').onclick();
 assert.equal(popup.hidden, true);
 assert.equal(timers.size, 0);
 ui.show([{ template: 'card_king_jelly', qty: 1 }]);
 assert.equal(list.children.length, 1);
 [...timers.values()][0].fn();
 assert.equal(popup.hidden, true);
});
