import { FC, useEffect, useState, useMemo, useCallback, useContext, useRef } from 'react';
import { Candle } from '../../types/trade';
import {
  createInitialTradingState,
  generateCandle,
} from '../../utils/gameDataGenerator';
import { UserContext } from '../../context/UserContext';

interface CandlestickChartProps {
  height?: number;
  currency?: string;
  maxCandles?: number;
  onMultiplierUpdate?: (multiplier: number) => void;
  triggerSellEffect?: boolean;
  onEffectComplete?: () => void;
  onGameCrash?: (crashMultiplier: number) => void;
  currentBet?: number;
  betPlacedAt?: number;
  useMobileHeight?: boolean;
  // ✨ NEW: Real server data props
  serverMultiplier?: number;
  serverGameStatus?: 'waiting' | 'active' | 'crashed';
  isServerConnected?: boolean;
}

// Helper functions for chart scaling and rendering
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

// SVG-based candle renderer component
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
  
  // Dynamic candle width based on number of candles
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
      
      {/* Candles */}
      {candles.map((candle, i) => {
        const x = startX + i * (candleWidth + spacing);
        const open = scaleY(candle.open);
        const close = scaleY(candle.close);
        const high = scaleY(candle.high);
        const low = scaleY(candle.low);
        
        const fill = candle.close > candle.open ? '#4AFA9A' : '#E33F64';
        
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
  onEffectComplete,
  onGameCrash,
  currentBet = 0,
  betPlacedAt,
  useMobileHeight = false,
  // ✨ NEW: Server data props
  serverMultiplier = 1.0,
  serverGameStatus = 'waiting',
  isServerConnected = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameStateRef = useRef(createInitialTradingState());
  
  // Calculate chart height based on device
  const chartHeight = useMobileHeight ? 300 : height;
  
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [candleData, setCandleData] = useState<Candle[]>([]);
  const [lastServerMultiplier, setLastServerMultiplier] = useState<number>(1.0);
  
  // ✨ RESTORED: Visual effect states
  const [isShaking, setIsShaking] = useState(false);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [showExplosion, setShowExplosion] = useState(false);
  const [explosionColor, setExplosionColor] = useState('rgba(251, 191, 36, 0.6)');
  const [milestoneText, setMilestoneText] = useState('');
  const [milestoneTextColor, setMilestoneTextColor] = useState('#FACC15');
  const [milestoneOpacity, setMilestoneOpacity] = useState(0);
  const [dangerLevel, setDangerLevel] = useState(0);
  const [safeLevel, setSafeLevel] = useState(0);
  const [showRugEffect, setShowRugEffect] = useState(false);
  const [peakMultiplier, setPeakMultiplier] = useState<number>(1.0);

  // ✨ RESTORED: Milestone tracking
  const lastMilestoneRef = useRef<number>(0);
  const milestones = useMemo(() => [2, 3, 5, 10, 15, 20, 25, 50, 75, 100], []);
  
  // User context
  const { currentUser } = useContext(UserContext);
  
  // Calculate Y-axis scale range based on candle data
  const yScale = useMemo(() => 
    calculateYScale(candleData, serverMultiplier), 
    [candleData, serverMultiplier]
  );
  
  // Measure container width for responsive SVG
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

  // ✨ RESTORED: Visual effects based on server multiplier
  const checkForEffects = useCallback((price: number) => {
    // Set danger level when price is below 1.0
    if (price < 1.0) {
      const dangerPercent = Math.round(((1.0 - price) / 0.8) * 100);
      setDangerLevel(Math.min(dangerPercent, 100));
      setSafeLevel(0);
    } else {
      // Set safe level when price is above 1.0
      const safePercent = Math.min(Math.round((price - 1.0) * 10), 50);
      setSafeLevel(safePercent);
      setDangerLevel(0);
    }
    
    // Check for milestone effects
    for (const milestone of milestones) {
      if (price >= milestone && lastMilestoneRef.current < milestone) {
        lastMilestoneRef.current = milestone;
        let intensity, color, textColor, shakeDuration;
        
        if (milestone <= 2) {
          intensity = 2;
          color = 'rgba(74, 222, 128, 0.6)';
          textColor = '#4ADE80';
          shakeDuration = 500;
        } else if (milestone <= 3) {
          intensity = 4;
          color = 'rgba(34, 211, 238, 0.6)';
          textColor = '#22D3EE';
          shakeDuration = 600;
        } else if (milestone <= 5) {
          intensity = 5;
          color = 'rgba(251, 191, 36, 0.6)';
          textColor = '#FACC15';
          shakeDuration = 700;
        } else if (milestone <= 10) {
          intensity = 7;
          color = 'rgba(249, 115, 22, 0.6)';
          textColor = '#F97316';
          shakeDuration = 800;
        } else if (milestone <= 20) {
          intensity = 8;
          color = 'rgba(239, 68, 68, 0.6)';
          textColor = '#EF4444';
          shakeDuration = 900;
        } else {
          intensity = 10;
          color = 'rgba(217, 70, 239, 0.6)';
          textColor = '#D946EF';
          shakeDuration = 1000;
        }
        
        setShakeIntensity(intensity);
        setExplosionColor(color);
        setMilestoneTextColor(textColor);
        
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), shakeDuration);
        
        setMilestoneText(`${milestone}X !!`);
        setShowExplosion(true);
        setMilestoneOpacity(1);
        
        setTimeout(() => {
          setMilestoneOpacity(0);
          setTimeout(() => {
            setShowExplosion(false);
          }, 1000);
        }, 1500);
        
        break;
      }
    }
    
    // Reset milestone if price drops significantly
    if (price < lastMilestoneRef.current * 0.8) {
      lastMilestoneRef.current = Math.floor(price);
    }
  }, [milestones]);

  // ✨ RESTORED: Rug effect animation
  const triggerRugEffect = useCallback((rugPrice: number) => {
    setShakeIntensity(10);
    setIsShaking(true);
    
    setExplosionColor('rgba(239, 68, 68, 0.8)');
    setMilestoneTextColor('#EF4444');
    setMilestoneText(`RUGGED @ ${peakMultiplier.toFixed(2)}X!`);
    setShowExplosion(true);
    setMilestoneOpacity(1);
    setShowRugEffect(true);
    
    if (onGameCrash) {
      onGameCrash(peakMultiplier);
    }
    
    setTimeout(() => {
      setIsShaking(false);
    }, 2000);
    
    setTimeout(() => {
      setMilestoneOpacity(0);
      setTimeout(() => {
        setShowExplosion(false);
        setShowRugEffect(false);
      }, 1000);
    }, 3000);
  }, [onGameCrash, peakMultiplier]);

  // ✨ NEW: Sync with real server data
  useEffect(() => {
    if (!isServerConnected) return;

    // Track peak multiplier
    if (serverMultiplier > peakMultiplier && serverGameStatus === 'active') {
      setPeakMultiplier(serverMultiplier);
    }

    // Handle game crash from server
    if (serverGameStatus === 'crashed' && lastServerMultiplier !== serverMultiplier) {
      triggerRugEffect(serverMultiplier);
      // Reset for next game
      setPeakMultiplier(1.0);
      lastMilestoneRef.current = 0;
    }

    // Generate visual candles based on server multiplier changes
    if (serverGameStatus === 'active' && serverMultiplier !== lastServerMultiplier) {
      const { candle } = generateCandle(gameStateRef.current);
      
      // Override candle close with real server multiplier
      candle.close = serverMultiplier;
      candle.high = Math.max(candle.high, serverMultiplier);
      candle.low = Math.min(candle.low, serverMultiplier);
      
      setCandleData(prev => {
        const updatedCandles = [...prev, candle];
        if (updatedCandles.length > maxCandles) {
          return updatedCandles.slice(-maxCandles);
        }
        return updatedCandles;
      });

      // Check for visual effects
      checkForEffects(serverMultiplier);
      
      // Update parent
      if (onMultiplierUpdate) {
        onMultiplierUpdate(serverMultiplier);
      }
    }

    // Reset for new game
    if (serverGameStatus === 'active' && lastServerMultiplier > serverMultiplier) {
      setCandleData([]);
      lastMilestoneRef.current = 0;
      setPeakMultiplier(1.0);
    }

    setLastServerMultiplier(serverMultiplier);
  }, [serverMultiplier, serverGameStatus, isServerConnected, lastServerMultiplier, checkForEffects, onMultiplierUpdate, triggerRugEffect, maxCandles]);

  return (
    <div 
      ref={containerRef}
      className="w-full relative bg-black border border-gray-800 rounded-lg overflow-hidden" 
      style={{ 
        height: `${chartHeight}px`,
        animation: isShaking ? `shake-${shakeIntensity} 0.5s cubic-bezier(.36,.07,.19,.97) both` : 'none'
      }}
    >
      {/* Current price indicator */}
      <div className={`absolute top-2 left-2 px-2 py-1 rounded text-sm font-bold z-10 ${
        serverGameStatus === 'crashed' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black'
      }`}>
        {serverMultiplier.toFixed(2)}x {currency}
      </div>
      
      {/* Connection status */}
      <div className={`absolute top-2 right-2 px-2 py-1 rounded text-sm font-bold z-10 ${
        !isServerConnected ? 'bg-red-500 text-white' :
        serverGameStatus === 'active' ? 'bg-green-500 text-white' : 
        serverGameStatus === 'crashed' ? 'bg-red-500 text-white animate-pulse' :
        'bg-yellow-500 text-black'
      }`}>
        {!isServerConnected ? 'OFFLINE' :
         serverGameStatus === 'active' ? 'ACTIVE' : 
         serverGameStatus === 'crashed' ? 'CRASHED' : 'WAITING'}
      </div>
      
      {/* Active bet indicator */}
      {currentBet > 0 && (
        <div className="absolute top-10 right-2 bg-blue-500 text-white px-2 py-1 rounded text-sm font-bold z-10">
          Bet: {currentBet.toFixed(3)} SOL
        </div>
      )}
      
      {/* ✨ RESTORED: Danger overlay (red gradient) */}
      {dangerLevel > 0 && (
        <div 
          className="absolute inset-0 pointer-events-none z-20"
          style={{ 
            background: `linear-gradient(transparent, rgba(220, 38, 38, ${dangerLevel/200}))`,
            transition: 'opacity 0.5s ease'
          }}
        />
      )}
      
      {/* ✨ RESTORED: Safe overlay (green gradient) */}
      {safeLevel > 0 && (
        <div 
          className="absolute inset-0 pointer-events-none z-20"
          style={{ 
            background: `linear-gradient(transparent, rgba(16, 185, 129, ${safeLevel/200}))`,
            transition: 'opacity 0.5s ease'
          }}
        />
      )}
      
      {/* Chart area */}
      <div className="absolute inset-0 pt-16 pb-4 px-4">
        {containerWidth > 0 && isServerConnected ? (
          <CandlestickSVG 
            candles={candleData} 
            width={containerWidth - 8} 
            height={chartHeight - 80} 
            minValue={yScale.min} 
            maxValue={yScale.max}
            currentPrice={serverMultiplier}
            betPlacedAt={currentBet > 0 ? betPlacedAt : undefined}
            gameStatus={serverGameStatus}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 text-center">
              <div className="text-lg mb-2">
                {!isServerConnected ? 'Connecting to game server...' : 'Waiting for game data...'}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* ✨ RESTORED: Explosion effect and milestone text */}
      {showExplosion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="relative">
            <div className="absolute -inset-12 animate-pulse" style={{ 
              background: `radial-gradient(circle, ${explosionColor} 0%, transparent 70%)`,
              animation: 'pulse 1s cubic-bezier(0,0,0.2,1) infinite',
              transform: 'scale(1)'
            }} />
            
            <div 
              className="text-6xl font-dynapuff font-extrabold"
              style={{ 
                color: milestoneTextColor,
                opacity: milestoneOpacity,
                transition: 'opacity 1s ease',
                textShadow: `0 0 10px ${explosionColor}, 0 0 20px ${explosionColor}`
              }}
            >
              {milestoneText}
            </div>
          </div>
        </div>
      )}
      
      {/* ✨ RESTORED: Rug Effect animation */}
      {showRugEffect && (
        <div className="absolute inset-0 pointer-events-none z-40">
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(circle, rgba(255,0,0,0.4) 0%, transparent 70%)',
            animation: 'rug-pulse 0.8s ease-in-out infinite'
          }} />
          
          {/* Particles falling from top */}
          <div className="absolute top-0 w-full h-full overflow-hidden">
            {Array.from({ length: 50 }).map((_, i) => {
              const size = Math.random() * 12 + 5;
              const opacity = Math.random() * 0.7 + 0.3;
              const delay = Math.random() * 2;
              const duration = Math.random() * 2 + 1;
              const leftPos = Math.random() * 100;
              
              return (
                <div 
                  key={i}
                  className="absolute"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: i % 3 === 0 ? '#FF0000' : i % 3 === 1 ? '#FF5500' : '#FF0000',
                    borderRadius: '50%',
                    left: `${leftPos}%`,
                    top: '-20px',
                    opacity,
                    animation: `fall-down ${duration}s linear forwards`,
                    animationDelay: `${delay}s`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
      
      {/* ✨ RESTORED: CSS for animations */}
      <style jsx>{`
        @keyframes shake-2 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        @keyframes shake-4 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
        @keyframes shake-5 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes shake-7 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
        @keyframes shake-8 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
        @keyframes shake-10 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
          20%, 40%, 60%, 80% { transform: translateX(10px); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        @keyframes fall-down {
          0% { transform: translateY(0); }
          100% { transform: translateY(100vh); }
        }
        
        @keyframes rug-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default CandlestickChart;