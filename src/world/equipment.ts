import * as THREE from 'three';
import { C } from '../core/palette';
import { box, cyl, sphere, mat, emissive, glassMaterial } from '../core/utils';
import { createBeltTexture, createRollerTexture } from '../core/textures';

/* ------------------------------------------------------------------ */
/*  共享材质                                                           */
/* ------------------------------------------------------------------ */
const M = {
  body: mat(C.machineBody, { roughness: 0.42, metalness: 0.16 }),
  trim: mat(C.machineTrim, { roughness: 0.48, metalness: 0.55 }),
  base: mat(C.machineBase, { roughness: 0.68, metalness: 0.32 }),
  steel: mat(C.steel, { roughness: 0.38, metalness: 0.78 }),
  dark: mat(C.darkSteel, { roughness: 0.55, metalness: 0.55 }),
  accent: mat(C.accent, { roughness: 0.45, metalness: 0.2 }),
  safety: mat(C.safety, { roughness: 0.5, metalness: 0.22 }),
  rubber: mat(C.rubber, { roughness: 0.92, metalness: 0.0 }),
  wood: mat(C.wood, { roughness: 0.88, metalness: 0.0 }),
  carton: mat(C.carton, { roughness: 0.92, metalness: 0.0 }),
  part: mat(C.steelPart, { roughness: 0.3, metalness: 0.85 }),
  rackBeam: mat(C.rackBeam, { roughness: 0.45, metalness: 0.35 }),
  rackUpright: mat(C.rackUpright, { roughness: 0.45, metalness: 0.35 }),
  glass: glassMaterial(0x8fcbe8, 0.3),
};

/* ------------------------------------------------------------------ */
/*  传送带                                                             */
/* ------------------------------------------------------------------ */
export interface ConveyorHandle {
  group: THREE.Group;
  setSpeed(v: number): void;
  update(dt: number): void;
}

