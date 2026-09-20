import { RACE } from '../config.js';

/**
 * 开始 / 结束界面。
 * 只负责显示和把用户的点击转成回调，不掺和游戏逻辑。
 */
export class Overlay {
  constructor() {
    this.screen = document.getElementById('screen');
    this.card = document.getElementById('card');
    /** @type {() => void} */
    this.onStart = () => {};
    /** @type {() => void} */
    this.onRestart = () => {};

    // 把圈数提示写进开始界面
    const hint = document.getElementById('laps-hint');
    if (hint) hint.textContent = String(RACE.laps);

    document.getElementById('btn-start')?.addEventListener('click', () => {
      this.onStart();
    });
  }

  hide() { this.screen.classList.add('hidden'); }

  /** 完赛结算界面 */
  showFinish({ totalTime, bestLap, coins }) {
    this.card.innerHTML = `
      <h2>🏁 完 赛 !</h2>
      <div class="stats">
        <div><b>${totalTime.toFixed(2)}</b><span>总用时</span></div>
        <div><b>${bestLap === null ? '--' : bestLap.toFixed(2)}</b><span>最佳单圈</span></div>
        <div><b>${coins}</b><span>金币</span></div>
      </div>
      <div class="spacer"></div>
      <div class="btn" id="btn-restart">再 来 一 局</div>`;

    document.getElementById('btn-restart')?.addEventListener('click', () => {
      this.onRestart();
    });
    this.screen.classList.remove('hidden');
  }
}
