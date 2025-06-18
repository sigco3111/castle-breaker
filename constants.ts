
import { ProjectileType, ProjectileConfig } from './types';

// Global physics constants
export const PROJECTILE_RADIUS = 0.25;
export const PROJECTILE_MASS = 10;
export const PROJECTILE_VELOCITY_MULTIPLIER = 25;

export const BLOCK_SIZE = 1; // Exporting for use in editor
export const BLOCK_MASS = 0.5; // Lighter blocks for easier toppling

// Points constants
export const POINTS_PER_BLOCK = 10;
export const POINTS_PER_KING = 100; // Points for toppling the Golden Block

// Launching constants
export const MAX_CHARGE_DURATION_MS = 1500; // 1.5 seconds for full charge
export const MIN_LAUNCH_POWER = 0.1; // Minimum power for a quick tap
export const MAX_LAUNCH_POWER = 1.0; // Maximum power after full charge

// --- Projectile Type Specific Constants ---

// Standard Projectile (already uses PROJECTILE_RADIUS, PROJECTILE_MASS)
export const STANDARD_PROJECTILE_COLOR = 0xff6347; // Tomato

// Heavy Projectile
export const HEAVY_PROJECTILE_RADIUS = 0.35;
export const HEAVY_PROJECTILE_MASS = 25;
export const HEAVY_PROJECTILE_COLOR = 0x808080; // Gray

// Explosive Projectile
export const EXPLOSIVE_PROJECTILE_RADIUS = 0.28;
export const EXPLOSIVE_PROJECTILE_MASS = 12;
export const EXPLOSIVE_PROJECTILE_COLOR = 0xffa500; // Orange
export const EXPLOSION_RADIUS = 3.5; // World units for physics impulse
export const EXPLOSION_STRENGTH = 3.6; // Impulse strength (reduced to 1/5 of previous 18, original was 60)
export const EXPLOSIVE_PROJECTILE_LIFESPAN_MS = 3000; // 3 seconds before self-detonation

// New Particle Explosion Effect Constants
export const EXPLOSION_PARTICLE_COUNT = 80;
export const EXPLOSION_PARTICLE_COLOR = 0xffcc33; // Bright orange-yellow
export const EXPLOSION_PARTICLE_SIZE = 0.12;
export const EXPLOSION_PARTICLE_LIFESPAN_MS = 800; // particles live for 0.8 seconds
export const EXPLOSION_PARTICLE_INITIAL_SPEED = 6; // units per second
export const EXPLOSION_PARTICLE_GRAVITY = -2.5; // slight downward pull
export const EXPLOSION_PARTICLE_DAMPING = 0.97; // velocity damping factor per frame


// Cluster Projectile
export const CLUSTER_PROJECTILE_RADIUS = 0.3;
export const CLUSTER_PROJECTILE_MASS = 15;
export const CLUSTER_PROJECTILE_COLOR = 0xadd8e6; // LightBlue
export const CLUSTER_SPLIT_DELAY_MS = 1000; // 1 second before splitting
export const SUBMUNITION_COUNT = 5;
export const SUBMUNITION_RADIUS = 0.15;
export const SUBMUNITION_MASS = 2;
export const SUBMUNITION_COLOR = 0x4682b4; // SteelBlue
export const SUBMUNITION_SPREAD_IMPULSE = 3; // Impulse strength for spreading submunitions
export const SUBMUNITION_LIFESPAN_MS = 5000; // Submunitions disappear after 5s

// --- Projectile Configuration for UI and Defaults ---
export const PROJECTILE_TYPES_CONFIG: ProjectileConfig[] = [
  {
    id: ProjectileType.STANDARD,
    name: '일반탄',
    description: '기본적인 만능 발사체입니다.',
    icon: '🎯',
    defaultCount: 5,
  },
  {
    id: ProjectileType.HEAVY,
    name: '중량탄',
    description: '묵직한 한 방! 블록을 직접 타격하는 데 효과적입니다.',
    icon: '🪨',
    defaultCount: 3,
  },
  {
    id: ProjectileType.EXPLOSIVE,
    name: '폭발탄',
    description: '충돌 시 폭발하여 주변에 피해를 줍니다.',
    icon: '💥',
    defaultCount: 2,
  },
  {
    id: ProjectileType.CLUSTER,
    name: '분열탄',
    description: '발사 후 여러 개의 작은 발사체로 분열됩니다.',
    icon: '✨',
    defaultCount: 2,
  },
];