export function createConveyor(
  length: number,
  opts: { width?: number; top?: number; legs?: boolean } = {},
): ConveyorHandle {
  const w = opts.width ?? 1.3;
  const top = opts.top ?? 1.0;
  const g = new THREE.Group();

  const beltTex = createBeltTexture();
  beltTex.repeat.set(length / 0.55, 1);
  const beltMat = new THREE.MeshStandardMaterial({
    map: beltTex,
    roughness: 0.88,
    metalness: 0.06,
  });

  box(g, length, 0.1, w - 0.18, beltMat, { pos: [0, top - 0.05, 0] });
  box(g, length, 0.2, 0.08, M.steel, { pos: [0, top - 0.09, w / 2] });
  box(g, length, 0.2, 0.08, M.steel, { pos: [0, top - 0.09, -w / 2] });
  box(g, length, 0.08, 0.05, M.trim, { pos: [0, top - 0.24, w / 2] });
  box(g, length, 0.08, 0.05, M.trim, { pos: [0, top - 0.24, -w / 2] });

  // 端部滚筒
  for (const s of [-1, 1]) {
    cyl(g, 0.11, 0.11, w, 16, M.steel, {
      pos: [s * (length / 2 - 0.14), top - 0.13, 0],
      rot: [Math.PI / 2, 0, 0],
    });
  }

  if (opts.legs !== false) {
    const legCount = Math.max(2, Math.floor(length / 2.6));
    for (let i = 0; i <= legCount; i++) {
      const x = -length / 2 + 0.35 + (i * (length - 0.7)) / legCount;
      for (const s of [-1, 1]) {
        box(g, 0.09, top - 0.28, 0.09, M.base, { pos: [x, (top - 0.28) / 2, s * (w / 2 - 0.03)] });
      }
      box(g, 0.06, 0.06, w - 0.1, M.base, { pos: [x, 0.22, 0] });
    }
  }

  let speed = 0;
  return {
    group: g,
    setSpeed(v: number) {
      speed = v;
    },
    update(dt: number) {
      beltTex.offset.x -= (speed * dt) / 0.55;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  六轴工业机器人                                                     */
/* ------------------------------------------------------------------ */
export interface RobotHandle {
  group: THREE.Group;
  setWorking(on: boolean): void;
  update(dt: number, t: number): void;
}

export function createRobot(facing = 0): RobotHandle {
  const g = new THREE.Group();
  cyl(g, 0.52, 0.58, 0.26, 24, M.dark, { pos: [0, 0.13, 0] });
  cyl(g, 0.4, 0.46, 0.16, 24, M.accent, { pos: [0, 0.32, 0] });

  const turret = new THREE.Group();
  turret.position.y = 0.4;
  g.add(turret);
  cyl(turret, 0.3, 0.34, 0.52, 20, M.body, { pos: [0, 0.26, 0] });

  const shoulder = new THREE.Group();
  shoulder.position.y = 0.52;
  turret.add(shoulder);
  cyl(shoulder, 0.26, 0.26, 0.46, 18, M.dark, {
    pos: [0, 0, 0],
    rot: [Math.PI / 2, 0, 0],
  });
  box(shoulder, 0.3, 1.18, 0.34, M.body, { pos: [0, 0.59, 0] });
  box(shoulder, 0.34, 0.16, 0.4, M.trim, { pos: [0, 0.5, 0] });

  const elbow = new THREE.Group();
  elbow.position.y = 1.18;
  shoulder.add(elbow);
  cyl(elbow, 0.21, 0.21, 0.4, 16, M.dark, { pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0] });
  box(elbow, 0.26, 0.96, 0.3, M.body, { pos: [0, 0.48, 0] });

  const wrist = new THREE.Group();
  wrist.position.y = 0.96;
  elbow.add(wrist);
  cyl(wrist, 0.17, 0.17, 0.32, 14, M.accent, { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] });
  box(wrist, 0.26, 0.22, 0.26, M.dark, { pos: [0, 0.26, 0] });

  const jawL = new THREE.Group();
  const jawR = new THREE.Group();
  jawL.position.set(0, 0.4, 0.12);
  jawR.position.set(0, 0.4, -0.12);
  box(jawL, 0.09, 0.32, 0.06, M.steel, { pos: [0, 0, 0] });
  box(jawR, 0.09, 0.32, 0.06, M.steel, { pos: [0, 0, 0] });
  box(jawL, 0.1, 0.07, 0.16, M.steel, { pos: [0.08, -0.14, 0] });
  box(jawR, 0.1, 0.07, 0.16, M.steel, { pos: [0.08, -0.14, 0] });
  wrist.add(jawL, jawR);

  let working = false;
  let phase = Math.random() * 10;

  return {
    group: g,
    setWorking(on: boolean) {
      working = on;
    },
    update(dt: number, _t: number) {
      phase += dt * (working ? 2.6 : 0.7);
      const w = working ? 1 : 0.25;
      turret.rotation.y = facing + Math.sin(phase * 0.45) * 0.75 * w;
      shoulder.rotation.z = -0.62 + Math.sin(phase * 0.7) * 0.34 * w;
      elbow.rotation.z = 1.42 + Math.sin(phase * 0.7 + 0.9) * 0.42 * w;
      wrist.rotation.x = -0.5 + Math.sin(phase * 1.05) * 0.5 * w;
      const grip = working ? 0.06 + Math.abs(Math.sin(phase * 1.4)) * 0.1 : 0.12;
      jawL.position.z = 0.12 + grip;
      jawR.position.z = -0.12 - grip;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  加工中心（龙门式，皮带穿行）                                        */
/* ------------------------------------------------------------------ */
export interface CncHandle {
  group: THREE.Group;
  update(dt: number, t: number, working: boolean): void;
}

export function createCnc(): CncHandle {
  const g = new THREE.Group();

  // 侧壁
  box(g, 3.6, 4.0, 0.18, M.body, { pos: [0, 2.0, 1.5] });
  box(g, 3.6, 4.0, 0.18, M.body, { pos: [0, 2.0, -1.5] });
  box(g, 3.9, 0.5, 3.36, M.trim, { pos: [0, 3.92, 0] });
  box(g, 3.6, 0.3, 3.0, M.base, { pos: [0, 0.15, 0] });

  // 隧道上下框
  for (const s of [-1, 1]) {
    box(g, 0.16, 1.15, 2.3, M.trim, { pos: [s * 1.78, 2.92, 0] });
    box(g, 0.16, 0.9, 2.3, M.trim, { pos: [s * 1.78, 0.45, 0] });
  }

  // 升降门
  const doors: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Group();
    d.position.set(s * 1.9, 1.62, 0);
    box(d, 0.12, 1.55, 2.15, M.steel, { pos: [0, 0, 0] });
    box(d, 0.14, 0.16, 2.15, M.safety, { pos: [0, 0.78, 0] });
    box(d, 0.05, 0.5, 0.9, M.glass, { pos: [s * 0.08, -0.1, 0] });
    g.add(d);
    doors.push(d);
  }

  // 观察窗
  box(g, 2.9, 1.25, 0.08, M.dark, { pos: [0, 2.55, -1.62] });
  box(g, 2.7, 1.05, 0.06, M.glass, { pos: [0, 2.55, -1.68] });
  box(g, 2.9, 0.1, 0.1, M.trim, { pos: [0, 3.2, -1.64] });

  // 操作面板
  box(g, 0.7, 0.95, 0.16, M.trim, { pos: [1.25, 1.55, -1.66] });
  box(g, 0.5, 0.36, 0.05, emissive(0x2f6fd0, 1.2), { pos: [1.25, 1.78, -1.76] });
  for (let i = 0; i < 3; i++) {
    sphere(g, 0.035, emissive(i === 0 ? C.ledGreen : i === 1 ? C.ledAmber : C.ledRed, 1.4), {
      pos: [1.08 + i * 0.17, 1.34, -1.76],
    });
  }

  // 主轴
  const spindle = new THREE.Group();
  spindle.position.set(0, 3.0, 0);
  cyl(spindle, 0.24, 0.24, 0.5, 16, M.steel, { pos: [0, -0.25, 0] });
  cyl(spindle, 0.02, 0.14, 0.34, 12, M.part, { pos: [0, -0.62, 0] });
  g.add(spindle);

  // 顶部警示灯
  cyl(g, 0.09, 0.09, 0.16, 12, M.dark, { pos: [0, 4.25, 0] });
  const beacon = sphere(g, 0.13, emissive(C.ledAmber, 1.8), { pos: [0, 4.43, 0] });

  const innerLight = new THREE.PointLight(0xffe9c4, 0, 9, 2);
  innerLight.position.set(0, 2.4, 0);
  g.add(innerLight);

  // 火花粒子
  const sparkCount = 90;
  const sparkGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(sparkCount * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      color: 0xffc266,
      size: 0.09,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  g.add(sparks);
  const sparkVel = new Float32Array(sparkCount * 3);
  let sparkLife = 0;

  const emitSparks = () => {
    const pos = sparkGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sparkCount; i++) {
      if (sparkLife > 0 && Math.random() > 0.55) continue;
      pos.setXYZ(i, (Math.random() - 0.5) * 0.2, 1.95, (Math.random() - 0.5) * 0.5);
      sparkVel[i * 3] = (Math.random() - 0.5) * 2.4;
      sparkVel[i * 3 + 1] = Math.random() * 2.6 + 0.6;
      sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    }
    pos.needsUpdate = true;
  };

  return {
    group: g,
    update(dt: number, t: number, working: boolean) {
      // 加工时关门，闲时升起门洞让物料通过
      const target = working ? 1.62 : 3.02;
      for (const d of doors) {
        d.position.y += (target - d.position.y) * Math.min(1, dt * 3.2);
      }
      spindle.rotation.y += dt * (working ? 16 : 0);
      spindle.position.y = working ? 2.35 : 3.0;
      innerLight.intensity = working ? 9 : 0;
      (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity =
        working ? 1.4 + Math.sin(t * 6) * 0.9 : 0.5;

      const pm = sparks.material as THREE.PointsMaterial;
      if (working) {
        pm.opacity = Math.min(1, pm.opacity + dt * 4);
        sparkLife -= dt;
        if (sparkLife <= 0) {
          emitSparks();
          sparkLife = 0.12;
        }
        const pos = sparkGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < sparkCount; i++) {
          let x = pos.getX(i);
          let y = pos.getY(i);
          let z = pos.getZ(i);
          x += sparkVel[i * 3] * dt;
          y += sparkVel[i * 3 + 1] * dt;
          z += sparkVel[i * 3 + 2] * dt;
          sparkVel[i * 3 + 1] -= 7 * dt;
          if (y < 1.1) {
            y = 1.95;
            x = (Math.random() - 0.5) * 0.2;
            z = (Math.random() - 0.5) * 0.5;
          }
          pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
      } else {
        pm.opacity = Math.max(0, pm.opacity - dt * 3);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/*  托盘与载货                                                         */
/* ------------------------------------------------------------------ */
export type LoadType = 'raw' | 'part' | 'carton' | null;

/** 仅生成载货部分（化工原料：桶装 / 吨桶） */
export function createLoad(load: LoadType): THREE.Group {
  const g = new THREE.Group();
  g.userData.isLoad = true;
  if (load === 'raw') {
    // 来料：整托盘化工原料桶（2×2）
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const d = createDrum(0x2f6fbf, 0.86, 0.29);
        d.position.set(sx * 0.26, 0, sz * 0.26);
        d.rotation.y = (Math.random() - 0.5) * 0.4;
        g.add(d);
      }
    }
  } else if (load === 'part') {
    // 在制：反应釜出料桶（带搅拌桨与料位标）
    const d = createDrum(0x4b9b78, 0.92, 0.31);
    g.add(d);
    cyl(g, 0.02, 0.02, 1.15, 6, mat(0xb8bec6, { roughness: 0.4, metalness: 0.7 }), { pos: [0, 1.35, 0] });
    box(g, 0.02, 0.5, 0.16, mat(0xb8bec6, { roughness: 0.4, metalness: 0.7 }), { pos: [0, 1.0, 0] });
  } else if (load === 'carton') {
    // 成品：封口成品桶 + 缠绕带
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const d = createDrum(0xe4e7ea, 0.88, 0.3);
        d.position.set(sx * 0.27, 0, sz * 0.27);
        d.rotation.y = (Math.random() - 0.5) * 0.5;
        g.add(d);
        // 红色封盖 + 标签
        cyl(g, 0.09, 0.09, 0.06, 10, mat(0xc0392b, { roughness: 0.5 }), {
          pos: [sx * 0.27 + 0.12, 0.92, sz * 0.27],
        });
        box(g, 0.03, 0.3, 0.24, mat(0xf2f0e8, { roughness: 0.85 }), {
          pos: [sx * 0.27 + 0.29, 0.5, sz * 0.27],
        });
      }
    }
    box(g, 1.0, 0.04, 0.05, mat(0x2f6fbf, { roughness: 0.6 }), { pos: [0, 0.75, 0.28] });
  }
  return g;
}

export function createPallet(load: LoadType = 'raw'): THREE.Group {
  const g = new THREE.Group();
  box(g, 1.05, 0.05, 0.92, M.wood, { pos: [0, 0.025, 0] });
  for (const x of [-0.4, 0, 0.4]) box(g, 0.18, 0.1, 0.92, M.wood, { pos: [x, 0.1, 0] });
  for (let i = 0; i < 5; i++) {
    box(g, 1.05, 0.05, 0.17, M.wood, { pos: [0, 0.175, -0.36 + i * 0.18] });
  }
  const l = createLoad(load);
  l.position.y = 0.2;
  g.add(l);
  return g;
}

/* ------------------------------------------------------------------ */
/*  货架                                                               */
/* ------------------------------------------------------------------ */
export function createRack(
  bays: number,
  levels: number,
  bayWidth = 2.8,
  depth = 1.3,
  height = 5.4,
  withStock = false,
): THREE.Group {
  const g = new THREE.Group();
  const total = bays * bayWidth;
  for (let i = 0; i <= bays; i++) {
    const x = -total / 2 + i * bayWidth;
    for (const s of [-1, 1]) {
      box(g, 0.12, height, 0.12, M.rackUpright, { pos: [x, height / 2, s * (depth / 2)] });
    }
    box(g, 0.06, 0.06, depth, M.rackUpright, { pos: [x, height - 0.1, 0] });
  }
  for (let lv = 0; lv < levels; lv++) {
    const y = 0.35 + lv * 1.3;
    for (const s of [-1, 1]) {
      box(g, total, 0.14, 0.1, M.rackBeam, { pos: [0, y, s * (depth / 2)] });
    }
    box(g, total, 0.05, depth - 0.1, mat(0x6d7783, { roughness: 0.8 }), { pos: [0, y + 0.09, 0] });
    if (withStock) {
      for (let b = 0; b < bays; b++) {
        if (Math.random() > 0.62) continue;
        const p = createPallet(Math.random() > 0.5 ? 'raw' : 'carton');
        p.position.set(-total / 2 + bayWidth * (b + 0.5), y + 0.12, 0);
        p.scale.setScalar(0.92);
        g.add(p);
      }
    }
  }
  // 地面导轨
  box(g, total, 0.06, 0.5, M.safety, { pos: [0, 0.03, depth / 2 + 0.35] });
  return g;
}

/* ------------------------------------------------------------------ */
/*  AGV 无人搬运车                                                     */
/* ------------------------------------------------------------------ */
export interface AgvHandle {
  group: THREE.Group;
  deckY: number;
  update(dt: number, t: number, busy: boolean): void;
}

export function createAgv(): AgvHandle {
  const g = new THREE.Group();
  box(g, 1.95, 0.28, 1.15, M.dark, { pos: [0, 0.3, 0] });
  box(g, 1.8, 0.08, 1.05, M.steel, { pos: [0, 0.47, 0] });
  box(g, 0.14, 0.85, 0.95, M.trim, { pos: [-0.92, 0.72, 0] });
  box(g, 0.6, 0.06, 0.85, M.steel, { pos: [-0.58, 0.22, 0] });

  const wheels: THREE.Mesh[] = [];
  for (const x of [-0.62, 0.62]) {
    for (const s of [-1, 1]) {
      const w = cyl(g, 0.19, 0.19, 0.14, 14, M.rubber, {
        pos: [x, 0.19, s * 0.55],
        rot: [Math.PI / 2, 0, 0],
      });
      wheels.push(w);
    }
  }

  const led = emissive(C.ledBlue, 1.6);
  box(g, 1.6, 0.05, 0.04, led, { pos: [0, 0.56, 0.58] });
  box(g, 1.6, 0.05, 0.04, led, { pos: [0, 0.56, -0.58] });

  cyl(g, 0.035, 0.035, 0.4, 8, M.dark, { pos: [0.75, 0.72, 0] });
  const beacon = sphere(g, 0.09, emissive(C.ledAmber, 1.6), { pos: [0.75, 0.98, 0] });

  let spin = 0;
  return {
    group: g,
    deckY: 0.51,
    update(dt: number, t: number, busy: boolean) {
      spin += dt * 4;
      for (const w of wheels) w.rotation.z -= dt * 4;
      (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = busy
        ? 1.2 + Math.sin(t * 7) * 1.1
        : 0.35;
      (led as THREE.MeshStandardMaterial).emissiveIntensity = busy ? 1.8 : 0.5;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  叉车                                                               */
/* ------------------------------------------------------------------ */
export function createForklift(): THREE.Group {
  const g = new THREE.Group();
  box(g, 1.9, 0.7, 1.05, M.accent, { pos: [0, 0.6, 0] });
  box(g, 0.75, 0.95, 1.0, M.trim, { pos: [-0.72, 1.0, 0] });
  box(g, 1.5, 0.1, 1.0, M.dark, { pos: [-0.1, 1.82, 0] });
  for (const x of [-0.35, 0.45]) {
    for (const s of [-1, 1]) box(g, 0.08, 1.2, 0.08, M.dark, { pos: [x, 1.4, s * 0.48] });
  }
  box(g, 0.55, 0.12, 0.6, M.dark, { pos: [-0.2, 1.0, 0] });
  for (const s of [-1, 1]) {
    box(g, 0.12, 2.5, 0.12, M.steel, { pos: [0.95, 1.25, s * 0.36] });
  }
  box(g, 0.12, 0.12, 0.85, M.steel, { pos: [0.95, 2.45, 0] });
  for (const s of [-1, 1]) {
    box(g, 0.85, 0.07, 0.16, M.steel, { pos: [1.4, 0.18, s * 0.28] });
  }
  cyl(g, 0.32, 0.32, 0.22, 14, M.rubber, { pos: [0.62, 0.32, 0.52], rot: [Math.PI / 2, 0, 0] });
  cyl(g, 0.32, 0.32, 0.22, 14, M.rubber, { pos: [0.62, 0.32, -0.52], rot: [Math.PI / 2, 0, 0] });
  cyl(g, 0.24, 0.24, 0.2, 12, M.rubber, { pos: [-0.78, 0.24, 0.48], rot: [Math.PI / 2, 0, 0] });
  cyl(g, 0.24, 0.24, 0.2, 12, M.rubber, { pos: [-0.78, 0.24, -0.48], rot: [Math.PI / 2, 0, 0] });
  cyl(g, 0.03, 0.03, 0.35, 8, M.dark, { pos: [-0.6, 1.95, 0] });
  sphere(g, 0.08, emissive(C.ledAmber, 1.4), { pos: [-0.6, 2.15, 0] });
  return g;
}

/* ------------------------------------------------------------------ */
/*  堆垛机                                                             */
/* ------------------------------------------------------------------ */
export interface StackerHandle {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

export function createStackerCrane(railLength: number): StackerHandle {
  const g = new THREE.Group();
  box(g, railLength, 0.1, 0.22, M.steel, { pos: [0, 0.05, 1.15] });
  box(g, railLength, 0.1, 0.22, M.steel, { pos: [0, 0.05, -1.15] });

  const mast = new THREE.Group();
  g.add(mast);
  box(mast, 1.3, 0.42, 2.5, M.trim, { pos: [0, 0.26, 0] });
  for (const s of [-1, 1]) {
    box(mast, 0.18, 6.2, 0.18, M.accent, { pos: [0, 3.3, s * 1.05] });
  }
  box(mast, 0.2, 0.2, 2.2, M.accent, { pos: [0, 6.4, 0] });
  cyl(mast, 0.035, 0.035, 0.3, 8, M.dark, { pos: [0.45, 6.65, 0] });
  const beacon = sphere(mast, 0.08, emissive(C.ledAmber, 1.5), { pos: [0.45, 6.85, 0] });

  const carriage = new THREE.Group();
  mast.add(carriage);
  box(carriage, 1.0, 0.36, 2.0, M.dark, { pos: [0, 0, 0] });
  for (const s of [-1, 1]) box(carriage, 1.2, 0.08, 0.2, M.steel, { pos: [0, -0.25, s * 0.5] });

  const payload = createPallet('carton');
  payload.position.set(0, -0.3, 0);
  carriage.add(payload);

  let phase = 0;
  return {
    group: g,
    update(dt: number, t: number) {
      phase += dt;
      const cycle = 26;
      const p = (phase % cycle) / cycle;
      let x = 0;
      let y = 0;
      if (p < 0.2) x = -railLength / 2 + 2;
      else if (p < 0.35) {
        x = -railLength / 2 + 2;
        y = ((p - 0.2) / 0.15) * 3.4;
      } else if (p < 0.6) x = -railLength / 2 + 2 + ((p - 0.35) / 0.25) * (railLength - 4);
      else if (p < 0.75) {
        x = railLength / 2 - 2;
        y = 3.4 - ((p - 0.6) / 0.15) * 3.4;
      } else x = railLength / 2 - 2;
      mast.position.x = x;
      carriage.position.y = y;
      (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 5) * 0.8;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  装配工作台                                                         */
/* ------------------------------------------------------------------ */
export function createWorkbench(): THREE.Group {
  const g = new THREE.Group();
  box(g, 2.8, 0.1, 1.4, M.steel, { pos: [0, 0.95, 0] });
  box(g, 2.6, 0.06, 1.2, mat(0x5a6470, { roughness: 0.8 }), { pos: [0, 0.55, 0] });
  for (const x of [-1.3, 1.3]) {
    for (const s of [-1, 1]) box(g, 0.1, 0.9, 0.1, M.base, { pos: [x, 0.45, s * 0.6] });
  }
  // 工具板
  box(g, 2.6, 1.1, 0.07, mat(0x3c4a3f, { roughness: 0.8 }), { pos: [0, 1.85, 0.66] });
  for (let i = 0; i < 7; i++) {
    box(g, 0.07, 0.3 + Math.random() * 0.2, 0.05, M.steel, {
      pos: [-1.05 + i * 0.35, 1.8 + Math.random() * 0.1, 0.6],
    });
  }
  // 物料盒
  for (let i = 0; i < 4; i++) {
    box(g, 0.4, 0.18, 0.32, M.accent, { pos: [-1.0 + i * 0.62, 1.09, -0.42] });
  }
  // 显示屏
  box(g, 1.0, 0.62, 0.06, M.dark, { pos: [0.75, 1.65, 0.55], rot: [-0.25, 0, 0] });
  box(g, 0.88, 0.5, 0.03, emissive(0x2f6fd0, 1.1), { pos: [0.75, 1.66, 0.5], rot: [-0.25, 0, 0] });
  // 作业灯
  box(g, 2.2, 0.06, 0.1, emissive(0xfff2d5, 1.3), { pos: [0, 2.32, 0.5] });
  return g;
}

/* ------------------------------------------------------------------ */
/*  质检门（在线检测）                                                  */
/* ------------------------------------------------------------------ */
export function createInspectionGate(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    box(g, 0.22, 2.9, 0.22, M.body, { pos: [0, 1.45, s * 1.7] });
    box(g, 0.5, 0.12, 0.5, M.dark, { pos: [0, 0.06, s * 1.7] });
  }
  box(g, 0.34, 0.3, 3.6, M.trim, { pos: [0, 2.9, 0] });
  // 相机
  for (const z of [-0.9, 0, 0.9]) {
    box(g, 0.1, 0.3, 0.1, M.dark, { pos: [0, 2.62, z] });
    box(g, 0.22, 0.2, 0.26, M.trim, { pos: [0, 2.44, z] });
    cyl(g, 0.09, 0.09, 0.14, 12, M.dark, { pos: [0, 2.32, z], rot: [Math.PI, 0, 0] });
    sphere(g, 0.05, emissive(0x59d7ff, 1.4), { pos: [0, 2.24, z + 0.1] });
  }
  // 光幕
  for (const s of [-1, 1]) box(g, 0.05, 1.5, 0.05, emissive(C.ledBlue, 1.1), { pos: [0, 1.75, s * 1.45] });
  // 判定屏
  box(g, 0.1, 0.9, 1.3, M.dark, { pos: [0.2, 1.9, -2.0], rot: [0, -0.5, 0] });
  box(g, 0.04, 0.72, 1.1, emissive(C.ledGreen, 1.2), { pos: [0.28, 1.9, -1.96], rot: [0, -0.5, 0] });
  return g;
}

/* ------------------------------------------------------------------ */
/*  信号灯柱                                                           */
/* ------------------------------------------------------------------ */
export interface TowerHandle {
  group: THREE.Group;
  set(state: 'run' | 'busy' | 'wait' | 'idle'): void;
  update(dt: number, t: number): void;
}

export function createSignalTower(height = 2.6): TowerHandle {
  const g = new THREE.Group();
  cyl(g, 0.06, 0.08, height, 10, M.dark, { pos: [0, height / 2, 0] });
  cyl(g, 0.16, 0.16, 0.05, 12, M.dark, { pos: [0, height + 0.03, 0] });
  const colors = [C.ledGreen, C.ledAmber, C.ledRed];
  const lamps: THREE.Mesh[] = [];
  colors.forEach((c, i) => {
    const lamp = cyl(g, 0.13, 0.13, 0.16, 12, emissive(c, 0.15), { pos: [0, height + 0.16 + i * 0.19, 0] });
    lamps.push(lamp);
  });
  let active = 2;
  return {
    group: g,
    set(state: 'run' | 'busy' | 'wait' | 'idle') {
      active = state === 'run' ? 0 : state === 'busy' ? 1 : state === 'wait' ? 2 : 1;
    },
    update(_dt: number, t: number) {
      lamps.forEach((l, i) => {
        const m = l.material as THREE.MeshStandardMaterial;
        const on = i === active;
        m.emissiveIntensity = on ? 1.4 + Math.sin(t * 6) * 0.7 : 0.08;
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/*  厂区车辆：货车 / 轿车                                              */
/* ------------------------------------------------------------------ */
export function createTruck(bodyColor = 0x2f5f9e): THREE.Group {
  const g = new THREE.Group();
  const paint = mat(bodyColor, { roughness: 0.45, metalness: 0.3 });
  box(g, 13.8, 0.4, 2.5, M.dark, { pos: [0, 0.95, 0] });
  // 驾驶室
  box(g, 2.7, 2.5, 2.5, paint, { pos: [5.2, 2.3, 0] });
  box(g, 0.14, 1.05, 2.2, mat(0x93c8e0, { roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55 }), {
    pos: [6.35, 2.85, 0],
  });
  box(g, 2.8, 0.35, 2.6, M.trim, { pos: [5.2, 1.05, 0] });
  // 货箱
  box(g, 9.4, 3.1, 2.6, mat(0xd9dde1, { roughness: 0.8, metalness: 0.1 }), { pos: [-1.6, 2.6, 0] });
  box(g, 9.4, 0.2, 2.66, M.trim, { pos: [-1.6, 1.05, 0] });
  // 车轮
  for (const x of [4.6, 2.4, -3.4, -5.0]) {
    for (const s of [-1, 1]) {
      cyl(g, 0.52, 0.52, 0.34, 14, M.rubber, {
        pos: [x, 0.52, s * 1.15],
        rot: [Math.PI / 2, 0, 0],
      });
    }
  }
  return g;
}

export function createCar(bodyColor = 0xb8bec6): THREE.Group {
  const g = new THREE.Group();
  const paint = mat(bodyColor, { roughness: 0.35, metalness: 0.45 });
  box(g, 4.3, 0.85, 1.85, paint, { pos: [0, 0.78, 0] });
  box(g, 2.3, 0.7, 1.7, mat(0x2b323b, { roughness: 0.25, metalness: 0.3 }), { pos: [-0.2, 1.5, 0] });
  for (const x of [-1.35, 1.35]) {
    for (const s of [-1, 1]) {
      cyl(g, 0.33, 0.33, 0.24, 12, M.rubber, {
        pos: [x, 0.33, s * 0.85],
        rot: [Math.PI / 2, 0, 0],
      });
    }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  化工装置设备库                                                     */
/*  （纺织前处理用化学原料：合成 / 复配 / 灌装）                        */
/* ------------------------------------------------------------------ */

/** 平台栏杆 */
function railing(g: THREE.Group, r: number, y: number, seg = 16) {
  const m = mat(C.safety, { roughness: 0.55, metalness: 0.25 });
  const t = mat(0x9aa3ad, { roughness: 0.5, metalness: 0.5 });
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    cyl(g, 0.035, 0.035, 1.05, 6, m, { pos: [Math.cos(a) * r, y + 0.52, Math.sin(a) * r] });
  }
  const ring1 = cyl(g, 0.045, 0.045, r * 2 * Math.PI, 4, m, { pos: [0, y + 1.02, 0], rot: [Math.PI / 2, 0, 0] });
  ring1.scale.set(1, 1, 0.06);
  const ring2 = cyl(g, 0.035, 0.035, r * 2 * Math.PI, 4, t, { pos: [0, y + 0.55, 0], rot: [Math.PI / 2, 0, 0] });
  ring2.scale.set(1, 1, 0.06);
}

/** 立式反应釜 / 搅拌罐 */
export function createReactor(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const r = d * 0.42;
  const body = mat(0xd7dce1, { roughness: 0.35, metalness: 0.62 });
  const trim = mat(accent, { roughness: 0.45, metalness: 0.35 });

  // 支腿
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(g, 0.16, 0.95, 0.16, M.base, { pos: [Math.cos(a) * (r - 0.15), 0.48, Math.sin(a) * (r - 0.15)] });
  }
  // 罐体
  cyl(g, r, r, h - 1.5, 26, body, { pos: [0, 0.95 + (h - 1.5) / 2, 0] });
  // 上下封头
  const dome = sphere(g, r, body, { pos: [0, 0.95 + h - 1.5, 0] });
  dome.scale.set(1, 0.45, 1);
  const bottom = sphere(g, r, body, { pos: [0, 0.95, 0] });
  bottom.scale.set(1, -0.4, 1);
  // 加强圈
  for (const y of [0.95 + h * 0.3, 0.95 + h * 0.7]) {
    const ring = cyl(g, r + 0.06, r + 0.06, 0.1, 26, trim, { pos: [0, y, 0] });
    ring.scale.set(1, 1, 1);
  }
  // 搅拌电机
  const agit = new THREE.Group();
  agit.position.set(0, 0.95 + h - 1.5 + r * 0.45 + 0.35, 0);
  cyl(agit, 0.34, 0.34, 0.62, 14, M.trim, { pos: [0, 0, 0] });
  cyl(agit, 0.2, 0.2, 0.5, 12, M.accent, { pos: [0, 0.55, 0] });
  agit.userData.spin = { axis: 'y', speed: 7 };
  g.add(agit);
  // 人孔 + 视镜
  cyl(g, 0.3, 0.3, 0.22, 12, M.steel, { pos: [r * 0.72, 0.95 + h * 0.62, r * 0.55], rot: [Math.PI / 2, 0, 0.6] });
  box(g, 0.42, 0.5, 0.06, M.glass, { pos: [0, 0.95 + h * 0.45, r + 0.02] });
  // 侧管
  cyl(g, 0.09, 0.09, h * 0.8, 8, M.steel, { pos: [r + 0.2, 0.95 + h * 0.4, 0] });
  cyl(g, 0.09, 0.09, 1.1, 8, M.steel, { pos: [r + 0.2, 0.95 + h * 0.82, -0.55], rot: [Math.PI / 2, 0, 0] });
  // 检修平台
  const plat = cyl(g, r + 0.85, r + 0.85, 0.1, 26, mat(0x6f7883, { roughness: 0.8 }), {
    pos: [0, 0.95 + h * 0.62, 0],
  });
  plat.scale.set(1, 1, 1);
  railing(g, r + 0.82, 0.95 + h * 0.62 + 0.05, 20);
  return g;
}

/** 中和塔 / 塔器 */
export function createTower(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const r = d * 0.36;
  const body = mat(0xd7dce1, { roughness: 0.32, metalness: 0.65 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(g, 0.14, 0.9, 0.14, M.base, { pos: [Math.cos(a) * (r - 0.1), 0.45, Math.sin(a) * (r - 0.1)] });
  }
  cyl(g, r, r, h - 1.4, 22, body, { pos: [0, 0.9 + (h - 1.4) / 2, 0] });
  const top = sphere(g, r, body, { pos: [0, 0.9 + h - 1.4, 0] });
  top.scale.set(1, 0.4, 1);
  // 顶部冷凝器
  cyl(g, r * 0.55, r * 0.55, 0.9, 14, M.steel, { pos: [0, 0.9 + h - 0.9, 0] });
  // 中间平台
  for (const f of [0.42, 0.74]) {
    const plat = cyl(g, r + 0.7, r + 0.7, 0.09, 22, mat(0x6f7883, { roughness: 0.8 }), {
      pos: [0, 0.9 + (h - 1.4) * f, 0],
    });
    plat.scale.set(1, 1, 1);
    railing(g, r + 0.67, 0.9 + (h - 1.4) * f + 0.04, 18);
  }
  // 侧管
  for (let i = 0; i < 3; i++) {
    cyl(g, 0.075, 0.075, 2.2, 8, M.steel, {
      pos: [r + 0.3, 1.6 + i * (h / 3.4), 0.2],
      rot: [0, 0, Math.PI / 2],
    });
  }
  cyl(g, 0.075, 0.075, h * 0.9, 8, mat(accent, { roughness: 0.45, metalness: 0.4 }), {
    pos: [-r - 0.25, 0.9 + h * 0.45, 0],
  });
  return g;
}

/** 计量投料撬装 */
export function createDosing(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const skid = mat(0x8b949e, { roughness: 0.6, metalness: 0.4 });
  box(g, d, 0.24, 2.6, skid, { pos: [0, 0.12, 0] });
  for (const x of [-d / 2 + 0.2, d / 2 - 0.2]) {
    for (const s of [-1, 1]) box(g, 0.12, 0.5, 0.12, M.base, { pos: [x, 0.3, s * 1.1] });
  }
  // 计量罐
  for (const [x, r, hh] of [
    [-d * 0.22, 0.62, 1.7],
    [d * 0.22, 0.52, 1.35],
  ] as const) {
    cyl(g, r, r, hh, 18, mat(0xdde2e7, { roughness: 0.3, metalness: 0.6 }), { pos: [x, 0.24 + hh / 2, -0.35] });
    const lid = sphere(g, r, mat(0xdde2e7, { roughness: 0.3, metalness: 0.6 }), { pos: [x, 0.24 + hh, -0.35] });
    lid.scale.set(1, 0.35, 1);
    cyl(g, 0.05, 0.05, 1.3, 8, M.steel, { pos: [x + r * 0.8, 0.9, -0.35] });
  }
  // 计量泵 + 电机
  box(g, 1.5, 0.5, 0.7, M.trim, { pos: [0, 0.55, 0.85] });
  cyl(g, 0.26, 0.26, 0.5, 12, mat(accent, { roughness: 0.45, metalness: 0.35 }), {
    pos: [-0.85, 0.55, 0.85],
    rot: [0, 0, Math.PI / 2],
  });
  // 控制柜
  box(g, 0.8, 1.3, 0.4, M.trim, { pos: [d / 2 - 0.35, 1.0, 0.9] });
  box(g, 0.52, 0.36, 0.04, emissive(0x2f6fd0, 1.1), { pos: [d / 2 - 0.35, 1.28, 1.12] });
  // 工艺管
  for (let i = 0; i < 3; i++) {
    cyl(g, 0.07, 0.07, d - 0.6, 8, M.steel, { pos: [0, h - 0.5 - i * 0.3, 0.55] });
  }
  return g;
}

/** 压滤机 / 均质机 */
export function createFilter(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(0x6b7683, { roughness: 0.5, metalness: 0.55 });
  const w = d * 0.9;
  for (const s of [-1, 1]) {
    box(g, 0.22, h - 0.5, 0.22, frame, { pos: [(s * w) / 2, (h - 0.5) / 2, 0] });
  }
  box(g, w + 0.4, 0.3, 0.7, frame, { pos: [0, h - 0.55, 0] });
  // 滤板叠
  const plate = mat(0xc8ccd1, { roughness: 0.45, metalness: 0.45 });
  const n = 14;
  for (let i = 0; i < n; i++) {
    box(g, 0.07, h - 1.5, 1.9, plate, { pos: [-w / 2 + 0.4 + i * ((w - 0.8) / (n - 1)), 0.9 + (h - 1.5) / 2, 0] });
  }
  // 液压缸 + 电机
  cyl(g, 0.24, 0.24, 0.9, 14, M.steel, { pos: [w / 2 + 0.5, 0.9 + (h - 1.5) / 2, 0], rot: [0, 0, Math.PI / 2] });
  cyl(g, 0.3, 0.3, 0.6, 12, mat(accent, { roughness: 0.45, metalness: 0.35 }), {
    pos: [-w / 2 - 0.5, 0.9 + (h - 1.5) / 2, 0],
    rot: [0, 0, Math.PI / 2],
  });
  // 集液盘
  box(g, w + 0.8, 0.3, 2.4, mat(accent, { roughness: 0.5 }), { pos: [0, 0.55, 0] });
  return g;
}

/** 板式换热器 */
export function createHeatExchanger(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(0x6b7683, { roughness: 0.5, metalness: 0.55 });
  const plate = mat(0xb9c0c7, { roughness: 0.3, metalness: 0.78 });
  for (const s of [-1, 1]) {
    box(g, 0.18, h, 0.18, frame, { pos: [(s * d) / 2, h / 2, 0] });
  }
  box(g, d + 0.5, 0.22, 0.4, frame, { pos: [0, h - 0.12, 0] });
  box(g, d + 0.5, 0.22, 0.4, frame, { pos: [0, 0.12, 0] });
  const n = 18;
  for (let i = 0; i < n; i++) {
    box(g, 0.06, h - 0.7, 1.1, plate, { pos: [-d / 2 + 0.25 + i * ((d - 0.5) / (n - 1)), h / 2, 0] });
  }
  for (const [x, y] of [
    [-d / 2 - 0.1, h - 0.1],
    [d / 2 + 0.1, h - 0.1],
    [-d / 2 - 0.1, 0.2],
    [d / 2 + 0.1, 0.2],
  ]) {
    cyl(g, 0.11, 0.11, 1.4, 10, mat(accent, { roughness: 0.45, metalness: 0.4 }), {
      pos: [x, y, 0],
      rot: [0, 0, Math.PI / 2],
    });
  }
  return g;
}

/** 成品暂存罐 */
export function createBufferTank(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const r = d * 0.42;
  const body = mat(0xd7dce1, { roughness: 0.32, metalness: 0.65 });
  cyl(g, r, r, h - 1.2, 24, body, { pos: [0, 0.7 + (h - 1.2) / 2, 0] });
  const top = sphere(g, r, body, { pos: [0, 0.7 + h - 1.2, 0] });
  top.scale.set(1, 0.35, 1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(g, 0.14, 0.7, 0.14, M.base, { pos: [Math.cos(a) * (r - 0.12), 0.35, Math.sin(a) * (r - 0.12)] });
  }
  // 液位计
  box(g, 0.1, h - 1.8, 0.1, mat(0x9fd3e8, { roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.7 }), {
    pos: [r + 0.16, 0.7 + (h - 1.2) / 2, 0],
  });
  // 顶部平台 + 泵
  const plat = cyl(g, r + 0.7, r + 0.7, 0.09, 24, mat(0x6f7883, { roughness: 0.8 }), { pos: [0, h - 0.4, 0] });
  plat.scale.set(1, 1, 1);
  railing(g, r + 0.67, h - 0.36, 20);
  cyl(g, 0.2, 0.2, 0.55, 12, mat(accent, { roughness: 0.45, metalness: 0.35 }), { pos: [r + 0.5, 0.45, 0.4] });
  cyl(g, 0.09, 0.09, 1.4, 8, M.steel, { pos: [r + 0.2, 1.1, 0.4] });
  return g;
}

/** 自动灌装机 */
export function createFillingMachine(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(0xcfd4d9, { roughness: 0.4, metalness: 0.5 });
  box(g, d, 0.2, 2.6, frame, { pos: [0, 0.1, 0] });
  for (const x of [-d / 2 + 0.2, d / 2 - 0.2]) {
    for (const s of [-1, 1]) box(g, 0.12, h - 0.3, 0.12, M.base, { pos: [x, (h - 0.3) / 2, s * 1.1] });
  }
  box(g, d, 0.18, 0.18, frame, { pos: [0, h - 0.4, -1.05] });
  box(g, d, 0.18, 0.18, frame, { pos: [0, h - 0.4, 1.05] });
  // 灌装转盘
  const carousel = new THREE.Group();
  carousel.position.set(0, h - 1.1, 0);
  cyl(carousel, 0.75, 0.75, 0.35, 20, mat(accent, { roughness: 0.42, metalness: 0.4 }), { pos: [0, 0, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cyl(carousel, 0.07, 0.07, 0.55, 8, M.steel, { pos: [Math.cos(a) * 0.62, -0.28, Math.sin(a) * 0.62] });
  }
  carousel.userData.spin = { axis: 'y', speed: 1.6 };
  g.add(carousel);
  // 计量管
  cyl(g, 0.1, 0.1, h - 1.3, 8, M.steel, { pos: [0, h - 0.65, 0] });
  // 桶位
  cyl(g, 0.32, 0.32, 0.88, 18, mat(0x3f7fb8, { roughness: 0.45 }), { pos: [0, 0.2 + 0.44, 0] });
  cyl(g, 0.33, 0.33, 0.06, 18, mat(0x9aa3ad, { roughness: 0.4, metalness: 0.6 }), { pos: [0, 1.06, 0] });
  // 控制柜
  box(g, 0.7, 1.2, 0.4, M.trim, { pos: [d / 2 - 0.3, 0.85, 1.05] });
  box(g, 0.46, 0.32, 0.04, emissive(0x2f6fd0, 1.1), { pos: [d / 2 - 0.3, 1.1, 1.27] });
  return g;
}

/** 贴标打码机 */
export function createLabeler(d: number, h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(0xcfd4d9, { roughness: 0.4, metalness: 0.5 });
  for (const s of [-1, 1]) {
    box(g, 0.14, h, 0.14, frame, { pos: [d / 2 - 0.4, h / 2, s * 0.9] });
  }
  box(g, 0.5, 0.24, 2.1, frame, { pos: [d / 2 - 0.4, h, 0] });
  // 标签卷 + 贴标头
  cyl(g, 0.38, 0.38, 0.34, 20, mat(0xe6e2d8, { roughness: 0.85 }), {
    pos: [d / 2 - 0.4, h - 0.55, -0.55],
    rot: [0, 0, Math.PI / 2],
  });
  box(g, 0.45, 0.4, 0.35, mat(accent, { roughness: 0.45 }), { pos: [d / 2 - 0.4, h - 1.0, 0.1] });
  // 桶
  cyl(g, 0.32, 0.32, 0.88, 18, mat(0x3f7fb8, { roughness: 0.45 }), { pos: [0, 0.44, 0] });
  cyl(g, 0.33, 0.33, 0.06, 18, mat(0x9aa3ad, { roughness: 0.4, metalness: 0.6 }), { pos: [0, 0.9, 0] });
  box(g, 0.04, 0.28, 0.4, mat(0xf2f0e8, { roughness: 0.8 }), { pos: [0.32, 0.55, 0] });
  return g;
}

/** 化工原料桶 / 吨桶 */
export function createDrum(color = 0x2f6fbf, h = 0.88, r = 0.32): THREE.Group {
  const g = new THREE.Group();
  cyl(g, r, r, h, 18, mat(color, { roughness: 0.42, metalness: 0.28 }), { pos: [0, h / 2, 0] });
  for (const y of [h * 0.28, h * 0.72]) {
    const ring = cyl(g, r + 0.025, r + 0.025, 0.07, 18, mat(0x8d959d, { roughness: 0.45, metalness: 0.5 }), {
      pos: [0, y, 0],
    });
    ring.scale.set(1, 1, 1);
  }
  cyl(g, r * 0.92, r * 0.92, 0.05, 18, mat(0x8d959d, { roughness: 0.45, metalness: 0.5 }), { pos: [0, h + 0.02, 0] });
  cyl(g, 0.07, 0.07, 0.04, 8, mat(0x5d666e), { pos: [r * 0.4, h + 0.06, 0] });
  return g;
}

export function createIbcTote(): THREE.Group {
  const g = new THREE.Group();
  const boxMat = mat(0xe6e9ec, { roughness: 0.5, metalness: 0.05, transparent: true, opacity: 0.92 });
  box(g, 1.05, 1.0, 1.05, boxMat, { pos: [0, 0.6, 0] });
  // 钢笼
  const cage = mat(0xb8bec6, { roughness: 0.45, metalness: 0.55 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(g, 0.07, 1.2, 0.07, cage, { pos: [sx * 0.52, 0.6, sz * 0.52] });
    }
  }
  for (const y of [0.12, 0.6, 1.14]) {
    for (const sz of [-1, 1]) box(g, 1.08, 0.05, 0.05, cage, { pos: [0, y, sz * 0.52] });
    for (const sx of [-1, 1]) box(g, 0.05, 0.05, 1.08, cage, { pos: [sx * 0.52, y, 0] });
  }
  box(g, 1.15, 0.14, 1.15, cage, { pos: [0, 0.07, 0] });
  cyl(g, 0.16, 0.16, 0.1, 12, mat(0x4a535b), { pos: [0, 0.16, 0] });
  return g;
}

/* ------------------------------------------------------------------ */
/*  辊道输送机（化工灌装线用）                                          */
/* ------------------------------------------------------------------ */
export interface RollerConveyorHandle {
  group: THREE.Group;
  setSpeed(v: number): void;
  update(dt: number): void;
}

export function createRollerConveyor(
  length: number,
  opts: { width?: number; top?: number; accent?: number } = {},
): RollerConveyorHandle {
  const w = opts.width ?? 1.5;
  const top = opts.top ?? 0.95;
  const g = new THREE.Group();

  const tex = createRollerTexture();
  tex.repeat.set(length / 0.42, 1);
  const bedMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.6 });
  // 辊床
  box(g, length, 0.14, w - 0.12, bedMat, { pos: [0, top - 0.07, 0] });
  // 侧梁
  for (const s of [-1, 1]) {
    box(g, length, 0.26, 0.09, M.steel, { pos: [0, top - 0.14, s * (w / 2 - 0.04)] });
    box(g, length, 0.06, 0.05, mat(opts.accent ?? C.accent, { roughness: 0.5 }), {
      pos: [0, top - 0.02, s * (w / 2 - 0.04)],
    });
  }
  // 端部滚筒 + 减速电机
  for (const s of [-1, 1]) {
    cyl(g, 0.12, 0.12, w, 14, M.steel, { pos: [s * (length / 2 - 0.16), top - 0.12, 0], rot: [Math.PI / 2, 0, 0] });
  }
  box(g, 0.55, 0.4, 0.45, M.trim, { pos: [length / 2 - 0.2, 0.65, w / 2 + 0.28] });
  cyl(g, 0.17, 0.17, 0.34, 12, M.accent, { pos: [length / 2 - 0.2, 0.65, w / 2 + 0.52], rot: [Math.PI / 2, 0, 0] });
  // 支腿
  const legs = Math.max(2, Math.floor(length / 3));
  for (let i = 0; i <= legs; i++) {
    const x = -length / 2 + 0.4 + (i * (length - 0.8)) / legs;
    for (const s of [-1, 1]) {
      box(g, 0.09, top - 0.28, 0.09, M.base, { pos: [x, (top - 0.28) / 2, s * (w / 2 - 0.08)] });
    }
    box(g, 0.06, 0.06, w - 0.16, M.base, { pos: [x, 0.24, 0] });
  }

  let speed = 0;
  return {
    group: g,
    setSpeed(v: number) {
      speed = v;
    },
    update(dt: number) {
      tex.offset.x -= (speed * dt) / 0.42;
    },
  };
}

/** 检验码垛工位：机器人 + 码垛目标 */
export interface PalletizerHandle {
  group: THREE.Group;
  robot: RobotHandle;
}

export function createPalletizer(d: number, _h: number, _accent: number): PalletizerHandle {
  const g = new THREE.Group();
  box(g, d, 0.25, 3.0, mat(0x6f7883, { roughness: 0.8 }), { pos: [0, 0.12, 0] });
  const robot = createRobot(Math.PI / 2);
  robot.group.position.set(-d / 2 + 0.85, 0.25, 0);
  g.add(robot.group);
  const p = createPallet('carton');
  p.position.set(d / 2 - 0.75, 0.25, 0);
  g.add(p);
  // 检验台
  box(g, 1.2, 0.1, 0.8, mat(0xcfd4d9, { roughness: 0.4, metalness: 0.5 }), { pos: [d / 2 - 0.7, 0.95, 1.1] });
  box(g, 0.5, 0.34, 0.05, emissive(0x2f6fd0, 1.1), { pos: [d / 2 - 0.7, 1.25, 1.25] });
  return { group: g, robot };
}

/** 线尾成品冷却：轴流风机 + 静置成品桶 */
export function createCoolingRack(w: number, _h: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  box(g, w, 0.16, 2.8, mat(0x6d7784, { roughness: 0.75, metalness: 0.2 }), { pos: [0, 0.1, 0] });
  const n = Math.max(2, Math.round(w / 1.7));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / n;
    box(g, 0.82, 1.2, 0.4, mat(0x9aa3ad, { roughness: 0.45, metalness: 0.45 }), {
      pos: [x, 1.35, -0.95],
    });
    const fan = cyl(g, 0.28, 0.28, 0.06, 14, mat(accent, { roughness: 0.4, metalness: 0.35 }), {
      pos: [x, 1.35, -0.7],
      rot: [Math.PI / 2, 0, 0],
    });
    fan.userData.spin = { axis: 'z', speed: 4.2 };
    box(g, 0.16, 0.9, 0.16, M.base, { pos: [x, 0.55, -0.95] });
  }
  for (let i = 0; i < 4; i++) {
    const d = createDrum(0xe7ebef, 0.62, 0.24);
    d.position.set(-0.75 + (i % 2) * 0.75, 0.2, i < 2 ? 0.15 : 0.75);
    g.add(d);
  }
  return g;
}

/** 化工原料桶货架（双层） */
export function createDrumRack(
  bays: number,
  levels: number,
  bayWidth = 2.6,
  depth = 1.2,
  height = 3.4,
): THREE.Group {
  const g = new THREE.Group();
  const total = bays * bayWidth;
  const upright = mat(C.rackUpright, { roughness: 0.45, metalness: 0.35 });
  const beam = mat(C.rackBeam, { roughness: 0.45, metalness: 0.35 });
  for (let i = 0; i <= bays; i++) {
    const x = -total / 2 + i * bayWidth;
    for (const s of [-1, 1]) {
      box(g, 0.11, height, 0.11, upright, { pos: [x, height / 2, s * (depth / 2)] });
    }
  }
  for (let lv = 0; lv < levels; lv++) {
    const y = 0.12 + lv * 1.5;
    for (const s of [-1, 1]) {
      box(g, total, 0.12, 0.09, beam, { pos: [0, y, s * (depth / 2)] });
    }
    box(g, total, 0.05, depth - 0.1, mat(0x6d7783, { roughness: 0.8 }), { pos: [0, y + 0.08, 0] });
    // 层上的原料桶
    for (let b = 0; b < bays; b++) {
      const n = Math.random() > 0.35 ? 4 : 0;
      for (let i = 0; i < n; i++) {
        const d = createDrum(
          [0x2f6fbf, 0x3f7f5f, 0xb8642a, 0x8a8f96][Math.floor(Math.random() * 4)],
          0.86,
          0.28,
        );
        d.position.set(-total / 2 + bayWidth * b + 0.36 + (i % 2) * 0.62, y + 0.1, i < 2 ? -0.26 : 0.26);
        g.add(d);
      }
    }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  物料状态标识灯                                                     */
/* ------------------------------------------------------------------ */
export interface BeaconHandle {
  group: THREE.Group;
  setState(s: 'raw' | 'part' | 'carton'): void;
  update(dt: number, t: number): void;
}

const BEACON_COLOR = {
  raw: 0x4a9eff,
  part: 0xff8a2b,
  carton: 0x2fd07a,
};

export function createMaterialBeacon(): BeaconHandle {
  const g = new THREE.Group();
  cyl(g, 0.022, 0.022, 0.46, 6, mat(C.darkSteel, { roughness: 0.6 }), { pos: [0, 0.23, 0] });
  const lamp = sphere(g, 0.085, emissive(BEACON_COLOR.raw, 2.0), { pos: [0, 0.52, 0] });
  let phase = 0;
  return {
    group: g,
    setState(s: 'raw' | 'part' | 'carton') {
      (lamp.material as THREE.MeshStandardMaterial).color.setHex(BEACON_COLOR[s]);
      (lamp.material as THREE.MeshStandardMaterial).emissive.setHex(BEACON_COLOR[s]);
    },
    update(dt: number, _t: number) {
      phase += dt * 4;
      (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.1 + Math.abs(Math.sin(phase)) * 1.6;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  成品码垛 / 纸箱垛                                                  */
/* ------------------------------------------------------------------ */
export function createCartonStack(layers = 3): THREE.Group {
  const g = new THREE.Group();
  for (let l = 0; l < layers; l++) {
    for (let i = 0; i < 4; i++) {
      const boxMesh = box(g, 0.78, 0.4, 0.62, M.carton, {
        pos: [(i % 2) * 0.8 - 0.4, 0.2 + l * 0.41, (i < 2 ? -0.32 : 0.32)],
      });
      boxMesh.rotation.y = (Math.random() - 0.5) * 0.05;
    }
  }
  return g;
}
