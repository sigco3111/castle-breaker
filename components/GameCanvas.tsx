
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import *                           as THREE from 'three';
import *                           as CANNON from 'cannon-es';
import { OrbitControls }           from 'three/examples/jsm/controls/OrbitControls.js';
import { PhysicsObject, LevelConfiguration, BlockConfig, BlockShape, ProjectileType, ExplosionParticleSystem } from '../types';
import { 
  PROJECTILE_RADIUS, PROJECTILE_MASS, PROJECTILE_VELOCITY_MULTIPLIER, 
  BLOCK_SIZE, BLOCK_MASS, MAX_CHARGE_DURATION_MS, MIN_LAUNCH_POWER, MAX_LAUNCH_POWER,
  STANDARD_PROJECTILE_COLOR,
  HEAVY_PROJECTILE_RADIUS, HEAVY_PROJECTILE_MASS, HEAVY_PROJECTILE_COLOR,
  EXPLOSIVE_PROJECTILE_RADIUS, EXPLOSIVE_PROJECTILE_MASS, EXPLOSIVE_PROJECTILE_COLOR, EXPLOSION_RADIUS, EXPLOSION_STRENGTH, EXPLOSIVE_PROJECTILE_LIFESPAN_MS,
  CLUSTER_PROJECTILE_RADIUS, CLUSTER_PROJECTILE_MASS, CLUSTER_PROJECTILE_COLOR, CLUSTER_SPLIT_DELAY_MS,
  SUBMUNITION_COUNT, SUBMUNITION_RADIUS, SUBMUNITION_MASS, SUBMUNITION_COLOR, SUBMUNITION_SPREAD_IMPULSE, SUBMUNITION_LIFESPAN_MS,
  EXPLOSION_PARTICLE_COUNT, EXPLOSION_PARTICLE_COLOR, EXPLOSION_PARTICLE_SIZE, EXPLOSION_PARTICLE_LIFESPAN_MS,
  EXPLOSION_PARTICLE_INITIAL_SPEED, EXPLOSION_PARTICLE_GRAVITY, EXPLOSION_PARTICLE_DAMPING
} from '../constants';

interface GameCanvasProps {
  onBlockFallen: (blockId: string, isKing: boolean) => void;
  initialLevelConfig: LevelConfiguration;
  canAttemptCharge: boolean;
  onChargeStart: () => void;
  onChargeProgress: (power: number) => void;
  onChargeComplete: (power: number) => void;
  isDelegateModeActive: boolean; 
}

export interface GameCanvasRef {
  launchProjectile: (launchPower: number, projectileType: ProjectileType) => void;
  resetLevel: (levelConfig: LevelConfiguration) => void;
  getGoldenBlockPosition: () => THREE.Vector3 | null;
  pointCameraTowards: (targetWorldPosition: THREE.Vector3) => void;
}

const GOLDEN_BLOCK_RENDER_COLOR = 0xffd700;
const DEFAULT_BLOCK_RENDER_COLOR = 0xaaaaaa;
const CYLINDER_SEGMENTS = 16; 
const SPHERE_SEGMENTS = 16;   

let sphereShapeTypeNumber: number = 1;


