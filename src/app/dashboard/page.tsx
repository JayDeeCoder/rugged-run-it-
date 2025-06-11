// src/app/dashboard/page.tsx - FIXED with Game State Coordination
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

// 🚀 ENHANCED: Socket connection with game state coordination
const useSocketConnection = () => {
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const initAttempted = useRef(false);
  const router = useRouter();

  // 🚀 NEW: Game state cleanup function
  const cleanupGameState = useCallback(() => {
    console.log('🧹 Dashboard: Cleaning up game state before navigation...');
    
    // Clear any game-specific state in shared socket
    if (sharedSocket.isConnected()) {
      // Emit cleanup signal to server
      sharedSocket.emit('cleanupGameState', { 
        source: 'dashboard',
        timestamp: Date.now()
      });
      
      // Clear local game state tracking
      if ((window as any).gameStateRef) {
        (window as any).gameStateRef.current = null;
      }
      
      // Stop listening to game-specific events temporarily
      sharedSocket.off('multiplierUpdate');
      sharedSocket.off('gameState');
      sharedSocket.off('gameStarted');
      sharedSocket.off('gameCrashed');
    }
  }, []);

  // 🚀 NEW: Cleanup on page navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupGameState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupGameState();
    };
  }, [cleanupGameState]);

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    console.log('🔌 Dashboard: Initializing socket connection via shared service...');
    
    const initSocket = async () => {
      try {
        const gameSocket = await sharedSocket.getSocket();
        
        if (gameSocket) {
          console.log('✅ Dashboard: Got socket from shared service');
          setSocket(gameSocket);
          setIsConnected(gameSocket.connected);
          setError(null);
          
          // 🚀 ENHANCED: Connection handlers with game state management
          const handleConnect = () => {
            console.log('✅ Dashboard: Socket connected');
            setIsConnected(true);
            setError(null);
            setConnectionAttempts(0);
            
            // 🚀 NEW: Signal that dashboard is active
            sharedSocket.emit('pageActive', { 
              page: 'dashboard',
              timestamp: Date.now()
            });
          };

          const handleDisconnect = () => {
            console.log('🔌 Dashboard: Socket disconnected');
            setIsConnected(false);
          };

          const handleError = (err: any) => {
            console.error('❌ Dashboard: Socket error:', err);
            setError(err.message || 'Connection error');
            setConnectionAttempts(prev => prev + 1);
          };

          // Register listeners
          sharedSocket.on('connect', handleConnect);
          sharedSocket.on('disconnect', handleDisconnect);
          sharedSocket.on('connect_error', handleError);

          // If already connected, update state
          if (gameSocket.connected) {
            handleConnect();
          }

          // Cleanup function
          return () => {
            sharedSocket.off('connect', handleConnect);
            sharedSocket.off('disconnect', handleDisconnect);
            sharedSocket.off('connect_error', handleError);
          };
        } else {
          console.warn('⚠️ Dashboard: Failed to get socket from shared service');
          setError('Failed to connect to game server');
          setConnectionAttempts(prev => prev + 1);
        }
      } catch (err) {
        console.error('❌ Dashboard: Error initializing socket:', err);
        setError(err instanceof Error ? err.message : 'Socket initialization failed');
        setConnectionAttempts(prev => prev + 1);
      }
    };

    initSocket();

    // 🚀 NEW: Cleanup on unmount
    return () => {
      cleanupGameState();
    };
  }, [cleanupGameState]);

  // Monitor shared socket connection status
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = sharedSocket.isConnected();
      if (connected !== isConnected) {
        setIsConnected(connected);
        console.log(`🔌 Dashboard: Connection status changed: ${connected}`);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return { 
    socket, 
    isConnected, 
    connectionAttempts, 
    error, 
    cleanupGameState 
  };
};

interface PlayerBet {
  bet_amount: number;
  profit_loss: number;
  cashout_amount?: number;
  cashout_multiplier?: number;
  status: string;
}

