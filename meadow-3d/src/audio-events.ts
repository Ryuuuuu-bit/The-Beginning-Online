import type { AudioEngine } from './audio';
import { monsterSpecies, monsterVisual } from './monster-animation.ts';
type MonsterVoice = 'wolf' | 'shroom' | 'wood' | 'wisp';
const MONSTER_VOICES: Record<string, MonsterVoice> = {
  shade_wolf:'wolf', relic_hound:'wolf', crag_wolf:'wolf',
  mist_shroom:'shroom', ruin_shroom:'shroom', bud_shroom:'shroom', volcano_red_smoke_shroom:'shroom',
  stump_guard:'wood', ruin_guard:'wood', crag_guard:'wood',
  lantern_wisp:'wisp', relic_wisp:'wisp', dust_wisp:'wisp',
};
/** Audio follows creature identity, not renderer fallback (e.g. a mantis uses wolf art). */
export function monsterAudioFamily(dataId?: string) {
  return dataId ? MONSTER_VOICES[monsterVisual(dataId).id] : undefined;
}
type AudioEnemy = { dataId: string; boss: boolean; dead: boolean; x: number; z: number };
/** Material layer under the shared weapon thock, by monster species (RO / ToS style). */
const JOB2_SOUNDS=new Set(['shield_bash','bulwark','quake_slam','rally_roar','frenzy_slash','blood_rage','blade_cyclone','leap_strike']);
const MATERIAL: Record<string, string> = { slime: 'mat_jelly', king: 'mat_jelly', wolf: 'mat_fur', stump: 'mat_wood', warden: 'mat_wood', shroom: 'mat_shroom', wisp: 'mat_wisp' };
/** Consume authoritative events only, never predicted key presses. */
export function playEventAudio(sound: AudioEngine, e: any, you: string, boss?: { x: number; z: number }, enemy?: (id: number) => AudioEnemy | undefined) {
  const real=e.learnedSkill??e.skillId;
  const id=JOB2_SOUNDS.has(real)?real:e.visual??e.skillId;
  const local = e.playerId === you;
  const monster = enemy?.(e.id), family = monsterAudioFamily(e.dataId ?? monster?.dataId);
  const creature = (action: string) => {
    if (family && !e.boss && !monster?.boss) sound.play(`mon_${family}_${action}`, monster ?? e);
  };
    const play = (id: string) => sound.play(id, e, 'sfx', !!e.playerId && !local);
  if (['hit', 'hurt', 'skillImpact', 'slam'].includes(e.type)) sound.duckMusic(Number.isFinite(e.x) ? e : undefined);
  switch (e.type) {
    // Melee breath starts with the confirmed wind-up; ranged breath follows projectile release.
    case 'warning': if (e.attack === 'attack' && !monster?.dead) creature('attack'); break;
    case 'bolt': if (!monster?.dead) creature('attack'); break;
    case 'slash': play('combo' + ((e.combo ?? 0) + 1)); break;
    case 'skill':
      if(JOB2_SOUNDS.has(id)){if(id!=='quake_slam'&&id!=='frenzy_slash')play(id);break;}
      // Earth Break has a cast; its impact event is emitted when damage resolves.
      if (['slash', 'whirlwind', 'provoke', 'endure'].includes(e.skillId)) play(e.skillId);
      if (e.skillId === 'dash_strike') play('dash');
      break;
    case 'skillImpact': if (id === 'earth_break'||id==='quake_slam') play(id); if (id === 'leap_strike') play('leap_strike_land'); break;
    case 'hit': if(e.reflect)play('reflect');if(real==='frenzy_slash')play('frenzy_slash');if(real==='blade_cyclone')play('blade_cyclone_tick'); if (!e.boss) { play('hit_thock'); play(MATERIAL[monsterSpecies(monster?.dataId, monster?.boss)] ?? 'mat_jelly'); if (e.damage > 0 && !e.dot && !e.fatal && !monster?.dead) creature('hurt'); } if (e.crit) play('crit'); break;
    case 'kill': if (!e.boss) { if (family) creature('death'); else play('jelly_death'); } break;
    case 'dash': case 'evade': play('dodge'); break;
    case 'miss': if (e.defender === 'player') play('dodge'); break;
    case 'hurt': if(local&&e.guarded)play('guard_block');play('hurt'); break;
    case 'death': if (local) play('death'); break;
    case 'heal': play('potion'); break;
    case 'pickup': if (local) sound.play('pickup'); break;
    case 'level': case 'jobLevel': if (local) sound.play('levelup'); break;
    case 'boss': sound.play('king_roar', boss || { x: 1, z: -10 }); break;
    case 'phase2': play('king_roar'); break;
    case 'slam': play('king_slam'); break;
  }
}
