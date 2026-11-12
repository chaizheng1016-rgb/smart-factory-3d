import * as THREE from 'three';
import { FACTORY } from '../core/textures';

/* ------------------------------------------------------------------ */
/*  楼层标高                                                           */
/* ------------------------------------------------------------------ */
export const LEVEL1_H = 6.4; // 一层净高
export const LEVEL2_Y = 6.6; // 二层楼面标高
export const ROOF_Y = 13.0; // 屋架标高

/** 设备贴墙一侧，辊道在通道一侧。wall = -1 靠北墙，+1 靠南墙 */
export const MACHINE_OFF = 2.2;
export const CONVEYOR_OFF = 2.2;
export const CONVEYOR_TOP = 0.95;

export function machineOffset(line: { wall: -1 | 1 }) {
  return line.wall * MACHINE_OFF;
}
export function conveyorOffset(line: { wall: -1 | 1 }) {
  return -line.wall * CONVEYOR_OFF;
}

/* ------------------------------------------------------------------ */
/*  平面分区（沿 X：来料 → 生产 → 成品入库）                            */
/* ------------------------------------------------------------------ */
export const ZONES = {
  /** 西端来料收货 + 原料库（1F，在产线南侧） */
  receiving: { x0: -75, x1: -46 },
  /** 北墙三条并排短产线，整体让开来料区（西厅） */
  production: { x0: -40, x1: 69 },
  /** 东端成品库，南侧为办公楼与入库门 */
  shipping: { x0: 40, x1: 75 },
};

/** 两个门洞都在南墙（z = maxZ）。入库门在办公楼东侧（朝南看时的右侧） */
export const DOORS = {
  incoming: { x: -60, width: 12 },
  outgoing: { x: 69.5, width: 9 },
};

/* ------------------------------------------------------------------ */
/*  三条产线沿北墙并排，z 相同、全部贴墙。每条约 29m，线间留出提升机和下料口。 */
/* ------------------------------------------------------------------ */
export type MachineKind =
  | 'dosing'
  | 'reactor'
  | 'tower'
  | 'filter'
  | 'heatex'
  | 'buffer'
  | 'filling'
  | 'labeling'
  | 'palletize'
  | 'cooling';

export interface LineStop {
  id: string;
  name: string;
  code: string;
  kind: MachineKind;
  x: number;
  hold: number;
  /** 设备主体尺寸：w 沿 X，d 沿 Z，h 为高 */
  w: number;
  d: number;
  h: number;
}

export interface LineSpec {
  id: string;
  name: string;
  product: string;
  z: number;
  /** -1 设备贴北墙，+1 设备贴南墙 */
  wall: -1 | 1;
  /** 原料线出料后在线尾静置成品，供冷却 */
  holdsFinished: boolean;
  x0: number;
  x1: number;
  accent: number;
  stops: LineStop[];
}

const S = (
  id: string,
  name: string,
  code: string,
  kind: MachineKind,
  x: number,
  hold: number,
  w: number,
  d: number,
  h: number,
): LineStop => ({ id, name, code, kind, x, hold, w, d, h });

export const LINES: LineSpec[] = [
  {
    id: 'A',
    name: '表面活性剂合成线',
    product: '原料合成 · 线尾成品冷却',
    z: -24.6,
    wall: -1,
    holdsFinished: true,
    x0: -40,
    x1: -11,
    accent: 0x3f7fd8,
    stops: [
      S('A1', '投料计量', 'A-01', 'dosing', -36.8, 7, 3.4, 3.2, 3.4),
      S('A2', '合成反应釜', 'A-02', 'reactor', -31.6, 9, 4.0, 3.4, 5.4),
      S('A3', '中和熟化', 'A-03', 'tower', -26.6, 9, 3.2, 3.2, 5.8),
      S('A4', '压滤均质', 'A-04', 'filter', -21.2, 8, 4.6, 3.2, 3.4),
      S('A5', '成品冷却', 'A-05', 'cooling', -14.8, 12, 5.4, 3.0, 2.4),
    ],
  },
  {
    id: 'B',
    name: '纺织助剂复配线',
    product: '原料复配 · 线尾成品冷却',
    z: -24.6,
    wall: -1,
    holdsFinished: true,
    x0: 0,
    x1: 29,
    accent: 0xd8632c,
    stops: [
      S('B1', '配料计量', 'B-01', 'dosing', 3.2, 7, 3.4, 3.2, 3.4),
      S('B2', '搅拌复配', 'B-02', 'reactor', 8.4, 9, 4.0, 3.4, 4.8),
      S('B3', '板式换热', 'B-03', 'heatex', 13.4, 7, 4.0, 2.8, 3.2),
      S('B4', '过滤均质', 'B-04', 'filter', 18.8, 8, 4.4, 3.2, 3.4),
      S('B5', '成品冷却', 'B-05', 'cooling', 25.2, 12, 5.4, 3.0, 2.4),
    ],
  },
  {
    id: 'C',
    name: '成品灌装包装线',
    product: '灌装 / 贴标 / 码垛',
    z: -24.6,
    wall: -1,
    holdsFinished: false,
    x0: 40,
    x1: 69,
    accent: 0x2fa36b,
    stops: [
      S('C1', '成品暂存罐', 'C-01', 'buffer', 44, 8, 4.0, 3.6, 4.6),
      S('C2', '自动灌装', 'C-02', 'filling', 51.5, 8, 4.6, 3.2, 3.6),
      S('C3', '贴标打码', 'C-03', 'labeling', 59, 6, 4.2, 2.8, 3.0),
      S('C4', '检验码垛', 'C-04', 'palletize', 65.5, 8, 4.0, 3.0, 3.8),
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  关键作业点（均在 1F）                                              */
/* ------------------------------------------------------------------ */
export const POS = {
  /** 来料门内卸货暂存（西厅） */
  receiving: new THREE.Vector3(-60, 0, 16),
  /** 原料库（西厅北侧） */
  rawStore: new THREE.Vector3(-62, 0, -10),
  /** 原料提升代表点（A 线西端，三条线各自有提升机） */
  liftBase: new THREE.Vector3(-43, 0, -22),
  /** 下料口代表点（B 线东端） */
  chuteBase: new THREE.Vector3(31, 0, -22),
  /** 成品库（东厅，办公楼北侧） */
  fgStore: new THREE.Vector3(55, 0, -6),
  /** 发运暂存（入库门内侧，办公楼东侧） */
  ship: new THREE.Vector3(68, 0, 16),
};

/** 两层办公楼贴南墙，入库门在其东侧 */
export const OFFICE = { x0: 44, x1: 60, z0: 8, z2: 28, floorH: 3.9 };

/** 两条原料线南侧（通道一侧）的成品冷却带，不占北墙、也不插进线与线之间 */
export const COOLING_YARDS = [
  { id: 'A', x0: -22, x1: -12, z: -17.6, accent: '#3f7fd8' },
  { id: 'B', x0: 12, x1: 28, z: -17.6, accent: '#d8632c' },
];

/** 工艺树分组 */
export const GROUPS = [
  { id: 'in', name: '来料与原料库' },
  { id: 'proc', name: '生产加工（三条产线）' },
  { id: 'out', name: '成品入库与发运' },
];

export { FACTORY };
