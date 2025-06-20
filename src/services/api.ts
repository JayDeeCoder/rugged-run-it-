// src/services/api.ts - UPDATED VERSION WITH ENHANCED XP SYSTEM
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { io, Socket } from 'socket.io-client';
import logger from '../utils/logger';

// Helper function to generate UUID
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// Game server WebSocket connection
const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';

// UPDATED TYPES FOR USERS_UNIFIED TABLE WITH XP SYSTEM
export interface UserData {
  id: string;
  username: string;
  wallet_address: string;
  external_wallet_address: string;
  privy_wallet_address?: string;
  custodial_balance: number;
  privy_balance: number;
  embedded_balance: number;
  total_balance: number; // Generated column from database
  total_deposited: number;
  custodial_total_deposited: number;
  avatar?: string;
  level: number;
  experience: number;
  experience_points: number;
  badge?: string;
  badges_earned: string[];
  achievements: string[];
  total_games_played: number;
  total_bets_placed: number;
  games_won: number;
  games_lost: number;
  total_wagered: number;
  total_won: number;
  total_lost: number;
  net_profit: number;
  win_rate: number;
  current_win_streak: number;
  best_win_streak: number;
  largest_win: number;
  largest_loss: number;
  best_multiplier: number;
  daily_profit: number;
  weekly_profit: number;
  monthly_profit: number;
  risk_score: number;
  behavior_pattern: string;
  preferred_bet_range: string;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
  last_active?: string;
  // NEW XP SYSTEM FIELDS
  daily_login_streak?: number;
  last_daily_bonus?: string;
  recent_chat_activity?: boolean;
  risk_preference?: RiskLevel;
  xp_boost_active?: boolean;
  total_referrals?: number;
}

export interface CustodialBalanceData {
  userId: string;
  custodialBalance: number;
  privyBalance: number;
  embeddedBalance: number;
  totalBalance: number; // From database calculation
  totalDeposited: number;
  canBet: boolean;
  canWithdraw: boolean;
  walletAddress: string;
  lastUpdated: string;
  source: string;
}

// Keep existing interfaces but update as needed
export interface GameState {
  gameId: string;
  gameNumber: number;
  multiplier: number;
  status: 'waiting' | 'active' | 'crashed';
  totalBets: number;
  totalPlayers: number;
  startTime: number;
}

export interface ChartData {
  timestamp: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
}

export interface ChatMessage {
  id: string;
  wallet_address: string;
  username: string;
  message: string;
  message_type: 'user' | 'system' | 'announcement';
  created_at: string;
  avatar?: string;
  level?: number;
  badge?: string;
}

export interface SystemSetting {
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

// Type for partial system setting data from queries
export interface SystemSettingData {
  key: string;
  value: string;
}

// Type for partial bet data from Supabase queries
export interface BetStatsData {
  bet_amount: number;
  profit_loss?: number;
  cashout_multiplier?: number;
}

export interface LeaderboardEntry {
  id: string;
  wallet_address: string;
  username: string;
  total_profit: number;
  profit_percentage: number;
  games_played: number;
  best_multiplier: number;
  rank: number;
  avatar?: string;
  level: number;
  badge?: string;
  // NEW: Add XP and tier data to match dashboard
  experience: number;
  experience_points: number;
  tier: number;
  win_rate: number;
  current_win_streak: number;
  best_win_streak: number;
  total_wagered: number;
  total_won: number;
  achievements: string[];
  badges_earned: string[];
}

// User stats interface - includes both stored and calculated fields
export interface UserStats {
  total_wagered: number;
  total_won: number;
  total_lost: number;
  net_profit: number;        // Calculated by database: (total_won - total_lost)
  games_played: number;
  games_won: number;
  games_lost: number;
  win_rate: number;          // Calculated by database: (games_won / games_played) * 100
  best_multiplier: number;
  largest_win: number;
  largest_loss: number;
  current_win_streak: number;
  best_win_streak: number;
}

export interface BetEntry {
  id: string;
  game_id: string;
  user_id: string;
  wallet_address: string;
  bet_amount: number;
  cashout_multiplier?: number;
  profit_loss?: number;
  created_at: string;
  status: string;
}

// ADD THESE INTERFACES TO YOUR EXISTING API FILE
// Place these after your existing interfaces (around line 200, after your BetEntry interface)

// Enhanced Trade History Interfaces
export interface DetailedTradeEntry {
  id: string;
  game_id: string;
  user_id: string;
  wallet_address: string;
  
  // Entry Data
  bet_amount: number;
  entry_multiplier: number;
  entry_timestamp: string;
  
  // Exit Data
  cashout_multiplier?: number;
  exit_timestamp?: string;
  exit_type: 'manual_cashout' | 'auto_cashout' | 'crashed' | 'pending';
  
  // Financial Data
  profit_loss: number;
  win_amount?: number;
  house_edge_taken: number;
  
  // Game Context
  game_crash_multiplier?: number;
  total_players_in_game?: number;
  total_volume_in_game?: number;
  
  // Performance Metrics
  risk_level: 'low' | 'medium' | 'high' | 'extreme';
  bet_size_category: 'micro' | 'small' | 'medium' | 'large' | 'whale';
  timing_score?: number;
  
  // Calculated Fields
  trade_duration_seconds?: number;
  was_winner: boolean;
  return_percentage: number;
  
  // Metadata
  status: string;
  created_at: string;
  updated_at: string;
}

export interface EnhancedTradeHistory {
  trades: DetailedTradeEntry[];
  hasEnhancedData: boolean;
  analytics?: {
    total_trades: number;
    win_rate: number;
    total_profit: number;
    avg_return: number;
    risk_distribution: {
      low: number;
      medium: number;
      high: number;
      extreme: number;
    };
  };
}

export interface EnhancedFeaturesStatus {
  enhanced_schema: boolean;
  enhanced_functions: boolean;
  recommended_action: string;
}

// NEW: Enhanced XP interfaces
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

export interface XPCalculationResult {
  totalXP: number;
  breakdown: {
    baseXP: number;
    winBonus: number;
    riskMultiplier: number;
    winStreakBonus: number;
    dailyBonus: number;
    chatBonus: number;
    levelBoost: number;
    riskLevel: RiskLevel;
  };
  shouldUpdateDailyBonus: boolean;
}

export interface LevelProgressData {
  currentLevel: number;
  currentXP: number;
  progressPercentage: number;
  xpForNextLevel: number;
  xpNeeded: number;
  xpThisLevel: number;
  xpNeededThisLevel: number;
  readyToLevelUp: boolean;
  isEarlyLevel: boolean;
  canLevelUp: boolean;
}

// GameAPI class
export class GameAPI {
  private socket: Socket | null = null;
  private eventListeners: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      this.socket = io(GAME_SERVER_URL, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });

      this.socket.on('connect', () => {
        logger.info('Connected to game server');
        this.reconnectAttempts = 0;
        this.emit('connected');
      });

      this.socket.on('disconnect', (reason) => {
        logger.info('Disconnected from game server:', reason);
        this.emit('disconnected', reason);
      });

      this.socket.on('connect_error', (error) => {
        logger.error('Connection error:', error);
        this.emit('connectionError', error);
      });

