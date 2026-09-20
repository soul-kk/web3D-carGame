import { CAR, COLORS, RACE, WORLD } from '../config.js';
import { createEnvironment } from '../world/environment.js';
import { Coins, Cones, BoostPads } from '../world/props.js';
import { Particles } from '../fx/particles.js';
import { Car } from './car.js';
import { Race } from './race.js';
import { ChaseCamera } from './camera.js';
import { audio } from './audio.js';

/** 出发位置对应的赛道采样点（稍微过起点线一点，方便起步） */
const START_INDEX = 6;

/**
 * 游戏主控：把所有模块串起来，并实现"每帧该发生什么"的规则。
 *
 * 数据流（每帧一次）：
 *   Input → Car.update() → 与赛道/道具交互 → Race.update() → Camera/HUD/小地图 → 渲染
 *
 * 各个模块互不认识，全部由这里调度；想改玩法，大部分时候只需要改这个文件。
 */
export class Game {
  constructor({ scene, camera, track, hud, minimap, overlay, input, sunLight, sunDirection }) {
    this.scene = scene;
    this.track = track;
    this.hud = hud;
    this.minimap = minimap;
    this.overlay = overlay;
    this.input = input;
    this.sunLight = sunLight;
    this.sunDirection = sunDirection;

    /* ---------- 世界 ---------- */
    this.environment = createEnvironment(scene, this.track);
    this.coins = new Coins(scene, this.track);
    this.cones = new Cones(scene, this.track);
    this.boostPads = new BoostPads(scene, this.track);
    this.particles = new Particles(scene, 60);

    // 锥桶归位时给个提示音
    for (const cone of this.cones.list) cone.onRespawn = () => audio.blip(520, 0.08, 'sine', 0.06);

    /* ---------- 赛车 & 相机 ---------- */
    this.car = new Car();
    scene.add(this.car.root);
    this.cameraRig = new ChaseCamera(camera);

    /* ---------- 比赛规则 ---------- */
    this.race = new Race({
      laps: RACE.laps,
      onLapComplete: (lap, time, isBest) => this.#handleLapComplete(lap, time, isBest),
      onFinish: (summary) => this.#handleFinish(summary),
    });

    /** 倒计时剩余秒数 */
    this.countdownLeft = 0;
    this.lastCountdownNumber = -1;
    /** 扬尘粒子的节流计时（不是每帧都冒烟） */
    this.dustTimer = 0;

    this.#bindActions();
    this.resetWorld();
  }

  /* ================= 对外接口 ================= */

  /** 开始按钮 → 倒计时 → 开跑 */
  start() {
    audio.init();
    audio.resume();
    this.overlay.hide();
    this.hud.show();
    this.#beginCountdown();
  }

  /** 完赛后的"再来一局" */
  restart() {
    this.overlay.hide();
    this.hud.show();
    this.#beginCountdown();
  }

  /* ================= 每帧主循环 ================= */

  update(dt) {
    this.#updateCountdown(dt);

    const input = this.input.read();
    const car = this.car;

    /* ---------- 1. 判断赛车在赛道上的位置 ---------- */
    const nearest = this.track.nearest(car.position.x, car.position.z, car.nearestIndex);
    car.nearestIndex = nearest.index;
    const onTrack = nearest.distance < this.track.halfWidth + 0.8;
    const progress = this.track.progressOf(nearest.index);

    /* ---------- 2. 车辆物理 ---------- */
    const carState = car.update(dt, {
      input,
      canDrive: this.race.canDrive,
      onTrack,
    });

    /* ---------- 3. 和道具交互 ---------- */
    this.#handleBoostPads();
    this.#handleCones(carState.speed);
    this.#handleCoins();
    this.#spawnTireSmoke(dt, carState);

    /* ---------- 4. 逆行判定 ---------- */
    const forward = car.forward;
    const wrongWay = this.race.isRacing
      && (nearest.tangent.x * forward.x + nearest.tangent.z * forward.z) < -0.35
      && carState.speed > 4;

    /* ---------- 5. 计时与圈数 ---------- */
    this.race.update(dt, { progress, wrongWay });

    /* ---------- 6. 世界动画 ---------- */
    this.coins.update(dt);
    this.cones.update(dt, WORLD.gravity);
    this.boostPads.update(dt);
    this.particles.update(dt);
    this.environment.update(dt);

    /* ---------- 7. 相机 / 光照 ---------- */
    this.cameraRig.update(dt, car);
    this.#updateSun();

    /* ---------- 8. UI 与声音 ---------- */
    this.#updateHud(dt, carState.speed, wrongWay);
    audio.engine(carState.speed, input.throttle, this.race.isRacing);
  }

