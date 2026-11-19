import * as THREE from 'three';
import type { Factory, LiftRig, Station } from '../world/factory';
import { CONVEYOR_TOP, LEVEL2_Y, LINES, POS, conveyorOffset, machineOffset, type LineSpec } from '../world/layout';
import { createLoad, createPallet, createMaterialBeacon, type AgvHandle, type LoadType } from '../world/equipment';
import { dampAngle } from '../core/utils';

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
  born: number;
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
    stage: 'toPick' | 'lift' | 'toDrop' | 'lower';
  } | null;
  curve: THREE.CatmullRomCurve3 | null;
  t: number;
  length: number;
  yaw: number;
  dockT: number;
  dockFrom: THREE.Vector3;
  dockTo: THREE.Vector3;
}

const ACTOR_COUNT = 12;
const AGV_SPEED = 3.6;
const LANE_N = 4.5;
const LANE_S = 7.0;
const CONVEYOR_SPEED = 1.7;

/** 拐角倒成圆弧，AGV 不会在直角处猛甩车头 */
function roundedPolyline(points: THREE.Vector3[], radius = 2.4, arc = 5): THREE.Vector3[] {
  const src = points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 1e-4);
  if (src.length < 3) return src.map((p) => p.clone());
  const out: THREE.Vector3[] = [src[0].clone()];
  for (let i = 1; i < src.length - 1; i++) {
    const prev = src[i - 1];
    const curr = src[i];
    const next = src[i + 1];
    const inDir = curr.clone().sub(prev);
    const outDir = next.clone().sub(curr);
    const inLen = inDir.length();
    const outLen = outDir.length();
    if (inLen < 1e-3 || outLen < 1e-3) {
      out.push(curr.clone());
      continue;
    }
    inDir.multiplyScalar(1 / inLen);
    outDir.multiplyScalar(1 / outLen);
    const r = Math.min(radius, inLen * 0.46, outLen * 0.46);
    const p1 = curr.clone().addScaledVector(inDir, -r);
    const p2 = curr.clone().addScaledVector(outDir, r);
    for (let s = 0; s <= arc; s++) {
      const t = s / arc;
      const omt = 1 - t;
      out.push(
        new THREE.Vector3(
          omt * omt * p1.x + 2 * omt * t * curr.x + t * t * p2.x,
          0,
          omt * omt * p1.z + 2 * omt * t * curr.z + t * t * p2.z,
        ),
      );
    }
  }
  out.push(src[src.length - 1].clone());
  return out;
}

/** 沿主干道规划路径（避开设备区） */
function route(from: THREE.Vector3, to: THREE.Vector3): THREE.CatmullRomCurve3 {
  const dN = Math.abs(from.z - LANE_N) + Math.abs(to.z - LANE_N);
  const dS = Math.abs(from.z - LANE_S) + Math.abs(to.z - LANE_S);
  const mid = dN <= dS ? LANE_N : LANE_S;
  const raw = [
    new THREE.Vector3(from.x, 0, from.z),
    new THREE.Vector3(from.x, 0, mid),
    new THREE.Vector3(to.x, 0, mid),
    new THREE.Vector3(to.x, 0, to.z),
  ];
  const pts = roundedPolyline(raw);
  if (pts.length < 2) pts.push(new THREE.Vector3(to.x + 0.2, 0, to.z + 0.2));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.12);
}

