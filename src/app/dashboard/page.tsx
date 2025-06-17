// src/app/dashboard/page.tsx - ENHANCED UI with compact mobile design and recent activity
'use client';

import { FC, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useSolanaWallets, usePrivy } from '@privy-io/react-auth';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import Layout from '../../components/layout/Layout';
import Link from 'next/link';
import { UserContext } from '../../context/UserContext';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';
import { Wallet, TrendingUp, GamepadIcon, RefreshCw, Star, Crown, Medal, Trophy, Zap, Target, Award, Users, AlertCircle, TrendingDown } from 'lucide-react';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import ReferralSection from '../../components/ReferralSection';

// 🚀 FIX: Hardcoded Supabase config with environment variable fallback
const FALLBACK_SUPABASE_URL = 'https://ineaxxqjkryoobobxrsw.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZWF4eHFqa3J5b29ib2J4cnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzMxMzIsImV4cCI6MjA2MzM0OTEzMn0.DiFLCCe5-UnzsGpG7dsqJWoUbxmaJxc_v89pxxsa1aA';

let supabaseClient: any = null;
const getSupabaseClient = () => {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
    
    console.log('🔧 Supabase initialization:', {
      envUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'FOUND' : 'MISSING',
      envKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'FOUND' : 'MISSING',
      usingFallback: !process.env.NEXT_PUBLIC_SUPABASE_URL,
      finalUrl: supabaseUrl.substring(0, 30) + '...'
    });
    
    try {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      console.log('✅ Supabase client created successfully');
      
      supabaseClient.from('player_bets').select('count').limit(1)
        .then(() => console.log('✅ Supabase connection test passed'))
        .catch((err: any) => console.warn('⚠️ Supabase test query failed:', err.message));
        
    } catch (error) {
      console.error('❌ Failed to create Supabase client:', error);
      throw error;
    }
  }
  return supabaseClient;
};

interface PlayerBet {
  bet_amount: number;
  profit_loss: number;
  cashout_amount?: number;
  cashout_multiplier?: number;
  status: string;
}

// Solana logo component
const SolanaLogo = ({ size = 12, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" className={`inline-block ${className}`}>
    <defs>
      <linearGradient id="solanaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9945FF"/>
        <stop offset="100%" stopColor="#14F195"/>
      </linearGradient>
    </defs>
    <path 
      fill="url(#solanaGradient)" 
      d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z M333.1,120.1c2.4-2.4,5.7-3.8,9.2-3.8h56.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L333.1,120.1z"
    />
  </svg>
);

// 🚀 OPTIMIZED: Custodial balance hook with controlled refresh timing
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateCustodialBalance = useCallback(async (skipDebounce = false) => {
    if (!userId) return;
    
    if (loading) return;
    
    const timeSinceLastUpdate = Date.now() - lastUpdated;
    if (!skipDebounce && timeSinceLastUpdate < 5000) {
      console.log(`⏭️ Dashboard: Skipping update, last updated ${timeSinceLastUpdate}ms ago`);
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
            console.log(`💰 Dashboard: Balance updated: ${prevBalance.toFixed(6)} → ${newBalance.toFixed(6)} SOL`);
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
    
    console.log(`🔄 Dashboard: Force refresh requested for ${userId}...`);
    await updateCustodialBalance(true);
  }, [userId, updateCustodialBalance]);
  
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
   
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Dashboard: Setting up REAL-TIME custodial balance listeners for user: ${userId}`);
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

      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('userBalanceUpdate', handleUserBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      
      return () => {
        console.log(`🔌 Dashboard: Cleaning up REAL-TIME custodial balance listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('userBalanceUpdate', handleUserBalanceUpdate);
        socket.off('depositConfirmed', handleDepositConfirmation);
        socketListenersRef.current = false;
        
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [userId, updateCustodialBalance]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance, forceRefresh };
};