  /** 渲染前的最后一件事：更新小地图 */
  drawMinimap() {
    this.minimap.draw({
      car: this.car,
      coins: this.coins.list,
      cones: this.cones.list,
    });
  }

  /* ================= 内部实现 ================= */

  #bindActions() {
    this.input.on('KeyM', () => {
      const enabled = audio.toggle();
      this.hud.setSoundEnabled(enabled);
    });
    this.input.on('KeyR', () => {
      if (this.race.isRacing) this.#respawnOnTrack();
    });
    this.input.on('Enter', () => {
      if (this.race.mode === 'ready') this.start();
      else if (this.race.mode === 'finished') this.restart();
    });
    this.input.on('Space', () => {
      if (this.race.mode === 'ready') this.start();
      else if (this.race.mode === 'finished') this.restart();
    });
    // 触屏第一次点击时初始化音频（浏览器要求用户手势）
    this.input.onFirstTouch = () => { audio.init(); audio.resume(); };
  }

  /** 回到开局状态（但不开始倒计时） */
  resetWorld() {
    this.race.reset();
    this.coins.reset();
    this.cones.reset();
    this.boostPads.reset();
    this.countdownLeft = 0;
    this.lastCountdownNumber = -1;

    const startPoint = this.track.points[START_INDEX];
    const startTangent = this.track.tangents[START_INDEX];
    this.car.placeAt(startPoint, Math.atan2(startTangent.x, startTangent.z), START_INDEX);
    this.cameraRig.snapTo(this.car);
    this.#updateSun();

    this.hud.setLap(1, this.race.totalLaps);
    this.hud.setTimes({ current: 0, best: null, total: 0 });
    this.hud.setCoins(0);
    this.hud.setWrongWay(false);
    this.hud.clearMessage();
  }

  #beginCountdown() {
    this.resetWorld();
    this.race.mode = 'countdown';
    this.countdownLeft = RACE.countdown;
    this.lastCountdownNumber = -1;
  }

  #updateCountdown(dt) {
    if (this.race.mode !== 'countdown') return;

    this.countdownLeft -= dt;
    const number = Math.ceil(this.countdownLeft);

    if (number !== this.lastCountdownNumber) {
      this.lastCountdownNumber = number;
      if (number > 0) {
        this.hud.flashMessage(String(number), 130, 0.95);
        audio.blip(520, 0.16, 'square', 0.12);
      } else {
        this.hud.flashMessage('GO!', 130, 1.0);
        audio.blip(880, 0.35, 'square', 0.14, 1400);
      }
    }

    if (this.countdownLeft <= 0) {
      this.race.mode = 'racing';
      // 记下出发时的进度，避免起步瞬间被误判成"跑完一圈"
      const nearest = this.track.nearest(this.car.position.x, this.car.position.z, this.car.nearestIndex);
      this.race.previousProgress = this.track.progressOf(nearest.index);
    }
  }

  /** 撞到锥桶：把车减速、镜头抖一下、冒点火花 */
  #handleCones(speed) {
    const hit = this.cones.hitTest(this.car.position, speed);
    if (!hit) return;

    this.car.velocity.multiplyScalar(0.72);
    this.cameraRig.addShake(0.5);
    audio.blip(160, 0.14, 'square', 0.14, 60);
    for (let i = 0; i < 4; i++) {
      this.particles.spawn(hit.mesh.position.x, 0.8, hit.mesh.position.z, 0xffb066);
    }
  }

  #handleCoins() {
    const collected = this.coins.collect(this.car.position);
    if (!collected) return;

    this.race.addCoin();
    this.hud.setCoins(this.race.coins);
    audio.coin();
    for (let i = 0; i < 5; i++) {
      this.particles.spawn(collected.x, collected.y, collected.z, 0xffe08a);
    }
  }

  #handleBoostPads() {
    if (!this.race.canDrive) return;
    if (this.boostPads.tryTrigger(this.car.position)) {
      this.car.applyBoost(CAR.boostDuration);
      audio.blip(320, 0.28, 'sawtooth', 0.1, 900);
    }
  }

  /** 出界或漂移时后轮冒烟 */
  #spawnTireSmoke(dt, { speed, lateralSpeed, ...rest }) {
    const drifting = Math.abs(lateralSpeed) > 5 && this.car.onTrack;
    const offTrack = !this.car.onTrack;
    if (!this.race.canDrive || speed <= 6 || (!drifting && !offTrack)) return;

    this.dustTimer -= dt;
    if (this.dustTimer > 0) return;
    this.dustTimer = 0.035;

    const forward = this.car.forward;
    const right = this.car.right;
    const backX = this.car.position.x - forward.x * 1.7;
    const backZ = this.car.position.z - forward.z * 1.7;
    const color = this.car.onTrack ? COLORS.dustTrack : COLORS.dustGrass;

    this.particles.spawn(backX + right.x * 1.1, 0.35, backZ + right.z * 1.1, color);
    this.particles.spawn(backX - right.x * 1.1, 0.35, backZ - right.z * 1.1, color);

    if (!this.car.onTrack) this.cameraRig.addShake(0.05);
  }

  #handleLapComplete(lap, time, isBest) {
    if (isBest) {
      this.hud.setTimes({ current: 0, best: time, total: this.race.totalTime });
      audio.blip(1200, 0.16, 'triangle', 0.12, 1800);
    }
    // race.lap 已经加过 1，所以这里显示的是"即将开始的那一圈"
    if (this.race.lap <= this.race.totalLaps) {
      this.hud.flashMessage(`第 ${this.race.lap} 圈`, 64, 1.2);
      audio.blip(700, 0.12, 'square', 0.1, 1000);
    }
  }

  #handleFinish(summary) {
    audio.blip(660, 0.18, 'triangle', 0.14, 990);
    setTimeout(() => audio.blip(990, 0.35, 'triangle', 0.14, 1320), 180);

    this.hud.clearMessage();
    this.hud.setWrongWay(false);
    this.overlay.showFinish(summary);
  }

  /** 按 R 键：把车放回最近的赛道中心点 */
  #respawnOnTrack() {
    const nearest = this.track.nearest(this.car.position.x, this.car.position.z, this.car.nearestIndex);
    const point = this.track.points[nearest.index];
    const tangent = this.track.tangents[nearest.index];
    this.car.placeAt(point, Math.atan2(tangent.x, tangent.z), nearest.index);
    this.cameraRig.snapTo(this.car);
  }

  /**
   * 平行光（太阳）跟着赛车移动。
   * 阴影贴图的分辨率有限，只覆盖车周围一小块区域才能保证阴影清晰，
   * 所以光源必须跟着车走。
   */
  #updateSun() {
    const p = this.car.position;
    this.sunLight.position.set(
      p.x + this.sunDirection.x * 120,
      this.sunDirection.y * 120,
      p.z + this.sunDirection.z * 120,
    );
    this.sunLight.target.position.set(p.x, 0, p.z);
    this.sunLight.target.updateMatrixWorld();
  }

  #updateHud(dt, speed, wrongWay) {
    this.hud.update(dt);
    this.hud.setLap(this.race.lap, this.race.totalLaps);
    this.hud.setTimes({
      current: this.race.lapTime,
      best: this.race.bestLap,
      total: this.race.totalTime,
    });
    this.hud.setSpeed(speed);
    this.hud.setWrongWay(wrongWay);
  }
}
