// Entry point: boot screen, then hand over to the game shell.
import { Game } from './app.js';

const bootEl = document.getElementById('boot');
const bar = bootEl && bootEl.querySelector('.bar i');
const progress = (p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; };

function hideBoot() {
  if (!bootEl) return;
  bootEl.classList.add('fade');
  setTimeout(() => bootEl.remove(), 400);
}

const game = new Game();
window.__wobbly = game; // handy for automated tests
game.boot(progress).then(hideBoot).catch((e) => {
  console.error(e);
  hideBoot();
  try { game.openTitle(); } catch (err) { /* nothing else to do */ }
});
