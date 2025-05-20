import { FC, useEffect, useState, useRef } from 'react';
import { GameResult, CandlestickData } from '../../types/trade';

interface MiniChartProps {
  data: GameResult[];
  maxCharts?: number;
  onNewGame?: (result: GameResult) => void;
}

// Generate candlestick data for a game result
const generateCandlestickData = (value: number): CandlestickData[] => {
  const candleCount = 5;
  const isPositive = value >= 1.5;
  const volatility = Math.min(value * 0.2, 0.8); 
  let currentPrice = 100;
  const candlesticks: CandlestickData[] = [];
  
  for (let i = 0; i < candleCount; i++) {
    const goesUp = isPositive ? 
      Math.random() > 0.3 : 
      Math.random() > 0.7;  
    
    const changePercent = volatility * Math.random();
    const priceChange = currentPrice * changePercent;
    
    let open, close, high, low;
    
    if (goesUp) {
      open = currentPrice;
      close = currentPrice + priceChange;
      high = close + (priceChange * Math.random() * 0.5);
      low = open - (priceChange * Math.random() * 0.3);
    } else {
      open = currentPrice;
      close = currentPrice - priceChange;
      high = open + (priceChange * Math.random() * 0.3);
      low = close - (priceChange * Math.random() * 0.5);
    }
    
    candlesticks.push({ open, high, low, close });
    currentPrice = close; // Set next candle's starting point
  }
  
  return candlesticks;
};

