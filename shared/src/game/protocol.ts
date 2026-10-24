import { z } from "zod";
import {MAP_IDS} from './world-ids.js';
import { AudioSettingsSchema } from '../audio-settings.js';
import {UISettingsSchema} from '../ui-settings.js';
import { AutoSettingsSchema } from '../auto-settings.js';
import {AutoPotionSchema} from '../auto-potion.js';
const seq = z.number().int().nonnegative().max(2147483647),
	point = z.number().finite().min(-10000).max(10000);
const movementMap = z.enum(MAP_IDS).optional();
export const IntentSchema = z.discriminatedUnion("t", [
 z.object({t:z.literal('titles')}).strict(),
 z.object({t:z.literal('titleEquip'),id:z.string().regex(/^[a-z0-9_]{1,40}$/).nullable()}).strict(),
 z.object({t:z.literal('rankings'),board:z.enum(['level','hunt'])}).strict(),
 z.object({t:z.literal('uiSettings'),settings:UISettingsSchema}).strict(),
 z.object({t:z.literal('autoSettings'),settings:AutoSettingsSchema}).strict(),
  z.object({t:z.literal('returnCity')}).strict(),
 z.object({t:z.literal('mailbox'),op:z.enum(['list','claim']),req:z.uuid().optional(),level:z.number().int().min(2).max(100).optional()}).strict(),
 z.object({t:z.literal('quest'),op:z.enum(['accept','turnIn','abandon']),id:z.string().regex(/^[a-z_]{1,40}$/)}).strict(),
 z.object({t:z.literal('chat'),ch:z.enum(['map','party','whisper']),text:z.string().min(1).max(160),to:z.string().min(1).max(24).optional()}).strict(),
 z.object({t:z.literal('trade'),op:z.enum(['request','accept','decline','offer','lock','confirm','cancel']),name:z.string().min(1).max(24).optional(),id:z.string().max(40).optional(),items:z.array(z.object({id:z.string().min(1).max(80),qty:z.number().int().min(1).max(9999)}).strict()).max(10).optional(),gold:z.number().int().min(0).max(2147483647).optional()}).strict(),
 z.object({t:z.literal('party'),op:z.enum(['create','status','online','inviteNearby','disband','invite','accept','decline','leave','kick','lead']),name:z.string().min(1).max(24).optional(),id:z.string().max(60).optional()}).strict(),
 z.object({t:z.literal('pickupAll')}).strict(),
 z.object({t:z.literal('inv'),op:z.enum(['buy','sell','equip','unequip','use','discard','pickup','settings','store','retrieve','card','socket','refine']),req:z.uuid(),id:z.string().max(80).optional(),card:z.string().max(80).optional(),slot:z.enum(['weapon','body','shield','garment','footgear','accessory1','ring2','accessory2']).optional(),template:z.string().max(60).optional(),qty:z.number().int().min(1).max(9999).optional(),ids:z.array(z.string().max(80)).max(100).optional(),items:z.array(z.object({id:z.string().min(1).max(80),qty:z.number().int().min(1).max(9999)}).strict()).min(1).max(100).optional(),shop:z.enum(['market','forge']).optional(),drop:z.number().int().positive().optional(),on:z.boolean().optional()}).strict(),
 z.object({t:z.literal("travel"),gate:z.enum(["north","south","east","west"])}).strict(),
 z.object({t:z.literal("heal")}).strict(),
 z.object({t:z.literal("audioSettings"),settings:AudioSettingsSchema}).strict(),
 z.object({t:z.literal("autoPotion"),settings:AutoPotionSchema}).strict(),
	z.object({t:z.literal('stats'),add:z.object({str:z.number().int().min(0).max(99).optional(),agi:z.number().int().min(0).max(99).optional(),vit:z.number().int().min(0).max(99).optional(),int:z.number().int().min(0).max(99).optional(),dex:z.number().int().min(0).max(99).optional(),luk:z.number().int().min(0).max(99).optional()}).strict(),seq}).strict(),
	z.object({t:z.literal('statsReset')}).strict(),
	z.object({t:z.literal('autoAlloc'),on:z.boolean()}).strict(),
	z.object({t:z.literal('skillUp'),id:z.string().max(40),seq}).strict(),
 z.object({t:z.literal('hotbar'),slots:z.array(z.object({skill:z.string().max(40).nullable(),key:z.string().max(16),mode:z.literal('autoSpell').optional(),signature:z.string().regex(/^M(0[1-9]|1[0-6])$/).optional()}).strict()).length(10)}).strict(),
 z.object({t:z.literal('jobChange'),job:z.string().max(40)}).strict(),
 z.object({ t: z.literal("hello") }).strict(),
	z.object({ t: z.literal("spawnReady") }).strict(),
	z.object({ t: z.literal("move"), x: point, z: point, seq, mapId: movementMap }).strict(),
	z.object({ t: z.literal("steer"), dx: point, dz: point, seq, mapId: movementMap }).strict(),
	z
		.object({
			t: z.literal("act"),
			a: z.string().regex(/^[a-z_][a-z0-9_]{0,39}$/),
			target: z.number().int().positive().optional(),
			ally: z.uuid().optional(),
            point:z.object({x:point,z:point}).strict().optional(),
			seq,
		})
		.strict(),
	z.object({ t: z.literal("auto"), on: z.boolean() }).strict(),
	z
		.object({ t: z.literal("target"), id: z.number().int().positive() })
		.strict(),
	z.object({ t: z.literal("revive") }).strict(),
	z.object({ t: z.literal("ping"), c: z.number().finite() }).strict(),
]);
export type Intent = z.infer<typeof IntentSchema>;
