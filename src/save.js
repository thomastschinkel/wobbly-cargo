// Progress storage: CrazyGames SDK data module when available, else localStorage, else memory.
const KEY = 'wobblycargo_save_v1';

export function defaultSave() {
  return {
    v: 1,
    levels: {},
    unlocked: 1,
    coins: 0,
    coinsEarned: 0,
    skins: ['classic'],
    hats: ['cap', 'none'],
    skin: 'classic',
    hat: 'cap',
    daily: { last: '', streak: 0, count: 0, bestDate: '', best: 0, done: {} },
    settings: { sfx: 0.8, music: 0.5, shake: true },
    fails: {},
    seenTips: {},
    runs: 0,
    visits: 0,
  };
}

function merge(base, data) {
  if (!data || typeof data !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (data[k] === undefined) continue;
    const b = base[k], d = data[k];
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    // empty defaults ({}) are open maps (levels, fails, tips): keep whatever keys were stored
    if (isObj(b) && isObj(d)) base[k] = Object.keys(b).length ? merge(b, d) : { ...d };
    else if (Array.isArray(b) === Array.isArray(d) && typeof b === typeof d) base[k] = d;
  }
  return base;
}

export class SaveStore {
  constructor(sdk) {
    this.sdk = sdk;
    this.mem = null;
    this.data = defaultSave();
    this.backend = 'memory';
  }

  readRaw() {
    let raw = null;
    // On CrazyGames the SDK data module is the single source of truth (it syncs for
    // logged-in players); localStorage is only used when the SDK is unavailable.
    if (this.sdk && this.sdk.dataAvailable()) {
      try {
        raw = this.sdk.getItem(KEY);
        this.backend = 'sdk';
      } catch (e) { raw = null; }
    }
    if (this.backend !== 'sdk') {
      try {
        raw = window.localStorage.getItem(KEY);
        this.backend = 'local';
      } catch (e) { /* storage blocked */ }
    }
    if (!raw && this.mem) raw = this.mem;
    return raw;
  }

  load() {
    const raw = this.readRaw();
    let parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    }
    this.data = merge(defaultSave(), parsed);
    this.data.visits++;
    return this.data;
  }

  save() {
    let raw;
    try { raw = JSON.stringify(this.data); } catch (e) { return false; }
    this.mem = raw;
    if (this.backend === 'sdk') {
      try { this.sdk.setItem(KEY, raw); return true; } catch (e) { /* fall back below */ }
    }
    try { window.localStorage.setItem(KEY, raw); return true; } catch (e) { return false; }
  }

  reset() {
    this.data = defaultSave();
    try { if (this.sdk && this.sdk.dataAvailable()) this.sdk.removeItem(KEY); } catch (e) { /* ignore */ }
    try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    this.mem = null;
  }
}
