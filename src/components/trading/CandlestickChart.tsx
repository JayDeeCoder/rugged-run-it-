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
  // Real server data props
  serverMultiplier?: number;
  serverGameStatus?: 'waiting' | 'active' | 'crashed';
  isServerConnected?: boolean;
}

// ENHANCED: Helper functions for chart scaling with proper margins
const calculateYScale = (candles: Candle[], currentMultiplier: number, isMobile: boolean = false) => {
  // Always ensure 1.0x baseline is visible with proper padding
  const baselinePadding = isMobile ? 0.3 : 0.4;
  
  if (candles.length === 0) {
    return { 
      min: Math.max(0.3, 1.0 - baselinePadding), 
      max: Math.max(currentMultiplier * 1.3, 2.5) 
    };
  }
  
  const allValues = [
    ...candles.map(c => [c.high, c.low]).flat(),
    currentMultiplier,
    1.0 // Always include baseline
  ];
  
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues, 1.0);
  
  // Enhanced padding calculation for mobile vs desktop
  const topPadding = isMobile ? 0.25 : 0.3;
  const bottomPadding = isMobile ? 0.15 : 0.2;
  
  const max = maxValue * (1 + topPadding);
  const min = Math.max(minValue * (1 - bottomPadding), 0.2);
  
  // Ensure 1.0x baseline is always comfortably visible
  const adjustedMin = Math.min(min, 1.0 - baselinePadding);
  const adjustedMax = Math.max(max, 1.0 + baselinePadding);
  
  return { min: adjustedMin, max: adjustedMax };
};

