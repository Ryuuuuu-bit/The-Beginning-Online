# Approved monster voices

12 original ElevenLabs SFX v2 sounds, one approved take each. Wolf, mushroom, living wood and wisp attack/hurt/death. Original MP3 bytes retained; mono WAVs are lossless decodes for the existing packer. sources.json retains logical provenance, prompts and SHA256s. No new generation during installation.

Pack with `npm run pack:audio`. Melee breath accompanies server wind-up; ranged breath accompanies bolt release. Hurt follows a nonfatal direct hit, death follows kill. Existing SFX bus, attenuation, ducking and saved settings apply. Hurt cooldown limits rapid repeats. Boss and unrelated species retain their existing sounds.
