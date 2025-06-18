
import React from 'react';
import { ProjectileType, ProjectileConfig } from '../types';

interface ProjectileSelectorProps {
  projectileConfigs: ProjectileConfig[];
  projectileCounts: Record<ProjectileType, number>;
  selectedProjectileType: ProjectileType;
  onSelectProjectile: (type: ProjectileType) => void;
  disabled: boolean; // True if charging, for example
}

const ProjectileSelector: React.FC<ProjectileSelectorProps> = ({
  projectileConfigs,
  projectileCounts,
  selectedProjectileType,
  onSelectProjectile,
  disabled,
}) => {
  return (
    <div className="mt-2 sm:mt-3 p-2 bg-gray-800/60 rounded-md shadow-md">
      <div className="flex justify-center items-center space-x-1 sm:space-x-2 flex-wrap gap-y-1">
        {projectileConfigs.map((config) => {
          const count = projectileCounts[config.id] || 0;
          const isSelected = config.id === selectedProjectileType;
          const isOutOfAmmo = count === 0;

          return (
            <button
              key={config.id}
              onClick={() => onSelectProjectile(config.id)}
              disabled={disabled || (isOutOfAmmo && !isSelected)} // Allow selecting OOA to see its count if already selected
              title={`${config.name}: ${config.description} (남은 수: ${count})`}
              className={`flex flex-col items-center p-1.5 sm:p-2 rounded-md transition-all duration-150 ease-in-out w-16 sm:w-20
                ${isSelected ? 'bg-yellow-500/30 ring-2 ring-yellow-400 shadow-lg' : 'bg-gray-700/70 hover:bg-gray-600/70'}
                ${(isOutOfAmmo && !isSelected) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${disabled && !(isOutOfAmmo && !isSelected) ? 'opacity-70 cursor-not-allowed' : ''}
              `}
              aria-pressed={isSelected}
              aria-label={`발사체 선택: ${config.name}, 남은 수량: ${count}`}
            >
              <span className="text-lg sm:text-xl" aria-hidden="true">{config.icon}</span>
              <span className={`text-xs font-medium truncate w-full text-center ${isSelected ? 'text-yellow-300' : 'text-gray-300'}`}>
                {config.name}
              </span>
              <span className={`text-xs font-semibold tabular-nums ${isSelected ? 'text-yellow-200' : (isOutOfAmmo ? 'text-red-400' : 'text-green-400')}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectileSelector;