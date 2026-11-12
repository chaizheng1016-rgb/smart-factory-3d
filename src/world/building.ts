import * as THREE from 'three';
import { C } from '../core/palette';
import { box, cyl, mat, emissive, glassMaterial } from '../core/utils';
import { createFloorTexture, createYardTexture, FACTORY } from '../core/textures';
import {
  DOORS,
  LEVEL1_H,
  LEVEL2_Y,
  LINES,
  OFFICE,
  ROOF_Y,
  conveyorOffset,
} from './layout';

/**
 * 厂房主体（150m × 60m）：
 *  - 1F 西厅：来料收货 + 原料库；东厅：成品库
 *  - 2F：A / B / C 沿北墙并排，三条都贴墙；A、B 南侧地面放成品冷却
 *  - 南墙两个门洞：来料门在西，入库门在办公楼东侧（右侧）
 *  - 剖切式处理：南北墙做矮墙，保证俯视可看进车间
 */
export function buildBuilding(scene: THREE.Scene): THREE.Group {
  const root = new THREE.Group();
  root.name = 'building';

  /* ---------------- 地坪 ---------------- */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FACTORY.width, FACTORY.depth),
    new THREE.MeshStandardMaterial({ map: createFloorTexture(), roughness: 0.78, metalness: 0.04 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshStandardMaterial({ map: createYardTexture(), roughness: 0.94, metalness: 0.02 }),
  );
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.08;
  outside.receiveShadow = true;
  root.add(outside);

  const wallOuter = mat(C.wall, { roughness: 0.85, metalness: 0.05 });
  const wallBase = mat(C.wallBase, { roughness: 0.8 });
  const glass = glassMaterial(0x86c6e6, 0.4);
  const colMat = mat(C.column, { roughness: 0.55, metalness: 0.45 });
  const steel = mat(C.steel, { roughness: 0.4, metalness: 0.72 });
  const dark = mat(C.darkSteel, { roughness: 0.55, metalness: 0.5 });

  const X0 = FACTORY.minX;
  const X1 = FACTORY.maxX;
  const Z0 = FACTORY.minZ;
  const Z1 = FACTORY.maxZ;
  const T = 0.34;

  /* ---------------- 剖切矮墙（南北） ---------------- */
  for (const z of [Z0, Z1]) {
    box(root, FACTORY.width + T * 2, 1.15, T, wallBase, { pos: [0, 0.575, z] });
    box(root, FACTORY.width + T * 2, 0.1, T + 0.08, colMat, { pos: [0, 1.18, z] });
  }

  /* ---------------- 东西端墙 ---------------- */
  for (const x of [X0, X1]) {
    box(root, T, 1.0, FACTORY.depth, wallBase, { pos: [x, 0.5, 0] });
    box(root, T, 1.45, FACTORY.depth, glass, { pos: [x, 2.72, 0] });
    box(root, T, LEVEL1_H - 3.45, FACTORY.depth, wallOuter, {
      pos: [x, 3.45 + (LEVEL1_H - 3.45) / 2, 0],
    });
    box(root, T + 0.05, 0.1, FACTORY.depth, colMat, { pos: [x, 2.0, 0] });
    box(root, T + 0.05, 0.1, FACTORY.depth, colMat, { pos: [x, 3.45, 0] });
  }

  /* ---------------- 南墙两个门洞（洞口沿墙展开） ---------------- */
  const doorPortal = (x: number, w: number, signColor: number) => {
    const hw = w / 2;
    box(root, 0.42, 5.2, 0.7, dark, { pos: [x - hw, 2.6, Z1] });
    box(root, 0.42, 5.2, 0.7, dark, { pos: [x + hw, 2.6, Z1] });
    box(root, w + 1.1, 0.5, 0.75, colMat, { pos: [x, 5.3, Z1] });
    const shutter = mat(0x9aa5b1, { roughness: 0.5, metalness: 0.55 });
    for (let i = 0; i < 4; i++) {
      box(root, w - 0.5, 0.26, 0.1, shutter, { pos: [x, 4.35 + i * 0.3, Z1 + 0.05] });
    }
    box(root, Math.min(w * 0.7, 8), 0.7, 0.18, emissive(signColor, 1.4), { pos: [x, 6.15, Z1 + 0.2] });
    const dw = w + 1.2;
    box(root, dw, 1.05, 6.0, mat(0x6c7681, { roughness: 0.85 }), { pos: [x, 0.52, Z1 + 4.0] });
    box(root, dw + 0.35, 0.16, 6.3, mat(C.safety, { roughness: 0.6 }), { pos: [x, 1.1, Z1 + 4.0] });
    box(root, 3.0, 0.4, 2.0, mat(0x4a535f), { pos: [x, 0.7, Z1 + 1.2] });
  };
  doorPortal(DOORS.incoming.x, DOORS.incoming.width, 0x4a9eff);
  doorPortal(DOORS.outgoing.x, DOORS.outgoing.width, 0x2fd07a);

  /* ---------------- 屋面钢柱：只落在各产线平台两侧，避开通道 ---------------- */
  const edgeZ = (line: (typeof LINES)[number], side: -1 | 1) => line.z + side * 4.15;
  for (const line of LINES) {
    const xs: number[] = [];
    for (let x = line.x0; x <= line.x1; x += 12) xs.push(x);
    if (xs[xs.length - 1] !== line.x1) xs.push(line.x1);
    for (const x of xs) {
      for (const s of [-1, 1] as const) {
        const z = edgeZ(line, s);
        box(root, 0.48, ROOF_Y, 0.48, colMat, { pos: [x, ROOF_Y / 2, z] });
        box(root, 0.9, 0.22, 0.9, mat(C.darkSteel), { pos: [x, 0.11, z] });
      }
    }
    for (const s of [-1, 1] as const) {
      const z = edgeZ(line, s);
      const len = line.x1 - line.x0;
      const cx = (line.x0 + line.x1) / 2;
      box(root, len, 0.36, 0.26, colMat, { pos: [cx, ROOF_Y - 0.3, z] });
    }
  }

  /* ---------------- 每条产线的二层钢平台 ---------------- */
  const deckMat = mat(0x6f7883, { roughness: 0.85, metalness: 0.15 });
  for (const line of LINES) {
    const len = line.x1 - line.x0 + 4;
    const cx = (line.x0 + line.x1) / 2;
    box(root, len, 0.22, 8.2, deckMat, { pos: [cx, LEVEL2_Y - 0.11, line.z] });
    for (const s of [-1, 1]) {
      box(root, len, 0.4, 0.24, colMat, { pos: [cx, LEVEL2_Y - 0.4, line.z + s * 4.1] });
    }
    for (let x = line.x0 - 1; x <= line.x1 + 1; x += 9) {
      for (const s of [-1, 1]) {
        box(root, 0.32, LEVEL2_Y - 0.52, 0.32, colMat, {
          pos: [x, (LEVEL2_Y - 0.52) / 2, line.z + s * 4.1],
        });
      }
    }
    // 检修爬梯开在通道侧，不顶到外墙
    const ladderZ = line.z + conveyorOffset(line) + (line.wall < 0 ? 1.8 : -1.8);
    for (let y = 0.6; y < LEVEL2_Y - 0.4; y += 0.42) {
      box(root, 0.7, 0.07, 0.07, steel, { pos: [line.x0 + 0.6, y, ladderZ] });
    }
    for (const s of [-1, 1]) {
      box(root, 0.08, LEVEL2_Y, 0.08, steel, {
        pos: [line.x0 + 0.6 + s * 0.32, LEVEL2_Y / 2, ladderZ],
      });
    }
  }

  /* ---------------- 工艺管廊 ---------------- */
  const pipeCols = [0x9aa5b1, 0xc4703a, 0x4f7fbf, 0x5f9a63];
  for (const line of LINES) {
    for (let i = 0; i < 4; i++) {
      const y = ROOF_Y - 2.0 - i * 0.44;
      const aisle = line.wall < 0 ? 1 : -1;
      const p = cyl(
        root,
        0.14,
        0.14,
        line.x1 - line.x0 + 4,
        10,
        mat(pipeCols[i % 4], { roughness: 0.4, metalness: 0.6 }),
        {
          pos: [(line.x0 + line.x1) / 2, y, line.z + aisle * (2.5 + i * 0.36)],
          rot: [0, 0, Math.PI / 2],
        },
      );
      p.castShadow = false;
    }
    const aisle = line.wall < 0 ? 1 : -1;
    for (let x = line.x0; x <= line.x1; x += 9) {
      box(root, 0.12, 2.1, 0.12, steel, { pos: [x, ROOF_Y - 3.1, line.z + aisle * 2.5] });
    }
  }

  /* ---------------- 垂直提升机（每条线入口，1F → 2F） ---------------- */
  const placeLift = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    for (const s of [-1, 1]) {
      box(g, 0.26, 9.6, 0.26, colMat, { pos: [s * 1.6, 4.8, -1.6] });
      box(g, 0.26, 9.6, 0.26, colMat, { pos: [s * 1.6, 4.8, 1.6] });
    }
    for (const y of [1.2, LEVEL2_Y, 9.4]) {
      box(g, 3.5, 0.24, 3.5, colMat, { pos: [0, y, 0] });
    }
    box(g, 3.3, 4.2, 0.08, glassMaterial(0x9ad3ee, 0.22), { pos: [0, 3.2, 1.65] });
    box(g, 3.3, 4.2, 0.08, glassMaterial(0x9ad3ee, 0.22), { pos: [0, 3.2, -1.65] });
    box(g, 0.08, 4.2, 3.3, glassMaterial(0x9ad3ee, 0.22), { pos: [-1.65, 3.2, 0] });
    const cage = new THREE.Group();
    cage.position.set(0, 1.0, 0);
    box(cage, 2.8, 0.16, 2.8, mat(C.safety, { roughness: 0.6 }), { pos: [0, 0, 0] });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(cage, 0.1, 2.7, 0.1, steel, { pos: [sx * 1.35, 1.35, sz * 1.35] });
      }
    }
    box(cage, 2.8, 0.1, 2.8, steel, { pos: [0, 2.7, 0] });
    cage.userData.isLiftCage = true;
    g.add(cage);
    root.add(g);
  };
  for (const line of LINES) {
    placeLift(line.x0 - 3.4, line.z + conveyorOffset(line));
  }

  /* ---------------- 成品下料口（2F → 1F，每条线出口） ---------------- */
  for (const line of LINES) {
    const g = new THREE.Group();
    g.position.set(line.x1 + 1.8, 0, line.z + conveyorOffset(line));
    for (const s of [-1, 1]) {
      box(g, 0.24, 7.8, 0.24, colMat, { pos: [s * 1.3, 3.9, -1.3] });
      box(g, 0.24, 7.8, 0.24, colMat, { pos: [s * 1.3, 3.9, 1.3] });
    }
    box(g, 2.9, 0.2, 2.9, colMat, { pos: [0, 7.8, 0] });
    const chute = cyl(g, 0.78, 0.78, 6.4, 16, mat(0xb9c2cb, { roughness: 0.4, metalness: 0.65 }), {
      pos: [0, 3.4, 0],
    });
    chute.castShadow = true;
    box(g, 2.0, 0.18, 2.0, mat(C.safety, { roughness: 0.6 }), { pos: [0, 0.12, 0] });
    root.add(g);
  }

  /* ---------------- 楼梯（1F → 2F） ---------------- */
  {
    const g = new THREE.Group();
    // 落在 A、B 线之间，向北接到贴墙平台
    g.position.set(-5.5, 0, -13.5);
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      box(g, 1.6, 0.08, 0.34, mat(0x8b949e, { roughness: 0.7 }), {
        pos: [0, 0.3 + i * 0.32, -i * 0.34],
      });
    }
    const beamLen = Math.hypot(steps * 0.32, steps * 0.34);
    const beam = box(g, 0.16, 0.34, beamLen, steel, { pos: [-0.85, 3.4, -3.4] });
    beam.rotation.x = -Math.atan2(steps * 0.32, steps * 0.34);
    const beam2 = box(g, 0.16, 0.34, beamLen, steel, { pos: [0.85, 3.4, -3.4] });
    beam2.rotation.x = -Math.atan2(steps * 0.32, steps * 0.34);
    root.add(g);
  }

  /* ---------------- 两层办公楼（紧邻入库门） ---------------- */
  {
    const g = new THREE.Group();
    const w = OFFICE.x1 - OFFICE.x0;
    const d = OFFICE.z2 - OFFICE.z0;
    g.position.set((OFFICE.x0 + OFFICE.x1) / 2, 0, (OFFICE.z0 + OFFICE.z2) / 2);

    const body = mat(0xdfe3e7, { roughness: 0.8, metalness: 0.05 });
    const frame = mat(0x7b848e, { roughness: 0.5, metalness: 0.4 });
    box(g, w, OFFICE.floorH, d, body, { pos: [0, OFFICE.floorH / 2, 0] });
    box(g, w, OFFICE.floorH, d, body, { pos: [0, OFFICE.floorH * 1.5, 0] });
    box(g, w + 0.3, 0.3, d + 0.3, frame, { pos: [0, OFFICE.floorH, 0] });
    box(g, w + 0.4, 0.35, d + 0.4, frame, { pos: [0, OFFICE.floorH * 2 + 0.15, 0] });
    // 西立面（面向车间）与东立面（面向入库门）玻璃幕墙
    for (const s of [-1, 1]) {
      box(g, 0.08, OFFICE.floorH - 0.7, d - 0.8, glassMaterial(0xa8dcf2, 0.22), {
        pos: [s * (w / 2 + 0.02), OFFICE.floorH * 1.5, 0],
      });
      for (let z = -d / 2 + 0.8; z < d / 2; z += 1.8) {
        box(g, 0.12, OFFICE.floorH - 0.7, 0.1, frame, {
          pos: [s * (w / 2 + 0.04), OFFICE.floorH * 1.5, z],
        });
      }
    }
    // 南立面玻璃；雨棚偏东，指向右侧入库门
    box(g, w - 0.6, OFFICE.floorH - 0.7, 0.08, glassMaterial(0xa8dcf2, 0.22), {
      pos: [0, OFFICE.floorH * 1.5, d / 2 + 0.02],
    });
    for (let x = -w / 2 + 0.6; x < w / 2; x += 1.6) {
      box(g, 0.1, OFFICE.floorH - 0.7, 0.12, frame, { pos: [x, OFFICE.floorH * 1.5, d / 2 + 0.04] });
    }
    box(g, 4.6, 0.18, 1.8, frame, { pos: [w / 2 - 0.2, 3.15, d / 2 + 0.35] });
    for (let f = 0; f < 2; f++) {
      const l = new THREE.PointLight(0xdcecff, 10, 18, 2);
      l.position.set(0, OFFICE.floorH * (f + 0.5), 0);
      g.add(l);
    }
    box(g, 2.6, 0.85, 1.7, mat(0x8e97a1, { roughness: 0.6, metalness: 0.4 }), {
      pos: [-2.5, OFFICE.floorH * 2 + 0.72, 0],
    });
    root.add(g);
  }

  scene.add(root);
  return root;
}
