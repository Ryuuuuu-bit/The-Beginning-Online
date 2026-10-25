ALTER TABLE tn2_characters
 ADD COLUMN IF NOT EXISTS discovered_maps jsonb NOT NULL DEFAULT '["city_plaza"]'::jsonb
 CHECK (jsonb_typeof(discovered_maps) = 'array');

-- Historical visits were not recorded; only the saved current map is known for old characters.
UPDATE tn2_characters
 SET discovered_maps = jsonb_build_array('city_plaza', map_id)
 WHERE discovered_maps = '["city_plaza"]'::jsonb AND map_id IS NOT NULL AND map_id <> 'city_plaza';
