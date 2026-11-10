import { Game } from './game/game';
import './ui/styles.css';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

try {
  const game = new Game(canvas, ui);
  // Used by the headless browser test.
  (window as unknown as { __game: Game }).__game = game;
} catch (err) {
  ui.innerHTML = `<div class="screen solid"><div class="inner"><h2 class="head">This device cannot start the 3D view</h2><p class="sub">${String(err)}</p></div></div>`;
  throw err;
}
