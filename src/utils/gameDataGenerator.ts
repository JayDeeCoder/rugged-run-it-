// src/utils/gameDataGenerator.ts
import { Candle } from '../types/trade';

// Game state patterns to create more realistic market behavior
export enum MarketPattern {
  NORMAL = 'normal',          // Regular modest growth with natural volatility
  BULL_RUN = 'bull_run',      // Sustained upward trend with strong momentum
  ACCUMULATION = 'accumulation', // Sideways movement, building tension
  DISTRIBUTION = 'distribution', // Slight decline, preparing for a move
  FAKEOUT = 'fakeout',        // Quick rise then drop (smaller rug)
  RUG_PULL = 'rug_pull',      // Dramatic crash (house edge)
  SUPER_SPIKE = 'super_spike', // Rare dramatic upward move (player edge)
}

// Initial trading state interface
interface TradingState {
  currentPattern: MarketPattern;
  patternDuration: number;    // How long current pattern has lasted
  maxPatternDuration: number; // When to consider pattern change
  momentum: number;           // -1.0 to 1.0, impacts price direction
  volatility: number;         // 0.0 to 1.0, impacts price movement size
  currentMultiplier: number;  // Current price multiplier
  rugPullPending: boolean;    // If a rug pull is scheduled
  rugPullThreshold: number;   // Threshold for triggering rug
  playerBetsSum: number;      // Sum of active player bets
  betsSinceLastRug: number;   // Number of bets since last rug
  prevCandleClose: number;    // Previous candle close value
  highWatermark: number;      // Highest multiplier in current game
  supportsLevels: number[];   // Key support levels
  lastCandleCount: number;    // For tracking new candles  
  gameDuration: number;       // Total game duration in candles
  currentCandle: number;      // Current candle number in game
  forceRug: boolean;          // Force a rug pull
}

// Helper function to get random integer between min and max (inclusive)
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Create default trading state
export const createInitialTradingState = (): TradingState => {
  // Determine random game duration between 30 and 180 seconds (candles)
  let gameDuration = 0;
  const durationRoll = Math.random();
  
  if (durationRoll < 0.05) {
    // Instant or very quick rugs (0-5 seconds)
    gameDuration = Math.floor(Math.random() * 6);
  } else if (durationRoll < 0.30) {
    // Short games (5-30 seconds)
    gameDuration = 5 + Math.floor(Math.random() * 26);
  } else if (durationRoll < 0.70) {
    // Medium games (30-90 seconds)
    gameDuration = 30 + Math.floor(Math.random() * 61);
  } else {
    // Long games (90-180 seconds)
    gameDuration = 90 + Math.floor(Math.random() * 91);
  }
  
  return {
    currentPattern: MarketPattern.NORMAL,
    patternDuration: 0,
    maxPatternDuration: getRandomInt(5, 15),
    momentum: 0,
    volatility: 0.3,
    currentMultiplier: 1.0,
    rugPullPending: false,
    rugPullThreshold: getRandomInt(3, 10),
    playerBetsSum: 0,
    betsSinceLastRug: 0,
    prevCandleClose: 1.0,
    highWatermark: 1.0,
    supportsLevels: [1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 15.0, 20.0],
    lastCandleCount: 0,
    gameDuration: gameDuration,
    currentCandle: 0,
    forceRug: false
  };
};

// Add a player bet to the system
export const addPlayerBet = (state: TradingState, betAmount: number): TradingState => {
  const newState = { ...state };
  newState.playerBetsSum += betAmount;
  newState.betsSinceLastRug += 1;
  
  // Increase rug pull chance based on total bet amount and bet frequency
  if (
    newState.playerBetsSum > newState.rugPullThreshold || 
    newState.betsSinceLastRug > 10
  ) {
    // Schedule rug pull if significant player bets are in the system
    newState.rugPullPending = Math.random() < (
      newState.playerBetsSum / (newState.rugPullThreshold * 2) + 
      newState.betsSinceLastRug / 20
    );
  }
  
  return newState;
};

