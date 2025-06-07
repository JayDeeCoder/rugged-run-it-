// hooks/useSharedState.ts - FIXED: Race condition and transfer issues
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';

export interface CustodialBalanceState {
  balance: number;
  loading: boolean;
  lastUpdated: number;
  error: string | null;
  userId: string | null;
  source: string;
}

export const useSharedCustodialBalance = (userId: string) => {
  const [state, setState] = useState<CustodialBalanceState>({
    balance: 0,
    loading: false,
    lastUpdated: 0,
    error: null,
    userId: null,
    source: 'initial'
  });

  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const isUpdatingRef = useRef<boolean>(false);
  const lastUpdateTimeRef = useRef<number>(0);
  const pendingUpdateRef = useRef<Promise<number | null> | null>(null);

  // ✅ FIXED: Single-source balance update with proper debouncing
  const updateBalance = useCallback(async (force: boolean = false): Promise<number | null> => {
    if (!userId) {
      console.log('🚫 [SHARED] No userId provided');
      return null;
    }
  
    // ✅ FIXED: Better race condition prevention
    if (isUpdatingRef.current && !force) {
      console.log('🚫 [SHARED] Update already in progress, skipping');
      return state.balance;
    }
    
    // ✅ FIXED: Reduced debounce time for new accounts
    const debounceTime = force ? 0 : 2000;
    if (!force && Date.now() - lastUpdateTimeRef.current < debounceTime) {
      console.log('🚫 [SHARED] Skipping update - too frequent');
      return state.balance;
    }
    
    isUpdatingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    console.log(`💰 [SHARED] Fetching balance for userId: ${userId} (force: ${force})`);
    
    try {
      // ✅ FIXED: Add timeout for new accounts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const url = `/api/custodial/balance/${userId}?t=${Date.now()}${force ? '&force=true' : ''}`;
      console.log(`📡 [SHARED] Fetching from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log(`📡 [SHARED] Response status: ${response.status}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('📭 [SHARED] User not found, setting balance to 0');
          setState(prev => ({ 
            ...prev, 
            balance: 0, 
            loading: false, 
            lastUpdated: Date.now(),
            userId,
            source: 'not_found'
          }));
          return 0;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`📦 [SHARED] API Response:`, data);
      
      let newBalance = 0;
      let source = 'unknown';
      
      if (data.custodialBalance !== undefined) {
        newBalance = parseFloat(data.custodialBalance) || 0;
        source = data.source || 'custodialBalance';
      } else if (data.balanceSOL !== undefined) {
        newBalance = parseFloat(data.balanceSOL) || 0;
        source = data.source || 'balanceSOL';
      } else if (data.balance !== undefined) {
        newBalance = parseFloat(data.balance) || 0;
        source = data.source || 'balance';
      } else {
        console.error('❌ [SHARED] No balance field found in response:', data);
        throw new Error('Invalid response format - no balance field found');
      }
      
      // ✅ FIXED: Prevent negative balances
      if (newBalance < 0) {
        console.warn('⚠️ [SHARED] Negative balance detected, setting to 0:', newBalance);
        newBalance = 0;
      }
      
      const oldBalance = state.balance;
      const changed = Math.abs(newBalance - oldBalance) > 0.000001;
      
      if (changed || force) {
        console.log(`💰 [SHARED] Balance update: ${oldBalance.toFixed(6)} → ${newBalance.toFixed(6)} SOL (${source})`);
      } else {
        console.log(`💰 [SHARED] Balance unchanged: ${newBalance.toFixed(6)} SOL (${source})`);
      }
      
      setState(prev => ({
        ...prev,
        balance: newBalance,
        loading: false,
        lastUpdated: Date.now(),
        error: null,
        userId,
        source
      }));
      
      lastUpdateTimeRef.current = Date.now();
      
      if (changed) {
        window.dispatchEvent(new CustomEvent('custodialBalanceUpdate', {
          detail: { 
            userId, 
            newBalance, 
            oldBalance,
            timestamp: Date.now(),
            source: `api_${source}`
          }
        }));
      }
      
      return newBalance;
      
    } catch (error) {
      console.error(`❌ [SHARED] Balance update failed for ${userId}:`, error);
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'error'
      }));
      return null;
    } finally {
      isUpdatingRef.current = false;
    }
  }, [userId, state.balance]);

  // ✅ FIXED: Simplified force refresh without interval conflicts
  const forceRefresh = useCallback(async (): Promise<number | null> => {
    if (!userId) {
      console.log('🚫 [SHARED] Cannot force refresh - no userId');
      return null;
    }
    
    console.log(`🔄 [SHARED] Force refreshing balance for ${userId}`);
    
    // ✅ FIXED: Don't clear intervals during force refresh - causes race conditions
    // if (updateIntervalRef.current) {
    //   clearInterval(updateIntervalRef.current);
    // }
    
    try {
      const result = await updateBalance(true);
      
      if (result !== null) {
        console.log(`✅ [SHARED] Force refresh successful: ${result.toFixed(6)} SOL`);
        
        // ✅ FIXED: Don't restart intervals here - let the main useEffect handle it
        // updateIntervalRef.current = setInterval(() => {
        //   if (!isUpdatingRef.current) {
        //     updateBalance();
        //   }
        // }, 15000);
      }
      
      return result;
    } catch (error) {
      console.error('❌ [SHARED] Force refresh error:', error);
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Refresh failed',
        source: 'refresh_error'
      }));
      return null;
    }
  }, [userId, updateBalance]);
  
  // ✅ FIXED: Simplified sync after cashout with single update
  const syncAfterCashout = useCallback(async (): Promise<number | null> => {
    if (!userId) {
      console.log('🚫 [SHARED] Cannot sync after cashout - no userId');
      return null;
    }
    
    console.log(`💸 [SHARED] Syncing after cashout for ${userId}`);
    
    // Single delayed force refresh
    await new Promise(resolve => setTimeout(resolve, 1500));
    return await forceRefresh();
  }, [userId, forceRefresh]);

  // ✅ FIXED: Simplified user change handling
  useEffect(() => {
    if (!userId) {
      console.log('🚫 [SHARED] No userId provided, clearing state');
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      setState({
        balance: 0,
        loading: false,
        lastUpdated: 0,
        error: null,
        userId: null,
        source: 'no_user'
      });
      return;
    }

    if (userId !== lastUserIdRef.current) {
      console.log(`🎯 [SHARED] User changed: ${lastUserIdRef.current} → ${userId}`);
      lastUserIdRef.current = userId;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        userId,
        source: 'user_changed'
      }));
      
      // Initial update with delay for new users
      setTimeout(() => {
        updateBalance(true).then(() => {
          // ✅ FIXED: Longer polling interval to reduce conflicts
          updateIntervalRef.current = setInterval(() => {
            if (!isUpdatingRef.current && !pendingUpdateRef.current) {
              updateBalance();
            }
          }, 30000); // Increased from 15s to 30s
        });
      }, 1000); // Give new users time to initialize
    }

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    };
  }, [userId, updateBalance]);

  // ✅ FIXED: Simplified socket listeners - only custodial events
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (!socket) {
      console.log('🚫 [SHARED] No socket available');
      return;
    }
    
    console.log(`🔌 [SHARED] Setting up custodial socket listeners for: ${userId}`);
    socketListenersRef.current = true;
    
    const handleCustodialBalanceUpdate = (data: any) => {
      if (data.userId === userId && data.custodialBalance !== undefined) {
        const newBalance = Math.max(0, parseFloat(data.custodialBalance) || 0);
        
        console.log(`💰 [SHARED] Socket custodial balance update: ${newBalance.toFixed(6)} SOL`);
        
        setState(prev => ({
          ...prev,
          balance: newBalance,
          lastUpdated: Date.now(),
          error: null,
          source: 'socket_update'
        }));
      }
    };

    const handleCustodialBetResult = (data: any) => {
      if (data.userId === userId && data.custodialBalance !== undefined) {
        const newBalance = Math.max(0, parseFloat(data.custodialBalance) || 0);
        
        console.log(`🎯 [SHARED] Socket bet result: ${newBalance.toFixed(6)} SOL`);
        
        setState(prev => ({
          ...prev,
          balance: newBalance,
          lastUpdated: Date.now(),
          error: null,
          source: 'socket_bet'
        }));
      }
    };

    const handleCustodialCashoutResult = (data: any) => {
      if (data.userId === userId) {
        if (data.success && data.custodialBalance !== undefined) {
          const newBalance = Math.max(0, parseFloat(data.custodialBalance) || 0);
          
          console.log(`💸 [SHARED] Socket cashout success: ${newBalance.toFixed(6)} SOL`);
          
          setState(prev => ({
            ...prev,
            balance: newBalance,
            lastUpdated: Date.now(),
            error: null,
            source: 'socket_cashout'
          }));
        }
      }
    };

    // Register only essential socket events
    socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
    socket.on('custodialBetResult', handleCustodialBetResult);
    socket.on('custodialCashOutResult', handleCustodialCashoutResult);
    
    return () => {
      console.log(`🔌 [SHARED] Cleaning up custodial socket listeners for: ${userId}`);
      socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.off('custodialBetResult', handleCustodialBetResult);
      socket.off('custodialCashOutResult', handleCustodialCashoutResult);
      socketListenersRef.current = false;
    };
  }, [userId]);

  return {
    custodialBalance: state.balance,
    loading: state.loading,
    lastUpdated: state.lastUpdated,
    error: state.error,
    source: state.source,
    updateCustodialBalance: updateBalance,
    forceRefresh,
    syncAfterCashout
  };
};

// ✅ UNCHANGED: Keep existing bet state management exactly the same
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
      ? activeBet.amount * Math.max(currentGame?.multiplier || 1.0, activeBet.entryMultiplier) * 0.95 
      : 0,
    hasActiveBet: !!activeBet,
    currentMultiplier: currentGame?.multiplier || 1.0,
    gameStatus: currentGame?.status || 'waiting',
    isConnected: !!currentGame
  };

  return gameDisplayInfo;
};