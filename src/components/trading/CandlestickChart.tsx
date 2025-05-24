import { FC, useEffect, useState, useMemo, useCallback, useContext, useRef } from 'react';
import { useGameSocket } from '../../hooks/useGameSocket';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';

// Simplified Candle interface for real server data
interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  height?: number;
  currency?: string;
  maxCandles?: number;
  onMultiplierUpdate?: (multiplier: number) => void;
  onGameCrash?: (crashMultiplier: number) => void;
  currentBet?: number;
  betPlacedAt?: number;
  useMobileHeight?: boolean;
}

// Helper function for chart scaling
const calculateYScale = (candles: Candle[], currentMultiplier: number) => {
  if (candles.length === 0) {
    return { min: 0.5, max: Math.max(currentMultiplier * 1.2, 2.0) };
  }
  
  const allValues = [
    ...candles.map(c => [c.high, c.low]).flat(),
    currentMultiplier
  ];
  
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  
  const padding = 0.2;
  const max = maxValue * (1 + padding);
  const min = Math.max(minValue * (1 - padding), 0.5);
  
  return { min, max };
};

// SVG Chart Component
const CandlestickSVG: FC<{
  candles: Candle[], 
  width: number, 
  height: number, 
  minValue: number, 
  maxValue: number,
  currentPrice: number,
  betPlacedAt?: number,
  gameStatus: 'waiting' | 'active' | 'crashed'
}> = ({ candles, width, height, minValue, maxValue, currentPrice, betPlacedAt, gameStatus }) => {
  
  const scaleY = useCallback((value: number) => {
    const clampedValue = Math.max(Math.min(value, maxValue), minValue);
    const scaledY = height - ((clampedValue - minValue) / (maxValue - minValue)) * height;
    const padding = 10;
    return Math.min(Math.max(scaledY, padding), height - padding);
  }, [height, minValue, maxValue]);
  
  // Dynamic candle width
  const chartMargin = 60;
  const availableWidth = width - chartMargin;
  const candleCount = Math.max(candles.length, 1);
  const candleWidth = Math.max(3, Math.min(20, availableWidth / candleCount - 1));
  const spacing = 1;
  
  const totalWidthNeeded = candles.length * (candleWidth + spacing);
  const startX = Math.max(40, (width - totalWidthNeeded) / 2);
  
  const baselineY = scaleY(1.0);
  
  return (
    <svg width={width} height={height} className="candlestick-svg">
      {/* Background grid */}
      {[0.2, 0.4, 0.6, 0.8].map((ratio, i) => (
        <line 
          key={`grid-${i}`}
          x1={0} 
          y1={height * ratio} 
          x2={width} 
          y2={height * ratio} 
          stroke="rgba(255, 255, 255, 0.05)" 
          strokeWidth={1} 
        />
      ))}
      
      {/* 1.0x baseline */}
      <line 
        x1={0} 
        y1={baselineY} 
        x2={width} 
        y2={baselineY} 
        stroke="#FFFFFF" 
        strokeWidth={1.5}
      />
      <text 
        x={5} 
        y={baselineY - 5} 
        fontSize={11} 
        fontWeight="bold"
        fill="#FFFFFF"
      >
        1.00x
      </text>
      
      {/* Entry point line */}
      {betPlacedAt && (
        <>
          <line 
            x1={0} 
            y1={scaleY(betPlacedAt)} 
            x2={width} 
            y2={scaleY(betPlacedAt)} 
            stroke="#3B82F6"
            strokeWidth={1.5}
            strokeDasharray="5,3" 
          />
          <text 
            x={5} 
            y={scaleY(betPlacedAt) - 5} 
            fontSize={11} 
            fontWeight="bold"
            fill="#3B82F6"
          >
            Entry: {betPlacedAt.toFixed(2)}x
          </text>
        </>
      )}
      
      {/* Y-axis labels */}
      {[0.2, 0.4, 0.6, 0.8, 1].map((ratio, i) => {
        const yPos = height * ratio;
        const priceValue = minValue + (maxValue - minValue) * (1 - ratio);
        return (
          <text 
            key={`price-${i}`}
            x={5} 
            y={yPos - 5} 
            fontSize={10} 
            fill="rgba(255, 255, 255, 0.6)"
          >
            {priceValue.toFixed(2)}x
          </text>
        );
      })}
      
      {/* Candles - simplified representation of multiplier progression */}
      {candles.map((candle, i) => {
        const x = startX + i * (candleWidth + spacing);
        const open = scaleY(candle.open);
        const close = scaleY(candle.close);
        const high = scaleY(candle.high);
        const low = scaleY(candle.low);
        
        const isUp = candle.close > candle.open;
        const fill = isUp ? '#4AFA9A' : '#E33F64';
        
        return (
          <g key={`candle-${i}`}>
            {/* Wick */}
            <line 
              x1={x + candleWidth/2} 
              y1={high} 
              x2={x + candleWidth/2} 
              y2={low} 
              stroke="rgba(180, 180, 180, 0.7)"
              strokeWidth={Math.max(1, candleWidth / 10)}
            />
            
            {/* Body */}
            <rect 
              x={x} 
              y={Math.min(open, close)} 
              width={candleWidth} 
              height={Math.max(Math.abs(close - open), 1)} 
              fill={fill} 
            />
          </g>
        );
      })}
      
      {/* Current price line */}
      <line 
        x1={0} 
        y1={scaleY(currentPrice)} 
        x2={width} 
        y2={scaleY(currentPrice)} 
        stroke={gameStatus === 'crashed' ? "#EF4444" : "#fbbf24"} 
        strokeWidth={2} 
        strokeDasharray="5,3" 
      />
      
      {/* Current price label */}
      <g transform={`translate(${Math.max(0, width - 70)}, ${Math.min(scaleY(currentPrice) - 15, height - 35)})`}>
        <rect x={0} y={0} width={65} height={25} rx={4} fill={gameStatus === 'crashed' ? "#EF4444" : "#fbbf24"} />
        <text x={32} y={17} fontSize={13} fontWeight="bold" textAnchor="middle" fill="#000">
          {currentPrice.toFixed(2)}x
        </text>
      </g>
    </svg>
  );
};

