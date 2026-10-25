-- Existing balances remain ordinary gold; only newly delivered level-mail gold is restricted.
ALTER TABLE tn2_characters ADD COLUMN IF NOT EXISTS bound_gold integer NOT NULL DEFAULT 0 CHECK(bound_gold>=0 AND bound_gold<=gold);
