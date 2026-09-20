import * as THREE from 'three';

/**
 * 生成卡通渲染用的"色阶"贴图。
 * MeshToonMaterial 会用这张一维贴图把光照量化成几档，形成明显的卡通明暗分界。
 */
export function createToonGradient(steps = 4) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round(255 * Math.pow((i + 1) / steps, 0.85));
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** 起跑线的黑白格贴图 */
export function createCheckerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 10; x++) {
    for (let y = 0; y < 3; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#ffffff' : '#1b2430';
      ctx.fillRect(x * 16, y * 14, 16, 14);
    }
  }
  return canvasTexture(canvas);
}

/** 加速带的青色箭头贴图 */
export function createChevronTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#19c6ff';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(24, 40 + k * 70);
    ctx.lineTo(64, 82 + k * 70);
    ctx.lineTo(104, 40 + k * 70);
    ctx.lineTo(104, 66 + k * 70);
    ctx.lineTo(64, 108 + k * 70);
    ctx.lineTo(24, 66 + k * 70);
    ctx.closePath();
    ctx.fill();
  }
  return canvasTexture(canvas);
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
