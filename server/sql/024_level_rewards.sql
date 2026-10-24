-- Separate from progress saves so stale gameplay snapshots cannot erase receipts.
ALTER TABLE tn2_characters ADD COLUMN IF NOT EXISTS claimed_level_rewards integer[] NOT NULL DEFAULT '{}';
DO $$BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='tn2_ledger'::regclass AND conname='tn2_ledger_kind_check' AND pg_get_constraintdef(oid) LIKE '%level_reward%') THEN
  ALTER TABLE tn2_ledger DROP CONSTRAINT IF EXISTS tn2_ledger_kind_check;
  ALTER TABLE tn2_ledger ADD CONSTRAINT tn2_ledger_kind_check CHECK(kind IN ('drop','pickup','npc_buy','npc_sell','use','equip','unequip','discard','admin','storage_in','storage_out','quest','trade_in','trade_out','level_reward'));
 END IF;
END$$;
