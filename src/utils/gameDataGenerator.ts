// src/utils/gameDataGenerator.ts - Enhanced with High Volatility Trading Movements
import { Candle } from '../types/trade';

// Reward tiers for "slot machine" randomness
export enum RewardTier {
  COMMON = 'common',      // 50% chance, 0.9-1.1x multiplier
  UNCOMMON = 'uncommon',  // 25% chance, 1.2-1.8x multiplier
  RARE = 'rare',          // 15% chance, 1.8-3.0x multiplier
  EPIC = 'epic',          // 7% chance, 3.0-10.0x multiplier
  LEGENDARY = 'legendary' // 3% chance, 10.0-50.0x multiplier
}

// Enhanced market patterns with more trading-like behavior
export enum MarketPattern {
  NORMAL = 'normal',              // Regular modest growth with natural volatility
  BULL_RUN = 'bull_run',          // Sustained upward trend with pullbacks
  ACCUMULATION = 'accumulation',   // Sideways movement with low volatility
  DISTRIBUTION = 'distribution',   // Topping formation with high volatility
  FAKEOUT = 'fakeout',            // Quick rise then sharp reversal
  RUG_PULL = 'rug_pull',          // Dramatic crash (house edge)
  SUPER_SPIKE = 'super_spike',    // Rare dramatic upward move
  CONSOLIDATION = 'consolidation', // Tight range trading
  BREAKOUT = 'breakout',          // Breaking through resistance
  PULLBACK = 'pullback',          // Temporary decline in uptrend
  WHIPSAW = 'whipsaw',            // Rapid back-and-forth movement
  PARABOLIC = 'parabolic'         // Exponential growth phase
}

// Trader psychology profiles
export enum TraderProfile {
  CAUTIOUS = 'cautious',
  MODERATE = 'moderate',
  AGGRESSIVE = 'aggressive',
  YOLO = 'yolo',
  TILT = 'tilt'
}

// Enhanced trading state with more realistic market mechanics
interface TradingState {
  currentPattern: MarketPattern;
  patternDuration: number;
  maxPatternDuration: number;
  momentum: number;           // -1.0 to 1.0
  volatility: number;         // 0.0 to 2.0 (increased range)
  currentMultiplier: number;
  rugPullPending: boolean;
  rugPullThreshold: number;
  playerBetsSum: number;
  betsSinceLastRug: number;
  prevCandleClose: number;
  highWatermark: number;
  supportLevels: number[];    // Dynamic support levels
  resistanceLevels: number[]; // Dynamic resistance levels
  lastCandleCount: number;
  gameDuration: number;
  currentCandle: number;
  forceRug: boolean;
  rewardTier: RewardTier;
  houseEdgeApplied: boolean;
  traderProfile: TraderProfile;
  consecutiveLosses: number;
  
  // New volatility and movement parameters
  microTrend: number;         // Short-term trend bias
  noiseLevel: number;         // Random noise intensity
  trendStrength: number;      // How strong the current trend is
  consolidationPhase: boolean; // Whether in sideways movement
  lastBreakoutLevel: number;  // Last significant price level broken
  volumeSpike: boolean;       // Indicates high activity periods
  fibonacciLevels: number[];  // Key retracement levels
}

// Game outcome details
export interface GameOutcome {
  multiplier: number;
  tier: RewardTier;
  pattern: MarketPattern;
  rugPulled: boolean;
  houseEdge: number;
  finalPayout: number;
  traderProfile: TraderProfile;
}

// Helper functions
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function getRandomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Determine reward tier
function determineRewardTier(): RewardTier {
  const roll = Math.random() * 100;
  if (roll < 50) return RewardTier.COMMON;
  if (roll < 75) return RewardTier.UNCOMMON;
  if (roll < 90) return RewardTier.RARE;
  if (roll < 97) return RewardTier.EPIC;
  return RewardTier.LEGENDARY;
}

// Get multiplier range based on reward tier
function getMultiplierRange(tier: RewardTier): { min: number, max: number } {
  switch (tier) {
    case RewardTier.COMMON:
      return { min: 0.9, max: 1.1 };
    case RewardTier.UNCOMMON:
      return { min: 1.2, max: 1.8 };
    case RewardTier.RARE:
      return { min: 1.8, max: 3.0 };
    case RewardTier.EPIC:
      return { min: 3.0, max: 10.0 };
    case RewardTier.LEGENDARY:
      return { min: 10.0, max: 50.0 };
  }
}

