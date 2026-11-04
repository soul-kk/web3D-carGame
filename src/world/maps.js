/**
 * 地图：赛道形状 + 视觉主题 + 配乐。
 *
 * 【为什么要单独一个文件】赛道几何（config.js 里的控制点）、
 * 配色（config.js 里的 COLORS）和背景音乐是三件不同的事，但它们
 * 必须成组出现 —— 换一张地图就要同时换形状、换配色、换曲子。
 * 把它们收在一处，maintainer 改地图时只需要动这一个文件。
 *
 * 依赖方向：maps.js → config.js（单向）。其它模块不 import maps.js，
 * 而是从 main.js 注入具体的那一份配置，避免谁都能偷偷改全局状态。
 */

import { COLORS, TRACK, WORLD } from '../config.js';
import { readJson, writeJson } from '../core/storage.js';

/**
 * 把闭合赛道的控制点数组旋转 k 个点（形状不变，只是换一个起跑位置）。
 * 断桥原来架在起跑直道上，把起跑线转到 93 m 直道那一段，
 * 桥就落到一圈的中段了。
 *
 * @param {number[]} points 扁平控制点 [x, z, x, z, ...]
 * @param {number} k 旋转多少个"点对"
 * @returns {number[]}
 */
function rotateControlPoints(points, k) {
  const pairs = points.length / 2;
  const shift = ((k % pairs) + pairs) % pairs;
  return [...points.slice(shift * 2), ...points.slice(0, shift * 2)];
}

/**
 * @typedef {object} MapTheme
 * @property {number} grass 草地主色
 * @property {number[]} grassShades 草地深浅色块
 * @property {number} road 路面颜色
 * @property {number} curbA 路肩条纹 A
 * @property {number} curbB 路肩条纹 B
 * @property {number} treeTrunk 树干颜色
 * @property {number} treeLeaf 树叶基色
 * @property {number} treeHue 树叶色相基准（每棵树会在它周围随机浮动）
 * @property {number} treeSat 树叶饱和度
 * @property {number} treeLight 树叶明度
 * @property {number} cloud 云朵颜色
 * @property {number} skyTop 天空顶部颜色
 * @property {number} skyBottom 天空底部颜色
 * @property {{color:number,near:number,far:number}} fog 雾
 * @property {number} sun 直射光颜色
 * @property {number} hemiSky 半球光天空色
 * @property {number} hemiGround 半球光地面色
 * @property {{hue:number,sat:number,light:number}} hill 远山颜色
 * @property {'meadow'|'volcano'} scenery 用哪套场景生成器（决定长什么样，不只是配色）
 * @property {number} centerLine 路面中线颜色
 * @property {number} lava 熔岩颜色（火山图专用）
 * @property {number} ash 灰烬颜色（火山图专用）
 */

/** @type {MapTheme} */
const GRASSLAND_THEME = {
  grass: COLORS.grass,
  grassShades: COLORS.grassShades,
  road: COLORS.road,
  curbA: COLORS.curbA,
  curbB: COLORS.curbB,
  treeTrunk: COLORS.treeTrunk,
  treeLeaf: COLORS.treeLeaf,
  treeHue: 0.28,
  treeSat: 0.55,
  treeLight: 0.4,
  cloud: COLORS.cloud,
  skyTop: WORLD.sky.top,
  skyBottom: WORLD.sky.bottom,
  fog: { ...WORLD.fog },
  sun: 0xfff4d6,
  hemiSky: 0xdff1ff,
  hemiGround: 0x5a8f3c,
  hill: { hue: 0.33, sat: 0.35, light: 0.42 },
  scenery: 'meadow',
  centerLine: 0xf2f4f8,
  lava: 0xff6a1a,
  ash: 0x8a6a5a,
};

/** @type {MapTheme} */
const VOLCANO_THEME = {
  grass: 0x3a3038,
  grassShades: [0x463a42, 0x2f272e, 0x554550],
  road: 0x4a4048,
  curbA: 0xff5a1f,
  curbB: 0x2b2229,
  treeTrunk: 0x241d22,
  treeLeaf: 0x171317,
  treeHue: 0.9,
  treeSat: 0.15,
  treeLight: 0.12,
  cloud: 0x6b5250,
  skyTop: 0x1b0d12,
  skyBottom: 0x7a2a18,
  fog: { color: 0x4a1d16, near: 120, far: 560 },
  sun: 0xffb37a,
  hemiSky: 0x8a3b25,
  hemiGround: 0x241a1e,
  hill: { hue: 0.03, sat: 0.22, light: 0.24 },
  scenery: 'volcano',
  centerLine: 0xffb066,
  lava: 0xff6a1a,
  ash: 0x9c7a68,
  /** 断桥：桥板是浅一点的岩石色，护栏是暗橙，和熔岩分开 */
  bridgeDeck: 0x6b5a54,
  rail: 0x9c4a2a,
};

