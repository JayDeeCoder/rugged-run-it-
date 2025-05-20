import { FC, useState, useEffect } from 'react';
import { useGameContext } from '../../context/GameContext';

interface AutoCashoutSettingsProps {
  className?: string;
}

const AutoCashoutSettings: FC<AutoCashoutSettingsProps> = ({ className = '' }) => {
  const { gameState, setAutoCashout } = useGameContext();
  const [isEnabled, setIsEnabled] = useState(gameState.hasAutoCashout);
  const [multiplier, setMultiplier] = useState(gameState.autoCashoutMultiplier.toString());
  const [isOpen, setIsOpen] = useState(false);

  // Update local state when game state changes
  useEffect(() => {
    setIsEnabled(gameState.hasAutoCashout);
    setMultiplier(gameState.autoCashoutMultiplier.toString());
  }, [gameState.hasAutoCashout, gameState.autoCashoutMultiplier]);

  // Apply settings when toggled
  const handleToggleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setIsEnabled(newValue);
    setAutoCashout(newValue, parseFloat(multiplier));
  };

  // Update multiplier
  const handleMultiplierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow numbers and one decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setMultiplier(value);
    }
  };

  // Apply settings
  const applySettings = () => {
    const parsedMultiplier = parseFloat(multiplier);
    
    // Validate multiplier value
    if (isNaN(parsedMultiplier) || parsedMultiplier < 1.1) {
      setMultiplier('1.1');
      setAutoCashout(isEnabled, 1.1);
    } else {
      setAutoCashout(isEnabled, parsedMultiplier);
    }
    
    setIsOpen(false);
  };

  // Handle preset multiplier values
  const applyPreset = (value: number) => {
    setMultiplier(value.toString());
  };

  return (
    <div className={`bg-gray-900 rounded-lg ${className}`}>
      <div 
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <div className={`w-4 h-4 rounded-full mr-2 ${isEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
          <h3 className="text-white font-medium">Auto Cashout</h3>
        </div>
        <div className="text-gray-400">
          {isEnabled ? `at ${gameState.autoCashoutMultiplier.toFixed(2)}x` : 'Disabled'}
          <span className="ml-2">{isOpen ? '▲' : '▼'}</span>
        </div>
      </div>
      
      {isOpen && (
        <div className="p-3 border-t border-gray-800">
          {/* Toggle switch */}
          <div className="flex items-center justify-between mb-4">
            <label htmlFor="auto-cashout-toggle" className="text-gray-300">Enable Auto Cashout</label>
            <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full">
              <input
                id="auto-cashout-toggle"
                type="checkbox"
                className="absolute w-0 h-0 opacity-0"
                checked={isEnabled}
                onChange={handleToggleChange}
              />
              <label
                htmlFor="auto-cashout-toggle"
                className={`block w-12 h-6 overflow-hidden rounded-full cursor-pointer ${
                  isEnabled ? 'bg-green-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`absolute block w-4 h-4 mt-1 transition-transform duration-200 ease-in-out transform bg-white rounded-full ${
                    isEnabled ? 'translate-x-7 ml-0' : 'translate-x-1'
                  }`}
                />
              </label>
            </div>
          </div>
          
          {/* Multiplier input */}
          <div className="mb-4">
            <label htmlFor="auto-cashout-value" className="block text-gray-300 mb-1">
              Cashout at Multiplier (x)
            </label>
            <div className="flex">
              <input
                id="auto-cashout-value"
                type="text"
                value={multiplier}
                onChange={handleMultiplierChange}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded-l-md focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="2.00"
                disabled={!isEnabled}
              />
              <span className="bg-gray-700 text-gray-300 px-3 py-2 rounded-r-md">x</span>
            </div>
          </div>
          
          {/* Preset buttons */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[1.5, 2.0, 3.0, 5.0].map((value) => (
              <button
                key={value}
                onClick={() => applyPreset(value)}
                className={`px-2 py-1 text-sm rounded ${
                  parseFloat(multiplier) === value 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={!isEnabled}
              >
                {value.toFixed(1)}x
              </button>
            ))}
          </div>
          
          {/* Apply button */}
          <button
            onClick={applySettings}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md transition-colors"
          >
            Apply Settings
          </button>
        </div>
      )}
    </div>
  );
};

export default AutoCashoutSettings;