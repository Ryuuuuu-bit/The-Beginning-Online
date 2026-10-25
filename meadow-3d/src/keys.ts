import { actionKeys, resolveKeys, type KeyBindings } from '@the-beginning-online/shared';
/** KeyboardEvent.code bindings shared by the game controller and tests. First entry is primary. Actions follow the player's settings. */
const FIXED = {
 slot1:['Digit1'],slot2:['Digit2'],slot3:['Digit3'],slot4:['Digit4'],slot5:['Digit5'],slot6:['Digit6'],slot7:['Digit7'],slot8:['Digit8'],slot9:['Digit9'],slot10:['Digit0'],
 pause:['Escape'],map:['KeyM'],up:['KeyW','ArrowUp'],down:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],
};
type Binding=keyof typeof FIXED|keyof KeyBindings;
/** Live table: setKeyBindings() rewrites the action entries in place, so readers always see the current keys. */
export const KEYS:Record<Binding,string[]>={...FIXED,...actionKeys(resolveKeys(undefined))};
export function setKeyBindings(saved?:Partial<Record<string,string>>|null){Object.assign(KEYS,actionKeys(resolveKeys(saved)));}
/** Codes a hotbar slot may not take right now: movement, Escape, map and every live action key. */
export const takenByActions=()=>[...FIXED.up,...FIXED.down,...FIXED.left,...FIXED.right,...FIXED.pause,...FIXED.map,...(['attack','dash','potion','manaPotion','auto','talk','nextTarget','inventory','skills','stats','returnCity'] as const).flatMap(a=>KEYS[a])];
export const isKey=(binding:Binding,code:string)=>KEYS[binding].includes(code);
