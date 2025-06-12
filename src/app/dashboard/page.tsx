// src/app/dashboard/page.tsx - FIXED with Better Game State Coordination
'use client';

import { FC, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useSolanaWallets, usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import Layout from '../../components/layout/Layout';
import Link from 'next/link';
import { UserContext } from '../../context/UserContext';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';
import { Wallet, TrendingUp, GamepadIcon, RefreshCw, Zap, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import ReferralSection from '../../components/ReferralSection';
import { sharedSocket } from '../../services/sharedSocket';

// Supabase config with fallback
const FALLBACK_SUPABASE_URL = 'https://ineaxxqjkryoobobxrsw.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZWF4eHFqa3J5b29ib2J4cnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzMxMzIsImV4cCI6MjA2MzM0OTEzMn0.DiFLCCe5-UnzsGpG7dsqJWoUbxmaJxc_v89pxxsa1aA';

let supabaseClient: any = null;
const getSupabaseClient = () => {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
    
    console.log('🔧 Dashboard: Supabase initialization');
    
    try {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      console.log('✅ Dashboard: Supabase client created successfully');
      
      supabaseClient.from('player_bets').select('count').limit(1)
        .then(() => console.log('✅ Dashboard: Supabase connection test passed'))
        .catch((err: any) => console.warn('⚠️ Dashboard: Supabase test query failed:', err.message));
        
    } catch (error) {
      console.error('❌ Dashboard: Failed to create Supabase client:', error);
      throw error;
    }
  }
  return supabaseClient;
};

// 🚀 NEW: Lightweight socket connection - doesn't interfere with game state
const useSocketConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // 🚀 NEW: Signal page activity without cleaning game state
  const signalPageActivity = useCallback(() => {
    if (sharedSocket.isConnected()) {
      console.log('📍 Dashboard: Signaling page activity (non-destructive)');
      sharedSocket.emit('pageActivity', { 
        page: 'dashboard',
        action: 'active',
        timestamp: Date.now()
      });
    }
  }, []);

  // 🚀 NEW: Signal page inactive without destroying game state
  const signalPageInactive = useCallback(() => {
    if (sharedSocket.isConnected()) {
      console.log('📍 Dashboard: Signaling page inactive (preserving game state)');
      sharedSocket.emit('pageActivity', { 
        page: 'dashboard',
        action: 'inactive',
        timestamp: Date.now()
      });
    }
  }, []);

  useEffect(() => {
    // Monitor shared socket connection status
    const interval = setInterval(() => {
      const connected = sharedSocket.isConnected();
      if (connected !== isConnected) {
        setIsConnected(connected);
        console.log(`🔌 Dashboard: Connection status changed: ${connected}`);
        
        if (connected) {
          setError(null);
          setConnectionAttempts(0);
          signalPageActivity();
        }
      }
    }, 2000);

    // Initial signal
    signalPageActivity();

    return () => {
      clearInterval(interval);
      signalPageInactive();
    };
  }, [isConnected, signalPageActivity, signalPageInactive]);

  // 🚀 NEW: Handle page visibility changes (don't destroy game state)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('👁️ Dashboard: Page hidden - signaling inactive');
        signalPageInactive();
      } else {
        console.log('👁️ Dashboard: Page visible - signaling active');
        signalPageActivity();
      }
    };

    const handleBeforeUnload = () => {
      console.log('🚪 Dashboard: Page unloading - final inactive signal');
      signalPageInactive();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      signalPageInactive();
    };
  }, [signalPageActivity, signalPageInactive]);

  return { 
    isConnected, 
    connectionAttempts, 
    error,
    signalPageActivity,
    signalPageInactive
  };
};

interface PlayerBet {
  bet_amount: number;
  profit_loss: number;
  cashout_amount?: number;
  cashout_multiplier?: number;
  status: string;
}

