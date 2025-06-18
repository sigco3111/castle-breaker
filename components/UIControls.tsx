
import React from 'react';
import PowerGauge from './PowerGauge';
import ProjectileSelector from './ProjectileSelector';
import { ProjectileType, ProjectileConfig } from '../types';

interface UIControlsProps {
  score: number;
  projectilesLeftCount: number;
  selectedProjectileTypeInfo: ProjectileConfig;
  projectileCounts: Record<ProjectileType, number>;
  allProjectileTypes: ProjectileConfig[];
  onSelectProjectileType: (type: ProjectileType) => void;
  onReset: () => void;
  isCharging: boolean;
  currentPower: number;
  canAttemptCharge: boolean;
  isDelegateModeActive: boolean;
  onToggleDelegateMode: () => void;
}

const UIControls: React.FC<UIControlsProps> = ({ 
  score, 
  projectilesLeftCount,
  selectedProjectileTypeInfo,
  projectileCounts,
  allProjectileTypes,
  onSelectProjectileType,
  onReset,
  isCharging,
  currentPower,
  canAttemptCharge,
  isDelegateModeActive,
  onToggleDelegateMode
}) => {

  return (
    <div className="w-full max-w-4xl p-2 sm:p-4 bg-gray-700/50 backdrop-blur-sm rounded-lg shadow-xl mb-1 sm:mb-2 border border-gray-600">
      <div className="flex flex-col sm:flex-row justify-around items-center space-y-2 sm:space-y-0 sm:space-x-4">
        <div className="text-center">
          <p className="text-2xl sm:text-3xl font-bold text-white">{score}</p>
          <p className="text-xs text-gray-300 uppercase tracking-wider">점수</p>
        </div>
        <div className="text-center">
          <p className="text-2xl sm:text-3xl font-bold text-white">
            {projectilesLeftCount}
          </p>
          <p className="text-xs text-yellow-300 uppercase tracking-wider">
            남은 {selectedProjectileTypeInfo.name}
          </p>
        </div>
        <div className="flex flex-wrap justify-center items-center space-x-2 sm:space-x-3">
          <button
            onClick={onReset}
            className="px-4 py-2 sm:px-6 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
            aria-label="게임 초기화 (레벨 1부터 시작)"
          >
            초기화
          </button>
          <label htmlFor="delegateToggle" className="flex items-center cursor-pointer select-none" title={isDelegateModeActive ? "자동 발사 모드 비활성화" : "자동 발사 모드 활성화"}>
            <div className="relative">
              <input 
                type="checkbox" 
                id="delegateToggle" 
                className="sr-only" 
                checked={isDelegateModeActive} 
                onChange={onToggleDelegateMode} 
                aria-roledescription="switch"
              />
              <div className={`block w-10 h-6 rounded-full transition-colors ${isDelegateModeActive ? 'bg-yellow-500' : 'bg-gray-600'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isDelegateModeActive ? 'transform translate-x-full' : ''}`}></div>
            </div>
            <div className="ml-2 text-gray-200 text-xs sm:text-sm font-medium">자동 발사</div>
          </label>
        </div>
      </div>
      <PowerGauge isCharging={isCharging && canAttemptCharge && !isDelegateModeActive} power={currentPower} />
      <ProjectileSelector
        projectileConfigs={allProjectileTypes}
        projectileCounts={projectileCounts}
        selectedProjectileType={selectedProjectileTypeInfo.id}
        onSelectProjectile={onSelectProjectileType}
        disabled={isCharging || isDelegateModeActive} // Disable selector if charging OR delegate mode is on
      />
    </div>
  );
};

export default UIControls;
