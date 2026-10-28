/**
 * 背景音乐：全部用 Web Audio 现场合成，跟音效一样不需要任何音频文件。
 *
 * 【为什么要自己写一个音序器】
 * Web Audio 没有"播放一个循环曲子"这种现成能力，只能自己排音符。
 * 做法和鼓机一样：用一个定时器提前把未来一小段时间的音符排进音频时钟，
 * 而不是每帧去"触发"音符 —— 后者会因为掉帧让节奏发抖。
 *
 * 【怎么读曲谱】
 * 每首曲子由三行组成，每行是若干小节，一个小节是一个用空格分隔的字符串，
 * 一个空格 = 一个十六分音符：
 *   lead   旋律（方波）
 *   bass   低音（三角波）
 *   drums  鼓组，k=底鼓 s=军鼓 h=踩镲 .=休止
 * "-" 表示延音（把上一个音拉长一格），"." 是休止。
 */

/** 音符名 → 频率。只需要支持 A-G 加可选的升降号和八度。 */
const NOTE_OFFSET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * 曲库。每张地图指定一个曲子 id。
 */
export const SONGS = {
  /** 晴日草原：轻快的大调，像在草地上撒欢 */
  sunny: {
    bpm: 138,
    lead: [
      'E5 . G5 . A5 . C6 . B5 . A5 . G5 .',
      'D5 . F5 . A5 . D6 . C6 . A5 . F5 . D5 .',
      'E5 . G5 . C6 . E6 . D6 . C6 . B5 . A5 .',
      'B5 . A5 . G5 . E5 . D5 . C5 . D5 . E5 .',
    ],
    bass: [
      'E2 . . . C3 . . . G2 . . . G2 . . .',
      'D2 . . . F2 . . . A2 . . . A2 . . .',
      'C3 . . . G2 . . . C3 . . . E3 . . .',
      'A2 . . . E2 . . . E2 . . . E2 . . .',
    ],
    drums: [
      'k . h . s . h . k . h . s . h h',
      'k . h . s . h . k . h . s h h h',
      'k . h . s . h . k . h . s . h .',
      'k . h . s . h . k k s . s . h h',
    ],
  },

  /** 熔岩环道：低沉、紧张，鼓点更重，像在火里跑 */
  lava: {
    bpm: 146,
    lead: [
      'D4 . D5 . F5 . E5 . D5 . A4 . . . . . .',
      'C5 . . . D5 . F5 . E5 . D5 . . . . .',
      'Bb4 . . . D5 . F5 . G5 . F5 . . . . .',
      'A4 . C5 . D5 . F5 . E5 . D5 . . . . .',
    ],
    bass: [
      'D2 . D2 . . . D2 . . . C2 . . . D2 . . .',
      'C2 . . . C2 . . . D2 . . . D2 . . .',
      'Bb1 . . . Bb1 . . . D2 . . . A1 . . .',
      'A1 . . . A1 . . . D2 . . . D2 . . .',
    ],
    drums: [
      'k . h . s . h . k k h . s . s . h h',
      'k . h . s . h . k k h . s . s . h h',
      'k . h . s . h . k k h . s . s . h h',
      'k . h . s . h . k k h h s s s . h h',
    ],
  },
};

/**
 * 把 "E5" 这样的音名转成频率（Hz）。
 * @param {string} name
 */
function noteToFreq(name) {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!match) return 440;
  let semitone = NOTE_OFFSET[match[1]];
  if (match[2] === '#') semitone += 1;
  else if (match[2] === 'b') semitone -= 1;
  const midi = semitone + (parseInt(match[3], 10) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * 把小节字符串展开成"每一格音符"的数组。
 * @param {string[]} bars
 * @param {number} stepDuration 每格多少秒
 * @returns {Array<null|{freq:number,duration:number}>}
 */
function buildSteps(bars, stepDuration) {
  const steps = [];
  for (const bar of bars) {
    const tokens = bar.trim().split(/\s+/);
    const barSteps = new Array(tokens.length).fill(null);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === '-') {
        // 延音：把上一个还在响的音符拉长一格
        for (let j = i - 1; j >= 0; j--) {
          if (barSteps[j]) {
            barSteps[j].duration += stepDuration;
            break;
          }
        }
        continue;
      }
      if (token !== '.') {
        barSteps[i] = { freq: noteToFreq(token), duration: stepDuration };
      }
    }
    steps.push(...barSteps);
  }
  return steps;
}

