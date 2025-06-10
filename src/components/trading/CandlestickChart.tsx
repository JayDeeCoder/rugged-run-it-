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
  // NEW: For tracking cashout events
  didCashOut?: boolean;
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

// FIXED: SVG-based candle renderer with sliding window and proper candle sizing
const CandlestickSVG: FC<{
  candles: Candle[], 
  width: number, 
  height: number, 
  minValue: number, 
  maxValue: number,
  currentPrice: number,
  betPlacedAt?: number,
  gameStatus: 'waiting' | 'active' | 'crashed',
  isMobile?: boolean,
  cashoutMultiplier?: number
}> = ({ candles, width, height, minValue, maxValue, currentPrice, betPlacedAt, gameStatus, isMobile = false, cashoutMultiplier }) => {
  
  // FIXED: Improved scaling with proper margins to prevent cutoff
  const scaleY = useCallback((value: number) => {
    const clampedValue = Math.max(Math.min(value, maxValue), minValue);
    const topMargin = isMobile ? 20 : 25;
    const bottomMargin = isMobile ? 20 : 25;
    const usableHeight = height - topMargin - bottomMargin;
    
    const scaledY = topMargin + usableHeight - ((clampedValue - minValue) / (maxValue - minValue)) * usableHeight;
    return Math.min(Math.max(scaledY, topMargin), height - bottomMargin);
  }, [height, minValue, maxValue, isMobile]);
  
  // FIXED: Sliding window approach - show only recent candles that fit properly
  const leftMargin = isMobile ? 45 : 55;
  const rightMargin = isMobile ? 15 : 20; // Increased right margin for latest candle padding
  const chartWidth = width - leftMargin - rightMargin;
  
  // FIXED: Use optimal candle width instead of trying to fit ALL candles
  const optimalCandleWidth = isMobile ? 12 : 18; // Good size for visibility
  const optimalSpacing = isMobile ? 2 : 3; // Comfortable spacing
  const candleStep = optimalCandleWidth + optimalSpacing;
  
  // FIXED: Calculate how many candles can fit comfortably with padding for latest candle
  const paddingForLatestCandle = isMobile ? 20 : 30; // Extra space so latest candle isn't at edge
  const availableWidth = chartWidth - paddingForLatestCandle;
  const maxDisplayCandles = Math.floor(availableWidth / candleStep);
  
  // FIXED: Show only the most recent candles that fit (sliding window)
  const displayCandles = candles.length > maxDisplayCandles 
    ? candles.slice(-maxDisplayCandles) // Show last N candles
    : candles;
  
  
  const startX = leftMargin + 10; // Fixed start position
  const baselineY = scaleY(1.0);
  
  return (
    <svg width={width} height={height} className="candlestick-svg">
      {/* Background grid - properly contained within margins */}
      {(isMobile ? [0.25, 0.5, 0.75] : [0.2, 0.4, 0.6, 0.8]).map((ratio, i) => (
        <line 
          key={`grid-${i}`}
          x1={leftMargin} 
          y1={height * ratio} 
          x2={width - rightMargin} 
          y2={height * ratio} 
          stroke="rgba(255, 255, 255, 0.05)" 
          strokeWidth={1} 
        />
      ))}
      
      {/* 1.0x baseline - thin stroke, full width */}
      <line 
        x1={leftMargin} 
        y1={baselineY} 
        x2={width - rightMargin} 
        y2={baselineY} 
        stroke="#FFFFFF" 
        strokeWidth={1.5}
        strokeDasharray="4,3"
      />
      <text 
        x={8} 
        y={baselineY - 4} 
        fontSize={isMobile ? 10 : 12} 
        fontWeight="bold"
        fill="#FFFFFF"
      >
        1.00x
      </text>
      
      {/* Entry point line - GREEN color, thin stroke, full width */}
      {betPlacedAt && betPlacedAt !== 1.0 && (
        <>
          <line 
            x1={leftMargin} 
            y1={scaleY(betPlacedAt)} 
            x2={width - rightMargin} 
            y2={scaleY(betPlacedAt)} 
            stroke="#10B981"
            strokeWidth={1.5}
            strokeDasharray="5,3" 
          />
          <text 
            x={8} 
            y={scaleY(betPlacedAt) - 4} 
            fontSize={isMobile ? 9 : 11} 
            fontWeight="bold"
            fill="#10B981"
          >
            Entry: {betPlacedAt.toFixed(2)}x
          </text>
        </>
      )}
      
      {/* Cashout line - RED color if user cashed out before crash */}
      {cashoutMultiplier && gameStatus === 'crashed' && cashoutMultiplier < currentPrice && (
        <>
          <line 
            x1={leftMargin} 
            y1={scaleY(cashoutMultiplier)} 
            x2={width - rightMargin} 
            y2={scaleY(cashoutMultiplier)} 
            stroke="#EF4444"
            strokeWidth={1.5}
            strokeDasharray="5,3" 
          />
          <text 
            x={8} 
            y={scaleY(cashoutMultiplier) - 4} 
            fontSize={isMobile ? 9 : 11} 
            fontWeight="bold"
            fill="#EF4444"
          >
            Exit: {cashoutMultiplier.toFixed(2)}x
          </text>
        </>
      )}
      
      {/* Y-axis labels with better spacing */}
      {(isMobile ? [0.2, 0.5, 0.8] : [0.15, 0.35, 0.55, 0.75, 0.95]).map((ratio, i) => {
        const yPos = height * ratio;
        const priceValue = minValue + (maxValue - minValue) * (1 - ratio);
        return (
          <text 
            key={`price-${i}`}
            x={5} 
            y={yPos + 4} 
            fontSize={isMobile ? 9 : 10} 
            fill="rgba(255, 255, 255, 0.6)"
            textAnchor="start"
          >
            {priceValue.toFixed(2)}
          </text>
        );
      })}
      
      {/* FIXED: Display candles with optimal sizing and latest candle always visible */}
      {displayCandles.map((candle, i) => {
        const x = startX + i * candleStep;
        const open = scaleY(candle.open);
        const close = scaleY(candle.close);
        const high = scaleY(candle.high);
        const low = scaleY(candle.low);
        
        // Enhanced crash candle detection
        const priceChange = candle.close - candle.open;
        const percentChange = Math.abs(priceChange) / candle.open;
        const isCrashCandle = priceChange < 0 && percentChange > 0.3; // 30%+ drop
        
        const isUpCandle = candle.close > candle.open;
        
        const fill = isCrashCandle 
          ? '#DC2626' // Dark red for crash
          : isUpCandle 
            ? '#10B981' // Green for up
            : '#EF4444'; // Red for down
            
        const wickWidth = Math.max(0.3, optimalCandleWidth / 12);
        const bodyHeight = Math.max(Math.abs(close - open), isCrashCandle ? 3 : 1);
        
        return (
          <g key={`candle-${i}`}>
            
            {/* Upper wick */}
            <line 
              x1={x + optimalCandleWidth/2} 
              y1={high} 
              x2={x + optimalCandleWidth/2} 
              y2={Math.min(open, close)} 
              stroke={isCrashCandle ? "#991B1B" : "rgba(200, 200, 200, 0.8)"}
              strokeWidth={isCrashCandle ? Math.max(1, wickWidth * 2) : wickWidth}
            />
            
            {/* Lower wick */}
            <line 
              x1={x + optimalCandleWidth/2} 
              y1={Math.max(open, close)} 
              x2={x + optimalCandleWidth/2} 
              y2={low} 
              stroke={isCrashCandle ? "#991B1B" : "rgba(200, 200, 200, 0.8)"}
              strokeWidth={isCrashCandle ? Math.max(1, wickWidth * 2) : wickWidth}
            />
            
            {/* Body with crash emphasis */}
            <rect 
              x={x} 
              y={Math.min(open, close)} 
              width={optimalCandleWidth} 
              height={bodyHeight} 
              fill={fill}
              stroke={isCrashCandle ? "#7F1D1D" : isUpCandle ? "#059669" : "#DC2626"}
              strokeWidth={0.5}
            />
            
            {/* Extra crash effect - red glow */}
            {isCrashCandle && (
              <rect 
                x={x - 0.5} 
                y={Math.min(open, close) - 0.5} 
                width={optimalCandleWidth + 1} 
                height={bodyHeight + 1} 
                fill="none"
                stroke="#DC2626"
                strokeWidth={0.5}
                opacity={0.7}
              />
            )}
            
            {/* Connection line to next candle for continuity visualization */}
            {i < displayCandles.length - 1 && (
              <line 
                x1={x + optimalCandleWidth} 
                y1={close} 
                x2={startX + (i + 1) * candleStep} 
                y2={scaleY(displayCandles[i + 1].open)} 
                stroke="rgba(100, 100, 100, 0.3)"
                strokeWidth={0.3}
                strokeDasharray="1,1"
              />
            )}
          </g>
        );
      })}
      
      {/* Current price line - thin stroke, full width */}
      <line 
        x1={leftMargin} 
        y1={scaleY(currentPrice)} 
        x2={width - rightMargin} 
        y2={scaleY(currentPrice)} 
        stroke={gameStatus === 'crashed' ? "#EF4444" : "#fbbf24"} 
        strokeWidth={1.5} 
        strokeDasharray="5,3" 
      />
      
      {/* Current price label with better positioning */}
      <g transform={`translate(${Math.max(leftMargin, width - rightMargin - (isMobile ? 60 : 75))}, ${Math.min(scaleY(currentPrice) - (isMobile ? 15 : 18), height - (isMobile ? 30 : 40))})`}>
        <rect 
          x={0} 
          y={0} 
          width={isMobile ? 55 : 70} 
          height={isMobile ? 22 : 28} 
          rx={isMobile ? 4 : 5} 
          fill={gameStatus === 'crashed' ? "#EF4444" : "#fbbf24"} 
        />
        <text 
          x={isMobile ? 27 : 35} 
          y={isMobile ? 15 : 19} 
          fontSize={isMobile ? 11 : 14} 
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
  maxCandles = 20, // This is now used for Y-scale calculation, not display limit
  onMultiplierUpdate,
  onEffectComplete,
  onGameCrash,
  currentBet = 0,
  betPlacedAt,
  useMobileHeight = false,
  // Server data props
  serverMultiplier = 1.0,
  serverGameStatus = 'waiting',
  isServerConnected = false,
  // NEW: Cashout tracking
  didCashOut = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameStateRef = useRef(createInitialTradingState());
  
  // ENHANCED: Responsive sizing - NO LIMIT on candles, compact height
  const isMobile = useMobileHeight;
  const chartHeight = isMobile ? Math.min(height, 240) : height;
  
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [candleData, setCandleData] = useState<Candle[]>([]);
  const [lastServerMultiplier, setLastServerMultiplier] = useState<number>(1.0);
  const [lastGameStatus, setLastGameStatus] = useState<string>('waiting'); // Track status changes
  const [crashHandled, setCrashHandled] = useState<boolean>(false); // Prevent double triggers
  const [cashoutMultiplier, setCashoutMultiplier] = useState<number | undefined>(undefined);
  
  // Visual effect states - ENHANCED with timeout tracking
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

  // Timeout tracking for proper cleanup
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Milestone tracking - ENHANCED with mobile optimization
  const lastMilestoneRef = useRef<number>(0);
  const milestones = useMemo(() => isMobile ? [2, 5, 10, 20, 50] : [2, 3, 5, 10, 15, 20, 25, 50, 75, 100], [isMobile]);
  
  // User context
  const { currentUser } = useContext(UserContext);

  // Helper function to clear all pending timeouts
  const clearAllTimeouts = useCallback(() => {
    if (timeoutsRef.current.length > 0) {
      console.log(`🧹 Clearing ${timeoutsRef.current.length} pending timeouts`);
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current = [];
    }
  }, []);

  // Helper function to add tracked timeout
  const addTimeout = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      callback();
      // Remove from tracking array when executed
      timeoutsRef.current = timeoutsRef.current.filter(t => t !== timeout);
    }, delay);
    timeoutsRef.current.push(timeout);
    return timeout;
  }, []);
  
  // ENHANCED: Y-axis scale with mobile consideration - using recent candles for better scaling
  const yScale = useMemo(() => {
    // Use recent candles for Y-scale calculation to avoid extreme ranges
    const recentCandles = candleData.slice(-Math.min(candleData.length, maxCandles));
    return calculateYScale(recentCandles, serverMultiplier, isMobile);
  }, [candleData, serverMultiplier, isMobile, maxCandles]);
  
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

  // Component cleanup - clear all timeouts on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      console.log('🧹 Component unmounting - All timeouts cleared');
    };
  }, [clearAllTimeouts]);

  // 🔥 ENHANCED: Visual effects with MASSIVELY INCREASED INTENSITY
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
    
    // 🚀 MASSIVELY ENHANCED milestone effects
    for (const milestone of milestones) {
      if (price >= milestone && lastMilestoneRef.current < milestone) {
        lastMilestoneRef.current = milestone;
        let intensity, color, textColor, shakeDuration;
        
        // 🔥 TRIPLED INTENSITY - Now super dramatic!
        const mobileMultiplier = isMobile ? 2.0 : 3.0; // MASSIVE increase
        
        if (milestone <= 2) {
          intensity = 8 * mobileMultiplier; // Was 2, now 8
          color = 'rgba(74, 222, 128, 0.9)'; // More intense
          textColor = '#4ADE80';
          shakeDuration = 800; // Longer
        } else if (milestone <= 3) {
          intensity = 12 * mobileMultiplier; // Was 4, now 12
          color = 'rgba(34, 211, 238, 0.9)';
          textColor = '#22D3EE';
          shakeDuration = 1000;
        } else if (milestone <= 5) {
          intensity = 15 * mobileMultiplier; // Was 5, now 15
          color = 'rgba(251, 191, 36, 0.9)';
          textColor = '#FACC15';
          shakeDuration = 1200;
        } else if (milestone <= 10) {
          intensity = 20 * mobileMultiplier; // Was 7, now 20
          color = 'rgba(249, 115, 22, 0.9)';
          textColor = '#F97316';
          shakeDuration = 1400;
        } else if (milestone <= 20) {
          intensity = 25 * mobileMultiplier; // Was 8, now 25
          color = 'rgba(239, 68, 68, 0.9)';
          textColor = '#EF4444';
          shakeDuration = 1600;
        } else {
          intensity = 30 * mobileMultiplier; // Was 10, now 30
          color = 'rgba(217, 70, 239, 0.9)';
          textColor = '#D946EF';
          shakeDuration = 1800;
        }
        
        setShakeIntensity(intensity);
        setExplosionColor(color);
        setMilestoneTextColor(textColor);
        
        setIsShaking(true);
        addTimeout(() => setIsShaking(false), shakeDuration);
        
        setMilestoneText(`${milestone}X ${isMobile ? '!!!' : '!!!!'}`); // More excitement
        setShowExplosion(true);
        setMilestoneOpacity(1);
        
        // 🎊 ENHANCED celebration timing - much longer with tracked timeouts
        addTimeout(() => {
          setMilestoneOpacity(0);
          addTimeout(() => {
            setShowExplosion(false);
          }, 1500); // Longer fade out
        }, isMobile ? 2500 : 3000); // Much longer display time
        
        break;
      }
    }
    
    // Reset milestone if price drops significantly
    if (price < lastMilestoneRef.current * 0.8) {
      lastMilestoneRef.current = Math.floor(price);
    }
  }, [milestones, isMobile, addTimeout]);

  // 💥 MASSIVELY ENHANCED Rug effect animation with tracked cleanup
  const triggerRugEffect = useCallback((rugPrice: number) => {
    // Clear any existing effects first to prevent sticking
    clearAllTimeouts(); // Clear all pending timeouts
    setIsShaking(false);
    setShowExplosion(false);
    setShowRugEffect(false);
    setMilestoneOpacity(0);
    
    // Start SUPER ENHANCED rug effect after brief cleanup
    addTimeout(() => {
      console.log('🔥 TRIGGERING ENHANCED RUG EFFECT');
      setShakeIntensity(isMobile ? 40 : 60); // MASSIVE INTENSITY
      setIsShaking(true);
      
      setExplosionColor('rgba(239, 68, 68, 0.95)'); // Very intense red
      setMilestoneTextColor('#EF4444');
      setMilestoneText(isMobile ? `RUGGED!!!` : `RUGGED @ ${peakMultiplier.toFixed(2)}X!!!`);
      setShowExplosion(true);
      setMilestoneOpacity(1);
      setShowRugEffect(true);
      
      if (onGameCrash) {
        onGameCrash(peakMultiplier);
      }
      
      // Much longer shake duration with tracked timeout
      addTimeout(() => {
        setIsShaking(false);
      }, isMobile ? 4000 : 5000); // MUCH longer
      
      // Much longer text display, then proper cleanup with tracked timeouts
      addTimeout(() => {
        setMilestoneOpacity(0);
        addTimeout(() => {
          setShowExplosion(false);
          setShowRugEffect(false);
        }, 1500); // Longer fade out
      }, isMobile ? 4500 : 5500); // Much longer display
    }, 100); // Brief delay for cleanup
  }, [onGameCrash, peakMultiplier, isMobile, clearAllTimeouts, addTimeout]);

  // 🔥 DEDICATED CRASH DETECTION - Separate effect for reliable crash handling
  useEffect(() => {
    if (!isServerConnected) return;
    
    // Detect status change from active/waiting to crashed
    const statusChanged = lastGameStatus !== serverGameStatus;
    const nowCrashed = serverGameStatus === 'crashed';
    const wasNotCrashed = lastGameStatus !== 'crashed';
    
    console.log(`🎮 Status check: ${lastGameStatus} → ${serverGameStatus}, crashHandled: ${crashHandled}`);
    
    if (nowCrashed && wasNotCrashed && !crashHandled) {
      console.log('💥💥💥 GAME CRASHED DETECTED - TRIGGERING RUG EFFECT 💥💥💥');
      
      // Mark crash as handled to prevent double triggers
      setCrashHandled(true);
      
      // Finalize candle data
      setCandleData(prev => {
        if (prev.length === 0) return prev;
        
        const updatedCandles = [...prev];
        const lastCandle = updatedCandles[updatedCandles.length - 1];
        
        const crashCandle: Candle = {
          timestamp: new Date().toISOString(),
          open: lastCandle.close,
          high: Math.max(lastCandle.close, peakMultiplier),
          low: Math.min(serverMultiplier, 0.1),
          close: serverMultiplier,
          volume: 100
        };

        updatedCandles[updatedCandles.length - 1] = crashCandle;
        return updatedCandles;
      });

      // 🚀 FORCE rug effect trigger - GUARANTEED
      console.log('🔥 CALLING triggerRugEffect with multiplier:', serverMultiplier);
      triggerRugEffect(serverMultiplier);
      setPeakMultiplier(1.0);
      lastMilestoneRef.current = 0;
    }
    
    // Reset crash handled flag when new game starts
    if (serverGameStatus === 'waiting' && lastGameStatus === 'crashed') {
      console.log('🔄 New game starting - resetting crash handler');
      setCrashHandled(false);
    }
    
    // Update last status
    setLastGameStatus(serverGameStatus);
  }, [serverGameStatus, lastGameStatus, crashHandled, isServerConnected, serverMultiplier, peakMultiplier, triggerRugEffect]);

  // ENHANCED: Real server data synchronization with FULL candle history kept
  useEffect(() => {
    if (!isServerConnected) return;

    // Track peak multiplier
    if (serverMultiplier > peakMultiplier && serverGameStatus === 'active') {
      setPeakMultiplier(serverMultiplier);
    }

    // PROPER CONTINUOUS CANDLESTICK BUILDING during active game
    if (serverGameStatus === 'active' && Math.abs(serverMultiplier - lastServerMultiplier) > 0.005) {
      setCandleData(prev => {
        if (prev.length === 0) {
          const firstCandle: Candle = {
            timestamp: new Date().toISOString(),
            open: 1.0,
            high: Math.max(1.0, serverMultiplier),
            low: Math.min(1.0, serverMultiplier),
            close: serverMultiplier,
            volume: 10
          };
          return [firstCandle];
        }

        const updatedCandles = [...prev];
        const currentCandle = updatedCandles[updatedCandles.length - 1];
        const candleAge = Date.now() - new Date(currentCandle.timestamp).getTime();
        
        const shouldCreateNewCandle = 
          candleAge > (isMobile ? 4000 : 3000) ||
          Math.abs(serverMultiplier - currentCandle.open) > (isMobile ? 1.5 : 1.2) ||
          updatedCandles.length < 2;

        if (shouldCreateNewCandle) {
          const newCandle: Candle = {
            timestamp: new Date().toISOString(),
            open: currentCandle.close,
            high: Math.max(currentCandle.close, serverMultiplier),
            low: Math.min(currentCandle.close, serverMultiplier),
            close: serverMultiplier,
            volume: Math.random() * 20 + 10
          };
          
          updatedCandles.push(newCandle);
        } else {
          updatedCandles[updatedCandles.length - 1] = {
            ...currentCandle,
            high: Math.max(currentCandle.high, serverMultiplier),
            low: Math.min(currentCandle.low, serverMultiplier),
            close: serverMultiplier,
            volume: currentCandle.volume + 1
          };
        }

        checkForEffects(serverMultiplier);
        
        // KEEP ALL CANDLES - SVG component will handle sliding window display
        return updatedCandles;
      });

      if (onMultiplierUpdate) {
        onMultiplierUpdate(serverMultiplier);
      }
    }

    // 🧹 ENHANCED: Reset for new game - COMPLETE CLEAN SLATE with tracked timeout cleanup
    if (serverGameStatus === 'waiting' && candleData.length > 0) {
      console.log('🧹 STARTING COMPLETE GAME RESET WITH TIMEOUT CLEANUP');
      
      // FIRST: Clear all pending timeouts to prevent interference
      clearAllTimeouts();
      
      // THEN: Reset all data
      setCandleData([]);
      setCashoutMultiplier(undefined);
      lastMilestoneRef.current = 0;
      setPeakMultiplier(1.0);
      setCrashHandled(false); // Reset crash handler
      
      // FINALLY: Complete effect cleanup
      setIsShaking(false);
      setShakeIntensity(0);
      setShowExplosion(false);
      setExplosionColor('rgba(251, 191, 36, 0.6)');
      setMilestoneText('');
      setMilestoneTextColor('#FACC15');
      setMilestoneOpacity(0);
      setDangerLevel(0);
      setSafeLevel(0);
      setShowRugEffect(false);
      
      console.log('✅ Chart reset complete - All effects and timeouts cleared');
    }

    setLastServerMultiplier(serverMultiplier);
  }, [serverMultiplier, serverGameStatus, isServerConnected, lastServerMultiplier, checkForEffects, onMultiplierUpdate, isMobile, candleData.length, clearAllTimeouts]);

  // Track cashout events from parent component
  useEffect(() => {
    if (didCashOut && serverGameStatus === 'active') {
      setCashoutMultiplier(serverMultiplier);
    }
  }, [didCashOut, serverGameStatus, serverMultiplier]);

  return (
    <div 
      ref={containerRef}
      className="w-full relative bg-black border border-gray-800 rounded-lg overflow-hidden" 
      style={{ 
        height: `${chartHeight}px`,
        animation: isShaking ? `shake-${Math.min(Math.ceil(shakeIntensity), 60)} 0.3s cubic-bezier(.36,.07,.19,.97) both` : 'none' // Faster shake
      }}
    >
      {/* Status indicators with mobile optimization */}
      <div className={`absolute top-1 left-1 px-2 py-1 rounded ${isMobile ? 'text-xs' : 'text-sm'} font-bold z-10 ${
        serverGameStatus === 'crashed' ? 'bg-red-500 text-white animate-pulse' : 'bg-yellow-500 text-black' // Added pulse for crash
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
         serverGameStatus === 'crashed' ? 'RUGGED' : 'WAIT'} {/* Changed to RUGGED */}
      </div>
      
      {/* Active bet indicator with mobile optimization */}
      {currentBet > 0 && (
        <div className={`absolute ${isMobile ? 'top-6 right-1 text-xs' : 'top-10 right-2 text-sm'} bg-blue-500 text-white px-2 py-1 rounded font-bold z-10`}>
          {isMobile ? `${currentBet.toFixed(2)}` : `Bet: ${currentBet.toFixed(3)} SOL`}
        </div>
      )}
      
      {/* Visual effect overlays - ENHANCED */}
      {dangerLevel > 0 && (
        <div 
          className="absolute inset-0 pointer-events-none z-20"
          style={{ 
            background: `linear-gradient(transparent, rgba(220, 38, 38, ${dangerLevel/(isMobile ? 200 : 150)}))`, // More intense
            transition: 'opacity 0.3s ease' // Faster transition
          }}
        />
      )}
      
      {safeLevel > 0 && (
        <div 
          className="absolute inset-0 pointer-events-none z-20"
          style={{ 
            background: `linear-gradient(transparent, rgba(16, 185, 129, ${safeLevel/(isMobile ? 200 : 150)}))`, // More intense
            transition: 'opacity 0.3s ease' // Faster transition
          }}
        />
      )}
      
      {/* Chart area with proper margins */}
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
            cashoutMultiplier={cashoutMultiplier}
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
      
      {/* 🎆 ENHANCED: Explosion effect and milestone text with MUCH more intensity */}
      {showExplosion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="relative">
            <div 
              className={`absolute ${isMobile ? '-inset-16' : '-inset-24'} animate-pulse`} // Bigger explosion
              style={{ 
                background: `radial-gradient(circle, ${explosionColor} 0%, transparent 70%)`,
                animation: 'pulse 0.6s cubic-bezier(0,0,0.2,1) infinite', // Faster pulse
                transform: 'scale(1.5)' // Bigger scale
              }} 
            />
            
            <div 
              className={`${isMobile ? 'text-4xl' : 'text-8xl'} font-dynapuff font-extrabold`} // Bigger text
              style={{ 
                color: milestoneTextColor,
                opacity: milestoneOpacity,
                transition: 'opacity 1.5s ease', // Longer transition
                textShadow: `0 0 20px ${explosionColor}, 0 0 40px ${explosionColor}, 0 0 60px ${explosionColor}` // Multiple shadows
              }}
            >
              {milestoneText}
            </div>
          </div>
        </div>
      )}
      
      {/* 💥 MASSIVELY ENHANCED Rug Effect animation */}
      {showRugEffect && (
        <div className="absolute inset-0 pointer-events-none z-40">
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(circle, rgba(255,0,0,0.8) 0%, transparent 70%)', // More intense
            animation: 'rug-pulse 0.4s ease-in-out infinite' // Faster pulse
          }} />
          
          <div className="absolute top-0 w-full h-full overflow-hidden">
            {Array.from({ length: isMobile ? 60 : 120 }).map((_, i) => { // WAY more particles
              const size = Math.random() * (isMobile ? 16 : 24) + (isMobile ? 6 : 8); // Bigger particles
              const opacity = Math.random() * 0.9 + 0.5; // More visible
              const delay = Math.random() * 1.0; // Faster start
              const duration = Math.random() * 1.2 + 0.6; // Faster fall
              const leftPos = Math.random() * 100;
              
              return (
                <div 
                  key={i}
                  className="absolute"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: i % 5 === 0 ? '#FF0000' : i % 5 === 1 ? '#FF3300' : i % 5 === 2 ? '#FF6600' : i % 5 === 3 ? '#CC0000' : '#AA0000',
                    borderRadius: '50%',
                    left: `${leftPos}%`,
                    top: '-40px', // Start higher
                    opacity,
                    animation: `fall-down ${duration}s linear forwards`,
                    animationDelay: `${delay}s`,
                    boxShadow: '0 0 12px rgba(255, 0, 0, 1)' // Stronger glow
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
      
      {/* 🔥 MASSIVELY ENHANCED CSS animations with extreme shake effects */}
      <style jsx>{`
        @keyframes shake-1 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-1px); } 20%, 40%, 60%, 80% { transform: translateX(1px); } }
        @keyframes shake-2 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); } 20%, 40%, 60%, 80% { transform: translateX(2px); } }
        @keyframes shake-3 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); } 20%, 40%, 60%, 80% { transform: translateX(3px); } }
        @keyframes shake-4 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); } 20%, 40%, 60%, 80% { transform: translateX(4px); } }
        @keyframes shake-5 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); } 20%, 40%, 60%, 80% { transform: translateX(5px); } }
        @keyframes shake-6 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); } 20%, 40%, 60%, 80% { transform: translateX(6px); } }
        @keyframes shake-7 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-7px); } 20%, 40%, 60%, 80% { transform: translateX(7px); } }
        @keyframes shake-8 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); } 20%, 40%, 60%, 80% { transform: translateX(8px); } }
        @keyframes shake-9 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-9px); } 20%, 40%, 60%, 80% { transform: translateX(9px); } }
        @keyframes shake-10 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); } 20%, 40%, 60%, 80% { transform: translateX(10px); } }
        @keyframes shake-15 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-15px); } 20%, 40%, 60%, 80% { transform: translateX(15px); } }
        @keyframes shake-20 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-20px); } 20%, 40%, 60%, 80% { transform: translateX(20px); } }
        @keyframes shake-25 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-25px); } 20%, 40%, 60%, 80% { transform: translateX(25px); } }
        @keyframes shake-30 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-30px); } 20%, 40%, 60%, 80% { transform: translateX(30px); } }
        @keyframes shake-35 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-35px); } 20%, 40%, 60%, 80% { transform: translateX(35px); } }
        @keyframes shake-40 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-40px); } 20%, 40%, 60%, 80% { transform: translateX(40px); } }
        @keyframes shake-45 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-45px); } 20%, 40%, 60%, 80% { transform: translateX(45px); } }
        @keyframes shake-50 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-50px); } 20%, 40%, 60%, 80% { transform: translateX(50px); } }
        @keyframes shake-55 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-55px); } 20%, 40%, 60%, 80% { transform: translateX(55px); } }
        @keyframes shake-60 { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-60px); } 20%, 40%, 60%, 80% { transform: translateX(60px); } }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
        }
        
        @keyframes fall-down {
          0% { transform: translateY(0) rotate(0deg); }
          100% { transform: translateY(120vh) rotate(360deg); }
        }
        
        @keyframes rug-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default CandlestickChart;