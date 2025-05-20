// src/components/trading/GameCountdown.tsx
import { FC, useEffect, useState, useCallback } from 'react';

interface GameCountdownProps {
  seconds: number;
  onComplete: () => void;
  lastCrashMultiplier?: number | null;
}

const GameCountdown: FC<GameCountdownProps> = ({ 
  seconds, 
  onComplete,
  lastCrashMultiplier = null
}) => {
  const [countdown, setCountdown] = useState<number>(seconds);
  const [isFinalCountdown, setIsFinalCountdown] = useState<boolean>(false);
  const [showGenerating, setShowGenerating] = useState<boolean>(false);
  
  // Manage the countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      // When countdown reaches zero, show "Generating New Game" for 1 second
      if (!showGenerating) {
        setShowGenerating(true);
        setTimeout(() => {
          setShowGenerating(false);
          onComplete(); // Call the completion handler
        }, 1000);
      }
      return;
    }
    
    // Set pulsing effect for final 3 seconds
    if (countdown <= 3) {
      setIsFinalCountdown(true);
    }
    
    // Update countdown every second
    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [countdown, onComplete, showGenerating]);
  
  return (
    <div className="relative p-5 rounded-xl flex flex-col items-center">
      {showGenerating ? (
        // "Generating New Game" animation
        <div className="flex flex-col items-center">
          <div className="text-3xl md:text-4xl font-dynapuff text-green-400 mb-3 text-center leading-tight animate-pulse">
            Generating New Game
          </div>
          <div className="flex space-x-2 mt-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
          </div>
        </div>
      ) : (
        // Normal countdown display
        <>
          <div className="text-3xl md:text-4xl font-dynapuff text-white mb-3 text-center leading-tight">
            Next Round In
          </div>
          
          <div 
            className={`text-6xl md:text-7xl font-dynapuff text-yellow-500 text-center ${
              isFinalCountdown ? 'animate-pulse scale-105' : ''
            }`}
            style={{
              textShadow: isFinalCountdown ? '0 0 20px rgba(250, 204, 21, 0.7)' : 'none',
              transition: 'all 0.3s ease'
            }}
          >
            {countdown}
          </div>
          
          {lastCrashMultiplier !== null && (
            <div className="mt-5 text-center">
              <div className="text-base text-gray-400 mb-1">Last Game</div>
              <div className="text-2xl font-dynapuff text-red-500">
                RUGGED @ {lastCrashMultiplier.toFixed(2)}x
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GameCountdown;