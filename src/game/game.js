import { CAR, CAMERA, COLORS, NITRO, RACE } from '../config.js';
import { createEnvironment } from '../world/environment.js';
import { Coins, BoostPads } from '../world/props.js';
import { Particles } from '../fx/particles.js';
import { Skidmarks } from '../fx/skidmarks.js';
import { Car } from './car.js';
import { Race } from './race.js';
import { ChaseCamera } from './camera.js';
import { GhostPlayer, GhostRecorder, clearBest, loadBest, mergeBest, packGhost } from './ghost.js';
import { audio } from './audio.js';

/** 出发位置对应的赛道采样点（稍微过起点线一点，方便起步） */
const START_INDEX = 6;

/**
 * 游戏主控：把所有模块串起来，并实现"每帧该发生什么"的规则。
 *
 * 数据流（每帧一次）：
 *   Input → Car.update() → 与赛道/道具交互 → 幽灵车录制与回放 → Race.update()
 *        → Camera/HUD/小地图 → 渲染
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
    this.boostPads = new BoostPads(scene, this.track);
    this.particles = new Particles(scene, 60);
    this.skidmarks = new Skidmarks(scene);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.chargeTier = 0;

    /* ---------- 赛车 & 相机 ---------- */
    this.car = new Car();
    scene.add(this.car.root);
    this.cameraRig = new ChaseCamera(camera);

    /* ---------- 幽灵车（历史最佳回放） ---------- */
    /** @type {object|null} localStorage 里的历史最佳 */
    this.bestRecord = loadBest();
    /** 这一局开跑前的历史最佳，用来判断完赛后是不是"新纪录" */
    this.recordAtStart = this.bestRecord;
    /** @type {GhostPlayer|null} */
    this.ghost = null;
    this.recorder = new GhostRecorder();

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
    /** 氮气尾焰的节流计时 */
    this.boostTimer = 0;
    /** 仅手刹释放的氮气时长；加速带不会打开屏幕特效。 */
    this.nitroFxRemaining = 0;

    this.phase = 'menu';
    this.transition = null;
    this.#bindActions();
    this.resetWorld();
    this.#showcaseCamera();
    this.#setDrivingControls(false);
  }

  /* ================= 对外接口 ================= */

  /** 主菜单 → 观景镜头平滑接入追车镜头 → 倒计时。 */
  start() {
    if (this.phase !== 'menu') return;
    audio.init();
    audio.resume();
    this.resetWorld({ snapCamera: false });
    const destination = this.cameraRig.chasePose(this.car);
    this.transition = {
      elapsed: 0,
      fromPosition: this.cameraRig.camera.position.clone(),
      fromTarget: this.showcaseTarget.clone(),
      fromFov: this.cameraRig.camera.fov,
      ...destination,
    };
    this.overlay.hide();
    this.phase = 'transitioning';
    if (this.reducedMotion.matches) this.#updateTransition(CAMERA.transitionSeconds);
  }

  /** 完赛后的"再来一局" */
  restart() {
    if (this.phase !== 'finished') return;
    this.overlay.hide();
    this.hud.show();
    this.#beginCountdown();
    this.phase = 'playing';
    this.#setDrivingControls(true);
  }

  #setDrivingControls(visible) {
    document.getElementById('btn-pause').classList.toggle('hidden', !visible);
    if ('ontouchstart' in window) document.getElementById('touch')?.classList.toggle('hidden', !visible);
  }

  pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    document.body.classList.add('game-paused');
    this.input.clear();
    this.#setDrivingControls(false);
    audio.engine(0, 0, false);
    audio.drift(0, false);
    this.overlay.showPause();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.input.clear();
    this.overlay.hide();
    document.body.classList.remove('game-paused');
    this.phase = 'playing';
    this.#setDrivingControls(true);
  }

  returnToMenu() {
    if (this.phase !== 'paused' && this.phase !== 'finished') return;
    this.input.clear();
    document.body.classList.remove('game-paused');
    this.#setDrivingControls(false);
    audio.engine(0, 0, false);
    audio.drift(0, false);
    this.hud.hide();
    this.resetWorld();
    this.#showcaseCamera();
    this.phase = 'menu';
    this.overlay.showMenu();
  }

  #showcaseCamera() {
    const pose = this.cameraRig.showcasePose(this.car);
    this.showcaseTarget = pose.target;
    const camera = this.cameraRig.camera;
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.fov = CAMERA.showcaseFov;
    camera.updateProjectionMatrix();
  }

  #updateTransition(dt) {
    const t = this.transition;
    t.elapsed += dt;
    const progress = Math.min(1, t.elapsed / CAMERA.transitionSeconds);
    const ease = progress * progress * (3 - 2 * progress);
    const camera = this.cameraRig.camera;
    camera.position.lerpVectors(t.fromPosition, t.position, ease);
    const look = t.fromTarget.clone().lerp(t.target, ease);
    camera.lookAt(look);
    camera.fov = t.fromFov + (CAMERA.fov - t.fromFov) * ease;
    camera.updateProjectionMatrix();
    if (progress < 1) return;
    this.cameraRig.position.copy(t.position);
    this.cameraRig.lookTarget.copy(t.target);
    this.cameraRig.apply();
    this.transition = null;
    this.phase = 'playing';
    this.hud.show();
    this.#setDrivingControls(true);
    this.#beginCountdown(false);
  }

  /* ================= 每帧主循环 ================= */

  update(dt) {
    if (this.phase === 'paused' || this.phase === 'finished') return;
    if (this.phase === 'menu' || this.phase === 'transitioning') {
      this.environment.update(dt);
      this.coins.update(dt);
      if (this.phase === 'transitioning') this.#updateTransition(dt);
      return;
    }
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
    this.#handleCoins();
    this.#handleNitro(dt, carState);
    this.#spawnTireSmoke(dt, carState);
    this.skidmarks.update(dt, car, this.race.canDrive && carState.drifting);

    /* ---------- 4. 幽灵车录制 / 回放 ---------- */
    if (this.race.isRacing) this.recorder.record(dt, car);
    if (this.race.canDrive) this.ghost?.update(dt);

    /* ---------- 5. 逆行判定 ---------- */
    const forward = car.forward;
    const wrongWay = this.race.isRacing
      && (nearest.tangent.x * forward.x + nearest.tangent.z * forward.z) < -0.35
      && carState.speed > 4;

    /* ---------- 6. 计时与圈数 ---------- */
    this.race.update(dt, { progress, wrongWay });

    /* ---------- 7. 世界动画 ---------- */
    this.coins.update(dt);
    this.boostPads.update(dt);
    this.particles.update(dt);
    this.environment.update(dt);

    /* ---------- 7. 相机 / 光照 ---------- */
    this.cameraRig.update(dt, car, {
      drifting: carState.drifting,
      lateralSpeed: carState.lateralSpeed,
      reducedMotion: this.reducedMotion.matches,
    });
    this.#updateSun();

    /* ---------- 8. UI 与声音 ---------- */
    this.#updateHud(dt, carState, wrongWay);
    audio.engine(carState.speed, input.throttle, this.race.isRacing);
    audio.drift(carState.lateralSpeed, this.race.isRacing && carState.drifting);
  }

  /** 渲染前的最后一件事：更新小地图 */
  drawMinimap() {
    this.minimap.draw({
      car: this.car,
      coins: this.coins.list,
      ghost: this.ghost,
    });
  }

  /* ================= 内部实现 ================= */

  #bindActions() {
    this.input.on('KeyM', () => {
      const enabled = audio.toggle();
      this.hud.setSoundEnabled(enabled);
    });
    this.input.on('KeyR', () => {
      if (this.phase === 'playing' && this.race.isRacing) this.#respawnOnTrack();
    });
    this.input.on('Escape', () => {
      if (this.phase === 'playing') this.pause();
      else if (this.phase === 'paused') {
        if (this.overlay.view === 'confirm') this.overlay.cancelConfirm();
        else this.resume();
      }
    });
    this.overlay.onPause = () => this.pause();
    this.overlay.onResume = () => this.resume();
    this.overlay.onConfirmReturn = () => this.returnToMenu();
    this.input.on('Enter', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      if (this.phase === 'menu' && this.overlay.view === 'menu') this.start();
      else if (this.phase === 'finished') this.restart();
    });
    this.input.on('Space', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      if (this.phase === 'menu' && this.overlay.view === 'menu') this.start();
      else if (this.phase === 'finished') this.restart();
    });
    // 触屏第一次点击时初始化音频（浏览器要求用户手势）
    this.input.onFirstTouch = () => { audio.init(); audio.resume(); };

    // 开始界面上的"清除记录"（幽灵车也会一起消失）
    this.overlay.onClearRecords = () => {
      clearBest();
      this.bestRecord = null;
      this.recordAtStart = null;
      this.#loadGhost();
      this.overlay.setBest(null);
      this.race.bestLap = null;
      this.hud.setTimes({ current: 0, best: null, total: 0 });
      audio.blip(300, 0.12, 'triangle', 0.1, 180);
    };
  }

  /** 回到开局状态（但不开始倒计时） */
  resetWorld({ snapCamera = true } = {}) {
    this.race.reset();
    this.coins.reset();
    this.boostPads.reset();
    this.countdownLeft = 0;
    this.lastCountdownNumber = -1;
    this.dustTimer = 0;
    this.boostTimer = 0;
    this.nitroFxRemaining = 0;
    this.chargeTier = 0;
    this.skidmarks.reset();
    this.hud.resetEffects();
    audio.drift(0, false);

    // 重新读一次存档，并把"上一局最佳"作为 HUD 上的目标显示出来 ——
    // 哪怕还没有幽灵车，看到上一局的圈速也会想再跑一次。
    this.bestRecord = loadBest();
    this.recordAtStart = this.bestRecord;
    this.pendingBestLap = null;
    this.race.bestLap = this.bestRecord?.bestLapTime ?? null;
    this.recorder.reset();
    this.#loadGhost();
    this.overlay.setBest(this.bestRecord);

    const startPoint = this.track.points[START_INDEX];
    const startTangent = this.track.tangents[START_INDEX];
    this.car.placeAt(startPoint, Math.atan2(startTangent.x, startTangent.z), START_INDEX);
    if (snapCamera) this.cameraRig.snapTo(this.car);
    this.#updateSun();

    this.hud.setLap(1, this.race.totalLaps);
    this.hud.setTimes({ current: 0, best: this.race.bestLap, total: 0 });
    this.hud.setCoins(0);
    this.hud.setWrongWay(false);
    this.hud.setNitro(0, { active: false });
    this.hud.clearMessage();
  }

  /** 用当前存档重建幽灵车（没有记录时就是 null） */
  #loadGhost() {
    this.ghost?.dispose();
    this.ghost = null;

    const record = this.bestRecord?.ghost;
    if (record && Array.isArray(record.data) && record.data.length >= 6) {
      this.ghost = new GhostPlayer(this.scene, record);
    }
    this.hud.setGhost(Boolean(this.ghost));
  }

  #beginCountdown(reset = true) {
    if (reset) this.resetWorld();
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
      this.recorder.reset();
      // 幽灵车录的是"整场"，它的第 0 帧也是"停在起点线上、速度 0"，
      // 所以就在发车这一帧让它出发 —— 它和你一样要静止起步。
      this.ghost?.restart();
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

  /** 阶段提示只在充能上升时触发一次；松手喷氮气有单独的短促高潮。 */
  #handleNitro(dt, carState) {
    const charge = carState.driftCharge;
    if (carState.nitroFired) {
      this.nitroFxRemaining = this.car.boost;
      this.chargeTier = 0;
      audio.blip(240, 0.42, 'sawtooth', 0.13, 1500);
      this.cameraRig.addBoostKick();
      this.hud.burstNitro();
      this.#vibrate([30, 20, 45]);
    } else if (carState.drifting) {
      let tier = 0;
      if (charge >= 1) tier = 2;
      else if (charge >= 0.5) tier = 1;
      if (tier > this.chargeTier) {
        this.chargeTier = tier;
        audio.chargeTier(tier);
        this.#vibrate(tier === 2 ? 25 : 12);
      }
    } else if (charge <= 0.02) {
      this.chargeTier = 0;
    }

    // 跟随氮气加速时长，而非释放动画的固定 .46 秒；加速带不延长氮气特效。
    if (!carState.nitroFired) this.nitroFxRemaining = Math.max(0, this.nitroFxRemaining - dt);
    if (this.car.boost <= 0 || !this.race.canDrive) this.nitroFxRemaining = 0;
    this.hud.setNitroBoost(this.nitroFxRemaining > 0);

    // 加速期间（氮气或加速带）持续冒尾焰
    if (this.car.boost <= 0) return;
    this.boostTimer -= dt;
    if (this.boostTimer > 0) return;
    this.boostTimer = 0.03;

    const forward = this.car.forward;
    this.particles.spawn(
      this.car.position.x - forward.x * 2.3,
      0.75,
      this.car.position.z - forward.z * 2.3,
      COLORS.nitro,
    );
  }

  /** 触屏可选振动；系统要求减少动态效果时不触发。 */
  #vibrate(pattern) {
    if (!this.reducedMotion.matches && 'ontouchstart' in window) navigator.vibrate?.(pattern);
  }

  /** 出界或漂移时后轮冒烟（冒烟 = 正在攒氮气，玩家一眼就能看懂） */
  #spawnTireSmoke(dt, { speed, drifting }) {
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
    // 这里只记圈速。幽灵车是"整场"的，得等这一局跑完、
    // 确认刷新了总用时记录，才把整场采样存下来（见 #handleFinish）。
    if (isBest) {
      this.pendingBestLap = time;
      this.hud.setTimes({ current: 0, best: time, total: this.race.totalTime });
      audio.blip(1200, 0.16, 'triangle', 0.12, 1800);
    }
    // lap 是"刚跑完的那一圈"（race.lap 此时还没加 1），所以下一圈就是 lap + 1
    if (lap < this.race.totalLaps) {
      this.hud.flashMessage(`第 ${lap + 1} 圈`, 64, 1.2);
      audio.blip(700, 0.12, 'square', 0.1, 1000);
    }
  }

  #handleFinish(summary) {
    this.nitroFxRemaining = 0;
    this.hud.setNitroBoost(false);
    audio.blip(660, 0.18, 'triangle', 0.14, 990);
    setTimeout(() => audio.blip(990, 0.35, 'triangle', 0.14, 1320), 180);

    // 和历史最佳比总用时。注意用开跑前的快照，不然会和本局刚刷新的单圈记录比
    const previousBestTotal = this.recordAtStart?.bestTotalTime ?? null;
    const isNewRecord = previousBestTotal === null || summary.totalTime < previousBestTotal;
    const patch = {};
    if (this.pendingBestLap !== null) patch.bestLapTime = this.pendingBestLap;
    if (isNewRecord) {
      // 整场幽灵从绿灯到终点线录制，只有完赛才写盘。
      patch.bestTotalTime = summary.totalTime;
      patch.ghost = packGhost(this.recorder.data, summary.totalTime);
    }
    if (Object.keys(patch).length) this.bestRecord = mergeBest(patch);
    this.phase = 'finished';
    this.#setDrivingControls(false);
    audio.engine(0, 0, false);
    audio.drift(0, false);
    this.hud.clearMessage();
    this.hud.setWrongWay(false);
    this.overlay.showFinish({ ...summary, previousBestTotal, isNewRecord });
  }

  /** 按 R 键：把车放回最近的赛道中心点 */
  #respawnOnTrack() {
    const nearest = this.track.nearest(this.car.position.x, this.car.position.z, this.car.nearestIndex);
    const point = this.track.points[nearest.index];
    const tangent = this.track.tangents[nearest.index];
    this.car.placeAt(point, Math.atan2(tangent.x, tangent.z), nearest.index);
    this.skidmarks.breakTrail();
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

  #updateHud(dt, carState, wrongWay) {
    const speed = carState.speed;
    this.hud.update(dt);
    this.hud.setLap(this.race.lap, this.race.totalLaps);
    this.hud.setTimes({
      current: this.race.lapTime,
      best: this.race.bestLap,
      total: this.race.totalTime,
    });
    this.hud.setSpeed(speed);
    this.hud.setWrongWay(wrongWay);
    this.hud.setNitro(this.car.driftCharge, {
      active: this.race.isRacing,
      handbrake: this.car.handbrake,
      drifting: this.car.drifting,
      onTrack: this.car.onTrack,
      slow: Math.abs(carState.forwardSpeed) < NITRO.driftMinSpeed,
    });
  }
}