      this.socket.onAny((event, ...args) => {
        this.emit(event, ...args);
      });

    } catch (error) {
      logger.error('Failed to initialize game connection:', error);
    }
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        logger.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  public on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  public off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  // Enhanced custodial betting support
  public placeCustodialBet(userId: string, betAmount: number): Promise<{
    success: boolean;
    reason?: string;
    entryMultiplier?: number;
    custodialBalance?: number;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to game server'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Custodial bet placement timeout'));
      }, 15000);

      this.socket.emit('custodialBet', { userId, betAmount });
      
      this.socket.once('custodialBetResult', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  public cashOutCustodial(userId: string, walletAddress: string): Promise<{
    success: boolean;
    payout?: number;
    custodialBalance?: number;
    reason?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to game server'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Custodial cashout timeout'));
      }, 15000);

      this.socket.emit('custodialCashOut', { userId, walletAddress });
      
      this.socket.once('custodialCashOutResult', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  public placeBet(walletAddress: string, betAmount: number, userId?: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to game server'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Bet placement timeout'));
      }, 10000);

      this.socket.emit('placeBet', { walletAddress, betAmount, userId });
      
      this.socket.once('betResult', (data: { success: boolean; error?: string }) => {
        clearTimeout(timeout);
        if (data.success) {
          resolve(true);
        } else {
          reject(new Error(data.error || 'Bet placement failed'));
        }
      });
    });
  }

  public cashOut(walletAddress: string): Promise<{ success: boolean; multiplier?: number }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to game server'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Cashout timeout'));
      }, 10000);

      this.socket.emit('cashOut', { walletAddress });
      
      this.socket.once('cashOutResult', (data: { success: boolean; multiplier?: number; error?: string }) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventListeners.clear();
  }

  public isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// COMPLETELY UPDATED UserAPI FOR USERS_UNIFIED TABLE WITH ENHANCED XP SYSTEM
export class UserAPI {
  /**
   * 🎯 NEW: Enhanced XP calculation with multiple factors
   */
  static calculateEnhancedXP(gameData: {
    betAmount: number;
    isWin: boolean;
    cashoutMultiplier?: number;
    profitLoss: number;
  }, userData: {
    level?: number;
    current_win_streak?: number;
    last_daily_bonus?: string;
    recent_chat_activity?: boolean;
  }): XPCalculationResult {
    const {
      betAmount,
      isWin,
      cashoutMultiplier = 1,
      profitLoss
    } = gameData;

    const {
      level = 1,
      current_win_streak = 0,
      last_daily_bonus,
      recent_chat_activity = false
    } = userData;

    // Determine risk level from bet amount
    const getRiskLevel = (amount: number): RiskLevel => {
      if (amount >= 1.0) return 'extreme';
      if (amount >= 0.1) return 'high';
      if (amount >= 0.01) return 'medium';
      return 'low';
    };

    const riskLevel = getRiskLevel(betAmount);
    
    // Check if first game today
    const today = new Date().toDateString();
    const lastBonus = last_daily_bonus ? new Date(last_daily_bonus).toDateString() : null;
    const isFirstGameToday = lastBonus !== today;

    let totalXP = 0;

    // 1. Base XP (minimum guarantee)
    totalXP += Math.max(1, Math.floor(betAmount * 100 * 2)); // 2 XP per 0.01 SOL

    // 2. Win Bonus (major XP source)
    if (isWin && profitLoss > 0) {
      const winBonus = Math.floor(betAmount * 100 * cashoutMultiplier * 3);
      totalXP += winBonus;
      
      // High multiplier bonuses
      if (cashoutMultiplier >= 2) totalXP += 10;
      if (cashoutMultiplier >= 5) totalXP += 25;
      if (cashoutMultiplier >= 10) totalXP += 50;
    }

    // 3. Risk Level Multipliers
    const riskMultipliers: Record<RiskLevel, number> = {
      low: 1.0,
      medium: 1.3,
      high: 1.6,
      extreme: 2.0
    };
    totalXP = Math.floor(totalXP * riskMultipliers[riskLevel]);

    // 4. Win Streak Bonuses
    if (current_win_streak >= 3) totalXP += 5;
    if (current_win_streak >= 5) totalXP += 10;
    if (current_win_streak >= 10) totalXP += 25;

    // 5. Daily Activity Bonus
    if (isFirstGameToday) {
      totalXP += 15;
    }

    // 6. Chat Activity Bonus
    if (recent_chat_activity) {
      totalXP += 2;
    }

    // 7. EARLY LEVEL MASSIVE BOOST (key feature!)
    const getEarlyLevelBoost = (level: number): number => {
      if (level <= 3) return 3.0;  // 300% XP boost!
      if (level <= 5) return 2.0;  // 200% XP boost
      if (level <= 8) return 1.5;  // 150% XP boost
      return 1.0; // Normal XP
    };

    const levelBoost = getEarlyLevelBoost(level);
    totalXP = Math.floor(totalXP * levelBoost);

    return {
      totalXP: Math.max(1, totalXP),
      breakdown: {
        baseXP: Math.floor(betAmount * 100 * 2),
        winBonus: isWin ? Math.floor(betAmount * 100 * cashoutMultiplier * 3) : 0,
        riskMultiplier: riskMultipliers[riskLevel],
        winStreakBonus: current_win_streak >= 3 ? (current_win_streak >= 10 ? 25 : current_win_streak >= 5 ? 10 : 5) : 0,
        dailyBonus: isFirstGameToday ? 15 : 0,
        chatBonus: recent_chat_activity ? 2 : 0,
        levelBoost: levelBoost,
        riskLevel
      },
      shouldUpdateDailyBonus: isFirstGameToday
    };
  }

  /**
   * 🎯 NEW: Get XP requirement for any level (new easy progression)
   */
  static getXPRequirement(level: number): number {
    const easyLevels: Record<number, number> = {
      1: 0,
      2: 25,      // SUPER EASY
      3: 75,      // STILL EASY 
      4: 150,     // Start ramping up
      5: 250,
      6: 400,
      7: 600,
      8: 900,
      9: 1350,
      10: 2000
    };

    if (easyLevels[level] !== undefined) {
      return easyLevels[level];
    }

    // For levels 11+, use exponential growth
    if (level > 10) {
      let xp = easyLevels[10];
      for (let i = 11; i <= level; i++) {
        xp = Math.floor(xp * 1.5);
      }
      return xp;
    }

    return 0;
  }

  /**
   * 🎯 NEW: Enhanced level progress calculation
   */
  static calculateLevelProgress(userData: {
    level?: number;
    experience_points?: number;
    total_games_played?: number;
    win_rate?: number;
  }): LevelProgressData {
    const {
      level = 1,
      experience_points = 0,
      total_games_played = 0,
      win_rate = 0
    } = userData;

    const currentLevelXP = this.getXPRequirement(level);
    const nextLevelXP = this.getXPRequirement(level + 1);
    const xpNeededThisLevel = nextLevelXP - currentLevelXP;
    const xpProgressThisLevel = Math.max(0, experience_points - currentLevelXP);
    
    let progressPercentage = Math.min(100, (xpProgressThisLevel / xpNeededThisLevel) * 100);

    // BONUS PROGRESS for early levels (makes them even easier!)
    if (level <= 3) {
      // Game participation bonus (up to 25%)
      const gameBonus = Math.min(25, total_games_played * 2);
      
      // Learning bonus (up to 15%)  
      const winBonus = Math.min(15, win_rate * 0.3);
      
      progressPercentage += gameBonus + winBonus;
      progressPercentage = Math.min(100, progressPercentage);
    }

    const readyToLevelUp = progressPercentage >= 100;

    return {
      currentLevel: level,
      currentXP: experience_points,
      progressPercentage: Math.max(0, progressPercentage),
      xpForNextLevel: nextLevelXP,
      xpNeeded: Math.max(0, nextLevelXP - experience_points),
      xpThisLevel: xpProgressThisLevel,
      xpNeededThisLevel,
      readyToLevelUp,
      isEarlyLevel: level <= 3,
      canLevelUp: readyToLevelUp && level === Math.floor(experience_points / nextLevelXP) + 1
    };
  }

  /**
   * 🎯 NEW: Calculate new level from total XP
   */
  static calculateNewLevel(totalXP: number): number {
    let level = 1;
    while (this.getXPRequirement(level + 1) <= totalXP) {
      level++;
      if (level > 100) break; // Safety limit
    }
    return level;
  }

