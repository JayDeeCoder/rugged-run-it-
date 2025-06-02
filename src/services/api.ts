// src/services/api.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { io, Socket } from 'socket.io-client';
import logger from '../utils/logger';

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// Game server WebSocket connection
const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';

// Types
export interface GameState {
  gameId: string;
  gameNumber: number;
  multiplier: number;
  status: 'waiting' | 'active' | 'crashed';
  totalBets: number;
  totalPlayers: number;
  startTime: number;
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
  level?: number;
  badge?: string;
}

export interface ChartData {
  timestamp: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
}

export interface UserStats {
  total_wagered: number;
  total_won: number;
  games_played: number;
  best_multiplier: number;
  win_rate: number;
}

export interface UserData {
  id: string;
  wallet_address: string;
  username: string;
  avatar?: string;
  level?: number;
  experience?: number;
  badge?: string;
  created_at: string;
  updated_at: string;
}

export interface BetEntry {
  id: string;
  game_id: string;
  wallet_address: string;
  bet_amount: number;
  cashout_multiplier?: number;
  profit_loss?: number;
  created_at: string;
}

// Type for partial bet data from Supabase queries
export interface BetStatsData {
  bet_amount: number;
  profit_loss?: number;
  cashout_multiplier?: number;
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

// Game API with WebSocket support
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

      // Forward all game events to registered listeners
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

// Leaderboard API
export class LeaderboardAPI {
  static async getLeaderboard(period: 'daily' | 'weekly' | 'monthly' | 'all_time' = 'daily'): Promise<LeaderboardEntry[]> {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select(`
          *,
          users:user_id (
            username,
            avatar,
            level,
            badge
          )
        `)
        .eq('period', period)
        .order('rank', { ascending: true })
        .limit(100);

      if (error) {
        logger.error('Error fetching leaderboard:', error);
        throw error;
      }

      return data?.map((entry: any) => ({
        id: entry.id,
        wallet_address: entry.wallet_address,
        username: entry.users?.username || entry.username || 'Anonymous',
        total_profit: entry.total_profit,
        profit_percentage: entry.profit_percentage,
        games_played: entry.games_played,
        best_multiplier: entry.best_multiplier,
        rank: entry.rank,
        avatar: entry.users?.avatar,
        level: entry.users?.level,
        badge: entry.users?.badge
      })) || [];
    } catch (error) {
      logger.error('Error fetching leaderboard:', error);
      return [];
    }
  }

  static async getUserRank(walletAddress: string, period: 'daily' | 'weekly' | 'monthly' | 'all_time' = 'daily'): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('rank')
        .eq('wallet_address', walletAddress)
        .eq('period', period)
        .single();

      if (error) {
        logger.error('Error fetching user rank:', error);
        return null;
      }

