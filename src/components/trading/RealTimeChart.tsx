import { FC, useEffect, useState } from 'react';
import { gameAPI, ChartAPI, ChartData } from '../../services/api';
import { Candle } from '../../types/trade';

interface RealTimeChartProps {
  gameId?: string;
  height?: number;
  onMultiplierUpdate?: (multiplier: number) => void;
  // GAME-BASED: Peak multiplier reached by the game (same for all players)
  onPeakMultiplierUpdate?: (gamePeak: number, currentMultiplier: number) => void;
  // GAME-BASED: When game ends with global game stats
  onGameEnd?: (gamePeakMultiplier: number, gameCrashMultiplier: number) => void;
}

const RealTimeChart: FC<RealTimeChartProps> = ({ 
  gameId, 
  height = 400,
  onMultiplierUpdate,
  onPeakMultiplierUpdate,
  onGameEnd
}) => {
  const [chartData, setChartData] = useState<Candle[]>([]);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [gamePeakMultiplier, setGamePeakMultiplier] = useState<number>(1.0); // GAME-BASED: Highest point reached by the game
  const [isGameActive, setIsGameActive] = useState<boolean>(false);

  useEffect(() => {
    // Load historical chart data if gameId provided
    if (gameId) {
      const loadChartData = async () => {
        try {
          const data = await ChartAPI.getChartData(gameId);
          const candles = data.map(point => ({
            timestamp: point.timestamp,
            open: point.open_price,
            high: point.high_price,
            low: point.low_price,
            close: point.close_price,
            volume: point.volume
          }));
          setChartData(candles);
        } catch (error) {
          console.error('Error loading chart data:', error);
        }
      };

      loadChartData();
    }
  }, [gameId]);

  // GAME-BASED: Track the highest multiplier the game reaches (same for all players)
  useEffect(() => {
    if (isGameActive && currentMultiplier > gamePeakMultiplier) {
      console.log(`🎮 GAME peak multiplier: ${currentMultiplier.toFixed(2)}x (previous game peak: ${gamePeakMultiplier.toFixed(2)}x)`);
      setGamePeakMultiplier(currentMultiplier);
      
      // Notify parent component of game peak update
      if (onPeakMultiplierUpdate) {
        onPeakMultiplierUpdate(currentMultiplier, currentMultiplier);
      }
    }
  }, [currentMultiplier, gamePeakMultiplier, isGameActive, onPeakMultiplierUpdate]);

  useEffect(() => {
    // Listen for real-time multiplier updates
    const handleMultiplierUpdate = (data: { multiplier: number; timestamp: number }) => {
      setCurrentMultiplier(data.multiplier);
      if (onMultiplierUpdate) {
        onMultiplierUpdate(data.multiplier);
      }
    };

    const handleGameState = (gameState: any) => {
      setIsGameActive(gameState.status === 'active');
      setCurrentMultiplier(gameState.multiplier);
    };

    const handleGameCrashed = (data: { crashMultiplier: number }) => {
      console.log(`💥 GAME crashed at ${data.crashMultiplier.toFixed(2)}x (game peak was ${gamePeakMultiplier.toFixed(2)}x)`);
      
      setIsGameActive(false);
      setCurrentMultiplier(data.crashMultiplier);
      
      // GAME-BASED: Notify parent that this game round ended with peak and crash multipliers
      if (onGameEnd) {
        onGameEnd(gamePeakMultiplier, data.crashMultiplier);
      }
    };

    const handleGameStarted = () => {
      console.log('🎮 New game round started - resetting game peak multiplier');
      
      setIsGameActive(true);
      setCurrentMultiplier(1.0);
      setGamePeakMultiplier(1.0); // GAME-BASED: Reset peak for new game round
      setChartData([]); // Clear chart for new game
    };

    gameAPI.on('multiplierUpdate', handleMultiplierUpdate);
    gameAPI.on('gameState', handleGameState);
    gameAPI.on('gameCrashed', handleGameCrashed);
    gameAPI.on('gameStarted', handleGameStarted);

    return () => {
      gameAPI.off('multiplierUpdate', handleMultiplierUpdate);
      gameAPI.off('gameState', handleGameState);
      gameAPI.off('gameCrashed', handleGameCrashed);
      gameAPI.off('gameStarted', handleGameStarted);
    };
  }, [onMultiplierUpdate, onGameEnd, gamePeakMultiplier]);

  // Simple multiplier display for now
  return (
    <div 
      className="w-full bg-black border border-gray-800 rounded-lg flex items-center justify-center relative"
      style={{ height: `${height}px` }}
    >
      <div className="text-center">
        <div className={`text-6xl font-bold ${isGameActive ? 'text-green-400' : 'text-red-400'}`}>
          {currentMultiplier.toFixed(2)}x
        </div>
        <div className="text-gray-400 mt-2">
          {isGameActive ? 'Game Active' : 'Game Crashed'}
        </div>
        
        {/* GAME-BASED: Show the highest multiplier this game round reached */}
        {gamePeakMultiplier > 1.0 && (
          <div className="text-blue-400 text-sm mt-1">
            Game Peak: {gamePeakMultiplier.toFixed(2)}x
          </div>
        )}
      </div>
      
      {/* Status indicators */}
      <div className="absolute top-4 left-4">
        <div className={`px-3 py-1 rounded text-sm font-bold ${
          isGameActive ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {isGameActive ? 'ACTIVE' : 'CRASHED'}
        </div>
      </div>

      {/* GAME-BASED: Show game peak indicator */}
      {gamePeakMultiplier > 2.0 && (
        <div className="absolute top-4 right-4">
          <div className="px-3 py-1 rounded text-sm font-bold bg-blue-600">
            GAME PEAK: {gamePeakMultiplier.toFixed(2)}x
          </div>
        </div>
      )}
    </div>
  );
};

export default RealTimeChart;