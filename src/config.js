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
  /**
   * 路面宽度。
   * 这个值直接决定漂移好不好玩：路太窄时，一甩尾就滑到草地上，
   * 而草地最高速度只有 `CAR.offTrackSpeedFactor` 倍 —— 一次漂移就毁掉一圈。
   * 15 → 20 之后，漂移才有"滑出去一点、还能拉回来"的余地。
   */
  width: 20,
  /** 路肩宽度 */
  curbWidth: 1.7,
  /** 路面离地高度，避免和草地 Z-fighting */
  surfaceY: 0.05,
  /** 闭合样条的控制点 [x, z]，首尾自动相连 */
  controlPoints: [
    [0, -120],
    [70, -110],
    [120, -70],
    [135, -10],
    [110, 45],
    [55, 70],
    [0, 65],
    [-55, 75],
    [-115, 60],
    [-145, 10],
    [-130, -50],
    [-85, -95],
    [-35, -110],
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
  /**
   * 草地最高速度系数。
   */
  offTrackSpeedFactor: 0.8,
  offTrackDrag: 1.7,
  onTrackDrag: 0.12,
  /** 加速带 */
  boostFactor: 1.5,
  boostAccelFactor: 2.2,
  boostDuration: 1.4,
  /** 手刹（漂移）：按住时侧向抓地力骤降，车尾甩出去 */
  handbrakeGrip: 2.8,
  /**
   * 手刹带来的额外前进阻力。
   * 注意这个是"指数衰减系数"：0.7 意味着每秒速度乘 exp(-0.7) ≈ 0.5，
   * 漂一秒掉一半速度 —— 实测下来太狠了（整圈慢一倍多），0.25 刚好是
   * "漂移确实掉速，但不会把速度吃光"的程度。
   */
  handbrakeDrag: 0.25,
  /**
   * 手刹时转向的额外倍率。
   * 不要调大：真正把车头甩过去的是"侧滑"，再叠一个转向倍率只会让车打转，
   * 实测倍率 1.15 时侧滑角会冲到 60° 以上（转圈），1.0 才是可控的漂移。
   */
  handbrakeTurnGain: 1.0,
};

/**
 * 漂移攒氮气：按住手刹甩尾时充能，满格后松开手刹自动喷。
 *
 * 【为什么要"攒"】如果漂移直接给加速，玩家就会一路按着手刹不动。
 * 把奖励放在"松开"的那一刻，漂移就变成了一次有始有终的操作，
 * 玩家必须在出弯前把车摆正，才有意义。
 */
export const NITRO = {
  /** 判定"正在漂移"的最小侧滑速度（太小只是正常转弯） */
  driftMinLateral: 4.5,
  /** 判定"正在漂移"的最低车速 */
  driftMinSpeed: 8,
  /**
   * 漂移时每秒充能（1 = 满格）→ 满格需要 1 秒。
   * 这个值要和 boostDuration 一起看：如果充能比续航快太多
   * （比如 0.9 秒攒满喷 2 秒），玩家就能无限连喷，氮气变成常驻状态。
   * 1 秒充能 / 1.6 秒续航大约 1:1.6，还在"必须真的去漂"的范围内。
   */
  chargeRate: 1.0,
  /** 没在漂移时每秒衰减 */
  decayRate: 0.55,
  /** 满格释放后的加速时长（秒） */
  boostDuration: 1.6,
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
  carBody: 0xff4d5a,
  carGlass: 0xa8e6ff,
  carDark: 0x2b2f3a,
  tyre: 0x24262c,
  rim: 0xdfe4ec,
  dustTrack: 0xffffff,
  dustGrass: 0xd9f5a8,
  /** 氮气尾焰 */
  nitro: 0x66e0ff,
};

/** 金币 / 加速带 的摆放数量 */
export const PROPS = {
  coinGroups: 10,
  coinsPerGroup: 3,
  coinRadius: 2.8,
  coinHeight: 1.5,
  boostPadParams: [0.16, 0.34, 0.52, 0.7, 0.86],
  boostTriggerRadius: 3.6,
};
