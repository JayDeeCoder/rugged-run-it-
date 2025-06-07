// src/services/api.ts - UPDATED FOR USERS_UNIFIED TABLE
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

// UPDATED TYPES FOR USERS_UNIFIED TABLE
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

export interface UserStats {
  total_wagered: number;
  total_won: number;
  total_lost: number;
  net_profit: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  win_rate: number;
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

// Keep existing GameAPI class unchanged
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

// COMPLETELY UPDATED UserAPI FOR USERS_UNIFIED TABLE
export class UserAPI {
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
            avatar: '👤',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
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
      last_active: rawUser.last_active
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
        .gt(profitColumn, 0) // Only show users with positive profit
        .gt('total_games_played', 0) // Only show users who have played games
        .order(profitColumn, { ascending: false })
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