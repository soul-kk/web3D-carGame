/** 状态只在改变时更新 DOM，充能原因在按住手刹时明确提示。 */
const NITRO_HINT = {
  idle: '按住 Shift 漂移攒氮气',
  slow: '先提速，再打方向',
  road: '回到路面才能充能',
  steer: '打方向甩尾才能充能',
  charging: '漂移蓄力 · Ⅰ',
  half: '漂移蓄力 · Ⅱ',
  ready: '蓄力完成！松开手刹',
  fading: '继续漂移，蓄力正在消退',
  burst: '氮 气 释 放！',
  boosting: '氮气加速中',
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
      nitroBar: document.getElementById('nitro-bar'),
      nitroFill: document.getElementById('nitro-fill'),
      nitroLabel: document.getElementById('nitro-label'),
      driftFx: document.getElementById('drift-fx'),
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
    this.burstTimer = 0;
    this.nitroBoostActive = false;
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

  /** 漂移状态：满格优先于「漂移中」，否则永远看不到松手提示。 */
  setNitro(charge, { active = false, handbrake = false, drifting = false, onTrack = true, slow = false } = {}) {
    const percent = Math.round(Math.min(1, Math.max(0, charge)) * 100);
    if (percent !== this.lastNitroPercent) {
      this.el.nitroFill.style.width = `${percent}%`;
      this.el.nitroBar.setAttribute('aria-valuenow', String(percent));
      this.lastNitroPercent = percent;
    }

    let state = 'idle';
    if (this.burstTimer > 0) state = 'burst';
    else if (this.nitroBoostActive) state = 'boosting';
    else if (active && handbrake && charge >= 1) state = 'ready';
    else if (active && handbrake && !onTrack) state = 'road';
    else if (active && handbrake && slow) state = 'slow';
    else if (active && handbrake && drifting) state = charge >= 0.5 ? 'half' : 'charging';
    else if (active && handbrake) state = 'steer';
    else if (active && charge > 0) state = 'fading';
    if (state === this.lastNitroState) return;

    this.lastNitroState = state;
    this.el.nitro.className = state;
    this.el.nitroLabel.textContent = state === 'idle' && 'ontouchstart' in window
      ? '按住漂移键攒氮气'
      : NITRO_HINT[state];
  }

  /** 蓝色边缘光/速度线持续到氮气结束；只在状态变化时操作 DOM。 */
  setNitroBoost(active) {
    if (active === this.nitroBoostActive) return;
    this.nitroBoostActive = active;
    this.el.driftFx.classList.toggle('active', active);
    if (!active) this.el.driftFx.classList.remove('burst');
    this.lastNitroState = null;
  }

  /** 释放瞬间闪光和文字仍是短促的，持续特效交给 setNitroBoost。 */
  burstNitro() {
    this.burstTimer = 0.46;
    this.setNitroBoost(true);
    this.el.driftFx.classList.remove('burst');
    void this.el.driftFx.offsetWidth;
    this.el.driftFx.classList.add('burst');
    this.lastNitroState = null;
  }

  resetEffects() {
    this.burstTimer = 0;
    this.setNitroBoost(false);
    this.lastNitroState = null;
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
    if (this.burstTimer > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.el.driftFx.classList.remove('burst');
        this.lastNitroState = null;
      }
    }
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el.messages.textContent = '';
    }
  }
}
