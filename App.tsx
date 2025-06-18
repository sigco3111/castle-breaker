
import React, { useState, useCallback, useRef, useEffect } from 'react';
import GameCanvas, { GameCanvasRef } from './components/GameCanvas';
import UIControls from './components/UIControls';
import LevelEditor from './components/LevelEditor';
import LibraryModal from './components/LibraryModal';
import { GameState, LevelConfiguration, ProjectileType, ProjectileConfig } from './types';
import { POINTS_PER_BLOCK, POINTS_PER_KING, MIN_LAUNCH_POWER, MAX_LAUNCH_POWER, PROJECTILE_TYPES_CONFIG } from './constants'; 
import { LEVEL_CONFIGS as PREDEFINED_LEVELS } from './levels';

const App: React.FC = () => {
  const [editorActive, setEditorActive] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [customLevels, setCustomLevels] = useState<LevelConfiguration[]>([]);
  const [allPlayableLevels, setAllPlayableLevels] = useState<LevelConfiguration[]>(PREDEFINED_LEVELS);
  const [levelToEditInEditor, setLevelToEditInEditor] = useState<LevelConfiguration | null>(null);

  const [isCharging, setIsCharging] = useState(false);
  const [currentLaunchPower, setCurrentLaunchPower] = useState(0);
  const [isDelegateModeActive, setDelegateModeActive] = useState(false);
  const delegateIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const loadLevels = async () => {
      try {
        const storedCustomLevels = localStorage.getItem('dominoCastleCustomLevels');
        if (storedCustomLevels) {
          const parsedLevels = JSON.parse(storedCustomLevels) as LevelConfiguration[];
          setCustomLevels(parsedLevels);
          setAllPlayableLevels([...PREDEFINED_LEVELS, ...parsedLevels]);
        } else {
          try {
            const response = await fetch('./domino_castle_library.json');
            if (response.ok) {
              const libraryLevels = await response.json() as LevelConfiguration[];
              if (Array.isArray(libraryLevels)) {
                setCustomLevels(libraryLevels);
                setAllPlayableLevels([...PREDEFINED_LEVELS, ...libraryLevels]);
                localStorage.setItem('dominoCastleCustomLevels', JSON.stringify(libraryLevels));
                 console.log("Loaded default levels from domino_castle_library.json and saved to localStorage.");
              } else {
                console.warn("domino_castle_library.json did not contain a valid array of levels. Using predefined levels only.");
                setAllPlayableLevels([...PREDEFINED_LEVELS]);
              }
            } else {
              console.warn("Could not fetch domino_castle_library.json. Status:", response.status, ". Using predefined levels only.");
              setAllPlayableLevels([...PREDEFINED_LEVELS]);
            }
          } catch (fetchError) {
            console.error("Error fetching or parsing domino_castle_library.json:", fetchError, ". Using predefined levels only.");
            setAllPlayableLevels([...PREDEFINED_LEVELS]);
          }
        }
      } catch (error) {
        console.error("Error during initial levels loading:", error);
        setAllPlayableLevels([...PREDEFINED_LEVELS]); 
      }
    };

    loadLevels();
  }, []);

  const getDefaultProjectileCounts = (): Record<ProjectileType, number> => {
    return PROJECTILE_TYPES_CONFIG.reduce((acc, config) => {
      acc[config.id] = config.defaultCount;
      return acc;
    }, {} as Record<ProjectileType, number>);
  };

  const [gameState, setGameState] = useState<GameState>(() => {
    const initialLevelConfig = PREDEFINED_LEVELS[0]; 
    const initialCounts = getDefaultProjectileCounts();
    const initialSelectedType = ProjectileType.STANDARD;

    return {
      score: 0,
      projectilesLeft: initialCounts[initialSelectedType] || 0,
      projectileCounts: initialCounts,
      selectedProjectileType: initialSelectedType,
      isGameOver: false,
      gameMessage: initialLevelConfig?.gameMessage || `레벨 1: ${initialLevelConfig?.name || '시작 레벨'}. 황금 블록을 무너뜨리세요!`,
      currentLevelIndex: 0,
      isLevelWon: false,
    };
  });
  const [fallenBlockIds, setFallenBlockIds] = useState<Set<string>>(new Set());
  const gameCanvasRef = useRef<GameCanvasRef>(null);

  const setupLevel = useCallback((levelIndex: number) => {
    if (allPlayableLevels.length === 0) {
      const initialCounts = getDefaultProjectileCounts();
      const initialSelectedType = ProjectileType.STANDARD;
      setGameState(prev => ({
        ...prev, score: 0, 
        projectilesLeft: 0, 
        projectileCounts: initialCounts,
        selectedProjectileType: initialSelectedType,
        isGameOver: true, 
        gameMessage: "플레이할 레벨을 불러올 수 없습니다! 에디터나 라이브러리에서 레벨을 추가하세요.", currentLevelIndex: 0, isLevelWon: false
      }));
      setFallenBlockIds(new Set());
      return;
    }

    const targetIndex = (levelIndex >= 0 && levelIndex < allPlayableLevels.length) ? levelIndex : 0;
    const levelConfig = allPlayableLevels[targetIndex];
    
    const newProjectileCounts = getDefaultProjectileCounts();
    const newSelectedType = gameState.selectedProjectileType;
    const newProjectilesLeft = newProjectileCounts[newSelectedType] !== undefined ? newProjectileCounts[newSelectedType] : (newProjectileCounts[ProjectileType.STANDARD] || 0) ;

    setGameState(prev => ({
      ...prev,
      score: 0, 
      projectilesLeft: newProjectilesLeft,
      projectileCounts: newProjectileCounts,
      selectedProjectileType: newProjectileCounts[newSelectedType] !== undefined ? newSelectedType : ProjectileType.STANDARD,
      isGameOver: false,
      gameMessage: levelConfig.gameMessage || `레벨 ${targetIndex + 1}: ${levelConfig.name}. 황금 블록을 무너뜨리세요!`,
      currentLevelIndex: targetIndex,
      isLevelWon: false,
    }));
    setFallenBlockIds(new Set());
    setIsCharging(false);
    setCurrentLaunchPower(0);
    if (isDelegateModeActive) { 
        setGameState(g => ({...g, gameMessage: "자동 발사 모드 활성됨. 다음 행동 대기 중..."}));
    }
  }, [allPlayableLevels, gameState.selectedProjectileType, isDelegateModeActive]);

  useEffect(() => {
    if (allPlayableLevels.length > 0) {
        const currentLevelIsValid = gameState.currentLevelIndex >=0 && gameState.currentLevelIndex < allPlayableLevels.length;
        setupLevel(currentLevelIsValid ? gameState.currentLevelIndex : 0);
    } else { 
        const initialCounts = getDefaultProjectileCounts();
        setGameState(prev => ({ 
            ...prev, 
            isGameOver: true, 
            gameMessage: "플레이할 레벨이 없습니다! 에디터에서 레벨을 만들어주세요.",
            projectileCounts: initialCounts,
            projectilesLeft: 0,
        }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayableLevels]);


  const handleLaunchProjectile = useCallback((launchPower: number, type: ProjectileType) => {
    gameCanvasRef.current?.launchProjectile(launchPower, type);
    
    setGameState(prev => {
      const newCounts = { ...prev.projectileCounts };
      newCounts[type] = Math.max(0, newCounts[type] - 1);
      const projectileConfigLaunched = PROJECTILE_TYPES_CONFIG.find(ptc => ptc.id === type);
      const launchedByName = projectileConfigLaunched?.name || '발사체';
      const messagePrefix = isDelegateModeActiveRef.current ? "자동 발사: " : ""; // Use ref for current delegate mode status
      
      return {
        ...prev,
        projectileCounts: newCounts,
        projectilesLeft: newCounts[prev.selectedProjectileType], 
        gameMessage: `${messagePrefix}${launchedByName} 발사! (파워: ${Math.round(launchPower * 100)}%)`,
      };
    });
  }, []); // isDelegateModeActive removed, using ref instead

  const handleSelectProjectileType = useCallback((type: ProjectileType) => {
    setGameState(prev => {
        if (prev.projectileCounts[type] > 0 || type === prev.selectedProjectileType) {
         return {
            ...prev,
            selectedProjectileType: type,
            projectilesLeft: prev.projectileCounts[type],
          };
        }
        return prev;
    });
  }, []);

  const canCurrentlyLaunch = gameState.projectileCounts[gameState.selectedProjectileType] > 0;

  const handleChargeStart = useCallback(() => {
    if (canCurrentlyLaunch && !gameState.isGameOver && !gameState.isLevelWon && !isDelegateModeActive) {
      setIsCharging(true);
      setCurrentLaunchPower(0);
    }
  }, [canCurrentlyLaunch, gameState.isGameOver, gameState.isLevelWon, isDelegateModeActive]);

  const handleChargeProgress = useCallback((power: number) => {
    if (isCharging) {
      setCurrentLaunchPower(power);
    }
  }, [isCharging]);

  const handleChargeComplete = useCallback((finalPower: number) => {
    setIsCharging(false);
    setCurrentLaunchPower(0);
    if (canCurrentlyLaunch && !gameState.isGameOver && !gameState.isLevelWon && !isDelegateModeActive) {
      const actualLaunchPower = Math.max(MIN_LAUNCH_POWER, finalPower);
      handleLaunchProjectile(actualLaunchPower, gameState.selectedProjectileType);
    }
  }, [canCurrentlyLaunch, gameState.isGameOver, gameState.isLevelWon, gameState.selectedProjectileType, handleLaunchProjectile, isDelegateModeActive]);


  const handleBlockFallen = useCallback((blockId: string, isKing: boolean) => {
    if (gameStateRef.current.isGameOver || gameStateRef.current.isLevelWon || fallenBlockIds.has(blockId)) { // Use ref
      return;
    }
    setFallenBlockIds(prev => new Set(prev).add(blockId));
    const pointsEarned = isKing ? POINTS_PER_KING : POINTS_PER_BLOCK;
    
    setGameState(prev => {
      const newScoreForLevel = prev.score + pointsEarned;
      let newGameMessage = `블록 명중! +${pointsEarned}점 획득. 현재 레벨 점수: ${newScoreForLevel}`;
      let newIsGameOver = prev.isGameOver;
      let newIsLevelWon = prev.isLevelWon;
      const currentLevelConfig = allPlayableLevels[prev.currentLevelIndex];
      const currentLevelName = currentLevelConfig?.name || '';

      if (isKing) {
        newIsLevelWon = true;
        const isLastLevel = prev.currentLevelIndex === allPlayableLevels.length - 1;
        if (isLastLevel) {
          newGameMessage = `모든 레벨 클리어! 최종 점수 (마지막 레벨): ${newScoreForLevel}. 대단해요! 모든 황금 블록을 무너뜨렸습니다!`;
          newIsGameOver = true; 
        } else {
          newGameMessage = `레벨 ${prev.currentLevelIndex + 1} (${currentLevelName}) 클리어! 잠시 후 다음 레벨로 이동합니다. 점수: ${newScoreForLevel}`;
        }
      }
      
      return {
        ...prev,
        score: newScoreForLevel,
        gameMessage: newGameMessage,
        isGameOver: newIsGameOver,
        isLevelWon: newIsLevelWon,
      };
    });

  }, [fallenBlockIds, allPlayableLevels]); 
  
  useEffect(() => {
    const totalProjectilesLeft = Object.values(gameState.projectileCounts).reduce((sum, count) => sum + count, 0);
    if (totalProjectilesLeft === 0 && !gameState.isLevelWon && !gameState.isGameOver && allPlayableLevels.length > 0) {
      const currentLevelConfig = allPlayableLevels[gameState.currentLevelIndex];
      const messagePrefix = isDelegateModeActiveRef.current ? "자동 발사: " : "";
      setGameState(prev => ({
        ...prev,
        isGameOver: true, 
        gameMessage: `${messagePrefix}발사체를 모두 사용했습니다! 레벨 ${prev.currentLevelIndex + 1} (${currentLevelConfig?.name || ''}) 실패 (황금 블록 명중 못함). 점수: ${prev.score}. 다시 시작하려면 초기화를 누르세요.`,
      }));
    }
  }, [gameState.projectileCounts, gameState.isLevelWon, gameState.isGameOver, gameState.currentLevelIndex, gameState.score, allPlayableLevels]);

  const handleResetGame = useCallback(() => {
    if(isDelegateModeActive) setDelegateModeActive(false); 
    setupLevel(0);
  }, [setupLevel, isDelegateModeActive]);

  const handleNextLevel = useCallback(() => {
    if (gameState.currentLevelIndex < allPlayableLevels.length - 1) {
      const nextLevelIdx = gameState.currentLevelIndex + 1;
      setupLevel(nextLevelIdx);
    }
  }, [gameState.currentLevelIndex, allPlayableLevels.length, setupLevel]);

  useEffect(() => {
    if (gameState.isLevelWon && !gameState.isGameOver && gameState.currentLevelIndex < allPlayableLevels.length - 1) {
      const timer = setTimeout(() => {
        handleNextLevel();
      }, 1500); 
      return () => clearTimeout(timer);
    }
  }, [gameState.isLevelWon, gameState.isGameOver, gameState.currentLevelIndex, allPlayableLevels.length, handleNextLevel]);

  const toggleEditor = () => {
    if (isLibraryOpen) setIsLibraryOpen(false);
    setEditorActive(prev => {
      const newEditorActiveState = !prev;
      if (!newEditorActiveState) { 
        setLevelToEditInEditor(null); 
      }
      if (newEditorActiveState && isDelegateModeActive) setDelegateModeActive(false); 
      return newEditorActiveState;
    });
  };

  const toggleLibrary = () => {
    if (editorActive) {
        setEditorActive(false); 
        setLevelToEditInEditor(null); 
    }
    setIsLibraryOpen(prev => {
        const newLibraryState = !prev;
        if (newLibraryState && isDelegateModeActive) setDelegateModeActive(false); 
        return newLibraryState;
    });
  };

  const handleSaveCustomLevel = (levelData: LevelConfiguration, originalLevelIdToUpdate?: string | number) => {
    let updatedCustomLevels;
    let alertMessage = "";

    if (originalLevelIdToUpdate) {
      updatedCustomLevels = customLevels.map(lvl => 
        lvl.levelId === originalLevelIdToUpdate ? { ...levelData, levelId: originalLevelIdToUpdate } : lvl
      );
      alertMessage = "커스텀 레벨이 업데이트되었습니다!";
    } else {
      updatedCustomLevels = [...customLevels, levelData];
      alertMessage = "커스텀 레벨이 라이브러리에 저장되었습니다! 에디터를 닫고 플레이하거나 계속 만드세요.";
    }

    try {
      localStorage.setItem('dominoCastleCustomLevels', JSON.stringify(updatedCustomLevels));
      setCustomLevels(updatedCustomLevels);
      setAllPlayableLevels([...PREDEFINED_LEVELS, ...updatedCustomLevels]); 
      alert(alertMessage);
    } catch (e) {
      console.error("App: Error saving/updating custom level to localStorage:", e);
      alert(`커스텀 레벨을 저장/업데이트하는데 실패했습니다. 브라우저 콘솔을 확인해주세요. 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLevelToEditInEditor(null); 
  };

  const handleExportLibrary = () => {
    if (customLevels.length === 0) {
      alert("내보낼 커스텀 레벨이 없습니다.");
      return;
    }
    try {
      const jsonString = JSON.stringify(customLevels, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'domino_castle_library.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
      alert("커스텀 레벨 라이브러리를 내보냈습니다!");
    } catch (error) {
      console.error("Error exporting library:", error);
      alert("라이브러리를 내보내는 중 오류가 발생했습니다.");
    }
  };

  const handleImportLibrary = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedJson = e.target?.result as string;
        const importedLevels = JSON.parse(importedJson) as LevelConfiguration[];
        
        if (!Array.isArray(importedLevels)) {
            throw new Error("가져온 파일이 레벨 배열 형식이 아닙니다.");
        }

        const existingLevelIds = new Set(customLevels.map(l => l.levelId));
        const existingLevelNames = new Set(customLevels.map(l => l.name));
        
        let newLevelsAddedCount = 0;
        const validNewLevels = importedLevels.filter(importedLevel => {
          if (!importedLevel.levelId || !importedLevel.name || !Array.isArray(importedLevel.structure) || typeof importedLevel.initialProjectiles !== 'number') {
            console.warn("Skipping invalid level data from import:", importedLevel);
            return false;
          }
          const isDuplicate = existingLevelIds.has(importedLevel.levelId) || existingLevelNames.has(importedLevel.name);
          if (!isDuplicate) {
            newLevelsAddedCount++;
            return true;
          }
          return false;
        });

        if (newLevelsAddedCount > 0) {
          const updatedCustomLevels = [...customLevels, ...validNewLevels];
          localStorage.setItem('dominoCastleCustomLevels', JSON.stringify(updatedCustomLevels));
          setCustomLevels(updatedCustomLevels);
          setAllPlayableLevels([...PREDEFINED_LEVELS, ...updatedCustomLevels]);
          alert(`${newLevelsAddedCount}개의 새로운 레벨을 라이브러리로 가져왔습니다.`);
        } else {
          alert("새로 가져온 레벨이 없거나 모두 중복된 레벨입니다.");
        }
      } catch (error) {
        console.error("Error importing library:", error);
        alert(`라이브러리를 가져오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteCustomLevelFromLibrary = (levelIdToDelete: string | number) => {
    const currentPlayedLevelConfig = allPlayableLevels[gameState.currentLevelIndex];
    
    const updatedCustomLevels = customLevels.filter(level => level.levelId !== levelIdToDelete);
    localStorage.setItem('dominoCastleCustomLevels', JSON.stringify(updatedCustomLevels));
    setCustomLevels(updatedCustomLevels);

    const newAllPlayable = [...PREDEFINED_LEVELS, ...updatedCustomLevels];
    setAllPlayableLevels(newAllPlayable);

    if (newAllPlayable.length === 0) {
      setupLevel(0); 
    } else if (currentPlayedLevelConfig?.levelId === levelIdToDelete) {
        setupLevel(0); 
    } else if (currentPlayedLevelConfig) {
        const newCurrentIndex = newAllPlayable.findIndex(level => level.levelId === currentPlayedLevelConfig.levelId);
        setupLevel(newCurrentIndex !== -1 ? newCurrentIndex : 0);
    } else {
        setupLevel(0);
    }
    alert("레벨이 라이브러리에서 삭제되었습니다.");
  };

  const handleLoadLevelFromLibraryToEditor = (levelToLoad: LevelConfiguration) => {
    setLevelToEditInEditor(levelToLoad);
    setIsLibraryOpen(false);
    setEditorActive(true);
    if (isDelegateModeActive) setDelegateModeActive(false);
  };

  const handlePlayCustomLevelFromLibrary = (levelToPlay: LevelConfiguration) => {
    const customLevelIndexInCustomsArray = customLevels.findIndex(l => l.levelId === levelToPlay.levelId);
    if (customLevelIndexInCustomsArray === -1) {
        console.error("선택한 커스텀 레벨을 라이브러리에서 찾을 수 없습니다:", levelToPlay);
        alert("선택한 레벨을 플레이할 수 없습니다. 레벨을 찾을 수 없습니다.");
        return;
    }
    const overallIndex = PREDEFINED_LEVELS.length + customLevelIndexInCustomsArray;
    
    if (overallIndex >= 0 && overallIndex < allPlayableLevels.length) {
        setupLevel(overallIndex);
        setIsLibraryOpen(false);
        if (editorActive) setEditorActive(false);
        if (levelToEditInEditor) setLevelToEditInEditor(null);
        if (isDelegateModeActive) setDelegateModeActive(false);
    } else {
        console.error("계산된 레벨 인덱스가 유효하지 않습니다:", overallIndex, "AllPlayableLevels count:", allPlayableLevels.length);
        alert("선택한 레벨을 플레이할 수 없습니다. 유효하지 않은 인덱스입니다.");
    }
  };

  const toggleDelegateMode = useCallback(() => {
    setDelegateModeActive(prev => {
      const newMode = !prev;
      if (newMode) {
        setGameState(g => ({...g, gameMessage: "자동 발사 모드가 활성화되었습니다. 행동 대기 중..."}));
        if (isCharging) { 
            setIsCharging(false);
            setCurrentLaunchPower(0);
        }
      } else {
        setGameState(g => ({...g, gameMessage: "자동 발사 모드가 비활성화되었습니다."}));
      }
      return newMode;
    });
  }, [isCharging]);

  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const isDelegateModeActiveRef = useRef(isDelegateModeActive);
  useEffect(() => {
    isDelegateModeActiveRef.current = isDelegateModeActive;
  }, [isDelegateModeActive]);

  useEffect(() => {
    const performDelegateAction = () => {
      const gs = gameStateRef.current;
      const availableProjectileTypes = PROJECTILE_TYPES_CONFIG.filter(
        config => gs.projectileCounts[config.id] > 0
      );
  
      if (availableProjectileTypes.length === 0) {
        setGameState(prev => ({
          ...prev,
          gameMessage: "자동 발사: 사용 가능한 발사체가 없습니다. 모드를 비활성화합니다.",
        }));
        setDelegateModeActive(false); // Modifies isDelegateModeActive, which will clear interval via its own effect
        return;
      }
  
      const randomProjectileConfig = availableProjectileTypes[Math.floor(Math.random() * availableProjectileTypes.length)];
      const selectedType = randomProjectileConfig.id;
      
      handleSelectProjectileType(selectedType); // Update selected type
      
      const randomPowerFactor = 0.7 + Math.random() * 0.3; // Favor higher power (70-100%)
      const randomPower = Math.max(MIN_LAUNCH_POWER, randomPowerFactor * MAX_LAUNCH_POWER);
      const finalPower = Math.min(MAX_LAUNCH_POWER, randomPower);
      
      let aimMessageSegment = "";
      const goldenBlockPosition = gameCanvasRef.current?.getGoldenBlockPosition();

      if (goldenBlockPosition) {
        gameCanvasRef.current?.pointCameraTowards(goldenBlockPosition);
        aimMessageSegment = `황금 블록 조준! (${randomProjectileConfig.name}, 파워: ${Math.round(finalPower * 100)}%)`;
      } else {
        aimMessageSegment = `황금 블록 없음. 현재 방향으로 발사. (${randomProjectileConfig.name}, 파워: ${Math.round(finalPower * 100)}%)`;
      }
      
      setGameState(prev => ({
          ...prev,
          gameMessage: `자동 발사: ${aimMessageSegment}`
      }));

      // Short delay for camera to orient and message to display before launching
      setTimeout(() => {
        // Re-check conditions as state might have changed (e.g., game over, level won)
        if (isDelegateModeActiveRef.current && !gameStateRef.current.isGameOver && !gameStateRef.current.isLevelWon) {
           handleLaunchProjectile(finalPower, selectedType);
        }
      }, 300); 
    };
  
    if (isDelegateModeActive && !gameState.isGameOver && !gameState.isLevelWon && !editorActive && !isLibraryOpen) {
      if (delegateIntervalRef.current) { // Clear any existing interval before starting a new one
        clearInterval(delegateIntervalRef.current);
      }
      performDelegateAction(); // Perform action immediately, then set interval
      delegateIntervalRef.current = window.setInterval(performDelegateAction, 2500);
    } else {
      if (delegateIntervalRef.current) {
        clearInterval(delegateIntervalRef.current);
        delegateIntervalRef.current = null;
      }
    }
  
    return () => { // Cleanup on unmount or when dependencies change
      if (delegateIntervalRef.current) {
        clearInterval(delegateIntervalRef.current);
        delegateIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDelegateModeActive, gameState.isGameOver, gameState.isLevelWon, editorActive, isLibraryOpen, handleLaunchProjectile, handleSelectProjectileType]);


  const currentLevelConfig = allPlayableLevels.length > 0 ? allPlayableLevels[gameState.currentLevelIndex] : null;
  const canAttemptCharge = gameState.projectilesLeft > 0 && !gameState.isGameOver && !gameState.isLevelWon && !isDelegateModeActive;

  if (allPlayableLevels.length === 0 && !editorActive && !isLibraryOpen) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 p-4 text-white">
          <h1 className="text-3xl font-bold text-yellow-400 mb-4 orbitron-font">캐슬 브레이커</h1>
          <p className="text-xl mb-4">플레이할 레벨이 없습니다.</p>
          <div className="flex space-x-4">
            <button 
              onClick={toggleEditor}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md transition-colors"
            >
              레벨 에디터 열기
            </button>
            <button 
              onClick={toggleLibrary}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md transition-colors"
            >
              라이브러리 열기
            </button>
          </div>
        </div>
      );
  }
  
  if (!currentLevelConfig && !editorActive && !isLibraryOpen && allPlayableLevels.length > 0) {
      return <div className="flex-grow flex items-center justify-center text-white text-center p-8">현재 레벨을 불러올 수 없습니다. 앱을 새로고침 하거나 에디터/라이브러리에서 레벨을 확인하세요.</div>;
  }

  const currentSelectedProjectileConfig = PROJECTILE_TYPES_CONFIG.find(p => p.id === gameState.selectedProjectileType) || PROJECTILE_TYPES_CONFIG[0];

  return (
    <div className={`flex flex-col items-center justify-start min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 text-white selection:bg-yellow-500 selection:text-gray-900 ${editorActive || isLibraryOpen ? 'p-0 sm:p-0' : 'p-4'}`}>
      <header className={`text-center w-full ${editorActive || isLibraryOpen ? 'max-w-full p-3 bg-gray-900/50 flex-shrink-0' : 'max-w-4xl mb-2 sm:mb-4'}`}>
        <div className="flex justify-between items-center">
          <h1 className={`font-bold text-yellow-400 tracking-wider ${editorActive || isLibraryOpen ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'}`} style={{fontFamily: "'Orbitron', sans-serif"}}>캐슬 브레이커</h1>
          <div className="flex space-x-2">
            <button 
              onClick={toggleLibrary}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-xs sm:text-sm"
            >
              {isLibraryOpen ? "라이브러리 닫기" : "라이브러리"}
            </button>
            <button 
              onClick={toggleEditor}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-purple-400 text-xs sm:text-sm"
            >
              {editorActive ? "에디터 닫기" : "에디터 열기"}
            </button>
          </div>
        </div>
        {!editorActive && !isLibraryOpen && currentLevelConfig && (
          <>
            <p className="text-gray-300 text-sm sm:text-lg mt-1">
              {`레벨 ${gameState.currentLevelIndex + 1}${PREDEFINED_LEVELS.find(l => l.levelId === currentLevelConfig.levelId) ? '' : ' (커스텀)'}: ${currentLevelConfig.name}`}
            </p>
            <p className="text-gray-300 text-xs sm:text-md mt-1">{gameState.gameMessage}</p>
          </>
        )}
      </header>
      
      <div className="flex-grow w-full flex flex-col overflow-y-auto">
        {editorActive ? (
          <LevelEditor 
              onSave={handleSaveCustomLevel} 
              onExit={toggleEditor} 
              initialLevelData={levelToEditInEditor}
          />
        ) : isLibraryOpen ? (
          <LibraryModal 
            isOpen={isLibraryOpen}
            onClose={toggleLibrary}
            customLevels={customLevels}
            onExportLibrary={handleExportLibrary}
            onImportLibrary={handleImportLibrary}
            onDeleteLevel={handleDeleteCustomLevelFromLibrary}
            onLoadLevel={handleLoadLevelFromLibraryToEditor}
            onPlayLevel={handlePlayCustomLevelFromLibrary}
          />
        ) : currentLevelConfig ? ( 
          <div className={`w-full h-full flex flex-col items-center ${editorActive || isLibraryOpen ? '' : 'p-4'}`}>
            <UIControls
              score={gameState.score}
              projectilesLeftCount={gameState.projectilesLeft}
              selectedProjectileTypeInfo={currentSelectedProjectileConfig}
              projectileCounts={gameState.projectileCounts}
              allProjectileTypes={PROJECTILE_TYPES_CONFIG}
              onSelectProjectileType={handleSelectProjectileType}
              onReset={handleResetGame}
              isCharging={isCharging}
              currentPower={currentLaunchPower}
              canAttemptCharge={canAttemptCharge}
              isDelegateModeActive={isDelegateModeActive}
              onToggleDelegateMode={toggleDelegateMode}
            />
            <div className="w-full max-w-4xl aspect-[16/9] bg-gray-700 rounded-lg shadow-2xl overflow-hidden border-2 border-yellow-500 mt-2 sm:mt-4">
               <GameCanvas 
                  key={`${gameState.currentLevelIndex}_${allPlayableLevels[gameState.currentLevelIndex]?.levelId}`} 
                  ref={gameCanvasRef} 
                  onBlockFallen={handleBlockFallen}
                  initialLevelConfig={currentLevelConfig}
                  canAttemptCharge={canAttemptCharge}
                  onChargeStart={handleChargeStart}
                  onChargeProgress={handleChargeProgress}
                  onChargeComplete={handleChargeComplete}
                  isDelegateModeActive={isDelegateModeActive}
              />
            </div>
             <footer className="mt-auto pt-4 sm:pt-8 text-center text-gray-500 text-xs sm:text-sm flex-shrink-0">
              <p>React, Three.js, Cannon-es, Tailwind CSS로 제작되었습니다.</p>
              <p>팁: 화면을 길게 눌러 파워를 모아 발사하세요! 연쇄 반응을 만들어보세요!</p>
            </footer>
          </div>
        ) : (
           <div className="flex-grow flex items-center justify-center text-xl text-yellow-400 p-4">레벨 로딩 중... 또는 플레이 가능한 레벨이 없습니다. 라이브러리에서 레벨을 가져오거나 에디터에서 새 레벨을 만들어주세요.</div>
        )}
      </div>
    </div>
  );
};

export default App;
