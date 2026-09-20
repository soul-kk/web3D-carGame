/**
 * 全局配置：所有"魔法数字"集中在这里，改数值不用翻代码。
 */

export const RACE = {
  /** 总圈数 */
  laps: 3,
  /** 起跑倒计时秒数（3 → 2 → 1 → GO） */
  countdown: 3.0,
};

export const TRACK = {
  /** 中心线采样点数，越大弯道越平滑、也越费内存 */
  samples: 1200,
  /** 路面宽度 */
  width: 15,
  /** 路肩宽度 */
  curbWidth: 1.7,
  /** 路面离地高度，避免和草地 Z-fighting */
  surfaceY: 0.05,
  /** 闭合样条的控制点 [x, z]，首尾自动相连 */
  controlPoints: [
    [   0, -120], [  70, -110], [ 120,  -70], [ 135,  -10],
    [ 110,   45], [  55,   70], [   0,   65], [ -55,   75],
    [-115,   60], [-145,   10], [-130,  -50], [ -85,  -95], [ -35, -110],
  ],
};

export const CAR = {
  /** 铺装路面最高速度（单位/秒，1 单位 ≈ 1 米） */
  maxSpeed: 55,
  /** 加速度 */
  accel: 19,
  /** 刹车减速度 */
  brake: 34,
  /** 倒车最高速度 / 倒车加速度 */
  reverseMax: 14,
  reverseAccel: 12,
  /** 最大转向角速度（弧度/秒） */
  turnRate: 2.05,
  /** 车轮半径，用于滚动动画 */
  wheelRadius: 0.55,
  /** 侧向抓地力：越大越"粘"，越小越容易漂移 */
  gripOnTrack: 7,
  gripOffTrack: 2,
  /** 草地最高速度系数 */
  offTrackSpeedFactor: 0.42,
  offTrackDrag: 1.7,
  onTrackDrag: 0.12,
  /** 加速带 */
  boostFactor: 1.5,
  boostAccelFactor: 2.2,
  boostDuration: 1.4,
};

export const CAMERA = {
  fov: 62,
  fovSpeedGain: 0.26,
  fovBoost: 7,
  distance: 10.5,
  distanceSpeedGain: 0.07,
  height: 4.8,
  heightSpeedGain: 0.03,
  followLerp: 7,
  lookLerp: 9,
  lookAhead: 8,
  lookHeight: 1.4,
  minHeight: 1.3,
};

export const WORLD = {
  gravity: 26,
  fog: { color: 0xcfe9ff, near: 200, far: 850 },
  sky: { top: 0x2f7fd8, bottom: 0xd8f0ff },
  /** 平行光（太阳）方向，会被归一化 */
  sunDirection: [0.55, 0.62, 0.45],
  /** 太阳光的阴影相机跟随赛车的范围 */
  shadowRadius: 70,
};

export const COLORS = {
  outline: 0x1b2430,
  grass: 0x86cf5a,
  grassShades: [0x7cc44f, 0x9ade6b, 0x6fbc48],
  road: 0x59627a,
  curbA: 0xff4d5a,
  curbB: 0xffffff,
  treeTrunk: 0x8a5a34,
  treeLeaf: 0x3f9142,
  cloud: 0xffffff,
  coin: 0xffd166,
  cone: 0xff7a1a,
  coneBase: 0xe35d00,
  carBody: 0xff4d5a,
  carGlass: 0xa8e6ff,
  carDark: 0x2b2f3a,
  tyre: 0x24262c,
  rim: 0xdfe4ec,
  dustTrack: 0xffffff,
  dustGrass: 0xd9f5a8,
};

/** 金币 / 锥桶 / 加速带 的摆放数量 */
export const PROPS = {
  coinGroups: 10,
  coinsPerGroup: 3,
  coinRadius: 2.8,
  coinHeight: 1.5,
  cones: 18,
  coneHitRadius: 3.2,
  boostPadParams: [0.16, 0.34, 0.52, 0.7, 0.86],
  boostTriggerRadius: 3.6,
};
