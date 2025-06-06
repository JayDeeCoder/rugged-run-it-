// hooks/useSharedState.ts - FIXED TYPESCRIPT VERSION
// Single file containing all shared hooks for game state management
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';

export interface CustodialBalanceState {
  balance: number;
  loading: boolean;
  lastUpdated: number;
  error: string | null;
}

// Add this variable at the top of useSharedCustodialBalance
let lastUpdateTime = 0;
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
  const lastUpdateTimeRef = useRef<number>(0); // ✅ FIXED: Proper ref declaration

  // ✅ SIMPLIFIED: Clean update function without complex logic
  const updateBalance = useCallback(async (force: boolean = false): Promise<number | null> => {
    if (!userId || (isUpdatingRef.current && !force)) return null;
    
    // ✅ FIXED: Use ref for lastUpdateTime
    if (!force && Date.now() - lastUpdateTimeRef.current < 2000) {
      console.log('🚫 [SHARED] Skipping update - too frequent');
      return state.balance;
    }
    
    isUpdatingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const url = `/api/custodial/balance/${userId}?t=${Date.now()}&force=${force}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          setState(prev => ({ 
            ...prev, 
            balance: 0, 
            loading: false, 
            lastUpdated: Date.now() 
          }));
          return 0;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        
        // ✅ SIMPLIFIED: Basic validation only
        if (newBalance < 0) {
          console.warn('⚠️ [SHARED] Negative balance detected:', newBalance);
        }
        
        console.log(`💰 [SHARED] Balance: ${state.balance.toFixed(6)} → ${newBalance.toFixed(6)} SOL`);
        
        setState(prev => ({
          ...prev,
          balance: newBalance,
          loading: false,
          lastUpdated: Date.now(),
          error: null
        }));
        
        lastUpdateTimeRef.current = Date.now(); // ✅ FIXED: Use ref
        return newBalance;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error(`❌ [SHARED] Balance update failed:`, error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }));
      return null;
    } finally {
      isUpdatingRef.current = false;
    }
  }, [userId, state.balance]);  

  // 🔥 FIXED: Force refresh with proper TypeScript return types
// ✅ SIMPLIFIED: Clean force refresh
const forceRefresh = useCallback(async (): Promise<number | null> => {
  if (!userId) return null;
  console.log(`🔄 [SHARED] Force refreshing balance for ${userId}`);
  
  try {
    const result = await updateBalance(true);
    
    if (result !== null) {
      // Emit custom event for other components
      window.dispatchEvent(new CustomEvent('custodialBalanceUpdate', {
        detail: { 
          userId, 
          newBalance: result, 
          timestamp: Date.now(),
          source: 'forceRefresh'
        }
      }));
    }
    
    return result;
  } catch (error) {
    console.error('❌ [SHARED] Force refresh error:', error);
    setState(prev => ({ 
      ...prev, 
      error: error instanceof Error ? error.message : 'Refresh failed' 
    }));
    return null;
  }
}, [userId, updateBalance]);

  // 🔥 FIXED: Add immediate balance sync for cashouts with proper return type
 // ✅ REPLACE the complex syncAfterCashout with this SIMPLE version:
const syncAfterCashout = useCallback(async (): Promise<number | null> => {
  if (!userId) return null;
  
  console.log(`💸 [SHARED] Syncing after cashout for ${userId}`);
  
  // Wait a moment for backend to process
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return forceRefresh();
}, [userId, forceRefresh]);

  // Setup polling
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 [SHARED] Setting up polling for user: ${userId}`);
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

  // 🔥 ENHANCED: Custom event listeners for cross-component communication

// ✅ REPLACE the entire "Enhanced socket listeners" useEffect with this SIMPLIFIED version:

useEffect(() => {
  if (!userId || socketListenersRef.current) return;
  
  const socket = (window as any).gameSocket;
  if (!socket) return;
  
  console.log(`🔌 [SHARED] Setting up socket listeners for: ${userId}`);
  socketListenersRef.current = true;
  
  // ✅ SIMPLIFIED: Only essential events, no complex logic
  const handleCustodialBalanceUpdate = (data: any) => {
    if (data.userId === userId) {
      console.log(`💰 [SHARED] Socket balance update:`, data.custodialBalance);
      
      setState(prev => ({
        ...prev,
        balance: parseFloat(data.custodialBalance) || 0,
        lastUpdated: Date.now(),
        error: null
      }));
    }
  };

  const handleCustodialCashoutResult = (data: any) => {
    if (data.userId === userId) {
      console.log(`💸 [SHARED] Cashout result:`, data);
      
      if (data.success && data.custodialBalance !== undefined) {
        setState(prev => ({
          ...prev,
          balance: parseFloat(data.custodialBalance) || 0,
          lastUpdated: Date.now(),
          error: null
        }));
      } else {
        // Simple refresh after failed cashout
        setTimeout(() => forceRefresh(), 1000);
      }
    }
  };

  // ✅ SIMPLIFIED: Only register essential events
  socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
  socket.on('custodialCashOutResult', handleCustodialCashoutResult);
  
  return () => {
    console.log(`🔌 [SHARED] Cleaning up socket listeners for: ${userId}`);
    socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
    socket.off('custodialCashOutResult', handleCustodialCashoutResult);
    socketListenersRef.current = false;
  };
}, [userId, forceRefresh]);

  return {
    custodialBalance: state.balance,
    loading: state.loading,
    lastUpdated: state.lastUpdated,
    error: state.error,
    updateCustodialBalance: updateBalance,
    forceRefresh,
    syncAfterCashout // 🔥 NEW: Export the cashout sync function
  };
};

// Rest of the shared state code remains the same...
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