// src/hooks/useArtificialPlayerCount.ts
import { useState, useEffect, useRef, useCallback } from 'react';

interface ArtificialPlayerCountConfig {
  minCount?: number;
  maxCount?: number;
  changeIntervalMs?: number;
  enabled?: boolean;
}

export const useArtificialPlayerCount = (config: ArtificialPlayerCountConfig = {}) => {
  const {
    minCount = 5,
    maxCount = 25,
    changeIntervalMs = 15000, // Change every 15 seconds
    enabled = true
  } = config;

  const [artificialCount, setArtificialCount] = useState<number>(
    Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount
  );
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastChangeRef = useRef<number>(Date.now());

  // Generate a new artificial count with smooth transitions
  const generateNewCount = useCallback((currentCount: number): number => {
    // 70% chance of small change (-2 to +3), 30% chance of bigger change
    const isSmallChange = Math.random() < 0.7;
    
    let newCount: number;
    
    if (isSmallChange) {
      // Small incremental changes
      const change = Math.floor(Math.random() * 6) - 2; // -2 to +3
      newCount = currentCount + change;
    } else {
      // Bigger jumps occasionally
      const change = Math.floor(Math.random() * 8) - 3; // -3 to +4
      newCount = currentCount + change;
    }
    
    // Ensure we stay within bounds
    newCount = Math.max(minCount, Math.min(maxCount, newCount));
    
    // If we're at the bounds, nudge toward center
    if (newCount === minCount && Math.random() < 0.6) {
      newCount += Math.floor(Math.random() * 3) + 1;
    } else if (newCount === maxCount && Math.random() < 0.6) {
      newCount -= Math.floor(Math.random() * 3) + 1;
    }
    
    return newCount;
  }, [minCount, maxCount]);

  // Function to manually trigger a count change (for game events)
  // 🚀 FIX: Wrap in useCallback to prevent re-creation on every render
  const triggerCountChange = useCallback(() => {
    if (!enabled) return;
    
    setArtificialCount(prev => {
      const newCount = generateNewCount(prev);
      lastChangeRef.current = Date.now();
      return newCount;
    });
  }, [enabled, generateNewCount]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const updateArtificialCount = () => {
      setArtificialCount(prev => {
        const newCount = generateNewCount(prev);
        lastChangeRef.current = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`🎭 Artificial player count: ${prev} → ${newCount}`);
        }
        
        return newCount;
      });
    };

    // Set up interval for regular updates
    intervalRef.current = setInterval(updateArtificialCount, changeIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, changeIntervalMs, generateNewCount]);

  // Function to calculate total player count
  const getTotalPlayerCount = useCallback((actualPlayerCount: number = 0): number => {
    if (!enabled) return actualPlayerCount;
    return artificialCount + actualPlayerCount;
  }, [enabled, artificialCount]);

  // Function to get just the artificial count
  const getArtificialCount = useCallback((): number => {
    return enabled ? artificialCount : 0;
  }, [enabled, artificialCount]);

  return {
    artificialCount,
    getTotalPlayerCount,
    getArtificialCount,
    triggerCountChange,
    lastChange: lastChangeRef.current
  };
};