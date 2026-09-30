// Defensive wrapper around the CrazyGames HTML5 SDK v3.
// Every call is guarded: the game must work identically with the SDK missing,
// blocked, disabled, throwing, or never calling back.

const INIT_TIMEOUT = 6000;
const AD_START_TIMEOUT = 10000;
const AD_MAX_DURATION = 120000;
const MIDGAME_GAP = 185000; // SDK enforces ~3 min; avoid wasted requests

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

class SDKWrapper {
  constructor() {
    this.sdk = null;
    this.env = 'none';
    this.ready = false;
    this.playing = false;
    this.loading = false;
    this.inAd = false;
    this.adState = 'unknown'; // unknown | enabled | disabled
    this.lastMidgame = 0;
    this.onAdStart = () => {};
    this.onAdEnd = () => {};
    this.onMuteChange = () => {};
    this.muted = false;
    this.log = [];
  }

  note(msg) {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
  }

  async init() {
    const g = typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK;
    if (!g || typeof g.init !== 'function') {
      this.note('sdk:missing');
      return false;
    }
    try {
      await withTimeout(g.init(), INIT_TIMEOUT);
    } catch (e) {
      this.note('sdk:init-failed ' + (e && e.message));
      return false;
    }
    let env = 'none';
    try { env = g.environment; } catch (e) { env = 'none'; }
    this.env = env || 'none';
    if (this.env === 'disabled' || this.env === 'none') {
      this.note('sdk:env ' + this.env);
      return false;
    }
    this.sdk = g;
    this.ready = true;
    this.note('sdk:ready ' + this.env);
    try {
      this.muted = !!(g.game && g.game.settings && g.game.settings.muteAudio);
      if (g.game && typeof g.game.addSettingsChangeListener === 'function') {
        g.game.addSettingsChangeListener((s) => {
          this.muted = !!(s && s.muteAudio);
          this.onMuteChange(this.muted);
        });
      }
    } catch (e) { /* ignore */ }
    try {
      const p = g.ad && typeof g.ad.hasAdblock === 'function' ? g.ad.hasAdblock() : null;
      if (p && p.then) {
        withTimeout(p, 5000).then((blocked) => {
          if (blocked) { this.adState = 'disabled'; this.note('ads:adblock'); }
        }).catch(() => {});
      }
    } catch (e) { /* ignore */ }
    return true;
  }

  call(fn) {
    if (!this.ready) return;
    try { fn(this.sdk); } catch (e) { this.note('sdk:call-error ' + (e && e.message)); }
  }

  loadingStart() {
    if (this.loading) return;
    this.loading = true;
    this.call((s) => s.game.loadingStart());
  }

  loadingStop() {
    if (!this.loading) return;
    this.loading = false;
    this.call((s) => s.game.loadingStop());
  }

  gameplayStart() {
    if (this.playing || this.inAd) return;
    this.playing = true;
    this.note('gameplayStart');
    this.call((s) => s.game.gameplayStart());
  }

  gameplayStop() {
    if (!this.playing) return;
    this.playing = false;
    this.note('gameplayStop');
    this.call((s) => s.game.gameplayStop());
  }

  happytime() {
    this.note('happytime');
    this.call((s) => s.game.happytime());
  }

  // ---------- data module ----------
  dataAvailable() {
    if (!this.ready) return false;
    try { return !!(this.sdk.data && typeof this.sdk.data.getItem === 'function'); } catch (e) { return false; }
  }

  getItem(k) { return this.sdk.data.getItem(k); }
  setItem(k, v) { this.sdk.data.setItem(k, v); }
  removeItem(k) { this.sdk.data.removeItem(k); }

  // ---------- ads ----------
  canRewarded() {
    // 'unknown' counts as available: Basic Launch reports adsDisabledBasicLaunch on the first try
    return this.ready && this.adState !== 'disabled' && !this.inAd;
  }

  midgameDue() {
    return this.ready && this.adState !== 'disabled' && !this.inAd && Date.now() - this.lastMidgame > MIDGAME_GAP;
  }

  noteAdError(code) {
    if (code === 'adsDisabledBasicLaunch' || code === 'adblock') this.adState = 'disabled';
    else if ((code === 'unfilled' || code === 'adCooldown') && this.adState === 'unknown') this.adState = 'enabled';
    this.note('ad:error ' + code);
  }

  // Resolves {ok, code}. Never rejects. Mutes/pauses via onAdStart/onAdEnd.
  requestAd(type) {
    return new Promise((resolve) => {
      if (!this.ready || this.inAd || this.adState === 'disabled') {
        resolve({ ok: false, code: 'unavailable' });
        return;
      }
      if (type === 'midgame') this.lastMidgame = Date.now();
      this.inAd = true;
      let settled = false;
      let started = false;
      let tStart = null, tMax = null;
      const end = (res) => {
        clearTimeout(tStart);
        clearTimeout(tMax);
        if (started) { started = false; this.onAdEnd(); }
        if (settled) return;
        settled = true;
        this.inAd = false;
        this.note('ad:' + type + ' ' + (res.ok ? 'finished' : res.code));
        resolve(res);
      };
      tStart = setTimeout(() => end({ ok: false, code: 'timeout' }), AD_START_TIMEOUT);
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => {
            clearTimeout(tStart);
            this.adState = 'enabled';
            if (!started) { started = true; this.onAdStart(); }
            if (!settled) tMax = setTimeout(() => end({ ok: false, code: 'timeout' }), AD_MAX_DURATION);
            else {
              // late start after we gave up: still mute until it ends
              tMax = setTimeout(() => end({ ok: false, code: 'late' }), AD_MAX_DURATION);
            }
          },
          adFinished: () => end({ ok: true }),
          adError: (err) => {
            const code = (err && (err.code || err.message)) || 'other';
            this.noteAdError(String(code));
            end({ ok: false, code: String(code) });
          },
        });
      } catch (e) {
        this.noteAdError('other');
        end({ ok: false, code: 'exception' });
      }
    });
  }
}

export const sdk = new SDKWrapper();
