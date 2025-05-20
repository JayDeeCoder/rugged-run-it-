// src/utils/gameDataGenerator.ts
import { Candle } from '../types/trade';

// Reward tiers for "slot machine" randomness
export enum RewardTier {
  COMMON = 'common',      // 50% chance, 0.9-1.1x multiplier
  UNCOMMON = 'uncommon',  // 25% chance, 1.2-1.8x multiplier
  RARE = 'rare',          // 15% chance, 1.8-3.0x multiplier
  EPIC = 'epic',          // 7% chance, 3.0-10.0x multiplier
  LEGENDARY = 'legendary' // 3% chance, 10.0-50.0x multiplier
}

// Market patterns with volatility profiles
export enum MarketPattern {
  NORMAL = 'normal',          // Regular modest growth with natural volatility
  BULL_RUN = 'bull_run',      // Sustained upward trend with strong momentum
  ACCUMULATION = 'accumulation', // Sideways movement, building tension
  DISTRIBUTION = 'distribution', // Slight decline, preparing for a move
  FAKEOUT = 'fakeout',        // Quick rise then drop (smaller rug)
  RUG_PULL = 'rug_pull',      // Dramatic crash (house edge)
  SUPER_SPIKE = 'super_spike', // Rare dramatic upward move (player edge)
}

