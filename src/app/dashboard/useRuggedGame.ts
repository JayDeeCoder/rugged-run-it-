// 🔧 FIXED useRuggedGame Hook - Replace your entire useRuggedGame.ts file with this:

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// 🔧 FIX: Proper TypeScript types
interface PlayerStats {
  totalWagered: string;
  totalPayout: string;
  gamesPlayed: number;
  profitLoss: string;
}

interface BetResponse {
  hash: string;
}

interface UseRuggedGameReturn {
  minBet: string;
  maxBet: string;
  houseEdge: number;
  currentGameId: number;
  playerStats: PlayerStats;
  placeBet: (amount: string) => Promise<BetResponse>;
  cashOut: (gameId: number, multiplier: number) => Promise<BetResponse>;
  deposit: (amount: string) => Promise<BetResponse>;
  refreshStats: () => Promise<void>;
  isPlacingBet: boolean;
  isCashingOut: boolean;
  isDepositing: boolean;
  isLoadingStats: boolean;
  placeBetError: string | null;
  cashOutError: string | null;
  depositError: string | null;
  statsError: string | null;
}

// Use your actual Supabase credentials
const SUPABASE_URL = 'https://ineaxxqjkryoobobxrsw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZWF4eHFqa3J5b29ib2J4cnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzMxMzIsImV4cCI6MjA2MzM0OTEzMn0.DiFLCCe5-UnzsGpG7dsqJWoUbxmaJxc_v89pxxsa1aA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function useRuggedGame(userId?: string): UseRuggedGameReturn {
  // 🔧 FIX: Proper initial state with correct types
  const [playerStats, setPlayerStats] = useState<PlayerStats>({
    totalWagered: '0.000',
    totalPayout: '0.000', 
    gamesPlayed: 0,
    profitLoss: '0.000'
  });
  
  // 🔧 FIX: Proper error state typing
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [placeBetError, setPlaceBetError] = useState<string | null>(null);
  const [cashOutError, setCashOutError] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  
  // Loading states for actions
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);

  // 🔧 REAL FUNCTION: Fetch actual stats from database
  const fetchRealStats = useCallback(async (): Promise<void> => {
    if (!userId) {
      console.log('⚠️ useRuggedGame: No userId provided');
      return;
    }

    setIsLoadingStats(true);
    setStatsError(null);

    try {
      console.log(`📊 useRuggedGame: Fetching real stats for userId: ${userId}`);

      // Get user's bets from database
      const { data: bets, error: betsError } = await supabase
        .from('player_bets')
        .select('bet_amount, profit_loss, cashout_amount, status')
        .eq('user_id', userId);

      if (betsError) {
        console.error('❌ useRuggedGame: Database error:', betsError);
        setStatsError(betsError.message);
        return;
      }

      console.log(`📊 useRuggedGame: Found ${bets?.length || 0} bets`);

      if (!bets || bets.length === 0) {
        console.log('📊 useRuggedGame: No bets found, setting zero stats');
        setPlayerStats({
          totalWagered: '0.000',
          totalPayout: '0.000',
          gamesPlayed: 0,
          profitLoss: '0.000'
        });
        return;
      }

      // Calculate real statistics
      let totalWagered = 0;
      let totalPayout = 0;
      let profitLoss = 0;
      let gamesPlayed = 0;

      bets.forEach((bet: any) => {
        gamesPlayed++;
        totalWagered += parseFloat(bet.bet_amount) || 0;
        
        // Count payouts for successful cashouts
        if ((bet.status === 'cashed_out' || bet.status === 'cashed_out_profit' || bet.status === 'cashed_out_loss') && bet.cashout_amount) {
          totalPayout += parseFloat(bet.cashout_amount) || 0;
        }
        
        // Sum profit/loss
        profitLoss += parseFloat(bet.profit_loss) || 0;
      });

      const realStats: PlayerStats = {
        totalWagered: totalWagered.toFixed(3),
        totalPayout: totalPayout.toFixed(3),
        gamesPlayed,
        profitLoss: profitLoss.toFixed(3)
      };

      console.log('📊 useRuggedGame: Real stats calculated:', realStats);
      setPlayerStats(realStats);

    } catch (error) {
      console.error('❌ useRuggedGame: Failed to fetch stats:', error);
      setStatsError(error instanceof Error ? error.message : 'Failed to fetch stats');
    } finally {
      setIsLoadingStats(false);
    }
  }, [userId]);

  // 🔧 Fetch stats when userId changes
  useEffect(() => {
    if (userId) {
      fetchRealStats();
    }
  }, [userId, fetchRealStats]);

  // 🔧 REAL BETTING FUNCTIONS - Replace with your actual implementation
  const placeBet = async (amount: string): Promise<BetResponse> => {
    setIsPlacingBet(true);
    setPlaceBetError(null);
    
    try {
      console.log('🎯 useRuggedGame: Placing real bet:', amount);
      
      // 🔧 TODO: Replace this with your actual custodial bet logic
      // For now, using the socket method from your existing code
      const socket = (window as any).gameSocket;
      
      if (!socket || !userId) {
        throw new Error('Socket not connected or user not authenticated');
      }
      
      return new Promise((resolve, reject) => {
        socket.emit('custodialBet', { userId, betAmount: parseFloat(amount) });
        
        socket.once('custodialBetResult', (data: any) => {
          if (data.success) {
            // Refresh stats after successful bet
            fetchRealStats();
            resolve({ hash: data.transactionId || 'custodial_bet_success' });
          } else {
            reject(new Error(data.reason || 'Bet failed'));
          }
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
          reject(new Error('Bet timeout'));
        }, 30000);
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bet failed';
      setPlaceBetError(errorMessage);
      console.error('❌ useRuggedGame: Bet failed:', error);
      throw error;
    } finally {
      setIsPlacingBet(false);
    }
  };

  const cashOut = async (gameId: number, multiplier: number): Promise<BetResponse> => {
    setIsCashingOut(true);
    setCashOutError(null);
    
    try {
      console.log('💸 useRuggedGame: Cashing out:', gameId, multiplier);
      
      // 🔧 TODO: Replace this with your actual custodial cashout logic
      const socket = (window as any).gameSocket;
      
      if (!socket || !userId) {
        throw new Error('Socket not connected or user not authenticated');
      }
      
      // Get user's wallet address (you might need to get this differently)
      const walletAddress = localStorage.getItem('walletAddress') || '';
      
      return new Promise((resolve, reject) => {
        socket.emit('custodialCashOut', { userId, walletAddress });
        
        socket.once('custodialCashOutResult', (data: any) => {
          if (data.success) {
            // Refresh stats after successful cashout
            fetchRealStats();
            resolve({ hash: data.transactionId || 'custodial_cashout_success' });
          } else {
            reject(new Error(data.reason || 'Cashout failed'));
          }
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
          reject(new Error('Cashout timeout'));
        }, 30000);
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Cashout failed';
      setCashOutError(errorMessage);
      console.error('❌ useRuggedGame: Cashout failed:', error);
      throw error;
    } finally {
      setIsCashingOut(false);
    }
  };

  const deposit = async (amount: string): Promise<BetResponse> => {
    setIsDepositing(true);
    setDepositError(null);
    
    try {
      console.log('💰 useRuggedGame: Depositing:', amount);
      
      // 🔧 TODO: Replace this with your actual deposit logic
      // For now, this is a placeholder
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ hash: 'deposit_placeholder_' + Date.now() });
        }, 1000);
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Deposit failed';
      setDepositError(errorMessage);
      console.error('❌ useRuggedGame: Deposit failed:', error);
      throw error;
    } finally {
      setIsDepositing(false);
    }
  };

  // 🔧 Return object with proper typing
  return {
    // Game configuration
    minBet: '0.01',
    maxBet: '10.0',
    houseEdge: 5,
    currentGameId: Date.now(), // Dynamic game ID
    
    // 🔧 REAL STATS from database (NO MORE MOCK VALUES!)
    playerStats,
    
    // Functions
    placeBet,
    cashOut,
    deposit,
    refreshStats: fetchRealStats,
    
    // Loading states
    isPlacingBet,
    isCashingOut,
    isDepositing,
    isLoadingStats,
    
    // Errors
    placeBetError,
    cashOutError,
    depositError,
    statsError
  };
}

// 🔧 Export the types for use in other components
export type { PlayerStats, UseRuggedGameReturn };