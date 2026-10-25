-- Guide state is saved separately so gameplay autosaves cannot overwrite it.
ALTER TABLE tn2_characters ADD COLUMN IF NOT EXISTS guide_progress jsonb;
