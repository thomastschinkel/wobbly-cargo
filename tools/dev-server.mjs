// Dev server: rebuilds (unminified) whenever the page is loaded and serves dist/.
// Usage: node tools/dev-server.mjs [port]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildAll } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };

export function serve(dir, port, onPage) {
  const server = http.createServer(async (req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    try { if (onPage && url.endsWith('.html')) await onPage(url); } catch (e) { console.error(e.message); }
    const file = path.join(dir, path.normalize(url));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.argv[2] || 8080);
  const dist = path.join(root, 'dist');
  await buildAll({ minify: false });
  await serve(dist, port, (url) => (url === '/index.html' ? buildAll({ minify: false }) : null));
  console.log(`Wobbly Cargo dev server: http://localhost:${port}/`);
}
