// Keyboard, touch pedals and gamepad merged into one {gas, brake} state.
const GAS_KEYS = new Set(['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW']);
const BRAKE_KEYS = new Set(['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS']);
const BLOCK_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pointers = new Map(); // pointerId -> 'gas' | 'brake'
    this.pad = { gas: 0, brake: 0 };
    this.padPrev = {};
    this.onAction = () => {};
    this.lastDevice = 'keys';
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (BLOCK_KEYS.has(e.code) && !(e.code === 'Space' && e.target && e.target.tagName === 'BUTTON' && e.target.closest('.screen'))) e.preventDefault();
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.lastDevice = 'keys';
      // a focused menu button handles Space/Enter itself (native click), so the key never fires twice
      const onButton = e.target && e.target.tagName === 'BUTTON' && e.target.closest && e.target.closest('.screen');
      if (onButton && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) return;
      if (e.repeat) {
        if (GAS_KEYS.has(e.code) || BRAKE_KEYS.has(e.code)) this.keys.add(e.code);
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.onAction('restart');
      else if (e.code === 'KeyP' || e.code === 'Escape') this.onAction('pause');
      else if (e.code === 'KeyH') this.onAction('horn');
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') this.onAction('confirm');
      else if (e.code === 'KeyM') this.onAction('mute');
      if (GAS_KEYS.has(e.code) || BRAKE_KEYS.has(e.code)) this.onAction('drive');
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (e.ctrlKey || !e.target.closest || !e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
    window.addEventListener('gamepadconnected', () => { this.lastDevice = 'pad'; });
  }

  clear() {
    this.keys.clear();
    this.pointers.clear();
    this.pad = { gas: 0, brake: 0 };
    document.querySelectorAll('.pedal.down').forEach((el) => el.classList.remove('down'));
  }

  // Touch pedals: pointer capture so sliding a finger off doesn't stick
  bindPedal(el, which) {
    const down = (e) => {
      e.preventDefault();
      this.lastDevice = 'touch';
      this.pointers.set(e.pointerId, which);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.classList.add('down');
      this.onAction('drive');
      this.onAction('unlock');
    };
    const up = (e) => {
      if (this.pointers.get(e.pointerId) === which) this.pointers.delete(e.pointerId);
      if (![...this.pointers.values()].includes(which)) el.classList.remove('down');
      this.onAction('unlock');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gas = 0, brake = 0;
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      const a = p.buttons[0] && p.buttons[0].pressed;
      const dr = p.buttons[15] && p.buttons[15].pressed;
      const dl = p.buttons[14] && p.buttons[14].pressed;
      gas = Math.max(gas, rt, ax > 0.35 ? ax : 0, dr || a ? 1 : 0);
      brake = Math.max(brake, lt, ax < -0.35 ? -ax : 0, dl ? 1 : 0);
      const edge = (i, name) => {
        const pr = p.buttons[i] && p.buttons[i].pressed;
        const key = p.index + ':' + i;
        if (pr && !this.padPrev[key]) this.onAction(name);
        this.padPrev[key] = pr;
      };
      edge(9, 'pause');
      edge(3, 'restart');
      edge(0, 'confirm');
      edge(2, 'horn');
      if (gas > 0.1 || brake > 0.1) this.lastDevice = 'pad';
    }
    this.pad.gas = gas;
    this.pad.brake = brake;
  }

  state() {
    let gas = 0, brake = 0;
    if (this.enabled) {
      for (const k of this.keys) {
        if (GAS_KEYS.has(k)) gas = 1;
        if (BRAKE_KEYS.has(k)) brake = 1;
      }
      for (const w of this.pointers.values()) {
        if (w === 'gas') gas = 1;
        else brake = 1;
      }
      gas = Math.max(gas, this.pad.gas);
      brake = Math.max(brake, this.pad.brake);
    }
    // both pressed -> gas wins in the air (tilt) handled by sim; on ground treat as gas
    if (gas > 0 && brake > 0) return { gas, brake: 0 };
    return { gas: gas > 0.1 ? gas : 0, brake: brake > 0.1 ? brake : 0 };
  }
}
