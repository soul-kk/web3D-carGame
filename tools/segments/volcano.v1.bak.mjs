/**
 * 熔岩环道的节奏草稿。
 *
 * 改之前这张图的问题（都是 tools/map-check.mjs 量出来的）：
 *   - 起跳唇正好落在半径 17 m 的急弯里 —— 桥是弯的，飞出去的方向是斜的
 *   - 落地后 20 m 就是半径 9 m 的折角 —— 落地即死
 *   - 另外还有 3 处 26~34 m 的急弯
 *
 * 现在的排法：
 *   - 第 8 段是一整条 230 m 的直道，断桥就架在这条直道上（起跳和落地都是直的）
 *   - 技术段放在直道之前：R=40 的紧弯（弯内最高速 45 m/s，必须减速）
 *   - 转向总和 = +360°
 */

export const options = { center: true, heading: 0 };

/** 自由直道（段下标）：起跑直道和断桥直道保持设计值，其余由求解器微调 */
export const close = [2, 4, 6, 10];

export default [
  { straight: 110 },
  { arc: { radius: 105, deg: 80, dir: 'left' } },
  { straight: 55 },
  { arc: { radius: 70, deg: 55, dir: 'left' } },
  { straight: 45 },
  { arc: { radius: 30, deg: 50, dir: 'left' } },
  { straight: 50 },
  { arc: { radius: 95, deg: 65, dir: 'left' } },
  // ↓ 这段直道就是断桥所在：坡道 + 起跳唇 + 断口 + 落地
  { straight: 230 },
  { arc: { radius: 90, deg: 65, dir: 'left' } },
  { straight: 55 },
  { arc: { radius: 55, deg: 45, dir: 'left' } },
];
