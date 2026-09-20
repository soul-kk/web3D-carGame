import { RACE } from '../config.js';

/**
 * 比赛状态机 + 计时。
 *
 * 状态流转：ready → countdown → racing → finished
 *
 * 【怎么判断跑完一圈？】
 * 把赛道看成 0→1 的进度条。赛车每帧算出自己最近的赛道采样点下标，
 * 得到 progress = index / 总采样数。
 * 当进度从 ~1 突然跳回 ~0（“越过起点线”），就算完成一圈。
 * 反向穿越（进度从 0 跳到 1）不算，防止倒着刷圈。
 */
export class Race {
  /**
   * @param {object} options
   * @param {number} options.laps 总圈数
   * @param {(lap:number, time:number, isBest:boolean)=>void} options.onLapComplete
   * @param {(summary:object)=>void} options.onFinish
   */
  constructor({ laps = RACE.laps, onLapComplete, onFinish } = {}) {
    this.totalLaps = laps;
    this.onLapComplete = onLapComplete ?? (() => {});
    this.onFinish = onFinish ?? (() => {});

    /** 'ready' | 'countdown' | 'racing' | 'finished' */
    this.mode = 'ready';
    this.reset();
  }

  reset() {
    this.mode = 'ready';
    this.lap = 1;
    this.lapTime = 0;
    this.totalTime = 0;
    this.bestLap = null;
    this.coins = 0;
    this.wrongWay = false;
    this.previousProgress = 0;
  }

  get isRacing() { return this.mode === 'racing'; }
  /** 只有比赛中才允许操作赛车 */
  get canDrive() { return this.mode === 'racing'; }

  addCoin() { this.coins++; }

  /**
   * 每帧推进计时与圈数。
   * @param {number} dt
   * @param {object} ctx
   * @param {number} ctx.progress 当前赛道进度 0~1
   * @param {boolean} ctx.wrongWay 是否在逆行
   */
  update(dt, { progress, wrongWay }) {
    if (!this.isRacing) return;

    this.lapTime += dt;
    this.totalTime += dt;
    this.wrongWay = wrongWay;

    // 跨越起跑线：进度从"接近 1"跳回"接近 0"
    if (this.previousProgress > 0.85 && progress < 0.15) {
      this.#completeLap();
    }
    this.previousProgress = progress;
  }

  #completeLap() {
    const time = this.lapTime;
    const isBest = this.bestLap === null || time < this.bestLap;
    if (isBest) this.bestLap = time;

    this.onLapComplete(this.lap, time, isBest);

    this.lapTime = 0;
    this.lap += 1;

    if (this.lap > this.totalLaps) {
      this.lap = this.totalLaps;
      this.mode = 'finished';
      this.onFinish({
        totalTime: this.totalTime,
        bestLap: this.bestLap,
        coins: this.coins,
      });
    }
  }
}
