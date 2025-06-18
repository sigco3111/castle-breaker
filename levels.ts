
import { LevelConfiguration } from './types';
import { BLOCK_SIZE } from './constants';

export const LEVEL_CONFIGS: LevelConfiguration[] = [
  {
    levelId: 1,
    name: "기본 성곽",
    initialProjectiles: 10,
    structure: [
      { id: 'l1_base_0', shape: 'cube', x: -BLOCK_SIZE / 2 - 0.05, y: BLOCK_SIZE / 2, z: 0 },
      { id: 'l1_base_1', shape: 'cube', x: BLOCK_SIZE / 2 + 0.05, y: BLOCK_SIZE / 2, z: 0 },
      { id: 'l1_mid_0', shape: 'cube', x: 0, y: BLOCK_SIZE * 1.5, z: 0 },
      { id: 'l1_king', shape: 'cube', x: 0, y: BLOCK_SIZE * 2.5, z: 0, isKing: true },
    ],
    cameraPosition: { x: 0, y: BLOCK_SIZE * 2, z: BLOCK_SIZE * 5 },
    cameraTarget: { x: 0, y: BLOCK_SIZE, z: 0 },
    gameMessage: "레벨 1: 기본 성곽. 황금 블록을 무너뜨리세요!"
  },
  {
    levelId: 2,
    name: "높은 탑",
    initialProjectiles: 8,
    structure: [
      { id: 'l2_base_0', shape: 'cube', x: 0, y: BLOCK_SIZE / 2, z: 0 },
      { id: 'l2_l1_0', shape: 'cube', x: 0, y: BLOCK_SIZE * 1.5, z: 0 },
      { id: 'l2_l2_0', shape: 'cube', x: 0, y: BLOCK_SIZE * 2.5, z: 0 },
      { id: 'l2_l3_0', shape: 'cube', x: 0, y: BLOCK_SIZE * 3.5, z: 0 },
      { id: 'l2_king', shape: 'cube', x: 0, y: BLOCK_SIZE * 4.5, z: 0, isKing: true },
    ],
    cameraPosition: { x: BLOCK_SIZE * 1, y: BLOCK_SIZE * 3, z: BLOCK_SIZE * 8 },
    cameraTarget: { x: 0, y: BLOCK_SIZE * 2, z: 0 },
    gameMessage: "레벨 2: 높은 탑. 안정적으로 조준하세요!"
  },
  {
    levelId: 3,
    name: "견고한 요새",
    initialProjectiles: 7,
    structure: [
      // Base layer - 2x2 blocks for stability
      { id: 'l3_base_0', shape: 'cube', x: -BLOCK_SIZE * 0.5 - 0.02, y: BLOCK_SIZE * 0.5, z: -BLOCK_SIZE * 0.5 - 0.02 },
      { id: 'l3_base_1', shape: 'cube', x:  BLOCK_SIZE * 0.5 + 0.02, y: BLOCK_SIZE * 0.5, z: -BLOCK_SIZE * 0.5 - 0.02 },
      { id: 'l3_base_2', shape: 'cube', x: -BLOCK_SIZE * 0.5 - 0.02, y: BLOCK_SIZE * 0.5, z:  BLOCK_SIZE * 0.5 + 0.02 },
      { id: 'l3_base_3', shape: 'cube', x:  BLOCK_SIZE * 0.5 + 0.02, y: BLOCK_SIZE * 0.5, z:  BLOCK_SIZE * 0.5 + 0.02 },
      // Second layer - forming a smaller platform
      { id: 'l3_mid_0', shape: 'cube', x: 0, y: BLOCK_SIZE * 1.5, z: -BLOCK_SIZE * 0.5 - 0.02 },
      { id: 'l3_mid_1', shape: 'cube', x: 0, y: BLOCK_SIZE * 1.5, z:  BLOCK_SIZE * 0.5 + 0.02 },
      // Third layer - central platform block
      { id: 'l3_plat_0', shape: 'cube', x: 0, y: BLOCK_SIZE * 2.5, z: 0 },
      // Golden Block on top
      { id: 'l3_king', shape: 'cube', x: 0, y: BLOCK_SIZE * 3.5, z: 0, isKing: true },
    ],
    cameraPosition: { x: BLOCK_SIZE * 1.5, y: BLOCK_SIZE * 3, z: BLOCK_SIZE * 7 },
    cameraTarget: { x: 0, y: BLOCK_SIZE * 1.5, z: 0 },
    gameMessage: "레벨 3: 견고한 요새. 황금 블록을 정밀하게 공격하세요!"
  },
];
