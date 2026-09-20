/**
 * 音效：全部用 Web Audio API 现场合成，不需要任何音频文件。
 *
 * 【浏览器限制】音频必须由用户操作（点击 / 按键）触发才能播放，
 * 所以 audio.init() 要放在"开始比赛"这类回调里调用。
 */
class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOscillator = null;
    this.engineGain = null;
    this.enabled = true;
    this.onToggle = null;
  }

  /** 创建音频上下文和常驻的引擎音源 */
  init() {
    if (this.ctx) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();

    // 总线：所有声音都经过它，用它做总音量 / 静音
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(this.ctx.destination);

    // 引擎声：锯齿波 → 低通滤波 → 音量。音高跟着车速变。
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOscillator = this.ctx.createOscillator();
    this.engineOscillator.type = 'sawtooth';
    this.engineOscillator.frequency.value = 52;

    this.engineOscillator.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOscillator.start();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  /**
   * 每帧更新引擎声。
   * @param {number} speed 车速
   * @param {number} throttle 0 / 1
   * @param {boolean} active 只有在比赛中才出声
   */
  engine(speed, throttle, active) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineOscillator.frequency.setTargetAtTime(52 + speed * 2.6 + throttle * 14, now, 0.06);
    this.engineGain.gain.setTargetAtTime(
      active ? 0.025 + throttle * 0.03 + speed * 0.0007 : 0,
      now,
      0.1,
    );
  }

  /**
   * 播放一个短音。
   * @param {number} frequency 起始频率
   * @param {number} duration 时长（秒）
   * @param {OscillatorType} [type] 波形
   * @param {number} [volume]
   * @param {number|null} [endFrequency] 若给出则做滑音
   */
  blip(frequency, duration, type = 'square', volume = 0.12, endFrequency = null) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;

    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  /** 金币音：两连音 */
  coin() {
    this.blip(880, 0.09, 'square', 0.12, 1320);
    setTimeout(() => this.blip(1320, 0.12, 'square', 0.1, 1760), 70);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.6 : 0;
    this.onToggle?.(this.enabled);
    return this.enabled;
  }
}

/** 全局唯一的音频实例 */
export const audio = new GameAudio();
