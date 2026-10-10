import { RACE } from '../config.js';

/**
 * 开始 / 结束界面。
 * 只负责显示和把用户的点击转成回调，不掺和游戏逻辑。
 *
 * 【为什么全部用 createElement 而不是 innerHTML】结算界面的内容每次都要整块重建，
 * 拼字符串虽然短，但只要以后有人往里塞了用户名、时间戳之类的外部文本，
 * 就是一个 XSS 口子。改用 DOM API 从源头上没有这个问题，也让事件绑定更直接。
 */
export class Overlay {
  constructor() {
    this.screen = document.getElementById('screen');
    this.card = document.getElementById('card');
    /** @type {() => void} */
    this.onStart = () => {};
    /** @type {() => void} */
    this.onRestart = () => {};
    /** @type {() => void} */
    this.onClearRecords = () => {};
    /** 开始界面里显示历史最佳的那一行 */
    this.recordLine = document.getElementById('record-line');

    // 把圈数提示写进开始界面
    const hint = document.getElementById('laps-hint');
    if (hint) hint.textContent = String(RACE.laps);

    document.getElementById('btn-start')?.addEventListener('click', () => {
      this.onStart();
    });

    // 事件委托：结算界面每次都会重建，直接给按钮挂监听会在重建后失效，
    // 委托给一直存在的 card 就没这个问题。
    this.card?.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('#btn-clear')) {
        this.onClearRecords();
      }
    });
  }

  hide() { this.screen.classList.add('hidden'); }

  /**
   * 刷新开始界面上的历史最佳文字。
   * @param {{bestLapTime?:number, bestTotalTime?:number, ghost?:object}|null} record
   */
  setBest(record) {
    if (!this.recordLine) return;
    if (!record) {
      this.recordLine.textContent = '还没有记录：跑完一圈就会自动存下来';
      return;
    }
    const lap = record.bestLapTime ? `${record.bestLapTime.toFixed(2)}s` : '--';
    const total = record.bestTotalTime ? `${record.bestTotalTime.toFixed(2)}s` : '--';
    // 幽灵车录的是"整场"：它会和你一起静止起步、跑完全程
    this.recordLine.textContent = `历史最佳 · 单圈 ${lap} · 总用时 ${total} · 幽灵车全程陪跑`;
  }

  /** 完赛结算界面 */
  showFinish({ totalTime, bestLap, coins, previousBestTotal = null, isNewRecord = false }) {
    const stats = document.createElement('div');
    stats.className = 'stats';
    const items = [
      [totalTime.toFixed(2), '总用时'],
      [bestLap === null ? '--' : bestLap.toFixed(2), '最佳单圈'],
      [String(coins), '金币'],
    ];
    for (const [value, label] of items) {
      const box = document.createElement('div');
      const number = document.createElement('b');
      number.textContent = value;
      const caption = document.createElement('span');
      caption.textContent = label;
      box.append(number, caption);
      stats.append(box);
    }

    const title = document.createElement('h2');
    title.textContent = '🏁 完 赛 !';

    const note = document.createElement('p');
    if (isNewRecord) {
      note.className = 'record';
      note.textContent = '🎉 新 纪 录 ！';
    } else {
      note.className = 'dim';
      const previous = previousBestTotal === null ? '--' : previousBestTotal.toFixed(2);
      note.textContent = `历史最佳总用时 ${previous}`;
    }

    const spacer = document.createElement('div');
    spacer.className = 'spacer';

    const restart = document.createElement('div');
    restart.className = 'btn';
    restart.id = 'btn-restart';
    restart.textContent = '再 来 一 局';
    restart.addEventListener('click', () => this.onRestart());

    const clearLine = document.createElement('p');
    clearLine.className = 'dim';
    const clear = document.createElement('span');
    clear.className = 'link';
    clear.id = 'btn-clear';
    clear.textContent = '清除最佳记录';
    clearLine.append(clear);

    this.card.replaceChildren(title, stats, note, spacer, restart, clearLine);
    this.screen.classList.remove('hidden');
  }
}