const MiniCharts: FC<MiniChartProps> = ({ data = [], maxCharts = 10, onNewGame }) => {
  // Initialize with timestamps for backward compatibility
  const [gameResults, setGameResults] = useState<GameResult[]>(() => {
    // Add timestamps to any data items missing them
    return data.map((item, index) => ({
      ...item,
      timestamp: item.timestamp || (Date.now() - (data.length - index) * 60000) // Stagger timestamps
    }));
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dynamicMaxCharts, setDynamicMaxCharts] = useState<number>(maxCharts);
  
  // Update gameResults when data changes
  useEffect(() => {
    if (data.length > 0) {
      // Make sure all items have timestamps and candleData
      const updatedResults = data.map(item => ({
        ...item,
        timestamp: item.timestamp || Date.now(),
        candleData: item.candleData || generateCandlestickData(item.value)
      }));
      
      setGameResults(updatedResults);
    }
  }, [data]);
  
  // Calculate dynamic max charts based on container width
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const containerWidth = entry.contentRect.width;
          // Assuming each mini chart takes about 60px of width
          const calculatedMax = Math.floor(containerWidth / 60);
          const newMax = Math.min(maxCharts, Math.max(3, calculatedMax));
          
          if (newMax !== dynamicMaxCharts) {
            setDynamicMaxCharts(newMax);
          }
        }
      });
      
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [dynamicMaxCharts, maxCharts]);
  
  return (
    <div ref={containerRef} className="flex w-full bg-[#0d0d0f] border-b border-gray-800 text-white">
      {/* Mini charts */}
      <div className="flex-1 flex items-center justify-center space-x-1 px-2 py-2 overflow-x-auto scrollbar-hide">
        {gameResults.length === 0 ? (
          <div className="text-gray-500 text-sm py-3">
            No game results yet. Play to see your history here!
          </div>
        ) : (
          gameResults.slice(0, dynamicMaxCharts).map((item, index) => {
            // Color coding based on multiplier
            let textColor = 'text-gray-400';
            if (item.value < 1.2) {
              textColor = 'text-red-500'; // Bad (rug)
            } else if (item.value >= 1.2 && item.value < 2.0) {
              textColor = 'text-yellow-400'; // Mediocre
            } else if (item.value >= 2.0 && item.value < 5.0) {
              textColor = 'text-green-500'; // Good
            } else if (item.value >= 5.0) {
              textColor = 'text-blue-400'; // Excellent
            }
            
            // Get timestamp string
            const timeString = new Date(item.timestamp).toLocaleTimeString([], { 
              hour: '2-digit',
              minute: '2-digit'
            });
            
            return (
              <div 
                key={index} 
                className="flex flex-col items-center py-2 px-1 rounded bg-[#0d0d0f] border border-gray-800 hover:bg-gray-900 transition-colors"
                title={`Game at ${timeString}`}
              >
                {/* Chart visualization */}
                <div className="h-12 w-12 relative">
                  <MiniCandlestickChart 
                    multiplier={item.value} 
                    candleData={item.candleData || generateCandlestickData(item.value)}
                  />
                </div>
                
                {/* Multiplier label */}
                <div className={`text-xs font-medium ${textColor}`}>
                  {item.label}
                </div>
                <div className="text-xs text-gray-500">{timeString}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

interface MiniCandlestickChartProps {
  multiplier: number;
  candleData?: CandlestickData[];
}

const MiniCandlestickChart: FC<MiniCandlestickChartProps> = ({ multiplier, candleData }) => {
  // Use provided candle data or generate new data
  const candlesticks = candleData || generateCandlestickData(multiplier);
  
  // Calculate min and max values to scale the chart
  const allValues = candlesticks.flatMap(c => [c.high, c.low]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min;
  
  // Scale a value to fit in the chart height
  const scaleY = (value: number): number => {
    const chartHeight = 40; // Pixels
    return chartHeight - ((value - min) / range) * chartHeight;
  };
  
  // Determine if this was a crash (multiplier < 1.5)
  const isCrash = multiplier < 1.2;
  
  return (
    <svg width="100%" height="100%" viewBox="0 0 40 40">
      {/* Background tint for crashes */}
      {isCrash && (
        <rect x="0" y="0" width="40" height="40" fill="rgba(220, 38, 38, 0.1)" />
      )}
      
      {/* Candles */}
      {candlesticks.map((candle, i) => {
        const x = 4 + (i * 8); // Horizontal position
        const wickTop = scaleY(candle.high);
        const wickBottom = scaleY(candle.low);
        const bodyTop = scaleY(Math.max(candle.open, candle.close));
        const bodyBottom = scaleY(Math.min(candle.open, candle.close));
        const bodyHeight = Math.max(1, bodyBottom - bodyTop); // Ensure min height of 1px
        const isUp = candle.close > candle.open;
        
        // Red candles for crashes, normal coloring otherwise
        const candleColor = isCrash ? "#ef4444" : (isUp ? "#22c55e" : "#ef4444");
        
        return (
          <g key={i}>
            {/* Candle wick */}
            <line 
              x1={x + 2} 
              y1={wickTop} 
              x2={x + 2} 
              y2={wickBottom} 
              stroke="rgba(180, 180, 180, 0.7)" // Light gray for wicks
              strokeWidth={1.5} // Slightly thicker for better visibility
            />
            
            {/* Candle body */}
            <rect 
              x={x} 
              y={bodyTop} 
              width={4} 
              height={bodyHeight} 
              fill={candleColor} 
            />
          </g>
        );
      })}
      
      {/* Final multiplier line */}
      <line 
        x1="0" 
        y1={scaleY(candlesticks[candlesticks.length - 1].close)} 
        x2="40" 
        y2={scaleY(candlesticks[candlesticks.length - 1].close)}
        stroke={isCrash ? "#ef4444" : "#22c55e"}
        strokeWidth="0.5"
        strokeDasharray="1,1"
      />
      
      {/* Crash marker */}
      {isCrash && (
        <text x="20" y="20" textAnchor="middle" fontSize="8" fill="#ef4444" fontWeight="bold">
          CRASH
        </text>
      )}
      
      {/* Super high marker */}
      {multiplier >= 10 && (
        <text x="20" y="20" textAnchor="middle" fontSize="8" fill="#3b82f6" fontWeight="bold">
          {multiplier >= 20 ? "MEGA" : "SUPER"}
        </text>
      )}
    </svg>
  );
};

export default MiniCharts;