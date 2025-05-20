import { FC, useEffect, useRef, useState, useCallback } from 'react';
import { TradeData } from '../../types/trade';

interface TradingChartProps {
  data: TradeData[];
  height?: number;
  showControls?: boolean;
  maxDataPoints?: number;
}

const TradingChart: FC<TradingChartProps> = ({ 
  data, 
  height = 400,
  showControls = false,
  maxDataPoints = 100 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(height);
  const [dynamicMaxPoints, setDynamicMaxPoints] = useState<number>(maxDataPoints);
  const [displayData, setDisplayData] = useState<TradeData[]>([]);
  
  // Calculate dynamic max data points based on container width
  const calculateMaxPoints = useCallback(() => {
    if (containerWidth > 0) {
      // Calculate optimal number of data points based on width
      // Minimum 3px per data point for visibility
      const minWidthPerPoint = 3;
      const calculatedMax = Math.floor((containerWidth - 80) / minWidthPerPoint);
      
      // Use the smaller of calculated or provided max
      const newMax = Math.min(maxDataPoints, Math.max(20, calculatedMax));
      
      if (newMax !== dynamicMaxPoints) {
        console.log(`Resized chart to fit ${newMax} data points (width: ${containerWidth}px)`);
        setDynamicMaxPoints(newMax);
      }
    }
  }, [containerWidth, dynamicMaxPoints, maxDataPoints]);
  
  // Measure container dimensions
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
          setContainerHeight(entry.contentRect.height);
        }
      });
      
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);
  
  // Update dynamic data point calculation when container width changes
  useEffect(() => {
    calculateMaxPoints();
  }, [containerWidth, calculateMaxPoints]);
  
  // Update display data when new data arrives
  useEffect(() => {
    // Ensure we only keep the latest data points that fit in the container
    if (data.length > 0) {
      const trimmedData = [...data];
      if (trimmedData.length > dynamicMaxPoints) {
        const excessPoints = trimmedData.length - dynamicMaxPoints;
        trimmedData.splice(0, excessPoints);
      }
      setDisplayData(trimmedData);
    }
  }, [data, dynamicMaxPoints]);
  
  // No data to display
  if (displayData.length === 0) {
    return (
      <div 
        ref={containerRef} 
        className="w-full flex items-center justify-center bg-[#0d0d0f] text-gray-400"
        style={{ height: `${height}px` }}
      >
        No data to display
      </div>
    );
  }
  
  // Find min and max values for Y-axis scaling
  const prices = displayData.map(d => d.price);
  const minPrice = Math.min(...prices) * 0.95; // Add 5% padding
  const maxPrice = Math.max(...prices) * 1.05;
  
  // Scale Y value to fit in chart height
  const scaleY = (value: number): number => {
    return containerHeight - 30 - ((value - minPrice) / (maxPrice - minPrice)) * (containerHeight - 60);
  };
  
  // Scale X position
  const scaleX = (index: number): number => {
    const availableWidth = containerWidth - 60; // Account for padding
    return 30 + (index / (displayData.length - 1)) * availableWidth;
  };
  
  // Format date for display
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  // Generate path for price line
  const generateLinePath = (): string => {
    if (displayData.length < 2) return '';
    
    let path = `M ${scaleX(0)} ${scaleY(displayData[0].price)}`;
    
    for (let i = 1; i < displayData.length; i++) {
      path += ` L ${scaleX(i)} ${scaleY(displayData[i].price)}`;
    }
    
    return path;
  };
  
  // Generate path for area under the curve
  const generateAreaPath = (): string => {
    if (displayData.length < 2) return '';
    
    let path = `M ${scaleX(0)} ${scaleY(displayData[0].price)}`;
    
    for (let i = 1; i < displayData.length; i++) {
      path += ` L ${scaleX(i)} ${scaleY(displayData[i].price)}`;
    }
    
    // Complete the area path
    path += ` L ${scaleX(displayData.length - 1)} ${containerHeight - 30}`;
    path += ` L ${scaleX(0)} ${containerHeight - 30}`;
    path += ' Z'; // Close path
    
    return path;
  };
  
  // Generate Y-axis tick marks
  const generateYTicks = (): number[] => {
    const range = maxPrice - minPrice;
    const step = range / 5;
    const ticks = [];
    
    for (let i = 0; i <= 5; i++) {
      ticks.push(minPrice + step * i);
    }
    
    return ticks;
  };
  
  // Generate X-axis tick marks (timestamps)
  const generateXTicks = (): number[] => {
    if (displayData.length <= 1) return [0];
    
    const numTicks = Math.min(5, displayData.length);
    const step = Math.floor(displayData.length / numTicks);
    const ticks = [];
    
    for (let i = 0; i < displayData.length; i += step) {
      ticks.push(i);
    }
    
    // Always include the last point
    if (ticks[ticks.length - 1] !== displayData.length - 1) {
      ticks.push(displayData.length - 1);
    }
    
    return ticks;
  };
  
  const yTicks = generateYTicks();
  const xTicks = generateXTicks();
  
  return (
    <div 
      ref={containerRef} 
      className="w-full relative bg-[#0d0d0f] border border-gray-800 rounded-lg overflow-hidden"
      style={{ height: `${height}px` }}
    >
      {containerWidth > 0 && containerHeight > 0 && (
        <svg width={containerWidth} height={containerHeight}>
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <line 
              key={`y-grid-${i}`}
              x1={30} 
              y1={scaleY(tick)} 
              x2={containerWidth - 30} 
              y2={scaleY(tick)} 
              stroke="rgba(255, 255, 255, 0.1)" 
              strokeWidth={1} 
            />
          ))}
          
          {/* Area fill */}
          <path 
            d={generateAreaPath()}
            fill="rgba(34, 197, 94, 0.1)" 
          />
          
          {/* Price line */}
          <path 
            d={generateLinePath()}
            stroke="#22c55e" 
            strokeWidth={2}
            fill="none" 
          />
          
          {/* Data points */}
          {displayData.length > 0 && displayData.map((d, i) => (
            // Only render every nth point to avoid cluttering
            i % Math.max(1, Math.floor(displayData.length / 20)) === 0 && (
              <circle 
                key={`point-${i}`}
                cx={scaleX(i)} 
                cy={scaleY(d.price)} 
                r={2}
                fill="#22c55e" 
              />
            )
          ))}
          
          {/* Y-axis */}
          <line 
            x1={30} 
            y1={30} 
            x2={30} 
            y2={containerHeight - 30} 
            stroke="rgba(255, 255, 255, 0.3)" 
            strokeWidth={1} 
          />
          
          {/* Y-axis ticks and labels */}
          {yTicks.map((tick, i) => (
            <g key={`y-tick-${i}`}>
              <line 
                x1={25} 
                y1={scaleY(tick)} 
                x2={30} 
                y2={scaleY(tick)} 
                stroke="rgba(255, 255, 255, 0.3)" 
                strokeWidth={1} 
              />
              <text 
                x={22} 
                y={scaleY(tick) + 4} 
                fontSize={10} 
                fill="rgba(255, 255, 255, 0.7)"
                textAnchor="end"
              >
                {tick.toFixed(3)}
              </text>
            </g>
          ))}
          
          {/* X-axis */}
          <line 
            x1={30} 
            y1={containerHeight - 30} 
            x2={containerWidth - 30} 
            y2={containerHeight - 30} 
            stroke="rgba(255, 255, 255, 0.3)" 
            strokeWidth={1} 
          />
          
          {/* X-axis ticks and labels */}
          {xTicks.map((index) => (
            <g key={`x-tick-${index}`}>
              <line 
                x1={scaleX(index)} 
                y1={containerHeight - 30} 
                x2={scaleX(index)} 
                y2={containerHeight - 25} 
                stroke="rgba(255, 255, 255, 0.3)" 
                strokeWidth={1} 
              />
              <text 
                x={scaleX(index)} 
                y={containerHeight - 15} 
                fontSize={9}
                fill="rgba(255, 255, 255, 0.7)"
                textAnchor="middle"
              >
                {formatTime(displayData[index].time)}
              </text>
            </g>
          ))}
          
          {/* Current price indicator */}
          {displayData.length > 0 && (
            <g>
              <circle 
                cx={scaleX(displayData.length - 1)} 
                cy={scaleY(displayData[displayData.length - 1].price)} 
                r={4}
                fill="#22c55e" 
              />
              <rect 
                x={scaleX(displayData.length - 1) + 8} 
                y={scaleY(displayData[displayData.length - 1].price) - 10} 
                width={50} 
                height={20} 
                rx={4}
                fill="#22c55e" 
              />
              <text 
                x={scaleX(displayData.length - 1) + 33} 
                y={scaleY(displayData[displayData.length - 1].price) + 4} 
                fontSize={11}
                fontWeight="bold"
                fill="#000"
                textAnchor="middle"
              >
                {displayData[displayData.length - 1].price.toFixed(4)}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
};

export default TradingChart;