const CandlestickChart: FC<CandlestickChartProps> = ({
  height = 400,
  currency = 'SOL',
  maxCandles = 15,
  onMultiplierUpdate,
  onGameCrash,
  currentBet = 0,
  betPlacedAt,
  useMobileHeight = false
}) => {
  // Refs and state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [candleData, setCandleData] = useState<Candle[]>([]);
  const [lastGameNumber, setLastGameNumber] = useState<number>(0);
  const [milestoneEffects, setMilestoneEffects] = useState({
    showEffect: false,
    text: '',
    color: '#FACC15'
  });
  const [lastMilestone, setLastMilestone] = useState<number>(0);
  
  // Hooks
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { currentUser } = useContext(UserContext);
  
  // Get wallet address for game socket
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // Connect to real game server
  const { currentGame, isConnected } = useGameSocket(walletAddress, currentUser?.id);
  
  const chartHeight = useMobileHeight ? 300 : height;
  
  // Current multiplier from real server
  const currentMultiplier = currentGame?.multiplier || 1.0;
  const gameStatus = currentGame?.status || 'waiting';
  
  // Calculate Y-axis scale
  const yScale = useMemo(() => 
    calculateYScale(candleData, currentMultiplier), 
    [candleData, currentMultiplier]
  );
  
  // Measure container width
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);
  
  // Create candle data from multiplier progression
  useEffect(() => {
    if (!currentGame) return;
    
    // Reset candles when new game starts
    if (currentGame.gameNumber !== lastGameNumber) {
      setCandleData([]);
      setLastMilestone(0);
      setLastGameNumber(currentGame.gameNumber);
      return;
    }
    
    // Only add candles when game is active and multiplier is progressing
    if (gameStatus === 'active' && currentMultiplier > 1.0) {
      const now = Date.now();
      
      setCandleData(prev => {
        // Create a new candle every few seconds or when significant price movement occurs
        const shouldCreateNewCandle = prev.length === 0 || 
          (now - prev[prev.length - 1].timestamp > 2000) || // Every 2 seconds
          (Math.abs(currentMultiplier - prev[prev.length - 1].close) > 0.1); // Significant movement
        
        if (shouldCreateNewCandle) {
          const lastClose = prev.length > 0 ? prev[prev.length - 1].close : 1.0;
          
          // Create realistic candle data based on multiplier progression
          const volatility = 0.02; // Small volatility for realistic look
          const basePrice = lastClose;
          const targetPrice = currentMultiplier;
          
          // Simple price interpolation with small random variations
          const open = basePrice;
          const close = targetPrice;
          const high = Math.max(open, close) * (1 + Math.random() * volatility);
          const low = Math.min(open, close) * (1 - Math.random() * volatility);
          
          const newCandle: Candle = {
            timestamp: now,
            open,
            high,
            low,
            close,
            volume: currentGame.totalBets || 0
          };
          
          const updated = [...prev, newCandle];
          
          // Keep only recent candles for display
          if (updated.length > maxCandles) {
            return updated.slice(-maxCandles);
          }
          
          return updated;
        }
        
        // Update the last candle's close price to current multiplier
        if (prev.length > 0) {
          const updated = [...prev];
          const lastCandle = { ...updated[updated.length - 1] };
          lastCandle.close = currentMultiplier;
          lastCandle.high = Math.max(lastCandle.high, currentMultiplier);
          lastCandle.low = Math.min(lastCandle.low, currentMultiplier);
          updated[updated.length - 1] = lastCandle;
          return updated;
        }
        
        return prev;
      });
    }
  }, [currentGame, currentMultiplier, gameStatus, lastGameNumber, maxCandles]);
  
  // Handle milestone effects
  useEffect(() => {
    const milestones = [2, 3, 5, 10, 15, 20, 25, 50, 75, 100];
    
    for (const milestone of milestones) {
      if (currentMultiplier >= milestone && lastMilestone < milestone) {
        setLastMilestone(milestone);
        
        // Set effect based on milestone
        let color = '#FACC15'; // Default yellow
        if (milestone >= 50) color = '#D946EF'; // Purple for very high
        else if (milestone >= 20) color = '#EF4444'; // Red for high
        else if (milestone >= 10) color = '#F97316'; // Orange for medium-high
        else if (milestone >= 5) color = '#FACC15'; // Yellow for medium
        else if (milestone >= 2) color = '#4ADE80'; // Green for low
        
        setMilestoneEffects({
          showEffect: true,
          text: `${milestone}X!`,
          color
        });
        
        // Hide effect after delay
        setTimeout(() => {
          setMilestoneEffects(prev => ({ ...prev, showEffect: false }));
        }, 2000);
        
        break;
      }
    }
    
    // Reset milestone if multiplier drops significantly
    if (currentMultiplier < lastMilestone * 0.8) {
      setLastMilestone(Math.floor(currentMultiplier));
    }
  }, [currentMultiplier, lastMilestone]);
  
  // Notify parent of multiplier updates
  useEffect(() => {
    if (onMultiplierUpdate) {
      onMultiplierUpdate(currentMultiplier);
    }
  }, [currentMultiplier, onMultiplierUpdate]);
  
  // Handle game crash
  useEffect(() => {
    if (gameStatus === 'crashed' && onGameCrash) {
      onGameCrash(currentMultiplier);
    }
  }, [gameStatus, currentMultiplier, onGameCrash]);
  
  return (
    <div 
      ref={containerRef}
      className="w-full relative bg-black border border-gray-800 rounded-lg overflow-hidden" 
      style={{ height: `${chartHeight}px` }}
    >
      {/* Current price indicator */}
      <div className={`absolute top-2 left-2 px-2 py-1 rounded text-sm font-bold z-10 ${
        gameStatus === 'crashed' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black'
      }`}>
        {currentMultiplier.toFixed(2)}x {currency}
      </div>
      
      {/* Connection status */}
      <div className={`absolute top-2 right-2 px-2 py-1 rounded text-sm font-bold z-10 ${
        !isConnected ? 'bg-red-500 text-white' :
        gameStatus === 'active' ? 'bg-green-500 text-white' : 
        gameStatus === 'crashed' ? 'bg-red-500 text-white animate-pulse' :
        'bg-yellow-500 text-black'
      }`}>
        {!isConnected ? 'OFFLINE' :
         gameStatus === 'active' ? 'ACTIVE' : 
         gameStatus === 'crashed' ? 'CRASHED' : 'WAITING'}
      </div>
      
      {/* Game info */}
      {currentGame && (
        <div className="absolute top-10 left-2 text-xs text-gray-400 z-10">
          Game #{currentGame.gameNumber} • {currentGame.totalPlayers} players
        </div>
      )}
      
      {/* Active bet indicator */}
      {currentBet > 0 && (
        <div className="absolute top-10 right-2 bg-blue-500 text-white px-2 py-1 rounded text-sm font-bold z-10">
          Bet: {currentBet.toFixed(3)} SOL
        </div>
      )}
      
      {/* Chart area */}
      <div className="absolute inset-0 pt-16 pb-4 px-4">
        {containerWidth > 0 && isConnected ? (
          <CandlestickSVG 
            candles={candleData} 
            width={containerWidth - 8} 
            height={chartHeight - 80} 
            minValue={yScale.min} 
            maxValue={yScale.max}
            currentPrice={currentMultiplier}
            betPlacedAt={currentBet > 0 ? betPlacedAt : undefined}
            gameStatus={gameStatus}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 text-center">
              <div className="text-lg mb-2">
                {!isConnected ? 'Connecting to game server...' : 'Waiting for game data...'}
              </div>
              <div className="text-sm">
                {!authenticated && 'Login to participate in games'}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Milestone effect */}
      {milestoneEffects.showEffect && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div 
            className="text-6xl font-bold animate-pulse"
            style={{ 
              color: milestoneEffects.color,
              textShadow: `0 0 20px ${milestoneEffects.color}`,
              animation: 'milestone-pop 2s ease-out forwards'
            }}
          >
            {milestoneEffects.text}
          </div>
        </div>
      )}
      
      {/* Simple CSS animations */}
      <style jsx>{`
        @keyframes milestone-pop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default CandlestickChart;