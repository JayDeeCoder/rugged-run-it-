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
  const retryCountRef = useRef<number>(0);

  // 🔥 FIXED: Stable update function with proper TypeScript return types
  const updateBalance = useCallback(async (force: boolean = false, retryCount: number = 0): Promise<number | null> => {
    if (!userId || (isUpdatingRef.current && !force)) return null;
    
    // 🔥 NEW: Prevent rapid conflicting updates
    if (!force && Date.now() - lastUpdateTime < 2000) {
      console.log('🚫 [SHARED] Skipping update - too frequent');
      return state.balance;
    }
    
    isUpdatingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const url = `/api/custodial/balance/${userId}?t=${Date.now()}&force=${force}&retry=${retryCount}`;
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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        
        // 🔥 NEW: Validate balance makes sense
        if (newBalance < 0 || newBalance > 1000) {
          console.warn('⚠️ [SHARED] Suspicious balance value:', newBalance);
          if (!force) {
            isUpdatingRef.current = false;
            return state.balance; // Keep current balance if suspicious
          }
        }
        
        const prevBalance = state.balance;
        console.log(`💰 [SHARED] Balance update: ${prevBalance.toFixed(6)} → ${newBalance.toFixed(6)} SOL`);
        
        setState(prev => ({
          ...prev,
          balance: newBalance,
          loading: false,
          lastUpdated: Date.now(),
          error: null
        }));
        
        lastUpdateTime = Date.now(); // Track update time
        
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
  
  // Add this variable at the top of useSharedCustodialBalance
  let lastUpdateTime = 0;

  // 🔥 FIXED: Force refresh with proper TypeScript return types
  const forceRefresh = useCallback(async (): Promise<number | null> => {
    if (!userId) return null;
    console.log(`🔄 [SHARED] Force refreshing custodial balance for ${userId}...`);
    
    try {
      // Strategy 1: Try POST refresh endpoint
      console.log(`📡 [SHARED] Strategy 1: POST refresh endpoint`);
      const postResponse = await fetch(`/api/custodial/balance/${userId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ 
          action: 'refresh', 
          timestamp: Date.now(),
          source: 'forceRefresh'
        })
      });
      
      if (postResponse.ok) {
        const data = await postResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          console.log(`💰 [SHARED] Force refresh (POST): ${newBalance.toFixed(6)} SOL`);
          
          setState(prev => ({
            ...prev,
            balance: newBalance,
            lastUpdated: Date.now(),
            error: null
          }));
          
          // Emit custom event
          window.dispatchEvent(new CustomEvent('custodialBalanceUpdate', {
            detail: { 
              userId, 
              newBalance, 
              timestamp: Date.now(),
              source: 'forceRefresh-POST'
            }
          }));
          
          return newBalance;
        }
      }
      
      // Strategy 2: Force GET with retry
      console.log(`📡 [SHARED] Strategy 2: Force GET with retry`);
      const result = await updateBalance(true, 0);
      
      // Strategy 3: If still no result, try direct socket emission
      if (result === null) { // 🔥 FIXED: Check for null instead of undefined
        console.log(`📡 [SHARED] Strategy 3: Socket emission for balance refresh`);
        const socket = (window as any).gameSocket;
        if (socket) {
          socket.emit('refreshUserBalance', { userId, timestamp: Date.now() });
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ [SHARED] Force refresh error:', error);
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Refresh failed' 
      }));
      return null; // 🔥 FIXED: Return null instead of throwing
    }
  }, [userId, updateBalance]);

  // 🔥 FIXED: Add immediate balance sync for cashouts with proper return type
  const syncAfterCashout = useCallback(async (expectedIncrease?: number): Promise<number | null> => {
    if (!userId) return null;
    
    console.log(`💸 [SHARED] Syncing balance after cashout... Expected increase: ${expectedIncrease || 'unknown'}`);
    
    const startBalance = state.balance;
    let attempts = 0;
    const maxAttempts = 5;
    const baseDelay = 200;
    
    const attemptSync = async (): Promise<number | null> => {
      attempts++;
      console.log(`💸 [SHARED] Cashout sync attempt ${attempts}/${maxAttempts}`);
      
      try {
        const result = await updateBalance(true, 0);
        
        if (result !== null) { // 🔥 FIXED: Check for null instead of undefined
          const increase = result - startBalance;
          console.log(`💸 [SHARED] Balance sync result: ${startBalance.toFixed(3)} → ${result.toFixed(3)} (+${increase.toFixed(3)})`);
          
          // If we got an increase or reached max attempts, consider it done
          if (increase > 0 || attempts >= maxAttempts) {
            return result;
          }
        }
        
        // If no increase detected and we have attempts left, try again
        if (attempts < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempts - 1); // Exponential backoff
          console.log(`💸 [SHARED] No balance increase detected, retrying in ${delay}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return attemptSync();
        }
        
        return result;
        
      } catch (error) {
        console.error(`❌ [SHARED] Cashout sync attempt ${attempts} failed:`, error);
        
        if (attempts < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempts - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          return attemptSync();
        }
        
        return null; // 🔥 FIXED: Return null instead of throwing
      }
    };
    
    return attemptSync();
  }, [userId, updateBalance, state.balance]);

  // Setup polling
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 [SHARED] Setting up custodial balance polling for user: ${userId}`);
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
  useEffect(() => {
    const handleCustomBalanceUpdate = (event: CustomEvent) => {
      if (event.detail.userId === userId) {
        console.log(`🔄 [SHARED] Custom balance update event received:`, event.detail);
        
        if (event.detail.newBalance !== undefined) {
          setState(prev => ({
            ...prev,
            balance: parseFloat(event.detail.newBalance) || 0,
            lastUpdated: Date.now(),
            error: null
          }));
        } else {
          // Trigger refresh if no balance provided
          setTimeout(() => forceRefresh(), 100);
        }
      }
    };

    const handleForceRefresh = (event: CustomEvent) => {
      if (event.detail.userId === userId) {
        console.log(`🔄 [SHARED] Force refresh event received:`, event.detail);
        setTimeout(() => forceRefresh(), 100);
      }
    };

    const handleCashoutSync = (event: CustomEvent) => {
      if (event.detail.userId === userId) {
        console.log(`💸 [SHARED] Cashout sync event received:`, event.detail);
        setTimeout(() => syncAfterCashout(event.detail.expectedIncrease), 100);
      }
    };

    window.addEventListener('custodialBalanceUpdate', handleCustomBalanceUpdate as EventListener);
    window.addEventListener('forceBalanceRefresh', handleForceRefresh as EventListener);
    window.addEventListener('syncAfterCashout', handleCashoutSync as EventListener);
    
    return () => {
      window.removeEventListener('custodialBalanceUpdate', handleCustomBalanceUpdate as EventListener);
      window.removeEventListener('forceBalanceRefresh', handleForceRefresh as EventListener);
      window.removeEventListener('syncAfterCashout', handleCashoutSync as EventListener);
    };
  }, [userId, forceRefresh, syncAfterCashout]);

  // Enhanced socket listeners
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 [SHARED] Setting up custodial balance listeners for user: ${userId}`);
      socketListenersRef.current = true;
      
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 [SHARED] REAL-TIME: Custodial balance update - ${data.custodialBalance?.toFixed(6)} SOL`);
          
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

      // 🔥 ENHANCED: Better cashout result handling
      const handleCustodialCashoutResult = (data: any) => {
        if (data.userId === userId) {
          console.log(`💸 [SHARED] REAL-TIME: Custodial cashout result for ${userId}:`, data);
          
          if (data.success) {
            if (data.custodialBalance !== undefined) {
              setState(prev => ({
                ...prev,
                balance: parseFloat(data.custodialBalance) || 0,
                lastUpdated: Date.now(),
                error: null
              }));
            } else {
              // If no balance in response, force refresh
              console.log(`💸 [SHARED] No balance in cashout result, forcing refresh...`);
              setTimeout(() => forceRefresh(), 500);
            }
            
            if (data.payout) {
              toast.success(`Cashout: +${data.payout?.toFixed(3)} SOL`);
            }
          } else {
            console.log(`💸 [SHARED] Cashout failed, forcing balance refresh...`);
            setTimeout(() => forceRefresh(), 1000);
          }
        }
      };

      const handleUserBalanceUpdate = (data: any) => {
        if (data.userId === userId && data.balanceType === 'custodial') {
          console.log(`💰 [SHARED] REAL-TIME: User balance update - ${data.newBalance?.toFixed(6)} SOL`);
          
          setState(prev => ({
            ...prev,
            balance: parseFloat(data.newBalance) || 0,
            lastUpdated: Date.now(),
            error: null
          }));
        }
      };

      const handleDepositConfirmation = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 [SHARED] REAL-TIME: Deposit confirmed for ${userId}, amount: ${data.depositAmount}`);
          
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
          console.log(`🎯 [SHARED] REAL-TIME: Custodial bet result for ${userId}`);
          
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

      // 🔥 NEW: Balance refresh response handler
      const handleBalanceRefreshResponse = (data: any) => {
        if (data.userId === userId) {
          console.log(`🔄 [SHARED] REAL-TIME: Balance refresh response:`, data);
          
          if (data.success && data.custodialBalance !== undefined) {
            setState(prev => ({
              ...prev,
              balance: parseFloat(data.custodialBalance) || 0,
              lastUpdated: Date.now(),
              error: null
            }));
          }
        }
      };
      
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('userBalanceUpdate', handleUserBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      socket.on('custodialBetResult', handleCustodialBetResult);
      socket.on('custodialCashOutResult', handleCustodialCashoutResult);
      socket.on('balanceRefreshResponse', handleBalanceRefreshResponse);
      
      return () => {
        console.log(`🔌 [SHARED] Cleaning up custodial balance listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('userBalanceUpdate', handleUserBalanceUpdate);
        socket.off('depositConfirmed', handleDepositConfirmation);
        socket.off('custodialBetResult', handleCustodialBetResult);
        socket.off('custodialCashOutResult', handleCustodialCashoutResult);
        socket.off('balanceRefreshResponse', handleBalanceRefreshResponse);
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