/** 白噪声缓冲，鼓组（军鼓 / 踩镲）用它 */
function createNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * 背景音乐播放器。
 *
 * 用法：
 *   const music = new Music(ctx, destination);
 *   music.play('sunny');
 *   music.duck(true);   // 暂停时把音量压下去
 */
export class Music {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination 声音出口（一般是音效模块的总线）
   */
  constructor(ctx, destination) {
    this.ctx = ctx;
    /** 音量总控 */
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    /** 常规音量 */
    this.volume = 0.42;
    /** 暂停 / 强调时的压低音量 */
    this.duckVolume = 0.14;
    this.ducked = false;
    this.noise = createNoiseBuffer(ctx);

    this.songId = null;
    this.song = null;
    this.leadSteps = [];
    this.bassSteps = [];
    this.drumSteps = [];
    this.stepDuration = 0.1;
    this.stepIndex = 0;
    this.nextTime = 0;
    /** 排程定时器 */
    this.timer = null;
  }

  /**
   * 播放某首曲子（同名则不重启，直接继续）。
   * @param {string} songId
   */
  play(songId) {
    const song = SONGS[songId];
    if (!song) return;
    if (this.songId === songId && this.timer) return;

    this.stop();
    this.songId = songId;
    this.song = song;
    this.stepDuration = 60 / song.bpm / 4;   // 四分音符 = 4 格
    this.leadSteps = buildSteps(song.lead, this.stepDuration);
    this.bassSteps = buildSteps(song.bass, this.stepDuration);
    this.drumSteps = song.drums.flatMap((bar) => bar.trim().split(/\s+/));
    this.stepIndex = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.#applyVolume();
    // 每 25ms 排一次未来 180ms 的音符 —— 定时器抖动不会让节奏抖
    this.timer = setInterval(() => this.#schedule(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.songId = null;
    this.song = null;
  }

  /**
   * 压低 / 恢复音量（暂停时用）。
   * @param {boolean} on
   */
  duck(on) {
    this.ducked = on;
    this.#applyVolume();
  }

  #applyVolume() {
    const target = this.timer ? (this.ducked ? this.duckVolume : this.volume) : 0;
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
  }

  /** 把未来一小段时间的音符排进音频时钟 */
  #schedule() {
    if (!this.song) return;
    const total = Math.max(this.leadSteps.length, this.bassSteps.length, this.drumSteps.length);
    if (!total) return;
    const ahead = this.ctx.currentTime + 0.18;

    while (this.nextTime < ahead) {
      const step = this.stepIndex % total;
      const time = this.nextTime;

      const lead = this.leadSteps[step % this.leadSteps.length];
      if (lead) this.#playNote(lead.freq, time, lead.duration, 'square', 0.075);

      const bass = this.bassSteps[step % this.bassSteps.length];
      if (bass) this.#playNote(bass.freq, time, bass.duration * 0.9, 'triangle', 0.1);

      const drum = this.drumSteps[step % this.drumSteps.length];
      if (drum && drum !== '.') this.#playDrum(drum, time);

      this.nextTime += this.stepDuration;
      this.stepIndex = (this.stepIndex + 1) % total;
    }
  }

  /** 一个音符：短促的方波 / 三角波，带一点点起音和收尾 */
  #playNote(freq, time, duration, type, volume) {
    const ctx = this.ctx;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.05, duration * 0.92));

    oscillator.connect(gain);
    gain.connect(this.out);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
  }

  /** 鼓：底鼓是下滑的正弦，军鼓和踩镲是滤波过的白噪声 */
  #playDrum(kind, time) {
    const ctx = this.ctx;
    if (kind === 'k') {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(150, time);
      oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.32, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      oscillator.connect(gain);
      gain.connect(this.out);
      oscillator.start(time);
      oscillator.stop(time + 0.16);
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    if (kind === 's') {
      filter.type = 'bandpass';
      filter.frequency.value = 1900;
      filter.Q.value = 0.8;
      gain.gain.setValueAtTime(0.16, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    } else {
      filter.type = 'highpass';
      filter.frequency.value = 7200;
      gain.gain.setValueAtTime(0.07, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    }
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    source.start(time);
    source.stop(time + 0.2);
  }
}
