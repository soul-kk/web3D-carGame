/**
 * 晴日草原的节奏草稿。
 *
 * 设计目标（改之前这张图一圈全是半径 55~57 m 的中弯，全油门就能过，没有节奏）：
 *   - 起跑直道：开局全油门
 *   - R=42~45 的中速长弯：适时漂移蓄力、出弯释放氮气
 *   - R=30 / R=35 的连续慢弯：入弯控速、出弯再提速
 *   - 直道长度由自动闭合求解器分配，保证首尾严丝合缝
 *
 * 转向总和 = +360°（逆时针一圈）。
 */

export const options = { center: true, heading: 0 };

/** 自由直道（段下标）：起跑直道保持设计值，其余由求解器微调到闭合 */
export const close = [2, 4, 6, 8];

export default [
  { straight: 100 },
  { arc: { radius: 45, deg: 60, dir: 'left' } },
  { straight: 50 },
  { arc: { radius: 43, deg: 70, dir: 'left' } },
  { straight: 70 },
  { arc: { radius: 42, deg: 60, dir: 'left' } },
  { straight: 60 },
  { arc: { radius: 30, deg: 70, dir: 'left' } },
  { straight: 40 },
  { arc: { radius: 35, deg: 55, dir: 'left' } },
  { straight: 50 },
  { arc: { radius: 45, deg: 45, dir: 'left' } },
];
