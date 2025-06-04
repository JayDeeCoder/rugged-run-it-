// hooks/useSharedState.ts
// Single file containing all shared hooks for game state management
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';

export interface CustodialBalanceState {
  balance: number;
  loading: boolean;
  lastUpdated: number;
  error: string | null;
}

export const useSharedCustodialBalance = (userId: string) => {
  const [state, setState] = useState<CustodialBalanceState>({
    balance: 0,
    loading: false,
    lastUpdated: 0,
    error: null
  });

  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const isUpdatingRef = useRef<boolean>(false);

  // Stable update function
  const updateBalance = useCallback(async (force: boolean = false) => {
    if (!userId || (isUpdatingRef.current && !force)) return;
    
    isUpdatingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      console.log(`🔄 Fetching custodial balance for user ${userId}...`);
      
      const response = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`👤 User ${userId} not found - balance remains 0`);
          setState(prev => ({ 
            ...prev, 
            balance: 0, 
            loading: false, 
            lastUpdated: Date.now() 
          }));
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 New Custodial balance updated: ${newBalance.toFixed(3)} SOL`);
        
        setState(prev => ({
          ...prev,
          balance: newBalance,
          loading: false,
          lastUpdated: Date.now(),
          error: null
        }));
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('❌ Failed to fetch custodial balance:', error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }));
    } finally {
      isUpdatingRef.current = false;
    }
  }, [userId]);

  // Force refresh with enhanced error handling
  const forceRefresh = useCallback(async () => {
    if (!userId) return;
    console.log(`🔄 Force refreshing custodial balance for ${userId}...`);
    
    try {
      // Try POST with refresh action first
      const postResponse = await fetch(`/api/custodial/balance/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', timestamp: Date.now() })
      });
      
      if (postResponse.ok) {
        const data = await postResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          console.log(`💰 Force refresh (POST): ${newBalance.toFixed(6)} SOL`);
          
          setState(prev => ({
            ...prev,
            balance: newBalance,
            lastUpdated: Date.now(),
            error: null
          }));
          return;
        }
      }
      
      // Fallback to regular update
      await updateBalance(true);
      
    } catch (error) {
      console.error('❌ Force refresh error:', error);
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Refresh failed' 
      }));
    }
  }, [userId, updateBalance]);

  // Setup polling
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 Setting up custodial balance polling for user: ${userId}`);
      lastUserIdRef.current = userId;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      updateBalance();
      
      updateIntervalRef.current = setInterval(() => {
        if (!isUpdatingRef.current) {
          updateBalance();
        }
      }, 15000);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [userId, updateBalance]);

  // Enhanced socket listeners
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up SHARED custodial balance listeners for user: ${userId}`);
      socketListenersRef.current = true;
      
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 SHARED REAL-TIME: Custodial balance update - ${data.custodialBalance?.toFixed(6)} SOL`);
          
          setState(prev => ({
            ...prev,
            balance: parseFloat(data.custodialBalance) || 0,
            lastUpdated: Date.now(),
            error: null
          }));
          
          if (data.updateType === 'deposit_processed') {
            toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL`);
          } else if (data.updateType === 'bet_placed') {
            toast(`Bet placed: -${data.change?.toFixed(3)} SOL`, { icon: '🎯' });
          } else if (data.updateType === 'cashout_processed') {
            toast.success(`Cashout: +${data.change?.toFixed(3)} SOL`);
          }
        }
      };

      const handleUserBalanceUpdate = (data: any) => {
        if (data.userId === userId && data.balanceType === 'custodial') {
          console.log(`💰 SHARED REAL-TIME: User balance update - ${data.newBalance?.toFixed(6)} SOL`);
          
          setState(prev => ({
            ...prev,
            balance: parseFloat(data.newBalance) || 0,
            lastUpdated: Date.now(),
            error: null
          }));
          
          if (data.transactionType === 'deposit') {
            toast.success(`Deposit: +${data.change?.toFixed(3)} SOL`);
          }
        }
      };

      const handleDepositConfirmation = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 SHARED REAL-TIME: Deposit confirmed for ${userId}, amount: ${data.depositAmount}`);
          
          setState(prev => ({
            ...prev,
            balance: prev.balance + (parseFloat(data.depositAmount) || 0),
            lastUpdated: Date.now(),
            error: null
          }));
          
          setTimeout(forceRefresh, 1500);
          toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL!`);
        }
      };

      const handleCustodialBetResult = (data: any) => {
        if (data.userId === userId) {
          console.log(`🎯 SHARED REAL-TIME: Custodial bet result for ${userId}`);
          
          if (data.success && data.custodialBalance !== undefined) {
            setState(prev => ({
              ...prev,
              balance: parseFloat(data.custodialBalance) || 0,
              lastUpdated: Date.now(),
              error: null
            }));
          } else {
            setTimeout(() => forceRefresh(), 1000);
          }
        }
      };

      const handleCustodialCashoutResult = (data: any) => {
        if (data.userId === userId) {
          console.log(`💸 SHARED REAL-TIME: Custodial cashout result for ${userId}`);
          
          if (data.success && data.custodialBalance !== undefined) {
            setState(prev => ({
              ...prev,
              balance: parseFloat(data.custodialBalance) || 0,
              lastUpdated: Date.now(),
              error: null
            }));
            
            if (data.payout) {
              toast.success(`Cashout: +${data.payout?.toFixed(3)} SOL`);
            }
          } else {
            setTimeout(() => forceRefresh(), 1000);
          }
        }
      };
      
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('userBalanceUpdate', handleUserBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      socket.on('custodialBetResult', handleCustodialBetResult);
      socket.on('custodialCashOutResult', handleCustodialCashoutResult);
      
      return () => {
        console.log(`🔌 Cleaning up SHARED custodial balance listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('userBalanceUpdate', handleUserBalanceUpdate);
        socket.off('depositConfirmed', handleDepositConfirmation);
        socket.off('custodialBetResult', handleCustodialBetResult);
        socket.off('custodialCashOutResult', handleCustodialCashoutResult);
        socketListenersRef.current = false;
      };
    }
  }, [userId, forceRefresh]);

  return {
    custodialBalance: state.balance,
    loading: state.loading,
    lastUpdated: state.lastUpdated,
    error: state.error,
    updateCustodialBalance: updateBalance,
    forceRefresh
  };
};

// Shared bet state management
export interface ActiveBet {
  id: string;
  amount: number;
  entryMultiplier: number;
  timestamp: number;
  gameId: string;
  transactionId?: string;
  tokenType?: 'SOL' | 'RUGGED';
  userId?: string;
}

export interface BetState {
  activeBet: ActiveBet | null;
  isPlacingBet: boolean;
  isCashingOut: boolean;
  lastGameNumber: number;
}

// Global bet state management
let globalBetState: BetState = {
  activeBet: null,
  isPlacingBet: false,
  isCashingOut: false,
  lastGameNumber: 0
};

type BetStateListener = (state: BetState) => void;
const betStateListeners: Set<BetStateListener> = new Set();

const updateGlobalBetState = (updates: Partial<BetState>) => {
  globalBetState = { ...globalBetState, ...updates };
  betStateListeners.forEach(listener => listener(globalBetState));
};

export const useSharedBetState = () => {
  const [state, setState] = useState<BetState>(globalBetState);

  useEffect(() => {
    const listener: BetStateListener = (newState) => {
      setState(newState);
    };
    
    betStateListeners.add(listener);
    
    return () => {
      betStateListeners.delete(listener);
    };
  }, []);

  const setActiveBet = useCallback((bet: ActiveBet | null) => {
    console.log('🎯 Setting active bet:', bet);
    updateGlobalBetState({ activeBet: bet });
  }, []);

  const setIsPlacingBet = useCallback((placing: boolean) => {
    console.log('🎯 Setting placing bet:', placing);
    updateGlobalBetState({ isPlacingBet: placing });
  }, []);

  const setIsCashingOut = useCallback((cashing: boolean) => {
    console.log('💸 Setting cashing out:', cashing);
    updateGlobalBetState({ isCashingOut: cashing });
  }, []);

  const setLastGameNumber = useCallback((gameNumber: number) => {
    updateGlobalBetState({ lastGameNumber: gameNumber });
  }, []);

  const clearActiveBet = useCallback(() => {
    console.log('🗑️ Clearing active bet');
    updateGlobalBetState({ 
      activeBet: null, 
      isPlacingBet: false, 
      isCashingOut: false 
    });
  }, []);

  const resetBetState = useCallback(() => {
    console.log('🔄 Resetting bet state for new game');
    updateGlobalBetState({ 
      activeBet: null, 
      isPlacingBet: false, 
      isCashingOut: false 
    });
  }, []);

  return {
    ...state,
    setActiveBet,
    setIsPlacingBet,
    setIsCashingOut,
    setLastGameNumber,
    clearActiveBet,
    resetBetState
  };
};

// Shared game display information
export interface GameDisplayInfo {
  custodialBalance: number;
  userBetAmount: number;
  betEntryMultiplier: number;
  potentialPayout: number;
  hasActiveBet: boolean;
  currentMultiplier: number;
  gameStatus: string;
  isConnected: boolean;
}

export const useSharedGameState = (
  currentGame: any,
  userId: string
): GameDisplayInfo => {
  const { custodialBalance } = useSharedCustodialBalance(userId);
  const { activeBet } = useSharedBetState();

  const gameDisplayInfo: GameDisplayInfo = {
    custodialBalance,
    userBetAmount: activeBet?.amount || 0,
    betEntryMultiplier: activeBet?.entryMultiplier || 1.0,
    potentialPayout: activeBet 
      ? activeBet.amount * Math.max(currentGame?.multiplier || 1.0, activeBet.entryMultiplier) * 0.6 
      : 0,
    hasActiveBet: !!activeBet,
    currentMultiplier: currentGame?.multiplier || 1.0,
    gameStatus: currentGame?.status || 'waiting',
    isConnected: !!currentGame
  };

  return gameDisplayInfo;
};