      return data?.rank || null;
    } catch (error) {
      logger.error('Error fetching user rank:', error);
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

// Chart API
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

// User API
// src/services/api.ts - Enhanced UserAPI with validation
// Replace your existing UserAPI class with this enhanced version

export class UserAPI {
  /**
   * Enhanced getUserOrCreate with validation to prevent mapping issues
   */
  static async getUserOrCreate(walletAddress: string): Promise<UserData | null> {
    try {
      console.log(`🔍 Getting user for wallet: ${walletAddress}`);
      
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }
      
      // First, try to find user with EXACT case match
      console.log(`📡 Trying exact case match: ${walletAddress}`);
      let { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('wallet_address', walletAddress) // Exact case first!
        .single();
  
      // If not found, try lowercase
      if (error && error.code === 'PGRST116') {
        console.log(`📡 Trying lowercase: ${walletAddress.toLowerCase()}`);
        const { data: userLower, error: errorLower } = await supabase
          .from('users')
          .select('*')
          .eq('wallet_address', walletAddress.toLowerCase())
          .single();
        
        if (userLower && !errorLower) {
          user = userLower;
          error = null;
          console.log(`✅ Found user with lowercase search: ${user.id}`);
        }
      }
  
      // If not found, try case-insensitive search
      if (error && error.code === 'PGRST116') {
        console.log(`📡 Trying case-insensitive search with ilike...`);
        const { data: users, error: errorIlike } = await supabase
          .from('users')
          .select('*')
          .ilike('wallet_address', walletAddress); // Case-insensitive search
        
        if (users && users.length > 0 && !errorIlike) {
          user = users[0]; // Take the first match
          error = null;
          console.log(`✅ Found user with case-insensitive search: ${user.id}`);
        }
      }
  
      if (error && error.code === 'PGRST116') {
        // User truly doesn't exist, create new one
        console.log(`👤 Creating new user for wallet: ${walletAddress}`);
        
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            wallet_address: walletAddress, // Keep original case!
            username: `user${walletAddress.slice(-4)}`,
            avatar: '👤',
            level: 1,
            experience: 0
          })
          .select()
          .single();
  
        if (createError) {
          console.error('❌ Error creating user:', createError);
          throw createError;
        }
        
        user = newUser;
        console.log(`✅ Created new user: ${user.id} for wallet: ${walletAddress}`);
      } else if (error) {
        console.error('❌ Error fetching user:', error);
        throw error;
      } else {
        console.log(`✅ Found existing user: ${user.id} for wallet: ${walletAddress}`);
      }
  
      return user;
      
    } catch (error) {
      console.error('❌ UserAPI.getUserOrCreate error:', error);
      return null;
    }
  }

  /**
   * NEW: Force refresh user data (for when mappings might be stale)
   */
  static async refreshUserData(walletAddress: string): Promise<UserData | null> {
    try {
      console.log(`🔄 Force refreshing user data for wallet: ${walletAddress}`);
      
      const normalizedWallet = walletAddress.toLowerCase();
      
      // Force a fresh query by using a timestamp
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('wallet_address', normalizedWallet)
        .single();

      if (error) {
        console.error(`❌ Failed to refresh user data: ${error.message}`);
        return null;
      }

      console.log(`✅ Refreshed user data: ${user.id} for wallet: ${walletAddress}`);
      return user;
    } catch (error) {
      console.error('❌ Error refreshing user data:', error);
      return null;
    }
  }

  /**
   * NEW: Validate that a user-wallet mapping is correct
   */
  static async validateUserWalletMapping(userId: string, walletAddress: string): Promise<boolean> {
    try {
      console.log(`🔍 Validating mapping: ${userId} <-> ${walletAddress}`);
      
      const { data: user, error } = await supabase
        .from('users')
        .select('id, wallet_address')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn(`⚠️ Validation failed - user not found: ${error.message}`);
        return false;
      }

      const isValid = user.wallet_address?.toLowerCase() === walletAddress.toLowerCase();
      
      if (!isValid) {
        console.warn(`⚠️ VALIDATION FAILED:`);
        console.warn(`   User ID: ${userId}`);
        console.warn(`   Expected wallet: ${walletAddress}`);
        console.warn(`   Database wallet: ${user.wallet_address}`);
      } else {
        console.log(`✅ Validation passed: ${userId} <-> ${walletAddress}`);
      }

      return isValid;
    } catch (error) {
      console.error('❌ Failed to validate user-wallet mapping:', error);
      return false;
    }
  }

  /**
   * NEW: Check for duplicate wallet addresses (admin/debug function)
   */
  static async checkForDuplicateWallets(): Promise<any[]> {
    try {
      console.log(`🔍 Checking for duplicate wallet addresses...`);
      
      // This query finds all wallet addresses that appear more than once
      const { data, error } = await supabase
        .rpc('find_duplicate_wallets'); // You'll need to create this function in Supabase
      
      if (error) {
        console.error('❌ Failed to check for duplicates:', error);
        return [];
      }
      
      if (data && data.length > 0) {
        console.warn(`⚠️ Found ${data.length} duplicate wallet addresses:`, data);
      } else {
        console.log(`✅ No duplicate wallet addresses found`);
      }
      
      return data || [];
    } catch (error) {
      console.error('❌ Error checking for duplicate wallets:', error);
      return [];
    }
  }

  /**
   * NEW: Emergency user lookup with comprehensive validation
   */
  static async emergencyUserLookup(walletAddress: string): Promise<any> {
    try {
      console.log(`🚨 Emergency user lookup for wallet: ${walletAddress}`);
      
      const normalizedWallet = walletAddress.toLowerCase();
      
      // Get all users with this wallet address (should only be one)
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('wallet_address', normalizedWallet);

      const result = {
        walletAddress: walletAddress,
        normalizedWallet: normalizedWallet,
        usersFound: users?.length || 0,
        users: users || [],
        error: error?.message,
        timestamp: new Date().toISOString()
      };

      console.log(`🚨 Emergency lookup result:`, result);
      
      if (users && users.length > 1) {
        console.error(`❌ CRITICAL: Found ${users.length} users with wallet ${walletAddress}!`);
        
        // Log this critical issue
        try {
          await supabase
            .from('audit_log')
            .insert({
              action: 'DUPLICATE_WALLET_DETECTED',
              details: result
            });
        } catch (auditError) {
          console.warn('⚠️ Failed to log duplicate wallet to audit trail:', auditError);
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Emergency lookup error:', error);
      return {
        walletAddress,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Keep all your existing methods below unchanged...
  static async updateUser(walletAddress: string, updates: Partial<UserData>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('wallet_address', walletAddress.toLowerCase()); // Normalize here too

      if (error) {
        logger.error('Error updating user:', error);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error updating user:', error);
      return false;
    }
  }

  // ... rest of your existing methods stay the same
  static async getUserStats(walletAddress: string): Promise<UserStats | null> {
    try {
      const { data, error } = await supabase
        .from('player_bets')
        .select('bet_amount, profit_loss, cashout_multiplier')
        .eq('wallet_address', walletAddress.toLowerCase()); // Normalize here too

      if (error) {
        logger.error('Error fetching user stats:', error);
        return null;
      }

      if (!data || data.length === 0) {
        return {
          total_wagered: 0,
          total_won: 0,
          games_played: 0,
          best_multiplier: 0,
          win_rate: 0
        };
      }

      const betData: BetStatsData[] = data;

      const totalWagered = betData.reduce((sum: number, bet: BetStatsData) => sum + bet.bet_amount, 0);
      const totalWon = betData.reduce((sum: number, bet: BetStatsData) => sum + Math.max(0, bet.profit_loss || 0), 0);
      const gamesPlayed = betData.length;
      const bestMultiplier = Math.max(...betData.map((bet: BetStatsData) => bet.cashout_multiplier || 0));
      const wins = betData.filter((bet: BetStatsData) => (bet.profit_loss || 0) > 0).length;
      const winRate = gamesPlayed > 0 ? wins / gamesPlayed : 0;

      return {
        total_wagered: totalWagered,
        total_won: totalWon,
        games_played: gamesPlayed,
        best_multiplier: bestMultiplier,
        win_rate: winRate
      };
    } catch (error) {
      logger.error('Error fetching user stats:', error);
      return null;
    }
  }

  static async getUserBetHistory(walletAddress: string, limit: number = 50): Promise<BetEntry[]> {
    try {
      const { data, error } = await supabase
        .from('player_bets')
        .select(`
          *,
          games:game_id (
            game_number,
            crash_multiplier
          )
        `)
        .eq('wallet_address', walletAddress.toLowerCase()) // Normalize here too
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

  static async recordBet(
    gameId: string,
    walletAddress: string,
    betAmount: number,
    cashoutMultiplier?: number,
    profitLoss?: number
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('player_bets')
        .insert({
          game_id: gameId,
          wallet_address: walletAddress.toLowerCase(), // Normalize here too
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
}

// Chat API with real-time subscriptions
export class ChatAPI {
  private subscription: any = null;

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

// System API
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
      // Use proper typing for the partial system setting data
      data?.forEach((setting: SystemSettingData) => {
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