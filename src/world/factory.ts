import * as THREE from 'three';
import { buildBuilding } from './building';
import { createLabelSprite } from '../core/textures';
import {
  LINES,
  LEVEL2_Y,
  COOLING_YARDS,
  POS,
  DOORS,
  conveyorOffset,
  machineOffset,
  type LineSpec,
  type LineStop,
} from './layout';
import {
  createAgv,
  createBufferTank,
  createCar,
  createCoolingRack,
  createDosing,
  createDrum,
  createDrumRack,
  createFillingMachine,
  createFilter,
  createForklift,
  createHeatExchanger,
  createIbcTote,
  createLabeler,
  createPallet,
  createPalletizer,
  createReactor,
  createRollerConveyor,
  createSignalTower,
  createTower,
  createTruck,
  type AgvHandle,
  type RobotHandle,
  type RollerConveyorHandle,
  type TowerHandle,
} from './equipment';

export type StationStatus = 'idle' | 'run' | 'busy' | 'wait' | 'fault';

export interface Station {
  id: string;
  name: string;
  code: string;
  group: string;
  anchor: THREE.Vector3;
  labelY: number;
  focusPos: THREE.Vector3;
  focusTarget: THREE.Vector3;
  status: StationStatus;
  wip: number;
  done: number;
  hit: THREE.Mesh;
  tower?: TowerHandle;
  line?: LineSpec;
  stop?: LineStop;
}

export interface Factory {
  root: THREE.Group;
  stations: Station[];
  hits: THREE.Mesh[];
  conveyors: RollerConveyorHandle[];
  machines: THREE.Group[];
  robots: Record<string, RobotHandle>;
  towers: TowerHandle[];
  stationTowers: Record<string, TowerHandle>;
  agvs: AgvHandle[];
  forklift: THREE.Group;
  update(dt: number, t: number): void;
}

/** 按设备类型生成化工装置 */
function buildMachine(stop: LineStop, accent: number): THREE.Group {
  switch (stop.kind) {
    case 'dosing':
      return createDosing(stop.d, stop.h, accent);
    case 'reactor':
      return createReactor(stop.d, stop.h, accent);
    case 'tower':
      return createTower(stop.d, stop.h, accent);
    case 'filter':
      return createFilter(stop.d, stop.h, accent);
    case 'heatex':
      return createHeatExchanger(stop.d, stop.h, accent);
    case 'buffer':
      return createBufferTank(stop.d, stop.h, accent);
    case 'filling':
      return createFillingMachine(stop.d, stop.h, accent);
    case 'labeling':
      return createLabeler(stop.d, stop.h, accent);
    case 'palletize':
      return createPalletizer(stop.d, stop.h, accent).group;
    case 'cooling':
      return createCoolingRack(stop.w, stop.h, accent);
    default:
      return new THREE.Group();
  }
}

