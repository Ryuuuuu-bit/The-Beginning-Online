CREATE TABLE IF NOT EXISTS tn2_account_level_rewards (
 account_id uuid NOT NULL REFERENCES tn2_accounts(id),
 level integer NOT NULL CHECK(level BETWEEN 1 AND 100),
 upgraded boolean NOT NULL,
 PRIMARY KEY(account_id,level)
);
-- Include deleted characters: deleting a recipient must never restore its account's entitlement.
INSERT INTO tn2_account_level_rewards(account_id,level,upgraded)
SELECT account_id,level,bool_or(upgraded) FROM (
 SELECT account_id,unnest(claimed_level_rewards) AS level,false AS upgraded FROM tn2_characters
 UNION ALL SELECT account_id,unnest(upgraded_level_rewards),true FROM tn2_characters
) receipts GROUP BY account_id,level
ON CONFLICT(account_id,level) DO UPDATE SET upgraded=tn2_account_level_rewards.upgraded OR EXCLUDED.upgraded;

DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='tn2_item_stacks' AND column_name='bound') THEN
  ALTER TABLE tn2_item_stacks ADD COLUMN bound boolean NOT NULL DEFAULT false;
  -- Historical stacks mixed gifts and drops; preserve quantities and bind the whole affected stack once.
  UPDATE tn2_item_stacks s SET bound=true WHERE s.template='forge_fragment' OR s.source IN ('migration','level_reward','quest') OR EXISTS(
   SELECT 1 FROM tn2_ledger l WHERE l.character_id=s.character_id AND l.template=s.template AND l.qty>0 AND l.kind IN ('level_reward','quest')
  );
  UPDATE tn2_items SET bound=true WHERE source IN ('migration','level_reward','quest');
  ALTER TABLE tn2_item_stacks DROP CONSTRAINT tn2_item_stacks_pkey;
  ALTER TABLE tn2_item_stacks ADD PRIMARY KEY(character_id,template,location,bound);
 END IF;
END$$;
