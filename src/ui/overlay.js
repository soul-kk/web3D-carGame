import { RACE } from '../config.js';

/** 世界画布之上的菜单与对话框；只负责 DOM 和按钮事件。 */
export class Overlay {
  constructor() {
    this.screen = document.getElementById('screen');
    this.menu = document.getElementById('menu');
    this.card = document.getElementById('card');
    this.recordLine = document.getElementById('record-line');
    this.view = 'menu';
    this.previousFocus = null;
    this.onStart = () => {};
    this.onRestart = () => {};
    this.onReturn = () => {};
    this.onPause = () => {};
    this.onResume = () => {};
    this.onConfirmReturn = () => {};
    this.onClearRecords = () => {};

    document.getElementById('btn-start').addEventListener('click', () => this.onStart());
    document.getElementById('btn-help').addEventListener('click', () => this.showInstructions());
    document.getElementById('btn-clear').addEventListener('click', () => this.onClearRecords());
    document.getElementById('btn-pause').addEventListener('click', () => this.onPause());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.view === 'instructions') this.closeInstructions();
    });
    this.card.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const buttons = [...this.card.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault(); buttons.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault(); buttons[0].focus();
      }
    });
  }

  #button(label, action, className = 'btn') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  #dialog(title, children, view) {
    if (!this.card.contains(document.activeElement)) this.previousFocus = document.activeElement;
    const heading = document.createElement('h2');
    heading.id = 'dialog-title';
    heading.textContent = title;
    this.card.replaceChildren(heading, ...children);
    this.view = view;
    this.menu.classList.add('hidden');
    this.card.classList.remove('hidden');
    this.screen.classList.remove('hidden', 'menu-screen');
    this.screen.classList.toggle('pause-screen', view === 'pause' || view === 'confirm');
    this.card.querySelector('button')?.focus();
  }

  showMenu() {
    this.view = 'menu';
    this.screen.className = 'menu-screen';
    this.card.classList.add('hidden');
    this.menu.classList.remove('hidden');
    document.getElementById('btn-start').focus();
  }

  hide() {
    this.view = 'hidden';
    this.screen.classList.add('hidden');
    this.previousFocus = null;
  }

  showInstructions() {
    if (this.view !== 'menu') return;
    const body = document.createElement('div');
    body.className = 'instructions';
    const lines = [
      'W / ↑ 加速 · S / ↓ 刹车、倒车 · A D / ← → 转向',
      '按住 Shift 甩尾漂移，攒满氮气后松开手刹即可加速。',
      `收集金币、冲过加速带，跑完 ${RACE.laps} 圈！`,
      'R 回到赛道 · M 开关音效 · ESC 暂停游戏',
    ];
    for (const text of lines) {
      const p = document.createElement('p');
      p.textContent = text;
      body.append(p);
    }
    this.#dialog('玩法说明', [body, this.#button('返回主界面', () => this.showMenu())], 'instructions');
  }

  closeInstructions() {
    if (this.view === 'instructions') this.showMenu();
  }

  showPause() {
    this.#dialog('游戏已暂停', [
      this.#button('继续游戏', () => this.onResume()),
      this.#button('返回主界面', () => this.showConfirm(), 'btn secondary'),
    ], 'pause');
  }

  showConfirm() {
    if (this.view !== 'pause') return;
    const warning = document.createElement('p');
    warning.textContent = '退出后当局进度不保留，确认退出？';
    this.#dialog('确认退出', [
      warning,
      this.#button('取消', () => this.showPause(), 'btn secondary'),
      this.#button('确认退出', () => this.onConfirmReturn(), 'btn danger'),
    ], 'confirm');
  }

  cancelConfirm() {
    if (this.view === 'confirm') this.showPause();
  }

  /** @param {{bestLapTime?:number, bestTotalTime?:number, ghost?:object}|null} record */
  setBest(record) {
    if (!record) {
      this.recordLine.textContent = '还没有记录：完成比赛，写下第一笔成绩。';
      return;
    }
    const lap = record.bestLapTime ? `${record.bestLapTime.toFixed(2)}s` : '--';
    const total = record.bestTotalTime ? `${record.bestTotalTime.toFixed(2)}s` : '--';
    this.recordLine.textContent = `历史最佳 · 单圈 ${lap} · 总用时 ${total}`;
  }

  showFinish({ totalTime, bestLap, coins, previousBestTotal = null, isNewRecord = false }) {
    const stats = document.createElement('div');
    stats.className = 'stats';
    for (const [value, label] of [
      [totalTime.toFixed(2), '总用时'],
      [bestLap === null ? '--' : bestLap.toFixed(2), '最佳单圈'],
      [String(coins), '金币'],
    ]) {
      const box = document.createElement('div');
      const number = document.createElement('b');
      number.textContent = value;
      const caption = document.createElement('span');
      caption.textContent = label;
      box.append(number, caption);
      stats.append(box);
    }
    const note = document.createElement('p');
    note.className = isNewRecord ? 'record' : 'dim';
    note.textContent = isNewRecord ? '🎉 新 纪 录 ！' : `历史最佳总用时 ${previousBestTotal?.toFixed(2) ?? '--'}`;
    this.#dialog('🏁 完 赛 !', [
      stats, note,
      this.#button('再来一局', () => this.onRestart()),
      this.#button('返回主界面', () => this.onReturn(), 'btn secondary'),
    ], 'finish');
  }
}
