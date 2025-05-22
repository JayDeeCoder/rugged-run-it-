import { FC, useEffect, useState } from 'react';
import { gameAPI, ChartAPI, ChartData } from '../../services/api';
import { Candle } from '../../types/trade';

interface RealTimeChartProps {
  gameId?: string;
  height?: number;
  onMultiplierUpdate?: (multiplier: number) => void;
}

const RealTimeChart: FC<RealTimeChartProps> = ({ 
  gameId, 
  height = 400,
  onMultiplierUpdate 
}) => {
  const [chartData, setChartData] = useState<Candle[]>([]);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
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
      setIsGameActive(false);
      setCurrentMultiplier(data.crashMultiplier);
    };

    const handleGameStarted = () => {
      setIsGameActive(true);
      setCurrentMultiplier(1.0);
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
  }, [onMultiplierUpdate]);

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
      </div>
      
      {/* Status indicators */}
      <div className="absolute top-4 left-4">
        <div className={`px-3 py-1 rounded text-sm font-bold ${
          isGameActive ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {isGameActive ? 'ACTIVE' : 'CRASHED'}
        </div>
      </div>
    </div>
  );
};

export default RealTimeChart;