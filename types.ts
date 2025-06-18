
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export enum ProjectileType {
  STANDARD = 'STANDARD',
  HEAVY = 'HEAVY',
  EXPLOSIVE = 'EXPLOSIVE',
  CLUSTER = 'CLUSTER',
}

export interface ProjectileConfig {
  id: ProjectileType;
  name: string;
  description: string;
  icon: string; // emoji or path to icon
  defaultCount: number;
}

export interface PhysicsObject {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  id: string;
  isKing?: boolean; // True if this is the Golden Block (target block)
  initialY: number; // Center Y of the physics body
  isFallen: boolean;
  // Projectile-specific properties
  projectileType?: ProjectileType;
  lifeSpan?: number; // in seconds, for projectiles like explosives/clusters
  creationTime?: number; // performance.now() at creation
  hasSplit?: boolean; // For cluster projectiles
  isSubmunition?: boolean; // To identify cluster submunitions
  onCollideHandler?: (event: any) => void; // Optional: for event handlers like explosive's collision
}

export interface GameState {
  score: number; // Score for the current level attempt
  projectilesLeft: number; // Count of the CURRENTLY SELECTED projectile type
  projectileCounts: Record<ProjectileType, number>; // Counts for all types
  selectedProjectileType: ProjectileType;
  isGameOver: boolean; // True if out of projectiles and golden block not hit on current level, OR all levels complete
  gameMessage: string;
  currentLevelIndex: number;
  isLevelWon: boolean; // True if golden block hit in current level
}

export type BlockShape = 'cube' | 'cylinder' | 'sphere' | 'cube_2x1x1' | 'cube_3x1x1';

export interface BlockConfig {
  id: string;
  x: number; // Center x
  y: number; // Center y
  z: number; // Center z
  shape?: BlockShape; // Defaults to 'cube' if undefined
  isKing?: boolean; // True if this is the Golden Block (target block)
  color?: number; // Hex color code, e.g., 0xff0000 for red
}

export interface LevelConfiguration {
  levelId: string | number; // Updated to allow string for custom IDs
  name: string;
  structure: BlockConfig[];
  initialProjectiles: number; // For standard type, if no specific counts given
  initialProjectileCounts?: Partial<Record<ProjectileType, number>>; // Specific counts for different types
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
  gameMessage?: string; // Optional: custom message for the start of the level
}

export interface ExplosionParticleSystem {
  points: THREE.Points; // The THREE.js Points object
  velocities: THREE.Vector3[]; // Array of velocity vectors for each particle
  creationTime: number; // Timestamp of when the system was created (performance.now())
}
