import {z} from 'zod';
// Keep this bound in sync with the handbook when adding lessons.
export const GUIDE_STEP_COUNT=14;
export const GuideProgressSchema=z.object({version:z.literal(1),step:z.number().int().min(0).max(GUIDE_STEP_COUNT),off:z.boolean(),min:z.boolean()}).strict();
export const GuideStateSchema=GuideProgressSchema.extend({revision:z.number().int().min(1).max(2147483647)});
export const GuideWriteSchema=z.object({progress:GuideProgressSchema,revision:z.number().int().min(0).max(2147483646)}).strict();
export type GuideProgress=z.infer<typeof GuideProgressSchema>;
export type GuideState=z.infer<typeof GuideStateSchema>;
