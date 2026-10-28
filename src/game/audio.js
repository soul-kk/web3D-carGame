import { Music } from './music.js';

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
    this.skidGain = null;
    this.skidFilter = null;
    /** 飞碟引擎：悬浮基音 + 泛音 + 颤音 */
    this.hoverOscillator = null;
    this.hoverShimmer = null;
    this.hoverFilter = null;
    this.hoverTrem = null;
    this.hoverVolume = null;
    /** 飞碟侧滑：推进器的高频气流 */
    this.windGain = null;
    this.windFilter = null;
    /** 当前开的是哪台车：'racer' 或 'saucer' */
    this.vehicle = 'racer';
    /** 背景音乐（init() 之后才有） */
    this.music = null;
    this.enabled = true;
    this.onToggle = null;
  }

  /**
   * 切换座驾。两台车的引擎声完全不一样，所以要告诉音效模块现在开的是哪台。
   * @param {string} skinId
   */
  setVehicle(skinId) {
    this.vehicle = skinId === 'saucer' ? 'saucer' : 'racer';
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

    this.#buildHoverChain();

    // 背景音乐挂在总线上：静音总开关（M 键）会连音乐一起关掉
    this.music = new Music(this.ctx, this.master);

    // 循环噪声经带通滤波变成轮胎摩擦声：只更新增益/音色，不在每帧新建音源。
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 900;
    this.skidFilter.Q.value = 0.7;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0;
    noise.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.master);

    // 同一份噪声再走一路高通：飞碟侧滑时是推进器的气流，不是轮胎尖叫
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 1600;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    noise.start();
  }

  /**
   * 飞碟的引擎声：正弦基音 + 轻微失谐的泛音 + 低频颤音。
   *
   * 【为什么和赛车完全是两套链路】赛车的引擎是"点火-爆发"型的声音，
   * 锯齿波 + 低通；飞碟是"悬浮"型的声音，正弦波 + 颤音，听感上完全不是一类车。
   * 两套链路各自常驻，切换时只改音量，不需要重建音源。
   */
  #buildHoverChain() {
    const ctx = this.ctx;

    // 基音：飞碟悬停的低频嗡鸣
    this.hoverOscillator = ctx.createOscillator();
    this.hoverOscillator.type = 'sine';
    this.hoverOscillator.frequency.value = 76;

    // 泛音：比基音高一点点，听起来像"能量在转"，不是纯粹的嗡
    this.hoverShimmer = ctx.createOscillator();
    this.hoverShimmer.type = 'triangle';
    this.hoverShimmer.frequency.value = 153;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.22;

    const mix = ctx.createGain();
    mix.gain.value = 1;
    this.hoverOscillator.connect(mix);
    this.hoverShimmer.connect(shimmerGain);
    shimmerGain.connect(mix);

    // 低通：让声音随速度变闷 / 变亮
    this.hoverFilter = ctx.createBiquadFilter();
    this.hoverFilter.type = 'lowpass';
    this.hoverFilter.frequency.value = 700;
    mix.connect(this.hoverFilter);

    // 颤音：LFO 调制增益，模拟悬浮时的不稳定感
    this.hoverTrem = ctx.createGain();
    this.hoverTrem.gain.value = 1;
    this.hoverFilter.connect(this.hoverTrem);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 6.2;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this.hoverTrem.gain);

    // 总音量：和赛车的 engineGain 一个层级，由 engine() 按车速调节
    this.hoverVolume = ctx.createGain();
    this.hoverVolume.gain.value = 0;
    this.hoverTrem.connect(this.hoverVolume);
    this.hoverVolume.connect(this.master);

    this.hoverOscillator.start();
    this.hoverShimmer.start();
    lfo.start();
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

    if (this.vehicle === 'saucer') {
      // 飞碟：悬浮嗡鸣。音高涨得比赛车慢，因为它不是靠轮子驱动的。
      const base = 74 + speed * 1.7 + throttle * 9;
      this.hoverOscillator.frequency.setTargetAtTime(base, now, 0.09);
      this.hoverShimmer.frequency.setTargetAtTime(base * 2.006, now, 0.11);
      this.hoverFilter.frequency.setTargetAtTime(600 + speed * 26, now, 0.16);
      this.hoverVolume.gain.setTargetAtTime(
        active ? 0.045 + throttle * 0.02 + speed * 0.0009 : 0,
        now,
        0.12,
      );
      // 换车时赛车引擎必须闭嘴，否则两台车的声音叠在一起
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    this.engineOscillator.frequency.setTargetAtTime(52 + speed * 2.6 + throttle * 14, now, 0.06);
    this.engineGain.gain.setTargetAtTime(
      active ? 0.025 + throttle * 0.03 + speed * 0.0007 : 0,
      now,
      0.1,
    );
    this.hoverVolume.gain.setTargetAtTime(0, now, 0.1);
  }

  /** 持续侧滑声：侧滑越大，摩擦声越亮；停止时平滑淡出。 */
  drift(lateralSpeed, active) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const slip = active ? Math.min(Math.abs(lateralSpeed) / 22, 1) : 0;

    if (this.vehicle === 'saucer') {
      // 飞碟没有轮胎，侧滑是推进器横向喷射的气流声
      this.windGain.gain.setTargetAtTime(slip * 0.07, now, active ? 0.08 : 0.12);
      this.windFilter.frequency.setTargetAtTime(1500 + slip * 2600, now, 0.1);
      this.skidGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    this.skidGain.gain.setTargetAtTime(slip * 0.085, now, active ? 0.065 : 0.11);
    this.skidFilter.frequency.setTargetAtTime(650 + slip * 1700, now, 0.08);
    this.windGain.gain.setTargetAtTime(0, now, 0.08);
  }

  /** 充能跨过阶段时的短音；不同阶段音高不同。 */
  chargeTier(tier) {
    this.blip(tier === 2 ? 1120 : 720, 0.16, 'triangle', 0.09, tier === 2 ? 1760 : 1050);
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

  /**
   * 播放背景音乐。
   * @param {string} songId 曲库里的 id
   */
  playMusic(songId) {
    this.music?.play(songId);
  }

  /** 压低 / 恢复背景音乐音量（暂停时用） */
  duckMusic(on) {
    this.music?.duck(on);
  }
}

/** 全局唯一的音频实例 */
export const audio = new GameAudio();
