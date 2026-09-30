// Songs as compact text: chord charts, melodies ("e5:4" = note:length in 16ths, "-" rest, "|" bar check),
// and per-bar patterns for drums / bass / strums / arps. compileSong() flattens them into note events.
import { rng } from './dsp.js';

const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 9: [0, 4, 7, 10, 14], '7sus4': [0, 5, 7, 10],
};

export function noteNum(tok) {
  const m = /^([a-g])(#|b)?(\d)$/.exec(tok);
  if (!m) throw new Error('bad note ' + tok);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

function parseChord(sym) {
  const m = /^([A-G])(#|b)?(.*)$/.exec(sym);
  if (!m || !QUAL[m[3]]) throw new Error('bad chord ' + sym);
  return { root: (PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, iv: QUAL[m[3]] };
}

// "C | Am | F,G | C" -> [{s, e, ch}] in 16th steps
function parseBars(str) {
  const spans = [];
  str.split('|').map((b) => b.trim()).forEach((bar, bi) => {
    const cs = bar.split(',').map((c) => c.trim());
    const w = 16 / cs.length;
    cs.forEach((c, k) => spans.push({ s: bi * 16 + k * w, e: bi * 16 + (k + 1) * w, ch: parseChord(c) }));
  });
  return spans;
}

function parseMel(str) {
  const notes = [];
  let pos = 0, len = 4;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') {
      if (pos % 16) throw new Error(`melody bar misaligned at step ${pos}: ${str.slice(0, 40)}`);
      continue;
    }
    const [n, l] = tok.split(':');
    if (l) len = +l;
    if (n !== '-') notes.push({ s: pos, n: noteNum(n), l: len });
    pos += len;
  }
  return { notes, steps: pos };
}

// chord tones placed in the octave nearest to `center` (rootless: leave the root to the bass)
function voicing(ch, center, rootless = false) {
  const iv = rootless && ch.iv.length > 3 ? ch.iv.slice(1) : ch.iv;
  return iv.map((iv) => {
    let n = ch.root + iv;
    while (n < center - 6) n += 12;
    while (n >= center + 6) n -= 12;
    return n;
  }).sort((a, b) => a - b);
}

const VEL = { x: 1, o: 0.62, g: 0.36 };

export function compileSong(song) {
  const r = rng(song.bpm * 7 + 3);
  const parts = [];
  for (const which of [song.order.slice(0, song.loop), song.order.slice(song.loop)]) {
    const ev = [];
    let bar0 = 0;
    for (const name of which) {
      let sec = song.sections[name];
      if (sec.from) sec = { ...song.sections[sec.from], ...sec };
      const spans = parseBars(sec.bars);
      const nBars = Math.ceil(spans[spans.length - 1].e / 16);
      const chordAt = (s) => (spans.find((sp) => s >= sp.s && s < sp.e) || spans[spans.length - 1]).ch;
      const base = bar0 * 16;
      const push = (L, s, n, l, v, extra) => ev.push({
        t: base + s, i: L.inst, n, l, v: v * (L.vol ?? 0.5) * (0.92 + r() * 0.16), p: L.pan ?? 0, rv: L.rev ?? 0.2, ...extra,
      });
      for (const lname of sec.play) {
        const L = song.layers[lname];
        if (!L) throw new Error('missing layer ' + lname);
        if (L.type === 'mel') {
          const src = sec[L.src || 'mel'];
          if (!src) continue;
          const { notes, steps } = parseMel(src);
          if (steps !== nBars * 16) throw new Error(`${name}.${L.src || 'mel'} has ${steps} steps, chords have ${nBars * 16}`);
          for (const nt of notes) {
            const n = nt.n + (L.tr || 0);
            if (L.trem && nt.l >= 4) for (let k = 0; k < nt.l; k++) push(L, nt.s + k, n, 1, k ? 0.72 : 1);
            else push(L, nt.s, n, nt.l, 1);
          }
        } else if (L.type === 'drums') {
          for (let b = 0; b < nBars; b++) {
            let lines = L.lines;
            if (b === 0 && L.first && !sec.noCrash) lines = { ...lines, ...L.first };
            if (b === nBars - 1 && sec.fill && L.fill) lines = { ...lines, ...L.fill };
            for (const [drum, pat] of Object.entries(lines)) {
              const off = (b % (pat.length / 16)) * 16;
              for (let k = 0; k < 16; k++) {
                const c = pat[off + k];
                if (VEL[c]) push({ ...L, inst: drum, vol: (L.vol ?? 0.5) * (L.mix?.[drum] ?? 1) }, b * 16 + k, null, 1, VEL[c]);
              }
            }
          }
        } else if (L.type === 'bass' || L.type === 'comp' || L.type === 'arp') {
          const pat = L.pat;
          for (let b = 0; b < nBars; b++) {
            const off = (b % (pat.length / 16)) * 16;
            for (let k = 0; k < 16; k++) {
              const c = pat[off + k];
              if (c === '.' || c === '-') continue;
              let len = 1;
              while (k + len < 16 && pat[off + k + len] === '.') len++;
              const s = b * 16 + k, ch = chordAt(s);
              if (L.type === 'bass') {
                let root = ch.root;
                const lo = L.lo ?? 33;
                while (root < lo) root += 12;
                while (root >= lo + 12) root -= 12;
                const add = { R: 0, 3: ch.iv[1], 5: ch.iv[2], 7: ch.iv[3] ?? 10, 8: 12, L: -12 }[c] ?? 0;
                push(L, s, root + add, Math.min(len, L.max ?? 16), VEL[c] ?? 1);
              } else if (L.type === 'comp') {
                const notes = voicing(ch, L.center ?? 64, L.rootless);
                const up = c === 'u';
                const list = up ? notes.slice().reverse() : notes;
                list.forEach((n, j) => push(L, s, n, len, (c === 'o' || up ? 0.6 : 1) * (1 - j * 0.06), { off: j * (L.strum ?? 0.012) }));
              } else {
                const v = voicing(ch, L.center ?? 60);
                const tones = v.concat(v.map((n) => n + 12));
                push(L, s, tones[+c % tones.length], Math.min(len, 4), 1);
              }
            }
          }
        } else if (L.type === 'pad') {
          for (const sp of spans) for (const n of voicing(sp.ch, L.center ?? 60)) push(L, sp.s, n, sp.e - sp.s, 1);
        }
      }
      bar0 += nBars;
    }
    ev.sort((a, b) => a.t - b.t);
    parts.push({ events: ev, steps: bar0 * 16 });
  }
  return { bpm: song.bpm, swing: song.swing || 0, intro: parts[0], body: parts[1] };
}

// ---------------------------------------------------------------------------------------------
// Tuned to be easy on the ears: slow lazy tempos, mid-register melodies, warm electric piano,
// nylon guitar and soft marimba, brushed drums, no cymbals or bright hats.
const kitSoft = (lines, mix) => ({ type: 'drums', vol: 0.42, rev: 0.12, lines, mix });
const LOFI = { kick: 'x.........x.....', snare: '....x.......x...', shaker: 'g.g.g.g.g.g.g.g.' };
const LOFI_MIX = { snare: 0.55, shaker: 0.35 };

export const SONGS = {
  // lazy lo-fi afternoon: rolled Rhodes chords, marimba tune
  title: {
    bpm: 78, swing: 0.24, loop: 1,
    layers: {
      kit: kitSoft(LOFI, LOFI_MIX),
      bass: { type: 'bass', inst: 'bass', pat: 'R.....R...5.....', vol: 0.7, rev: 0.05 },
      keys: { type: 'comp', inst: 'ep', pat: 'x.........o.....', center: 62, rootless: true, vol: 0.3, pan: -0.2, strum: 0.03, rev: 0.35 },
      mel: { type: 'mel', inst: 'marimba', vol: 0.42, pan: 0.15, rev: 0.3 },
      nylon: { type: 'mel', inst: 'nylon', src: 'mel2', vol: 0.4, pan: 0.2, rev: 0.3 },
    },
    sections: {
      I: { bars: 'Fmaj7 | Em7', play: ['keys'] },
      A: {
        bars: 'Fmaj7 | Em7 | Dm7 | Cmaj7 | Bbmaj7 | Am7 | Gm7 | C7', play: ['kit', 'bass', 'keys', 'mel'],
        mel: '-:4 a4:4 c5:6 e5:2 | d5:8 b4:4 -:4 | -:4 f4:4 a4:4 c5:4 | b4:12 -:4 | -:4 d5:4 f5:6 a5:2 | g5:8 e5:4 -:4 | -:2 f5:2 d5:4 bb4:4 g4:4 | e4:4 g4:4 bb4:8',
      },
      B: {
        bars: 'Bbmaj7 | C7 | Am7 | Dm7 | Gm7 | C7 | Fmaj7 | C7', play: ['kit', 'bass', 'keys', 'nylon'],
        mel2: 'f5:6 d5:2 a4:8 | g4:4 bb4:4 e5:8 | c5:6 a4:2 e4:8 | f4:4 a4:4 c5:4 d5:4 | bb4:6 a4:2 f4:8 | e4:4 g4:4 bb4:4 c5:4 | a4:12 -:4 | -:8 g4:4 bb4:4',
      },
    },
    order: ['I', 'A', 'B', 'A', 'B'],
  },

  // world 1: sunny stroll: nylon guitar picking, marimba tune
  meadow: {
    bpm: 84, swing: 0.2, loop: 0,
    layers: {
      kit: kitSoft(LOFI, LOFI_MIX),
      bass: { type: 'bass', inst: 'bass', pat: 'R.......5.....R.', vol: 0.68, rev: 0.05 },
      pick: { type: 'arp', inst: 'nylon', pat: '0.1.2.3.2.1.2.1.', center: 57, vol: 0.26, pan: -0.25, rev: 0.3 },
      keys: { type: 'comp', inst: 'ep', pat: 'x...............', center: 64, rootless: true, vol: 0.18, pan: 0.25, strum: 0.03, rev: 0.4 },
      mel: { type: 'mel', inst: 'marimba', vol: 0.42, pan: 0.1, rev: 0.28 },
    },
    sections: {
      A: {
        bars: 'Gmaj7 | Cmaj7 | Gmaj7 | Cmaj7 | Em7 | Am7 | D7sus4 | D7', play: ['kit', 'bass', 'pick', 'mel'],
        mel: '-:4 b4:4 d5:4 f#5:4 | e5:8 -:4 d5:2 c5:2 | b4:6 a4:2 g4:8 | -:4 e4:4 g4:4 b4:4 | d5:6 b4:2 g4:8 | c5:6 e5:2 g5:8 | -:4 a4:4 g4:4 d5:4 | f#4:8 -:8',
      },
      B: {
        bars: 'Cmaj7 | Bm7 | Am7 | Gmaj7 | Cmaj7 | Bm7 | Am7,D7 | Gmaj7', play: ['kit', 'bass', 'pick', 'keys', 'mel'],
        mel: 'g5:6 e5:2 b4:8 | a4:4 d5:4 f#5:8 | e5:6 c5:2 a4:8 | b4:4 d5:4 f#4:8 | -:4 c5:4 e5:4 g5:4 | f#5:8 d5:4 b4:4 | c5:4 a4:4 f#4:4 a4:4 | g4:12 -:4',
      },
      A2: { from: 'A', play: ['kit', 'bass', 'pick', 'keys', 'mel'] },
    },
    order: ['A', 'B', 'A2', 'B'],
  },

  // world 2: desert dusk: fingerpicked nylon, soft flute, rim clicks
  canyon: {
    bpm: 76, swing: 0.14, loop: 1,
    layers: {
      kit: kitSoft({ kick: 'x.......x.......', rim: '....x.......x...', shaker: 'g...g...g...g.g.' }, { rim: 0.4, shaker: 0.35 }),
      bass: { type: 'bass', inst: 'bass', pat: 'R.......5.......', vol: 0.7, rev: 0.06 },
      pick: { type: 'arp', inst: 'nylon', pat: '0.2.1.2.0.2.1.2.', center: 57, vol: 0.28, pan: -0.25, rev: 0.35 },
      flute: { type: 'mel', inst: 'flute', vol: 0.3, pan: 0.15, rev: 0.45 },
      low: { type: 'mel', inst: 'nylon', vol: 0.22, pan: 0.3, rev: 0.35, tr: -12 },
    },
    sections: {
      I: { bars: 'Am | Am', play: ['pick'] },
      A: {
        bars: 'Am | G | F | E7 | Am | G | F | E7', play: ['kit', 'bass', 'pick', 'flute'],
        mel: 'e5:6 c5:2 a4:8 | d5:6 b4:2 g4:8 | c5:4 a4:4 f4:4 a4:4 | b4:12 -:4 | a4:4 c5:4 e5:6 d5:2 | d5:6 b4:2 g4:8 | f4:4 a4:4 c5:4 b4:2 a4:2 | g#4:12 -:4',
      },
      B: {
        bars: 'Dm | Am | Dm | E7 | F | C | Dm,E7 | Am', play: ['kit', 'bass', 'pick', 'flute', 'low'],
        mel: 'f5:6 e5:2 d5:8 | c5:6 b4:2 a4:8 | d5:4 f5:4 a5:6 g5:2 | g#5:6 e5:2 b4:8 | a4:4 c5:4 f5:8 | e5:6 d5:2 c5:8 | d5:4 f5:4 e5:4 g#4:4 | a4:12 -:4',
      },
    },
    order: ['I', 'A', 'B', 'A', 'B'],
  },

  // world 3: quiet snowfall: warm pad, Rhodes, music-box marimba, barely-there drums
  snow: {
    bpm: 70, swing: 0.2, loop: 1,
    layers: {
      kit: kitSoft({ kick: 'x.......x.......', shaker: 'g...g...g...g...' }, { kick: 0.7, shaker: 0.35 }),
      bass: { type: 'bass', inst: 'bass', pat: 'R...............', vol: 0.6, rev: 0.1 },
      pad: { type: 'pad', inst: 'pad', center: 60, vol: 0.1, rev: 0.5 },
      keys: { type: 'comp', inst: 'ep', pat: 'x.......o.......', center: 62, rootless: true, vol: 0.26, pan: -0.2, strum: 0.04, rev: 0.45 },
      mel: { type: 'mel', inst: 'marimba', vol: 0.36, pan: 0.2, rev: 0.45 },
    },
    sections: {
      I: { bars: 'Dmaj7 | Dmaj7', play: ['pad', 'keys'] },
      A: {
        bars: 'Dmaj7 | Gmaj7 | Bm7 | Gmaj7 | Dmaj7 | Gmaj7 | Em7 | A7sus4', play: ['pad', 'keys', 'bass', 'mel'],
        mel: 'f#5:8 e5:4 c#5:4 | d5:8 b4:8 | -:4 a4:4 d5:4 f#5:4 | e5:12 -:4 | a5:8 f#5:4 c#5:4 | b4:8 d5:4 f#5:4 | g5:6 f#5:2 e5:8 | d5:12 -:4',
      },
      B: {
        bars: 'Gmaj7 | F#m7 | Em7 | Dmaj7 | Gmaj7 | F#m7 | Em7 | A7sus4', play: ['kit', 'pad', 'keys', 'bass', 'mel'],
        mel: 'b4:4 d5:4 f#5:8 | e5:4 c#5:4 a4:8 | g4:4 b4:4 d5:8 | c#5:12 -:4 | -:4 d5:4 f#5:4 a5:4 | a5:8 e5:8 | g5:4 f#5:4 e5:4 d5:4 | e5:12 -:4',
      },
    },
    order: ['I', 'A', 'B', 'A', 'B'],
  },

  // world 4: warm embers: low marimba ostinato, soft log drums, nylon melody
  volcano: {
    bpm: 82, swing: 0.12, loop: 1,
    layers: {
      kit: kitSoft({ kick: 'x.........x.....', snare: '....x.......x...', log: 'x..x..x.....x...' }, { snare: 0.5, log: 0.45 }),
      logs: kitSoft({ log: 'x..x..x.....x...', shaker: 'g.g.g.g.g.g.g.g.' }, { log: 0.45, shaker: 0.3 }),
      bass: { type: 'bass', inst: 'bass', pat: 'R.....R.....5...', vol: 0.7, rev: 0.05 },
      ost: { type: 'arp', inst: 'marimba', pat: '0..1..2.0..1..2.', center: 52, vol: 0.3, pan: -0.25, rev: 0.25 },
      keys: { type: 'comp', inst: 'ep', pat: 'x.......o.......', center: 62, rootless: true, vol: 0.18, pan: 0.25, strum: 0.03, rev: 0.4 },
      mel: { type: 'mel', inst: 'nylon', vol: 0.42, pan: 0.15, rev: 0.35 },
    },
    sections: {
      I: { bars: 'Dm7 | Dm7', play: ['logs', 'ost'] },
      A: {
        bars: 'Dm7 | G7 | Dm7 | G7 | Bbmaj7 | Am7 | Gm7 | A7sus4', play: ['kit', 'bass', 'ost', 'mel'],
        mel: 'a4:6 f4:2 d4:8 | b4:6 a4:2 f4:8 | c5:4 a4:4 f4:4 e4:4 | d4:12 -:4 | d5:6 c5:2 a4:8 | c5:6 b4:2 g4:8 | bb4:4 a4:4 g4:4 f4:4 | e4:12 -:4',
      },
      B: {
        bars: 'Gm7 | C7 | Fmaj7 | Bbmaj7 | Em7 | A7 | Dm7 | Dm7', play: ['kit', 'bass', 'ost', 'keys', 'mel'],
        mel: 'd5:6 bb4:2 g4:8 | e5:6 d5:2 bb4:8 | c5:4 a4:4 e5:8 | d5:12 -:4 | g4:4 b4:4 d5:8 | c#5:6 e5:2 g5:8 | f5:6 e5:2 d5:8 | a4:12 -:4',
      },
    },
    order: ['I', 'A', 'B', 'A', 'B'],
  },

  // world 5: starlight drift: slow pad, soft synth arp, flute
  moon: {
    bpm: 72, swing: 0, loop: 1,
    layers: {
      kit: kitSoft({ kick: 'x.......x.......', rim: '....x.......x...', shaker: 'g.g.g.g.g.g.g.g.' }, { kick: 0.8, rim: 0.3, shaker: 0.3 }),
      bass: { type: 'bass', inst: 'bass', pat: 'R.......R...5...', vol: 0.65, rev: 0.08 },
      arp: { type: 'arp', inst: 'synpluck', pat: '0.1.2.3.4.3.2.1.', center: 62, vol: 0.14, pan: -0.25, rev: 0.5 },
      pad: { type: 'pad', inst: 'pad', center: 60, vol: 0.1, rev: 0.6 },
      flute: { type: 'mel', inst: 'flute', vol: 0.3, pan: 0.15, rev: 0.5 },
    },
    sections: {
      I: { bars: 'Em9 | Em9', play: ['pad', 'arp'] },
      A: {
        bars: 'Em9 | Cmaj7 | Gmaj7 | D6 | Em9 | Cmaj7 | Am7 | Bm7', play: ['bass', 'arp', 'pad', 'flute'],
        mel: 'b4:8 d5:4 f#5:4 | e5:12 -:4 | d5:6 b4:2 g4:8 | a4:8 b4:4 f#4:4 | g4:4 b4:4 d5:4 e5:4 | g5:8 e5:8 | c5:6 b4:2 a4:8 | f#4:12 -:4',
      },
      B: {
        bars: 'Cmaj7 | Bm7 | Am7 | Gmaj7 | Cmaj7 | Bm7 | Am7 | Bm7', play: ['kit', 'bass', 'arp', 'pad', 'flute'],
        mel: 'e4:4 g4:4 b4:8 | a4:4 f#4:4 d4:8 | c5:4 e5:4 g5:8 | f#5:12 -:4 | -:4 b4:4 c5:4 e5:4 | d5:6 c#5:2 b4:8 | a4:4 c5:4 e5:4 g5:4 | f#5:12 -:4',
      },
    },
    order: ['I', 'A', 'B', 'A', 'B'],
  },
};
