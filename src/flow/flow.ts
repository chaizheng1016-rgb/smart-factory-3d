import * as THREE from 'three';
import type { Factory } from '../world/factory';
import { CONVEYOR_TOP, LEVEL2_Y, LINES, POS, conveyorOffset, machineOffset, type LineSpec } from '../world/layout';
import { createLoad, createPallet, createMaterialBeacon, type AgvHandle, type LoadType } from '../world/equipment';

type Phase =
  | 'arrived'
  | 'awaitPickup'
  | 'riding'
  | 'rawWait'
  | 'liftWait'
  | 'liftUp'
  | 'line'
  | 'lineHold'
  | 'chuteDown'
  | 'fgWait'
  | 'fgStored'
  | 'shipWait'
  | 'recycle';

interface Actor {
  group: THREE.Group;
  pallet: THREE.Group;
  beacon: ReturnType<typeof createMaterialBeacon>;
  load: LoadType;
  phase: Phase;
  slot: number;
  lineIdx: number;
  /** 产线上的 X 坐标 */
  x: number;
  /** 产线上的 Z 坐标 */
  z: number;
  stopIndex: number;
  holdStop: number;
  timer: number;
  holdDur: number;
  transferT: number;
  transferDur: number;
  transferFrom: THREE.Vector3;
  transferTo: THREE.Vector3;
  pendingStation: string;
  pendingAfter: Phase;
  fade: number;
  startDelay: number;
}

interface AgvRequest {
  actor: Actor;
  drop: THREE.Vector3;
  after: Phase;
  station: string;
}

interface AgvUnit {
  handle: AgvHandle;
  job: {
    actor: Actor;
    drop: THREE.Vector3;
    after: Phase;
    station: string;
    stage: 'toPick' | 'toDrop';
  } | null;
  curve: THREE.CatmullRomCurve3 | null;
  t: number;
  length: number;
}

const ACTOR_COUNT = 12;
const AGV_SPEED = 3.6;
const LANE_N = 4.5;
const LANE_S = 7.0;
const CONVEYOR_SPEED = 1.7;

/** 沿主干道规划路径（避开设备区） */
function route(from: THREE.Vector3, to: THREE.Vector3): THREE.CatmullRomCurve3 {
  const dN = Math.abs(from.z - LANE_N) + Math.abs(to.z - LANE_N);
  const dS = Math.abs(from.z - LANE_S) + Math.abs(to.z - LANE_S);
  const mid = dN <= dS ? LANE_N : LANE_S;
  const raw = [
    from.clone(),
    new THREE.Vector3(from.x, 0, mid),
    new THREE.Vector3(to.x, 0, mid),
    to.clone(),
  ];
  const pts: THREE.Vector3[] = [];
  for (const p of raw) {
    if (!pts.length || p.distanceTo(pts[pts.length - 1]) > 0.4) pts.push(p);
  }
  if (pts.length < 2) pts.push(to.clone().add(new THREE.Vector3(0.2, 0, 0.2)));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0);
}