// Calculate trader profile
export function determineTraderProfile(betAmount: number, walletBalance: number, consecutiveLosses: number = 0): TraderProfile {
  const betPercentage = (betAmount / walletBalance) * 100;
  
  if (consecutiveLosses >= 3 && betPercentage > 20) {
    return TraderProfile.TILT;
  }
  
  if (betPercentage > 50) return TraderProfile.YOLO;
  if (betPercentage > 20) return TraderProfile.AGGRESSIVE;
  if (betPercentage > 5) return TraderProfile.MODERATE;
  return TraderProfile.CAUTIOUS;
}

// Calculate rugpull probability
function calculateRugPullProbability(
  betAmount: number, 
  walletBalance: number, 
  tier: RewardTier, 
  profile: TraderProfile
): number {
  let rugPullChance = 0.05;
  
  switch (tier) {
    case RewardTier.COMMON:
      rugPullChance += 0.0;
      break;
    case RewardTier.UNCOMMON:
      rugPullChance += 0.05;
      break;
    case RewardTier.RARE:
      rugPullChance += 0.10;
      break;
    case RewardTier.EPIC:
      rugPullChance += 0.15;
      break;
    case RewardTier.LEGENDARY:
      rugPullChance += 0.20;
      break;
  }
  
  switch (profile) {
    case TraderProfile.CAUTIOUS:
      rugPullChance *= 0.5;
      break;
    case TraderProfile.MODERATE:
      break;
    case TraderProfile.AGGRESSIVE:
      rugPullChance *= 1.5;
      break;
    case TraderProfile.YOLO:
      rugPullChance *= 2.0;
      break;
    case TraderProfile.TILT:
      rugPullChance *= 2.5;
      break;
  }
  
  const betPercentage = (betAmount / walletBalance);
  rugPullChance += betPercentage * 0.2;
  
  return Math.min(0.9, rugPullChance);
}

// Apply 40% house edge (as requested)
function applyHouseEdge(multiplier: number): number {
  const houseEdgePercent = 40; // Fixed 40% house edge
  return multiplier * (1 - (houseEdgePercent / 100));
}

// Generate dynamic support and resistance levels
function generateSupportResistanceLevels(currentPrice: number, highWatermark: number): { support: number[], resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  // Fibonacci retracement levels from high watermark
  const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
  const range = highWatermark - 1.0;
  
  fibLevels.forEach(level => {
    const fibPrice = highWatermark - (range * level);
    if (fibPrice < currentPrice) {
      support.push(Number(fibPrice.toFixed(4)));
    } else {
      resistance.push(Number(fibPrice.toFixed(4)));
    }
  });
  
  // Add psychological levels
  const psychLevels = [1.0, 1.5, 2.0, 2.5, 3.0, 5.0, 10.0, 15.0, 20.0, 25.0, 50.0];
  psychLevels.forEach(level => {
    if (level < currentPrice && level > 0.8) {
      support.push(level);
    } else if (level > currentPrice) {
      resistance.push(level);
    }
  });
  
  return {
    support: support.sort((a, b) => b - a).slice(0, 3), // Top 3 support levels
    resistance: resistance.sort((a, b) => a - b).slice(0, 3) // Top 3 resistance levels
  };
}