// ENHANCED: SVG-based candle renderer with improved margins and mobile optimization
const CandlestickSVG: FC<{
  candles: Candle[], 
  width: number, 
  height: number, 
  minValue: number, 
  maxValue: number,
  currentPrice: number,
  betPlacedAt?: number,
  gameStatus: 'waiting' | 'active' | 'crashed',
  isMobile?: boolean
}> = ({ candles, width, height, minValue, maxValue, currentPrice, betPlacedAt, gameStatus, isMobile = false }) => {
  
  // ENHANCED: Improved scaling with proper margins to prevent cutoff
  const scaleY = useCallback((value: number) => {
    const clampedValue = Math.max(Math.min(value, maxValue), minValue);
    const topMargin = isMobile ? 15 : 20;
    const bottomMargin = isMobile ? 15 : 20;
    const usableHeight = height - topMargin - bottomMargin;
    
    const scaledY = topMargin + usableHeight - ((clampedValue - minValue) / (maxValue - minValue)) * usableHeight;
    return Math.min(Math.max(scaledY, topMargin), height - bottomMargin);
  }, [height, minValue, maxValue, isMobile]);
  
  // ENHANCED: Dynamic sizing for mobile optimization
  const chartMargin = isMobile ? 35 : 50;
  const labelWidth = isMobile ? 30 : 40;
  const availableWidth = width - chartMargin - labelWidth;
  const candleCount = Math.max(candles.length, 1);
  const candleWidth = Math.max(isMobile ? 2 : 3, Math.min(isMobile ? 12 : 20, availableWidth / candleCount - 1));
  const spacing = isMobile ? 0.5 : 1;
  
  const totalWidthNeeded = candles.length * (candleWidth + spacing);
  const startX = labelWidth + Math.max(5, (availableWidth - totalWidthNeeded) / 2);
  
  const baselineY = scaleY(1.0);
  
  return (
    <svg width={width} height={height} className="candlestick-svg">
      {/* Background grid - less dense on mobile */}
      {(isMobile ? [0.25, 0.5, 0.75] : [0.2, 0.4, 0.6, 0.8]).map((ratio, i) => (
        <line 
          key={`grid-${i}`}
          x1={labelWidth} 
          y1={height * ratio} 
          x2={width - 5} 
          y2={height * ratio} 
          stroke="rgba(255, 255, 255, 0.05)" 
          strokeWidth={1} 
        />
      ))}
      
      {/* ENHANCED: 1.0x baseline - always visible with proper contrast */}
      <line 
        x1={labelWidth} 
        y1={baselineY} 
        x2={width - 5} 
        y2={baselineY} 
        stroke="#FFFFFF" 
        strokeWidth={isMobile ? 1.5 : 2}
        strokeDasharray={isMobile ? "3,2" : "4,3"}
      />
      <text 
        x={5} 
        y={baselineY - 3} 
        fontSize={isMobile ? 9 : 11} 
        fontWeight="bold"
        fill="#FFFFFF"
      >
        1.00x
      </text>
      
      {/* ENHANCED: Entry point line with better visibility */}
      {betPlacedAt && betPlacedAt !== 1.0 && (
        <>
          <line 
            x1={labelWidth} 
            y1={scaleY(betPlacedAt)} 
            x2={width - 5} 
            y2={scaleY(betPlacedAt)} 
            stroke="#3B82F6"
            strokeWidth={isMobile ? 1.5 : 2}
            strokeDasharray={isMobile ? "4,2" : "5,3"} 
          />
          <text 
            x={5} 
            y={scaleY(betPlacedAt) - 3} 
            fontSize={isMobile ? 8 : 10} 
            fontWeight="bold"
            fill="#3B82F6"
          >
            {betPlacedAt.toFixed(2)}x
          </text>
        </>
      )}
      
      {/* ENHANCED: Y-axis labels with better spacing for mobile */}
      {(isMobile ? [0.2, 0.5, 0.8] : [0.15, 0.35, 0.55, 0.75, 0.95]).map((ratio, i) => {
        const yPos = height * ratio;
        const priceValue = minValue + (maxValue - minValue) * (1 - ratio);
        return (
          <text 
            key={`price-${i}`}
            x={3} 
            y={yPos + 3} 
            fontSize={isMobile ? 8 : 9} 
            fill="rgba(255, 255, 255, 0.6)"
            textAnchor="start"
          >
            {priceValue.toFixed(2)}
          </text>
        );
      })}
      
      {/* Candles with enhanced mobile rendering and dramatic crash visualization */}
      {candles.map((candle, i) => {
        const x = startX + i * (candleWidth + spacing);
        const open = scaleY(candle.open);
        const close = scaleY(candle.close);
        const high = scaleY(candle.high);
        const low = scaleY(candle.low);
        
        // Enhanced crash candle detection - dramatic red for big drops
        const priceChange = candle.close - candle.open;
        const percentChange = Math.abs(priceChange) / candle.open;
        const isCrashCandle = priceChange < 0 && percentChange > 0.5; // 50%+ drop
        
        const fill = isCrashCandle 
          ? '#DC2626' // Dark red for crash
          : candle.close > candle.open 
            ? '#4AFA9A' // Green for up
            : '#E33F64'; // Regular red for down
            
        const wickWidth = Math.max(1, candleWidth / (isMobile ? 8 : 10));
        const bodyHeight = Math.max(Math.abs(close - open), isCrashCandle ? 3 : 1);
        
        return (
          <g key={`candle-${i}`}>
            {/* Wick */}
            <line 
              x1={x + candleWidth/2} 
              y1={high} 
              x2={x + candleWidth/2} 
              y2={low} 
              stroke={isCrashCandle ? "#991B1B" : "rgba(180, 180, 180, 0.7)"}
              strokeWidth={isCrashCandle ? Math.max(2, wickWidth * 1.5) : wickWidth}
            />
            
            {/* Body with crash emphasis */}
            <rect 
              x={x} 
              y={Math.min(open, close)} 
              width={candleWidth} 
              height={bodyHeight} 
              fill={fill}
              stroke={isCrashCandle ? "#7F1D1D" : "none"}
              strokeWidth={isCrashCandle ? 1 : 0}
            />
            
            {/* Extra crash effect - red glow */}
            {isCrashCandle && (
              <rect 
                x={x - 1} 
                y={Math.min(open, close) - 1} 
                width={candleWidth + 2} 
                height={bodyHeight + 2} 
                fill="none"
                stroke="#DC2626"
                strokeWidth={0.5}
                opacity={0.6}
              />
            )}
          </g>
        );
      })}
      
      {/* ENHANCED: Current price line with better mobile visibility */}
      <line 
        x1={labelWidth} 
        y1={scaleY(currentPrice)} 
        x2={width - 5} 
        y2={scaleY(currentPrice)} 
        stroke={gameStatus === 'crashed' ? "#EF4444" : "#fbbf24"} 
        strokeWidth={isMobile ? 2 : 3} 
        strokeDasharray={isMobile ? "4,2" : "5,3"} 
      />
      
      {/* ENHANCED: Current price label with responsive sizing */}
      <g transform={`translate(${Math.max(labelWidth, width - (isMobile ? 55 : 70))}, ${Math.min(scaleY(currentPrice) - (isMobile ? 12 : 15), height - (isMobile ? 25 : 35))})`}>
        <rect 
          x={0} 
          y={0} 
          width={isMobile ? 50 : 65} 
          height={isMobile ? 20 : 25} 
          rx={isMobile ? 3 : 4} 
          fill={gameStatus === 'crashed' ? "#EF4444" : "#fbbf24"} 
        />
        <text 
          x={isMobile ? 25 : 32} 
          y={isMobile ? 14 : 17} 
          fontSize={isMobile ? 11 : 13} 
          fontWeight="bold" 
          textAnchor="middle" 
          fill="#000"
        >
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
  // Server data props
  serverMultiplier = 1.0,
  serverGameStatus = 'waiting',
  isServerConnected = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameStateRef = useRef(createInitialTradingState());
  
  // ENHANCED: Responsive height calculation with smaller mobile sizes
  const isMobile = useMobileHeight;
  const chartHeight = isMobile ? Math.min(height, 240) : height;
  
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [candleData, setCandleData] = useState<Candle[]>([]);
  const [lastServerMultiplier, setLastServerMultiplier] = useState<number>(1.0);
  
  // Visual effect states - PRESERVED
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

  // Milestone tracking - PRESERVED
  const lastMilestoneRef = useRef<number>(0);
  const milestones = useMemo(() => isMobile ? [2, 5, 10, 20, 50] : [2, 3, 5, 10, 15, 20, 25, 50, 75, 100], [isMobile]);
  
  // User context
  const { currentUser } = useContext(UserContext);
  
  // ENHANCED: Y-axis scale with mobile consideration
  const yScale = useMemo(() => 
    calculateYScale(candleData, serverMultiplier, isMobile), 
    [candleData, serverMultiplier, isMobile]
  );
  
  // ENHANCED: Container measurement with better responsiveness
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const newWidth = entry.contentRect.width;
          setContainerWidth(newWidth);
        }
      });
      
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Visual effects based on server multiplier - PRESERVED
  const checkForEffects = useCallback((price: number) => {
    // Danger/safe level indicators
    if (price < 1.0) {
      const dangerPercent = Math.round(((1.0 - price) / 0.8) * 100);
      setDangerLevel(Math.min(dangerPercent, 100));
      setSafeLevel(0);
    } else {
      const safePercent = Math.min(Math.round((price - 1.0) * 10), 50);
      setSafeLevel(safePercent);
      setDangerLevel(0);
    }
    
    // Milestone effects with mobile optimization
    for (const milestone of milestones) {
      if (price >= milestone && lastMilestoneRef.current < milestone) {
        lastMilestoneRef.current = milestone;
        let intensity, color, textColor, shakeDuration;
        
        // Reduced intensity for mobile
        const mobileMultiplier = isMobile ? 0.6 : 1.0;
        
        if (milestone <= 2) {
          intensity = 2 * mobileMultiplier;
          color = 'rgba(74, 222, 128, 0.6)';
          textColor = '#4ADE80';
          shakeDuration = 400;
        } else if (milestone <= 3) {
          intensity = 4 * mobileMultiplier;
          color = 'rgba(34, 211, 238, 0.6)';
          textColor = '#22D3EE';
          shakeDuration = 500;
        } else if (milestone <= 5) {
          intensity = 5 * mobileMultiplier;
          color = 'rgba(251, 191, 36, 0.6)';
          textColor = '#FACC15';
          shakeDuration = 600;
        } else if (milestone <= 10) {
          intensity = 7 * mobileMultiplier;
          color = 'rgba(249, 115, 22, 0.6)';
          textColor = '#F97316';
          shakeDuration = 700;
        } else if (milestone <= 20) {
          intensity = 8 * mobileMultiplier;
          color = 'rgba(239, 68, 68, 0.6)';
          textColor = '#EF4444';
          shakeDuration = 800;
        } else {
          intensity = 10 * mobileMultiplier;
          color = 'rgba(217, 70, 239, 0.6)';
          textColor = '#D946EF';
          shakeDuration = 900;
        }
        
        setShakeIntensity(intensity);
        setExplosionColor(color);
        setMilestoneTextColor(textColor);
        
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), shakeDuration);
        
        setMilestoneText(`${milestone}X ${isMobile ? '!' : '!!'}`);
        setShowExplosion(true);
        setMilestoneOpacity(1);
        
        setTimeout(() => {
          setMilestoneOpacity(0);
          setTimeout(() => {
            setShowExplosion(false);
          }, 800);
        }, isMobile ? 1200 : 1500);
        
        break;
      }
    }
    
    // Reset milestone if price drops significantly
    if (price < lastMilestoneRef.current * 0.8) {
      lastMilestoneRef.current = Math.floor(price);
    }
  }, [milestones, isMobile]);

  // Rug effect animation - PRESERVED with mobile optimization
  const triggerRugEffect = useCallback((rugPrice: number) => {
    setShakeIntensity(isMobile ? 6 : 10);
    setIsShaking(true);
    
    setExplosionColor('rgba(239, 68, 68, 0.8)');
    setMilestoneTextColor('#EF4444');
    setMilestoneText(isMobile ? `RUGGED!` : `RUGGED @ ${peakMultiplier.toFixed(2)}X!`);
    setShowExplosion(true);
    setMilestoneOpacity(1);
    setShowRugEffect(true);
    
    if (onGameCrash) {
      onGameCrash(peakMultiplier);
    }
    
    setTimeout(() => {
      setIsShaking(false);
    }, isMobile ? 1500 : 2000);
    
    setTimeout(() => {
      setMilestoneOpacity(0);
      setTimeout(() => {
        setShowExplosion(false);
        setShowRugEffect(false);
      }, 800);
    }, isMobile ? 2000 : 3000);
  }, [onGameCrash, peakMultiplier, isMobile]);

  // ENHANCED: Real server data synchronization with proper rug pull candle
  useEffect(() => {
    if (!isServerConnected) return;

    // Track peak multiplier
    if (serverMultiplier > peakMultiplier && serverGameStatus === 'active') {
      setPeakMultiplier(serverMultiplier);
    }

    // Handle game crash from server - CREATE RUG PULL CANDLE
    if (serverGameStatus === 'crashed' && lastServerMultiplier !== serverMultiplier) {
      // Create dramatic red candle showing the rug pull
      const rugCandle: Candle = {
        timestamp: new Date().toISOString(), // Convert to string
        open: peakMultiplier, // Open at peak
        high: peakMultiplier, // High was the peak
        low: Math.min(serverMultiplier, 0.1), // Low is crash point or very low
        close: serverMultiplier, // Close at crash point
        volume: 100 // High volume for crash
      };

      setCandleData(prev => {
        const updatedCandles = [...prev, rugCandle];
        const maxCandlesForScreen = isMobile ? Math.min(maxCandles, 10) : maxCandles;
        if (updatedCandles.length > maxCandlesForScreen) {
          return updatedCandles.slice(-maxCandlesForScreen);
        }
        return updatedCandles;
      });

      triggerRugEffect(serverMultiplier);
      // Reset for next game
      setPeakMultiplier(1.0);
      lastMilestoneRef.current = 0;
    }

    // Generate visual candles based on server multiplier changes during active game
    if (serverGameStatus === 'active' && Math.abs(serverMultiplier - lastServerMultiplier) > 0.01) {
      const { candle } = generateCandle(gameStateRef.current);
      
      // Override candle with real server data and fix timestamp type
      candle.timestamp = new Date().toISOString(); // Fix timestamp type
      candle.close = serverMultiplier;
      candle.high = Math.max(candle.high, serverMultiplier);
      candle.low = Math.min(candle.low, serverMultiplier);
      
      setCandleData(prev => {
        const updatedCandles = [...prev, candle];
        const maxCandlesForScreen = isMobile ? Math.min(maxCandles, 10) : maxCandles;
        if (updatedCandles.length > maxCandlesForScreen) {
          return updatedCandles.slice(-maxCandlesForScreen);
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
    if (serverGameStatus === 'waiting' && candleData.length > 0) {
      setCandleData([]);
      lastMilestoneRef.current = 0;
      setPeakMultiplier(1.0);
    }

    setLastServerMultiplier(serverMultiplier);
  }, [serverMultiplier, serverGameStatus, isServerConnected, lastServerMultiplier, checkForEffects, onMultiplierUpdate, triggerRugEffect, maxCandles, isMobile, candleData.length]);

  return (
    <div 
      ref={containerRef}
      className="w-full relative bg-black border border-gray-800 rounded-lg overflow-hidden" 
      style={{ 
        height: `${chartHeight}px`,
        animation: isShaking ? `shake-${Math.ceil(shakeIntensity)} 0.5s cubic-bezier(.36,.07,.19,.97) both` : 'none'
      }}
    >
      {/* ENHANCED: Status indicators with mobile optimization */}
      <div className={`absolute top-1 left-1 px-2 py-1 rounded ${isMobile ? 'text-xs' : 'text-sm'} font-bold z-10 ${
        serverGameStatus === 'crashed' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black'
      }`}>
        {serverMultiplier.toFixed(2)}x {isMobile ? '' : currency}
      </div>
      
      <div className={`absolute top-1 right-1 px-2 py-1 rounded ${isMobile ? 'text-xs' : 'text-sm'} font-bold z-10 ${
        !isServerConnected ? 'bg-red-500 text-white' :
        serverGameStatus === 'active' ? 'bg-green-500 text-white' : 
        serverGameStatus === 'crashed' ? 'bg-red-500 text-white animate-pulse' :
        'bg-yellow-500 text-black'
      }`}>
        {!isServerConnected ? 'OFF' :
         serverGameStatus === 'active' ? (isMobile ? 'ON' : 'ACTIVE') : 
         serverGameStatus === 'crashed' ? 'END' : 'WAIT'}
      </div>
      
      {/* Active bet indicator with mobile optimization */}
      {currentBet > 0 && (
        <div className={`absolute ${isMobile ? 'top-6 right-1 text-xs' : 'top-10 right-2 text-sm'} bg-blue-500 text-white px-2 py-1 rounded font-bold z-10`}>
          {isMobile ? `${currentBet.toFixed(2)}` : `Bet: ${currentBet.toFixed(3)} SOL`}
        </div>
      )}
      
      {/* Visual effect overlays - PRESERVED with mobile optimization */}
      {dangerLevel > 0 && (
        <div 
          className="absolute inset-0 pointer-events-none z-20"
          style={{ 
            background: `linear-gradient(transparent, rgba(220, 38, 38, ${dangerLevel/(isMobile ? 300 : 200)}))`,
            transition: 'opacity 0.5s ease'
          }}
        />
      )}
      
      {safeLevel > 0 && (
        <div 
          className="absolute inset-0 pointer-events-none z-20"
          style={{ 
            background: `linear-gradient(transparent, rgba(16, 185, 129, ${safeLevel/(isMobile ? 300 : 200)}))`,
            transition: 'opacity 0.5s ease'
          }}
        />
      )}
      
      {/* ENHANCED: Chart area with proper margins */}
      <div className={`absolute inset-0 ${isMobile ? 'pt-12 pb-2 px-1' : 'pt-16 pb-4 px-4'}`}>
        {containerWidth > 0 && isServerConnected ? (
          <CandlestickSVG 
            candles={candleData} 
            width={containerWidth - (isMobile ? 2 : 8)} 
            height={chartHeight - (isMobile ? 56 : 80)} 
            minValue={yScale.min} 
            maxValue={yScale.max}
            currentPrice={serverMultiplier}
            betPlacedAt={currentBet > 0 ? betPlacedAt : undefined}
            gameStatus={serverGameStatus}
            isMobile={isMobile}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 text-center">
              <div className={`${isMobile ? 'text-sm' : 'text-lg'} mb-2`}>
                {!isServerConnected ? 'Connecting...' : 'Waiting for data...'}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Explosion effect and milestone text - PRESERVED with mobile optimization */}
      {showExplosion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="relative">
            <div 
              className={`absolute ${isMobile ? '-inset-8' : '-inset-12'} animate-pulse`} 
              style={{ 
                background: `radial-gradient(circle, ${explosionColor} 0%, transparent 70%)`,
                animation: 'pulse 1s cubic-bezier(0,0,0.2,1) infinite',
                transform: 'scale(1)'
              }} 
            />
            
            <div 
              className={`${isMobile ? 'text-3xl' : 'text-6xl'} font-dynapuff font-extrabold`}
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
      
      {/* Rug Effect animation - PRESERVED with mobile optimization */}
      {showRugEffect && (
        <div className="absolute inset-0 pointer-events-none z-40">
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(circle, rgba(255,0,0,0.4) 0%, transparent 70%)',
            animation: 'rug-pulse 0.8s ease-in-out infinite'
          }} />
          
          {/* Reduced particles for mobile performance */}
          <div className="absolute top-0 w-full h-full overflow-hidden">
            {Array.from({ length: isMobile ? 25 : 50 }).map((_, i) => {
              const size = Math.random() * (isMobile ? 8 : 12) + (isMobile ? 3 : 5);
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
      
      {/* CSS animations - PRESERVED */}
      <style jsx>{`
        @keyframes shake-1 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-1px); }
          20%, 40%, 60%, 80% { transform: translateX(1px); }
        }
        @keyframes shake-2 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        @keyframes shake-3 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
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
        @keyframes shake-6 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        @keyframes shake-7 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
        @keyframes shake-8 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
        @keyframes shake-9 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-7px); }
          20%, 40%, 60%, 80% { transform: translateX(7px); }
        }
        @keyframes shake-10 {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
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