// Update game state for next tick
export const updateGameState = (state: TradingState): TradingState => {
  const newState = { ...state };
  
  // Increment candle count
  newState.currentCandle += 1;
  
  // Check if we need to force a rug pull based on game duration
  if (newState.currentCandle >= newState.gameDuration * 0.85) {
    // Time to force a rug pull - game has reached its predetermined length
    newState.forceRug = true;
    newState.currentPattern = MarketPattern.RUG_PULL;
    newState.patternDuration = 0;
    
    // Return early as we're forcing a rug pull
    return newState;
  }
  
  // Increment pattern duration
  newState.patternDuration += 1;
  
  // Simple pattern change logic (simplified for this implementation)
  if (newState.patternDuration >= newState.maxPatternDuration) {
    // Change pattern based on current state
    if (newState.currentMultiplier > 5 && Math.random() < 0.3) {
      // More likely to crash at higher multipliers
      newState.currentPattern = MarketPattern.RUG_PULL;
    } else if (newState.currentMultiplier < 2 && Math.random() < 0.4) {
      // More likely to start bull run at lower multipliers
      newState.currentPattern = MarketPattern.BULL_RUN;
    } else {
      // Otherwise random selection 
      const patterns = Object.values(MarketPattern);
      newState.currentPattern = patterns[Math.floor(Math.random() * patterns.length)];
    }
    
    // Reset pattern duration
    newState.patternDuration = 0;
    newState.maxPatternDuration = getRandomInt(5, 15);
    
    // Reset rug pull pending if we just executed one
    if (newState.currentPattern === MarketPattern.RUG_PULL) {
      newState.rugPullPending = false;
      newState.playerBetsSum = 0;
      newState.betsSinceLastRug = 0;
    }
  }
  
  // Update momentum and volatility based on pattern
  switch (newState.currentPattern) {
    case MarketPattern.NORMAL:
      // Mean-reverting momentum with slight upward bias
      newState.momentum = newState.momentum * 0.8 + (Math.random() - 0.45) * 0.3;
      newState.volatility = 0.3;
      break;
      
    case MarketPattern.BULL_RUN:
      // Strong positive momentum
      newState.momentum = newState.momentum * 0.7 + (Math.random() * 0.4 + 0.2);
      newState.volatility = 0.4;
      break;
      
    case MarketPattern.ACCUMULATION:
      // Low momentum, mostly sideways
      newState.momentum = newState.momentum * 0.5 + (Math.random() - 0.5) * 0.15;
      newState.volatility = 0.2;
      break;
      
    case MarketPattern.DISTRIBUTION:
      // Slightly negative momentum
      newState.momentum = newState.momentum * 0.7 + (Math.random() - 0.6) * 0.3;
      newState.volatility = 0.35;
      break;
      
    case MarketPattern.FAKEOUT:
      // Start positive then reverse
      if (newState.patternDuration < 3) {
        newState.momentum = newState.momentum * 0.6 + (Math.random() * 0.5 + 0.2);
      } else {
        newState.momentum = newState.momentum * 0.5 + (Math.random() - 0.8) * 0.5;
      }
      newState.volatility = 0.45;
      break;
      
    case MarketPattern.RUG_PULL:
      // Strong negative momentum
      newState.momentum = newState.momentum * 0.3 + (Math.random() - 1.2) * 0.7;
      newState.volatility = 0.6;
      break;
      
    case MarketPattern.SUPER_SPIKE:
      // Extreme positive momentum
      newState.momentum = newState.momentum * 0.6 + (Math.random() * 0.7 + 0.4);
      newState.volatility = 0.5;
      break;
  }
  
  // Clamp momentum
  newState.momentum = Math.max(-1, Math.min(1, newState.momentum));
  
  // Update high watermark
  if (newState.currentMultiplier > newState.highWatermark) {
    newState.highWatermark = newState.currentMultiplier;
  }
  
  return newState;
};

// Calculate next multiplier value based on current state with improved logarithmic behavior
export const calculateNextMultiplier = (state: TradingState): number => {
  // If we're in a forced rug pull, create a dramatic crash
  if (state.forceRug && state.currentPattern === MarketPattern.RUG_PULL) {
    // Dramatic crash with a long red candle - make more drastic
    return Math.max(0.1, state.currentMultiplier * (0.05 + Math.random() * 0.25));
  }
  
  // Base percentage change with logarithmic scaling
  // Higher multipliers = smaller percentage changes on average
  const logScale = Math.log10(Math.max(1.1, state.currentMultiplier));
  const basePercentChange = (state.volatility * 0.05) / logScale; 
  
  // Add occasional "jumps" for unpredictability - rare sudden movements
  const jumpFactor = Math.random() < 0.05 ? (Math.random() * 0.2) * (Math.random() > 0.5 ? 1 : -1) : 0;
  
  // Momentum impact (directional bias) with logarithmic dampening
  const momentumImpact = (state.momentum * state.volatility * 0.1) / Math.sqrt(logScale);
  
  // Pattern-specific multipliers with more extreme values
  let patternMultiplier = 1.0;
  switch (state.currentPattern) {
    case MarketPattern.RUG_PULL:
      // More dramatic crash for rug pull
      patternMultiplier = -6.0 * (1 + Math.random() * 0.5);
      break;
      
    case MarketPattern.SUPER_SPIKE:
      // More dramatic rise for super spike
      patternMultiplier = 4.0 * (1 + Math.random() * 0.5);
      break;
      
    case MarketPattern.BULL_RUN:
      patternMultiplier = 1.5 + Math.random() * 0.5;
      break;
      
    case MarketPattern.FAKEOUT:
      // If in second half of fakeout pattern, amplify downward movement
      if (state.patternDuration > 2) {
        patternMultiplier = -2.5 - Math.random();
      } else {
        patternMultiplier = 2.0 + Math.random() * 0.5;
      }
      break;
  }
  
  // Random noise component with occasional spikes
  const noiseBase = (Math.random() - 0.5) * state.volatility * 0.08;
  const noiseSpike = Math.random() < 0.1 ? (Math.random() - 0.5) * 0.1 : 0;
  const noise = noiseBase + noiseSpike;
  
  // Combine all factors
  const totalPercentChange = (basePercentChange + momentumImpact + noise + jumpFactor) * patternMultiplier;
  
  // Calculate next multiplier with percentage change
  let nextMultiplier = state.currentMultiplier * (1 + totalPercentChange);
  
  // Ensure multiplier doesn't go below 0.1 (game crashed)
  nextMultiplier = Math.max(0.1, nextMultiplier);
  
  // During rug pulls, ensure the crash happens definitively
  if (
    state.currentPattern === MarketPattern.RUG_PULL && 
    state.patternDuration > 1
  ) {
    // Force a crash by dropping to minimum multiplier - more dramatic
    nextMultiplier = Math.min(nextMultiplier, state.currentMultiplier * (0.3 - (state.patternDuration * 0.1)));
    
    // If we're deep into the rug pull, crash completely
    if (state.patternDuration > 2) {
      nextMultiplier = 0.1;
    }
  }
  
  return nextMultiplier;
};