// Create enhanced initial trading state
export const createInitialTradingState = (betAmount = 0, walletBalance = 1): TradingState => {
  const rewardTier = determineRewardTier();
  const traderProfile = determineTraderProfile(betAmount, walletBalance);
  
  let gameDuration = 0;
  switch (rewardTier) {
    case RewardTier.COMMON:
      gameDuration = getRandomInt(10, 40);
      break;
    case RewardTier.UNCOMMON:
      gameDuration = getRandomInt(20, 70);
      break;
    case RewardTier.RARE:
      gameDuration = getRandomInt(40, 100);
      break;
    case RewardTier.EPIC:
      gameDuration = getRandomInt(60, 140);
      break;
    case RewardTier.LEGENDARY:
      gameDuration = getRandomInt(80, 200);
      break;
  }
  
  const rugPullChance = calculateRugPullProbability(betAmount, walletBalance, rewardTier, traderProfile);
  const willRugPull = Math.random() < rugPullChance;
  
  const rugPullPending = willRugPull || 
    ((traderProfile === TraderProfile.YOLO || traderProfile === TraderProfile.TILT) && 
     rewardTier === RewardTier.LEGENDARY && 
     Math.random() < 0.7);
  
  return {
    currentPattern: MarketPattern.NORMAL,
    patternDuration: 0,
    maxPatternDuration: getRandomInt(3, 8), // Shorter patterns for more variety
    momentum: 0,
    volatility: getRandomFloat(0.4, 0.8), // Higher base volatility
    currentMultiplier: 1.0,
    rugPullPending,
    rugPullThreshold: getRandomInt(3, 10),
    playerBetsSum: betAmount,
    betsSinceLastRug: 0,
    prevCandleClose: 1.0,
    highWatermark: 1.0,
    supportLevels: [1.0],
    resistanceLevels: [1.5, 2.0, 3.0],
    lastCandleCount: 0,
    gameDuration,
    currentCandle: 0,
    forceRug: false,
    rewardTier,
    houseEdgeApplied: false,
    traderProfile,
    consecutiveLosses: 0,
    
    // Enhanced parameters
    microTrend: getRandomFloat(-0.3, 0.3),
    noiseLevel: getRandomFloat(0.2, 0.6),
    trendStrength: getRandomFloat(0.3, 0.8),
    consolidationPhase: false,
    lastBreakoutLevel: 1.0,
    volumeSpike: false,
    fibonacciLevels: [1.0, 1.236, 1.382, 1.5, 1.618, 2.0, 2.618, 3.0]
  };
};

// Enhanced game state update with more realistic market behavior
export const updateGameState = (state: TradingState): TradingState => {
  const newState = { ...state };
  newState.currentCandle += 1;
  
  // Update support and resistance levels
  const levels = generateSupportResistanceLevels(newState.currentMultiplier, newState.highWatermark);
  newState.supportLevels = levels.support;
  newState.resistanceLevels = levels.resistance;
  
  // Check for forced rug pull
  const tierMultiplierRange = getMultiplierRange(newState.rewardTier);
  const targetMultiplier = (tierMultiplierRange.min + tierMultiplierRange.max) / 2;
  const nearTarget = newState.currentMultiplier > targetMultiplier * 0.7;
  
  if (
    (newState.currentCandle >= newState.gameDuration * 0.85) || 
    (nearTarget && newState.rugPullPending && Math.random() < 0.3)
  ) {
    newState.forceRug = true;
    newState.currentPattern = MarketPattern.RUG_PULL;
    newState.patternDuration = 0;
    return newState;
  }
  
  newState.patternDuration += 1;
  
  // Enhanced pattern switching with more variety
  if (newState.patternDuration >= newState.maxPatternDuration) {
    const progressionPct = newState.currentCandle / newState.gameDuration;
    const availablePatterns: MarketPattern[] = [];
    
    // Determine available patterns based on game progression and current state
    if (progressionPct < 0.3) {
      // Early game - building phase
      availablePatterns.push(
        MarketPattern.NORMAL,
        MarketPattern.ACCUMULATION,
        MarketPattern.CONSOLIDATION,
        MarketPattern.PULLBACK
      );
      
      if (newState.rewardTier !== RewardTier.COMMON) {
        availablePatterns.push(MarketPattern.BULL_RUN, MarketPattern.BREAKOUT);
      }
    } else if (progressionPct < 0.7) {
      // Mid game - momentum phase
      if (newState.currentMultiplier < tierMultiplierRange.min * 0.8) {
        availablePatterns.push(MarketPattern.BULL_RUN, MarketPattern.BREAKOUT, MarketPattern.SUPER_SPIKE);
      } else if (newState.currentMultiplier > tierMultiplierRange.max * 1.1) {
        availablePatterns.push(MarketPattern.DISTRIBUTION, MarketPattern.FAKEOUT, MarketPattern.PULLBACK);
      } else {
        availablePatterns.push(
          MarketPattern.NORMAL,
          MarketPattern.BULL_RUN,
          MarketPattern.WHIPSAW,
          MarketPattern.CONSOLIDATION,
          MarketPattern.PARABOLIC
        );
        
        if (newState.rewardTier === RewardTier.LEGENDARY && Math.random() < 0.3) {
          availablePatterns.push(MarketPattern.SUPER_SPIKE);
        }
      }
    } else {
      // Late game - decision phase
      if (newState.rugPullPending && Math.random() < 0.5) {
        newState.currentPattern = MarketPattern.RUG_PULL;
        newState.rugPullPending = false;
      } else {
        availablePatterns.push(
          MarketPattern.BULL_RUN,
          MarketPattern.PARABOLIC,
          MarketPattern.DISTRIBUTION,
          MarketPattern.FAKEOUT,
          MarketPattern.WHIPSAW
        );
      }
    }
    
    if (availablePatterns.length > 0) {
      newState.currentPattern = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
    }
    
    newState.patternDuration = 0;
    newState.maxPatternDuration = getRandomInt(3, 12); // More varied pattern durations
    
    if (newState.currentPattern === MarketPattern.RUG_PULL) {
      newState.rugPullPending = false;
      newState.playerBetsSum = 0;
      newState.betsSinceLastRug = 0;
    }
  }
  
  // Update momentum, volatility, and other parameters based on pattern
  updateMarketParameters(newState);
  
  // Update high watermark
  if (newState.currentMultiplier > newState.highWatermark) {
    newState.highWatermark = newState.currentMultiplier;
  }
  
  return newState;
};

