-- Player-to-player trades write one ledger row per moved item or gold amount on each side, sharing the trade's request_id.
-- Keep ledger kinds introduced by later migrations when the app restarts.
DO $$BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='tn2_ledger'::regclass AND conname='tn2_ledger_kind_check' AND pg_get_constraintdef(oid) LIKE '%trade_in%') THEN
  ALTER TABLE tn2_ledger DROP CONSTRAINT IF EXISTS tn2_ledger_kind_check;
  ALTER TABLE tn2_ledger ADD CONSTRAINT tn2_ledger_kind_check CHECK(kind IN ('drop','pickup','npc_buy','npc_sell','use','equip','unequip','discard','admin','storage_in','storage_out','quest','trade_in','trade_out'));
 END IF;
END$$;
CREATE INDEX IF NOT EXISTS tn2_ledger_request ON tn2_ledger(request_id) WHERE kind IN ('trade_in','trade_out');
