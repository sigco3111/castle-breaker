
import React from 'react';

interface PowerGaugeProps {
  isCharging: boolean;
  power: number; // Value between 0 and 1
}

const PowerGauge: React.FC<PowerGaugeProps> = ({ isCharging, power }) => {
  if (!isCharging) {
    return null;
  }

  const GAUGE_HEIGHT = '12px'; // Height of the gauge bar
  const GAUGE_MAX_WIDTH = '200px'; // Max width of the gauge at full power

  const powerPercentage = Math.round(power * 100);

  return (
    <div 
        className="w-full flex justify-center items-center mt-3"
        aria-live="polite" 
        aria-atomic="true"
        role="progressbar"
        aria-valuenow={powerPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`발사 파워: ${powerPercentage}%`}
    >
      <div 
        className="bg-gray-600 rounded-full overflow-hidden shadow-inner"
        style={{ height: GAUGE_HEIGHT, width: GAUGE_MAX_WIDTH }}
      >
        <div
          className="bg-gradient-to-r from-yellow-400 to-red-500 h-full rounded-full transition-all duration-50 ease-linear"
          style={{ width: `${powerPercentage}%` }}
        />
      </div>
      <span className="ml-2 text-xs text-yellow-300 font-semibold tabular-nums">
        {powerPercentage}%
      </span>
    </div>
  );
};

export default PowerGauge;