// Enhanced market parameter updates
function updateMarketParameters(state: TradingState): void {
  const baseVolatility = 0.5;
  const tierVolatilityMultiplier = 
    state.rewardTier === RewardTier.LEGENDARY ? 1.5 :
    state.rewardTier === RewardTier.EPIC ? 1.3 :
    state.rewardTier === RewardTier.RARE ? 1.1 : 1.0;
  
  switch (state.currentPattern) {
    case MarketPattern.NORMAL:
      state.momentum = state.momentum * 0.7 + (Math.random() - 0.45) * 0.4;
      state.volatility = baseVolatility * 0.8 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(-0.2, 0.3);
      state.noiseLevel = 0.3;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.BULL_RUN:
      const tierBoost = 
        state.rewardTier === RewardTier.LEGENDARY ? 0.6 :
        state.rewardTier === RewardTier.EPIC ? 0.5 :
        state.rewardTier === RewardTier.RARE ? 0.4 : 0.3;
      state.momentum = state.momentum * 0.6 + (Math.random() * 0.5 + tierBoost);
      state.volatility = baseVolatility * 1.2 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(0.1, 0.5);
      state.noiseLevel = 0.4;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.ACCUMULATION:
      state.momentum = state.momentum * 0.9 + (Math.random() - 0.5) * 0.1;
      state.volatility = baseVolatility * 0.4 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(-0.1, 0.1);
      state.noiseLevel = 0.2;
      state.consolidationPhase = true;
      break;
      
    case MarketPattern.DISTRIBUTION:
      state.momentum = state.momentum * 0.6 + (Math.random() - 0.7) * 0.4;
      state.volatility = baseVolatility * 1.6 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(-0.4, 0.2);
      state.noiseLevel = 0.6;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.FAKEOUT:
      if (state.patternDuration < 2) {
        state.momentum = state.momentum * 0.5 + (Math.random() * 0.6 + 0.3);
        state.microTrend = 0.4;
      } else {
        state.momentum = state.momentum * 0.4 + (Math.random() - 1.0) * 0.8;
        state.microTrend = -0.6;
      }
      state.volatility = baseVolatility * 1.8 * tierVolatilityMultiplier;
      state.noiseLevel = 0.7;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.RUG_PULL:
      state.momentum = state.momentum * 0.2 + (Math.random() - 1.3) * 0.9;
      state.volatility = baseVolatility * 2.0 * tierVolatilityMultiplier;
      state.microTrend = -0.8;
      state.noiseLevel = 0.9;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.SUPER_SPIKE:
      const spikeMultiplier = 
        state.rewardTier === RewardTier.LEGENDARY ? 1.8 :
        state.rewardTier === RewardTier.EPIC ? 1.5 : 1.2;
      state.momentum = state.momentum * 0.5 + (Math.random() * 0.8 + 0.5) * spikeMultiplier;
      state.volatility = baseVolatility * 1.4 * tierVolatilityMultiplier;
      state.microTrend = 0.7;
      state.noiseLevel = 0.5;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.CONSOLIDATION:
      state.momentum = state.momentum * 0.95 + (Math.random() - 0.5) * 0.05;
      state.volatility = baseVolatility * 0.3 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(-0.05, 0.05);
      state.noiseLevel = 0.15;
      state.consolidationPhase = true;
      break;
      
    case MarketPattern.BREAKOUT:
      state.momentum = state.momentum * 0.4 + (Math.random() * 0.7 + 0.4);
      state.volatility = baseVolatility * 1.5 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(0.3, 0.6);
      state.noiseLevel = 0.5;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.PULLBACK:
      state.momentum = state.momentum * 0.6 + (Math.random() - 0.8) * 0.3;
      state.volatility = baseVolatility * 1.1 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(-0.3, -0.1);
      state.noiseLevel = 0.4;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.WHIPSAW:
      state.momentum = (Math.random() - 0.5) * 1.2; // Completely random momentum
      state.volatility = baseVolatility * 1.9 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(-0.5, 0.5);
      state.noiseLevel = 0.8;
      state.consolidationPhase = false;
      break;
      
    case MarketPattern.PARABOLIC:
      state.momentum = state.momentum * 0.3 + (Math.random() * 0.6 + 0.6);
      state.volatility = baseVolatility * 1.3 * tierVolatilityMultiplier;
      state.microTrend = getRandomFloat(0.4, 0.8);
      state.noiseLevel = 0.4;
      state.consolidationPhase = false;
      break;
  }
  
  // Clamp values
  state.momentum = Math.max(-1.2, Math.min(1.2, state.momentum));
  state.volatility = Math.max(0.1, Math.min(2.0, state.volatility));
  state.microTrend = Math.max(-1.0, Math.min(1.0, state.microTrend));
  state.noiseLevel = Math.max(0.1, Math.min(1.0, state.noiseLevel));
}

