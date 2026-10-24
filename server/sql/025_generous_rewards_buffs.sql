-- Keep the first release's receipts for one-time difference payments.
ALTER TABLE tn2_characters ADD COLUMN IF NOT EXISTS upgraded_level_rewards integer[] NOT NULL DEFAULT '{}';
ALTER TABLE tn2_characters ADD COLUMN IF NOT EXISTS consumable_buffs jsonb NOT NULL DEFAULT '{}';
