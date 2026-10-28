import { RACE } from '../config.js';
import { SKINS } from '../game/skins.js';
import { MAPS } from '../world/maps.js';

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
    this.onSkinChange = () => {};
    this.onMapChange = () => {};

    this.skinButtons = new Map();
    this.mapButtons = new Map();
    this.skinList = this.#buildPicker('选 座 驾', SKINS, 'skin', (id) => this.onSkinChange(id), this.skinButtons);
    this.mapList = this.#buildPicker('选 地 图', MAPS, 'map', (id) => this.onMapChange(id), this.mapButtons);
    this.skinHint = document.getElementById('btn-skin-current');
    this.mapHint = document.getElementById('btn-map-current');

    document.getElementById('btn-start').addEventListener('click', () => this.onStart());
    document.getElementById('btn-help').addEventListener('click', () => this.showInstructions());
    document.getElementById('btn-skin').addEventListener('click', () => this.showSkinPicker());
    document.getElementById('btn-map').addEventListener('click', () => this.showMapPicker());
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

  /**
   * 造出一排"选择项"按钮（座驾、地图都用它）。
   *
   * 【为什么用同一个组件】这两个选择器长得必须一模一样，
   * 复制一份 CSS 出来改一处忘一处，界面就慢慢变得不统一了。
   *
   * @param {string} labelText 上面那行小标题
   * @param {Array<{id:string,name:string,description:string,icon:string}>} items 可选项
   * @param {string} kind 按钮上的 data 属性名（skin / map）
   * @param {(id:string)=>void} onPick 选中回调
   * @param {Map<string,HTMLElement>} registry 收集按钮，方便统一高亮
   * @returns {HTMLElement}
   */
  #buildPicker(labelText, items, kind, onPick, registry) {
    const list = document.createElement('div');
    list.className = 'skins';

    const label = document.createElement('div');
    label.className = 'skins-label';
    label.textContent = labelText;

    const row = document.createElement('div');
    row.className = 'skins-row';

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skin-btn';
      button.dataset[kind] = item.id;
      button.title = item.description;

      const icon = document.createElement('span');
      icon.className = 'skin-icon';
      icon.textContent = item.icon;

      // 名字 + 说明竖着排，和首页其它按钮"标题 + 副标题"的排版一致
      const text = document.createElement('span');
      text.className = 'skin-text';

      const name = document.createElement('span');
      name.className = 'skin-name';
      name.textContent = item.name;

      const desc = document.createElement('span');
      desc.className = 'skin-desc';
      desc.textContent = item.description;

      text.append(name, desc);
      button.append(icon, text);
      button.addEventListener('click', () => onPick(item.id));

      row.append(button);
      registry.set(item.id, button);
    }

    list.append(label, row);
    return list;
  }

  /**
   * 高亮当前选中的皮肤。
   * @param {string} skinId
   */
  setSkin(skinId) {
    this.#setActive(this.skinButtons, skinId);
    // 首页"更换皮肤"按钮右侧回显当前座驾，省得再点进去才知道开的是哪台
    const skin = SKINS.find((item) => item.id === skinId);
    if (skin && this.skinHint) this.skinHint.textContent = `${skin.icon} ${skin.name}`;
  }

  /**
   * 高亮当前选中的地图。
   * @param {string} mapId
   */
  setMap(mapId) {
    this.#setActive(this.mapButtons, mapId);
    const map = MAPS.find((item) => item.id === mapId);
    if (map && this.mapHint) this.mapHint.textContent = `${map.icon} ${map.name}`;
  }

  /** 统一的高亮处理：选中的加 .active，其余去掉 */
  #setActive(registry, activeId) {
    for (const [id, button] of registry) {
      button.classList.toggle('active', id === activeId);
      button.setAttribute('aria-pressed', String(id === activeId));
    }
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
    // 选择类弹窗靠左放，右边留给展示中的车 / 赛道，换的时候能直接看到变化
    const isChoice = view === 'skins' || view === 'maps';
    this.screen.classList.toggle('choice-screen', isChoice);
    this.card.classList.toggle('choice-card', isChoice);
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

  /**
   * 首页"更换皮肤" → 选座驾弹窗。
   *
   * 【为什么单独一个弹窗，而不是把按钮直接摆在菜单里】
   * 菜单里的按钮都是"一按就执行"的动作，加两排皮肤按钮会把首页撑得很长。
   * 收进弹窗，首页保持干净，选完再回来看车。
   */
  showSkinPicker() {
    if (this.view !== 'menu') return;
    this.#dialog('更 换 座 驾', [
      this.skinList,
      this.#button('返回主界面', () => this.showMenu(), 'btn secondary'),
    ], 'skins');
  }

  /** 首页"更换地图" → 选地图弹窗 */
  showMapPicker() {
    if (this.view !== 'menu') return;
    this.#dialog('更 换 地 图', [
      this.mapList,
      this.#button('返回主界面', () => this.showMenu(), 'btn secondary'),
    ], 'maps');
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
      this.skinList,
      this.#button('再来一局', () => this.onRestart()),
      this.#button('返回主界面', () => this.onReturn(), 'btn secondary'),
    ], 'finish');
  }
}