export function buildFactory(scene: THREE.Scene): Factory {
  const root = new THREE.Group();
  root.name = 'factory';
  scene.add(root);

  const building = buildBuilding(scene);
  root.add(building);

  const stations: Station[] = [];
  const hits: THREE.Mesh[] = [];
  const towers: TowerHandle[] = [];
  const stationTowers: Record<string, TowerHandle> = {};
  const conveyors: RollerConveyorHandle[] = [];
  const machines: THREE.Group[] = [];
  const robots: Record<string, RobotHandle> = {};

  const addStation = (
    s: Omit<Station, 'status' | 'wip' | 'done' | 'hit'> & { labelY?: number },
  ) => {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 2.6, 3.4),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.copy(s.anchor);
    hit.position.y += 1.3;
    hit.userData.stationId = s.id;
    root.add(hit);
    hits.push(hit);

    const label = createLabelSprite(s.name, s.code);
    label.position.copy(s.anchor);
    label.position.y += s.labelY ?? 4.0;
    root.add(label);

    const station: Station = { ...s, status: 'idle', wip: 0, done: 0, hit };
    stations.push(station);
    return station;
  };

  const addTower = (x: number, y: number, z: number, stationId?: string, h = 2.6) => {
    const t = createSignalTower(h);
    t.group.position.set(x, y, z);
    root.add(t.group);
    towers.push(t);
    if (stationId) stationTowers[stationId] = t;
    return t;
  };

  /* ================================================================
   *  二层：三条产线
   * ================================================================ */
  for (const line of LINES) {
    const len = line.x1 - line.x0;
    const mz = line.z + machineOffset(line);
    const cz = line.z + conveyorOffset(line);
    const conv = createRollerConveyor(len, { width: 1.5, top: 0.95, accent: line.accent });
    conv.group.position.set((line.x0 + line.x1) / 2, LEVEL2_Y, cz);
    root.add(conv.group);
    conv.setSpeed(1.7);
    conveyors.push(conv);

    for (const stop of line.stops) {
      let g: THREE.Group;
      if (stop.kind === 'palletize') {
        const p = createPalletizer(stop.d, stop.h, line.accent);
        g = p.group;
        robots.palletize = p.robot;
      } else {
        g = buildMachine(stop, line.accent);
      }
      g.position.set(stop.x, LEVEL2_Y, mz);
      g.userData.stationId = stop.id;
      root.add(g);
      machines.push(g);

      const viewZ = cz + (line.wall < 0 ? 11 : -11);
      addStation({
        id: stop.id,
        name: stop.name,
        code: stop.code,
        group: 'proc',
        anchor: new THREE.Vector3(stop.x, LEVEL2_Y, mz),
        labelY: stop.h + 2.6,
        focusPos: new THREE.Vector3(stop.x + 7, LEVEL2_Y + 6.5, viewZ),
        focusTarget: new THREE.Vector3(stop.x, LEVEL2_Y + 2.2, line.z),
        line,
        stop,
      });
      addTower(stop.x + stop.w / 2 + 0.55, LEVEL2_Y, mz - line.wall * (stop.d / 2 + 0.4), stop.id, 2.2);
    }

    const sign = createLabelSprite(line.name, line.product, line.wall < 0 ? '#3a8ede' : '#2fa36b');
    sign.position.set((line.x0 + line.x1) / 2, LEVEL2_Y + 8.6, cz);
    root.add(sign);
  }

  /* ================================================================
   *  1F：来料收货区 / 原料库 / 成品库
   * ================================================================ */
  {
    // 来料门内卸货暂存（西厅，避开北墙产线）
    const g = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const d = createDrum([0x2f6fbf, 0x3f7f5f, 0xb8642a][i % 3], 0.88, 0.3);
      d.position.set(-72 + (i % 6) * 2.2, 0, 10 + Math.floor(i / 6) * 1.45);
      d.rotation.y = Math.random() * 3;
      g.add(d);
    }
    for (let i = 0; i < 4; i++) {
      const t = createIbcTote();
      t.position.set(-70 + i * 1.6, 0, 22);
      g.add(t);
    }
    for (let i = 0; i < 8; i++) {
      const p = createPallet(null);
      p.position.set(-71, i * 0.21, 25.2);
      g.add(p);
    }
    root.add(g);
  }

  {
    // 原料库：西厅北侧桶架
    for (let i = 0; i < 4; i++) {
      const rack = createDrumRack(3, 3, 2.5, 1.2, 3.4);
      rack.position.set(-70 + i * 5.2, 0, -16);
      root.add(rack);
    }
    for (let i = 0; i < 8; i++) {
      const t = createIbcTote();
      t.position.set(-70 + i * 1.55, 0, -4);
      root.add(t);
    }
  }

  {
    // 两条原料线南侧：成品静置冷却（反应后不能马上灌装）
    for (const yard of COOLING_YARDS) {
      const g = new THREE.Group();
      const span = yard.x1 - yard.x0;
      const cols = Math.floor(span / 2.2);
      for (let i = 0; i < cols; i++) {
        const d = createDrum(i % 3 === 0 ? 0xd7ebe0 : 0xe7ebef, 0.82, 0.28);
        d.position.set(yard.x0 + 1 + (i % cols) * (span / cols), 0, yard.z + (i % 2 === 0 ? -0.7 : 0.7));
        g.add(d);
      }
      for (let i = 0; i < Math.floor(cols / 2); i++) {
        const p = createPallet('carton');
        p.position.set(yard.x0 + 2 + i * 4.2, 0, yard.z + 1.7);
        g.add(p);
      }
      root.add(g);
      const label = createLabelSprite(`${yard.id} 线成品冷却`, '静置降温后再灌装', yard.accent);
      label.position.set((yard.x0 + yard.x1) / 2, 4.4, yard.z);
      root.add(label);
    }
  }

  {
    // 成品库（办公楼北侧）+ 入库门内侧发运
    const g = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const p = createPallet('carton');
      p.position.set(44 + (i % 8) * 1.85, 0, -14 + Math.floor(i / 8) * 2.2);
      g.add(p);
    }
    for (let i = 0; i < 14; i++) {
      const d = createDrum(0xe4e7ea, 0.82, 0.28);
      d.position.set(46 + (i % 7) * 0.85, 0, -8 + Math.floor(i / 7) * 0.9);
      g.add(d);
    }
    for (let i = 0; i < 8; i++) {
      const p = createPallet('carton');
      p.position.set(64 + (i % 4) * 1.8, 0, 10 + Math.floor(i / 4) * 2.1);
      g.add(p);
    }
    root.add(g);
  }

  /* ================================================================
   *  设备与车辆
   * ================================================================ */
  const agvs: AgvHandle[] = [];
  for (let i = 0; i < 5; i++) {
    const a = createAgv();
    a.group.position.set(-20 + i * 5, 0, 6);
    root.add(a.group);
    agvs.push(a);
  }

  const forklift = createForklift();
  forklift.position.set(68, 0, -6);
  root.add(forklift);

  // 货车车头朝北，对准南墙来料门与入库门
  for (const [x, z] of [
    [DOORS.incoming.x, 39],
    [DOORS.incoming.x - 8, 50],
    [DOORS.outgoing.x, 39],
  ] as const) {
    const t = createTruck(0x2f5f9e);
    t.position.set(x, 0, z);
    t.rotation.y = -Math.PI / 2;
    root.add(t);
  }
  for (let i = 0; i < 10; i++) {
    const c = createCar([0xb8bec6, 0x2b3138, 0x8c9299, 0x3a4a5c][i % 4]);
    c.position.set(-24 + i * 3.1, 0, 54);
    c.rotation.y = Math.PI / 2;
    root.add(c);
  }

  /* ================================================================
   *  工位定义（1F）
   * ================================================================ */
  addStation({
    id: 'receiving',
    name: '来料收货区',
    code: 'WH-IN',
    group: 'in',
    anchor: POS.receiving.clone(),
    labelY: 5.6,
    focusPos: new THREE.Vector3(-72, 16, 36),
    focusTarget: new THREE.Vector3(-60, 1.5, 16),
  });
  addStation({
    id: 'raw',
    name: '原料库',
    code: 'WH-RAW',
    group: 'in',
    anchor: POS.rawStore.clone(),
    labelY: 5.0,
    focusPos: new THREE.Vector3(-72, 16, 8),
    focusTarget: new THREE.Vector3(-62, 1.5, -12),
  });
  addStation({
    id: 'lift',
    name: '原料提升',
    code: 'UP-01',
    group: 'in',
    anchor: POS.liftBase.clone(),
    labelY: 10.6,
    focusPos: new THREE.Vector3(-52, 16, -8),
    focusTarget: new THREE.Vector3(-43, 5, -22),
  });
  addStation({
    id: 'chute',
    name: '成品下料',
    code: 'DN-01',
    group: 'out',
    anchor: POS.chuteBase.clone(),
    labelY: 9.6,
    focusPos: new THREE.Vector3(40, 16, -6),
    focusTarget: new THREE.Vector3(31, 4, -22),
  });
  addStation({
    id: 'fg',
    name: '成品库',
    code: 'WH-FG',
    group: 'out',
    anchor: POS.fgStore.clone(),
    labelY: 5.0,
    focusPos: new THREE.Vector3(70, 16, 12),
    focusTarget: new THREE.Vector3(55, 1.5, -8),
  });
  addStation({
    id: 'ship',
    name: '发运出库',
    code: 'WH-OUT',
    group: 'out',
    anchor: POS.ship.clone(),
    labelY: 6.4,
    focusPos: new THREE.Vector3(80, 16, 28),
    focusTarget: new THREE.Vector3(68, 1.5, 16),
  });

  addTower(-70, 0, 22, 'receiving');
  addTower(-68, 0, -14, 'raw');
  addTower(-43, 0, -20, 'lift');
  addTower(31, 0, -20, 'chute');
  addTower(46, 0, -12, 'fg');
  addTower(66, 0, 12, 'ship');

  /* ================================================================
   *  更新
   * ================================================================ */
  let fkPhase = 0;
  const update = (dt: number, t: number) => {
    for (const c of conveyors) c.update(dt);
    for (const a of agvs) a.update(dt, t, false);
    for (const tw of towers) tw.update(dt, t);
    for (const r of Object.values(robots)) r.update(dt, t);

    for (const m of machines) {
      const sid = m.userData.stationId as string | undefined;
      const st = sid ? stations.find((s) => s.id === sid) : undefined;
      const busy = st ? st.status === 'busy' || st.status === 'run' : false;
      m.traverse((o) => {
        const s = (o as THREE.Object3D).userData.spin;
        if (!s) return;
        if (s.axis === 'z') o.rotation.z += s.speed * dt;
        else if (s.axis === 'y') o.rotation.y += (busy ? 1 : 0) * s.speed * dt;
        else if (s.axis === 'x') o.rotation.x += (busy ? 1 : 0) * s.speed * dt;
      });
    }

    // 叉车巡游（成品库 → 入库门内侧），走办公楼东侧
    fkPhase += dt * 0.1;
    const p = fkPhase % 1;
    forklift.position.x = 68;
    forklift.position.z = p < 0.5 ? -8 + (p / 0.5) * 24 : 16 - ((p - 0.5) / 0.5) * 24;
    forklift.rotation.y = p < 0.5 ? 0 : Math.PI;
  };

  return {
    root,
    stations,
    hits,
    conveyors,
    machines,
    robots,
    towers,
    stationTowers,
    agvs,
    forklift,
    update,
  };
}