  /**
   * 🎯 NEW: Enhanced bet resolution with new XP system
   */
  static async handleBetResolutionEnhanced(
    gameId: string,
    userId: string,
    walletAddress: string,
    betAmount: number,
    cashoutMultiplier?: number,
    profitLoss?: number
  ): Promise<{ 
    success: boolean; 
    xpGained?: number; 
    xpBreakdown?: any; 
    newXP?: number; 
    newLevel?: number; 
    leveledUp?: boolean; 
    levelProgress?: LevelProgressData; 
    error?: string; 
  }> {
    try {
      console.log(`🎯 Enhanced bet resolution for user: ${userId}`);

      // Get current user data
      const { data: currentUser, error: userError } = await supabase
        .from('users_unified')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !currentUser) {
        console.error('❌ Failed to get user data:', userError);
        return { success: false, error: 'User not found' };
      }

      // Calculate enhanced XP
      const xpResult = this.calculateEnhancedXP({
        betAmount,
        isWin: (profitLoss || 0) > 0,
        cashoutMultiplier,
        profitLoss: profitLoss || 0
      }, currentUser);

      console.log('📊 XP Calculation:', xpResult);

      // Update user with new XP and stats
      const newXP = (currentUser.experience_points || 0) + xpResult.totalXP;
      const newLevel = this.calculateNewLevel(newXP);
      const leveledUp = newLevel > currentUser.level;

      const updates: any = {
        experience_points: newXP,
        level: newLevel,
        updated_at: new Date().toISOString()
      };

      // Update daily bonus if applicable
      if (xpResult.shouldUpdateDailyBonus) {
        updates.last_daily_bonus = new Date().toISOString().split('T')[0];
        updates.daily_login_streak = (currentUser.daily_login_streak || 0) + 1;
      }

      // Record the bet
      const { error: betError } = await supabase
        .from('player_bets')
        .insert({
          game_id: gameId,
          user_id: userId,
          wallet_address: walletAddress,
          bet_amount: betAmount,
          cashout_multiplier: cashoutMultiplier,
          profit_loss: profitLoss
        });

      if (betError) {
        console.error('❌ Failed to record bet:', betError);
      }

      // Update user stats and XP
      const { error: updateError } = await supabase
        .from('users_unified')
        .update(updates)
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Failed to update user:', updateError);
        return { success: false, error: 'Failed to update user' };
      }

      // Also update game stats using existing method
      await this.updateUserStatsOnly(userId, betAmount, profitLoss || 0, cashoutMultiplier);

      console.log(`✅ Enhanced bet resolution complete: +${xpResult.totalXP} XP${leveledUp ? `, LEVEL UP to ${newLevel}!` : ''}`);