function setLoad(pallet: THREE.Group, type: LoadType) {
  const old = pallet.children.find((c) => c.userData.isLoad);
  if (old) pallet.remove(old);
  if (!type) return;
  const l = createLoad(type);
  l.position.y = 0.2;
  pallet.add(l);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export class FlowController {
  readonly actors: Actor[] = [];
  private units: AgvUnit[] = [];
  private requests: AgvRequest[] = [];
  private time = 0;
  private cycleSamples: number[] = [];

  paused = false;
  timeScale = 1;

  metrics = {
    produced: 0,
    wip: 0,
    cycleSec: 0,
    oee: 91.6,
    quality: 99.3,
    agvBusy: 0,
    lineBusy: 0,
  };

  constructor(private factory: Factory) {
    for (let i = 0; i < ACTOR_COUNT; i++) {
      const group = new THREE.Group();
      const pallet = createPallet('raw');
      group.add(pallet);
      const beacon = createMaterialBeacon();
      beacon.group.position.set(0.46, 0.2, 0.46);
      group.add(beacon.group);
      this.factory.root.add(group);

      const actor: Actor = {
        group,
        pallet,
        beacon,
        load: 'raw',
        phase: 'arrived',
        slot: i,
        lineIdx: i % LINES.length,
        x: 0,
        z: 0,
        stopIndex: 0,
        holdStop: 0,
        timer: 0,
        holdDur: 0,
        transferT: 0,
        transferDur: 2.4,
        transferFrom: new THREE.Vector3(),
        transferTo: new THREE.Vector3(),
        pendingStation: 'receiving',
        pendingAfter: 'rawWait',
        fade: 0,
        startDelay: i * 4.5,
      };
      this.actors.push(actor);
      this.resetActor(actor);
    }

    for (const handle of this.factory.agvs) {
      this.units.push({ handle, job: null, curve: null, t: 0, length: 1 });
    }
  }

  /* ------------------------- 工具 ------------------------- */
  private lineOf(a: Actor): LineSpec {
    return LINES[a.lineIdx];
  }

  private conveyorZ(line: LineSpec) {
    return line.z + conveyorOffset(line);
  }

  private machineZ(line: LineSpec) {
    return line.z + machineOffset(line);
  }

  /** 每条线自己的提升机口，避免三条线共用一个点 */
  private liftAnchor(a: Actor) {
    const line = this.lineOf(a);
    const col = a.slot % 2;
    return new THREE.Vector3(line.x0 - 3.4 - col * 1.5, 0, this.conveyorZ(line));
  }

  private slotPos(base: THREE.Vector3, i: number, dx: number, dz: number): THREE.Vector3 {
    const col = i % 3;
    const row = Math.floor(i / 3) % 2;
    return new THREE.Vector3(base.x + col * dx, base.y, base.z + row * dz);
  }

  private receivingSlot(i: number) {
    return this.slotPos(POS.receiving, i, 1.8, 1.7);
  }
  private rawSlot(i: number) {
    return this.slotPos(POS.rawStore, i, 1.9, 1.6);
  }
  private fgSlot(i: number) {
    return this.slotPos(POS.fgStore, i, 1.9, 1.7);
  }
  private shipSlot(i: number) {
    return this.slotPos(POS.ship, i, 1.9, 1.7);
  }

  private resetActor(a: Actor) {
    a.load = 'raw';
    setLoad(a.pallet, 'raw');
    a.beacon.setState('raw');
    a.phase = 'arrived';
    a.x = 0;
    a.z = 0;
    a.stopIndex = 0;
    a.timer = 0;
    a.fade = 0;
    a.pendingStation = 'receiving';
    a.group.scale.setScalar(1);
    const p = this.receivingSlot(a.slot);
    a.group.position.set(p.x, 0, p.z);
    a.group.rotation.set(0, (Math.random() - 0.5) * 0.1, 0);
  }

  private request(a: Actor, drop: THREE.Vector3, after: Phase, station: string) {
    a.pendingStation = station;
    a.pendingAfter = after;
    a.phase = 'awaitPickup';
    this.requests.push({ actor: a, drop: drop.clone(), after, station });
  }

  /* ------------------------- 主循�?------------------------- */
  update(dtRaw: number) {
    if (this.paused) return;
    const dt = dtRaw * this.timeScale;
    this.time += dt;

    for (const u of this.units) this.updateAgv(u, dt);
    for (const a of this.actors) {
      a.beacon.update(dt, this.time);
      this.updateActor(a, dt);
    }
    this.updateMachines(dt);
    this.updateStatuses();
  }

  private updateAgv(u: AgvUnit, dt: number) {
    if (!u.job) {
      const req = this.requests.shift();
      if (req) {
        const from = u.handle.group.position.clone();
        const pick = req.actor.group.getWorldPosition(new THREE.Vector3());
        pick.y = 0;
        u.job = {
          actor: req.actor,
          drop: req.drop,
          after: req.after,
          station: req.station,
          stage: 'toPick',
        };
        u.curve = route(from, pick);
        u.length = Math.max(u.curve.getLength(), 0.01);
        u.t = 0;
      }
    }

    if (!u.job || !u.curve) {
      u.handle.update(dt, this.time, false);
      return;
    }

    u.t += (AGV_SPEED * dt) / u.length;
    if (u.t >= 1) {
      u.t = 1;
      const p = u.curve.getPointAt(1);
      u.handle.group.position.copy(p);
      if (u.job.stage === 'toPick') {
        const a = u.job.actor;
        u.handle.group.attach(a.group);
        a.group.position.set(0, u.handle.deckY, 0);
        a.phase = 'riding';
        u.job.stage = 'toDrop';
        u.curve = route(p.clone(), u.job.drop);
        u.length = Math.max(u.curve.getLength(), 0.01);
        u.t = 0;
      } else {
        const a = u.job.actor;
        this.factory.root.attach(a.group);
        a.group.position.set(u.job.drop.x, 0, u.job.drop.z);
        a.group.rotation.set(0, u.handle.group.rotation.y, 0);
        a.phase = u.job.after;
        u.job = null;
        u.curve = null;
      }
      u.handle.update(dt, this.time, true);
      return;
    }

    const pos = u.curve.getPointAt(u.t);
    u.handle.group.position.copy(pos);
    const tan = u.curve.getTangentAt(u.t);
    u.handle.group.rotation.y = Math.atan2(-tan.z, tan.x);
    u.handle.update(dt, this.time, true);
  }

  private updateActor(a: Actor, dt: number) {
    switch (a.phase) {
      case 'arrived': {
        if (a.startDelay > 0) {
          a.startDelay -= dt;
          break;
        }
        a.timer -= dt;
        if (a.timer <= 0) {
          this.request(a, this.rawSlot(a.slot), 'rawWait', 'raw');
        }
        break;
      }

      case 'awaitPickup':
      case 'riding':
        break;

      case 'rawWait': {
        a.timer -= dt;
        if (a.timer <= 0) {
          this.request(a, this.liftAnchor(a), 'liftWait', 'lift');
        }
        break;
      }

      case 'liftWait': {
        a.timer -= dt;
        if (a.timer <= 0) {
          const line = this.lineOf(a);
          a.transferFrom.copy(a.group.position);
          a.transferTo.set(line.x0, LEVEL2_Y + CONVEYOR_TOP, this.conveyorZ(line));
          a.transferT = 0;
          a.transferDur = 3.4;
          a.phase = 'liftUp';
          a.stopIndex = 0;
        }
        break;
      }

      case 'liftUp': {
        a.transferT += dt / a.transferDur;
        const k = Math.min(a.transferT, 1);
        const e = smooth(k);
        a.group.position.lerpVectors(a.transferFrom, a.transferTo, e);
        // 先垂直上升，再沿产线方向推进
        a.group.position.y += Math.sin(Math.min(e * 1.6, 1) * Math.PI) * 2.2;
        if (k >= 1) {
          const line = this.lineOf(a);
          a.group.position.copy(a.transferTo);
          a.load = 'part';
          setLoad(a.pallet, 'part');
          a.beacon.setState('part');
          a.phase = 'line';
          a.x = line.x0;
          a.z = this.conveyorZ(line);
          a.stopIndex = 0;
        }
        break;
      }

      case 'line': {
        const line = this.lineOf(a);
        const stop = line.stops[a.stopIndex];
        if (!stop) {
          a.phase = 'chuteDown';
          a.transferFrom.copy(a.group.position);
          a.transferTo.set(line.x1 + 1.8, 0.6, this.conveyorZ(line));
          a.transferT = 0;
          a.transferDur = 3.0;
          break;
        }
        const limit = this.lineLimit(a);
        const target = Math.min(stop.x, limit);
        if (a.x < target) {
          a.x = Math.min(target, a.x + CONVEYOR_SPEED * dt);
        } else if (a.x >= stop.x - 0.02) {
          a.x = stop.x;
          a.phase = 'lineHold';
          a.timer = stop.hold;
          a.holdDur = stop.hold;
          a.holdStop = a.stopIndex;
        }
        a.group.position.set(a.x, LEVEL2_Y + CONVEYOR_TOP, this.conveyorZ(line));
        break;
      }

      case 'lineHold': {
        const line = this.lineOf(a);
        const held = line.stops[a.holdStop];
        if (held?.kind === 'cooling' && a.load !== 'carton') {
          a.load = 'carton';
          setLoad(a.pallet, 'carton');
          a.beacon.setState('carton');
        }
        a.timer -= dt;
        const cz = this.conveyorZ(line);
        const mz = this.machineZ(line);
        const elapsed = a.holdDur - a.timer;
        const moveIn = 1.3;
        let z = mz;
        if (elapsed < moveIn) {
          z = cz + (mz - cz) * smooth(elapsed / moveIn);
        } else if (a.timer < moveIn) {
          z = mz + (cz - mz) * smooth(1 - a.timer / moveIn);
        }
        a.z = z;
        a.group.position.set(a.x, LEVEL2_Y + CONVEYOR_TOP, z);
        if (a.timer <= 0) {
          a.group.position.set(a.x, LEVEL2_Y + CONVEYOR_TOP, cz);
          if (a.holdStop < line.stops.length - 1) {
            a.stopIndex = a.holdStop + 1;
            a.phase = 'line';
          } else {
            a.load = 'carton';
            setLoad(a.pallet, 'carton');
            a.beacon.setState('carton');
            a.phase = 'chuteDown';
            a.transferFrom.copy(a.group.position);
            a.transferTo.set(line.x1 + 1.8, 0.6, this.conveyorZ(line));
            a.transferT = 0;
            a.transferDur = 3.0;
          }
        }
        break;
      }

      case 'chuteDown': {
        a.transferT += dt / a.transferDur;
        const k = Math.min(a.transferT, 1);
        const e = smooth(k);
        a.group.position.lerpVectors(a.transferFrom, a.transferTo, e);
        if (k >= 1) {
          a.group.position.copy(a.transferTo);
          a.phase = 'fgWait';
          a.timer = 3;
        }
        break;
      }

      case 'fgWait': {
        a.timer -= dt;
        if (a.timer <= 0) {
          this.request(a, this.fgSlot(a.slot), 'fgStored', 'fg');
        }
        break;
      }

      case 'fgStored': {
        a.timer -= dt;
        if (a.timer <= 0) {
          this.request(a, this.shipSlot(a.slot), 'shipWait', 'ship');
        }
        break;
      }

      case 'shipWait': {
        a.timer -= dt;
        if (a.timer <= 0) {
          a.phase = 'recycle';
          a.fade = 0;
          this.metrics.produced++;
        }
        break;
      }

      case 'recycle': {
        a.fade += dt / 0.6;
        const k = Math.min(a.fade, 1);
        a.group.scale.setScalar(1 - k);
        if (k >= 1) {
          this.resetActor(a);
          a.startDelay = 4;
          a.lineIdx = (a.lineIdx + 1) % LINES.length;
        }
        break;
      }
    }
  }

  /** 线上间距约束 */
  private lineLimit(a: Actor): number {
    let limit = Infinity;
    for (const o of this.actors) {
      if (o === a || o.lineIdx !== a.lineIdx) continue;
      const onLine = o.phase === 'line' || o.phase === 'lineHold';
      if (onLine && o.x > a.x + 0.05) limit = Math.min(limit, o.x - 2.6);
    }
    return limit;
  }

  /* ------------------------- 设备状�?------------------------- */
  private updateMachines(dt: number) {
    const wip = (id: string) => this.factory.stations.find((s) => s.id === id)?.wip ?? 0;
    this.factory.robots.palletize?.update(dt, this.time);
    this.factory.robots.palletize?.setWorking(wip('C4') > 0);
    for (const c of this.factory.conveyors) c.setSpeed(CONVEYOR_SPEED);
  }

  private updateStatuses() {
    const byId: Record<string, number> = {};
    for (const st of this.factory.stations) {
      st.wip = 0;
      st.status = 'idle';
    }
    for (const a of this.actors) {
      const id = this.stationOf(a);
      if (!id) continue;
      const st = this.factory.stations.find((s) => s.id === id);
      if (!st) continue;
      st.wip++;
      byId[id] = (byId[id] ?? 0) + 1;
    }
    for (const st of this.factory.stations) {
      const n = byId[st.id] ?? 0;
      if (n > 0) st.status = 'busy';
    }
    // 等待 AGV 的工位标记为待料
    for (const a of this.actors) {
      if (a.phase === 'awaitPickup' && a.pendingStation !== 'receiving') {
        const st = this.factory.stations.find((s) => s.id === a.pendingStation);
        if (st && st.status === 'idle') st.status = 'wait';
      }
    }
    // 提升�?/ 下料口在有物料经过时点亮
    for (const st of this.factory.stations) {
      if ((st.id === 'lift' || st.id === 'chute') && st.wip > 0 && st.status === 'idle') {
        st.status = 'busy';
      }
    }

    this.metrics.wip = this.actors.filter(
      (a) => a.phase !== 'arrived' && a.phase !== 'awaitPickup' && a.phase !== 'recycle',
    ).length;
    this.metrics.agvBusy = this.units.filter((u) => u.job !== null).length;
    this.metrics.lineBusy = this.actors.filter((a) => a.phase === 'line' || a.phase === 'lineHold').length;
    if (this.cycleSamples.length) {
      const sum = this.cycleSamples.reduce((a, b) => a + b, 0);
      this.metrics.cycleSec = sum / this.cycleSamples.length;
    }
  }

  private stationOf(a: Actor): string | null {
    switch (a.phase) {
      case 'arrived':
        return 'receiving';
      case 'awaitPickup':
      case 'riding':
        return a.pendingStation;
      case 'rawWait':
        return 'raw';
      case 'liftWait':
      case 'liftUp':
        return 'lift';
      case 'line': {
        const stop = this.lineOf(a).stops[a.stopIndex];
        return stop ? stop.id : 'chute';
      }
      case 'lineHold': {
        const stop = this.lineOf(a).stops[a.holdStop];
        return stop ? stop.id : 'chute';
      }
      case 'chuteDown':
        return 'chute';
      case 'fgWait':
        return 'fg';
      case 'fgStored':
        return 'fg';
      case 'shipWait':
        return 'ship';
      default:
        return null;
    }
  }

  /** �?UI 使用：按产线分组的工位统�?*/
  lineSummary(): Array<{ line: LineSpec; running: number; total: number }> {
    return LINES.map((line) => ({
      line,
      running: line.stops.filter((s) => {
        const st = this.factory.stations.find((x) => x.id === s.id);
        return st && st.wip > 0;
      }).length,
      total: line.stops.length,
    }));
  }
}
