import { AutoSettingsSchema } from './auto-settings.js';
import {z} from 'zod';
import { BINDABLE_KEY } from './keybinds.js';
const key=z.string().regex(BINDABLE_KEY);
// Legacy keys.mute and keys.pickupAll are accepted for saved profiles; resolveKeys ignores them.
export const UISettingsSchema=z.object({scale:z.union([z.literal(90),z.literal(100),z.literal(110),z.literal(120)]),windows:z.object({bag:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).optional(),stats:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).optional(),skills:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).optional()}).strict(),auto:AutoSettingsSchema.optional(),keys:z.object({returnCity:key,pickupAll:key.optional(),attack:key.optional(),dash:key.optional(),potion:key.optional(),manaPotion:key.optional(),auto:key.optional(),talk:key.optional(),nextTarget:key.optional(),inventory:key.optional(),skills:key.optional(),stats:key.optional(),mute:key.optional()}).strict()}).strict();
export type UISettings=z.infer<typeof UISettingsSchema>;
export const DEFAULT_UI:UISettings={scale:100,windows:{},keys:{returnCity:'KeyH'}};