// Trader psychology profiles based on bet size vs wallet
export enum TraderProfile {
  CAUTIOUS = 'cautious',      // Bet < 5% of wallet
  MODERATE = 'moderate',      // Bet 5-20% of wallet
  AGGRESSIVE = 'aggressive',  // Bet 20-50% of wallet  
  YOLO = 'yolo',              // Bet > 50% of wallet
  TILT = 'tilt'               // Multiple large bets after losses
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
  rewardTier: RewardTier;     // Current reward tier for this round
  houseEdgeApplied: boolean;  // Whether house edge has been applied
  traderProfile: TraderProfile; // Player's risk profile
  consecutiveLosses: number;  // Track consecutive losses (for tilt)
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

// Helper function to get random integer between min and max (inclusive)
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Determine reward tier based on RNG (slot machine element)
function determineRewardTier(): RewardTier {
  const roll = Math.random() * 100;
  
  if (roll < 50) return RewardTier.COMMON;     // 50% chance
  if (roll < 75) return RewardTier.UNCOMMON;   // 25% chance
  if (roll < 90) return RewardTier.RARE;       // 15% chance
  if (roll < 97) return RewardTier.EPIC;       // 7% chance
  return RewardTier.LEGENDARY;                 // 3% chance
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

// Determine trader profile based on bet size vs wallet
export function determineTraderProfile(betAmount: number, walletBalance: number, consecutiveLosses: number = 0): TraderProfile {
  // Calculate bet as percentage of wallet
  const betPercentage = (betAmount / walletBalance) * 100;
  
  // Check for tilt behavior
  if (consecutiveLosses >= 3 && betPercentage > 20) {
    return TraderProfile.TILT;
  }
  
  // Normal risk profiles
  if (betPercentage > 50) return TraderProfile.YOLO;
  if (betPercentage > 20) return TraderProfile.AGGRESSIVE;
  if (betPercentage > 5) return TraderProfile.MODERATE;
  return TraderProfile.CAUTIOUS;
}

// Calculate rugpull probability based on bet size, reward tier, and trader profile
function calculateRugPullProbability(
  betAmount: number, 
  walletBalance: number, 
  tier: RewardTier, 
  profile: TraderProfile
): number {
  // Base chance of rugpull
  let rugPullChance = 0.05; // 5% base chance
  
  // Adjust based on reward tier (higher tier = higher chance of rugpull)
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
  
  // Adjust based on trader profile (more aggressive = higher rugpull chance)
  switch (profile) {
    case TraderProfile.CAUTIOUS:
      rugPullChance *= 0.5; // Reduced chance for cautious players
      break;
    case TraderProfile.MODERATE:
      // No adjustment
      break;
    case TraderProfile.AGGRESSIVE:
      rugPullChance *= 1.5; // Increased chance for aggressive players
      break;
    case TraderProfile.YOLO:
      rugPullChance *= 2.0; // Double chance for YOLO players
      break;
    case TraderProfile.TILT:
      rugPullChance *= 2.5; // Highest chance for tilted players
      break;
  }
  
  // Additional adjustment based on bet size as percentage of wallet
  const betPercentage = (betAmount / walletBalance);
  rugPullChance += betPercentage * 0.2; // Up to additional 20% chance for all-in bets
  
  // Cap at 90% max probability
  return Math.min(0.9, rugPullChance);
}

// Apply house edge to final multiplier
function applyHouseEdge(multiplier: number, tier: RewardTier): number {
  // House edge varies by tier (more favorable for lower tiers to encourage continued play)
  let houseEdgePercent = 0;
  
  switch (tier) {
    case RewardTier.COMMON:
      houseEdgePercent = 2; // 2% house edge
      break;
    case RewardTier.UNCOMMON:
      houseEdgePercent = 5; // 5% house edge
      break;
    case RewardTier.RARE:
      houseEdgePercent = 8; // 8% house edge
      break;
    case RewardTier.EPIC:
      houseEdgePercent = 10; // 10% house edge
      break;
    case RewardTier.LEGENDARY:
      houseEdgePercent = 15; // 15% house edge for huge multipliers
      break;
  }
  
  // Apply the house edge
  return multiplier * (1 - (houseEdgePercent / 100));
}

// Create default trading state
export const createInitialTradingState = (betAmount = 0, walletBalance = 1): TradingState => {
  // Determine reward tier for this game session (slot machine element)
  const rewardTier = determineRewardTier();
  
  // Determine trader profile based on bet sizing
  const traderProfile = determineTraderProfile(betAmount, walletBalance);
  
  // Determine game duration based on tier and other factors
  let gameDuration = 0;
  const multiplierRange = getMultiplierRange(rewardTier);
  
  // More exciting tiers last longer to build suspense
  switch (rewardTier) {
    case RewardTier.COMMON:
      gameDuration = getRandomInt(5, 30);
      break;
    case RewardTier.UNCOMMON:
      gameDuration = getRandomInt(15, 60);
      break;
    case RewardTier.RARE:
      gameDuration = getRandomInt(30, 90);
      break;
    case RewardTier.EPIC:
      gameDuration = getRandomInt(40, 120);
      break;
    case RewardTier.LEGENDARY:
      gameDuration = getRandomInt(60, 180);
      break;
  }
  
  // Check for rugpull
  const rugPullChance = calculateRugPullProbability(
    betAmount, 
    walletBalance, 
    rewardTier, 
    traderProfile
  );
  
  const willRugPull = Math.random() < rugPullChance;
  
  // If YOLO or TILT with legendary win, higher chance of rugpull
  const rugPullPending = willRugPull || 
    ((traderProfile === TraderProfile.YOLO || traderProfile === TraderProfile.TILT) && 
     rewardTier === RewardTier.LEGENDARY && 
     Math.random() < 0.7);
  
  return {
    currentPattern: MarketPattern.NORMAL,
    patternDuration: 0,
    maxPatternDuration: getRandomInt(5, 15),
    momentum: 0,
    volatility: 0.3,
    currentMultiplier: 1.0,
    rugPullPending,
    rugPullThreshold: getRandomInt(3, 10),
    playerBetsSum: betAmount,
    betsSinceLastRug: 0,
    prevCandleClose: 1.0,
    highWatermark: 1.0,
    supportsLevels: [1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 15.0, 20.0],
    lastCandleCount: 0,
    gameDuration,
    currentCandle: 0,
    forceRug: false,
    rewardTier,
    houseEdgeApplied: false,
    traderProfile,
    consecutiveLosses: 0
  };
};

// Add a player bet to the system
export const addPlayerBet = (state: TradingState, betAmount: number, walletBalance: number): TradingState => {
  const newState = { ...state };
  newState.playerBetsSum += betAmount;
  newState.betsSinceLastRug += 1;
  
  // Update trader profile based on new bet
  newState.traderProfile = determineTraderProfile(
    betAmount, 
    walletBalance, 
    newState.consecutiveLosses
  );
  
  // Increase rug pull chance based on total bet amount, bet frequency, and trader profile
  const rugPullModifier = newState.traderProfile === TraderProfile.YOLO ? 1.5 : 
                          newState.traderProfile === TraderProfile.TILT ? 2.0 : 1.0;
                          
  if (
    newState.playerBetsSum > newState.rugPullThreshold * rugPullModifier || 
    newState.betsSinceLastRug > 10
  ) {
    // Schedule rug pull if significant player bets are in the system
    newState.rugPullPending = Math.random() < (
      (newState.playerBetsSum / (newState.rugPullThreshold * 2)) * rugPullModifier + 
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
  
  // Check if near the target multiplier for this tier
  const tierMultiplierRange = getMultiplierRange(newState.rewardTier);
  const targetMultiplier = (tierMultiplierRange.min + tierMultiplierRange.max) / 2;
  const nearTarget = newState.currentMultiplier > targetMultiplier * 0.7;
  
  // Check if we need to force a rug pull based on game duration
  if (
    (newState.currentCandle >= newState.gameDuration * 0.85) || 
    (nearTarget && newState.rugPullPending && Math.random() < 0.3)
  ) {
    // Time to force a rug pull - game has reached its predetermined length
    newState.forceRug = true;
    newState.currentPattern = MarketPattern.RUG_PULL;
    newState.patternDuration = 0;
    
    // Return early as we're forcing a rug pull
    return newState;
  }
  
  // Increment pattern duration
  newState.patternDuration += 1;
  
  // Pattern change logic based on reward tier and progression
  if (newState.patternDuration >= newState.maxPatternDuration) {
    // Get progression percentage (how far we are through the game)
    const progressionPct = newState.currentCandle / newState.gameDuration;
    
    // Early game (building phase)
    if (progressionPct < 0.3) {
      if (newState.rewardTier === RewardTier.COMMON || newState.rewardTier === RewardTier.UNCOMMON) {
        // Lower tiers stay more stable
        newState.currentPattern = [
          MarketPattern.NORMAL, 
          MarketPattern.ACCUMULATION, 
          MarketPattern.DISTRIBUTION
        ][Math.floor(Math.random() * 3)];
      } else {
        // Higher tiers show more early volatility to build excitement
        newState.currentPattern = [
          MarketPattern.NORMAL,
          MarketPattern.BULL_RUN,
          MarketPattern.FAKEOUT
        ][Math.floor(Math.random() * 3)];
      }
    }
    // Mid game (opportunity phase)
    else if (progressionPct < 0.7) {
      // Head toward the target multiplier 
      if (newState.currentMultiplier < tierMultiplierRange.min * 0.8) {
        // Need to go up to reach minimum tier value
        newState.currentPattern = MarketPattern.BULL_RUN;
      } 
      else if (newState.currentMultiplier > tierMultiplierRange.max * 1.1) {
        // Above max tier value, pull back
        newState.currentPattern = Math.random() < 0.7 ? 
          MarketPattern.DISTRIBUTION : MarketPattern.FAKEOUT;
      }
      else {
        // Within target range, mix it up based on tier
        if (newState.rewardTier === RewardTier.LEGENDARY && Math.random() < 0.2) {
          newState.currentPattern = MarketPattern.SUPER_SPIKE;
        } 
        else if (newState.rewardTier === RewardTier.EPIC && Math.random() < 0.3) {
          newState.currentPattern = Math.random() < 0.7 ? 
            MarketPattern.BULL_RUN : MarketPattern.SUPER_SPIKE;
        }
        else {
          // Random selection for other tiers
          const patterns = Object.values(MarketPattern);
          // Remove RUG_PULL from the options if not scheduled
          const availablePatterns = newState.rugPullPending ? 
            patterns : patterns.filter(p => p !== MarketPattern.RUG_PULL);
            
          newState.currentPattern = availablePatterns[
            Math.floor(Math.random() * availablePatterns.length)
          ];
        }
      }
    }
    // Late game (decision phase)
    else {
      // Higher chance of decisive movement
      if (newState.rugPullPending && Math.random() < 0.5) {
        // Execute the rug pull if pending
        newState.currentPattern = MarketPattern.RUG_PULL;
        newState.rugPullPending = false;
      } 
      else if (newState.currentMultiplier < tierMultiplierRange.min) {
        // Final push to get into tier range
        newState.currentPattern = MarketPattern.BULL_RUN;
      }
      else {
        // Random selection with higher chance of dramatic pattern
        const lateGamePatterns = [
          MarketPattern.BULL_RUN, 
          MarketPattern.BULL_RUN,
          MarketPattern.FAKEOUT,
          MarketPattern.SUPER_SPIKE
        ];
        
        newState.currentPattern = lateGamePatterns[
          Math.floor(Math.random() * lateGamePatterns.length)
        ];
      }
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
  
  // Update momentum and volatility based on pattern and reward tier
  switch (newState.currentPattern) {
    case MarketPattern.NORMAL:
      // Mean-reverting momentum with slight upward bias
      newState.momentum = newState.momentum * 0.8 + (Math.random() - 0.45) * 0.3;
      newState.volatility = 0.3;
      break;
      
    case MarketPattern.BULL_RUN:
      // Strong positive momentum, strength varies by tier
      const tierBoost = 
        newState.rewardTier === RewardTier.LEGENDARY ? 0.5 :
        newState.rewardTier === RewardTier.EPIC ? 0.4 :
        newState.rewardTier === RewardTier.RARE ? 0.3 :
        newState.rewardTier === RewardTier.UNCOMMON ? 0.25 : 0.2;
        
      newState.momentum = newState.momentum * 0.7 + (Math.random() * 0.4 + tierBoost);
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
      // Extreme positive momentum - stronger for higher tiers
      const spikeMultiplier = 
        newState.rewardTier === RewardTier.LEGENDARY ? 1.5 :
        newState.rewardTier === RewardTier.EPIC ? 1.3 :
        newState.rewardTier === RewardTier.RARE ? 1.1 : 1.0;
        
      newState.momentum = newState.momentum * 0.6 + (Math.random() * 0.7 + 0.4) * spikeMultiplier;
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

// Calculate next multiplier value based on current state
export const calculateNextMultiplier = (state: TradingState): number => {
  // If we're in a forced rug pull, create a dramatic crash
  if (state.forceRug && state.currentPattern === MarketPattern.RUG_PULL) {
    // Dramatic crash with a long red candle - make more drastic
    return Math.max(0.1, state.currentMultiplier * (0.05 + Math.random() * 0.25));
  }
  
  // Target multiplier range for current reward tier
  const { min: targetMin, max: targetMax } = getMultiplierRange(state.rewardTier);
  const tierRange = targetMax - targetMin;
  
  // Game progression percentage
  const progressPct = state.currentCandle / state.gameDuration;
  
  // Base percentage change with logarithmic scaling
  // Higher multipliers = smaller percentage changes on average
  const logScale = Math.log10(Math.max(1.1, state.currentMultiplier));
  let basePercentChange = (state.volatility * 0.05) / logScale; 
  
  // Add occasional "jumps" for unpredictability - rare sudden movements
  // More frequent for higher tiers
  const jumpChance = 
    state.rewardTier === RewardTier.LEGENDARY ? 0.15 :
    state.rewardTier === RewardTier.EPIC ? 0.1 :
    state.rewardTier === RewardTier.RARE ? 0.08 :
    state.rewardTier === RewardTier.UNCOMMON ? 0.05 : 0.03;
    
  const jumpFactor = Math.random() < jumpChance ? 
    (Math.random() * 0.2) * (Math.random() > 0.5 ? 1 : -1) : 0;
  
  // Momentum impact (directional bias) with logarithmic dampening
  const momentumImpact = (state.momentum * state.volatility * 0.1) / Math.sqrt(logScale);
  
  // Target gravity - pull toward target range more strongly as game progresses
  let targetGravity = 0;
  
  // After 30% of the game, start applying target gravity
  if (progressPct > 0.3) {
    const gravityStrength = Math.min(0.05, (progressPct - 0.3) * 0.1); // Increases with game progress
    
    if (state.currentMultiplier < targetMin) {
      // Below target, pull up
      targetGravity = gravityStrength;
    } else if (state.currentMultiplier > targetMax && !state.rugPullPending) {
      // Above target and not planning a rug pull, pull down gently
      targetGravity = -gravityStrength * 0.5;
    }
  }
  
  // Pattern-specific multipliers with more extreme values
  let patternMultiplier = 1.0;
  switch (state.currentPattern) {
    case MarketPattern.RUG_PULL:
      // More dramatic crash for rug pull
      patternMultiplier = -6.0 * (1 + Math.random() * 0.5);
      break;
      
    case MarketPattern.SUPER_SPIKE:
      // More dramatic rise for super spike - additional boost for higher tiers
      const spikeBoost = 
        state.rewardTier === RewardTier.LEGENDARY ? 1.5 :
        state.rewardTier === RewardTier.EPIC ? 1.3 : 1.0;
      patternMultiplier = 4.0 * (1 + Math.random() * 0.5) * spikeBoost;
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
  const totalPercentChange = (basePercentChange + momentumImpact + noise + jumpFactor + targetGravity) * patternMultiplier;
  
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
  
  // Apply house edge if this is the final value
  if (state.currentCandle >= state.gameDuration - 1 && !state.houseEdgeApplied) {
    nextMultiplier = applyHouseEdge(nextMultiplier, state.rewardTier);
    state.houseEdgeApplied = true;
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

// Get final game outcome
export const getFinalGameOutcome = (state: TradingState, betAmount: number): GameOutcome => {
  // Calculate house edge
  const houseEdgePercent = state.rewardTier === RewardTier.LEGENDARY ? 15 :
                         state.rewardTier === RewardTier.EPIC ? 10 :
                         state.rewardTier === RewardTier.RARE ? 8 :
                         state.rewardTier === RewardTier.UNCOMMON ? 5 : 2;
                         
  // Apply house edge to final payout
  const finalMultiplier = applyHouseEdge(state.currentMultiplier, state.rewardTier);
  
  // Calculate final payout
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

// Reset game state for a new round
export const resetGameState = (betAmount = 0, walletBalance = 1, consecutiveLosses = 0): TradingState => {
  const state = createInitialTradingState(betAmount, walletBalance);
  state.consecutiveLosses = consecutiveLosses;
  return state;
};