/**
 * 小地图：用 2D Canvas 画一张俯视图。
 *
 * 【为什么不用 3D 相机再渲染一遍】太贵了。
 * 俯视图只需要把世界坐标 (x, z) 线性映射到画布坐标 (px, py)，
 * 用 Canvas 2D 画几十个点几乎没有开销。
 *
 * 赛道形状是静态的，所以只用构建一次 Path2D，之后每帧重复 stroke。
 */
export class Minimap {
  constructor(canvas, track) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.padding = 12;

    // 计算赛道包围盒，把世界坐标缩放到画布内
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of track.points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const width = maxX - minX;
    const height = maxZ - minZ;
    const usable = this.size - this.padding * 2;
    this.scale = usable / Math.max(width, height);
    this.offsetX = this.padding + (usable - width * this.scale) / 2;
    this.offsetY = this.padding + (usable - height * this.scale) / 2;
    this.minX = minX;
    this.minZ = minZ;

    // 预先构建赛道轮廓
    this.trackPath = new Path2D();
    for (let i = 0; i <= track.count; i += 4) {
      const p = track.points[i % track.count];
      const [x, y] = this.toCanvas(p.x, p.z);
      if (i === 0) this.trackPath.moveTo(x, y);
      else this.trackPath.lineTo(x, y);
    }
    this.trackPath.closePath();
    this.startPoint = this.toCanvas(track.points[0].x, track.points[0].z);
  }

  /** 世界坐标 → 画布坐标 */
  toCanvas(x, z) {
    return [
      this.offsetX + (x - this.minX) * this.scale,
      this.offsetY + (z - this.minZ) * this.scale,
    ];
  }

  /**
   * @param {object} data
   * @param {{position:THREE.Vector3, heading:number}} data.car
   * @param {Array} data.coins
   * @param {Array} data.cones
   */
  draw({ car, coins, cones }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    // 赛道：先描一层白边再描深色，得到"道路"的观感
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.stroke(this.trackPath);
    ctx.strokeStyle = '#59627a';
    ctx.lineWidth = 6;
    ctx.stroke(this.trackPath);

    // 起点
    ctx.fillStyle = '#1b2430';
    ctx.beginPath();
    ctx.arc(this.startPoint[0], this.startPoint[1], 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 金币（没吃掉的才画）
    ctx.fillStyle = '#ffb703';
    for (const coin of coins) {
      if (!coin.alive) continue;
      const [x, y] = this.toCanvas(coin.mesh.position.x, coin.mesh.position.z);
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 锥桶
    ctx.fillStyle = '#ff7a1a';
    for (const cone of cones) {
      if (cone.knockedFor > 0) continue;
      const [x, y] = this.toCanvas(cone.mesh.position.x, cone.mesh.position.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    // 赛车：画一个小三角表示朝向
    const [carX, carY] = this.toCanvas(car.position.x, car.position.z);
    ctx.save();
    ctx.translate(carX, carY);
    ctx.rotate(-car.heading + Math.PI);
    ctx.fillStyle = '#ff4d5a';
    ctx.strokeStyle = '#1b2430';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