// Generate a new candle based on the current state
export const generateCandle = (state: TradingState): { candle: Candle, newState: TradingState } => {
  // Update game state
  const updatedState = updateGameState(state);
  
  // Calculate next multiplier
  const multiplier = calculateNextMultiplier(updatedState);
  
  // Base candle data
  const open = updatedState.prevCandleClose || 1.0;
  const close = multiplier;
  
  // Generate wick length based on volatility and pattern
  const wickFactor = updatedState.volatility * (
    updatedState.currentPattern === MarketPattern.RUG_PULL ? 2.0 :
    updatedState.currentPattern === MarketPattern.SUPER_SPIKE ? 1.8 :
    1.2
  );
  
  // Determine high and low with asymmetric distribution based on direction
  let highWick, lowWick;
  
  // Special case for forced rug pull - make a VERY long red candle starting from the last candle
  if (updatedState.forceRug && updatedState.currentPattern === MarketPattern.RUG_PULL) {
    // Create a dramatic long red candle starting from the last open price
    highWick = Math.abs(open - close) * 0.1; // Minimal upper wick
    lowWick = Math.abs(open - close) * 4.0;  // Very long lower wick - more dramatic
  } else if (close > open) {
    // Uptrend - longer upper wick
    highWick = Math.abs(close - open) * (1 + Math.random() * wickFactor * 1.5);
    lowWick = Math.abs(close - open) * (0.4 + Math.random() * wickFactor * 0.7);
  } else {
    // Downtrend - longer lower wick
    highWick = Math.abs(close - open) * (0.4 + Math.random() * wickFactor * 0.7);
    lowWick = Math.abs(close - open) * (1 + Math.random() * wickFactor * 1.5);
  }
  
  // Calculate final high and low while ensuring they make sense
  const high = Math.max(open, close) + highWick;
  const low = Math.max(0.1, Math.min(open, close) - lowWick);
  
  // Update state with new close price
  updatedState.prevCandleClose = close;
  updatedState.currentMultiplier = close;
  
  // Create candle
  const candle: Candle = {
    timestamp: new Date().toISOString(),
    open,
    high,
    low,
    close,
    volume: Math.random() * 1000 + 500 // Fake volume
  };
  
  return { candle, newState: updatedState };
};

// Check if the game has crashed (for triggering reset)
export const hasGameCrashed = (state: TradingState): boolean => {
  return (
    state.currentMultiplier <= 0.2 || // Multiplier below threshold
    (state.currentPattern === MarketPattern.RUG_PULL && state.patternDuration >= 3) || // Completed rug pull
    (state.forceRug && state.currentPattern === MarketPattern.RUG_PULL) // Forced rug pull
  );
};

// Reset game state for a new round
export const resetGameState = (): TradingState => {
  return createInitialTradingState();
};

// Mock function to generate a full chart data set for testing
export const generateMockChartData = (
  symbol: string,
  interval: string,
  candleCount: number
): { symbol: string, interval: string, candles: Candle[], lastUpdated: string } => {
  let state = createInitialTradingState();
  const candles: Candle[] = [];
  
  for (let i = 0; i < candleCount; i++) {
    const { candle, newState } = generateCandle(state);
    state = newState;
    
    // Ensure timestamp reflects the sequence
    candle.timestamp = new Date(Date.now() - (candleCount - i) * 60000).toISOString();
    
    candles.push(candle);
    
    // If game crashed, reset state (for testing only)
    if (hasGameCrashed(state)) {
      state = resetGameState();
    }
  }
  
  return {
    symbol,
    interval,
    candles,
    lastUpdated: new Date().toISOString()
  };
};