import { FC, useEffect, useState, useRef } from 'react';
import { GameResult, CandlestickData } from '../../types/trade';

// Extended GameResult interface to include peak tracking
interface ExtendedGameResult extends GameResult {
  peakValue?: number;
  finalValue?: number;
}

interface MiniChartProps {
  data: ExtendedGameResult[];
  maxCharts?: number;
  onNewGame?: (result: ExtendedGameResult) => void;
}

// Generate candlestick data showing the journey to peak and potentially down to final
const generateCandlestickData = (peakValue: number, finalValue: number): CandlestickData[] => {
  const candleCount = 5;
  const wasRugged = finalValue < peakValue * 0.8; // Consider it rugged if final is significantly lower than peak
  let currentPrice = 100;
  const candlesticks: CandlestickData[] = [];
  
  // Calculate the target peak price and final price
  const targetPeak = currentPrice * peakValue;
  const targetFinal = currentPrice * finalValue;
  
  for (let i = 0; i < candleCount; i++) {
    let open, close, high, low;
    open = currentPrice;
    
    if (i < 3) {
      // First 3 candles: mostly rising toward peak
      const progressToPeak = (i + 1) / 3;
      const targetPrice = currentPrice + (targetPeak - currentPrice) * progressToPeak;
      const volatility = Math.min(peakValue * 0.15, 0.6);
      const priceChange = currentPrice * volatility * Math.random();
      
      // Bias toward upward movement
      close = Math.min(targetPrice + (Math.random() - 0.2) * priceChange, targetPeak);
      high = close + (priceChange * Math.random() * 0.3);
      low = open - (priceChange * Math.random() * 0.2);
      
    } else if (i === 3) {
      // 4th candle: reach or get close to peak
      close = targetPeak * (0.95 + Math.random() * 0.1); // 95-105% of peak
      high = Math.max(close, targetPeak); // Ensure we hit the peak
      low = open - (open * 0.1 * Math.random());
      
    } else {
      // Last candle: drop to final value if rugged, or stay high
      if (wasRugged) {
        close = targetFinal;
        high = open + (open * 0.05 * Math.random());
        low = Math.min(close, targetFinal * 0.9);
      } else {
        // Stay near peak with some minor volatility
        close = targetPeak * (0.9 + Math.random() * 0.15);
        high = close + (close * 0.05 * Math.random());
        low = open - (open * 0.08 * Math.random());
      }
    }
    
    // Ensure high >= max(open, close) and low <= min(open, close)
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    
    candlesticks.push({ open, high, low, close });
    currentPrice = close;
  }
  
  return candlesticks;
};

