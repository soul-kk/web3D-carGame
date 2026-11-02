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

/** 起跑线的黑白格贴图（20×4 格，铺在 18×3.4 m 的起跑线上接近正方形） */
export function createCheckerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 20; x++) {
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#ffffff' : '#1b2430';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return canvasTexture(canvas);
}

/**
 * 草地贴图：底色 + 深浅色块 + 草叶短线。
 * 铺在 4000 m 的地面上（repeat 400 → 每块 10 m），近处看得到草叶，
 * 远处自动糊成深浅色块，不再是一整片死绿。
 *
 * @param {{grass:number, grassShades:number[]}} theme
 */
export function createGrassTexture(theme) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const css = (hex, alpha = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;

  ctx.fillStyle = css(theme.grass);
  ctx.fillRect(0, 0, size, size);

  // 草叶：短斜线。不做大色块 —— 大色块平铺会在俯视时露出棋盘格，
  // 大尺度的深浅交给地面的顶点色（见 environment.js）。
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 1200; i++) {
    const shade = theme.grassShades[(Math.random() * theme.grassShades.length) | 0];
    ctx.strokeStyle = css(shade, 0.55);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 6;
    const lean = (Math.random() - 0.5) * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y - len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(400, 400);
  texture.anisotropy = 4;
  return texture;
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
