import * as THREE from 'three';
import { COLORS } from '../config.js';
import { createToonGradient } from './textures.js';

/** 所有卡通材质共用一张色阶贴图 */
const gradientMap = createToonGradient(4);

/**
 * 创建卡通材质。等价于 MeshToonMaterial + 统一的色阶贴图。
 * @param {number|THREE.Color} color
 * @param {object} [extra] 透传给 MeshToonMaterial 的其它参数
 */
export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

/**
 * 描边材质：把模型反面放大一圈画成黑色，得到漫画式的轮廓线。
 * 用法见 Car 里的 addOutline。
 */
export const outlineMaterial = new THREE.MeshBasicMaterial({
  color: COLORS.outline,
  side: THREE.BackSide,
});

/**
 * 给一个 Mesh 生成一份"描边副本"，直接加到同一个父节点即可。
 * @param {THREE.Mesh} mesh 原始网格（几何体需要以自身原点为中心）
 * @param {number} [scale] 放大倍数
 */
export function addOutline(mesh, scale = 1.06) {
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  outline.scale.setScalar(scale);
  return outline;
}