/** 所有可选地图。索引 0 是默认地图。 */
export const MAPS = [
  {
    id: 'grassland',
    name: '晴日草原',
    icon: '🌤️',
    description: '经典环形赛道',
    /** 背景音乐 id（见 game/songs.js） */
    song: 'sunny',
    /** 赛道控制点 [x, z]，首尾自动相连 */
    controlPoints: TRACK.controlPoints,
    /** 路面宽度 */
    width: TRACK.width,
    theme: GRASSLAND_THEME,
    /**
     * 金币 / 加速带的摆法。
     *
     * 【为什么按地图单独写死】这两样东西是"引导玩家走哪条线"的设计：
     * 加速带要放在出弯之后（出弯加速才有意义）、金币串要横在直道上（好走）。
     * 这些都跟这张地图的形状有关，全局统一一套参数就没法照顾每张图。
     *
     *   coins.runs[i].t       这一串金币的起点（赛道归一化弧长 0~1）
     *   coins.runs[i].offset  这一串相对赛道中线的横向偏移（米，负=左 正=右）
     *   coins.count           每串几枚
     *   coins.spacing         串内相邻两枚的间距（米）
     *   boosts[i].t           加速带位置
     *   boosts[i].offset      加速带的横向偏移（米）
     */
    /**
     * 摆位依据（见 docs/map-design.md §5.4）：
     *   金币串全部摆在直道上、横向偏一点（正中间反而没意思）；
     *   加速带放在"出弯之后进入直道"的位置 —— 弯中加速只会让你冲出去。
     *
     * 直道/漂移弯与断桥区间以 tools/map-check.mjs 的真实曲率输出为准。
     * 长直道让出弯氮气有空间发挥；加速带避开漂移出弯即喷的位置。
     */
    props: {
      coins: {
        runs: [
          // 直道两侧交替变线，避开弯中拾取
          { t: 0.018, offset: -3 }, { t: 0.065, offset: 3 }, { t: 0.115, offset: -3 },
          { t: 0.345, offset: 3 }, { t: 0.39, offset: -3 }, { t: 0.44, offset: 3 },
          { t: 0.548, offset: -3 }, { t: 0.595, offset: 3 }, { t: 0.64, offset: -3 },
          { t: 0.747, offset: 3 }, { t: 0.888, offset: 3 },
        ],
        count: 4,
        spacing: 7,
      },
      // 加速带离开出弯口，给玩家留足氮气喷射的空间
      boosts: [
        // 出弯留给玩家的氮气，不再用免费加速带覆盖漂移奖励
        { t: 0.045, offset: 0 }, { t: 0.405, offset: 2 },
      ],
    },
  },
  {
    id: 'volcano',
    name: '熔岩环道',
    icon: '🌋',
    description: '黑曜石与熔岩之间的窄道',
    song: 'lava',
    /**
     * 和草原那张不同的形状：多个可连续漂移的中速弯和一个 R=32 紧弯，
     * 加上一条 230 m 的断桥直道（断桥在一圈中段）。
     *
     * 【怎么来的】同样是用 tools/make-track.mjs 按节奏生成的，
     * 草稿在 tools/segments/volcano.mjs。
     */
    controlPoints: rotateControlPoints([
    -58.9, -159.3, -52.9, -159.3, -46.9, -159.3, -40.9, -159.3, -34.9, -159.3, -28.9, -159.3,
    -23, -159.3, -17, -159.3, -11, -159.3, -5, -159.3, 1, -159.3, 7, -159.3,
    12.9, -159.3, 18.9, -159.3, 24.9, -159.3, 30.9, -159.3, 36.9, -159.3, 42.9, -159.3,
    48.8, -159.3, 54.8, -159.1, 60.7, -158.3, 66.5, -156.7, 72, -154.3, 77.2, -151.3,
    81.9, -147.7, 86.2, -143.5, 89.9, -138.8, 92.9, -133.7, 95.3, -128.2, 97, -122.4,
    98.1, -116.6, 99.1, -110.7, 100.2, -104.8, 101.2, -98.9, 102.3, -93, 103.3, -87.1,
    104.3, -81.2, 105.4, -75.3, 106.4, -69.4, 107.5, -63.5, 108.5, -57.6, 109.5, -51.7,
    110.6, -45.9, 111.6, -40, 112.7, -34.1, 113.7, -28.2, 114.7, -22.3, 115.8, -16.4,
    116.8, -10.5, 117.8, -4.6, 118.9, 1.3, 119.9, 7.2, 121, 13.1, 122, 19,
    123, 24.9, 124.1, 30.8, 125.1, 36.7, 126.2, 42.5, 127.2, 48.4, 128.2, 54.3,
    129, 60.3, 128.9, 66.2, 128, 72.1, 126.4, 77.9, 123.8, 83.3, 120.6, 88.3,
    116.7, 92.8, 112.4, 97.1, 108.2, 101.3, 104, 105.5, 99.7, 109.8, 95.5, 114,
    91.3, 118.2, 87, 122.4, 82.8, 126.7, 78.6, 130.9, 74.3, 135.1, 70.1, 139.4,
    65.9, 143.6, 61.6, 147.8, 57.4, 152.1, 53.2, 156.3, 48.9, 160.5, 44.7, 164.8,
    40.5, 169, 36.3, 173.2, 32, 177.5, 27.5, 181.4, 22.5, 184.6, 16.9, 186.7,
    11, 187.7, 5, 187.7, -0.9, 187.1, -6.9, 186.6, -12.9, 186.1, -18.8, 185.6,
    -24.7, 184.6, -30.4, 182.8, -35.9, 180.4, -40.9, 177.2, -45.5, 173.4, -49.6, 169,
    -53.1, 164.1, -55.8, 158.8, -58, 153.2, -60, 147.6, -62.1, 142, -64.1, 136.4,
    -66.2, 130.8, -68.2, 125.1, -70.2, 119.5, -72.3, 113.9, -74.3, 108.3, -76.4, 102.6,
    -78.4, 97, -80.5, 91.4, -82.5, 85.8, -84.6, 80.1, -86.6, 74.5, -88.7, 68.9,
    -90.7, 63.3, -92.8, 57.6, -94.8, 52, -96.9, 46.4, -98.9, 40.8, -100.9, 35.2,
    -103, 29.5, -105, 23.9, -107.1, 18.3, -109.1, 12.7, -111.2, 7, -113.2, 1.4,
    -115.3, -4.2, -117.3, -9.8, -119.4, -15.5, -121.4, -21.1, -123.5, -26.7, -125.5, -32.3,
    -127.6, -37.9, -129.6, -43.6, -131.6, -49.2, -133.7, -54.8, -135.7, -60.4, -137.3, -66.2,
    -138.2, -72.1, -138.3, -78.1, -137.7, -84, -136.3, -89.8, -134.1, -95.4, -131.3, -100.7,
    -127.9, -105.6, -123.9, -110, -119.6, -114.3, -115.4, -118.5, -111.2, -122.7, -107, -126.9,
    -102.7, -131.2, -98.5, -135.4, -94.3, -139.6, -90, -143.9, -85.8, -148.1, -81.2, -152,
    -76.1, -155.1, -70.6, -157.4, -64.8, -158.8,
    ], 33),
    width: 36,
    theme: VOLCANO_THEME,
    /**
     * 断桥：一段架在熔岩裂谷上的高架桥，中间的桥面塌了。
     * 冲上起跳唇就能飞过去 —— 掉下去就沉进熔岩。
     *
     * 【位置】起跑线在长直道上，桥落在一圈中段：
     * t≈0.44 上桥、0.54 断口、0.57 落地。整座桥在 230 m 直道上。
     *
     * 【参数含义】都是赛道参数 t∈[0,1)（沿中心线的归一化弧长）
     *   from / to   整座桥的范围
     *   gapFrom/gapTo  塌掉的那一段（这里没有桥面）
     *   height      桥面离地高度
     */
    bridge: {
      from: 0.441,
      to: 0.655,
      gapFrom: 0.541,
      gapTo: 0.571,
      height: 6.5,
    },
    /**
     * 直道：起跑线在长直道上（t≈0），断桥直道在 t≈0.43~0.66，
     * 具体分段用 tools/map-check.mjs 在真实曲线上量。
     */
    props: {
      coins: {
        runs: [
          { t: 0.035, offset: -2.5 }, { t: 0.085, offset: 2.5 }, { t: 0.12, offset: -2.5 },
          { t: 0.22, offset: 3 }, { t: 0.27, offset: -3 },
          // 桥前与桥后，断口 0.541~0.571 上不摆金币
          { t: 0.455, offset: -2.5 }, { t: 0.505, offset: 0 },
          { t: 0.58, offset: 2.5 }, { t: 0.61, offset: -2.5 },
          { t: 0.73, offset: 3 }, { t: 0.83, offset: -2.5 },
        ],
        count: 4,
        spacing: 7,
      },
      boosts: [
        { t: 0.075, offset: 0 }, { t: 0.275, offset: 2 },
        // 断桥要让普通跑法也能飞过去，起跳唇前保留一条加速带
        { t: 0.47, offset: 0 }, { t: 0.513, offset: 0 },
        { t: 0.58, offset: 0 }, { t: 0.745, offset: -2 }, { t: 0.85, offset: 2 },
      ],
    },
  },
];

/** 默认地图 id */
export const DEFAULT_MAP_ID = MAPS[0].id;

/**
 * 按 id 找地图。找不到（存档里的 id 已经被删掉）就退回默认地图。
 * @param {string} id
 */
export function getMapById(id) {
  return MAPS.find((map) => map.id === id) ?? MAPS[0];
}

/** 存储当前地图的 key（storage.js 会再加统一前缀） */
const MAP_STORAGE_KEY = 'selectedMap';

/**
 * 保存玩家选中的地图
 * @param {string} mapId
 */
export function saveMap(mapId) {
  writeJson(MAP_STORAGE_KEY, mapId);
}

/**
 * 读取上次选的地图。
 * @returns {string} 地图 id
 */
export function loadMap() {
  return getMapById(readJson(MAP_STORAGE_KEY, DEFAULT_MAP_ID)).id;
}