// 🚀 NEW: Improved custodial balance hook that doesn't interfere with game events
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get socket connection status
  const { isConnected } = useSocketConnection();

  const updateCustodialBalance = useCallback(async (skipDebounce = false) => {
    if (!userId) return;
    
    if (loading) return;
    
    const timeSinceLastUpdate = Date.now() - lastUpdated;
    if (!skipDebounce && timeSinceLastUpdate < 5000) {
      console.log(`⏭️ Dashboard: Skipping custodial balance update, last updated ${timeSinceLastUpdate}ms ago`);
      return;
    }
    
    setLoading(true);
    try {
      console.log(`🔄 Dashboard: Fetching custodial balance for user ${userId}...`);
      
      const response = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`👤 Dashboard: User ${userId} not found - balance remains 0`);
          setCustodialBalance(0);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        
        setCustodialBalance(prevBalance => {
          if (Math.abs(prevBalance - newBalance) > 0.000001) {
            console.log(`💰 Dashboard: Custodial balance updated: ${prevBalance.toFixed(6)} → ${newBalance.toFixed(6)} SOL`);
            setLastUpdated(Date.now());
            return newBalance;
          }
          return prevBalance;
        });
      }
    } catch (error) {
      console.error('❌ Dashboard: Failed to fetch custodial balance:', error);
    } finally {
      setTimeout(() => setLoading(false), 100);
    }
  }, [userId, loading, lastUpdated]);

  const forceRefresh = useCallback(async () => {
    if (!userId) return;
    
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    console.log(`🔄 Dashboard: Force refresh custodial balance for ${userId}...`);
    await updateCustodialBalance(true);
  }, [userId, updateCustodialBalance]);
  
  // Setup polling
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 Dashboard: Setting up custodial balance polling for user: ${userId}`);
      lastUserIdRef.current = userId;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      updateCustodialBalance(true);
      
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateCustodialBalance();
        }
      }, 60000);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [userId, updateCustodialBalance, loading]);
   
  // 🚀 NEW: NON-DESTRUCTIVE socket listeners - only listen to relevant events
  useEffect(() => {
    if (!userId || !isConnected || socketListenersRef.current) return;
    
    console.log(`🔌 Dashboard: Setting up NON-DESTRUCTIVE balance listeners for user: ${userId}`);
    socketListenersRef.current = true;
    
    const handleCustodialBalanceUpdate = (data: any) => {
      if (data.userId === userId) {
        console.log(`💰 Dashboard REAL-TIME: Custodial balance update - ${data.custodialBalance?.toFixed(6)} SOL`);
        
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
        
        debounceTimeoutRef.current = setTimeout(() => {
          setCustodialBalance(parseFloat(data.custodialBalance) || 0);
          setLastUpdated(Date.now());
          
          if (data.updateType === 'deposit_processed') {
            toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL`);
          } else if (data.updateType === 'cashout_processed') {
            toast.success(`Cashout: +${data.change?.toFixed(3)} SOL`);
          }
        }, 1000);
      }
    };

    const handleUserBalanceUpdate = (data: any) => {
      if (data.userId === userId && data.balanceType === 'custodial') {
        console.log(`💰 Dashboard REAL-TIME: User balance update - ${data.newBalance?.toFixed(6)} SOL`);
        
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
        
        debounceTimeoutRef.current = setTimeout(() => {
          setCustodialBalance(parseFloat(data.newBalance) || 0);
          setLastUpdated(Date.now());
        }, 1000);
      }
    };

    const handleDepositConfirmation = (data: any) => {
      if (data.userId === userId) {
        console.log(`💰 Dashboard REAL-TIME: Deposit confirmed for ${userId}`);
        
        setCustodialBalance(prev => prev + (parseFloat(data.depositAmount) || 0));
        setLastUpdated(Date.now());
        
        setTimeout(() => {
          updateCustodialBalance(true);
        }, 3000);
        
        toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL!`);
      }
    };

    // 🚀 NEW: DON'T listen to game events - let main component handle them
    // Only listen to balance/financial events that are relevant to dashboard

    // Use shared socket to listen for events
    sharedSocket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
    sharedSocket.on('userBalanceUpdate', handleUserBalanceUpdate);
    sharedSocket.on('depositConfirmed', handleDepositConfirmation);
    
    return () => {
      console.log(`🔌 Dashboard: Cleaning up NON-DESTRUCTIVE balance listeners for user: ${userId}`);
      sharedSocket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      sharedSocket.off('userBalanceUpdate', handleUserBalanceUpdate);
      sharedSocket.off('depositConfirmed', handleDepositConfirmation);
      socketListenersRef.current = false;
      
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [userId, isConnected, updateCustodialBalance]);

  return { 
    custodialBalance, 
    loading, 
    lastUpdated, 
    updateCustodialBalance, 
    forceRefresh,
    isConnected 
  };
};

const Dashboard: FC = () => {
  // Privy hooks
  const { wallets } = useSolanaWallets();
  const { authenticated, ready, user } = usePrivy();
  const router = useRouter();
  
  // User context
  const { currentUser, experience, userLevel, crates } = useContext(UserContext);
  
  // User ID state for custodial operations
  const [userId, setUserId] = useState<string | null>(null);
  
  // Get the embedded wallet (most reliable for Privy)
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const activeWallet = embeddedWallet || wallets[0] || null;
  const isConnected = authenticated && activeWallet !== null;
  const walletAddress = activeWallet?.address || '';
  
  // Validate wallet address
  const isValidWallet = isConnected && isValidSolanaAddress(walletAddress);

  // 🚀 NEW: Use improved socket connection hook
  const { 
    isConnected: socketConnected, 
    connectionAttempts, 
    error: socketError,
    signalPageActivity
  } = useSocketConnection();
  
  const { 
    custodialBalance, 
    loading: custodialBalanceLoading, 
    updateCustodialBalance, 
    forceRefresh: refreshCustodialBalance,
    lastUpdated: custodialLastUpdated,
    isConnected: isSocketConnected
  } = useCustodialBalance(userId || '');
  
  // Supabase client
  const supabase = getSupabaseClient();
  
  // State
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [userStats, setUserStats] = useState({
    totalWagered: 0,
    totalPayouts: 0,
    gamesPlayed: 0,
    profitLoss: 0
  });

  const [levelData, setLevelData] = useState({
    level: 1,
    experience: 0,
    experiencePoints: 0,
    experienceToNextLevel: 100,
    progressPercentage: 0
  });
  const [isLoadingLevel, setIsLoadingLevel] = useState(false);

  const [enhancedUserStats, setEnhancedUserStats] = useState({
    winRate: 0,
    bestMultiplier: 0,
    currentWinStreak: 0,
    bestWinStreak: 0
  });
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState<boolean>(false);
  
  const [statsLastUpdated, setStatsLastUpdated] = useState<number>(0);
  const [isStatsUpdating, setIsStatsUpdating] = useState<boolean>(false);
  
  // Real-time connection status tracking
  const [realTimeStatus, setRealTimeStatus] = useState({
    connected: false,
    lastHeartbeat: 0,
    reconnectAttempts: 0,
    error: null as string | null
  });
  
  // Initialization ref for user setup
  const initializationRef = useRef<{ 
    attempted: boolean; 
    completed: boolean; 
    lastWallet: string;
    lastUserId: string;
  }>({ 
    attempted: false, 
    completed: false, 
    lastWallet: '',
    lastUserId: ''
  });

  // Update real-time status based on socket connection
  useEffect(() => {
    setRealTimeStatus(prev => ({
      ...prev,
      connected: socketConnected,
      lastHeartbeat: socketConnected ? Date.now() : prev.lastHeartbeat,
      reconnectAttempts: connectionAttempts,
      error: socketError
    }));
  }, [socketConnected, connectionAttempts, socketError]);

  // User initialization
  useEffect(() => {
    if (!authenticated || !walletAddress) {
      return;
    }
    
    if (initializationRef.current.completed && 
        initializationRef.current.lastWallet === walletAddress &&
        initializationRef.current.lastUserId === (userId || '')) {
      return;
    }
    
    if (initializationRef.current.attempted && 
        initializationRef.current.lastWallet === walletAddress) {
      return;
    }
    
    console.log(`🔗 Dashboard: Starting user initialization for wallet: ${walletAddress}`);
    initializationRef.current.attempted = true;
    initializationRef.current.lastWallet = walletAddress;
    
    const initUser = async () => {
      try {
        console.log(`📡 Dashboard: Getting user data for wallet: ${walletAddress}`);
        const userData = await UserAPI.getUserOrCreate(walletAddress);
        
        if (userData) {
          setUserId(userData.id);
          initializationRef.current.lastUserId = userData.id;
          console.log(`👤 Dashboard: User ID set: ${userData.id}`);
          initializationRef.current.completed = true;
          
          // Signal user activity without interfering with game state
          if (socketConnected) {
            console.log(`📡 Dashboard: Signaling user activity...`);
            signalPageActivity();
          }
        }
      } catch (error) {
        console.error('❌ Dashboard: Could not initialize user:', error);
        toast.error('Failed to initialize wallet');
        initializationRef.current.attempted = false;
        initializationRef.current.completed = false;
      }
    };
    
    initUser();
  }, [authenticated, walletAddress, socketConnected, signalPageActivity]);

  // Reset initialization tracking when wallet changes
  useEffect(() => {
    if (walletAddress !== initializationRef.current.lastWallet) {
      console.log(`🔄 Dashboard: Wallet changed: ${initializationRef.current.lastWallet} → ${walletAddress}`);
      initializationRef.current = { 
        attempted: false, 
        completed: false, 
        lastWallet: walletAddress,
        lastUserId: ''
      };
    }
  }, [walletAddress]);

  // Wallet balance fetch (optimized)
  useEffect(() => {
    if (!isValidWallet) {
      setWalletBalance(0);
      return;
    }

    let walletBalanceInterval: NodeJS.Timeout | null = null;

    const fetchWalletBalance = async () => {
      setIsLoadingBalance(true);
      
      const balanceTimeout = setTimeout(() => {
        console.log('⏰ Dashboard: Wallet balance loading timeout - forcing completion');
        setIsLoadingBalance(false);
      }, 10000);
      
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        
        if (!rpcUrl) {
          console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL');
          return;
        }
        
        const connectionConfig: any = { commitment: 'confirmed' };
        if (apiKey) {
          connectionConfig.httpHeaders = { 'x-api-key': apiKey };
        }
        
        const connection = new Connection(rpcUrl, connectionConfig);
        const publicKey = safeCreatePublicKey(walletAddress);
        
        if (!publicKey) {
          console.error('Invalid wallet address');
          return;
        }
        
        const lamports = await connection.getBalance(publicKey);
        const solBalance = lamports / LAMPORTS_PER_SOL;
        
        setWalletBalance(prevBalance => {
          if (Math.abs(prevBalance - solBalance) > 0.0001) {
            console.log(`💼 Dashboard: Wallet balance updated: ${prevBalance.toFixed(6)} → ${solBalance.toFixed(6)} SOL`);
            return solBalance;
          }
          return prevBalance;
        });
        
      } catch (error) {
        console.error('Failed to fetch wallet balance:', error);
      } finally {
        clearTimeout(balanceTimeout);
        setTimeout(() => setIsLoadingBalance(false), 100);
      }
    };

    fetchWalletBalance();
    walletBalanceInterval = setInterval(fetchWalletBalance, 120000);

    return () => {
      if (walletBalanceInterval) {
        clearInterval(walletBalanceInterval);
      }
    };
  }, [isValidWallet, walletAddress]);

  // Level data fetch
  const fetchLevelData = useCallback(async () => {
    if (!userId) {
      setLevelData({
        level: 1,
        experience: 0,
        experiencePoints: 0,
        experienceToNextLevel: 100,
        progressPercentage: 0
      });
      return;
    }

    setIsLoadingLevel(true);
    try {
      console.log(`🎯 Dashboard: Fetching level data for user ${userId}`);
      
      const { data: user, error } = await supabase
        .from('users_unified')
        .select('level, experience, experience_points, badges_earned, achievements')
        .eq('id', userId)
        .single();

      if (error || !user) {
        console.error('❌ Failed to fetch level data:', error);
        return;
      }

      const currentLevel = user.level || 1;
      const currentXP = user.experience_points || 0;
      
      const baseXP = 100;
      const xpForNextLevel = baseXP * Math.pow(1.5, currentLevel - 1);
      const xpForCurrentLevel = currentLevel > 1 ? baseXP * Math.pow(1.5, currentLevel - 2) : 0;
      const xpNeededThisLevel = xpForNextLevel - xpForCurrentLevel;
      const xpProgressThisLevel = currentXP - xpForCurrentLevel;
      
      const progressPercentage = Math.min(100, Math.max(0, (xpProgressThisLevel / xpNeededThisLevel) * 100));

      setLevelData({
        level: currentLevel,
        experience: user.experience || 0,
        experiencePoints: currentXP,
        experienceToNextLevel: Math.ceil(xpForNextLevel - currentXP),
        progressPercentage: progressPercentage
      });

    } catch (error) {
      console.error('❌ Error fetching level data:', error);
    } finally {
      setIsLoadingLevel(false);
    }
  }, [userId, supabase]);

  useEffect(() => {
    if (userId) {
      fetchLevelData();
    }
  }, [userId, fetchLevelData]);

  // User stats fetch
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!userId) {
        console.log('🔍 Dashboard: No userId available for stats fetch');
        setUserStats({
          totalWagered: 0,
          totalPayouts: 0,
          gamesPlayed: 0,
          profitLoss: 0
        });
        setEnhancedUserStats({
          winRate: 0,
          bestMultiplier: 0,
          currentWinStreak: 0,
          bestWinStreak: 0
        });
        return;
      }

      setIsLoadingStats(true);
      
      const statsTimeout = setTimeout(() => {
        console.log('⏰ Dashboard: Stats loading timeout - forcing completion');
        setIsLoadingStats(false);
      }, 10000);
      
      try {
        console.log(`📊 Dashboard: Fetching user stats from users_unified for userId: ${userId}`);
        
        const userStats = await UserAPI.getUserStats(userId);
        
        if (userStats) {
          console.log('✅ Dashboard: Got unified stats:', userStats);
          
          setUserStats({
            totalWagered: userStats.total_wagered,
            totalPayouts: userStats.total_won,
            gamesPlayed: userStats.games_played,
            profitLoss: userStats.net_profit
          });

          setEnhancedUserStats({
            winRate: userStats.win_rate || 0,
            bestMultiplier: userStats.best_multiplier || 0,
            currentWinStreak: userStats.current_win_streak || 0,
            bestWinStreak: userStats.best_win_streak || 0
          });
          
          console.log(`📊 Dashboard: Stats updated from users_unified for ${userId}`);
        }
        
      } catch (error) {
        console.error('❌ Dashboard: Failed to fetch user stats from users_unified:', error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log('🔍 Debug info:', {
          userId,
          walletAddress,
          errorMessage
        });
        
        setUserStats({
          totalWagered: 0,
          totalPayouts: 0,
          gamesPlayed: 0,
          profitLoss: 0
        });
        
        setEnhancedUserStats({
          winRate: 0,
          bestMultiplier: 0,
          currentWinStreak: 0,
          bestWinStreak: 0
        });
        
        toast.error(`Stats loading failed: ${errorMessage}`);
      } finally {
        clearTimeout(statsTimeout);
        setTimeout(() => setIsLoadingStats(false), 100);
      }
    };

    fetchUserStats();
  }, [userId, walletAddress]);

  // 🚀 NEW: NON-DESTRUCTIVE real-time stats updates
  useEffect(() => {
    if (!userId || !socketConnected) return;
    
    console.log(`📊 Dashboard: Setting up NON-DESTRUCTIVE stats listeners for user: ${userId}`);
    
    let statsRefreshTimeout: NodeJS.Timeout | null = null;
    
    const refreshStatsDebounced = () => {
      if (statsRefreshTimeout) {
        clearTimeout(statsRefreshTimeout);
      }
      
      setIsStatsUpdating(true);
      
      statsRefreshTimeout = setTimeout(async () => {
        console.log(`📊 Dashboard: Refreshing stats for ${userId} after event...`);
        
        try {
          const userStats = await UserAPI.getUserStats(userId);
          
          if (userStats) {
            console.log('📊 Dashboard: Stats updated:', userStats);
            
            setUserStats(prevStats => {
              const newStats = {
                totalWagered: userStats.total_wagered,
                totalPayouts: userStats.total_won,
                gamesPlayed: userStats.games_played,
                profitLoss: userStats.net_profit
              };
              
              if (JSON.stringify(prevStats) !== JSON.stringify(newStats)) {
                console.log(`📊 Dashboard: Stats changed - updating display`);
                setStatsLastUpdated(Date.now());
                return newStats;
              }
              return prevStats;
            });

            setEnhancedUserStats(prevEnhanced => {
              const newEnhanced = {
                winRate: userStats.win_rate || 0,
                bestMultiplier: userStats.best_multiplier || 0,
                currentWinStreak: userStats.current_win_streak || 0,
                bestWinStreak: userStats.best_win_streak || 0
              };
              
              if (JSON.stringify(prevEnhanced) !== JSON.stringify(newEnhanced)) {
                console.log(`📊 Dashboard: Enhanced stats changed - updating display`);
                return newEnhanced;
              }
              return prevEnhanced;
            });
          }
        } catch (error) {
          console.error('❌ Dashboard: Failed to refresh stats:', error);
        } finally {
          setTimeout(() => setIsStatsUpdating(false), 500);
        }
      }, 2000);
    };
    
    // 🚀 NEW: Only listen to completion events, not in-progress game events
    const handleCustodialBetPlaced = (data: any) => {
      if (data.userId === userId) {
        console.log(`🎯 Dashboard: Bet placed for ${userId} - refreshing stats...`);
        refreshStatsDebounced();
        
        toast.success(`Bet placed: ${data.betAmount} SOL`, { 
          duration: 2000,
          id: 'bet-placed' 
        });
      }
    };

    const handleCustodialCashout = (data: any) => {
      if (data.userId === userId) {
        console.log(`💸 Dashboard: Cashout processed for ${userId} - refreshing stats...`);
        refreshStatsDebounced();
        
        if (data.payout && data.multiplier) {
          toast.success(`Cashed out at ${data.multiplier.toFixed(2)}x: +${data.payout.toFixed(3)} SOL!`, { 
            duration: 3000,
            id: 'cashout-success' 
          });
        }
      }
    };

    const handleGameEnd = (data: any) => {
      console.log(`🎮 Dashboard: Game ended - refreshing stats for active players...`);
      refreshStatsDebounced();
    };

    const handleUserStatsUpdate = (data: any) => {
      if (data.userId === userId) {
        console.log(`📊 Dashboard: Direct stats update received for ${userId}`);
        
        if (data.stats) {
          setUserStats({
            totalWagered: data.stats.total_wagered || 0,
            totalPayouts: data.stats.total_won || 0,
            gamesPlayed: data.stats.games_played || 0,
            profitLoss: data.stats.net_profit || 0
          });

          setEnhancedUserStats({
            winRate: data.stats.win_rate || 0,
            bestMultiplier: data.stats.best_multiplier || 0,
            currentWinStreak: data.stats.current_win_streak || 0,
            bestWinStreak: data.stats.best_win_streak || 0
          });
        } else {
          refreshStatsDebounced();
        }
      }
    };

    const handleBetResult = (data: any) => {
      if (data.userId === userId) {
        console.log(`🎲 Dashboard: Bet result received for ${userId}:`, data);
        refreshStatsDebounced();
      }
    };

    // 🚀 NEW: DO NOT listen to multiplierUpdate, gameState, etc. - let main component handle them

    // Use shared socket for event listeners
    sharedSocket.on('custodialBetPlaced', handleCustodialBetPlaced);
    sharedSocket.on('custodialCashout', handleCustodialCashout);
    sharedSocket.on('gameEnd', handleGameEnd);
    sharedSocket.on('userStatsUpdate', handleUserStatsUpdate);
    sharedSocket.on('betResult', handleBetResult);
    
    return () => {
      console.log(`📊 Dashboard: Cleaning up NON-DESTRUCTIVE stats listeners for user: ${userId}`);
      sharedSocket.off('custodialBetPlaced', handleCustodialBetPlaced);
      sharedSocket.off('custodialCashout', handleCustodialCashout);
      sharedSocket.off('gameEnd', handleGameEnd);
      sharedSocket.off('userStatsUpdate', handleUserStatsUpdate);
      sharedSocket.off('betResult', handleBetResult);
      
      if (statsRefreshTimeout) {
        clearTimeout(statsRefreshTimeout);
      }
    };
  }, [userId, socketConnected]);

  // Transaction confirmation listener
  useEffect(() => {
    if (!userId || !walletAddress || !socketConnected) return;
    
    console.log(`🔌 Dashboard: Setting up transaction listeners for user: ${userId}`);
    
    let walletRefreshTimeout: NodeJS.Timeout | null = null;
    
    const debouncedWalletRefresh = () => {
      if (walletRefreshTimeout) {
        clearTimeout(walletRefreshTimeout);
      }
      
      walletRefreshTimeout = setTimeout(async () => {
        console.log(`💼 Dashboard: Debounced wallet refresh for ${walletAddress}`);
        
        try {
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
          const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
          
          if (rpcUrl) {
            const connectionConfig: any = { commitment: 'confirmed' };
            if (apiKey) connectionConfig.httpHeaders = { 'x-api-key': apiKey };
            
            const connection = new Connection(rpcUrl, connectionConfig);
            const publicKey = safeCreatePublicKey(walletAddress);
            
            if (publicKey) {
              const lamports = await connection.getBalance(publicKey);
              const newBalance = lamports / LAMPORTS_PER_SOL;
              
              setWalletBalance(prevBalance => {
                if (Math.abs(prevBalance - newBalance) > 0.0001) {
                  console.log(`💼 Dashboard: Wallet balance updated: ${newBalance.toFixed(6)} SOL`);
                  return newBalance;
                }
                return prevBalance;
              });
            }
          }
        } catch (error) {
          console.error('❌ Dashboard: Failed to refresh wallet balance:', error);
        }
      }, 3000);
    };

    const handleTransactionConfirmed = (data: any) => {
      if (data.userId === userId || data.walletAddress === walletAddress) {
        console.log(`🔗 Dashboard: Transaction confirmed - scheduling wallet refresh`);
        debouncedWalletRefresh();
      }
    };

    sharedSocket.on('transactionConfirmed', handleTransactionConfirmed);
    
    return () => {
      console.log(`🔌 Dashboard: Cleaning up transaction listeners for user: ${userId}`);
      sharedSocket.off('transactionConfirmed', handleTransactionConfirmed);
      
      if (walletRefreshTimeout) clearTimeout(walletRefreshTimeout);
    };
  }, [userId, walletAddress, socketConnected]);

  // Enhanced refresh function
  const refreshData = useCallback(async () => {
    if (!isValidWallet || !userId) {
      console.log('🔄 Dashboard: Cannot refresh - wallet or user not ready');
      return;
    }
    
    console.log('🔄 Dashboard: Manual refresh triggered by user');
    setIsManualRefreshing(true);
    
    const refreshTimeout = setTimeout(() => {
      console.log('⏰ Dashboard: Manual refresh timeout - forcing completion');
      setIsManualRefreshing(false);
    }, 15000);
    
    try {
      toast.loading('Refreshing dashboard data...', { id: 'dashboard-refresh' });
      
      await refreshCustodialBalance();
      
      try {
        await fetchLevelData();
        console.log('🎯 Dashboard: Level data refreshed');
      } catch (error) {
        console.error('❌ Dashboard: Failed to refresh level data:', error);
      }
      
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        
        if (rpcUrl) {
          const connectionConfig: any = { commitment: 'confirmed' };
          if (apiKey) connectionConfig.httpHeaders = { 'x-api-key': apiKey };
          
          const connection = new Connection(rpcUrl, connectionConfig);
          const publicKey = safeCreatePublicKey(walletAddress);
          
          if (publicKey) {
            const lamports = await connection.getBalance(publicKey);
            setWalletBalance(lamports / LAMPORTS_PER_SOL);
          }
        }
      } catch (error) {
        console.error('❌ Dashboard: Failed to refresh embedded wallet balance:', error);
      }

      try {
        console.log('📊 Dashboard: Manual stats refresh...');
        const userStats = await UserAPI.getUserStats(userId);
        
        if (userStats) {
          setUserStats({
            totalWagered: userStats.total_wagered,
            totalPayouts: userStats.total_won,
            gamesPlayed: userStats.games_played,
            profitLoss: userStats.net_profit
          });
          
          setEnhancedUserStats({
            winRate: userStats.win_rate || 0,
            bestMultiplier: userStats.best_multiplier || 0,
            currentWinStreak: userStats.current_win_streak || 0,
            bestWinStreak: userStats.best_win_streak || 0
          });
          
          console.log('📊 Dashboard: Manual stats refresh completed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Dashboard: Failed to refresh stats:', errorMessage);
        toast.error('Failed to refresh stats');
      }
      
      toast.success('Dashboard data refreshed!', { id: 'dashboard-refresh' });
      
    } catch (error) {
      console.error('❌ Dashboard: Refresh failed:', error);
      toast.error('Failed to refresh dashboard data', { id: 'dashboard-refresh' });
    } finally {
      clearTimeout(refreshTimeout);
      setIsManualRefreshing(false);
    }
  }, [isValidWallet, userId, walletAddress, refreshCustodialBalance, fetchLevelData]);

  // Loading state while Privy initializes
  if (!ready) {
    return (
      <Layout>
        <div className="scrollable-page-container">
          <div className="scrollable-content-area">
            <div className="scrollable-inner-content">
              <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="scrollable-page-container">
        <div className="scrollable-content-area">
          <div className="scrollable-inner-content">
            <div className="max-w-7xl mx-auto px-4 py-8">
              {/* 🚀 NEW: Header with improved real-time status */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                  
                  {/* Real-time status indicator */}
                  <div className="flex items-center gap-2">
                    {realTimeStatus.connected ? (
                      <div className="flex items-center text-sm text-green-400">
                        <Wifi size={16} className="mr-1" />
                        <span>Live</span>
                        <div className="w-2 h-2 bg-green-400 rounded-full ml-1 animate-pulse"></div>
                      </div>
                    ) : (
                      <div className="flex items-center text-sm text-red-400">
                        <WifiOff size={16} className="mr-1" />
                        <span>Offline</span>
                        {realTimeStatus.reconnectAttempts > 0 && (
                          <span className="ml-1 text-xs">({realTimeStatus.reconnectAttempts})</span>
                        )}
                      </div>
                    )}
                    
                    {realTimeStatus.error && (
                      <div className="text-xs text-yellow-400 ml-2" title={realTimeStatus.error}>
                        <AlertCircle size={12} />
                      </div>
                    )}
                  </div>
                </div>
                
                {(isValidWallet && userId) && (
                  <div className="flex items-center gap-3">
                    {/* Real-time toggle indicator */}
                    {realTimeStatus.connected && (
                      <div className="flex items-center text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-700/30">
                        <Zap size={12} className="mr-1" />
                        Auto-Update
                      </div>
                    )}
                    
                    <button
                      onClick={refreshData}
                      className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-md transition-colors"
                      disabled={isManualRefreshing}
                    >
                      <RefreshCw size={16} className={`mr-2 ${isManualRefreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                )}
              </div>

              {/* Rest of the component remains the same - just removed the aggressive cleanup code */}
              {/* Player Profile, Wallet Status, Referral Section, Game Statistics, Quick Actions */}
              {/* ... [Previous JSX remains exactly the same] ... */}

              <div className="h-16"></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;