// 🚀 ENHANCED: Custodial balance hook with game state coordination
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get socket connection status
  const { socket, isConnected } = useSocketConnection();

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
   
  // 🚀 ENHANCED: Real-time socket listeners with game state coordination
  useEffect(() => {
    if (!userId || !isConnected || socketListenersRef.current) return;
    
    console.log(`🔌 Dashboard: Setting up COORDINATED custodial balance listeners for user: ${userId}`);
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

    // 🚀 NEW: Ignore multiplier updates to prevent conflicts
    const handleMultiplierUpdate = (data: any) => {
      // Don't process multiplier updates on dashboard page
      console.log('🎮 Dashboard: Ignoring multiplier update to prevent conflicts');
    };

    // Use shared socket to listen for events
    sharedSocket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
    sharedSocket.on('userBalanceUpdate', handleUserBalanceUpdate);
    sharedSocket.on('depositConfirmed', handleDepositConfirmation);
    sharedSocket.on('multiplierUpdate', handleMultiplierUpdate); // Ignore to prevent conflicts
    
    return () => {
      console.log(`🔌 Dashboard: Cleaning up COORDINATED custodial balance listeners for user: ${userId}`);
      sharedSocket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      sharedSocket.off('userBalanceUpdate', handleUserBalanceUpdate);
      sharedSocket.off('depositConfirmed', handleDepositConfirmation);
      sharedSocket.off('multiplierUpdate', handleMultiplierUpdate);
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

  // 🚀 ENHANCED: Use socket connection hook and custodial balance hook with coordination
  const { 
    socket: gameSocket, 
    isConnected: socketConnected, 
    connectionAttempts, 
    error: socketError,
    cleanupGameState
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

  const cleanupExecutedRef = useRef(false);

  // 🚀 NEW: Page visibility and navigation cleanup
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('🔍 Dashboard: Page hidden - preparing for potential navigation');
        cleanupExecutedRef.current = false;
      } else {
        console.log('🔍 Dashboard: Page visible - resuming operations');
        if (cleanupExecutedRef.current) {
          // Re-establish game state sync if needed
          setTimeout(() => {
            if (sharedSocket.isConnected()) {
              sharedSocket.emit('requestGameSync', { 
                source: 'dashboard_resume',
                timestamp: Date.now()
              });
            }
          }, 1000);
        }
      }
    };

    const handleBeforeUnload = () => {
      if (!cleanupExecutedRef.current) {
        console.log('🧹 Dashboard: Page unloading - final cleanup');
        cleanupGameState();
        cleanupExecutedRef.current = true;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      if (!cleanupExecutedRef.current) {
        cleanupGameState();
        cleanupExecutedRef.current = true;
      }
    };
  }, [cleanupGameState]);

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
          
          // Initialize user via shared socket if available
          if (socketConnected) {
            console.log(`📡 Dashboard: Initializing user via shared socket...`);
            sharedSocket.emit('initializeUser', {
              userId: userData.id,
              walletAddress: walletAddress
            });
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
  }, [authenticated, walletAddress, socketConnected]);

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

  // 🚀 ENHANCED: Real-time stats updates with game state coordination
  useEffect(() => {
    if (!userId || !socketConnected) return;
    
    console.log(`📊 Dashboard: Setting up COORDINATED LIVE stats listeners for user: ${userId}`);
    
    let statsRefreshTimeout: NodeJS.Timeout | null = null;
    
    const refreshStatsDebounced = () => {
      if (statsRefreshTimeout) {
        clearTimeout(statsRefreshTimeout);
      }
      
      setIsStatsUpdating(true);
      
      statsRefreshTimeout = setTimeout(async () => {
        console.log(`📊 Dashboard LIVE: Refreshing stats for ${userId} after game event...`);
        
        try {
          const userStats = await UserAPI.getUserStats(userId);
          
          if (userStats) {
            console.log('📊 Dashboard LIVE: Stats updated:', userStats);
            
            setUserStats(prevStats => {
              const newStats = {
                totalWagered: userStats.total_wagered,
                totalPayouts: userStats.total_won,
                gamesPlayed: userStats.games_played,
                profitLoss: userStats.net_profit
              };
              
              if (JSON.stringify(prevStats) !== JSON.stringify(newStats)) {
                console.log(`📊 Dashboard LIVE: Stats changed - updating display`);
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
                console.log(`📊 Dashboard LIVE: Enhanced stats changed - updating display`);
                return newEnhanced;
              }
              return prevEnhanced;
            });
          }
        } catch (error) {
          console.error('❌ Dashboard LIVE: Failed to refresh stats:', error);
        } finally {
          setTimeout(() => setIsStatsUpdating(false), 500);
        }
      }, 2000);
    };
    
    const handleCustodialBetPlaced = (data: any) => {
      if (data.userId === userId) {
        console.log(`🎯 Dashboard LIVE: Bet placed for ${userId} - refreshing stats...`);
        refreshStatsDebounced();
        
        toast.success(`Bet placed: ${data.betAmount} SOL`, { 
          duration: 2000,
          id: 'bet-placed' 
        });
      }
    };

    const handleCustodialCashout = (data: any) => {
      if (data.userId === userId) {
        console.log(`💸 Dashboard LIVE: Cashout processed for ${userId} - refreshing stats...`);
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
      console.log(`🎮 Dashboard LIVE: Game ended - refreshing stats for active players...`);
      refreshStatsDebounced();
    };

    const handleUserStatsUpdate = (data: any) => {
      if (data.userId === userId) {
        console.log(`📊 Dashboard LIVE: Direct stats update received for ${userId}`);
        
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
        console.log(`🎲 Dashboard LIVE: Bet result received for ${userId}:`, data);
        refreshStatsDebounced();
      }
    };

    // 🚀 NEW: Ignore multiplier updates to prevent conflicts
    const handleMultiplierUpdate = (data: any) => {
      // Don't process multiplier updates on dashboard page
      console.log('🎮 Dashboard: Ignoring multiplier update to prevent conflicts');
    };

    // Use shared socket for event listeners
    sharedSocket.on('custodialBetPlaced', handleCustodialBetPlaced);
    sharedSocket.on('custodialCashout', handleCustodialCashout);
    sharedSocket.on('gameEnd', handleGameEnd);
    sharedSocket.on('userStatsUpdate', handleUserStatsUpdate);
    sharedSocket.on('betResult', handleBetResult);
    sharedSocket.on('multiplierUpdate', handleMultiplierUpdate); // Ignore to prevent conflicts
    
    return () => {
      console.log(`📊 Dashboard: Cleaning up COORDINATED LIVE stats listeners for user: ${userId}`);
      sharedSocket.off('custodialBetPlaced', handleCustodialBetPlaced);
      sharedSocket.off('custodialCashout', handleCustodialCashout);
      sharedSocket.off('gameEnd', handleGameEnd);
      sharedSocket.off('userStatsUpdate', handleUserStatsUpdate);
      sharedSocket.off('betResult', handleBetResult);
      sharedSocket.off('multiplierUpdate', handleMultiplierUpdate);
      
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
        console.log(`🔗 Dashboard REAL-TIME: Transaction confirmed - scheduling wallet refresh`);
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
              {/* 🚀 ENHANCED: Header with real-time status and cleanup indicators */}
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

              {/* Player Profile (unchanged) */}
              {isValidWallet && userId && (
                <div className="bg-gray-900 rounded-lg p-6 mb-8">
                  <h2 className="text-xl font-bold text-white mb-4">Player Profile</h2>
                  
                  {isLoadingLevel ? (
                    <div className="animate-pulse space-y-4">
                      <div className="h-6 bg-gray-700 rounded w-32"></div>
                      <div className="h-4 bg-gray-700 rounded w-full"></div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="h-16 bg-gray-700 rounded"></div>
                        <div className="h-16 bg-gray-700 rounded"></div>
                        <div className="h-16 bg-gray-700 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-4">
                            <div className="bg-purple-600 rounded-full w-12 h-12 flex items-center justify-center">
                              <span className="text-white font-bold text-lg">{levelData.level}</span>
                            </div>
                            <div>
                              <h3 className="text-white font-bold text-lg">Level {levelData.level}</h3>
                              <p className="text-gray-400 text-sm">{levelData.experiencePoints} Experience Points</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-purple-400 font-semibold">
                              {levelData.experienceToNextLevel > 0 
                                ? `${levelData.experienceToNextLevel} XP to Level ${levelData.level + 1}`
                                : "Max Level Reached!"
                              }
                            </p>
                          </div>
                        </div>
                        
                        <div className="relative">
                          <div className="w-full bg-gray-700 rounded-full h-3">
                            <div 
                              className="bg-gradient-to-r from-purple-500 via-blue-500 to-purple-600 h-3 rounded-full transition-all duration-700 ease-out relative"
                              style={{ width: `${Math.max(5, levelData.progressPercentage)}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full blur-sm opacity-60"></div>
                            </div>
                          </div>
                          <div className="flex justify-between mt-1 text-xs text-gray-400">
                            <span>{levelData.progressPercentage.toFixed(1)}% Complete</span>
                            <span>Level {levelData.level + 1}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-800 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-purple-400">{levelData.level}</div>
                          <div className="text-gray-400 text-sm">Current Level</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-blue-400">{levelData.experiencePoints}</div>
                          <div className="text-gray-400 text-sm">Total XP</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-green-400">{levelData.experienceToNextLevel}</div>
                          <div className="text-gray-400 text-sm">XP to Next Level</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 🚀 ENHANCED: Wallet Status with connection indicators */}
              <div className="bg-gray-900 rounded-lg p-6 mb-8">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                  <Wallet size={20} className="mr-2" />
                  Wallet Status
                  {isValidWallet && (
                    <div className="ml-3 flex items-center gap-2">
                      {isSocketConnected ? (
                        <div className="flex items-center text-xs text-green-400">
                          <div className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse"></div>
                          Real-time
                        </div>
                      ) : (
                        <div className="flex items-center text-xs text-yellow-400">
                          <AlertCircle size={12} className="mr-1" />
                          Limited updates
                        </div>
                      )}
                    </div>
                  )}
                </h2>
                
                {!authenticated ? (
                  <div className="text-center py-6">
                    <p className="text-gray-400 mb-4">Please log in to view your wallet and stats</p>
                    <button 
                      onClick={() => window.location.href = '/'}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md transition-colors"
                    >
                      Login
                    </button>
                  </div>
                ) : isValidWallet ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-gray-400 mb-1">Wallet Address</div>
                      <div className="text-white font-mono text-sm">
                        {walletAddress.substring(0, 8)}...{walletAddress.substring(walletAddress.length - 8)}
                      </div>
                      <div className="text-green-400 text-sm mt-1">✓ Connected</div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className={`bg-gray-800 rounded-lg p-4 transition-all duration-500 ${
                        custodialBalanceLoading ? 'ring-2 ring-green-400 ring-opacity-30' : ''
                      }`}>
                        <div className="text-green-400 mb-2 flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="mr-2">🎮</span>
                            Game Balance
                          </div>
                          {isSocketConnected && (
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          )}
                        </div>
                        <div className="text-2xl font-bold text-green-400">
                          {custodialBalanceLoading ? (
                            <div className="flex items-center">
                              <div className="animate-spin h-5 w-5 border-2 border-green-400 border-t-transparent rounded-full mr-2"></div>
                              Loading...
                            </div>
                          ) : (
                            `${custodialBalance.toFixed(4)} SOL`
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          For gaming • {custodialLastUpdated ? `Updated: ${new Date(custodialLastUpdated).toLocaleTimeString()}` : 'Never updated'}
                        </div>
                      </div>
                      
                      <div className={`bg-gray-800 rounded-lg p-4 transition-all duration-500 ${
                        isLoadingBalance ? 'ring-2 ring-blue-400 ring-opacity-30' : ''
                      }`}>
                        <div className="text-blue-400 mb-2 flex items-center">
                          <span className="mr-2">💼</span>
                          Wallet Balance
                        </div>
                        <div className="text-2xl font-bold text-blue-400">
                          {isLoadingBalance ? (
                            <div className="flex items-center">
                              <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full mr-2"></div>
                              Loading...
                            </div>
                          ) : (
                            `${walletBalance.toFixed(4)} SOL`
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          For deposits • Embedded wallet
                        </div>
                      </div>
                    </div>
                    
                    {walletBalance > 0.001 && (
                      <div className="bg-yellow-900 bg-opacity-30 border border-yellow-800 rounded-lg p-3">
                        <div className="text-yellow-400 text-sm flex items-center">
                          <span className="mr-2">💡</span>
                          Transfer SOL from wallet to game balance to start playing
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-yellow-400 mb-2">Wallet connection issue</p>
                    <p className="text-gray-400 text-sm">Please reconnect your wallet</p>
                  </div>
                )}
              </div>

              {/* Referral Section */}
              {(isValidWallet && userId) && (
                <ReferralSection 
                  userId={userId} 
                  walletAddress={walletAddress} 
                  isValidWallet={isValidWallet} 
                />
              )}

              {/* 🚀 ENHANCED: Game Statistics with improved real-time indicators */}
              {isValidWallet && (
                <div className="bg-gray-900 rounded-lg p-6 mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center">
                      <TrendingUp size={20} className="mr-2" />
                      Game Statistics
                      {isStatsUpdating && (
                        <div className="ml-3 flex items-center text-green-400 text-sm">
                          <div className="animate-pulse w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                          Updating...
                        </div>
                      )}
                    </h2>
                    
                    <div className="flex items-center gap-3">
                      {realTimeStatus.connected && (
                        <div className="flex items-center text-xs text-green-400">
                          <Zap size={12} className="mr-1" />
                          Live Updates
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-500">
                        {statsLastUpdated > 0 && (
                          <span>Updated: {new Date(statsLastUpdated).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {isLoadingStats ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-gray-700 rounded w-24 mb-2"></div>
                          <div className="h-8 bg-gray-700 rounded w-20"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                        <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}`}>
                          <div className="text-gray-400 mb-1">Total Wagered</div>
                          <div className="text-2xl font-bold text-white">
                            {userStats.totalWagered.toFixed(3)} SOL
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            All time betting volume
                          </div>
                        </div>
                        
                        <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-green-400 ring-opacity-50' : ''}`}>
                          <div className="text-gray-400 mb-1">Total Won</div>
                          <div className="text-2xl font-bold text-green-400">
                            {userStats.totalPayouts.toFixed(3)} SOL
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Successful cashouts
                          </div>
                        </div>
                        
                        <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-purple-400 ring-opacity-50' : ''}`}>
                          <div className="text-gray-400 mb-1">Games Played</div>
                          <div className="text-2xl font-bold text-white">
                            {userStats.gamesPlayed}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Rounds participated
                          </div>
                        </div>
                        
                        <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}`}>
                          <div className="text-gray-400 mb-1">Net Profit/Loss</div>
                          <div className={`text-2xl font-bold ${userStats.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {userStats.profitLoss >= 0 ? '+' : ''}{userStats.profitLoss.toFixed(3)} SOL
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {userStats.profitLoss >= 0 ? 'Total profit' : 'Total loss'}
                          </div>
                        </div>
                      </div>

                      {(enhancedUserStats.winRate > 0 || enhancedUserStats.bestMultiplier > 0 || userStats.gamesPlayed > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-4 border-t border-gray-700">
                          <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-blue-400 ring-opacity-30' : ''}`}>
                            <div className="text-gray-400 mb-1">Win Rate</div>
                            <div className="text-lg font-bold text-blue-400">
                            {enhancedUserStats.winRate.toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Success percentage
                            </div>
                          </div>
                          
                          <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-purple-400 ring-opacity-30' : ''}`}>
                          <div className="text-gray-400 mb-1">Best Multiplier</div>
                            <div className="text-lg font-bold text-purple-400">
                              {enhancedUserStats.bestMultiplier.toFixed(2)}x
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Highest cashout
                            </div>
                          </div>
                          
                          <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-yellow-400 ring-opacity-30' : ''}`}>
                            <div className="text-gray-400 mb-1">Current Streak</div>
                            <div className="text-lg font-bold text-yellow-400">
                              {enhancedUserStats.currentWinStreak} wins
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Active win streak
                            </div>
                          </div>
                          
                          <div className={`transition-all duration-500 ${isStatsUpdating ? 'ring-2 ring-orange-400 ring-opacity-30' : ''}`}>
                            <div className="text-gray-400 mb-1">Best Streak</div>
                            <div className="text-lg font-bold text-orange-400">
                              {enhancedUserStats.bestWinStreak} wins
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Personal record
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center">
                            {realTimeStatus.connected ? (
                              <>
                                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                                <span>Stats update automatically when you play</span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></div>
                                <span>Limited updates - connection issues</span>
                              </>
                            )}
                          </div>
                          <span>
                            Last sync: {statsLastUpdated > 0 ? new Date(statsLastUpdated).toLocaleTimeString() : 'Not yet synced'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-900 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                  <div className="space-y-3">
                    <Link 
                      href="/" 
                      className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-center"
                    >
                      <GamepadIcon size={20} className="inline mr-2" />
                      Play RUGGED 
                    </Link>
                    <Link 
                      href="/leaderboard" 
                      className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-center"
                    >
                      View Top Rugger Board
                    </Link>
                  </div>
                </div>
                
                <div className="bg-gray-900 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
                  <div className="text-gray-400 text-center py-6">
                    {isValidWallet ? (
                      <p>No recent activity</p>
                    ) : (
                      <p>Login to view wallet activity</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-16"></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;