function cruise(t: number) {
  const a = THREE.MathUtils.smoothstep(t, 0, 0.1);
  const b = THREE.MathUtils.smoothstep(1 - t, 0, 0.12);
  return 0.32 + 0.68 * a * b;
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
  private stationById = new Map<string, Station>();

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
        born: 0,
      };
      this.actors.push(actor);
      this.resetActor(actor);
    }

    for (const handle of this.factory.agvs) {
      this.units.push({
        handle,
        job: null,
        curve: null,
        t: 0,
        length: 1,
        yaw: handle.group.rotation.y,
        dockT: 0,
        dockFrom: new THREE.Vector3(),
        dockTo: new THREE.Vector3(),
      });
    }
    for (const s of factory.stations) this.stationById.set(s.id, s);
  }

  private station(id: string) {
    return this.stationById.get(id);
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
    a.born = this.time;
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

  /* ------------------------- 主循环------------------------- */
  update(dtRaw: number) {
    if (this.paused) return;
    const dt = dtRaw * this.timeScale;
    this.time += dt;

    for (const u of this.units) this.updateAgv(u, dt);
    for (const a of this.actors) {
      a.beacon.update(dt, this.time);
      this.updateActor(a, dt);
    }
    this.updateLifts(dt);
    this.updateMachines(dt);
    this.updateStatuses();
  }

  private beginLeg(u: AgvUnit, from: THREE.Vector3, to: THREE.Vector3, stage: 'toPick' | 'toDrop') {
    u.curve = route(from, to);
    u.length = Math.max(u.curve.getLength(), 0.05);
    u.t = 0;
    if (u.job) u.job.stage = stage;
    u.yaw = u.handle.group.rotation.y;
  }

  private finishDrop(u: AgvUnit) {
    const job = u.job;
    if (!job) return;
    const a = job.actor;
    this.factory.root.attach(a.group);
    a.group.position.set(job.drop.x, 0, job.drop.z);
    a.group.rotation.set(0, 0, 0);
    a.phase = job.after;
    u.job = null;
    u.curve = null;
  }

  private updateDock(u: AgvUnit, dt: number) {
    const job = u.job;
    if (!job) return;
    const a = job.actor;
    u.dockT += dt / 0.48;
    const k = smooth(Math.min(u.dockT, 1));
    a.group.position.lerpVectors(u.dockFrom, u.dockTo, k);
    a.group.rotation.y = dampAngle(a.group.rotation.y, 0, 10, dt);
    if (u.dockT >= 1) {
      a.group.position.copy(u.dockTo);
      if (job.stage === 'lift') this.beginLeg(u, u.handle.group.position, job.drop, 'toDrop');
      else this.finishDrop(u);
    }
    u.handle.update(dt, this.time, true, 0);
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
        this.beginLeg(u, from, pick, 'toPick');
      }
    }

    if (u.job && (u.job.stage === 'lift' || u.job.stage === 'lower')) {
      this.updateDock(u, dt);
      return;
    }

    if (!u.job || !u.curve) {
      u.handle.update(dt, this.time, false, 0);
      return;
    }

    const prevT = u.t;
    u.t = Math.min(1, u.t + (AGV_SPEED * cruise(u.t) * dt) / u.length);
    const prev = u.curve.getPointAt(Math.min(prevT, 0.999));
    const pos = u.curve.getPointAt(Math.min(u.t, 0.999));
    const travel = prev.distanceTo(pos);
    u.handle.group.position.copy(u.t >= 1 ? u.curve.getPointAt(1) : pos);
    const tan = u.curve.getTangentAt(Math.min(Math.max(u.t, 0.001), 0.999));
    u.yaw = dampAngle(u.yaw, Math.atan2(-tan.z, tan.x), 8, dt);
    u.handle.group.rotation.y = u.yaw;

    if (u.t >= 1) {
      if (u.job.stage === 'toPick') {
        const a = u.job.actor;
        u.handle.group.attach(a.group);
        a.phase = 'riding';
        u.job.stage = 'lift';
        u.dockT = 0;
        u.dockFrom.copy(a.group.position);
        u.dockTo.set(0, u.handle.deckY, 0);
        u.curve = null;
      } else {
        const a = u.job.actor;
        u.job.stage = 'lower';
        u.dockT = 0;
        u.dockFrom.copy(a.group.position);
        u.dockTo.set(0, 0, 0);
        u.curve = null;
      }
    }
    u.handle.update(dt, this.time, true, travel);
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
        const up = smooth(Math.min(k / 0.58, 1));
        const slide = smooth(Math.max((k - 0.42) / 0.58, 0));
        a.group.position.set(
          THREE.MathUtils.lerp(a.transferFrom.x, a.transferTo.x, slide),
          THREE.MathUtils.lerp(a.transferFrom.y, a.transferTo.y, up),
          THREE.MathUtils.lerp(a.transferFrom.z, a.transferTo.z, slide),
        );
        a.group.rotation.y = dampAngle(a.group.rotation.y, 0, 5, dt);
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
        if (a.x < target - 0.001) {
          const gap = target - a.x;
          const speed = CONVEYOR_SPEED * THREE.MathUtils.clamp(gap / 0.55, 0.2, 1);
          a.x = Math.min(target, a.x + speed * dt);
        } else if (target >= stop.x - 0.02) {
          a.x = stop.x;
          a.phase = 'lineHold';
          a.timer = stop.hold;
          a.holdDur = stop.hold;
          a.holdStop = a.stopIndex;
        }
        a.group.rotation.y = dampAngle(a.group.rotation.y, 0, 6, dt);
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
        a.group.rotation.y = dampAngle(a.group.rotation.y, 0, 6, dt);
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
        const drop = k * k;
        a.group.position.set(
          THREE.MathUtils.lerp(a.transferFrom.x, a.transferTo.x, e),
          THREE.MathUtils.lerp(a.transferFrom.y, a.transferTo.y, drop),
          THREE.MathUtils.lerp(a.transferFrom.z, a.transferTo.z, e),
        );
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
          const cycle = this.time - a.born;
          if (cycle > 8 && cycle < 900) {
            this.cycleSamples.push(cycle);
            if (this.cycleSamples.length > 6) this.cycleSamples.shift();
          }
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

  /* ------------------------- 设备状态------------------------- */
  private updateLifts(dt: number) {
    const claim = new Map<LiftRig, number>();
    for (const a of this.actors) {
      if (a.phase !== 'liftUp' && a.phase !== 'liftWait') continue;
      let best: LiftRig | null = null;
      let bestD = 36;
      for (const lift of this.factory.lifts) {
        const d = (lift.x - a.group.position.x) ** 2 + (lift.z - a.group.position.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = lift;
        }
      }
      if (!best) continue;
      const y = a.phase === 'liftUp' ? Math.min(8.2, Math.max(best.homeY, a.group.position.y)) : best.homeY;
      const prev = claim.get(best);
      claim.set(best, prev === undefined ? y : Math.max(prev, y));
    }
    for (const lift of this.factory.lifts) {
      const target = claim.get(lift);
      lift.cage.position.y =
        target === undefined
          ? THREE.MathUtils.damp(lift.cage.position.y, lift.homeY, 2.4, dt)
          : target;
      if (lift.counter) lift.counter.position.y = 9.4 - lift.cage.position.y;
    }
  }

  private updateMachines(dt: number) {
    const wip = (id: string) => this.station(id)?.wip ?? 0;
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
      const st = this.station(id);
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
        const st = this.station(a.pendingStation);
        if (st && st.status === 'idle') st.status = 'wait';
      }
    }
    // 提升机/ 下料口在有物料经过时点亮
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

  /** 供 UI 使用：按产线分组的工位统计*/
  lineSummary(): Array<{ line: LineSpec; running: number; total: number }> {
    return LINES.map((line) => ({
      line,
      running: line.stops.filter((s) => {
        const st = this.station(s.id);
        return st && st.wip > 0;
      }).length,
      total: line.stops.length,
    }));
  }
}