const Dashboard: FC = () => {
  // Privy hooks
  const { wallets } = useSolanaWallets();
  const { authenticated, ready, user } = usePrivy();
  
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

  // 🚀 OPTIMIZED: Use custodial balance hook with real-time updates
  const { 
    custodialBalance, 
    loading: custodialBalanceLoading, 
    updateCustodialBalance, 
    forceRefresh: refreshCustodialBalance,
    lastUpdated: custodialLastUpdated
  } = useCustodialBalance(userId || '');
  
  // 🚀 FIX: Use singleton Supabase client
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

  // 🚀 NEW: Recent activity state
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState<boolean>(false);
  const [activityLastUpdated, setActivityLastUpdated] = useState<number>(0);

  const [levelData, setLevelData] = useState({
    level: 1,
    experience: 0,
    experiencePoints: 0,
    experienceToNextLevel: 100,
    progressPercentage: 0,
    // 🚀 NEW: Enhanced XP system properties
    isEarlyLevel: false,
    readyToLevelUp: false,
    xpThisLevel: 0,
    xpNeededThisLevel: 100
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

  // 🚀 NEW: Fetch recent activity/trade history
  const fetchRecentActivity = useCallback(async () => {
    if (!userId) {
      setRecentActivity([]);
      return;
    }

    setIsLoadingActivity(true);
    try {
      console.log(`📊 Dashboard: Fetching recent activity for user ${userId}`);
      
      const activityData = await UserAPI.getEnhancedTradeHistory(userId, 5);
      
      if (activityData && activityData.trades.length > 0) {
        console.log(`✅ Dashboard: Got ${activityData.trades.length} recent trades`);
        setRecentActivity(activityData.trades);
        setActivityLastUpdated(Date.now());
      } else {
        console.log(`ℹ️ Dashboard: No recent activity found for user ${userId}`);
        setRecentActivity([]);
      }
      
    } catch (error) {
      console.error('❌ Dashboard: Failed to fetch recent activity:', error);
      setRecentActivity([]);
    } finally {
      setTimeout(() => setIsLoadingActivity(false), 100);
    }
  }, [userId]);

  // Fetch recent activity when userId changes
  useEffect(() => {
    if (userId) {
      fetchRecentActivity();
    }
  }, [userId, fetchRecentActivity]);

  // 🚀 OPTIMIZED: User initialization effect
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
    
    let initTimeout: NodeJS.Timeout | null = null;
    
    const initUser = async () => {
      try {
        if (userId && initializationRef.current.lastUserId === userId) {
          console.log(`✅ Dashboard: User ${userId} already initialized for this wallet`);
          initializationRef.current.completed = true;
          return;
        }
        
        console.log(`📡 Dashboard: Getting user data for wallet: ${walletAddress}`);
        const userData = await UserAPI.getUserOrCreate(walletAddress);
        
        if (userData) {
          setUserId(userData.id);
          initializationRef.current.lastUserId = userData.id;
          console.log(`👤 Dashboard: User ID set: ${userData.id}`);
          
          initTimeout = setTimeout(() => {
            console.log(`📡 Dashboard: Initializing user via socket...`);
            
            const socket = (window as any).gameSocket;
            if (socket) {
              socket.emit('initializeUser', {
                userId: userData.id,
                walletAddress: walletAddress
              });
              
              socket.once('userInitializeResult', (result: any) => {
                console.log('📡 Dashboard: User initialization result:', result);
                
                if (result.success) {
                  console.log(`✅ Dashboard: User ${result.userId} initialized successfully`);
                  
                  initializationRef.current.completed = true;
                  initializationRef.current.lastUserId = result.userId;
                  
                  setTimeout(() => {
                    try {
                      updateCustodialBalance();
                    } catch (error) {
                      console.warn('⚠️ Dashboard: Balance update failed during initialization:', error);
                    }
                  }, 500);
                } else {
                  console.error('❌ Dashboard: User initialization failed:', result.error);
                  toast.error('Failed to initialize wallet');
                  initializationRef.current.attempted = false;
                  initializationRef.current.completed = false;
                }
              });
            } else {
              console.error('❌ Dashboard: Socket not available for user initialization');
              initializationRef.current.attempted = false;
              initializationRef.current.completed = false;
            }
          }, 1000);
        }
      } catch (error) {
        console.error('❌ Dashboard: Could not initialize user:', error);
        toast.error('Failed to initialize wallet');
        initializationRef.current.attempted = false;
        initializationRef.current.completed = false;
      }
    };
    
    initUser();
    
    return () => {
      if (initTimeout) clearTimeout(initTimeout);
    };
  }, [authenticated, walletAddress, userId, updateCustodialBalance]);

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

  // 🚀 OPTIMIZED: Wallet balance fetch with controlled timing
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

  // 🚀 FIXED: Implement exact XP calculation locally to ensure it works
  const calculateLevelProgressLocal = useCallback((userData: {
    level?: number;
    experience_points?: number;
    total_games_played?: number;
    win_rate?: number;
  }) => {
    const {
      level = 1,
      experience_points = 0,
      total_games_played = 0,
      win_rate = 0
    } = userData;

    // 🎯 EXACT same XP requirements as your API
    const getXPRequirement = (level: number): number => {
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
    };

    const currentLevelXP = getXPRequirement(level);
    const nextLevelXP = getXPRequirement(level + 1);
    const xpNeededThisLevel = nextLevelXP - currentLevelXP;
    const xpProgressThisLevel = Math.max(0, experience_points - currentLevelXP);
    
    let progressPercentage = Math.min(100, (xpProgressThisLevel / xpNeededThisLevel) * 100);

    // 🎯 EXACT same bonus progress for early levels as your API
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
      canLevelUp: readyToLevelUp
    };
  }, []);

  // 🚀 FIXED: Use exact same XP system as leaderboard with local calculation
  const fetchLevelData = useCallback(async () => {
    if (!userId) {
      setLevelData({
        level: 1,
        experience: 0,
        experiencePoints: 0,
        experienceToNextLevel: 25, // Match API: Level 2 needs 25 XP
        progressPercentage: 0,
        isEarlyLevel: true,
        readyToLevelUp: false,
        xpThisLevel: 0,
        xpNeededThisLevel: 25
      });
      return;
    }

    setIsLoadingLevel(true);
    try {
      console.log(`🎯 Dashboard: Fetching enhanced level data for user ${userId}`);
      
      const { data: user, error } = await supabase
        .from('users_unified')
        .select('level, experience, experience_points, badges_earned, achievements, total_games_played, win_rate')
        .eq('id', userId)
        .single();

      if (error || !user) {
        console.error('❌ Failed to fetch level data:', error);
        return;
      }

      const currentLevel = user.level || 1;
      const currentXP = user.experience_points || 0;
      const gamesPlayed = user.total_games_played || 0;
      const winRate = user.win_rate || 0;
      
      console.log(`🎯 Dashboard: Raw user data:`, {
        level: currentLevel,
        xp: currentXP,
        games: gamesPlayed,
        winRate: winRate
      });
      
      // 🚀 TRY UserAPI first, fallback to local calculation
      let levelProgress;
      try {
        console.log('🔄 Trying UserAPI.calculateLevelProgress...');
        levelProgress = UserAPI.calculateLevelProgress({
          level: currentLevel,
          experience_points: currentXP,
          total_games_played: gamesPlayed,
          win_rate: winRate
        });
        console.log('✅ UserAPI method worked:', levelProgress);
      } catch (apiError) {
        console.warn('⚠️ UserAPI method failed, using local calculation:', apiError);
        levelProgress = calculateLevelProgressLocal({
          level: currentLevel,
          experience_points: currentXP,
          total_games_played: gamesPlayed,
          win_rate: winRate
        });
        console.log('✅ Local calculation result:', levelProgress);
      }

      // 🚀 FIXED: Use the exact same properties that UserAPI returns
      const newLevelData = {
        level: currentLevel,
        experience: user.experience || 0,
        experiencePoints: currentXP,
        experienceToNextLevel: levelProgress.xpNeeded || 0,
        progressPercentage: levelProgress.progressPercentage || 0,
        // Use the exact properties from calculation result
        isEarlyLevel: levelProgress.isEarlyLevel || false,
        readyToLevelUp: levelProgress.readyToLevelUp || false,
        xpThisLevel: levelProgress.xpThisLevel || 0,
        xpNeededThisLevel: levelProgress.xpNeededThisLevel || 25
      };

      console.log(`🎯 Dashboard: Final level data being set:`, newLevelData);
      
      // Force a visual update
      setLevelData(newLevelData);

      // 🚀 EXTRA DEBUG: Log the specific progress calculation
      console.log(`📊 Progress Bar Debug:`, {
        'Progress Percentage': newLevelData.progressPercentage,
        'CSS Width': `${Math.max(5, newLevelData.progressPercentage)}%`,
        'XP This Level': newLevelData.xpThisLevel,
        'XP Needed This Level': newLevelData.xpNeededThisLevel,
        'Is Early Level': newLevelData.isEarlyLevel,
        'Ready to Level Up': newLevelData.readyToLevelUp
      });

    } catch (error) {
      console.error('❌ Error fetching enhanced level data:', error);
    } finally {
      setIsLoadingLevel(false);
    }
  }, [userId, supabase, calculateLevelProgressLocal]);

  useEffect(() => {
    if (userId) {
      fetchLevelData();
    }
  }, [userId, fetchLevelData]);

  // Enhanced: Live dashboard stats
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
        const errorDetails = error instanceof Error && 'details' in error ? (error as any).details : 'No details';
        
        console.log('🔍 Debug info:', {
          userId,
          walletAddress,
          errorMessage,
          errorDetails
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

  // NEW: Add this separate effect for LIVE stats updates via socket events
  useEffect(() => {
    if (!userId) return;
    
    const socket = (window as any).gameSocket;
    if (!socket) return;
    
    console.log(`📊 Dashboard: Setting up LIVE stats listeners for user: ${userId}`);
    
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
        
        // Also refresh recent activity
        setTimeout(() => {
          fetchRecentActivity();
        }, 2000);
        
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
        
        // Also refresh recent activity
        setTimeout(() => {
          fetchRecentActivity();
        }, 2000);
        
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
      
      // Refresh recent activity for all game ends
      setTimeout(() => {
        fetchRecentActivity();
      }, 3000);
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
        
        // Refresh recent activity after bet result
        setTimeout(() => {
          fetchRecentActivity();
        }, 1500);
      }
    };

    // 🚀 NEW: Enhanced XP system events
    const handleXPGained = (data: any) => {
      if (data.userId === userId) {
        console.log(`🎯 Dashboard LIVE: XP gained for ${userId}:`, data);
        
        // Show XP notification with multiplier info
        const multiplierText = data.multiplier > 1 ? ` (${data.multiplier}x boost!)` : '';
        toast.success(`+${data.amount} XP${multiplierText}`, {
          duration: 3000,
          position: 'top-center',
          icon: '⭐'
        });
        
        // Refresh level data
        setTimeout(() => {
          fetchLevelData();
        }, 1000);
      }
    };

    const handleLevelUp = (data: any) => {
      if (data.userId === userId) {
        console.log(`🎉 Dashboard LIVE: Level up for ${userId}:`, data);
        
        // Show level up celebration
        toast.success(`🎉 Level Up! You reached Level ${data.newLevel}!`, {
          duration: 6000,
          position: 'top-center',
          icon: '🎊'
        });
        
        // Refresh level data immediately
        fetchLevelData();
        
        // Also refresh stats as level ups may affect other metrics
        refreshStatsDebounced();
      }
    };

    socket.on('custodialBetPlaced', handleCustodialBetPlaced);
    socket.on('custodialCashout', handleCustodialCashout);
    socket.on('gameEnd', handleGameEnd);
    socket.on('userStatsUpdate', handleUserStatsUpdate);
    socket.on('betResult', handleBetResult);
    // 🚀 NEW: XP system events
    socket.on('xpGained', handleXPGained);
    socket.on('levelUp', handleLevelUp);
    
    return () => {
      console.log(`📊 Dashboard: Cleaning up LIVE stats listeners for user: ${userId}`);
      socket.off('custodialBetPlaced', handleCustodialBetPlaced);
      socket.off('custodialCashout', handleCustodialCashout);
      socket.off('gameEnd', handleGameEnd);
      socket.off('userStatsUpdate', handleUserStatsUpdate);
      socket.off('betResult', handleBetResult);
      // 🚀 NEW: Clean up XP system events
      socket.off('xpGained', handleXPGained);
      socket.off('levelUp', handleLevelUp);
      
      if (statsRefreshTimeout) {
        clearTimeout(statsRefreshTimeout);
      }
    };
  }, [userId, fetchRecentActivity, fetchLevelData]);

  // ENHANCED: Updated refreshData function with better feedback
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
        console.log('🎯 Dashboard: Enhanced level data refreshed');
      } catch (error) {
        console.error('❌ Dashboard: Failed to refresh enhanced level data:', error);
      }
      
      // 🚀 NEW: Refresh recent activity
      try {
        await fetchRecentActivity();
        console.log('📊 Dashboard: Recent activity refreshed');
      } catch (error) {
        console.error('❌ Dashboard: Failed to refresh recent activity:', error);
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
  }, [isValidWallet, userId, walletAddress, refreshCustodialBalance, fetchLevelData, fetchRecentActivity]);

  // OPTIMIZED: Real-time socket listeners WITHOUT automatic stats refresh
  useEffect(() => {
    if (!userId || !walletAddress) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Dashboard: Setting up optimized real-time listeners for user: ${userId}`);
      
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

      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 Dashboard: Cleaning up optimized real-time listeners for user: ${userId}`);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        
        if (walletRefreshTimeout) clearTimeout(walletRefreshTimeout);
      };
    }
  }, [userId, walletAddress]);

  // Helper functions for mobile-friendly formatting
  const formatXP = (xp: number) => {
    if (xp >= 10000) return `${(xp / 1000).toFixed(1)}k`;
    return xp.toLocaleString();
  };

  const formatSOL = (amount: number) => {
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
    return amount.toFixed(3);
  };

  // 🚀 NEW: Enhanced XP system helper functions
  const getLevelInfo = (level: number) => {
    const tier = Math.ceil(level / 10);
    const isEarlyLevel = level <= 3;
    
    if (isEarlyLevel) {
      return { 
        tierText: 'Rookie', 
        color: 'text-green-400', 
        bgColor: 'bg-green-600/20',
        icon: '🌱',
        description: 'Early Level Boost Active!'
      };
    }
    
    if (level <= 8) {
      return { 
        tierText: 'Rising', 
        color: 'text-blue-400', 
        bgColor: 'bg-blue-600/20',
        icon: '⭐',
        description: 'Building momentum'
      };
    }

    if (tier <= 2) {
      return { 
        tierText: `Tier ${tier}`, 
        color: 'text-purple-400', 
        bgColor: 'bg-purple-600/20',
        icon: '💎',
        description: 'Advanced player'
      };
    }

    return { 
      tierText: `Elite T${tier}`, 
      color: 'text-yellow-400', 
      bgColor: 'bg-yellow-600/20',
      icon: '👑',
      description: 'Elite performer'
    };
  };

  // Loading state while Privy initializes
  if (!ready) {
    return (
      <Layout>
        <div className="scrollable-page-container">
          <div className="scrollable-content-area">
            <div className="scrollable-inner-content">
              <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
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
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
              
              {/* 🚀 ENHANCED: Compact Header with mobile optimization */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
                <div className="flex items-center">
                  <Trophy className="text-yellow-400 mr-2 sm:mr-3" size={24} />
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5">Player Performance Center</p>
                  </div>
                </div>
                
                {(isValidWallet && userId) && (
                  <button
                    onClick={refreshData}
                    className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors text-sm disabled:opacity-50"
                    disabled={isManualRefreshing}
                  >
                    <RefreshCw size={14} className={`mr-2 ${isManualRefreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                    <span className="sm:hidden">↻</span>
                  </button>
                )}
              </div>

              {/* 🚀 ENHANCED: Compact Player Profile with mobile-first design */}
              {isValidWallet && userId && (
                <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
                  {isLoadingLevel ? (
                    <div className="animate-pulse space-y-3">
                      <div className="h-4 bg-gray-700 rounded w-24"></div>
                      <div className="h-3 bg-gray-700 rounded w-full"></div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="h-12 bg-gray-700 rounded"></div>
                        <div className="h-12 bg-gray-700 rounded"></div>
                        <div className="h-12 bg-gray-700 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Compact Level Section */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-purple-600 rounded-full w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
                            <span className="text-white font-bold text-sm sm:text-lg">{levelData.level}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-white font-bold text-base sm:text-lg">Level {levelData.level}</h3>
                              {/* 🚀 ENHANCED: Early level boost indicator */}
                              {levelData.isEarlyLevel && (
                                <span className="text-xs bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded font-medium border border-yellow-400/30">
                                  🚀 3x XP BOOST
                                </span>
                              )}
                              {/* 🚀 NEW: Ready to level up indicator */}
                              {levelData.readyToLevelUp && (
                                <span className="text-xs bg-green-400/20 text-green-400 px-2 py-0.5 rounded font-medium border border-green-400/30 animate-pulse">
                                  🎉 READY!
                                </span>
                              )}
                            </div>
                            <p className="text-gray-400 text-xs sm:text-sm">
                              {formatXP(levelData.experiencePoints)} XP
                              {/* 🚀 NEW: Show level progress in subtitle */}
                              {levelData.readyToLevelUp ? (
                                <span className="text-green-400 ml-2">• Ready to level up!</span>
                              ) : levelData.experienceToNextLevel > 0 && (
                                <span className="text-purple-400 ml-2">• {formatXP(levelData.experienceToNextLevel)} needed</span>
                              )}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-purple-400 font-semibold text-xs sm:text-sm">
                            {/* 🚀 ENHANCED: Better level progress display */}
                            {levelData.readyToLevelUp ? (
                              <span className="text-green-400 font-bold">Ready to Level Up! 🎉</span>
                            ) : levelData.experienceToNextLevel > 0 ? (
                              `${formatXP(levelData.experienceToNextLevel)} to L${levelData.level + 1}`
                            ) : (
                              "Max Level!"
                            )}
                          </p>
                        </div>
                      </div>
                      
                      {/* 🚀 ENHANCED: Enhanced Progress Bar with tier-based styling */}
                      <div className="relative">
                        <div className="w-full bg-gray-700 rounded-full h-2 sm:h-3">
                          <div 
                            className={`h-2 sm:h-3 rounded-full transition-all duration-700 ease-out relative ${
                              levelData.isEarlyLevel 
                                ? 'bg-gradient-to-r from-green-400 via-yellow-400 to-orange-400' 
                                : levelData.readyToLevelUp
                                  ? 'bg-gradient-to-r from-yellow-400 to-green-400 animate-pulse'
                                  : 'bg-gradient-to-r from-purple-500 via-blue-500 to-purple-600'
                            }`}
                            style={{ 
                              width: `${Math.max(5, levelData.progressPercentage || 0)}%`,
                              minWidth: levelData.progressPercentage > 0 ? '8px' : '5%'
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full blur-sm opacity-60"></div>
                            {/* 🚀 NEW: Ready to level up bouncing indicator */}
                            {levelData.readyToLevelUp && (
                              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-400 rounded-full animate-bounce"></div>
                            )}
                            {/* 🚀 NEW: Close to level up pulsing indicator */}
                            {!levelData.readyToLevelUp && levelData.experienceToNextLevel <= 50 && levelData.experienceToNextLevel > 0 && (
                              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-gray-400">
                          <span>{(levelData.progressPercentage || 0).toFixed(1)}%</span>
                          <span className="hidden sm:inline">
                            {/* 🚀 NEW: Enhanced progress text with debugging */}
                            {levelData.readyToLevelUp ? 'Ready!' : `${formatXP(levelData.xpThisLevel || 0)} / ${formatXP(levelData.xpNeededThisLevel || 100)} XP`}
                          </span>
                          <span className="sm:hidden">L{levelData.level + 1}</span>
                        </div>
                        
                        {/* 🚀 DEBUG: Show progress calculation details in development */}
                        {process.env.NODE_ENV === 'development' && (
                          <div className="mt-1 text-xs text-yellow-400 bg-gray-800 p-1 rounded">
                            Progress: {(levelData.progressPercentage || 0).toFixed(2)}% | 
                            This Level: {levelData.xpThisLevel || 0} | 
                            Needed: {levelData.xpNeededThisLevel || 100} | 
                            To Next: {levelData.experienceToNextLevel || 0}
                          </div>
                        )}
                      </div>

                      {/* Compact Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 text-center">
                          <div className="text-lg sm:text-xl font-bold text-purple-400">{levelData.level}</div>
                          <div className="text-gray-400 text-xs">Level</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 text-center">
                          <div className="text-lg sm:text-xl font-bold text-blue-400">{formatXP(levelData.experiencePoints)}</div>
                          <div className="text-gray-400 text-xs">Total XP</div>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 text-center">
                          <div className={`text-lg sm:text-xl font-bold ${levelData.readyToLevelUp ? 'text-green-400' : 'text-green-400'}`}>
                            {levelData.readyToLevelUp ? '🎉' : formatXP(levelData.experienceToNextLevel)}
                          </div>
                          <div className="text-gray-400 text-xs">
                            {levelData.readyToLevelUp ? 'Ready!' : 'To Next'}
                          </div>
                        </div>
                      </div>

                      {/* 🚀 NEW: Next level rewards preview for close players */}
                      {!levelData.readyToLevelUp && levelData.experienceToNextLevel > 0 && levelData.experienceToNextLevel <= 200 && (
                        <div className="mt-3 p-2 bg-purple-600/20 border border-purple-600/30 rounded text-xs text-purple-300">
                          <div className="font-medium mb-1">🎁 Next Level Rewards:</div>
                          <div className="text-gray-400">
                            • Increased XP multiplier • New achievement tier • Bonus features
                          </div>
                        </div>
                      )}

                      {/* 🚀 NEW: Early level boost explanation */}
                      {levelData.isEarlyLevel && (
                        <div className="mt-3 p-2 bg-yellow-600/20 border border-yellow-600/30 rounded text-xs text-yellow-300">
                          <div className="font-medium mb-1">🚀 Early Player Boost Active!</div>
                          <div className="text-gray-400">
                            You're earning 3x XP for your first few levels. Keep playing to level up fast!
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 🚀 ENHANCED: Compact Wallet & Balance Section */}
              <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6 mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4 flex items-center">
                  <Wallet size={18} className="mr-2" />
                  Wallet & Balance
                </h2>
                
                {!authenticated ? (
                  <div className="text-center py-4 sm:py-6">
                    <p className="text-gray-400 mb-3 text-sm">Please log in to view your wallet and stats</p>
                    <button 
                      onClick={() => window.location.href = '/'}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                    >
                      Login
                    </button>
                  </div>
                ) : isValidWallet ? (
                  <div className="space-y-4">
                    {/* Compact Wallet Address */}
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="text-gray-400 mb-1 text-xs">Wallet Address</div>
                      <div className="text-white font-mono text-xs sm:text-sm">
                        {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 6)}
                      </div>
                      <div className="text-green-400 text-xs mt-1">✓ Connected</div>
                    </div>
                    
                    {/* Enhanced Balance Cards - Mobile optimized */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className={`bg-gray-800/50 rounded-lg p-3 sm:p-4 border-l-4 border-green-400 transition-all duration-500 ${
                        custodialBalanceLoading ? 'ring-2 ring-green-400/30' : ''
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-green-400 text-sm flex items-center">
                            <span className="mr-2">🎮</span>
                            <span className="hidden sm:inline">Game Balance</span>
                            <span className="sm:hidden">Game</span>
                          </div>
                          {custodialBalanceLoading && (
                            <div className="animate-spin h-3 w-3 border border-green-400 border-t-transparent rounded-full"></div>
                          )}
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-green-400">
                          {custodialBalanceLoading ? (
                            <span className="text-sm">Loading...</span>
                          ) : (
                            `${formatSOL(custodialBalance)} SOL`
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          <span className="hidden sm:inline">For gaming • Updated: </span>
                          <span className="sm:hidden">Updated: </span>
                          {custodialLastUpdated ? new Date(custodialLastUpdated).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : 'Never'}
                        </div>
                      </div>
                      
                      <div className={`bg-gray-800/50 rounded-lg p-3 sm:p-4 border-l-4 border-blue-400 transition-all duration-500 ${
                        isLoadingBalance ? 'ring-2 ring-blue-400/30' : ''
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-blue-400 text-sm flex items-center">
                            <span className="mr-2">💼</span>
                            <span className="hidden sm:inline">Wallet Balance</span>
                            <span className="sm:hidden">Wallet</span>
                          </div>
                          {isLoadingBalance && (
                            <div className="animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full"></div>
                          )}
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-blue-400">
                          {isLoadingBalance ? (
                            <span className="text-sm">Loading...</span>
                          ) : (
                            `${formatSOL(walletBalance)} SOL`
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          <span className="hidden sm:inline">For deposits • Embedded wallet</span>
                          <span className="sm:hidden">For deposits</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Balance transfer hint - mobile optimized */}
                    {walletBalance > 0.001 && (
                      <div className="bg-yellow-900/30 border border-yellow-800/50 rounded-lg p-3">
                        <div className="text-yellow-400 text-xs sm:text-sm flex items-center">
                          <span className="mr-2">💡</span>
                          <span className="hidden sm:inline">Transfer SOL from wallet to game balance to start playing</span>
                          <span className="sm:hidden">Transfer SOL to game balance to play</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 sm:py-6">
                    <p className="text-yellow-400 mb-2 text-sm">Wallet connection issue</p>
                    <p className="text-gray-400 text-xs">Please reconnect your wallet</p>
                  </div>
                )}
              </div>

              {/* 🚀 ENHANCED: Compact Game Statistics with mobile grid */}
              {isValidWallet && (
                <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6 mb-4 sm:mb-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4 gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center">
                      <TrendingUp size={18} className="mr-2" />
                      <span className="hidden sm:inline">Game Statistics</span>
                      <span className="sm:hidden">Stats</span>
                      {isStatsUpdating && (
                        <div className="ml-2 flex items-center text-green-400 text-xs">
                          <div className="animate-pulse w-1.5 h-1.5 bg-green-400 rounded-full mr-1"></div>
                          Live
                        </div>
                      )}
                    </h2>
                    
                    <div className="text-xs text-gray-500 self-end sm:self-auto">
                      {statsLastUpdated > 0 && (
                        <span>Updated: {new Date(statsLastUpdated).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                      )}
                    </div>
                  </div>
                  
                  {isLoadingStats ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-3 bg-gray-700 rounded w-16 mb-2"></div>
                          <div className="h-6 bg-gray-700 rounded w-12"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {/* Primary Stats - Mobile optimized grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                        <div className={`bg-gray-800/50 rounded-lg p-3 transition-all duration-500 ${
                          isStatsUpdating ? 'ring-2 ring-blue-400/30' : ''
                        }`}>
                          <div className="text-gray-400 mb-1 text-xs">Wagered</div>
                          <div className="text-lg sm:text-xl font-bold text-white">
                            {formatSOL(userStats.totalWagered)}
                          </div>
                          <div className="text-gray-400 text-xs">SOL</div>
                        </div>
                        
                        <div className={`bg-gray-800/50 rounded-lg p-3 transition-all duration-500 ${
                          isStatsUpdating ? 'ring-2 ring-green-400/30' : ''
                        }`}>
                          <div className="text-gray-400 mb-1 text-xs">Won</div>
                          <div className="text-lg sm:text-xl font-bold text-green-400">
                            {formatSOL(userStats.totalPayouts)}
                          </div>
                          <div className="text-gray-400 text-xs">SOL</div>
                        </div>
                        
                        <div className={`bg-gray-800/50 rounded-lg p-3 transition-all duration-500 ${
                          isStatsUpdating ? 'ring-2 ring-purple-400/30' : ''
                        }`}>
                          <div className="text-gray-400 mb-1 text-xs">Games</div>
                          <div className="text-lg sm:text-xl font-bold text-white">
                            {userStats.gamesPlayed}
                          </div>
                          <div className="text-gray-400 text-xs">Played</div>
                        </div>
                        
                        <div className={`bg-gray-800/50 rounded-lg p-3 transition-all duration-500 ${
                          isStatsUpdating ? 'ring-2 ring-yellow-400/30' : ''
                        }`}>
                          <div className="text-gray-400 mb-1 text-xs">P&L</div>
                          <div className={`text-lg sm:text-xl font-bold ${userStats.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {userStats.profitLoss >= 0 ? '+' : ''}{formatSOL(Math.abs(userStats.profitLoss))}
                          </div>
                          <div className="text-gray-400 text-xs">SOL</div>
                        </div>
                      </div>

                      {/* Enhanced Stats - Compact mobile layout */}
                      {(enhancedUserStats.winRate > 0 || enhancedUserStats.bestMultiplier > 0 || userStats.gamesPlayed > 0) && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-gray-700">
                          <div className={`bg-gray-800/30 rounded-lg p-3 transition-all duration-500 ${
                            isStatsUpdating ? 'ring-1 ring-blue-400/20' : ''
                          }`}>
                            <div className="text-gray-400 mb-1 text-xs">Win Rate</div>
                            <div className="text-base sm:text-lg font-bold text-blue-400">
                              {enhancedUserStats.winRate.toFixed(1)}%
                            </div>
                          </div>
                          
                          <div className={`bg-gray-800/30 rounded-lg p-3 transition-all duration-500 ${
                            isStatsUpdating ? 'ring-1 ring-purple-400/20' : ''
                          }`}>
                            <div className="text-gray-400 mb-1 text-xs">Best Multi</div>
                            <div className="text-base sm:text-lg font-bold text-purple-400">
                              {enhancedUserStats.bestMultiplier.toFixed(2)}x
                            </div>
                          </div>
                          
                          <div className={`bg-gray-800/30 rounded-lg p-3 transition-all duration-500 ${
                            isStatsUpdating ? 'ring-1 ring-yellow-400/20' : ''
                          }`}>
                            <div className="text-gray-400 mb-1 text-xs">Streak</div>
                            <div className="text-base sm:text-lg font-bold text-yellow-400">
                              {enhancedUserStats.currentWinStreak}
                            </div>
                          </div>
                          
                          <div className={`bg-gray-800/30 rounded-lg p-3 transition-all duration-500 ${
                            isStatsUpdating ? 'ring-1 ring-orange-400/20' : ''
                          }`}>
                            <div className="text-gray-400 mb-1 text-xs">Best</div>
                            <div className="text-base sm:text-lg font-bold text-orange-400">
                              {enhancedUserStats.bestWinStreak}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Live stats indicator */}
                      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-700/50">
                        <div className="flex items-center text-xs text-gray-500">
                          <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                          <span className="hidden sm:inline">Stats update automatically when you play</span>
                          <span className="sm:hidden">Live stats • Auto-sync</span>
                          {statsLastUpdated > 0 && (
                            <span className="ml-2">• {new Date(statsLastUpdated).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Referral Section - Compact for mobile */}
              {(isValidWallet && userId) && (
                <div className="mb-4 sm:mb-6">
                  <ReferralSection 
                    userId={userId} 
                    walletAddress={walletAddress} 
                    isValidWallet={isValidWallet} 
                  />
                </div>
              )}

              {/* 🚀 ENHANCED: Compact Quick Actions & Recent Activity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center">
                    <Zap size={16} className="mr-2" />
                    Quick Actions
                  </h3>
                  <div className="space-y-2 sm:space-y-3">
                    <Link 
                      href="/" 
                      className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors text-center text-sm sm:text-base"
                    >
                      <GamepadIcon size={16} className="inline mr-2" />
                      <span className="hidden sm:inline">Play RUGGED</span>
                      <span className="sm:hidden">Play Game</span>
                    </Link>
                    <Link 
                      href="/leaderboard" 
                      className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors text-center text-sm sm:text-base"
                    >
                      <Trophy size={16} className="inline mr-2" />
                      <span className="hidden sm:inline">View Leaderboard</span>
                      <span className="sm:hidden">Leaderboard</span>
                    </Link>
                  </div>
                </div>
                
                {/* 🚀 NEW: Enhanced Recent Activity with Trade History */}
                <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center">
                    <Award size={16} className="mr-2" />
                    Recent Activity
                    {isLoadingActivity && (
                      <div className="ml-2 animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full"></div>
                    )}
                  </h3>
                  
                  {isLoadingActivity ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="animate-pulse flex items-center space-x-3 p-2">
                          <div className="h-3 w-3 bg-gray-700 rounded-full"></div>
                          <div className="flex-1 space-y-1">
                            <div className="h-3 bg-gray-700 rounded w-3/4"></div>
                            <div className="h-2 bg-gray-700 rounded w-1/2"></div>
                          </div>
                          <div className="h-3 w-12 bg-gray-700 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : recentActivity.length > 0 ? (
                    <div className="space-y-3">
                      {recentActivity.slice(0, 5).map((trade: any, index: number) => (
                        <div 
                          key={trade.id || index}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            trade.was_winner
                              ? 'border-green-600/30 bg-green-600/10'
                              : 'border-red-600/30 bg-red-600/10'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {trade.was_winner ? (
                              <TrendingUp className="text-green-400" size={16} />
                            ) : (
                              <TrendingDown className="text-red-400" size={16} />
                            )}
                            <div>
                              <div className="text-white text-sm font-medium flex items-center">
                                {trade.bet_amount.toFixed(3)}
                                <SolanaLogo size={12} className="ml-1" />
                                {trade.cashout_multiplier && (
                                  <span className="text-gray-400 ml-2 text-xs">
                                    @ {trade.cashout_multiplier.toFixed(2)}x
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-400 text-xs">
                                {new Date(trade.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bold text-sm ${trade.was_winner ? 'text-green-400' : 'text-red-400'}`}>
                              {trade.return_percentage > 0 ? '+' : ''}{trade.return_percentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {activityLastUpdated > 0 && (
                        <div className="text-center pt-2 border-t border-gray-700">
                          <div className="text-xs text-gray-500">
                            Updated: {new Date(activityLastUpdated).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-400 text-center py-4 sm:py-6">
                      {isValidWallet ? (
                        <div className="space-y-2">
                          <AlertCircle size={32} className="mx-auto text-gray-600" />
                          <p className="text-sm">No recent activity</p>
                          <p className="text-xs text-gray-500">Start playing to see your trades here</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Users size={32} className="mx-auto text-gray-600" />
                          <p className="text-sm">Login to view activity</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom spacing for mobile scroll */}
              <div className="h-8 sm:h-16"></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;