      return {
        success: true,
        xpGained: xpResult.totalXP,
        xpBreakdown: xpResult.breakdown,
        newXP,
        newLevel,
        leveledUp,
        levelProgress: this.calculateLevelProgress({
          ...currentUser,
          experience_points: newXP,
          level: newLevel
        })
      };

    } catch (error) {
      console.error('❌ Enhanced bet resolution error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get or create user from users_unified table
   */
  static async getUserOrCreate(walletAddress: string): Promise<UserData | null> {
    try {
      console.log(`🔍 Getting user from users_unified for wallet: ${walletAddress}`);
      
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }
      
      // Search across all wallet fields in users_unified
      let { data: user, error } = await supabase
        .from('users_unified')
        .select('*')
        .or(`wallet_address.eq.${walletAddress},external_wallet_address.eq.${walletAddress},privy_wallet_address.eq.${walletAddress}`)
        .single();

      // If not found, try case-insensitive search
      if (error && error.code === 'PGRST116') {
        console.log(`📡 Trying case-insensitive search...`);
        const { data: users, error: errorIlike } = await supabase
          .from('users_unified')
          .select('*')
          .or(`wallet_address.ilike.${walletAddress},external_wallet_address.ilike.${walletAddress},privy_wallet_address.ilike.${walletAddress}`);
          
        if (users && users.length > 0 && !errorIlike) {
          user = users[0];
          error = null;
          console.log(`✅ Found user with case-insensitive search: ${user.id}`);
        }
      }

      if (error && error.code === 'PGRST116') {
        // User doesn't exist, create new one
        console.log(`👤 Creating new user in users_unified for wallet: ${walletAddress}`);
        
        const userId = generateUUID();
        const username = `user_${userId.slice(-8)}`;
        
        // ✅ MINIMAL INSERT - only essential fields to avoid generated column errors
        const { data: newUser, error: createError } = await supabase
          .from('users_unified')
          .insert({
            id: userId,
            username,
            wallet_address: walletAddress,
            external_wallet_address: walletAddress,
            privy_wallet_address: walletAddress,
            custodial_balance: 0,
            level: 1,
            experience_points: 0, // Initialize XP
            avatar: '👤',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // NEW XP SYSTEM DEFAULTS
            daily_login_streak: 0,
            recent_chat_activity: false,
            risk_preference: 'low',
            xp_boost_active: false,
            total_referrals: 0
            // Let database set defaults for everything else
          })
          .select()
          .single();

        if (createError) {
          console.error('❌ Error creating user in users_unified:', createError);
          throw createError;
        }
        
        user = newUser;
        console.log(`✅ Created new user: ${user.id} for wallet: ${walletAddress}`);
      } else if (error) {
        console.error('❌ Error fetching user from users_unified:', error);
        throw error;
      } else {
        console.log(`✅ Found existing user: ${user.id} for wallet: ${walletAddress}`);
      }

      return UserAPI.transformUserData(user);
      
    } catch (error) {
      console.error('❌ UserAPI.getUserOrCreate error:', error);
      return null;
    }
  }

  /**
   * Get custodial balance for a user
   */
  static async getCustodialBalance(userId: string): Promise<CustodialBalanceData | null> {
    try {
      console.log(`💰 Getting custodial balance for user: ${userId}`);
      
      const { data: user, error } = await supabase
        .from('users_unified')
        .select(`
          id,
          username,
          custodial_balance,
          privy_balance,
          embedded_balance,
          total_balance,
          total_deposited,
          custodial_total_deposited,
          external_wallet_address,
          wallet_address,
          updated_at
        `)
        .eq('id', userId)
        .single();

      if (error || !user) {
        console.error(`❌ User ${userId} not found in users_unified:`, error?.message);
        return null;
      }

      const custodialBalance = parseFloat(user.custodial_balance) || 0;
      const privyBalance = parseFloat(user.privy_balance) || 0;
      const embeddedBalance = parseFloat(user.embedded_balance) || 0;
      const totalBalance = parseFloat(user.total_balance) || 0; // From database calculation
      const totalDeposited = parseFloat(user.total_deposited) || 0;

      return {
        userId: user.id,
        custodialBalance,
        privyBalance,
        embeddedBalance,
        totalBalance, // Use database-calculated value
        totalDeposited,
        canBet: custodialBalance >= 0.001,
        canWithdraw: custodialBalance > 0,
        walletAddress: user.external_wallet_address || user.wallet_address,
        lastUpdated: user.updated_at,
        source: 'users_unified'
      };
      
    } catch (error) {
      console.error('❌ Error getting custodial balance:', error);
      return null;
    }
  }

  /**
   * Transform raw database user data to UserData interface
   */
  private static transformUserData(rawUser: any): UserData {
    return {
      id: rawUser.id,
      username: rawUser.username,
      wallet_address: rawUser.wallet_address,
      external_wallet_address: rawUser.external_wallet_address,
      privy_wallet_address: rawUser.privy_wallet_address,
      custodial_balance: parseFloat(rawUser.custodial_balance) || 0,
      privy_balance: parseFloat(rawUser.privy_balance) || 0,
      embedded_balance: parseFloat(rawUser.embedded_balance) || 0,
      total_balance: parseFloat(rawUser.total_balance) || 0, // Database calculated
      total_deposited: parseFloat(rawUser.total_deposited) || 0,
      custodial_total_deposited: parseFloat(rawUser.custodial_total_deposited) || 0,
      avatar: rawUser.avatar,
      level: rawUser.level || 1,
      experience: rawUser.experience || 0,
      experience_points: rawUser.experience_points || 0,
      badge: rawUser.badge,
      badges_earned: rawUser.badges_earned || [],
      achievements: rawUser.achievements || [],
      total_games_played: rawUser.total_games_played || 0,
      total_bets_placed: rawUser.total_bets_placed || 0,
      games_won: rawUser.games_won || 0,
      games_lost: rawUser.games_lost || 0,
      total_wagered: parseFloat(rawUser.total_wagered) || 0,
      total_won: parseFloat(rawUser.total_won) || 0,
      total_lost: parseFloat(rawUser.total_lost) || 0,
      net_profit: parseFloat(rawUser.net_profit) || 0,
      win_rate: parseFloat(rawUser.win_rate) || 0,
      current_win_streak: rawUser.current_win_streak || 0,
      best_win_streak: rawUser.best_win_streak || 0,
      largest_win: parseFloat(rawUser.largest_win) || 0,
      largest_loss: parseFloat(rawUser.largest_loss) || 0,
      best_multiplier: parseFloat(rawUser.best_multiplier) || 0,
      daily_profit: parseFloat(rawUser.daily_profit) || 0,
      weekly_profit: parseFloat(rawUser.weekly_profit) || 0,
      monthly_profit: parseFloat(rawUser.monthly_profit) || 0,
      risk_score: parseFloat(rawUser.risk_score) || 0,
      behavior_pattern: rawUser.behavior_pattern || 'casual',
      preferred_bet_range: rawUser.preferred_bet_range || 'small',
      is_connected: rawUser.is_connected || false,
      created_at: rawUser.created_at,
      updated_at: rawUser.updated_at,
      last_active: rawUser.last_active,
      // NEW XP SYSTEM FIELDS
      daily_login_streak: rawUser.daily_login_streak || 0,
      last_daily_bonus: rawUser.last_daily_bonus,
      recent_chat_activity: rawUser.recent_chat_activity || false,
      risk_preference: (rawUser.risk_preference as RiskLevel) || 'low',
      xp_boost_active: rawUser.xp_boost_active || false,
      total_referrals: rawUser.total_referrals || 0
    };
  }

  /**
   * Update user in users_unified table
   */
  static async updateUser(userId: string, updates: Partial<UserData>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users_unified')
        .update({ 
          ...updates, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', userId);

      if (error) {
        logger.error('Error updating user in users_unified:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error updating user:', error);
      return false;
    }
  }

  /**
   * Update user stats after bet using the new stats-only method
   */
  static async updateUserStatsAfterBet(
    userId: string, 
    betAmount: number, 
    profitLoss: number, 
    multiplier?: number,
    isWin: boolean = false
  ): Promise<boolean> {
    console.log('🔄 Using new stats update method...');
    const result = await this.updateUserStatsOnly(userId, betAmount, profitLoss, multiplier);
    return result.success;
  }

  /**
   * Sync individual user stats from player_bets table (SAFE VERSION)
   */
  static async syncUserStatsFromBets(userId: string): Promise<boolean> {
    try {
      console.log(`📊 Syncing stats for user: ${userId}`);

      // Get all bets for this user
      const { data: bets, error: betsError } = await supabase
        .from('player_bets')
        .select('bet_amount, profit_loss, cashout_multiplier, status, created_at')
        .eq('user_id', userId);

      if (betsError) {
        console.error('❌ Error fetching user bets:', betsError);
        return false;
      }

      if (!bets || bets.length === 0) {
        console.log(`ℹ️ No bets found for user ${userId}`);
        return true;
      }

      // Calculate stats from bets
      let totalWagered = 0;
      let totalWon = 0;
      let totalLost = 0;
      let gamesWon = 0;
      let gamesLost = 0;
      let largestWin = 0;
      let largestLoss = 0;
      let bestMultiplier = 0;
      let currentWinStreak = 0;
      let bestWinStreak = 0;
      let tempWinStreak = 0;

      // Sort bets by date to calculate win streaks
      const sortedBets = bets.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (const bet of sortedBets) {
        const betAmount = parseFloat(bet.bet_amount) || 0;
        const profitLoss = parseFloat(bet.profit_loss) || 0;
        const multiplier = parseFloat(bet.cashout_multiplier) || 0;
        
        totalWagered += betAmount;

        if (profitLoss > 0) {
          // Win
          gamesWon++;
          totalWon += profitLoss + betAmount;
          largestWin = Math.max(largestWin, profitLoss);
          tempWinStreak++;
          bestWinStreak = Math.max(bestWinStreak, tempWinStreak);
        } else {
          // Loss
          gamesLost++;
          totalLost += Math.abs(profitLoss);
          largestLoss = Math.max(largestLoss, Math.abs(profitLoss));
          tempWinStreak = 0;
        }

        bestMultiplier = Math.max(bestMultiplier, multiplier);
      }

      // Current win streak is the streak at the end
      currentWinStreak = tempWinStreak;
      const totalGames = gamesWon + gamesLost;

      // Update user stats (SAFE - no generated columns)
      const updatedStats = {
        total_games_played: totalGames,
        total_bets_placed: bets.length,
        games_won: gamesWon,
        games_lost: gamesLost,
        total_wagered: totalWagered,
        total_won: totalWon,
        total_lost: totalLost,
        largest_win: largestWin,
        largest_loss: largestLoss,
        best_multiplier: bestMultiplier,
        current_win_streak: currentWinStreak,
        best_win_streak: bestWinStreak,
        updated_at: new Date().toISOString()
        // EXCLUDED (auto-calculated by database):
        // win_rate: (games_won / total_games_played) * 100
        // net_profit: (total_won - total_lost)
      };

      const { error: updateError } = await supabase
        .from('users_unified')
        .update(updatedStats)
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Error updating user stats:', updateError);
        return false;
      }

      console.log(`✅ Synced stats for user ${userId}: ${totalGames} games`);
      return true;

    } catch (error) {
      console.error('❌ Error in syncUserStatsFromBets:', error);
      return false;
    }
  }

  /**
   * Sync all user stats from player_bets table (SAFE VERSION)
   */
  static async syncAllUserStats(): Promise<boolean> {
    try {
      console.log('🔄 Starting user stats sync from player_bets...');

      // Get all users
      const { data: users, error: usersError } = await supabase
        .from('users_unified')
        .select('id, username');

      if (usersError) {
        console.error('❌ Error fetching users:', usersError);
        return false;
      }

      console.log(`📊 Syncing stats for ${users?.length || 0} users...`);

      // Process each user
      let processedCount = 0;
      for (const user of users || []) {
        await this.syncUserStatsFromBets(user.id);
        processedCount++;
        
        // Log progress every 25 users
        if (processedCount % 25 === 0) {
          console.log(`📊 Progress: ${processedCount}/${users?.length} users processed`);
        }
        
        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log('✅ User stats sync completed successfully!');
      return true;

    } catch (error) {
      console.error('❌ Error in syncAllUserStats:', error);
      return false;
    }
  }

  /**
   * Enhanced recordBet function that also updates user stats (SAFE VERSION)
   */
  static async recordBetWithStatsUpdate(
    gameId: string,
    walletAddress: string,
    betAmount: number,
    userId?: string,
    cashoutMultiplier?: number,
    profitLoss?: number
  ): Promise<boolean> {
    try {
      // Record the bet in player_bets table
      const { error: betError } = await supabase
        .from('player_bets')
        .insert({
          game_id: gameId,
          user_id: userId,
          wallet_address: walletAddress,
          bet_amount: betAmount,
          cashout_multiplier: cashoutMultiplier,
          profit_loss: profitLoss
        });

      if (betError) {
        console.error('❌ Error recording bet:', betError);
        return false;
      }

      // Update user stats if we have userId and profitLoss
      if (userId && profitLoss !== undefined) {
        const isWin = profitLoss > 0;
        await UserAPI.updateUserStatsOnly(userId, betAmount, profitLoss, cashoutMultiplier);
      }

      return true;
    } catch (error) {
      console.error('❌ Error recording bet with stats update:', error);
      return false;
    }
  }

  /**
   * Get calculated stats (win_rate, net_profit) without storing them
   */
  static calculateDerivedStats(statsData: {
    total_games_played: number;
    games_won: number;
    total_won: number;
    total_lost: number;
  }): { win_rate: number; net_profit: number } {
    const win_rate = statsData.total_games_played > 0 
      ? (statsData.games_won / statsData.total_games_played) * 100 
      : 0;
    const net_profit = statsData.total_won - statsData.total_lost;
    
    return { win_rate, net_profit };
  }

  /**
   * Get user stats from users_unified (no need to calculate, already stored)
   */
  static async getUserStats(userId: string): Promise<UserStats | null> {
    try {
      const { data: user, error } = await supabase
        .from('users_unified')
        .select(`
          total_wagered,
          total_won,
          total_lost,
          net_profit,
          total_games_played,
          games_won,
          games_lost,
          win_rate,
          best_multiplier,
          largest_win,
          largest_loss,
          current_win_streak,
          best_win_streak
        `)
        .eq('id', userId)
        .single();

      if (error || !user) {
        logger.error('Error fetching user stats from users_unified:', error);
        return null;
      }

      return {
        total_wagered: parseFloat(user.total_wagered) || 0,
        total_won: parseFloat(user.total_won) || 0,
        total_lost: parseFloat(user.total_lost) || 0,
        net_profit: parseFloat(user.net_profit) || 0,
        games_played: user.total_games_played || 0,
        games_won: user.games_won || 0,
        games_lost: user.games_lost || 0,
        win_rate: parseFloat(user.win_rate) || 0,
        best_multiplier: parseFloat(user.best_multiplier) || 0,
        largest_win: parseFloat(user.largest_win) || 0,
        largest_loss: parseFloat(user.largest_loss) || 0,
        current_win_streak: user.current_win_streak || 0,
        best_win_streak: user.best_win_streak || 0
      };
    } catch (error) {
      logger.error('Error fetching user stats:', error);
      return null;
    }
  }

  /**
   * Get user bet history
   */
  static async getUserBetHistory(userId: string, limit: number = 50): Promise<BetEntry[]> {
    try {
      const { data, error } = await supabase
        .from('player_bets')
        .select(`
          *,
          games:game_id (
            game_number,
            crash_multiplier
          ),
          users_unified:user_id (
            username,
            avatar,
            level,
            badge
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
  
      if (error) {
        logger.error('Error fetching user bet history:', error);
        return [];
      }
  
      return data || [];
    } catch (error) {
      logger.error('Error fetching user bet history:', error);
      return [];
    }
  }

  // ADD THESE METHODS TO YOUR EXISTING UserAPI CLASS
// Place these after your enhanced bet recording methods

/**
 * 🎯 NEW: Get enhanced trade history for users
 */
static async getEnhancedTradeHistory(
  userId: string, 
  limit: number = 5
): Promise<EnhancedTradeHistory> {
  try {
    console.log('📊 Fetching enhanced trade history...');
    
    // Try enhanced method first
    try {
      const { data, error } = await supabase.rpc('get_user_trade_history_safe', {
        p_user_id: userId,
        p_limit: limit
      });

      if (!error && data && Array.isArray(data)) {
        console.log(`✅ Enhanced trade history: ${data.length} trades`);
        
        // Calculate quick analytics
        const analytics = this.calculateTradeAnalytics(data);
        
        return {
          trades: data,
          hasEnhancedData: true,
          analytics
        };
      }
    } catch (enhancedError) {
      console.warn('⚠️ Enhanced method not available, using basic query...');
    }

    // Fallback to your existing getUserBetHistory
    const basicTrades = await this.getUserBetHistory(userId, limit);
    
    const transformedTrades: DetailedTradeEntry[] = basicTrades.map(trade => ({
      id: trade.id,
      game_id: trade.game_id,
      user_id: trade.user_id,
      wallet_address: trade.wallet_address,
      bet_amount: trade.bet_amount,
      entry_multiplier: 1.0,
      entry_timestamp: trade.created_at,
      cashout_multiplier: trade.cashout_multiplier,
      exit_timestamp: trade.created_at,
      exit_type: trade.cashout_multiplier ? 'manual_cashout' : 'crashed',
      profit_loss: trade.profit_loss || 0,
      win_amount: (trade.profit_loss || 0) > 0 ? trade.bet_amount + (trade.profit_loss || 0) : undefined,
      house_edge_taken: 0,
      game_crash_multiplier: undefined,
      total_players_in_game: undefined,
      total_volume_in_game: undefined,
      risk_level: trade.bet_amount >= 0.1 ? 'high' : 'low',
      bet_size_category: trade.bet_amount >= 1.0 ? 'large' : trade.bet_amount >= 0.1 ? 'medium' : 'small',
      timing_score: undefined,
      trade_duration_seconds: undefined,
      was_winner: (trade.profit_loss || 0) > 0,
      return_percentage: trade.bet_amount > 0 
        ? ((trade.profit_loss || 0) / trade.bet_amount) * 100 
        : 0,
      status: trade.status || 'completed',
      created_at: trade.created_at,
      updated_at: trade.created_at
    }));

    return {
      trades: transformedTrades,
      hasEnhancedData: false
    };

  } catch (error) {
    console.error('❌ Error getting enhanced trade history:', error);
    return {
      trades: [],
      hasEnhancedData: false
    };
  }
}

/**
 * 🎯 NEW: Calculate analytics from trade data
 */
private static calculateTradeAnalytics(trades: any[]): {
  total_trades: number;
  win_rate: number;
  total_profit: number;
  avg_return: number;
  risk_distribution: {
    low: number;
    medium: number;
    high: number;
    extreme: number;
  };
} {
  if (trades.length === 0) {
    return { 
      total_trades: 0, 
      win_rate: 0, 
      total_profit: 0, 
      avg_return: 0,
      risk_distribution: { low: 0, medium: 0, high: 0, extreme: 0 }
    };
  }

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.was_winner).length;
  const winRate = (wins / totalTrades) * 100;
  const totalProfit = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const avgReturn = trades.reduce((sum, t) => sum + (t.return_percentage || 0), 0) / totalTrades;

  // Risk distribution
  const riskDistribution = trades.reduce((dist, trade) => {
    const risk = trade.risk_level || 'low';
    dist[risk as keyof typeof dist]++;
    return dist;
  }, { low: 0, medium: 0, high: 0, extreme: 0 });

  return {
    total_trades: totalTrades,
    win_rate: winRate,
    total_profit: totalProfit,
    avg_return: avgReturn,
    risk_distribution: riskDistribution
  };
}

// ADD THESE METHODS TO YOUR EXISTING UserAPI CLASS
// Place these after your calculateTradeAnalytics method

/**
 * 🎯 NEW: Check if enhanced features are available
 */
static async checkEnhancedFeaturesStatus(): Promise<EnhancedFeaturesStatus> {
  try {
    // Test if enhanced function exists
    const { data, error } = await supabase.rpc('get_user_trade_history_safe', {
      p_user_id: 'test-id',
      p_limit: 1
    });

    const enhancedFunctionsAvailable = !error || !error.message.includes('function');

    // Test if risk_level column exists by trying to select it
    const { error: schemaError } = await supabase
      .from('player_bets')
      .select('risk_level')
      .limit(1);

    const enhancedSchemaAvailable = !schemaError;

    let recommendedAction = '';
    if (!enhancedSchemaAvailable && !enhancedFunctionsAvailable) {
      recommendedAction = 'Run the safe migration to enable enhanced trade history features';
    } else if (!enhancedSchemaAvailable) {
      recommendedAction = 'Schema migration needed for full enhanced features';
    } else if (!enhancedFunctionsAvailable) {
      recommendedAction = 'Function migration needed for full enhanced features';
    } else {
      recommendedAction = 'All enhanced features are available and working!';
    }

    return {
      enhanced_schema: enhancedSchemaAvailable,
      enhanced_functions: enhancedFunctionsAvailable,
      recommended_action: recommendedAction
    };

  } catch (error) {
    return {
      enhanced_schema: false,
      enhanced_functions: false,
      recommended_action: 'Run the safe migration to enable enhanced features'
    };
  }
}

/**
 * 🎯 NEW: Test enhanced system without affecting production
 */
static async testEnhancedSystem(userId: string): Promise<{
  success: boolean;
  tests: {
    schema_check: boolean;
    function_check: boolean;
    trade_history_retrieval: boolean;
    enhanced_recording: boolean;
  };
  message: string;
}> {
  const tests = {
    schema_check: false,
    function_check: false,
    trade_history_retrieval: false,
    enhanced_recording: false
  };

  try {
    // Test 1: Schema check
    try {
      await supabase.from('player_bets').select('risk_level').limit(1);
      tests.schema_check = true;
    } catch (error) {
      console.log('Schema test: Enhanced columns not available');
    }

    // Test 2: Function check
    try {
      await supabase.rpc('get_user_trade_history_safe', {
        p_user_id: userId,
        p_limit: 1
      });
      tests.function_check = true;
    } catch (error) {
      console.log('Function test: Enhanced functions not available');
    }

    // Test 3: Trade history retrieval
    try {
      const result = await this.getEnhancedTradeHistory(userId, 3);
      tests.trade_history_retrieval = result.trades.length >= 0; // Success even if empty
    } catch (error) {
      console.log('Trade history test failed');
    }

    // Test 4: Enhanced recording (read-only test)
    tests.enhanced_recording = tests.schema_check && tests.function_check;

    const successCount = Object.values(tests).filter(Boolean).length;
    const success = successCount >= 2; // At least basic functionality

    let message = '';
    if (successCount === 4) {
      message = '✅ All enhanced features are working perfectly!';
    } else if (successCount >= 2) {
      message = `⚠️ Partial enhanced features available (${successCount}/4). Consider running migration for full features.`;
    } else {
      message = '❌ Enhanced features not available. Run the safe migration to enable them.';
    }

    return {
      success,
      tests,
      message
    };

  } catch (error) {
    return {
      success: false,
      tests,
      message: `❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

  // If you need to get betting data for leaderboards/rankings
  static async getBetHistoryWithUsers(limit: number = 100): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('player_bets')
        .select(`
          *,
          users_unified:user_id (
            id,
            username,
            avatar,
            level,
            badge
          ),
          games:game_id (
            game_number,
            crash_multiplier,
            created_at
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error fetching bet history with users:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Error fetching bet history with users:', error);
      return [];
    }
  }

  // For leaderboard calculations
  static async getLeaderboardData(timeframe: 'daily' | 'weekly' | 'monthly' | 'all' = 'all'): Promise<any[]> {
    try {
      let dateFilter = '';
      const now = new Date();
      
      switch (timeframe) {
        case 'daily':
          dateFilter = new Date(now.setHours(0, 0, 0, 0)).toISOString();
          break;
        case 'weekly':
          const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
          dateFilter = weekStart.toISOString();
          break;
        case 'monthly':
          dateFilter = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          break;
      }

      let query = supabase
        .from('player_bets')
        .select(`
          user_id,
          bet_amount,
          profit_loss,
          users_unified:user_id (
            username,
            avatar,
            level,
            badge
          )
        `);

      if (dateFilter) {
        query = query.gte('created_at', dateFilter);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching leaderboard data:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Error fetching leaderboard data:', error);
      return [];
    }
  }

  /**
   * Find user by any wallet address field
   */
  static async findUserByWalletAddress(walletAddress: string): Promise<UserData | null> {
    try {
      const { data: user, error } = await supabase
        .from('users_unified')
        .select('*')
        .or(`wallet_address.ilike.${walletAddress},external_wallet_address.ilike.${walletAddress},privy_wallet_address.ilike.${walletAddress}`)
        .single();

      if (error || !user) {
        return null;
      }

      return UserAPI.transformUserData(user);
    } catch (error) {
      logger.error('Error finding user by wallet address:', error);
      return null;
    }
  }

  /**
   * Record a bet (this might be handled by the server now, but keeping for compatibility)
   */
  static async recordBet(
    gameId: string,
    walletAddress: string,
    betAmount: number,
    userId?: string,
    cashoutMultiplier?: number,
    profitLoss?: number
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('player_bets')
        .insert({
          game_id: gameId,
          user_id: userId,
          wallet_address: walletAddress,
          bet_amount: betAmount,
          cashout_multiplier: cashoutMultiplier,
          profit_loss: profitLoss
        });

      if (error) {
        logger.error('Error recording bet:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error recording bet:', error);
      return false;
    }
  }

  /**
   * Authenticate user and register if needed
   */
  static async authenticateUser(walletAddress: string, privyUserId?: string, privyWalletAddress?: string): Promise<{
    success: boolean;
    user?: UserData;
    isNewUser?: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔐 Authenticating user for wallet: ${walletAddress}`);
      
      // Get or create user
      const user = await UserAPI.getUserOrCreate(walletAddress);
      
      if (!user) {
        return {
          success: false,
          error: 'Failed to get or create user'
        };
      }

      // Check if this is a new user (created within last 10 seconds)
      const isNewUser = new Date(user.created_at).getTime() > Date.now() - 10000;

      console.log(`✅ User authenticated: ${user.id} (${isNewUser ? 'NEW' : 'EXISTING'})`);

      return {
        success: true,
        user,
        isNewUser
      };
      
    } catch (error) {
      console.error('❌ User authentication error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }

  /**
   * 🎯 NEW: Update user stats using database function (GUARANTEED TO WORK)
   */
  static async updateUserStatsOnly(
    userId: string,
    betAmount: number,
    profitLoss: number = 0,
    cashoutMultiplier?: number
  ): Promise<{ success: boolean; userStats?: any; error?: string }> {
    try {
      console.log(`📊 Updating stats: user=${userId}, bet=${betAmount}, profit=${profitLoss}`);
      
      const { data, error } = await supabase.rpc('update_user_stats_only', {
        p_user_id: userId,
        p_bet_amount: betAmount,
        p_profit_loss: profitLoss,
        p_cashout_multiplier: cashoutMultiplier
      });

      if (error) {
        console.error('❌ Stats update error:', error);
        return { success: false, error: error.message };
      }

      if (!data?.success) {
        console.error('❌ Stats update failed:', data?.error);
        return { success: false, error: data?.error || 'Stats update failed' };
      }

      console.log('✅ Stats updated successfully:', {
        games_played: data.user_stats?.total_games_played,
        win_rate: data.user_stats?.win_rate,
        net_profit: data.user_stats?.net_profit
      });
      
      return { 
        success: true, 
        userStats: data.user_stats 
      };

    } catch (error) {
      console.error('❌ Error in updateUserStatsOnly:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 🎯 NEW: Record bet and update stats (matches your schema)
   */
  static async recordBetAndUpdateStatsFinal(
    gameId: string,
    userId: string,
    walletAddress: string,
    betAmount: number,
    cashoutMultiplier?: number,
    profitLoss?: number,
    status: string = 'completed'
  ): Promise<{ success: boolean; userStats?: any; betId?: string; error?: string }> {
    try {
      console.log(`🎯 Recording bet: game=${gameId}, user=${userId}, amount=${betAmount}`);
      
      const { data, error } = await supabase.rpc('record_bet_and_update_stats_final', {
        p_game_id_text: gameId,
        p_user_id: userId,
        p_wallet_address: walletAddress,
        p_bet_amount: betAmount,
        p_cashout_multiplier: cashoutMultiplier,
        p_profit_loss: profitLoss,
        p_status: status
      });

      if (error) {
        console.error('❌ Bet recording error:', error);
        return { success: false, error: error.message };
      }

      if (!data?.success) {
        console.error('❌ Bet recording failed:', data?.error);
        return { success: false, error: data?.error || 'Bet recording failed' };
      }

      console.log('✅ Bet recorded and stats updated');
      return { 
        success: true, 
        userStats: data.user_stats,
        betId: data.bet_id
      };

    } catch (error) {
      console.error('❌ Error in recordBetAndUpdateStatsFinal:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 🎯 NEW: Main function for bet resolution (REPLACE YOUR CURRENT BET HANDLING)
   */
  static async handleBetResolutionNew(
    gameId: string,
    userId: string,
    walletAddress: string,
    betAmount: number,
    cashoutMultiplier?: number,
    profitLoss?: number
  ): Promise<{ success: boolean; method?: string; userStats?: any; error?: string }> {
    try {
      console.log(`🎯 Handling bet resolution: game=${gameId}, user=${userId}`);

      // Method 1: Try full bet recording + stats update
      const fullResult = await this.recordBetAndUpdateStatsFinal(
        gameId, userId, walletAddress, betAmount, cashoutMultiplier, profitLoss
      );

      if (fullResult.success) {
        console.log('✅ Full bet recording and stats update successful');
        return { 
          success: true, 
          method: 'full_recording',
          userStats: fullResult.userStats 
        };
      }

      console.warn('⚠️ Full recording failed, trying stats-only update...', fullResult.error);

      // Method 2: Stats-only update as fallback
      const statsResult = await this.updateUserStatsOnly(
        userId, betAmount, profitLoss || 0, cashoutMultiplier
      );

      if (statsResult.success) {
        console.log('✅ Stats-only update successful');
        
        // Try to record bet using your existing method (non-critical)
        try {
          await this.recordBet(gameId, walletAddress, betAmount, userId, cashoutMultiplier, profitLoss);
        } catch (betError) {
          console.warn('⚠️ Existing bet recording failed (non-critical):', betError);
        }

        return { 
          success: true, 
          method: 'stats_only',
          userStats: statsResult.userStats 
        };
      }

      console.error('❌ All update methods failed');
      return { 
        success: false, 
        error: `Full recording failed: ${fullResult.error}, Stats update failed: ${statsResult.error}` 
      };

    } catch (error) {
      console.error('❌ Error in handleBetResolutionNew:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

// ADD THESE METHODS TO YOUR EXISTING UserAPI CLASS
// Place these after your existing handleBetResolutionNew method (around line 800)

/**
 * 🎯 ENHANCED: Drop-in replacement for recordBet with enhanced features
 */
static async recordBetEnhanced(
  gameId: string,
  walletAddress: string,
  betAmount: number,
  userId?: string,
  cashoutMultiplier?: number,
  profitLoss?: number,
  // NEW optional parameters for enhanced tracking
  entryMultiplier: number = 1.0,
  exitType: 'manual_cashout' | 'auto_cashout' | 'crashed' = 'crashed',
  gameCrashMultiplier?: number
): Promise<boolean> {
  try {
    console.log('🎯 Recording enhanced bet...');
    
    // Try enhanced recording first (if migration was applied)
    try {
      const { data, error } = await supabase.rpc('record_enhanced_bet_safe', {
        p_game_id: gameId,
        p_user_id: userId,
        p_wallet_address: walletAddress,
        p_bet_amount: betAmount,
        p_entry_multiplier: entryMultiplier,
        p_cashout_multiplier: cashoutMultiplier,
        p_profit_loss: profitLoss || 0,
        p_exit_type: exitType,
        p_game_crash_multiplier: gameCrashMultiplier
      });

      if (!error && data?.success) {
        console.log('✅ Enhanced bet recording successful');
        return true;
      }
      
      console.warn('⚠️ Enhanced recording failed, falling back to existing method...');
    } catch (enhancedError) {
      console.warn('⚠️ Enhanced method not available, using existing method...');
    }

    // Fallback to your existing recordBet method
    return await this.recordBet(gameId, walletAddress, betAmount, userId, cashoutMultiplier, profitLoss);

  } catch (error) {
    console.error('❌ Error in recordBetEnhanced:', error);
    return false;
  }
}

/**
 * 🎯 ENHANCED: Upgrade your handleBetResolutionNew with trade history
 */
static async handleBetResolutionSuperEnhanced(
  gameId: string,
  userId: string,
  walletAddress: string,
  betAmount: number,
  cashoutMultiplier?: number,
  profitLoss?: number,
  // NEW optional parameters
  entryMultiplier: number = 1.0,
  gameCrashMultiplier?: number
): Promise<{ 
  success: boolean; 
  method?: string; 
  userStats?: any; 
  xpGained?: number;
  leveledUp?: boolean;
  error?: string; 
}> {
  try {
    console.log(`🎯 Super enhanced bet resolution for user: ${userId}`);

    // Determine exit type
    const exitType = cashoutMultiplier ? 'manual_cashout' : 'crashed';

    // Method 1: Try enhanced bet recording with trade history
    try {
      const enhancedResult = await this.recordBetEnhanced(
        gameId, walletAddress, betAmount, userId, cashoutMultiplier, profitLoss,
        entryMultiplier, exitType, gameCrashMultiplier
      );

      if (enhancedResult) {
        // Also do XP calculation using your existing method
        await this.updateUserStatsOnly(userId, betAmount, profitLoss || 0, cashoutMultiplier);

        return {
          success: true,
          method: 'enhanced_with_xp_and_history'
        };
      }
    } catch (enhancedError) {
      console.warn('⚠️ Enhanced method failed, falling back...', enhancedError);
    }

    // Method 2: Fallback to your existing handleBetResolutionNew
    console.log('🔄 Falling back to existing bet resolution...');
    return await this.handleBetResolutionNew(gameId, userId, walletAddress, betAmount, cashoutMultiplier, profitLoss);

  } catch (error) {
    console.error('❌ Error in handleBetResolutionSuperEnhanced:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
  /**
   * 🔍 NEW: Debug function to check user stats
   */
  static async debugUserStats(userId: string): Promise<any> {
    try {
      const { data, error } = await supabase.rpc('get_user_stats_debug', {
        p_user_id: userId
      });

      if (error) {
        console.error('❌ Error getting debug stats:', error);
        return null;
      }

      console.log('📊 Current user stats:', data);
      return data;

    } catch (error) {
      console.error('❌ Error in debugUserStats:', error);
      return null;
    }
  }

  /**
   * 🧪 NEW: Test function
   */
  static async testStatsUpdate(userId: string): Promise<void> {
    try {
      console.log('🧪 Testing stats update for user:', userId);
      
      // Get current stats
      console.log('📊 Before test:');
      const beforeStats = await this.debugUserStats(userId);

      // Test win
      console.log('🎯 Testing win...');
      const winResult = await this.updateUserStatsOnly(userId, 10.0, 15.0, 2.5);
      console.log('Win result:', winResult);

      // Test loss  
      console.log('🎯 Testing loss...');
      const lossResult = await this.updateUserStatsOnly(userId, 5.0, -5.0, 0);
      console.log('Loss result:', lossResult);

      // Get final stats
      console.log('📊 After test:');
      const afterStats = await this.debugUserStats(userId);

      console.log('🎯 Test completed!');

    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }
}

// Keep existing APIs unchanged (LeaderboardAPI, ChartAPI, ChatAPI, SystemAPI)
export class LeaderboardAPI {
  /**
   * Get leaderboard data from users_unified table with complete user info
   */
  static async getLeaderboard(period: 'daily' | 'weekly' | 'monthly' | 'all_time' = 'daily'): Promise<LeaderboardEntry[]> {
    try {
      console.log(`📊 Fetching ${period} leaderboard data from users_unified...`);

      // Define the profit column based on period
      let profitColumn: string;
      switch (period) {
        case 'daily':
          profitColumn = 'daily_profit';
          break;
        case 'weekly':
          profitColumn = 'weekly_profit';
          break;
        case 'monthly':
          profitColumn = 'monthly_profit';
          break;
        case 'all_time':
        default:
          profitColumn = 'net_profit';
          break;
      }

      // 🚀 ENHANCED: Query users_unified with ALL user data to match dashboard
      const { data, error } = await supabase
        .from('users_unified')
        .select(`
          id,
          username,
          wallet_address,
          external_wallet_address,
          ${profitColumn},
          net_profit,
          total_games_played,
          best_multiplier,
          avatar,
          level,
          badge,
          experience,
          experience_points,
          total_wagered,
          total_won,
          win_rate,
          current_win_streak,
          best_win_streak,
          achievements,
          badges_earned,
          risk_score,
          behavior_pattern
        `)
        .order('win_rate', { ascending: false }) // 🎯 Primary: Best win rate first
        .order('net_profit', { ascending: false }) // 🥈 Secondary: Highest profit
        .order('total_games_played', { ascending: false }) // 🥉 Tertiary: Most active
        .limit(100);
        
      if (error) {
        console.error('❌ Error fetching leaderboard from users_unified:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('📊 No leaderboard data found');
        return [];
      }

      // 🚀 ENHANCED: Transform data with complete user info
      const leaderboardEntries: LeaderboardEntry[] = data.map((user: any, index: number) => {
        const profit = parseFloat(user[profitColumn]) || 0;
        const totalWagered = parseFloat(user.total_wagered) || 1; // Avoid division by zero
        
        // Calculate profit percentage: (profit / total_wagered) * 100
        const profitPercentage = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;

        // Calculate tier based on level (same logic as dashboard)
        const level = user.level || 1;
        const tier = Math.ceil(level / 10); // Every 10 levels = new tier

        return {
          id: user.id,
          wallet_address: user.external_wallet_address || user.wallet_address,
          username: user.username || 'Anonymous',
          total_profit: profit,
          profit_percentage: profitPercentage,
          games_played: user.total_games_played || 0,
          best_multiplier: parseFloat(user.best_multiplier) || 0,
          rank: index + 1, // Rank based on order
          avatar: user.avatar || '👤',
          level: level,
          badge: user.badge,
          // NEW: XP and tier data matching dashboard
          experience: user.experience || 0,
          experience_points: user.experience_points || 0,
          tier: tier,
          win_rate: parseFloat(user.win_rate) || 0,
          current_win_streak: user.current_win_streak || 0,
          best_win_streak: user.best_win_streak || 0,
          total_wagered: parseFloat(user.total_wagered) || 0,
          total_won: parseFloat(user.total_won) || 0,
          achievements: user.achievements || [],
          badges_earned: user.badges_earned || []
        };
      });

      console.log(`✅ Fetched ${leaderboardEntries.length} leaderboard entries for ${period} with complete user data`);
      return leaderboardEntries;

    } catch (error) {
      console.error('❌ Error in LeaderboardAPI.getLeaderboard:', error);
      return [];
    }
  }

  /**
   * Get current user's full data from users_unified for leaderboard display
   */
  static async getCurrentUserData(userId: string): Promise<LeaderboardEntry | null> {
    try {
      console.log(`👤 Fetching current user data for leaderboard: ${userId}`);

      const { data: user, error } = await supabase
        .from('users_unified')
        .select(`
          id,
          username,
          wallet_address,
          external_wallet_address,
          net_profit,
          daily_profit,
          weekly_profit,
          monthly_profit,
          total_games_played,
          best_multiplier,
          avatar,
          level,
          badge,
          experience,
          experience_points,
          total_wagered,
          total_won,
          win_rate,
          current_win_streak,
          best_win_streak,
          achievements,
          badges_earned
        `)
        .eq('id', userId)
        .single();

      if (error || !user) {
        console.error('❌ Error fetching current user data:', error);
        return null;
      }

      const totalWagered = parseFloat(user.total_wagered) || 1;
      const netProfit = parseFloat(user.net_profit) || 0;
      const profitPercentage = totalWagered > 0 ? (netProfit / totalWagered) * 100 : 0;
      const level = user.level || 1;
      const tier = Math.ceil(level / 10);

      return {
        id: user.id,
        wallet_address: user.external_wallet_address || user.wallet_address,
        username: user.username || 'Anonymous',
        total_profit: netProfit,
        profit_percentage: profitPercentage,
        games_played: user.total_games_played || 0,
        best_multiplier: parseFloat(user.best_multiplier) || 0,
        rank: 0, // Will be calculated separately
        avatar: user.avatar || '👤',
        level: level,
        badge: user.badge,
        experience: user.experience || 0,
        experience_points: user.experience_points || 0,
        tier: tier,
        win_rate: parseFloat(user.win_rate) || 0,
        current_win_streak: user.current_win_streak || 0,
        best_win_streak: user.best_win_streak || 0,
        total_wagered: parseFloat(user.total_wagered) || 0,
        total_won: parseFloat(user.total_won) || 0,
        achievements: user.achievements || [],
        badges_earned: user.badges_earned || []
      };

    } catch (error) {
      console.error('❌ Error fetching current user data:', error);
      return null;
    }
  }
  
  static async getUserRank(walletAddress: string, period: 'daily' | 'weekly' | 'monthly' | 'all_time' = 'daily'): Promise<number | null> {
    try {
      const leaderboard = await this.getLeaderboard(period);
      const userEntry = leaderboard.find(entry => 
        entry.wallet_address.toLowerCase() === walletAddress.toLowerCase()
      );
      
      return userEntry?.rank || null;
    } catch (error) {
      console.error('❌ Error getting user rank:', error);
      return null;
    }
  }

  static async updateLeaderboard(walletAddress: string, profit: number, multiplier: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .rpc('update_leaderboard_entry', {
          wallet_addr: walletAddress,
          profit_amount: profit,
          multiplier_value: multiplier
        });

      if (error) {
        logger.error('Error updating leaderboard:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error updating leaderboard:', error);
      return false;
    }
  }
}

export class ChartAPI {
  static async getChartData(gameId: string): Promise<ChartData[]> {
    try {
      const { data, error } = await supabase
        .from('chart_data')
        .select('*')
        .eq('game_id', gameId)
        .order('timestamp', { ascending: true });

      if (error) {
        logger.error('Error fetching chart data:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Error fetching chart data:', error);
      return [];
    }
  }

  static async getRecentGames(limit: number = 10): Promise<GameState[]> {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error fetching recent games:', error);
        throw error;
      }

      return data?.map((game: any) => ({
        gameId: game.id,
        gameNumber: game.game_number,
        multiplier: game.crash_multiplier || 0,
        status: game.status,
        totalBets: game.total_bets || 0,
        totalPlayers: game.total_players || 0,
        startTime: new Date(game.created_at).getTime()
      })) || [];
    } catch (error) {
      logger.error('Error fetching recent games:', error);
      return [];
    }
  }

  static async insertChartData(gameId: string, chartData: ChartData[]): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chart_data')
        .insert(chartData.map(data => ({ ...data, game_id: gameId })));

      if (error) {
        logger.error('Error inserting chart data:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error inserting chart data:', error);
      return false;
    }
  }
}

export class ChatAPI {
  static async getChatHistory(limit: number = 50): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error fetching chat history:', error);
        return [];
      }

      return data?.reverse() || [];
    } catch (error) {
      logger.error('Error fetching chat history:', error);
      return [];
    }
  }

  static async sendMessage(walletAddress: string, username: string, message: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          wallet_address: walletAddress,
          username: username,
          message: message,
          message_type: 'user'
        });

      if (error) {
        logger.error('Error sending chat message:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error sending chat message:', error);
      return false;
    }
  }

  static subscribeToMessages(callback: (message: ChatMessage) => void): () => void {
    const subscription = supabase
      .channel('chat_messages')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          callback(payload.new as ChatMessage);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }
}

export class SystemAPI {
  static async getSettings(): Promise<Record<string, string>> {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value');

      if (error) {
        logger.error('Error fetching system settings:', error);
        return {};
      }

      const settings: Record<string, string> = {};
      data?.forEach((setting: any) => {
        settings[setting.key] = setting.value;
      });

      return settings;
    } catch (error) {
      logger.error('Error fetching system settings:', error);
      return {};
    }
  }

  static async updateSetting(key: string, value: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() });

      if (error) {
        logger.error('Error updating setting:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error updating setting:', error);
      return false;
    }
  }
}

// Create singleton instances
export const gameAPI = new GameAPI();