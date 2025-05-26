import { FC, useEffect, useState, useCallback } from 'react';

interface GameCountdownProps {
  seconds: number;
  onComplete: () => void;
  lastCrashMultiplier?: number | null;
  isServerSynced?: boolean; // NEW: Whether to sync with server countdown
}

const GameCountdown: FC<GameCountdownProps> = ({ 
  seconds, 
  onComplete,
  lastCrashMultiplier = null,
  isServerSynced = true // DEFAULT: Sync with server
}) => {
  const [countdown, setCountdown] = useState<number>(seconds);
  const [isFinalCountdown, setIsFinalCountdown] = useState<boolean>(false);
  const [showGenerating, setShowGenerating] = useState<boolean>(false);
  
  // ENHANCED: Sync with server countdown when props change
  useEffect(() => {
    if (isServerSynced) {
      // If server provides real-time countdown, use that directly
      setCountdown(seconds);
      setShowGenerating(false); // Reset generating state when new countdown starts
      
      // Reset final countdown state
      if (seconds > 3) {
        setIsFinalCountdown(false);
      }
    } else {
      // Fallback to initial seconds if not server synced
      setCountdown(seconds);
    }
  }, [seconds, isServerSynced]);
  
  // ENHANCED: Handle countdown completion and final countdown effects
  useEffect(() => {
    // Set pulsing effect for final 3 seconds
    if (countdown <= 3 && countdown > 0) {
      setIsFinalCountdown(true);
    } else {
      setIsFinalCountdown(false);
    }
    
    // Handle countdown completion
    if (countdown <= 0 && !showGenerating) {
      if (isServerSynced) {
        // If server synced, don't show generating - server handles game start
        onComplete();
      } else {
        // Original behavior for non-server synced
        setShowGenerating(true);
        setTimeout(() => {
          setShowGenerating(false);
          onComplete();
        }, 1000);
      }
      return;
    }
    
    // Only run internal timer if NOT server synced
    if (!isServerSynced && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [countdown, onComplete, showGenerating, isServerSynced]);
  
  return (
    <div className="relative p-5 rounded-xl flex flex-col items-center">
      {showGenerating ? (
        // "Generating New Game" animation - only shown for non-server synced
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
            {isServerSynced ? 'Next Round In' : 'Game Starting In'}
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
          
          {/* ENHANCED: Additional server sync info */}
          {isServerSynced && countdown > 0 && (
            <div className="mt-2 text-center">
              <div className="text-sm text-blue-400 animate-pulse">
                🔗 Server Synced
              </div>
            </div>
          )}
          
          {lastCrashMultiplier !== null && (
            <div className="mt-5 text-center">
              <div className="text-base text-gray-400 mb-1">Last Game</div>
              <div className="text-2xl font-dynapuff text-red-500">
                RUGGED @ {lastCrashMultiplier.toFixed(2)}x
              </div>
            </div>
          )}
          
          {/* ENHANCED: Show betting status during countdown */}
          {isServerSynced && countdown > 0 && countdown <= 8 && (
            <div className="mt-3 text-center">
              <div className="text-lg text-green-400 font-dynapuff">
                🎯 Snipe Now!
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GameCountdown;