// Enhanced multiplier calculation with realistic trading movements
export const calculateNextMultiplier = (state: TradingState): number => {
  if (state.forceRug && state.currentPattern === MarketPattern.RUG_PULL) {
    return Math.max(0.1, state.currentMultiplier * (0.03 + Math.random() * 0.15));
  }
  
  const { min: targetMin, max: targetMax } = getMultiplierRange(state.rewardTier);
  const progressPct = state.currentCandle / state.gameDuration;
  
  // Enhanced volatility scaling with logarithmic dampening
  const logScale = Math.log10(Math.max(1.01, state.currentMultiplier));
  const volatilityScale = 1 / Math.sqrt(logScale);
  
  // Base percentage change with higher volatility
  let basePercentChange = (state.volatility * 0.08) * volatilityScale;
  
  // Micro trend influence (short-term bias)
  const microTrendImpact = state.microTrend * 0.02 * volatilityScale;
  
  // Momentum impact with enhanced scaling
  const momentumImpact = (state.momentum * state.volatility * 0.15) * volatilityScale;
  
  // High-frequency noise for realistic price action
  const highFreqNoise = (Math.random() - 0.5) * state.noiseLevel * 0.04;
  const mediumFreqNoise = (Math.random() - 0.5) * state.volatility * 0.02;
  
  // Support and resistance interactions
  let supportResistanceImpact = 0;
  const nearestSupport = state.supportLevels.find(level => Math.abs(state.currentMultiplier - level) < 0.05);
  const nearestResistance = state.resistanceLevels.find(level => Math.abs(state.currentMultiplier - level) < 0.05);
  
  if (nearestSupport && state.momentum < 0) {
    // Bounce off support
    supportResistanceImpact = Math.random() * 0.03;
  } else if (nearestResistance && state.momentum > 0) {
    // Rejection at resistance
    supportResistanceImpact = -Math.random() * 0.02;
  }
  
  // Occasional jump moves for unpredictability
  const jumpChance = 
    state.rewardTier === RewardTier.LEGENDARY ? 0.20 :
    state.rewardTier === RewardTier.EPIC ? 0.15 :
    state.rewardTier === RewardTier.RARE ? 0.12 : 0.08;
    
  const jumpFactor = Math.random() < jumpChance ? 
    (Math.random() * 0.15 - 0.075) * (Math.random() > 0.6 ? 2 : 1) : 0;
  
  // Target gravity (pull toward target range)
  let targetGravity = 0;
  if (progressPct > 0.3) {
    const gravityStrength = Math.min(0.03, (progressPct - 0.3) * 0.08);
    
    if (state.currentMultiplier < targetMin) {
      targetGravity = gravityStrength;
    } else if (state.currentMultiplier > targetMax && !state.rugPullPending) {
      targetGravity = -gravityStrength * 0.6;
    }
  }
  
  // Pattern-specific multipliers
  let patternMultiplier = 1.0;
  switch (state.currentPattern) {
    case MarketPattern.RUG_PULL:
      patternMultiplier = -8.0 * (1 + Math.random() * 0.7);
      break;
    case MarketPattern.SUPER_SPIKE:
      const spikeBoost = 
        state.rewardTier === RewardTier.LEGENDARY ? 2.0 :
        state.rewardTier === RewardTier.EPIC ? 1.7 : 1.3;
      patternMultiplier = 5.0 * (1 + Math.random() * 0.8) * spikeBoost;
      break;
    case MarketPattern.PARABOLIC:
      patternMultiplier = 3.0 + Math.random() * 1.5;
      break;
    case MarketPattern.BULL_RUN:
      patternMultiplier = 1.8 + Math.random() * 0.7;
      break;
    case MarketPattern.BREAKOUT:
      patternMultiplier = 2.2 + Math.random() * 0.8;
      break;
    case MarketPattern.FAKEOUT:
      if (state.patternDuration > 2) {
        patternMultiplier = -3.5 - Math.random() * 1.5;
      } else {
        patternMultiplier = 2.5 + Math.random() * 0.8;
      }
      break;
    case MarketPattern.WHIPSAW:
      patternMultiplier = (Math.random() - 0.5) * 6.0; // Extreme volatility
      break;
    case MarketPattern.PULLBACK:
      patternMultiplier = -1.5 - Math.random() * 0.8;
      break;
    case MarketPattern.DISTRIBUTION:
      patternMultiplier = -0.5 - Math.random() * 1.0;
      break;
    default:
      patternMultiplier = 1.0;
  }
  
  // Combine all factors
  const totalPercentChange = (
    basePercentChange + 
    microTrendImpact + 
    momentumImpact + 
    highFreqNoise + 
    mediumFreqNoise + 
    jumpFactor + 
    targetGravity + 
    supportResistanceImpact
  ) * patternMultiplier;
  
  // Calculate next multiplier
  let nextMultiplier = state.currentMultiplier * (1 + totalPercentChange);
  
  // Ensure minimum value
  nextMultiplier = Math.max(0.1, nextMultiplier);
  
  // Enhanced rug pull mechanics
  if (state.currentPattern === MarketPattern.RUG_PULL && state.patternDuration > 1) {
    nextMultiplier = Math.min(nextMultiplier, state.currentMultiplier * (0.2 - (state.patternDuration * 0.05)));
    
    if (state.patternDuration > 3) {
      nextMultiplier = 0.1;
    }
  }
  
  // Apply 40% house edge at game end
  if (state.currentCandle >= state.gameDuration - 1 && !state.houseEdgeApplied) {
    nextMultiplier = applyHouseEdge(nextMultiplier);
    state.houseEdgeApplied = true;
  }
  
  return nextMultiplier;
};