const GameCanvas = forwardRef<GameCanvasRef, GameCanvasProps>(({ 
  onBlockFallen, 
  initialLevelConfig, 
  canAttemptCharge,
  onChargeStart,
  onChargeProgress,
  onChargeComplete,
  isDelegateModeActive
}, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  const worldRef = useRef<CANNON.World | null>(null);
  const physicsObjectsRef = useRef<PhysicsObject[]>([]);
  const projectilesRef = useRef<PhysicsObject[]>([]);
  const explosionParticleSystemsRef = useRef<ExplosionParticleSystem[]>([]);

  const animationFrameIdRef = useRef<number | null>(null); 
  const chargeUpdateRafId = useRef<number | null>(null); 
  const lastCallTimeRef = useRef<number>(0);

  const onBlockFallenRef = useRef(onBlockFallen);
  useEffect(() => { onBlockFallenRef.current = onBlockFallen; }, [onBlockFallen]);

  const onChargeStartRef = useRef(onChargeStart);
  useEffect(() => { onChargeStartRef.current = onChargeStart; }, [onChargeStart]);
  const onChargeProgressRef = useRef(onChargeProgress);
  useEffect(() => { onChargeProgressRef.current = onChargeProgress; }, [onChargeProgress]);
  const onChargeCompleteRef = useRef(onChargeComplete);
  useEffect(() => { onChargeCompleteRef.current = onChargeComplete; }, [onChargeComplete]);
  
  const canAttemptChargeRef = useRef(canAttemptCharge);
  useEffect(() => { canAttemptChargeRef.current = canAttemptCharge; }, [canAttemptCharge]);

  const isDelegateModeActiveRef = useRef(isDelegateModeActive); 
  useEffect(() => { isDelegateModeActiveRef.current = isDelegateModeActive; }, [isDelegateModeActive]);


  const isDraggingCameraRef = useRef(false);
  const isChargingActiveRef = useRef(false);
  const chargeStartTimeRef = useRef(0);

  const cleanUpPhysicsObject = (obj: PhysicsObject, world: CANNON.World, scene: THREE.Scene) => {
    if (obj.body) {
        if (obj.projectileType === ProjectileType.EXPLOSIVE && obj.onCollideHandler) {
           obj.body.removeEventListener("collide", obj.onCollideHandler);
        }
        world.removeBody(obj.body);
    }
    if (obj.mesh) {
        scene.remove(obj.mesh);
        obj.mesh.geometry.dispose();
        if (obj.mesh.material) { 
          const material = obj.mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) {
            material.forEach(m => m.dispose());
          } else {
            material.dispose();
          }
        }
    }
  };

  const cleanUpExplosionParticleSystem = (system: ExplosionParticleSystem, scene: THREE.Scene) => {
    scene.remove(system.points);
    system.points.geometry.dispose();
    (system.points.material as THREE.Material).dispose();
  };
  
  const createBlockVisualAndPhysics = (blockConf: BlockConfig, scene: THREE.Scene, world: CANNON.World): PhysicsObject => {
    const shapeType: BlockShape = blockConf.shape || 'cube';
    let geometry: THREE.BufferGeometry;
    let cannonShape: CANNON.Shape;

    switch (shapeType) {
        case 'cylinder':
            geometry = new THREE.CylinderGeometry(BLOCK_SIZE / 2, BLOCK_SIZE / 2, BLOCK_SIZE, CYLINDER_SEGMENTS);
            cannonShape = new CANNON.Cylinder(BLOCK_SIZE / 2, BLOCK_SIZE / 2, BLOCK_SIZE, CYLINDER_SEGMENTS);
            break;
        case 'sphere':
            geometry = new THREE.SphereGeometry(BLOCK_SIZE / 2, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
            cannonShape = new CANNON.Sphere(BLOCK_SIZE / 2);
            break;
        case 'cube_2x1x1': 
            geometry = new THREE.BoxGeometry(BLOCK_SIZE * 2, BLOCK_SIZE, BLOCK_SIZE);
            cannonShape = new CANNON.Box(new CANNON.Vec3(BLOCK_SIZE, BLOCK_SIZE / 2, BLOCK_SIZE / 2)); 
            break;
        case 'cube_3x1x1': 
            geometry = new THREE.BoxGeometry(BLOCK_SIZE * 3, BLOCK_SIZE, BLOCK_SIZE);
            cannonShape = new CANNON.Box(new CANNON.Vec3(BLOCK_SIZE * 1.5, BLOCK_SIZE / 2, BLOCK_SIZE / 2)); 
            break;
        case 'cube':
        default:
            geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            cannonShape = new CANNON.Box(new CANNON.Vec3(BLOCK_SIZE / 2, BLOCK_SIZE / 2, BLOCK_SIZE / 2));
            break;
    }
    
    const blockColor = blockConf.isKing ? GOLDEN_BLOCK_RENDER_COLOR : (blockConf.color !== undefined ? blockConf.color : DEFAULT_BLOCK_RENDER_COLOR);
    const material = new THREE.MeshStandardMaterial({ 
      color: blockColor,
      metalness: blockConf.isKing ? 0.8 : 0.3,
      roughness: blockConf.isKing ? 0.2 : 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(blockConf.x, blockConf.y, blockConf.z); 
    scene.add(mesh);

    const body = new CANNON.Body({ mass: BLOCK_MASS, shape: cannonShape });
    body.position.set(blockConf.x, blockConf.y, blockConf.z); 
    world.addBody(body);
    
    return { 
        mesh, 
        body, 
        id: blockConf.id, 
        isKing: !!blockConf.isKing,
        initialY: blockConf.y, 
        isFallen: false 
    };
  };

  const createStructure = useCallback((levelConfig: LevelConfiguration) => {
    if (!worldRef.current || !sceneRef.current) return;
    
    physicsObjectsRef.current.forEach(obj => cleanUpPhysicsObject(obj, worldRef.current!, sceneRef.current!));
    physicsObjectsRef.current = [];

    levelConfig.structure.forEach((blockConf: BlockConfig) => {
      const physObj = createBlockVisualAndPhysics(blockConf, sceneRef.current!, worldRef.current!);
      physicsObjectsRef.current.push(physObj);
    });

    if (cameraRef.current && controlsRef.current) {
        if (levelConfig.cameraPosition) {
            cameraRef.current.position.set(levelConfig.cameraPosition.x, levelConfig.cameraPosition.y, levelConfig.cameraPosition.z);
        } else { 
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
            if (levelConfig.structure.length > 0) {
                 levelConfig.structure.forEach(b => {
                    let halfWidth = BLOCK_SIZE / 2; let halfDepth = BLOCK_SIZE / 2;
                    if (b.shape === 'cube_2x1x1') halfWidth = BLOCK_SIZE;
                    else if (b.shape === 'cube_3x1x1') halfWidth = BLOCK_SIZE * 1.5;
                    
                    minX = Math.min(minX, b.x - halfWidth); maxX = Math.max(maxX, b.x + halfWidth);
                    minY = Math.min(minY, b.y - BLOCK_SIZE/2); maxY = Math.max(maxY, b.y + BLOCK_SIZE/2); 
                    minZ = Math.min(minZ, b.z - halfDepth); maxZ = Math.max(maxZ, b.z + halfDepth);
                });
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const centerZ = (minZ + maxZ) / 2;
                const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, BLOCK_SIZE * 5) || BLOCK_SIZE * 5; 
                cameraRef.current.position.set(centerX, centerY + extent * 0.75, centerZ + extent * 1.5);
            } else {
                 cameraRef.current.position.set(0, BLOCK_SIZE * 2, BLOCK_SIZE * 5);
            }
        }
        if (levelConfig.cameraTarget) {
            controlsRef.current.target.set(levelConfig.cameraTarget.x, levelConfig.cameraTarget.y, levelConfig.cameraTarget.z);
        } else { 
            if (levelConfig.structure.length > 0) {
                 let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
                 levelConfig.structure.forEach(b => {
                    let halfWidth = BLOCK_SIZE / 2; let halfDepth = BLOCK_SIZE / 2;
                     if (b.shape === 'cube_2x1x1') halfWidth = BLOCK_SIZE;
                     else if (b.shape === 'cube_3x1x1') halfWidth = BLOCK_SIZE * 1.5;

                    minX = Math.min(minX, b.x - halfWidth); maxX = Math.max(maxX, b.x + halfWidth);
                    minY = Math.min(minY, b.y - BLOCK_SIZE/2); maxY = Math.max(maxY, b.y + BLOCK_SIZE/2);
                    minZ = Math.min(minZ, b.z - halfDepth); maxZ = Math.max(maxZ, b.z + halfDepth);
                });
                controlsRef.current.target.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
            } else {
                 controlsRef.current.target.set(0, BLOCK_SIZE, 0); 
            }
        }
        controlsRef.current.update();
    }
  }, []);

   const handleExplosion = useCallback((position: CANNON.Vec3, explosionRadius: number, explosionStrength: number) => {
    if (!worldRef.current || !sceneRef.current) return;

    const particlePositions: number[] = [];
    const particleVelocities: THREE.Vector3[] = [];
    const systemCreationTime = performance.now();

    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
        particlePositions.push(0, 0, 0); 

        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.sin(phi) * Math.sin(theta);
        const z = Math.cos(phi);
        
        const velocity = new THREE.Vector3(x, y, z);
        velocity.multiplyScalar(EXPLOSION_PARTICLE_INITIAL_SPEED * (0.75 + Math.random() * 0.5));
        particleVelocities.push(velocity);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
    
    const material = new THREE.PointsMaterial({
        color: EXPLOSION_PARTICLE_COLOR,
        size: EXPLOSION_PARTICLE_SIZE,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    points.position.copy(position as unknown as THREE.Vector3);
    sceneRef.current.add(points);

    explosionParticleSystemsRef.current.push({
        points,
        velocities: particleVelocities,
        creationTime: systemCreationTime,
    });

    physicsObjectsRef.current.forEach(obj => { 
      if (obj.body) {
        const distVec = new CANNON.Vec3();
        obj.body.position.vsub(position, distVec);
        const distance = distVec.length();

        if (distance < explosionRadius) {
          distVec.normalize();
          const strengthFactor = Math.max(0, (1 - (distance / explosionRadius)));
          const impulseMagnitude = explosionStrength * strengthFactor;
          distVec.scale(impulseMagnitude, distVec);
          obj.body.applyImpulse(distVec, obj.body.position);
          if (obj.body.sleepState === CANNON.Body.SLEEPING) {
            obj.body.wakeUp();
          }
        }
      }
    });
  }, []);


  const animate = useCallback(() => {
    animationFrameIdRef.current = requestAnimationFrame(animate);
    const currentTime = performance.now();
    let deltaTime = (currentTime - lastCallTimeRef.current) / 1000;
    lastCallTimeRef.current = currentTime;
    
    deltaTime = Math.max(0, Math.min(1/30, deltaTime));

    if (worldRef.current && sceneRef.current && rendererRef.current && cameraRef.current) {
      worldRef.current.step(1 / 60, deltaTime, 3);
      
      physicsObjectsRef.current.forEach(obj => {
        if (obj.mesh && obj.body) {
          obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
          obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);
          if (!obj.isFallen) {
            const currentCenterY = obj.body.position.y;
            const hasDroppedSignificantly = currentCenterY < (obj.initialY - BLOCK_SIZE * 0.375);
            const upVector = new CANNON.Vec3(0, 1, 0);
            const bodyUpDirection = obj.body.quaternion.vmult(upVector);
            const isSignificantlyTilted = bodyUpDirection.y < 0.5; 
            let isSphere = false;
            if (obj.body.shapes && obj.body.shapes.length > 0 && obj.body.shapes[0]) {
                isSphere = obj.body.shapes[0].type === sphereShapeTypeNumber;
            }
            if (hasDroppedSignificantly || (!isSphere && isSignificantlyTilted) ) {
              obj.isFallen = true;
              onBlockFallenRef.current(obj.id, !!obj.isKing);
            }
          }
        }
      });
      
      const projectilesToRemove: PhysicsObject[] = [];
      const newSubmunitions: PhysicsObject[] = [];

      projectilesRef.current.forEach(proj => {
        if (!proj.body || !worldRef.current || !sceneRef.current) {
            projectilesToRemove.push(proj);
            return;
        }
        if (proj.mesh) {
             proj.mesh.position.copy(proj.body.position as unknown as THREE.Vector3);
             proj.mesh.quaternion.copy(proj.body.quaternion as unknown as THREE.Quaternion);
        }

        let expired = false;
        if(proj.lifeSpan && proj.creationTime){
            if((currentTime - proj.creationTime) > proj.lifeSpan){
                expired = true;
            }
        }

        if (proj.projectileType === ProjectileType.EXPLOSIVE && !proj.hasSplit) {
            const shouldExplodeByTimeoutOrSleep = expired || proj.body.sleepState === CANNON.Body.SLEEPING;
            if (shouldExplodeByTimeoutOrSleep) {
                handleExplosion(proj.body.position.clone(), EXPLOSION_RADIUS, EXPLOSION_STRENGTH);
                proj.hasSplit = true; 
            }
        }
        else if (proj.projectileType === ProjectileType.CLUSTER && !proj.hasSplit && expired) {
          proj.hasSplit = true; 
          
          for (let i = 0; i < SUBMUNITION_COUNT; i++) {
            const submunitionGeometry = new THREE.SphereGeometry(SUBMUNITION_RADIUS, 8, 8);
            const submunitionMaterial = new THREE.MeshStandardMaterial({ color: SUBMUNITION_COLOR, metalness: 0.3, roughness: 0.7 });
            const submunitionMesh = new THREE.Mesh(submunitionGeometry, submunitionMaterial);
            submunitionMesh.castShadow = true;

            const submunitionShape = new CANNON.Sphere(SUBMUNITION_RADIUS);
            const submunitionBody = new CANNON.Body({ mass: SUBMUNITION_MASS, shape: submunitionShape });
            submunitionBody.linearDamping = 0.2;
            
            submunitionBody.position.copy(proj.body.position);
            submunitionMesh.position.copy(proj.body.position as unknown as THREE.Vector3);

            const spreadDir = new CANNON.Vec3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).unit();
            submunitionBody.velocity.copy(proj.body.velocity); 
            submunitionBody.applyImpulse(spreadDir.scale(SUBMUNITION_SPREAD_IMPULSE, spreadDir), submunitionBody.position);
            
            sceneRef.current.add(submunitionMesh);
            worldRef.current.addBody(submunitionBody);
            newSubmunitions.push({
              mesh: submunitionMesh, body: submunitionBody,
              id: `sub_${proj.id}_${i}`, initialY: submunitionBody.position.y, isFallen: false,
              projectileType: ProjectileType.STANDARD, 
              isSubmunition: true,
              lifeSpan: SUBMUNITION_LIFESPAN_MS,
              creationTime: currentTime,
            });
          }
        }

        let shouldRemove = false;
        if (proj.body.position.y < -10) {
            shouldRemove = true;
        } else if (proj.hasSplit) {
            shouldRemove = true;
        } else if (expired && proj.isSubmunition) {
            shouldRemove = true;
        } else if (proj.body.sleepState === CANNON.Body.SLEEPING && proj.body.velocity.lengthSquared() < 0.01) {
            if (!proj.projectileType || proj.isSubmunition) {
                shouldRemove = true;
            }
        }

        if (shouldRemove) {
            projectilesToRemove.push(proj);
        }
      });

      projectilesToRemove.forEach(p => cleanUpPhysicsObject(p, worldRef.current!, sceneRef.current!));
      projectilesRef.current = projectilesRef.current.filter(p => !projectilesToRemove.includes(p));
      if (newSubmunitions.length > 0) {
        projectilesRef.current.push(...newSubmunitions);
      }

      for (let i = explosionParticleSystemsRef.current.length - 1; i >= 0; i--) {
        const system = explosionParticleSystemsRef.current[i];
        const age = currentTime - system.creationTime;

        if (age > EXPLOSION_PARTICLE_LIFESPAN_MS) {
            cleanUpExplosionParticleSystem(system, sceneRef.current);
            explosionParticleSystemsRef.current.splice(i, 1);
            continue;
        }

        const lifeRatio = age / EXPLOSION_PARTICLE_LIFESPAN_MS;
        const material = system.points.material as THREE.PointsMaterial;
        material.opacity = Math.max(0, 1.0 - lifeRatio * 1.5);
        material.size = Math.max(0.01, EXPLOSION_PARTICLE_SIZE * (1.0 - lifeRatio * 0.75));

        const positions = system.points.geometry.attributes.position as THREE.BufferAttribute;
        for (let j = 0; j < system.velocities.length; j++) {
            const vel = system.velocities[j];
            positions.setX(j, positions.getX(j) + vel.x * deltaTime);
            positions.setY(j, positions.getY(j) + vel.y * deltaTime);
            positions.setZ(j, positions.getZ(j) + vel.z * deltaTime);
            
            vel.y += EXPLOSION_PARTICLE_GRAVITY * deltaTime;
            vel.multiplyScalar(EXPLOSION_PARTICLE_DAMPING);
        }
        positions.needsUpdate = true;
      }
      
      controlsRef.current?.update();
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [handleExplosion]); 

  const chargeUpdateLoop = useCallback(() => {
    if (!isChargingActiveRef.current) return;
    
    const elapsedTime = performance.now() - chargeStartTimeRef.current;
    let rawPower = elapsedTime / MAX_CHARGE_DURATION_MS; 

    let displayPower = rawPower % MAX_LAUNCH_POWER; 
    if (displayPower === 0 && rawPower > 0) {
        displayPower = MAX_LAUNCH_POWER;
    }
    
    onChargeProgressRef.current(displayPower);
    chargeUpdateRafId.current = requestAnimationFrame(chargeUpdateLoop);
  }, []);

  const startCharge = useCallback(() => {
    if (chargeUpdateRafId.current) cancelAnimationFrame(chargeUpdateRafId.current);
    chargeUpdateRafId.current = requestAnimationFrame(chargeUpdateLoop);
  }, [chargeUpdateLoop]);

  const stopCharge = useCallback(() => {
    if (chargeUpdateRafId.current) {
      cancelAnimationFrame(chargeUpdateRafId.current);
      chargeUpdateRafId.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent) => {
    if (event.button !== 0) return; 
    if (!canAttemptChargeRef.current || isDraggingCameraRef.current || isChargingActiveRef.current || isDelegateModeActiveRef.current) {
      return;
    }
     if (mountRef.current && rendererRef.current && (event.target === rendererRef.current.domElement || mountRef.current.contains(event.target as Node))) {
        isChargingActiveRef.current = true;
        chargeStartTimeRef.current = performance.now();
        onChargeStartRef.current();
        startCharge();
        
        window.addEventListener('pointerup', handlePointerUpGlobal);
        window.addEventListener('pointercancel', handlePointerUpGlobal);
     }
  }, [startCharge]); 

  const handlePointerUpGlobal = useCallback((event: PointerEvent) => {
    if (!isChargingActiveRef.current) {
      window.removeEventListener('pointerup', handlePointerUpGlobal);
      window.removeEventListener('pointercancel', handlePointerUpGlobal);
      return;
    }
    
    stopCharge();
    const elapsedTime = performance.now() - chargeStartTimeRef.current;
    let rawFinalPower = elapsedTime / MAX_CHARGE_DURATION_MS; 
    
    let effectiveFinalPower = rawFinalPower % MAX_LAUNCH_POWER;
    if (effectiveFinalPower === 0 && rawFinalPower > 0) {
        effectiveFinalPower = MAX_LAUNCH_POWER;
    }

    const finalLaunchPower = Math.max(MIN_LAUNCH_POWER, effectiveFinalPower); 
    
    onChargeCompleteRef.current(finalLaunchPower);
    
    isChargingActiveRef.current = false;
    
    window.removeEventListener('pointerup', handlePointerUpGlobal);
    window.removeEventListener('pointercancel', handlePointerUpGlobal);

  }, [stopCharge]);


  const init = useCallback((levelConfig: LevelConfiguration) => {
    if (!mountRef.current) return;
    const currentMountRef = mountRef.current; 

    if (CANNON && CANNON.Sphere) {
        try {
            const tempSphere = new CANNON.Sphere(0.1); 
            sphereShapeTypeNumber = tempSphere.type; 
        } catch (e) {
            console.warn("Failed to determine sphere shape type. Using default (1).", e);
            sphereShapeTypeNumber = 1;
        }
    } else {
        sphereShapeTypeNumber = 1; 
    }

    sceneRef.current = new THREE.Scene();
    sceneRef.current.background = new THREE.Color(0x2d3748);
    cameraRef.current = new THREE.PerspectiveCamera(75, currentMountRef.clientWidth / currentMountRef.clientHeight, 0.1, 1000);
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current.setSize(currentMountRef.clientWidth, currentMountRef.clientHeight);
    rendererRef.current.shadowMap.enabled = true;
    rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
    currentMountRef.appendChild(rendererRef.current.domElement);

    const controls = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controlsRef.current = controls;
    controls.mouseButtons = { MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = BLOCK_SIZE * 2;
    controls.maxDistance = BLOCK_SIZE * 20;

    const onControlsStart = () => { isDraggingCameraRef.current = true; };
    const onControlsEnd = () => { setTimeout(() => { isDraggingCameraRef.current = false; }, 50); };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('end', onControlsEnd);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    sceneRef.current.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048; directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5; directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -15; directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15; directionalLight.shadow.camera.bottom = -15;
    sceneRef.current.add(directionalLight);

    worldRef.current = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    worldRef.current.broadphase = new CANNON.SAPBroadphase(worldRef.current);
    (worldRef.current.solver as CANNON.GSSolver).iterations = 10;

    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.8, metalness: 0.2 });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    sceneRef.current.add(groundMesh);
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, shape: groundShape });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); 
    worldRef.current.addBody(groundBody);

    createStructure(levelConfig); 
    
    const handleResize = () => {
        if (cameraRef.current && rendererRef.current && currentMountRef && currentMountRef.clientWidth > 0 && currentMountRef.clientHeight > 0) {
            cameraRef.current.aspect = currentMountRef.clientWidth / currentMountRef.clientHeight;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(currentMountRef.clientWidth, currentMountRef.clientHeight);
        }
    };
    window.addEventListener('resize', handleResize);
    currentMountRef.addEventListener('pointerdown', handlePointerDown);

    lastCallTimeRef.current = performance.now();
    animate();

    return () => {
        window.removeEventListener('resize', handleResize);
        currentMountRef?.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointerup', handlePointerUpGlobal);
        window.removeEventListener('pointercancel', handlePointerUpGlobal);

        stopCharge(); 
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current); 
        
        controls.removeEventListener('start', onControlsStart);
        controls.removeEventListener('end', onControlsEnd);
        
        projectilesRef.current.forEach(obj => cleanUpPhysicsObject(obj, worldRef.current!, sceneRef.current!));
        projectilesRef.current = [];
        physicsObjectsRef.current.forEach(obj => cleanUpPhysicsObject(obj, worldRef.current!, sceneRef.current!));
        physicsObjectsRef.current = [];
        explosionParticleSystemsRef.current.forEach(system => cleanUpExplosionParticleSystem(system, sceneRef.current!));
        explosionParticleSystemsRef.current = [];


        if(rendererRef.current && currentMountRef?.contains(rendererRef.current.domElement)) {
          currentMountRef?.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current?.dispose();
        controlsRef.current?.dispose();

        sceneRef.current?.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
            object.geometry?.dispose();
             const material = object.material as THREE.Material | THREE.Material[];
            if(Array.isArray(material)) material.forEach(m => m.dispose()); else material.dispose();
          }
        });
        sceneRef.current = null;
        worldRef.current = null; 
    };
  }, [createStructure, animate, handlePointerDown, handlePointerUpGlobal, stopCharge]); 

  useEffect(() => {
    const cleanup = init(initialLevelConfig); 
    return cleanup;
  }, [initialLevelConfig, init]);

  const launchProjectile = useCallback((launchPower: number, projectileType: ProjectileType) => {
    if (!worldRef.current || !sceneRef.current || !cameraRef.current) return;

    let radius, mass, color, lifeSpan;
    switch (projectileType) {
      case ProjectileType.HEAVY:
        radius = HEAVY_PROJECTILE_RADIUS; mass = HEAVY_PROJECTILE_MASS; color = HEAVY_PROJECTILE_COLOR;
        break;
      case ProjectileType.EXPLOSIVE:
        radius = EXPLOSIVE_PROJECTILE_RADIUS; mass = EXPLOSIVE_PROJECTILE_MASS; color = EXPLOSIVE_PROJECTILE_COLOR;
        lifeSpan = EXPLOSIVE_PROJECTILE_LIFESPAN_MS;
        break;
      case ProjectileType.CLUSTER:
        radius = CLUSTER_PROJECTILE_RADIUS; mass = CLUSTER_PROJECTILE_MASS; color = CLUSTER_PROJECTILE_COLOR;
        lifeSpan = CLUSTER_SPLIT_DELAY_MS;
        break;
      case ProjectileType.STANDARD:
      default:
        radius = PROJECTILE_RADIUS; mass = PROJECTILE_MASS; color = STANDARD_PROJECTILE_COLOR;
        break;
    }

    const projectileGeometry = new THREE.SphereGeometry(radius, 16, 16);
    const projectileMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.5 });
    const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectileMesh.castShadow = true;
    
    const projectileBody = new CANNON.Body({ mass, shape: new CANNON.Sphere(radius) });
    projectileBody.linearDamping = 0.1; 

    const camPos = cameraRef.current.position;
    const camDir = new THREE.Vector3();
    cameraRef.current.getWorldDirection(camDir);

    const launchOffset = radius + 0.5 + BLOCK_SIZE / 2;
    projectileBody.position.set(
        camPos.x + camDir.x * launchOffset, 
        camPos.y + camDir.y * launchOffset,
        camPos.z + camDir.z * launchOffset
    );
    projectileMesh.position.copy(projectileBody.position as unknown as THREE.Vector3);

    const finalVelocity = PROJECTILE_VELOCITY_MULTIPLIER * launchPower;
    const velocityVec = new CANNON.Vec3(camDir.x * finalVelocity, camDir.y * finalVelocity, camDir.z * finalVelocity);
    projectileBody.velocity.copy(velocityVec);

    sceneRef.current.add(projectileMesh);
    worldRef.current.addBody(projectileBody);
    
    const projectileObject: PhysicsObject = { 
        mesh: projectileMesh, body: projectileBody, 
        id: `proj_${projectileType}_${Date.now()}_${Math.random()}`, 
        initialY: projectileBody.position.y, isFallen: false,
        projectileType,
        lifeSpan: lifeSpan, 
        creationTime: performance.now(),
        hasSplit: false,
    };

    if (projectileType === ProjectileType.EXPLOSIVE) {
        const bodyRef = projectileBody; 
        const onCollideExplosive = (event: any) => {
            if (projectileObject.hasSplit) { 
                bodyRef.removeEventListener("collide", onCollideExplosive);
                return;
            }

            if (!event.contact || !event.contact.bi || !event.contact.bj) {
                return;
            }
            
            const otherBody = event.contact.bi === bodyRef ? event.contact.bj : event.contact.bi;
            const isBlock = physicsObjectsRef.current.some(pObj => pObj.body === otherBody);

            if (isBlock && Math.abs(event.contact.getImpactVelocityAlongNormal()) > 1.0) {
                if (!projectileObject.hasSplit) { 
                    handleExplosion(bodyRef.position.clone(), EXPLOSION_RADIUS, EXPLOSION_STRENGTH);
                    projectileObject.hasSplit = true; 
                    bodyRef.removeEventListener("collide", onCollideExplosive); 
                }
            }
        };
        projectileBody.addEventListener("collide", onCollideExplosive);
        projectileObject.onCollideHandler = onCollideExplosive; 
    }

    projectilesRef.current.push(projectileObject);

  }, [handleExplosion]);

  const resetLevel = useCallback((levelConfig: LevelConfiguration) => {
    if (!worldRef.current || !sceneRef.current) return;
    
    projectilesRef.current.forEach(obj => cleanUpPhysicsObject(obj, worldRef.current!, sceneRef.current!));
    projectilesRef.current = [];
    explosionParticleSystemsRef.current.forEach(system => cleanUpExplosionParticleSystem(system, sceneRef.current!));
    explosionParticleSystemsRef.current = [];
    createStructure(levelConfig); 
    lastCallTimeRef.current = performance.now();
  }, [createStructure]);


  const getGoldenBlockPosition = useCallback((): THREE.Vector3 | null => {
    const goldenBlock = physicsObjectsRef.current.find(obj => obj.isKing && !obj.isFallen && obj.body);
    if (goldenBlock && goldenBlock.body) {
      return new THREE.Vector3(goldenBlock.body.position.x, goldenBlock.body.position.y, goldenBlock.body.position.z);
    }
    return null;
  }, []);

  const pointCameraTowards = useCallback((targetWorldPosition: THREE.Vector3) => {
    if (cameraRef.current && controlsRef.current) {
      // Ensure camera is not too close to the target for lookAt to work well
      const camPos = cameraRef.current.position.clone();
      if (camPos.distanceTo(targetWorldPosition) < 0.1) {
        // If too close, move camera back slightly along its current view vector before looking
        const viewDir = new THREE.Vector3();
        cameraRef.current.getWorldDirection(viewDir);
        camPos.sub(viewDir.multiplyScalar(BLOCK_SIZE * 2)); // Move back
        cameraRef.current.position.copy(camPos);
      }
      
      cameraRef.current.lookAt(targetWorldPosition);
      controlsRef.current.target.copy(targetWorldPosition);
      controlsRef.current.update(); // Update controls to reflect the new target and camera orientation
    }
  }, []);


  useImperativeHandle(ref, () => ({
    launchProjectile,
    resetLevel,
    getGoldenBlockPosition,
    pointCameraTowards,
  }));

  return <div ref={mountRef} className="w-full h-full" />;
});

export default GameCanvas;
