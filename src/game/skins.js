/**
 * 车辆皮肤：外观方案 + 选中项的持久化。
 *
 * 【为什么皮肤单独放一个文件】车辆模型在 car.js 里，UI 在 ui/overlay.js 里，
 * 如果把"有哪些皮肤"写在任何一个地方，另一个地方就得反过来 import 它，
 * 依赖就变成双向了。放在独立的 skins.js 里，car.js 和 overlay.js 都只
 * 依赖它，方向依然是单向的。
 */

import { readJson, writeJson } from '../core/storage.js';

/** 存储皮肤选择的 key（storage.js 会再加统一前缀） */
const SKIN_STORAGE_KEY = 'selectedSkin';

/**
 * 皮肤列表。每一项描述"这台车长什么样"，具体怎么搭出来由 car.js 负责。
 *
 * - body   车身主色
 * - dark   底盘 / 阴影部件
 * - glass  座舱玻璃
 * - glow   灯 / 发光部件
 * - accent 强调色（车头识别灯等）
 */
export const SKINS = [
  {
    id: 'default',
    name: '红色赛车',
    icon: '🏎️',
    description: '经典方程式风格',
    body: 0xff4d5a,
    dark: 0x2b2f3a,
    glass: 0xa8e6ff,
    glow: 0xfff3b0,
    accent: 0xff2d3d,
  },
  {
    id: 'saucer',
    name: '飞碟',
    icon: '🛸',
    description: '外星科技悬浮飞行器',
    body: 0x8855ff,
    dark: 0x4433aa,
    glass: 0x00ffcc,
    glow: 0x88ffcc,
    accent: 0xff44ff,
  },
  {
    id: 'train',
    name: '蒸汽火车',
    icon: '🚂',
    description: '烧煤的直线怪物，烟囱一路冒烟',
    body: 0x3f8a63,
    dark: 0x1b2622,
    glass: 0xffd166,
    glow: 0xffc857,
    accent: 0xc0392b,
  },
  {
    id: 'monster',
    name: '大脚车',
    icon: '🛻',
    description: '轮子比车还高，专门压弯道',
    body: 0xff8c1a,
    dark: 0x2b2f3a,
    glass: 0xa8e6ff,
    glow: 0xfff3b0,
    accent: 0x1b2430,
  },
  {
    id: 'tank',
    name: '小坦克',
    icon: '🛡️',
    description: '履带压路，炮管朝前',
    body: 0x6f7f4a,
    dark: 0x39422a,
    glass: 0x2b2f3a,
    glow: 0xffd166,
    accent: 0x8a9a5b,
  },
];

/** 默认皮肤 ID */
export const DEFAULT_SKIN = 'default';

/**
 * 根据皮肤 ID 获取皮肤配置。
 * 找不到（比如存的是已经删掉的皮肤）就退回第一个，保证永远拿得到一个可用皮肤。
 * @param {string} id
 * @returns {object} 皮肤配置
 */
export function getSkinById(id) {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}

/**
 * 保存用户选择的皮肤
 * @param {string} skinId
 */
export function saveSkin(skinId) {
  writeJson(SKIN_STORAGE_KEY, skinId);
}

/**
 * 读取用户保存的皮肤。
 * 存档里可能是已经被删掉的皮肤 id，所以要按"能不能查到"再判断一次。
 * @returns {string} 皮肤 ID
 */
export function loadSkin() {
  const saved = readJson(SKIN_STORAGE_KEY, DEFAULT_SKIN);
  return getSkinById(saved).id;
}