// Enhanced candle generation with realistic trading patterns
export const generateCandle = (state: TradingState): { candle: Candle, newState: TradingState } => {
  const updatedState = updateGameState(state);
  const multiplier = calculateNextMultiplier(updatedState);
  
  const open = updatedState.prevCandleClose || 1.0;
  const close = multiplier;
  
  // Enhanced wick calculation based on pattern and volatility
  const baseWickFactor = updatedState.volatility * (
    updatedState.currentPattern === MarketPattern.RUG_PULL ? 3.0 :
    updatedState.currentPattern === MarketPattern.WHIPSAW ? 2.5 :
    updatedState.currentPattern === MarketPattern.DISTRIBUTION ? 2.2 :
    updatedState.currentPattern === MarketPattern.SUPER_SPIKE ? 2.0 :
    updatedState.currentPattern === MarketPattern.FAKEOUT ? 1.8 :
    1.3
  );
  
  let highWick, lowWick;
  
  if (updatedState.forceRug && updatedState.currentPattern === MarketPattern.RUG_PULL) {
    // Dramatic rug pull candle
    highWick = Math.abs(open - close) * 0.05;
    lowWick = Math.abs(open - close) * 6.0;
  } else if (updatedState.currentPattern === MarketPattern.WHIPSAW) {
    // Extreme wicks for whipsaw pattern
    highWick = Math.abs(close - open) * (2 + Math.random() * baseWickFactor * 2);
    lowWick = Math.abs(close - open) * (2 + Math.random() * baseWickFactor * 2);
  } else if (close > open) {
    // Bullish candle with asymmetric wicks
    highWick = Math.abs(close - open) * (0.5 + Math.random() * baseWickFactor * 1.8);
    lowWick = Math.abs(close - open) * (0.2 + Math.random() * baseWickFactor * 0.9);
  } else {
    // Bearish candle with asymmetric wicks
    highWick = Math.abs(close - open) * (0.2 + Math.random() * baseWickFactor * 0.9);
    lowWick = Math.abs(close - open) * (0.5 + Math.random() * baseWickFactor * 1.8);
  }
  
  // Add extra volatility for certain patterns
  if (updatedState.currentPattern === MarketPattern.DISTRIBUTION || 
      updatedState.currentPattern === MarketPattern.FAKEOUT) {
    highWick *= (1 + Math.random() * 0.5);
    lowWick *= (1 + Math.random() * 0.5);
  }
  
  const high = Math.max(open, close) + highWick;
  const low = Math.max(0.1, Math.min(open, close) - lowWick);
  
  updatedState.prevCandleClose = close;
  updatedState.currentMultiplier = close;
  
  const candle: Candle = {
    timestamp: new Date().toISOString(),
    open: Number(open.toFixed(4)),
    high: Number(high.toFixed(4)),
    low: Number(low.toFixed(4)),
    close: Number(close.toFixed(4)),
    volume: Math.random() * 1500 + 700 // Higher volume variance
  };
  
  return { candle, newState: updatedState };
};