const MiniCharts: FC<MiniChartProps> = ({ data = [], maxCharts = 10, onNewGame }) => {
  // Initialize with timestamps for backward compatibility
  const [gameResults, setGameResults] = useState<ExtendedGameResult[]>(() => {
    // Add timestamps to any data items missing them
    return data.map((item, index) => ({
      ...item,
      timestamp: item.timestamp || (Date.now() - (data.length - index) * 60000),
      // Ensure we have both peak and final values
      peakValue: item.peakValue || item.value, // Use existing value as peak if peakValue not provided
      finalValue: item.finalValue || item.value // Use existing value as final if finalValue not provided
    }));
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dynamicMaxCharts, setDynamicMaxCharts] = useState<number>(maxCharts);
  
  // Update gameResults when data changes
  useEffect(() => {
    if (data.length > 0) {
      // Make sure all items have timestamps and candleData
      const updatedResults = data.map(item => {
        const peakValue = (item as any).peakValue || item.value;
        const finalValue = (item as any).finalValue || item.value;
        
        return {
          ...item,
          timestamp: item.timestamp || Date.now(),
          peakValue,
          finalValue,
          candleData: item.candleData || generateCandlestickData(peakValue, finalValue)
        };
      });
      
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
            // Always prioritize peak over final - the whole point is showing peak achievement!
            const peakValue = (item as any).peakValue || item.value; // Use value as peak if no specific peak stored
            const finalValue = (item as any).finalValue || ((item as any).peakValue ? item.value : item.value); // Final is the actual final result
            
            // Color coding based purely on peak multiplier (what we want to celebrate!)
            let textColor = 'text-gray-400';
            let borderColor = 'border-gray-800';
            
            if (peakValue < 1.0) {
              textColor = 'text-red-500';
              borderColor = 'border-red-900';
            } else if (peakValue >= 1.0 && peakValue < 2.0) {
              textColor = 'text-yellow-400';
              borderColor = 'border-yellow-900';
            } else if (peakValue >= 2.0 && peakValue < 5.0) {
              textColor = 'text-green-500';
              borderColor = 'border-green-900';
            } else if (peakValue >= 5.0) {
              textColor = 'text-blue-400';
              borderColor = 'border-blue-900';
            }
            
            // Get timestamp string
            const timeString = new Date(item.timestamp).toLocaleTimeString([], { 
              hour: '2-digit',
              minute: '2-digit'
            });
            
            // Create peak multiplier label
            const peakLabel = `${peakValue.toFixed(2)}x`;
            
            return (
              <div 
                key={index} 
                className={`flex flex-col items-center py-2 px-1 rounded bg-[#0d0d0f] border ${borderColor} hover:bg-gray-900 transition-colors`}
                title={`Peak: ${peakLabel} | ${timeString}`}
              >
                {/* Chart visualization */}
                <div className="h-12 w-12 relative">
                  <MiniCandlestickChart 
                    peakMultiplier={peakValue}
                    finalMultiplier={finalValue}
                    candleData={item.candleData || generateCandlestickData(peakValue, finalValue)}
                  />
                </div>
                
                {/* Peak multiplier label */}
                <div className={`text-xs font-medium ${textColor}`}>
                  {peakLabel}
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
  peakMultiplier: number;
  finalMultiplier: number;
  candleData?: CandlestickData[];
}

const MiniCandlestickChart: FC<MiniCandlestickChartProps> = ({ 
  peakMultiplier, 
  finalMultiplier, 
  candleData 
}) => {
  // Use provided candle data or generate new data
  const candlesticks = candleData || generateCandlestickData(peakMultiplier, finalMultiplier);
  
  // Calculate min and max values to scale the chart
  const allValues = candlesticks.flatMap(c => [c.high, c.low]);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1; // Prevent division by zero
  
  // Scale a value to fit in the chart height
  const scaleY = (value: number): number => {
    const chartHeight = 40; // Pixels
    return chartHeight - ((value - min) / range) * chartHeight;
  };
  
  const hadGoodPeak = peakMultiplier >= 2.0;
  
  return (
    <svg width="100%" height="100%" viewBox="0 0 40 40">
      {/* Background tint based on peak performance */}
      {peakMultiplier < 1.0 && (
        <rect x="0" y="0" width="40" height="40" fill="rgba(220, 38, 38, 0.1)" />
      )}
      {hadGoodPeak && (
        <rect x="0" y="0" width="40" height="40" fill="rgba(34, 197, 94, 0.1)" />
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
        
        // Color based on candle direction
        const candleColor = isUp ? "#22c55e" : "#ef4444";
        
        return (
          <g key={i}>
            {/* Candle wick */}
            <line 
              x1={x + 2} 
              y1={wickTop} 
              x2={x + 2} 
              y2={wickBottom} 
              stroke="rgba(180, 180, 180, 0.6)"
              strokeWidth={1}
            />
            
            {/* Candle body */}
            <rect 
              x={x} 
              y={bodyTop} 
              width={4} 
              height={bodyHeight} 
              fill={candleColor} 
              opacity={0.8}
            />
          </g>
        );
      })}
      
      {/* Peak marker line */}
      {peakMultiplier >= 2.0 && (
        <line 
          x1="0" 
          y1={scaleY(max)} 
          x2="40" 
          y2={scaleY(max)}
          stroke="#3b82f6"
          strokeWidth="0.5"
          strokeDasharray="1,1"
          opacity={0.7}
        />
      )}
      
      {/* Peak value indicator for high multipliers */}
      {peakMultiplier >= 10 && (
        <text x="20" y="20" textAnchor="middle" fontSize="6" fill="#3b82f6" fontWeight="bold">
          {peakMultiplier >= 20 ? "MEGA" : "PEAK"}
        </text>
      )}
    </svg>
  );
};

export default MiniCharts;