import { FC, useEffect, useState, useMemo, useCallback, useContext, useRef } from 'react';
import { Candle } from '../../types/trade';
import {
  createInitialTradingState,
  updateGameState,
  generateCandle,
  hasGameCrashed,
  resetGameState,
  addPlayerBet,
  MarketPattern
} from '../../utils/gameDataGenerator';
import { UserContext } from '../../context/UserContext';

interface CandlestickChartProps {
  initialPrice?: number;
  height?: number;
  updateInterval?: number;
  showControls?: boolean;
  currency?: string;
  maxCandles?: number;
  maxMultiplier?: number;
  minMultiplier?: number;
  volatility?: number;
  onMultiplierUpdate?: (multiplier: number) => void;
  triggerSellEffect?: boolean;
  onEffectComplete?: () => void;
  onGameCrash?: (crashMultiplier: number) => void;
  currentBet?: number; // Track if player has an active bet
  betPlacedAt?: number; // Price level where bet was placed
  useMobileHeight?: boolean; // Adjust height for mobile
}

// Helper functions for chart scaling and rendering
const calculateYScale = (candles: Candle[], minMultiplier: number, maxMultiplier: number) => {
  if (candles.length === 0) return { min: 0, max: 2 };
  
  const allHighs = candles.map(c => c.high);
  const allLows = candles.map(c => c.low);
  
  // Find the highest and lowest values
  let maxValue = Math.max(...allHighs);
  let minValue = Math.min(...allLows);
  
  // Add more generous padding at the top (30%) to ensure candlesticks stay in view
  // Add less padding at the bottom (10%) since we typically have fewer low values
  const topPadding = 0.3; // 30% extra space at the top
  const bottomPadding = 0.1; // 10% extra space at the bottom
  
  // Apply padding
  const paddedMax = maxValue * (1 + topPadding);
  const paddedMin = Math.max(minValue * (1 - bottomPadding), minMultiplier * 0.5);
  
  // Ensure we don't exceed the max multiplier (if specified)
  const max = maxMultiplier ? Math.min(paddedMax, maxMultiplier * 1.1) : paddedMax;
  const min = Math.max(paddedMin, 0); // Ensure we don't go below 0
  
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
  betPlacedAt?: number // Add prop for bet price level
}> = ({ candles, width, height, minValue, maxValue, currentPrice, betPlacedAt }) => {
  // Scale a price value to Y coordinate with safety bounds
  const scaleY = useCallback((value: number) => {
    // Clamp the value to ensure it stays within chart bounds
    const clampedValue = Math.max(Math.min(value, maxValue * 0.99), minValue * 1.01);
    
    // Calculate Y position (inverted for SVG)
    const scaledY = height - ((clampedValue - minValue) / (maxValue - minValue)) * height;
    
    // Add safety padding to keep everything in view
    const padding = 10; // 10px padding from top and bottom
    return Math.min(Math.max(scaledY, padding), height - padding);
  }, [height, minValue, maxValue]);
  
  // Dynamic candle width based on number of candles
  const chartMargin = 60; // Left and right margin for labels
  const availableWidth = width - chartMargin;
  const candles_count = candles.length || 1; // Avoid division by zero
  
  // Set a minimum and maximum width for candles
  const minCandleWidth = 3;
  const maxCandleWidth = 23;
  const spacing = 1;
  
  // Calculate appropriate candle width to fit all candles
  const calculatedWidth = Math.max(minCandleWidth, Math.min(maxCandleWidth, availableWidth / candles_count - spacing));
  const candleWidth = calculatedWidth;
  
  // Calculate starting X position centered in available space
  const totalWidthNeeded = candles.length * (candleWidth + spacing);
  const startX = (width - totalWidthNeeded) / 2;
  
  // Calculate 1.0x position for reference line
  const baselineY = scaleY(1.0);
  
  return (
    <svg width={width} height={height} className="candlestick-svg">
      {/* Baseline at 1.0x - changed to solid white line */}
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
      
      {/* Entry point line if player has placed a bet */}
      {betPlacedAt && (
        <>
          <line 
            x1={0} 
            y1={scaleY(betPlacedAt)} 
            x2={width} 
            y2={scaleY(betPlacedAt)} 
            stroke="#3B82F6" // Blue line for entry point
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
      
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((ratio, i) => (
        <line 
          key={`grid-${i}`}
          x1={0} 
          y1={height * ratio} 
          x2={width} 
          y2={height * ratio} 
          stroke="rgba(255, 255, 255, 0.1)" 
          strokeWidth={1} 
        />
      ))}
      
      {/* Price Labels on Y-axis */}
      {[0.25, 0.5, 0.75, 1].map((ratio, i) => {
        const yPos = height * ratio;
        const priceValue = minValue + (maxValue - minValue) * (1 - ratio);
        return (
          <g key={`price-${i}`}>
            <text 
              x={5} 
              y={yPos - 5} 
              fontSize={10} 
              fill="rgba(255, 255, 255, 0.6)"
            >
              {priceValue.toFixed(2)}x
            </text>
          </g>
        );
      })}
      
      {/* Candles */}
      {candles.map((candle, i) => {
        // Position candles with proper spacing
        const x = startX + i * (candleWidth + spacing);
        const open = scaleY(candle.open);
        const close = scaleY(candle.close);
        const high = scaleY(candle.high);
        const low = scaleY(candle.low);
        
        // Use green for up candles, red for down candles
        const fill = candle.close > candle.open ? '#4AFA9A' : '#E33F64';
        
        // Wick thickness based on candle width
        const wickThickness = Math.max(1, candleWidth / 10);
        
        return (
          <g key={`candle-${i}`}>
            {/* Wick - now in light gray */}
            <line 
              x1={x + candleWidth/2} 
              y1={high} 
              x2={x + candleWidth/2} 
              y2={low} 
              stroke="rgba(180, 180, 180, 0.7)"
              strokeWidth={wickThickness}
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
        stroke="#fbbf24" 
        strokeWidth={1.5} 
        strokeDasharray="5,3" 
      />
      
      {/* Current price label - positioned to stay in view */}
      <g transform={`translate(${Math.max(0, width - 65)}, ${Math.min(scaleY(currentPrice) - 10, height - 30)})`}>
        <rect x={0} y={0} width={60} height={20} rx={4} fill="#fbbf24" />
        <text x={30} y={14} fontSize={12} fontWeight="bold" textAnchor="middle" fill="#000">
          {currentPrice.toFixed(2)}x
        </text>
      </g>
    </svg>
  );
};

const CandlestickChart: FC<CandlestickChartProps> = ({
  initialPrice = 1.0,
  height = 400,
  updateInterval = 500, // Balanced interval - 500ms instead of 250ms or 1000ms
  currency = 'SOL',
  maxCandles = 15,
  maxMultiplier = 100.0,
  minMultiplier = 0.2,
  volatility = 0.15,
  onMultiplierUpdate,
  onEffectComplete,
  onGameCrash,
  currentBet = 0,
  betPlacedAt,
  useMobileHeight = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<NodeJS.Timeout | null>(null);
  const gameStateRef = useRef(createInitialTradingState());
  
  // Calculate chart height based on device - shorter on mobile
  const chartHeight = useMobileHeight ? 300 : height;
  
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [currentPrice, setCurrentPrice] = useState<number>(initialPrice);
  const [candleData, setCandleData] = useState<Candle[]>([]);
  
  // Game state
  const [isGameActive, setIsGameActive] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showRugEffect, setShowRugEffect] = useState(false);
  const [hasJustBeenRugged, setHasJustBeenRugged] = useState<boolean>(false);
  const [gameStatus, setGameStatus] = useState<'active' | 'rugged'>('active');
  const [peakMultiplier, setPeakMultiplier] = useState<number>(1.0);
  
  // Visual effect states
  const [isShaking, setIsShaking] = useState(false);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [showExplosion, setShowExplosion] = useState(false);
  const [explosionColor, setExplosionColor] = useState('rgba(251, 191, 36, 0.6)');
  const [milestoneText, setMilestoneText] = useState('');
  const [milestoneTextColor, setMilestoneTextColor] = useState('#FACC15');
  const [milestoneOpacity, setMilestoneOpacity] = useState(0);
  const [dangerLevel, setDangerLevel] = useState(0);
  const [safeLevel, setSafeLevel] = useState(0);

  // Session statistics tracking
  const lastMilestoneRef = useRef<number>(0);
  const [highestMultiplier, setHighestMultiplier] = useState<number>(1.0);
  
  // User context for betting info
  const { currentUser } = useContext(UserContext);
  
  // Milestones for celebrations
  const milestones = useMemo(() => [2, 3, 5, 10, 15, 20, 25, 50, 75, 100], []);
  
  // Calculate Y-axis scale range based on candle data
  const yScale = useMemo(() => 
    calculateYScale(candleData, minMultiplier, maxMultiplier), 
    [candleData, minMultiplier, maxMultiplier]
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
   
  // Handle rug effect and animation - now using peak multiplier
  const triggerRugEffect = useCallback((rugPrice: number) => {
    // Stop the game
    setIsGameActive(false);
    setGameStatus('rugged');
    
    // Show intense shake animation
    setShakeIntensity(10);
    setIsShaking(true);
    
    // Set red explosion effect
    setExplosionColor('rgba(239, 68, 68, 0.8)'); // Bright red
    setMilestoneTextColor('#EF4444');
    
    // Use the peak multiplier instead of the rug price for the message
    setMilestoneText(`RUGGED @ ${peakMultiplier.toFixed(2)}X!`);
    setShowExplosion(true);
    setMilestoneOpacity(1);
    setShowRugEffect(true);
    
    // Notify parent component about crash with peak value
    if (onGameCrash) {
      onGameCrash(peakMultiplier);
    }
    
    // Stop shaking after 2 seconds
    setTimeout(() => {
      setIsShaking(false);
    }, 2000);
    
    // Fade out effects
    setTimeout(() => {
      setMilestoneOpacity(0);
      setTimeout(() => {
        setShowExplosion(false);
        setShowRugEffect(false);
      }, 1000);
    }, 3000);
  }, [onGameCrash, peakMultiplier]);
  
  // Complete game reset - called after cooldown timer
  const resetGame = useCallback(() => {
    // Reset game state
    gameStateRef.current = createInitialTradingState();
    
    // Clear all candles
    setCandleData([]);
    
    // Reset prices and tracking - always start at exactly 1.0
    setCurrentPrice(1.0);
    setPeakMultiplier(1.0);
    
    // Reset UI states
    setHasJustBeenRugged(false);
    setShowRugEffect(false);
    lastMilestoneRef.current = 0;
    
    // Set game as active again
    setIsGameActive(true);
    setGameStatus('active');
    setIsInitializing(true); // Mark as initializing to trigger initial candle generation
    
    console.log("Game fully reset and ready for new round - starting at 1.0x multiplier");
  }, []);

  // Update external components when price changes
  useEffect(() => {
    if (onMultiplierUpdate) {
      onMultiplierUpdate(currentPrice);
    }
    
    // Track peak multiplier for crash reporting
    if (currentPrice > peakMultiplier && isGameActive) {
      setPeakMultiplier(currentPrice);
    }
    
    // Track highest multiplier and adjust scaling if needed
    if (currentPrice > highestMultiplier) {
      setHighestMultiplier(currentPrice);
      
      // If current price is approaching the top of the chart (within 80% of max),
      // trigger a recalculation of the chart scale
      if (currentPrice > yScale.max * 0.8) {
        // This will indirectly trigger a recalculation of yScale through the dependency array
        setCandleData(prev => [...prev]);
      }
    }
  }, [currentPrice, onMultiplierUpdate, highestMultiplier, yScale.max, peakMultiplier, isGameActive]);

  // Check for milestone effects and update visual indicators
  const checkForEffects = useCallback((price: number) => {
    // Set danger level when price is below 1.0
    if (price < 1.0) {
      const dangerPercent = Math.round(((1.0 - price) / (1.0 - minMultiplier)) * 100);
      setDangerLevel(Math.min(dangerPercent, 100));
      setSafeLevel(0); // Reset safe level
    } else {
      // Set safe level when price is above 1.0
      const safePercent = Math.min(Math.round((price - 1.0) * 10), 50);
      setSafeLevel(safePercent);
      setDangerLevel(0); // Reset danger level
    }
    
    // Check if we've hit any milestones
    for (const milestone of milestones) {
      if (price >= milestone && lastMilestoneRef.current < milestone) {
        lastMilestoneRef.current = milestone;
        let intensity, color, textColor, shakeDuration;
        
        // Set visual effect parameters based on milestone value
        if (milestone <= 2) {
          intensity = 2;
          color = 'rgba(74, 222, 128, 0.6)'; // Light green
          textColor = '#4ADE80';
          shakeDuration = 500;
        } else if (milestone <= 3) {
          // 3x - moderate effect
          intensity = 4;
          color = 'rgba(34, 211, 238, 0.6)'; // Cyan
          textColor = '#22D3EE';
          shakeDuration = 600;
        } else if (milestone <= 5) {
          // 5x - stronger effect
          intensity = 5;
          color = 'rgba(251, 191, 36, 0.6)'; // Yellow
          textColor = '#FACC15';
          shakeDuration = 700;
        } else if (milestone <= 10) {
          // 10x - intense effect
          intensity = 7;
          color = 'rgba(249, 115, 22, 0.6)'; // Orange
          textColor = '#F97316';
          shakeDuration = 800;
        } else if (milestone <= 20) {
          // 15-20x - very intense effect
          intensity = 8;
          color = 'rgba(239, 68, 68, 0.6)'; // Red
          textColor = '#EF4444';
          shakeDuration = 900;
        } else {
          // 25x+ - extreme effect
          intensity = 10;
          color = 'rgba(217, 70, 239, 0.6)'; // Purple
          textColor = '#D946EF';
          shakeDuration = 1000;
        }
        
        // Apply the visual effects
        setShakeIntensity(intensity);
        setExplosionColor(color);
        setMilestoneTextColor(textColor);
        
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), shakeDuration);
        
        setMilestoneText(`${milestone}X !!`);
        setShowExplosion(true);
        setMilestoneOpacity(1);
        
        // Fade out text after a delay
        setTimeout(() => {
          setMilestoneOpacity(0);
          setTimeout(() => {
            setShowExplosion(false);
          }, 1000);
        }, 1500);
        
        break; // Only handle one milestone at a time
      }
    }
    
    // Reset milestone if price drops significantly
    if (price < lastMilestoneRef.current * 0.8) {
      lastMilestoneRef.current = Math.floor(price);
    }
  }, [milestones, minMultiplier]);

  // Initialize game state without any candlesticks
  useEffect(() => {
    // Only initialize if we're in initializing state and game is active
    if (isInitializing && isGameActive) {
      console.log("Initializing new game round - starting from empty chart at 1.0x");
      
      // Create a completely empty candle array
      setCandleData([]);
      
      // Initialize game state at exactly 1.0x
      let state = createInitialTradingState();
      // Make sure the state is at exactly 1.0x
      state.currentMultiplier = 1.0;
      state.prevCandleClose = 1.0;
      
      // Set current game state
      gameStateRef.current = state;
      
      // Set UI state
      setCurrentPrice(1.0);
      setPeakMultiplier(1.0);
      
      // Mark initialization as complete
      setIsInitializing(false);
    }
  }, [isInitializing, isGameActive]);

  // Main game loop - runs when game is active
  useEffect(() => {
    if (!isGameActive) return;
    
    // Function to update the game for one tick
    const updateGame = () => {
      const { candle, newState } = generateCandle(gameStateRef.current);
      gameStateRef.current = newState;
      
      // Add new candle without removing old ones - we'll trim for display only
      setCandleData(prev => {
        // Only keep the last maxCandles for display - this helps keep a smoother game experience
        const updatedCandles = [...prev, candle];
        if (updatedCandles.length > maxCandles * 1.5) {
          return updatedCandles.slice(-maxCandles);
        }
        return updatedCandles;
      });
      
      // Update current price
      setCurrentPrice(candle.close);
      
      // Check for special effects (milestones, etc.)
      checkForEffects(candle.close);
      
      // Check if game crashed
      if (hasGameCrashed(newState)) {
        // Trigger rug effect animation
        triggerRugEffect(candle.close);
        return; // Exit the game loop
      }
      
      // Schedule next update if game is still active
      animationFrameRef.current = setTimeout(updateGame, updateInterval);
    };
    
    // Start the game loop
    animationFrameRef.current = setTimeout(updateGame, updateInterval);
    
    // Cleanup function to stop the game loop when component unmounts or deactivates
    return () => {
      if (animationFrameRef.current !== null) {
        clearTimeout(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isGameActive, updateInterval, checkForEffects, triggerRugEffect, maxCandles]);

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
      <div className="absolute top-2 left-2 bg-yellow-500 text-black px-2 py-1 rounded text-sm font-bold z-10">
        {currentPrice.toFixed(2) + 'x'} {currency}
      </div>
      
      {/* Game status indicator */}
      <div className={`absolute top-2 right-2 px-2 py-1 rounded text-sm font-bold z-10 ${
        gameStatus === 'active' ? 'bg-green-500' : 'bg-red-500 animate-pulse'
      }`}>
        {gameStatus === 'active' ? 'ACTIVE' : 'RUGGED'}
      </div>
      
      {/* Active bet indicator - only show when player has an active bet */}
      {currentBet > 0 && (
        <div className="absolute top-10 right-2 bg-blue-500 text-white px-2 py-1 rounded text-sm font-bold z-10">
          Bet: {currentBet.toFixed(3)} SOL
        </div>
      )}
      
      {/* Danger overlay (red gradient) */}
      {dangerLevel > 0 && (
        <div 
          className="absolute inset-0 pointer-events-none z-20"
          style={{ 
            background: `linear-gradient(transparent, rgba(220, 38, 38, ${dangerLevel/200}))`,
            transition: 'opacity 0.5s ease'
          }}
        />
      )}
      
      {/* Safe overlay (green gradient) */}
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
      <div className="absolute inset-0 pt-10 pb-4 px-4">
        {containerWidth > 0 && (
          <CandlestickSVG 
            candles={candleData} 
            width={containerWidth - 8} 
            height={chartHeight - 50} 
            minValue={yScale.min} 
            maxValue={yScale.max}
            currentPrice={currentPrice}
            betPlacedAt={currentBet > 0 ? betPlacedAt : undefined}
          />
        )}
      </div>
      
      {/* Explosion effect and milestone text */}
      {showExplosion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          {/* Explosion effect */}
          <div className="relative">
            <div className="absolute -inset-12 animate-pulse" style={{ 
              background: `radial-gradient(circle, ${explosionColor} 0%, transparent 70%)`,
              animation: 'pulse 1s cubic-bezier(0,0,0.2,1) infinite',
              transform: 'scale(1)'
            }} />
            
            {/* Milestone text with fade effect */}
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
      
      {/* Rug Effect animation */}
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
      
      {/* CSS for animations */}
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
        
        @keyframes pulse-red {
          0%, 100% { transform: scale(1); text-shadow: 0 0 10px rgba(255,0,0,0.8); }
          50% { transform: scale(1.1); text-shadow: 0 0 20px rgba(255,0,0,1); }
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