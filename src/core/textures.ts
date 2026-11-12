import * as THREE from 'three';

/** 世界地坪尺寸（米） */
export const FACTORY = {
  minX: -75,
  maxX: 75,
  minZ: -30,
  maxZ: 30,
  width: 150,
  depth: 60,
};

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 生成整张车间的地坪平面图贴图（一次 draw call 出全部地面标线）
 */
export function createFloorTexture(): THREE.Texture {
  const PX = 26; // 每米像素
  const w = Math.round(FACTORY.width * PX);
  const h = Math.round(FACTORY.depth * PX);
  const { c, ctx } = makeCanvas(w, h);

  const X = (x: number) => (x - FACTORY.minX) * PX;
  const Z = (z: number) => (z - FACTORY.minZ) * PX;
  const W = (m: number) => m * PX;

  // 基础环氧地坪
  ctx.fillStyle = '#a5acb4';
  ctx.fillRect(0, 0, w, h);

  // 细微噪点，避免大色块死板
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.03)');
  grad.addColorStop(1, 'rgba(255,255,255,0.07)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 2 米分缝网格
  ctx.strokeStyle = 'rgba(120,128,138,0.35)';
  ctx.lineWidth = 1;
  for (let x = FACTORY.minX; x <= FACTORY.maxX; x += 2) {
    ctx.beginPath();
    ctx.moveTo(X(x), 0);
    ctx.lineTo(X(x), h);
    ctx.stroke();
  }
  for (let z = FACTORY.minZ; z <= FACTORY.maxZ; z += 2) {
    ctx.beginPath();
    ctx.moveTo(0, Z(z));
    ctx.lineTo(w, Z(z));
    ctx.stroke();
  }

  const zone = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    fill: string,
    border: string,
    label?: string,
    labelSize = 62,
  ) => {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(X(x0), Z(z0), W(x1 - x0), W(z1 - z0));
    ctx.strokeStyle = border;
    ctx.lineWidth = 7;
    ctx.strokeRect(X(x0), Z(z0), W(x1 - x0), W(z1 - z0));
    if (label) {
      ctx.fillStyle = 'rgba(52,60,70,0.55)';
      ctx.font = `700 ${labelSize}px "Microsoft YaHei","PingFang SC",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, X((x0 + x1) / 2), Z((z0 + z1) / 2));
    }
    ctx.restore();
  };

  // 区域底色：西厅来料 / 北侧产线以东为成品库
  zone(-74.5, -4, -46, 28, 'rgba(242,182,50,0.13)', 'rgba(242,182,50,0.75)', '来料收货区', 54);
  zone(-74.5, -18, -48, -6, 'rgba(74,158,255,0.1)', 'rgba(74,158,255,0.5)', '原 料 库', 48);
  zone(42, -16, 74, 6, 'rgba(150,120,255,0.1)', 'rgba(150,120,255,0.45)', '成 品 库', 54);

  // 三条产线沿北墙并排，z 相同
  const lineBands: Array<[number, number, number, number, string]> = [
    [-42, -9, -24.6, 0x3f7fd8, 'A 合成'],
    [-2, 31, -24.6, 0xd8632c, 'B 复配'],
    [38, 71, -24.6, 0x2fa36b, 'C 灌装'],
  ];
  for (const [x0, x1, z, color, tag] of lineBands) {
    const rgb = `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},`;
    ctx.save();
    ctx.fillStyle = rgb + '0.1)';
    ctx.fillRect(X(x0), Z(z - 4.2), W(x1 - x0), W(8.4));
    ctx.strokeStyle = rgb + '0.6)';
    ctx.lineWidth = 6;
    ctx.strokeRect(X(x0), Z(z - 4.2), W(x1 - x0), W(8.4));
    ctx.fillStyle = rgb + '0.72)';
    ctx.font = `700 42px "Microsoft YaHei",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, X((x0 + x1) / 2), Z(z));
    ctx.restore();
  }

  // 原料线南侧成品冷却带
  zone(-22, -19.4, -12, -15.8, 'rgba(63,127,216,0.12)', 'rgba(63,127,216,0.55)', 'A 冷却', 28);
  zone(12, -19.4, 28, -15.8, 'rgba(216,99,44,0.12)', 'rgba(216,99,44,0.55)', 'B 冷却', 30);

  // 产线以南的物流通道（避开办公楼）
  ctx.save();
  ctx.fillStyle = 'rgba(34,197,94,0.2)';
  ctx.fillRect(X(-74), Z(4.2), W(148), W(2.4));
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `600 32px "Microsoft YaHei","PingFang SC",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('物 流 通 道', X(-16), Z(5.4));
  ctx.restore();

  // 装卸月台（南墙：来料门在西，入库门在办公楼右侧）
  ctx.save();
  ctx.fillStyle = 'rgba(242,182,50,0.16)';
  ctx.fillRect(X(-66), Z(22), W(12), W(7.5));
  ctx.fillRect(X(65), Z(22), W(9), W(7.5));
  ctx.strokeStyle = 'rgba(242,182,50,0.85)';
  ctx.lineWidth = 6;
  ctx.strokeRect(X(-66), Z(22), W(12), W(7.5));
  ctx.strokeRect(X(65), Z(22), W(9), W(7.5));
  ctx.fillStyle = 'rgba(70,78,88,0.7)';
  ctx.font = `700 36px "Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('来 料 门', X(-60), Z(19.4));
  ctx.fillText('入 库 门', X(69.5), Z(19.4));
  ctx.restore();

  // 办公楼（入库门在其右侧）
  ctx.save();
  ctx.fillStyle = 'rgba(120,140,160,0.16)';
  ctx.fillRect(X(44), Z(8), W(16), W(20));
  ctx.strokeStyle = 'rgba(90,104,118,0.65)';
  ctx.lineWidth = 4;
  ctx.strokeRect(X(44), Z(8), W(16), W(20));
  ctx.fillStyle = 'rgba(70,80,92,0.62)';
  ctx.font = `600 34px "Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('办 公 楼', X(52), Z(18));
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** 传送带皮带纹理（沿长度方向滚动） */
export function createBeltTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#3a4149';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    ctx.fillStyle = i % 64 === 0 ? '#333941' : '#414953';
    ctx.fillRect(0, i, 256, 16);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 0, 256, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** 金属/拉丝纹理 */
export function createBrushedTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#8f98a3';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * 256;
    ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 辊道输送机纹理（滚动模拟辊筒转动） */
export function createRollerTexture(): THREE.Texture {
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = '#4a525b';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 16) {
    const g = ctx.createLinearGradient(i, 0, i + 16, 0);
    g.addColorStop(0, '#3a4149');
    g.addColorStop(0.45, '#69737e');
    g.addColorStop(0.6, '#7d8791');
    g.addColorStop(1, '#3a4149');
    ctx.fillStyle = g;
    ctx.fillRect(i, 0, 16, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** 厂区室外空地：混凝土 + 道路 + 停车位 */
export function createYardTexture(): THREE.Texture {
  const SIZE = 2048;
  const SPAN = 520; // 覆盖 520m
  const { c, ctx } = makeCanvas(SIZE, SIZE);
  const P = SIZE / SPAN; // 像素/米
  const X = (x: number) => (x + SPAN / 2) * P;
  const Z = (z: number) => (z + SPAN / 2) * P;
  const W = (m: number) => m * P;

  ctx.fillStyle = '#3b4249';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 混凝土色斑
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 4 + Math.random() * 26;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.022})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 厂区环形道路
  ctx.fillStyle = '#2f363c';
  ctx.fillRect(0, Z(-46), SIZE, W(12));
  ctx.fillRect(0, Z(34), SIZE, W(12));
  ctx.fillRect(X(-94), Z(-46), W(14), W(92));
  ctx.fillRect(X(80), Z(-46), W(14), W(92));

  // 道路中心虚线
  ctx.strokeStyle = 'rgba(225,215,170,0.35)';
  ctx.lineWidth = 3.5;
  ctx.setLineDash([26, 24]);
  ctx.beginPath();
  ctx.moveTo(0, Z(-40));
  ctx.lineTo(SIZE, Z(-40));
  ctx.moveTo(0, Z(40));
  ctx.lineTo(SIZE, Z(40));
  ctx.stroke();
  ctx.setLineDash([]);

  // 停车位
  const bay = (z0: number, x0: number, x1: number) => {
    ctx.fillStyle = 'rgba(28,33,38,0.5)';
    ctx.fillRect(X(x0), Z(z0), W(x1 - x0), W(5.4));
    ctx.strokeStyle = 'rgba(225,228,225,0.3)';
    ctx.lineWidth = 2;
    for (let x = x0; x < x1; x += 2.9) {
      ctx.beginPath();
      ctx.moveTo(X(x), Z(z0));
      ctx.lineTo(X(x), Z(z0 + 5.4));
      ctx.stroke();
    }
  };
  bay(-58, -120, 120);
  bay(48, -120, 120);

  // 装卸位黄框（南侧两个门）
  ctx.strokeStyle = 'rgba(242,182,50,0.6)';
  ctx.lineWidth = 5;
  for (const [dx, dw] of [
    [-60, 12],
    [69.5, 9],
  ] as const) {
    ctx.strokeRect(X(dx - dw / 2), Z(30), W(dw), W(10));
  }

  // 绿化带
  ctx.fillStyle = 'rgba(62,96,64,0.4)';
  ctx.fillRect(X(-160), Z(-70), W(48), W(9));
  ctx.fillRect(X(112), Z(-70), W(48), W(9));
  ctx.fillRect(X(-160), Z(62), W(48), W(9));
  ctx.fillRect(X(112), Z(62), W(48), W(9));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 浮空标签（Sprite，永远面向相机） */
export function createLabelSprite(
  title: string,
  sub?: string,
  accent = '#ff8a2b',
): THREE.Sprite {
  const pad = 22;
  const fs = 40;
  const subFs = 26;
  const probe = makeCanvas(8, 8).ctx;
  probe.font = `600 ${fs}px "Microsoft YaHei","PingFang SC",sans-serif`;
  const tw = probe.measureText(title).width;
  let sw = 0;
  if (sub) {
    probe.font = `400 ${subFs}px "Microsoft YaHei","PingFang SC",sans-serif`;
    sw = probe.measureText(sub).width;
  }
  const w = Math.ceil(Math.max(tw, sw) + pad * 2 + 14);
  const h = Math.ceil(fs + (sub ? subFs + 12 : 0) + pad);

  const { c, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 14);
  ctx.fillStyle = 'rgba(10,15,21,0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  roundRectPath(ctx, 10, 12, 5, h - 24, 2.5);
  ctx.fill();

  ctx.fillStyle = '#eef3f9';
  ctx.font = `600 ${fs}px "Microsoft YaHei","PingFang SC",sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(title, 26, pad - 6);
  if (sub) {
    ctx.fillStyle = 'rgba(200,215,230,0.72)';
    ctx.font = `400 ${subFs}px "Microsoft YaHei","PingFang SC",sans-serif`;
    ctx.fillText(sub, 26, pad + fs + 4);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  );
  const scale = 0.0085;
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.renderOrder = 20;
  return sprite;
}
