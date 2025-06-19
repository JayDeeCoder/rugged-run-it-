import { FC, useEffect, useState } from 'react';
import { gameAPI, ChartAPI, ChartData } from '../../services/api';
import { Candle } from '../../types/trade';

interface RealTimeChartProps {
  gameId?: string;
  height?: number;
  onMultiplierUpdate?: (multiplier: number) => void;
  // NEW: Callback for peak multiplier updates
  onPeakMultiplierUpdate?: (peak: number, current: number) => void;
  // NEW: Callback when game ends with final stats
  onGameEnd?: (peakMultiplier: number, finalMultiplier: number, crashed: boolean) => void;
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
  const [peakMultiplier, setPeakMultiplier] = useState<number>(1.0); // NEW: Track peak
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

  // NEW: Track peak multiplier whenever current multiplier changes
  useEffect(() => {
    if (isGameActive && currentMultiplier > peakMultiplier) {
      console.log(`🎯 New peak multiplier: ${currentMultiplier.toFixed(2)}x (previous: ${peakMultiplier.toFixed(2)}x)`);
      setPeakMultiplier(currentMultiplier);
      
      // Notify parent component of peak update
      if (onPeakMultiplierUpdate) {
        onPeakMultiplierUpdate(currentMultiplier, currentMultiplier);
      }
    }
  }, [currentMultiplier, peakMultiplier, isGameActive, onPeakMultiplierUpdate]);

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
      console.log(`💥 Game crashed at ${data.crashMultiplier.toFixed(2)}x (peak was ${peakMultiplier.toFixed(2)}x)`);
      
      setIsGameActive(false);
      setCurrentMultiplier(data.crashMultiplier);
      
      // NEW: Notify parent that game ended with peak and final multipliers
      if (onGameEnd) {
        onGameEnd(peakMultiplier, data.crashMultiplier, true);
      }
    };

    const handleGameStarted = () => {
      console.log('🎮 New game started - resetting peak multiplier');
      
      setIsGameActive(true);
      setCurrentMultiplier(1.0);
      setPeakMultiplier(1.0); // NEW: Reset peak for new game
      setChartData([]); // Clear chart for new game
    };

    // NEW: Handle manual cashouts
    const handlePlayerCashOut = (data: { multiplier: number; walletAddress: string }) => {
      console.log(`💸 Player cashed out at ${data.multiplier.toFixed(2)}x (peak was ${peakMultiplier.toFixed(2)}x)`);
      
      // If it's the current user's cashout, record the game end
      // You might need to check if this is the current user's cashout
      if (onGameEnd) {
        onGameEnd(peakMultiplier, data.multiplier, false);
      }
    };

    gameAPI.on('multiplierUpdate', handleMultiplierUpdate);
    gameAPI.on('gameState', handleGameState);
    gameAPI.on('gameCrashed', handleGameCrashed);
    gameAPI.on('gameStarted', handleGameStarted);
    gameAPI.on('playerCashOut', handlePlayerCashOut); // NEW: Listen for cashouts

    return () => {
      gameAPI.off('multiplierUpdate', handleMultiplierUpdate);
      gameAPI.off('gameState', handleGameState);
      gameAPI.off('gameCrashed', handleGameCrashed);
      gameAPI.off('gameStarted', handleGameStarted);
      gameAPI.off('playerCashOut', handlePlayerCashOut);
    };
  }, [onMultiplierUpdate, onGameEnd, peakMultiplier]);

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
        
        {/* NEW: Show peak multiplier */}
        {peakMultiplier > 1.0 && (
          <div className="text-blue-400 text-sm mt-1">
            Peak: {peakMultiplier.toFixed(2)}x
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

      {/* NEW: Peak indicator */}
      {peakMultiplier > 2.0 && (
        <div className="absolute top-4 right-4">
          <div className="px-3 py-1 rounded text-sm font-bold bg-blue-600">
            PEAK: {peakMultiplier.toFixed(2)}x
          </div>
        </div>
      )}
    </div>
  );
};

export default RealTimeChart;