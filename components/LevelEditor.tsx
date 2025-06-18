
import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LevelConfiguration, BlockConfig, BlockShape } from '../types';
import { BLOCK_SIZE } from '../constants';
import { generateLevelWithGemini, getGeminiStatus, initializeAiClient } from '../lib/geminiService';

interface LevelEditorProps {
  onSave: (levelConfig: LevelConfiguration, originalLevelId?: string | number) => void;
  onExit: () => void;
  initialLevelData?: LevelConfiguration | null;
}

const GOLDEN_BLOCK_COLOR = 0xffd700; // Gold - for the target 'Golden Block'
const DEFAULT_BLOCK_COLOR = 0xaaaaaa;
const CYLINDER_SEGMENTS = 16;
const SPHERE_SEGMENTS = 16;

const LOCAL_STORAGE_API_KEY_ID = 'dominoCastleGeminiApiKey';

const editorColors = [
  { name: 'Green', value: 0x4ade80 }, // green-400
  { name: 'Brown', value: 0x854d0e }, // amber-800
  { name: 'Gray', value: 0x6b7280 }, // gray-500
  { name: 'Blue', value: 0x3b82f6 }, // blue-500 (highlighted in image)
  { name: 'Yellow', value: 0xfacc15 }, // yellow-400
  { name: 'Light Gray', value: 0xd1d5db }, // gray-300
  { name: 'Red', value: 0xef4444 }, // red-500
  { name: '골드 (황금)', value: GOLDEN_BLOCK_COLOR }, // Special Golden block
];

const editorShapes: { name: string, type: BlockShape, label: string }[] = [
    { name: 'Cube', type: 'cube', label: '큐브 (1x1)' },
    { name: 'Cylinder', type: 'cylinder', label: '원기둥' },
    { name: 'Sphere', type: 'sphere', label: '구' },
    { name: 'Cube 2x1', type: 'cube_2x1x1', label: '큐브 (2x1)' },
    { name: 'Cube 3x1', type: 'cube_3x1x1', label: '큐브 (3x1)' },
];


