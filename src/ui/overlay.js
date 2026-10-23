import { RACE } from '../config.js';
import { SKINS } from '../game/skins.js';

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
    /** @type {(skinId: string) => void} */
    this.onSkinChange = () => {};
    /** 开始界面里显示历史最佳的那一行 */
    this.recordLine = document.getElementById('record-line');

    // 把圈数提示写进开始界面
    const hint = document.getElementById('laps-hint');
    if (hint) hint.textContent = String(RACE.laps);

    // 皮肤选择器：自己建 DOM，插在"开始比赛"按钮前面
    this.skinButtons = new Map();
    this.skinList = this.#buildSkinPicker();
    const startButton = document.getElementById('btn-start');
    if (startButton) this.card?.insertBefore(this.skinList, startButton);
    else this.card?.append(this.skinList);

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

  /** 造出"选座驾"这一排按钮 */
  #buildSkinPicker() {
    const list = document.createElement('div');
    list.className = 'skins';

    const label = document.createElement('div');
    label.className = 'skins-label';
    label.textContent = '选 座 驾';

    const row = document.createElement('div');
    row.className = 'skins-row';

    for (const skin of SKINS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skin-btn';
      button.dataset.skin = skin.id;
      button.title = skin.description;

      const icon = document.createElement('span');
      icon.className = 'skin-icon';
      icon.textContent = skin.icon;

      const name = document.createElement('span');
      name.className = 'skin-name';
      name.textContent = skin.name;

      button.append(icon, name);
      button.addEventListener('click', () => this.onSkinChange(skin.id));

      row.append(button);
      this.skinButtons.set(skin.id, button);
    }

    list.append(label, row);
    return list;
  }

  /**
   * 高亮当前选中的皮肤。
   * @param {string} skinId
   */
  setSkin(skinId) {
    for (const [id, button] of this.skinButtons) {
      button.classList.toggle('active', id === skinId);
    }
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

    // 把皮肤选择器一起放回结算界面：赛完一局正好换辆车再战
    this.card.replaceChildren(title, stats, note, spacer, this.skinList, restart, clearLine);
    this.screen.classList.remove('hidden');
  }
}
