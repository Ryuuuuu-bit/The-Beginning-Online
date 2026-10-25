import { AudioSettingsSchema, DEFAULT_AUDIO, type AudioSettings } from '@the-beginning-online/shared';
import { assetFetch, reportDeferred } from './asset-request.ts';
import { MAP_MUSIC, MusicSelection, musicDuckGain, type MusicState } from './music-state.ts';
import { MusicPlayer } from './music.ts';
type Position = { x: number; z: number };
type Sprite = { group: string; start: number; duration: number; pitch: number; cooldown: number; voices: number };
type Manifest = { sounds: Record<string, Sprite>; groups: Record<string, { opus: { url: string }; aac: { url: string } }> };
type Bus = 'sfx' | 'music' | 'ambience';
/** Fixed trims under the player's sliders for a soft overall balance. */
const SOFT_TRIM: Record<Bus, number> = { sfx: .72, music: .85, ambience: .8 };
/** One gesture-unlocked context; downloads never participate in boot progress. */
export class AudioEngine {
  settings: AudioSettings = { ...DEFAULT_AUDIO };
  onChange = (_settings: AudioSettings) => {};
  private ctx: AudioContext | null = null;
  private master?: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private manifest?: Manifest;
  private manifestTask?: Promise<void>;
  private loads = new Map<string, Promise<void>>();
  private encoded = new Map<string, ArrayBuffer>();
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<AudioBufferSourceNode, string>();
  private last = new Map<string, number>();
  private recent = new Map<string, number[]>();
  private playable = false;
  private mapId = '';
  private music?: MusicPlayer;
  private musicSelection = new MusicSelection();
  private musicState: MusicState = { mapId: '', dead: false, bossAlive: false, bossTargeted: false, bossBarActive: false, bossAggro: false };
  private impactUntil = 0;
  private impactTimer?: ReturnType<typeof setTimeout>;
  private greeting?: AudioBufferSourceNode;
  private stopGreeting() { const source = this.greeting; this.greeting = undefined; source?.stop(); }
  updateMusic(state: MusicState) {
    const deathChanged = this.musicState.dead !== state.dead;
    this.musicState = state;
    if (deathChanged) this.apply();
    this.syncMusic();
  }
  private syncMusic() {
    if (!this.playable || !this.ctx) return;
    this.music ??= new MusicPlayer(this.ctx, this.buses.music);
    this.music.visibility(document.hidden);
    this.music.select(this.musicSelection.select(this.musicState, performance.now() / 1000));
  }
  duckMusic(position?: Position) {
    if (!this.ctx) return;
    if (position && Math.hypot(position.x - this.listener.x, position.z - this.listener.z) >= 24) return;
    this.impactUntil = this.ctx.currentTime + .25;
    clearTimeout(this.impactTimer); this.apply();
    this.impactTimer = setTimeout(() => this.apply(), 260);
  }
  setMap(mapId: string) { if (mapId !== this.mapId) { this.stopGreeting(); this.apply(); } this.mapId = mapId; this.syncAmbience(); }
  private ambient?: MusicPlayer;
  private syncAmbience() {
    if (!this.playable || !this.ctx) return;
    this.ambient ??= new MusicPlayer(this.ctx, this.buses.ambience, '/assets/audio/ambience.json');
    this.ambient.visibility(document.hidden);
    this.ambient.select(Object.hasOwn(MAP_MUSIC, this.mapId) ? MAP_MUSIC[this.mapId] : null);
  }
  private listener: Position = { x: 0, z: 0 };
  private storageKey: string;
  constructor(characterId: string) {
    this.storageKey = 'tn-audio:' + characterId;
    try { this.restore(JSON.parse(localStorage.getItem(this.storageKey) || 'null')); } catch {}
    const unlock = () => this.start();
    for (const event of ['pointerdown', 'click', 'keydown', 'touchstart'])
      window.addEventListener(event, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { this.apply(); this.syncMusic(); this.syncAmbience(); });
  }
  restore(value: unknown) {
    const parsed = AudioSettingsSchema.safeParse(value);
    if (parsed.success) { this.settings = parsed.data; this.apply(); this.persist(); this.onChange(this.settings); }
  }
  private persist() { try { localStorage.setItem(this.storageKey, JSON.stringify(this.settings)); } catch {} }
  set(value: Partial<AudioSettings>) { this.restore({ ...this.settings, ...value }); }
  toggle() { this.set({ muted: !this.settings.muted }); return !this.settings.muted; }
  start() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
                // Soft mix: a gentle glue compressor on the master keeps peaks down in crowded fights,
        // and the SFX bus is warmed (high shelf + lowpass) so hits and swings never sound harsh.
        const glue = this.ctx.createDynamicsCompressor();
        glue.threshold.value = -20; glue.knee.value = 14; glue.ratio.value = 3; glue.attack.value = .012; glue.release.value = .3;
        this.master = this.ctx.createGain(); this.master.connect(glue); glue.connect(this.ctx.destination);
        for (const name of ['sfx', 'music', 'ambience'] as const) {
          this.buses[name] = this.ctx.createGain();
          if (name === 'sfx') {
            const shelf = this.ctx.createBiquadFilter(), soft = this.ctx.createBiquadFilter();
            shelf.type = 'highshelf'; shelf.frequency.value = 4500; shelf.gain.value = -5;
            soft.type = 'lowpass'; soft.frequency.value = 9500; soft.Q.value = .5;
            this.buses[name].connect(shelf); shelf.connect(soft); soft.connect(this.master);
          } else this.buses[name].connect(this.master);
        }
        this.apply();
        for (const group of this.encoded.keys()) void this.decode(group);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      this.syncAmbience();
      this.syncMusic();
      this.music?.gesture();
      this.ambient?.gesture();
    } catch { /* Unsupported audio remains silent. */ }
  }
  private apply(releaseGreeting = false) {
    if (!this.ctx || !this.master) return;
    if (document.hidden || this.settings.muted || !this.settings.sfx || this.musicState.dead) this.stopGreeting();
    this.master.gain.setTargetAtTime(this.settings.muted || document.hidden ? 0 : 1, this.ctx.currentTime, .08);
    for (const bus of ['sfx', 'music', 'ambience'] as const)
            this.buses[bus].gain.setTargetAtTime(this.settings[bus] * SOFT_TRIM[bus] *
        (bus === 'music' ? musicDuckGain(this.musicState.dead, this.ctx.currentTime < this.impactUntil) : 1) *
        (this.greeting ? bus === 'music' ? .5 : bus === 'ambience' ? .7 : 1 : 1), this.ctx.currentTime, this.greeting ? .06 : releaseGreeting ? .25 : .02);
  }
  setListener(position: Position) { this.listener = { x: position.x, z: position.z }; }
  private getManifest() {
    return this.manifestTask ??= (async () => {
      try { this.manifest = await (await assetFetch('/assets/audio/sprites.json?v=' + import.meta.env.VITE_BUILD_ID, 'low')).json(); }
      catch { reportDeferred(); }
    })();
  }
  load(group: string) {
    if (!this.loads.has(group)) this.loads.set(group, (async () => {
      await this.getManifest();
      const files = this.manifest?.groups[group]; if (!files) return;
      const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
      try {
        this.encoded.set(group, await (await assetFetch((opus ? files.opus : files.aac).url, 'low')).arrayBuffer());
        await this.decode(group);
      } catch { reportDeferred(); }
    })());
    return this.loads.get(group)!;
  }
  private async decode(group: string) {
    const bytes = this.encoded.get(group); if (!this.ctx || !bytes) return;
    this.encoded.delete(group);
    try { this.buffers.set(group, await this.ctx.decodeAudioData(bytes)); }
    catch { reportDeferred(); }
  }
  afterPlayable() {
    if (this.playable) return;
    this.playable = true;
    this.syncMusic();
    this.syncAmbience();
    void this.load('sfx-core').then(() => Promise.all([this.load('sfx-skills'), this.load('sfx-monsters'), this.load('sfx-town')]));
  }
    play(id: string, position?: Position, bus: Bus = 'sfx', other = false) {
    const ctx = this.ctx, sprite = this.manifest?.sounds[id], buffer = sprite && this.buffers.get(sprite.group);
    if (!ctx || ctx.state !== 'running' || !sprite || !buffer || document.hidden || this.settings.muted) return;
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -Infinity) < sprite.cooldown || this.voices.size >= 12 || [...this.voices.values()].filter(v => v === id).length >= sprite.voices) return;
    const dx = position ? position.x - this.listener.x : 0, dz = position ? position.z - this.listener.z : 0;
    const distance = Math.hypot(dx, dz); if (distance >= 24) return;
    const speech = id.startsWith('npc_');
    if (speech) { if (!this.settings.sfx || this.musicState.dead) return; this.stopGreeting(); }
    const source = ctx.createBufferSource(), gain = ctx.createGain(), air = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
    source.buffer = buffer; source.playbackRate.value = 1 + (Math.random() * 2 - 1) * sprite.pitch;
    // Rapid repeats of one sound (Whirlwind, crowds) blend: each extra play inside 250 ms sits a little lower.
    const recent = (this.recent.get(id) ?? []).filter(t => now - t < .25); recent.push(now); this.recent.set(id, recent);
    const level = (speech ? 1 : Math.pow(10, (Math.random() * 2 - 1) / 20)) * Math.pow(1 - distance / 24, 2) / (1 + .35 * (recent.length - 1))
      // Other players' combat sits well behind your own so a busy map stays calm.
      * (other ? .45 : 1);
    // A 5 ms swell instead of a hard start keeps sprite edges click-free.
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(level, now + .005);
    // Distance (and other players) sound softer and darker, like air absorption.
    air.type = 'lowpass'; air.Q.value = .5; air.frequency.value = (2400 + 15600 * Math.pow(1 - distance / 24, 2)) * (other ? .6 : 1);
    pan.pan.value = Math.max(-1, Math.min(1, (dx * .822 - dz * .569) / 10));
    source.connect(gain); gain.connect(air); air.connect(pan); pan.connect(this.buses[bus]);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); air.disconnect(); pan.disconnect(); if (this.greeting === source) { this.greeting = undefined; this.apply(true); } };
    source.start(now, sprite.start, sprite.duration); this.last.set(id, now); this.voices.set(source, id);
    if (speech) { this.greeting = source; this.apply(); }
    if (import.meta.env?.DEV) {
      const log = ((window as any).__sfxLog ??= []); log.push({ id, time: now, position, bus }); if (log.length > 256) log.shift();
    }
  }
}