const LevelEditor: React.FC<LevelEditorProps> = ({ onSave, onExit, initialLevelData }) => {
  const [levelName, setLevelName] = useState('커스텀 레벨');
  const [initialProjectiles, setInitialProjectiles] = useState(10);
  const [structure, setStructure] = useState<BlockConfig[]>([]);
  const [editingLevelId, setEditingLevelId] = useState<string | number | null>(null);
  
  const [selectedColorValue, setSelectedColorValue] = useState<number>(editorColors[3].value); 
  const [selectedShape, setSelectedShape] = useState<BlockShape>(editorShapes[0].type);
  const [isDraggingCamera, setIsDraggingCamera] = useState(false);

  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null);

  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [apiKeyMessage, setApiKeyMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [geminiApiStatus, setGeminiApiStatus] = useState({ isActive: false, message: '확인 중...' });


  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  const planeMeshRef = useRef<THREE.Mesh | null>(null); 
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const ghostBlockMeshRef = useRef<THREE.Mesh | null>(null);
  const placedBlocksGroupRef = useRef<THREE.Group>(new THREE.Group());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const animationFrameIdRef = useRef<number | null>(null);
  const initialSetupRafId = useRef<number | null>(null);


  const editorGridSize = 30; 
  const placementYOffset = BLOCK_SIZE / 2; 

  const updateGeminiApiStatus = useCallback(() => {
    const status = getGeminiStatus();
    setGeminiApiStatus(status);
  }, []);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
        const storedApiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY_ID);
        if (storedApiKey) {
            setApiKeyInput(storedApiKey);
        }
    }
    updateGeminiApiStatus();
  }, [updateGeminiApiStatus]);

  useEffect(() => {
    if (apiKeyMessage) {
        const timer = setTimeout(() => setApiKeyMessage(null), 3000);
        return () => clearTimeout(timer);
    }
  }, [apiKeyMessage]);

  useEffect(() => {
    if (editorMessage) {
      const timer = setTimeout(() => {
        setEditorMessage(null);
        setMessageType(null);
      }, 5000); 
      return () => clearTimeout(timer);
    }
  }, [editorMessage]);

  const createBlockGeometry = (shape: BlockShape = 'cube'): THREE.BufferGeometry => {
    switch (shape) {
      case 'cylinder':
        return new THREE.CylinderGeometry(BLOCK_SIZE / 2, BLOCK_SIZE / 2, BLOCK_SIZE, CYLINDER_SEGMENTS);
      case 'sphere':
        return new THREE.SphereGeometry(BLOCK_SIZE / 2, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
      case 'cube_2x1x1':
        return new THREE.BoxGeometry(BLOCK_SIZE * 2, BLOCK_SIZE, BLOCK_SIZE);
      case 'cube_3x1x1':
        return new THREE.BoxGeometry(BLOCK_SIZE * 3, BLOCK_SIZE, BLOCK_SIZE);
      case 'cube':
      default:
        return new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    }
  };
  
  const centerCameraOnStructure = useCallback((struct: BlockConfig[], animateTransition: boolean = false) => {
    if (!cameraRef.current || !controlsRef.current) return;

    if (struct.length === 0) {
        cameraRef.current.position.set(BLOCK_SIZE * 8, BLOCK_SIZE * 8, BLOCK_SIZE * 8);
        controlsRef.current.target.set(0,0,0);
        controlsRef.current.update();
        return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    struct.forEach(b => {
        let halfWidth = BLOCK_SIZE / 2;
        let halfDepth = BLOCK_SIZE / 2;
        if (b.shape === 'cube_2x1x1') halfWidth = BLOCK_SIZE;
        else if (b.shape === 'cube_3x1x1') halfWidth = BLOCK_SIZE * 1.5;
        
        minX = Math.min(minX, b.x - halfWidth); 
        maxX = Math.max(maxX, b.x + halfWidth);
        minY = Math.min(minY, b.y - BLOCK_SIZE / 2); 
        maxY = Math.max(maxY, b.y + BLOCK_SIZE / 2);
        minZ = Math.min(minZ, b.z - halfDepth);
        maxZ = Math.max(maxZ, b.z + halfDepth);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2; 
    const centerZ = (minZ + maxZ) / 2;
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, BLOCK_SIZE * 5) || BLOCK_SIZE * 5;

    const newCamPos = new THREE.Vector3(centerX, centerY + extent * 0.75, centerZ + extent * 1.5);
    const newTargetPos = new THREE.Vector3(centerX, centerY, centerZ);

    if (animateTransition) {
        const startCamPos = cameraRef.current.position.clone();
        const startTargetPos = controlsRef.current.target.clone();
        let t = 0;
        const duration = 0.5; 
        const animateCam = () => {
            t += 1/60 / duration; 
            if (t < 1) {
                cameraRef.current!.position.lerpVectors(startCamPos, newCamPos, t);
                controlsRef.current!.target.lerpVectors(startTargetPos, newTargetPos, t);
                controlsRef.current!.update();
                requestAnimationFrame(animateCam);
            } else {
                cameraRef.current!.position.copy(newCamPos);
                controlsRef.current!.target.copy(newTargetPos);
                controlsRef.current!.update();
            }
        };
        animateCam();
    } else {
        cameraRef.current.position.copy(newCamPos);
        controlsRef.current.target.copy(newTargetPos);
        controlsRef.current.update();
    }
  }, []);

  useEffect(() => {
    if (initialLevelData) {
      setLevelName(initialLevelData.name);
      setInitialProjectiles(initialLevelData.initialProjectiles);
      setStructure(initialLevelData.structure); 
      setEditingLevelId(initialLevelData.levelId);
      setAiPrompt('');
      centerCameraOnStructure(initialLevelData.structure, true);
    } else {
      setLevelName('커스텀 레벨');
      setInitialProjectiles(10);
      setStructure([]);
      setEditingLevelId(null);
      setSelectedColorValue(editorColors[3].value);
      setSelectedShape(editorShapes[0].type);
      setAiPrompt('');
      centerCameraOnStructure([], false);
    }
  }, [initialLevelData, centerCameraOnStructure]);


  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a202c); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, mountRef.current.clientWidth / (mountRef.current.clientHeight || 1), 0.1, 2000);
    camera.position.set(BLOCK_SIZE * 8, BLOCK_SIZE * 8, BLOCK_SIZE * 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true; 
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);


    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true; 
    controls.minDistance = BLOCK_SIZE * 2;
    controls.maxDistance = BLOCK_SIZE * 50;
    controls.mouseButtons = { MIDDLE: THREE.MOUSE.ROTATE }; 
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(15, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);
    
    const groundGeometry = new THREE.PlaneGeometry(editorGridSize * BLOCK_SIZE, editorGridSize * BLOCK_SIZE);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.9, metalness:0.1}); 
    const visualGroundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    visualGroundMesh.rotation.x = -Math.PI / 2;
    visualGroundMesh.receiveShadow = true;
    scene.add(visualGroundMesh);

    const rcPlaneGeometry = new THREE.PlaneGeometry(editorGridSize * BLOCK_SIZE, editorGridSize * BLOCK_SIZE);
    const rcPlaneMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const rcPlaneMesh = new THREE.Mesh(rcPlaneGeometry, rcPlaneMaterial);
    rcPlaneMesh.rotation.x = -Math.PI / 2;
    rcPlaneMesh.position.y = 0; 
    scene.add(rcPlaneMesh);
    planeMeshRef.current = rcPlaneMesh;

    const gridHelper = new THREE.GridHelper(editorGridSize * BLOCK_SIZE, editorGridSize, 0x4a5568, 0x3a4a58); 
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;
    
    const ghostMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 });
    const ghostBlock = new THREE.Mesh(createBlockGeometry(selectedShape), ghostMaterial);
    ghostBlock.visible = false;
    scene.add(ghostBlock);
    ghostBlockMeshRef.current = ghostBlock;

    scene.add(placedBlocksGroupRef.current);

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      controlsRef.current?.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    const handleResize = () => {
        if (cameraRef.current && rendererRef.current && mountRef.current && mountRef.current.clientWidth > 0 && mountRef.current.clientHeight > 0) {
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight;
            cameraRef.current.aspect = width / height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(width, height);
        } else if (rendererRef.current) {
            rendererRef.current.setSize(1,1); // Fallback for zero dimensions
        }
    };
    window.addEventListener('resize', handleResize);

    const startInitProcess = () => {
        handleResize(); // Initial resize
        animate();      // Start animation loop
    };
    
    initialSetupRafId.current = requestAnimationFrame(startInitProcess);


    const handleControlsStart = () => setIsDraggingCamera(true);
    const handleControlsEnd = () => setIsDraggingCamera(false);
    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('end', handleControlsEnd);

    return () => {
      if(initialSetupRafId.current) cancelAnimationFrame(initialSetupRafId.current);
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('end', handleControlsEnd);
      controlsRef.current?.dispose();
      
      rendererRef.current?.dispose();
      if (rendererRef.current?.domElement && mountRef.current?.contains(rendererRef.current.domElement)) {
        mountRef.current?.removeChild(rendererRef.current.domElement);
      }
      sceneRef.current?.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const material = child.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else material.dispose();
        }
      });
      sceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
    if (ghostBlockMeshRef.current) {
      ghostBlockMeshRef.current.geometry.dispose();
      ghostBlockMeshRef.current.geometry = createBlockGeometry(selectedShape);
    }
  }, [selectedShape]);

  useEffect(() => {
    if (ghostBlockMeshRef.current) {
        const ghostColor = selectedColorValue === GOLDEN_BLOCK_COLOR ? 0xffd700 : selectedColorValue; 
        (ghostBlockMeshRef.current.material as THREE.MeshBasicMaterial).color.setHex(ghostColor);
    }
  }, [selectedColorValue]);


  useEffect(() => {
    if (!placedBlocksGroupRef.current) return;
    
    while (placedBlocksGroupRef.current.children.length) {
      const child = placedBlocksGroupRef.current.children[0] as THREE.Mesh;
      placedBlocksGroupRef.current.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    structure.forEach(block => {
      const geometry = createBlockGeometry(block.shape);
      const colorToUse = block.isKing ? GOLDEN_BLOCK_COLOR : (block.color || DEFAULT_BLOCK_COLOR);
      const material = new THREE.MeshStandardMaterial({
        color: colorToUse,
        metalness: block.isKing ? 0.8 : 0.3,
        roughness: block.isKing ? 0.2 : 0.5,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(block.x, block.y, block.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { id: block.id, isEditorBlock: true };
      placedBlocksGroupRef.current.add(mesh);
    });
  }, [structure]);


  const getCanvasRelativeOffset = (event: React.MouseEvent<HTMLDivElement>) => {
    const canvas = mountRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !ghostBlockMeshRef.current || isDraggingCamera || isAiGenerating) {
      if (ghostBlockMeshRef.current) ghostBlockMeshRef.current.visible = false;
      return;
    }
    
    const offset = getCanvasRelativeOffset(event);
    mouseRef.current.x = (offset.x / mountRef.current.clientWidth) * 2 - 1;
    mouseRef.current.y = -(offset.y / mountRef.current.clientHeight) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const intersectsPlaced = raycasterRef.current.intersectObjects(placedBlocksGroupRef.current.children, false);
    let newGhostYPosition = placementYOffset; 

    if (intersectsPlaced.length > 0) {
        const intersect = intersectsPlaced[0];
        const hitBlockMesh = intersect.object as THREE.Mesh;
        
        newGhostYPosition = hitBlockMesh.position.y + BLOCK_SIZE; 
        
        ghostBlockMeshRef.current.position.set(
            hitBlockMesh.position.x, 
            newGhostYPosition,
            hitBlockMesh.position.z  
        );
        ghostBlockMeshRef.current.visible = true;

    } else {
        if (!planeMeshRef.current) {
             if (ghostBlockMeshRef.current) ghostBlockMeshRef.current.visible = false;
             return;
        }
        const intersectsPlane = raycasterRef.current.intersectObject(planeMeshRef.current);
        if (intersectsPlane.length > 0) {
            const intersectPoint = intersectsPlane[0].point;
            const snappedX = Math.round(intersectPoint.x / BLOCK_SIZE) * BLOCK_SIZE;
            const snappedZ = Math.round(intersectPoint.z / BLOCK_SIZE) * BLOCK_SIZE;
            
            let halfWidth = BLOCK_SIZE / 2;
            if (selectedShape === 'cube_2x1x1') halfWidth = BLOCK_SIZE; 
            else if (selectedShape === 'cube_3x1x1') halfWidth = BLOCK_SIZE * 1.5; 
            
            const halfGridWorldSize = (editorGridSize / 2) * BLOCK_SIZE;
            if ( (snappedX - halfWidth) < -halfGridWorldSize || (snappedX + halfWidth) > halfGridWorldSize ||
                 (snappedZ - (BLOCK_SIZE/2)) < -halfGridWorldSize || (snappedZ + (BLOCK_SIZE/2)) > halfGridWorldSize) { 
                ghostBlockMeshRef.current.visible = false;
            } else {
                ghostBlockMeshRef.current.position.set(snappedX, newGhostYPosition, snappedZ);
                ghostBlockMeshRef.current.visible = true;
            }
        } else {
            ghostBlockMeshRef.current.visible = false;
        }
    }
  };
  
  const handleMouseClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!ghostBlockMeshRef.current?.visible || isDraggingCamera || isAiGenerating) return;
    setEditorMessage(null); setMessageType(null);
    
    const pos = ghostBlockMeshRef.current.position;
    const existingBlock = structure.find(b => 
      Math.abs(b.x - pos.x) < 0.01 && 
      Math.abs(b.y - pos.y) < 0.01 && 
      Math.abs(b.z - pos.z) < 0.01
    );

    if (event.button === 0) { // Left click
      if (!existingBlock) {
        const isGoldenBlock = selectedColorValue === GOLDEN_BLOCK_COLOR;
        const newBlock: BlockConfig = {
          id: `custom_block_${Date.now()}_${structure.length}`,
          x: pos.x, y: pos.y, z: pos.z,
          shape: selectedShape,
          isKing: isGoldenBlock, // isKing flag for the golden block
          color: isGoldenBlock ? undefined : selectedColorValue, 
        };
        if (isGoldenBlock) { 
          setStructure(prev => [...prev.map(b => ({...b, isKing: false})), newBlock]);
        } else {
          setStructure(prev => [...prev, newBlock]);
        }
      } else {
        setEditorMessage("이미 해당 위치에 블록이 있습니다."); setMessageType('error');
      }
    } else if (event.button === 2) { // Right click
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!); 
        const intersectsPlaced = raycasterRef.current.intersectObjects(placedBlocksGroupRef.current.children);
        if (intersectsPlaced.length > 0) {
            const clickedObject = intersectsPlaced[0].object as THREE.Mesh;
            if (clickedObject.userData.isEditorBlock) {
                const blockId = clickedObject.userData.id;
                setStructure(prev => prev.filter(b => b.id !== blockId));
            }
        }
    }
  };

  const validateAndGetLevelConfig = (): LevelConfiguration | null => {
    const finalLevelName = levelName.trim();
    if (!finalLevelName) {
      setEditorMessage("레벨 이름을 입력해야 합니다."); setMessageType('error'); return null;
    }
    if (initialProjectiles < 1) {
      setEditorMessage("초기 발사체는 1개 이상이어야 합니다."); setMessageType('error'); setInitialProjectiles(1); return null;
    }
    if (structure.length === 0) {
      setEditorMessage("하나 이상의 블록이 구조물에 포함되어야 합니다."); setMessageType('error'); return null;
    }
    const goldenBlocks = structure.filter(b => b.isKing);
    if (goldenBlocks.length === 0) {
      setEditorMessage("구조물에는 반드시 하나의 황금 블록이 포함되어야 합니다."); setMessageType('error'); return null;
    }
    if (goldenBlocks.length > 1) {
      setEditorMessage("구조물에는 하나의 황금 블록만 포함될 수 있습니다. 현재 " + goldenBlocks.length + "개 입니다."); setMessageType('error'); return null;
    }

    let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity, minZ = -Infinity, maxZ = Infinity;
    
    if (structure.length > 0) {
        minX = Infinity; maxX = -Infinity;
        minY = Infinity; maxY = -Infinity;
        minZ = Infinity; maxZ = -Infinity;

        structure.forEach(b => {
            let halfWidth = BLOCK_SIZE / 2; let halfDepth = BLOCK_SIZE / 2;
            if (b.shape === 'cube_2x1x1') halfWidth = BLOCK_SIZE; 
            else if (b.shape === 'cube_3x1x1') halfWidth = BLOCK_SIZE * 1.5;
            
            minX = Math.min(minX, b.x - halfWidth); maxX = Math.max(maxX, b.x + halfWidth);
            minY = Math.min(minY, b.y - BLOCK_SIZE / 2); maxY = Math.max(maxY, b.y + BLOCK_SIZE / 2);
            minZ = Math.min(minZ, b.z - halfDepth); maxZ = Math.max(maxZ, b.z + halfDepth);
        });
    } else { 
        minX = 0; maxX = 0; minY = 0; maxY = 0; minZ = 0; maxZ = 0;
    }

    const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2; const centerZ = (minZ + maxZ) / 2;
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, BLOCK_SIZE * 5) || BLOCK_SIZE * 5;

    return {
      levelId: editingLevelId || `custom_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
      name: finalLevelName,
      initialProjectiles: initialProjectiles,
      structure, 
      cameraPosition: { x: centerX, y: centerY + extent * 0.75, z: centerZ + extent * 1.5 },
      cameraTarget: { x: centerX, y: centerY, z: centerZ },
      gameMessage: `커스텀 레벨: ${finalLevelName}. 황금 블록을 무너뜨리세요!`
    };
  };

  const handleSaveLevel = () => {
    const newLevel = validateAndGetLevelConfig();
    if (newLevel) {
      onSave(newLevel, editingLevelId); 
    }
  };

  const handleExportLevel = () => {
    const levelToExport = validateAndGetLevelConfig();
    if (levelToExport) {
      try {
        const jsonString = JSON.stringify(levelToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        const cleanLevelName = levelToExport.name.replace(/[^a-z0-9_.-]/gi, '_');
        link.download = `${cleanLevelName || 'custom_level'}.json`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(href);
        setEditorMessage("레벨을 내보냈습니다!"); setMessageType('success');
      } catch (error) {
        console.error("Error exporting level:", error);
        setEditorMessage("레벨을 내보내는 중 오류가 발생했습니다."); setMessageType('error');
      }
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedLevel = JSON.parse(e.target?.result as string) as LevelConfiguration;
          if (importedLevel?.name && Array.isArray(importedLevel.structure) && typeof importedLevel.initialProjectiles === 'number') {
            setLevelName(importedLevel.name);
            setInitialProjectiles(Math.max(1, importedLevel.initialProjectiles));
            const validatedStructure = importedLevel.structure.map((block, index) => ({
                ...block,
                id: block.id || `imported_block_${Date.now()}_${index}`,
                shape: block.shape || 'cube', 
                color: typeof block.color === 'string' ? parseInt(block.color, 16) : block.color
            }));
            setStructure(validatedStructure);
            setEditingLevelId(importedLevel.levelId || null); 
            centerCameraOnStructure(validatedStructure, true);
            setEditorMessage("레벨을 가져왔습니다! 필요시 '저장'하여 라이브러리에 추가/업데이트 하세요."); setMessageType('success');
          } else {
            setEditorMessage("잘못된 레벨 파일 형식입니다."); setMessageType('error');
          }
        } catch (error) {
          console.error("Error importing level:", error);
          setEditorMessage("레벨 파일을 가져오는 중 오류가 발생했습니다."); setMessageType('error');
        }
      };
      reader.readAsText(file);
      event.target.value = ''; 
    }
  };

  const handleAiGenerateLevel = async () => {
    setIsAiGenerating(true);
    setEditorMessage("AI가 레벨을 생성 중입니다... 잠시 기다려 주세요.");
    setMessageType(null); 

    try {
      const aiGeneratedLevel = await generateLevelWithGemini(aiPrompt);
      
      if (!aiGeneratedLevel.name || !Array.isArray(aiGeneratedLevel.structure) || typeof aiGeneratedLevel.initialProjectiles !== 'number') {
        throw new Error("AI 생성 데이터에 필수 필드가 누락되었습니다.");
      }
      if (aiGeneratedLevel.structure.length === 0) {
        throw new Error("AI가 빈 구조물을 생성했습니다. 다른 프롬프트를 시도해 보세요.");
      }
      const goldenBlocks = aiGeneratedLevel.structure.filter(b => b.isKing);
      if (goldenBlocks.length !== 1) {
        console.warn(`AI 생성 레벨에 황금 블록이 ${goldenBlocks.length}개 있습니다. 수정 시도 중...`);
        let hasFixedKing = false;
        aiGeneratedLevel.structure.forEach((b, idx) => {
            if (idx === 0 && goldenBlocks.length === 0) {
                b.isKing = true;
                hasFixedKing = true;
            } else if (goldenBlocks.length > 1 && b.isKing && !hasFixedKing) {
                hasFixedKing = true; 
            } else if (goldenBlocks.length > 1 && b.isKing && hasFixedKing) {
                b.isKing = false; 
            }
        });
        if (!hasFixedKing && aiGeneratedLevel.structure.length > 0) { 
             aiGeneratedLevel.structure[0].isKing = true; 
        }
         const finalKingCheck = aiGeneratedLevel.structure.filter(b => b.isKing);
         if (finalKingCheck.length !== 1) {
            throw new Error(`AI가 황금 블록을 ${finalKingCheck.length}개 생성했습니다. 생성에 실패했습니다.`);
         }
      }

      setLevelName(aiGeneratedLevel.name);
      setInitialProjectiles(Math.max(1, aiGeneratedLevel.initialProjectiles));
      setStructure(aiGeneratedLevel.structure);
      setEditingLevelId(null); 
      centerCameraOnStructure(aiGeneratedLevel.structure, true);
      setEditorMessage("AI가 레벨 생성을 완료했습니다!");
      setMessageType('success');

    } catch (error: any) {
      console.error("AI Level Generation Error:", error);
      setEditorMessage(`AI 레벨 생성 실패: ${error.message}`); 
      setMessageType('error');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSaveApiKey = () => {
    if (typeof localStorage !== 'undefined') {
        try {
            if (apiKeyInput.trim() === "") {
                localStorage.removeItem(LOCAL_STORAGE_API_KEY_ID);
                setApiKeyMessage({text: "API 키가 비어있어 저장소에서 삭제되었습니다.", type: 'success'});
            } else {
                localStorage.setItem(LOCAL_STORAGE_API_KEY_ID, apiKeyInput);
                setApiKeyMessage({text: "API 키가 저장되었습니다.", type: 'success'});
            }
        } catch (e) {
            console.error("Error saving API key to localStorage:", e);
            setApiKeyMessage({text: "API 키 저장 실패. 브라우저 콘솔을 확인하세요.", type: 'error'});
        }
        initializeAiClient(); // Re-initialize the client after saving/removing key
        updateGeminiApiStatus(); // Update the status display
    } else {
        setApiKeyMessage({text: "localStorage를 사용할 수 없어 API 키를 저장할 수 없습니다.", type: 'error'});
    }
  };


  return (
    <div className="w-full flex-grow max-w-full relative flex flex-col bg-[#1a202c]">
      <div className="absolute top-4 left-4 p-3 bg-black/70 rounded-md text-gray-200 text-xs shadow-lg z-10">
        <h4 className="font-semibold mb-1">조작법:</h4>
        <ul className="list-disc list-inside space-y-0.5">
          <li>마우스 왼쪽 클릭: 블록 놓기</li>
          <li>마우스 오른쪽 클릭: 블록 제거</li>
          <li>마우스 휠: 확대/축소</li>
          <li>마우스 휠 클릭 + 드래그: 시점 회전</li>
        </ul>
      </div>
      
      <div 
        ref={mountRef} 
        className="flex-grow w-full cursor-crosshair min-h-0" 
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseClick} 
        onContextMenu={(e) => e.preventDefault()} 
        onMouseLeave={() => ghostBlockMeshRef.current && (ghostBlockMeshRef.current.visible = false)}
      />
      
      <div 
        aria-live="polite"
        className={`absolute bottom-52 left-1/2 px-4 py-2 w-auto min-w-[200px] max-w-[90%] text-center rounded-md shadow-lg text-sm font-medium z-20 transition-all duration-300 ease-in-out pointer-events-none ${
          editorMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full'
        } ${
          messageType === 'error' ? 'bg-red-600 text-white' : 
          messageType === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
        }`}
        style={{ transform: editorMessage ? 'translate(-50%, 0)' : 'translate(-50%, 100%)' }}
      >
        {editorMessage}
      </div>

      <div className="flex-shrink-0 p-2 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-start shadow-lg z-10 gap-1.5">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex flex-col xs:flex-row items-center gap-2">
            <div className="flex items-center space-x-1">
              <label htmlFor="levelNameInput" className="text-gray-300 text-xs font-medium whitespace-nowrap">이름:</label>
              <input id="levelNameInput" type="text" value={levelName} onChange={(e) => { setLevelName(e.target.value); setEditorMessage(null); }} placeholder="레벨 이름" className="bg-gray-700 text-white text-sm rounded px-2 py-1 w-28 xs:w-32 sm:w-40 focus:ring-yellow-400 focus:border-yellow-400 border border-gray-600"/>
            </div>
            <div className="flex items-center space-x-1">
              <label htmlFor="projectilesInput" className="text-gray-300 text-xs font-medium whitespace-nowrap">발사체:</label>
              <input id="projectilesInput" type="number" value={initialProjectiles} onChange={(e) => { setInitialProjectiles(Math.max(1, parseInt(e.target.value, 10) || 1)); setEditorMessage(null); }} className="bg-gray-700 text-white text-sm rounded px-2 py-1 w-16 xs:w-20 focus:ring-yellow-400 focus:border-yellow-400 border border-gray-600" min="1"/>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 sm:space-x-1">
            <span className="text-gray-300 text-xs sm:text-sm font-medium hidden xs:inline">색상:</span>
            {editorColors.map(color => (
              <button key={color.name} title={color.name} onClick={() => { setSelectedColorValue(color.value); setEditorMessage(null); }}
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded border-2 transition-all duration-150 ${selectedColorValue === color.value ? 'border-yellow-400 scale-110 ring-2 ring-yellow-300 ring-offset-2 ring-offset-gray-900' : 'border-gray-600 hover:border-gray-400'}`}
                style={{ backgroundColor: `#${color.value.toString(16).padStart(6, '0')}` }} aria-label={`Select ${color.name} block`}
              />
            ))}
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            <div className="flex items-center space-x-1.5 sm:space-x-1 flex-wrap justify-center">
                <span className="text-gray-300 text-xs sm:text-sm font-medium hidden xs:inline">모양:</span>
                {editorShapes.map(shape => (
                <button key={shape.type} title={shape.name} onClick={() => { setSelectedShape(shape.type); setEditorMessage(null); }}
                    className={`px-2 py-1 text-xs sm:text-sm rounded border-2 transition-all duration-150 ${selectedShape === shape.type ? 'bg-yellow-500 text-gray-900 border-yellow-400 scale-105 ring-2 ring-yellow-300 ring-offset-1 ring-offset-gray-900' : 'bg-gray-700 text-white border-gray-600 hover:border-gray-400 hover:bg-gray-600'}`}
                    aria-label={`Select ${shape.name} shape`}
                >
                    {shape.label}
                </button>
                ))}
            </div>
            <div className="flex items-center flex-wrap justify-center gap-1.5 sm:gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" style={{ display: 'none' }} />
              <button onClick={handleImportClick} title="JSON 파일에서 레벨 가져오기" className="px-3 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 transition-colors">가져오기</button>
              <button onClick={handleExportLevel} title="현재 레벨을 JSON 파일로 내보내기" className="px-3 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-teal-500 transition-colors">내보내기</button>
              <button onClick={handleSaveLevel} title="현재 레벨을 앱에 저장하여 플레이 가능하게 만들기" className="px-3 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500 transition-colors">저장 (앱에)</button>
              <button onClick={onExit} title="레벨 에디터 닫기" className="px-3 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-white bg-gray-600 hover:bg-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-400 transition-colors">닫기</button>
            </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 w-full max-w-xl">
            <label htmlFor="apiKeyInput" className="text-gray-300 text-xs sm:text-sm font-medium whitespace-nowrap">Gemini API 키:</label>
            <input
                id="apiKeyInput"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AI 생성에 필요한 API 키를 입력하세요"
                className="bg-gray-700 text-white text-sm rounded px-2 py-1.5 flex-grow focus:ring-yellow-400 focus:border-yellow-400 border border-gray-600"
                aria-describedby="apiKeyMessage"
            />
            <button 
                onClick={handleSaveApiKey}
                className="px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-sky-500 transition-colors"
            >
                키 저장
            </button>
            {apiKeyMessage && (
                <span id="apiKeyMessage" className={`ml-2 text-xs ${apiKeyMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {apiKeyMessage.text}
                </span>
            )}
        </div>
        
        <div className="flex items-center gap-2 mt-1 sm:mt-0 w-full max-w-xl justify-start">
          <span className="text-gray-300 text-xs sm:text-sm font-medium">Gemini API 상태:</span>
          <span className={`flex items-center text-xs font-semibold ${geminiApiStatus.isActive ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-2.5 h-2.5 rounded-full mr-1.5 ${geminiApiStatus.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {geminiApiStatus.isActive ? '활성' : '비활성'}
          </span>
          {!geminiApiStatus.isActive && geminiApiStatus.message && (
            <div className="relative group">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 hover:text-yellow-400 cursor-help">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Z" clipRule="evenodd" />
              </svg>
              <span className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-xs -translate-x-1/2 transform rounded-md bg-gray-700 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 shadow-lg whitespace-pre-wrap text-left"
               style={{ pointerEvents: 'none' }} >
                {geminiApiStatus.message}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 w-full max-w-xl">
            <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="AI 생성 프롬프트 (예: '높은 탑과 작은 블록들')"
                className="bg-gray-700 text-white text-sm rounded px-2 py-1 w-full sm:flex-grow h-auto resize-none focus:ring-yellow-400 focus:border-yellow-400 border border-gray-600"
                rows={1}
                disabled={isAiGenerating || !geminiApiStatus.isActive}
                aria-label="AI 생성 프롬프트 입력"
                title={!geminiApiStatus.isActive ? "AI 레벨 생성을 위해 Gemini API를 활성화하세요." : ""}
            />
            <button 
                onClick={handleAiGenerateLevel}
                disabled={isAiGenerating || !geminiApiStatus.isActive}
                className="px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed w-full sm:w-auto mt-1 sm:mt-0"
                title={!geminiApiStatus.isActive ? "AI 레벨 생성을 위해 Gemini API를 활성화하세요." : ""}
            >
                {isAiGenerating ? 'AI 생성 중...' : 'AI 레벨 생성'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default LevelEditor;
