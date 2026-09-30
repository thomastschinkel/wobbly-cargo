// Production build: bundle + minify into dist/, copy static files, zip for upload.
// Usage: node tools/build.mjs
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

export async function buildAll({ minify = true } = {}) {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  await build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    minify,
    format: 'iife',
    target: ['es2020', 'chrome80', 'safari15', 'firefox78'],
    outfile: path.join(dist, 'game.js'),
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'warning',
  });
  fs.copyFileSync(path.join(root, 'src/index.html'), path.join(dist, 'index.html'));
  const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
  fs.writeFileSync(path.join(dist, 'style.css'), minify ? minifyCss(css) : css);
  fs.copyFileSync(path.join(root, 'src/assets/lilita-one.woff2'), path.join(dist, 'assets/lilita-one.woff2'));
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

// Minimal zip writer (deflate), so packaging needs no extra dependency.
function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipDir(dir, out) {
  const files = [];
  const walk = (d, rel) => {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      const r = rel ? rel + '/' + f : f;
      if (fs.statSync(p).isDirectory()) walk(p, r);
      else files.push([r, fs.readFileSync(p)]);
    }
  };
  walk(dir, '');
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  fs.writeFileSync(out, Buffer.concat([...parts, cd, end]));
  return files.length;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const t0 = Date.now();
  await buildAll();
  const zipPath = path.join(root, 'wobbly-cargo.zip');
  const n = zipDir(dist, zipPath);
  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' KB';
  console.log(`built dist/ in ${Date.now() - t0} ms: game.js ${kb(path.join(dist, 'game.js'))}, upload zip ${kb(zipPath)} (${n} files)`);
}
