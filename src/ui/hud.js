/** 氮气条上方的文字提示，按状态切换 */
const NITRO_HINT = {
  '': '按住 Shift 漂移攒氮气',
  drifting: '漂移中…',
  full: '氮气就绪！松开手刹',
};

/**
 * HUD（抬头显示）：把游戏数据画成屏幕上的文字。
 *
 * 这个类只做一件事：接收数据 → 更新 DOM。
 * 它不认识赛道、赛车，也不知道游戏规则，这样 UI 才好维护。
 */
export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.el = {
      lap: document.getElementById('hud-lap'),
      current: document.getElementById('hud-current'),
      best: document.getElementById('hud-best'),
      total: document.getElementById('hud-total'),
      speed: document.getElementById('hud-speed'),
      coins: document.getElementById('hud-coins'),
      ghost: document.getElementById('hud-ghost'),
      sound: document.getElementById('hud-sound'),
      messages: document.getElementById('messages'),
      wrongWay: document.getElementById('wrong-way'),
      nitro: document.getElementById('nitro'),
      nitroFill: document.getElementById('nitro-fill'),
      nitroLabel: document.getElementById('nitro-label'),
    };

    /** 中央大字提示的剩余显示时间 */
    this.messageTimer = 0;
    this.lastLapText = '';
    this.lastSpeed = -1;
    this.lastCoins = -1;
    this.lastWrongWay = false;
    this.lastGhost = null;
    this.lastNitroPercent = -1;
    this.lastNitroState = null;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setLap(lap, total) {
    const text = `${lap} / ${total}`;
    if (text !== this.lastLapText) {
      this.el.lap.textContent = text;
      this.lastLapText = text;
    }
  }

  setTimes({ current, best, total }) {
    this.el.current.textContent = current.toFixed(2);
    this.el.total.textContent = total.toFixed(2);
    this.el.best.textContent = best === null ? '--.--' : best.toFixed(2);
  }

  setSpeed(unitsPerSecond) {
    // 1 单位 ≈ 1 米，米/秒 → 公里/小时 要乘 3.6
    const kmh = Math.round(unitsPerSecond * 3.6);
    if (kmh !== this.lastSpeed) {
      this.el.speed.textContent = kmh;
      this.lastSpeed = kmh;
    }
  }

  setCoins(count) {
    if (count !== this.lastCoins) {
      this.el.coins.textContent = count;
      this.lastCoins = count;
    }
  }

  setSoundEnabled(enabled) {
    this.el.sound.textContent = enabled ? '开' : '关';
  }

  /** 这一局有没有幽灵车（历史最佳回放） */
  setGhost(available) {
    if (available !== this.lastGhost) {
      this.el.ghost.textContent = available ? '有' : '无';
      this.lastGhost = available;
    }
  }

  /**
   * 氮气条。
   * @param {number} charge 0~1 的充能进度
   * @param {boolean} drifting 这一帧是否正在漂移（充能中）
   */
  setNitro(charge, drifting) {
    const percent = Math.round(charge * 100);
    if (percent !== this.lastNitroPercent) {
      this.el.nitroFill.style.width = `${percent}%`;
      this.lastNitroPercent = percent;
    }

    // 'drifting' ＞ 'full' ＞ '' —— 漂移中优先显示，这样玩家知道"现在攒得动"
    let state = '';
    if (drifting) state = 'drifting';
    else if (charge >= 1) state = 'full';
    if (state === this.lastNitroState) return;

    this.lastNitroState = state;
    this.el.nitro.classList.toggle('drifting', state === 'drifting');
    this.el.nitro.classList.toggle('full', state === 'full');
    this.el.nitroLabel.textContent = NITRO_HINT[state];
  }

  setWrongWay(active) {
    if (active !== this.lastWrongWay) {
      this.el.wrongWay.classList.toggle('hidden', !active);
      this.lastWrongWay = active;
    }
  }

  /** 屏幕中央的大字提示（倒计时、圈数、GO!） */
  flashMessage(text, size = 120, duration = 1.1) {
    const messages = this.el.messages;
    messages.textContent = text;
    messages.style.fontSize = `${size}px`;
    messages.classList.remove('pop');
    void messages.offsetWidth;   // 强制重排 → 让 CSS 动画能重新播放
    messages.classList.add('pop');
    this.messageTimer = duration;
  }

  clearMessage() {
    this.el.messages.textContent = '';
    this.messageTimer = 0;
  }

  /** 每帧调用，让提示文字自动消失 */
  update(dt) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el.messages.textContent = '';
    }
  }
}
