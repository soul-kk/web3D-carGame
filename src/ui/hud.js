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
      sound: document.getElementById('hud-sound'),
      messages: document.getElementById('messages'),
      wrongWay: document.getElementById('wrong-way'),
    };

    /** 中央大字提示的剩余显示时间 */
    this.messageTimer = 0;
    this.lastLapText = '';
    this.lastSpeed = -1;
    this.lastCoins = -1;
    this.lastWrongWay = false;
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