// Other utility functions remain the same but with updated house edge
export const addPlayerBet = (state: TradingState, betAmount: number, walletBalance: number): TradingState => {
  const newState = { ...state };
  newState.playerBetsSum += betAmount;
  newState.betsSinceLastRug += 1;
  
  newState.traderProfile = determineTraderProfile(betAmount, walletBalance, newState.consecutiveLosses);
  
  const rugPullModifier = newState.traderProfile === TraderProfile.YOLO ? 1.5 : 
                          newState.traderProfile === TraderProfile.TILT ? 2.0 : 1.0;
                          
  if (newState.playerBetsSum > newState.rugPullThreshold * rugPullModifier || 
      newState.betsSinceLastRug > 10) {
    newState.rugPullPending = Math.random() < (
      (newState.playerBetsSum / (newState.rugPullThreshold * 2)) * rugPullModifier + 
      newState.betsSinceLastRug / 20
    );
  }
  
  return newState;
};

export const hasGameCrashed = (state: TradingState): boolean => {
  return (
    state.currentMultiplier <= 0.2 || 
    (state.currentPattern === MarketPattern.RUG_PULL && state.patternDuration >= 3) || 
    (state.forceRug && state.currentPattern === MarketPattern.RUG_PULL)
  );
};

export const getFinalGameOutcome = (state: TradingState, betAmount: number): GameOutcome => {
  const houseEdgePercent = 40; // Fixed 40% house edge
  const finalMultiplier = applyHouseEdge(state.currentMultiplier);
  const finalPayout = betAmount * finalMultiplier;
  
  return {
    multiplier: finalMultiplier,
    tier: state.rewardTier,
    pattern: state.currentPattern,
    rugPulled: hasGameCrashed(state),
    houseEdge: houseEdgePercent,
    finalPayout,
    traderProfile: state.traderProfile
  };
};

export const resetGameState = (betAmount = 0, walletBalance = 1, consecutiveLosses = 0): TradingState => {
  const state = createInitialTradingState(betAmount, walletBalance);
  state.consecutiveLosses = consecutiveLosses;
  return state;
};