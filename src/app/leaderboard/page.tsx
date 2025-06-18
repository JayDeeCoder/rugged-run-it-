// src/app/leaderboard/page.tsx - ENHANCED with TOP 10 and USER STATS
'use client';

import { FC, useState, useEffect, useRef, useCallback } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { useUser } from '../../context/UserContext';
import { Trophy, RefreshCw, TrendingUp, Users, Award, Crown, Medal, Target, Star, Zap, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { LeaderboardAPI, LeaderboardEntry, UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { sharedSocket } from '../../services/sharedSocket';

type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';

interface UserStats {
  totalGames: number;
  totalWinnings: number;
  totalLosses: number;
  winRate: number;
  bestMultiplier: number;
  currentStreak: number;
  level: number;
  experiencePoints: number;
}

// 🚀 ENHANCED: XP System Integration
const useEnhancedXPSystem = () => {
  const calculateLevelProgress = useCallback((user: LeaderboardEntry) => {
    return UserAPI.calculateLevelProgress({
      level: user.level,
      experience_points: user.experience_points,
      total_games_played: user.games_played,
      win_rate: user.win_rate
    });
  }, []);

  const getXPRequirement = useCallback((level: number) => {
    return UserAPI.getXPRequirement(level);
  }, []);

  const formatXP = useCallback((xp: number) => {
    if (xp >= 10000) {
      return `${(xp / 1000).toFixed(1)}k`;
    }
    return xp.toLocaleString();
  }, []);

  const getLevelInfo = useCallback((level: number) => {
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
  }, []);

  return {
    calculateLevelProgress,
    getXPRequirement,
    formatXP,
    getLevelInfo
  };
};

// Socket connection hook (unchanged)
const useSocketConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<any>(null);
  const connectionMonitorRef = useRef<NodeJS.Timeout | null>(null);

  const initializeSocket = useCallback(async () => {
    try {
      console.log('🔌 RuggerBoard: Initializing socket connection...');
      const socket = await sharedSocket.getSocket();
      
      if (socket) {
        socketRef.current = socket;
        setIsConnected(socket.connected);
        setError(null);
        setConnectionAttempts(0);
        
        console.log('✅ RuggerBoard: Socket initialized successfully');
        
        sharedSocket.emit('pageActivity', { 
          page: 'ruggerboard',
          action: 'active',
          timestamp: Date.now()
        });
        
        return true;
      } else {
        console.error('❌ RuggerBoard: Failed to get socket');
        setIsConnected(false);
        setError('Failed to connect to game server');
        setConnectionAttempts(prev => prev + 1);
        return false;
      }
    } catch (err) {
      console.error('❌ RuggerBoard: Socket initialization error:', err);
      setIsConnected(false);
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnectionAttempts(prev => prev + 1);
      return false;
    }
  }, []);

  const signalPageActivity = useCallback(() => {
    if (sharedSocket.isConnected()) {
      console.log('📍 RuggerBoard: Signaling page activity (non-destructive)');
      sharedSocket.emit('pageActivity', { 
        page: 'ruggerboard',
        action: 'active',
        timestamp: Date.now()
      });
    }
  }, []);

  const signalPageInactive = useCallback(() => {
    if (sharedSocket.isConnected()) {
      console.log('📍 RuggerBoard: Signaling page inactive (preserving game state)');
      sharedSocket.emit('pageActivity', { 
        page: 'ruggerboard',
        action: 'inactive',
        timestamp: Date.now()
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const success = await initializeSocket();
      
      if (mounted && success) {
        connectionMonitorRef.current = setInterval(() => {
          const connected = sharedSocket.isConnected();
          if (connected !== isConnected) {
            setIsConnected(connected);
            console.log(`🔌 RuggerBoard: Connection status changed: ${connected}`);
            
            if (connected) {
              setError(null);
              setConnectionAttempts(0);
              signalPageActivity();
            }
          }
        }, 2000);
      }
    };

    init();

    return () => {
      mounted = false;
      if (connectionMonitorRef.current) {
        clearInterval(connectionMonitorRef.current);
      }
      signalPageInactive();
    };
  }, [initializeSocket, isConnected, signalPageActivity, signalPageInactive]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('👁️ RuggerBoard: Page hidden - signaling inactive');
        signalPageInactive();
      } else {
        console.log('👁️ RuggerBoard: Page visible - signaling active');
        signalPageActivity();
      }
    };

    const handleBeforeUnload = () => {
      console.log('🚪 RuggerBoard: Page unloading - final inactive signal');
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
    signalPageInactive,
    socket: socketRef.current
  };
};

const LeaderboardPage: FC = () => {
  // Hooks
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { isAuthenticated } = useUser();
  const router = useRouter();
  
  const { 
    calculateLevelProgress,
    getXPRequirement,
    formatXP,
    getLevelInfo
  } = useEnhancedXPSystem();
  
  const { 
    isConnected: socketConnected, 
    connectionAttempts, 
    error: socketError,
    signalPageActivity,
    socket
  } = useSocketConnection();

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      (window as any).debugSharedSocket = () => {
        console.log('🔍 RuggerBoard: Shared socket status:', sharedSocket.getStatus());
        sharedSocket.debugSubscriptions();
      };
    }
  }, []);
  
  // State
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('daily');
  const [refreshing, setRefreshing] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({
    totalGames: 0,
    totalWinnings: 0,
    totalLosses: 0,
    winRate: 0,
    bestMultiplier: 0,
    currentStreak: 0,
    level: 0,
    experiencePoints: 0
  });
  const [userRank, setUserRank] = useState<number | null>(null);
  const [currentUserData, setCurrentUserData] = useState<LeaderboardEntry | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Real-time state
  const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);
  const [lastRealTimeUpdate, setLastRealTimeUpdate] = useState<number>(0);
  const [pendingUpdates, setPendingUpdates] = useState<number>(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Real-time update tracking
  const realTimeUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const socketListenersSetup = useRef(false);
  const lastPeriodRef = useRef<Period>(period);

  // Get current user's wallet
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const currentUserWallet = embeddedWallet?.address || '';

  // Update real-time connection status
  useEffect(() => {
    setIsRealTimeConnected(socketConnected);
  }, [socketConnected]);

  // User initialization
  useEffect(() => {
    const initUser = async () => {
      if (!authenticated || !currentUserWallet) {
        setUserId(null);
        setCurrentUserData(null);
        return;
      }

      try {
        console.log(`🔍 RuggerBoard: Getting user ID for wallet: ${currentUserWallet}`);
        const userData = await UserAPI.getUserOrCreate(currentUserWallet);
        
        if (userData) {
          setUserId(userData.id);
          console.log(`✅ RuggerBoard: User ID set: ${userData.id}`);
          
          const userLeaderboardData = await LeaderboardAPI.getCurrentUserData(userData.id);
          setCurrentUserData(userLeaderboardData);
          
          // 🚀 NEW: Set user's personal stats
          if (userLeaderboardData) {
            setUserStats({
              totalGames: userLeaderboardData.games_played,
              totalWinnings: Math.max(0, userLeaderboardData.total_profit),
              totalLosses: Math.abs(Math.min(0, userLeaderboardData.total_profit)),
              winRate: userLeaderboardData.win_rate,
              bestMultiplier: userLeaderboardData.best_multiplier,
              currentStreak: userLeaderboardData.current_win_streak,
              level: userLeaderboardData.level,
              experiencePoints: userLeaderboardData.experience_points
            });
          }
          
          if (socketConnected) {
            console.log(`📡 RuggerBoard: Signaling user activity...`);
            signalPageActivity();
          }
        }
      } catch (error) {
        console.error('❌ RuggerBoard: Error initializing user:', error);
      }
    };

    initUser();
  }, [authenticated, currentUserWallet, socketConnected, signalPageActivity]);

  // Debounced real-time leaderboard refresh
  const debouncedLeaderboardRefresh = useCallback(() => {
    if (!autoRefreshEnabled) {
      console.log('🔄 RuggerBoard: Auto-refresh disabled, skipping update');
      return;
    }

    if (realTimeUpdateRef.current) {
      clearTimeout(realTimeUpdateRef.current);
    }

    setPendingUpdates(prev => prev + 1);

    realTimeUpdateRef.current = setTimeout(async () => {
      console.log('🔄 RuggerBoard REAL-TIME: Refreshing top 10 data...');
      
      try {
        // 🚀 MODIFIED: Get top 10 only, ordered by total winnings
        const data = await LeaderboardAPI.getLeaderboard(period);
        const sortedByWinnings = data
          .sort((a, b) => Math.max(0, b.total_profit) - Math.max(0, a.total_profit))
          .slice(0, 10); // 🚀 TOP 10 ONLY
        
        setLeaderboardData(prevData => {
          if (JSON.stringify(prevData) !== JSON.stringify(sortedByWinnings)) {
            console.log(`✅ RuggerBoard REAL-TIME: Updated with top ${sortedByWinnings.length} entries`);
            setLastRealTimeUpdate(Date.now());
            return sortedByWinnings;
          }
          return prevData;
        });

        // Update user rank if authenticated
        if (isAuthenticated && currentUserWallet) {
          try {
            const rank = await LeaderboardAPI.getUserRank(currentUserWallet, period);
            setUserRank(rank);
          } catch (rankError) {
            console.warn('Could not fetch user rank:', rankError);
          }
        }

        // Refresh current user data and stats
        if (userId) {
          try {
            const userLeaderboardData = await LeaderboardAPI.getCurrentUserData(userId);
            setCurrentUserData(userLeaderboardData);
            
            // Update user stats
            if (userLeaderboardData) {
              setUserStats({
                totalGames: userLeaderboardData.games_played,
                totalWinnings: Math.max(0, userLeaderboardData.total_profit),
                totalLosses: Math.abs(Math.min(0, userLeaderboardData.total_profit)),
                winRate: userLeaderboardData.win_rate,
                bestMultiplier: userLeaderboardData.best_multiplier,
                currentStreak: userLeaderboardData.current_win_streak,
                level: userLeaderboardData.level,
                experiencePoints: userLeaderboardData.experience_points
              });
            }
          } catch (error) {
            console.warn('Could not refresh current user data:', error);
          }
        }

      } catch (error) {
        console.error('❌ RuggerBoard REAL-TIME: Refresh failed:', error);
      } finally {
        setPendingUpdates(prev => Math.max(0, prev - 1));
      }
    }, 3000);
  }, [period, isAuthenticated, currentUserWallet, userId, autoRefreshEnabled]);

  // Enhanced socket listeners with XP events
  useEffect(() => {
    if (!socketConnected || socketListenersSetup.current) return;

    console.log('🔌 RuggerBoard: Setting up ENHANCED socket listeners with XP tracking...');
    socketListenersSetup.current = true;

    const subscriptionIds: string[] = [];

    // Existing game events
    const handleGameEnd = (data: any) => {
      console.log('🎮 RuggerBoard: Game ended - triggering refresh');
      debouncedLeaderboardRefresh();
    };

    const handleCustodialCashout = (data: any) => {
      console.log('💸 RuggerBoard: Cashout processed - triggering refresh');
      debouncedLeaderboardRefresh();
    };

    const handleUserStatsUpdate = (data: any) => {
      console.log('📊 RuggerBoard: User stats updated - triggering refresh');
      debouncedLeaderboardRefresh();
    };

    // XP-specific events
    const handleXPGained = (data: any) => {
      console.log('🎯 RuggerBoard: XP gained event:', data);
      
      if (data.userId === userId) {
        const multiplierText = data.multiplier > 1 ? ` (${data.multiplier}x boost!)` : '';
        toast.success(`+${data.amount} XP${multiplierText}`, {
          duration: 3000,
          position: 'top-center',
          icon: '⭐'
        });
      }
      
      debouncedLeaderboardRefresh();
    };

    const handleLevelUp = (data: any) => {
      console.log('🎉 RuggerBoard: Level up event:', data);
      
      if (data.userId === userId) {
        toast.success(`🎉 Level Up! You reached Level ${data.newLevel}!`, {
          duration: 6000,
          position: 'top-center',
          icon: '🎊'
        });
      }
      
      debouncedLeaderboardRefresh();
    };

    const handleAutomaticBetLoss = (data: any) => {
      console.log('💥 RuggerBoard: Automatic bet loss resolved:', data);
      debouncedLeaderboardRefresh();
      
      if (data.userId === userId) {
        toast.error(`Bet lost: -${data.amount?.toFixed(3)} SOL (Crashed at ${data.crashMultiplier?.toFixed(2)}x)`, {
          duration: 4000,
          position: 'top-center'
        });
      }
    };

    // Subscribe to all events
    subscriptionIds.push(
      sharedSocket.subscribe('gameEnd', handleGameEnd, 'ruggerboard'),
      sharedSocket.subscribe('custodialCashout', handleCustodialCashout, 'ruggerboard'),
      sharedSocket.subscribe('userStatsUpdate', handleUserStatsUpdate, 'ruggerboard'),
      sharedSocket.subscribe('xpGained', handleXPGained, 'ruggerboard'),
      sharedSocket.subscribe('levelUp', handleLevelUp, 'ruggerboard'),
      sharedSocket.subscribe('automaticBetLoss', handleAutomaticBetLoss, 'ruggerboard')
    );

    return () => {
      console.log('🔌 RuggerBoard: Cleaning up ENHANCED socket listeners');
      
      subscriptionIds.forEach(id => sharedSocket.unsubscribe(id));
      
      if (realTimeUpdateRef.current) {
        clearTimeout(realTimeUpdateRef.current);
      }
      
      socketListenersSetup.current = false;
    };
  }, [socketConnected, debouncedLeaderboardRefresh, userId]);

  // Component cleanup
  useEffect(() => {
    return () => {
      console.log('🧹 RuggerBoard: Component unmounting - cleaning up all subscriptions');
      sharedSocket.unsubscribeComponent('ruggerboard');
      
      if (sharedSocket.isConnected()) {
        sharedSocket.emit('pageActivity', { 
          page: 'ruggerboard',
          action: 'unmount',
          timestamp: Date.now()
        });
      }
    };
  }, []);

  // Fetch leaderboard data
  const fetchLeaderboardData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      console.log(`🏆 RuggerBoard: Fetching ${period} top 10 data...`);

      const data = await LeaderboardAPI.getLeaderboard(period);
      
      if (data.length === 0) {
        console.warn('⚠️ No leaderboard data found for period:', period);
        setError(`No players found for ${getPeriodDisplayName(period).toLowerCase()}. Players need games and profit to appear.`);
        setLeaderboardData([]);
        return;
      }

      // 🚀 MODIFIED: Sort by total winnings and take top 10
      const sortedByWinnings = data
        .sort((a, b) => Math.max(0, b.total_profit) - Math.max(0, a.total_profit))
        .slice(0, 10);

      setLeaderboardData(sortedByWinnings);

      console.log(`✅ RuggerBoard: Loaded top ${sortedByWinnings.length} entries ordered by winnings`);

      // Get current user's rank
      if (isAuthenticated && currentUserWallet) {
        try {
          const rank = await LeaderboardAPI.getUserRank(currentUserWallet, period);
          setUserRank(rank);
        } catch (rankError) {
          console.warn('Could not fetch user rank:', rankError);
          setUserRank(null);
        }
      }

      // Refresh current user data and stats
      if (userId) {
        try {
          const userLeaderboardData = await LeaderboardAPI.getCurrentUserData(userId);
          setCurrentUserData(userLeaderboardData);
          
          if (userLeaderboardData) {
            setUserStats({
              totalGames: userLeaderboardData.games_played,
              totalWinnings: Math.max(0, userLeaderboardData.total_profit),
              totalLosses: Math.abs(Math.min(0, userLeaderboardData.total_profit)),
              winRate: userLeaderboardData.win_rate,
              bestMultiplier: userLeaderboardData.best_multiplier,
              currentStreak: userLeaderboardData.current_win_streak,
              level: userLeaderboardData.level,
              experiencePoints: userLeaderboardData.experience_points
            });
          }
        } catch (error) {
          console.warn('Could not refresh current user data:', error);
        }
      }

    } catch (err) {
      console.error('❌ RuggerBoard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load ruggerboard');
      setLeaderboardData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Effect to fetch data when period changes
  useEffect(() => {
    if (lastPeriodRef.current !== period) {
      console.log(`🔄 RuggerBoard: Period changed from ${lastPeriodRef.current} to ${period}`);
      lastPeriodRef.current = period;
      setLastRealTimeUpdate(0);
      setPendingUpdates(0);
    }

    fetchLeaderboardData();
  }, [period, isAuthenticated, currentUserWallet, userId]);

  // Manual refresh function
  const handleRefresh = useCallback(() => {
    console.log('🔄 RuggerBoard: Manual refresh triggered');
    fetchLeaderboardData(true);
    toast.success('RuggerBoard refreshed!', { duration: 2000 });
  }, [period, isAuthenticated, currentUserWallet, userId]);

  // Toggle auto-refresh
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled(prev => {
      const newValue = !prev;
      console.log(`🔄 RuggerBoard: Auto-refresh ${newValue ? 'enabled' : 'disabled'}`);
      
      if (newValue) {
        toast.success('Real-time updates enabled', { duration: 2000 });
      } else {
        toast('Real-time updates disabled', { duration: 2000 });
      }
      
      return newValue;
    });
  }, []);

  // Helper functions
  const getPeriodDisplayName = (period: Period) => {
    switch (period) {
      case 'daily': return 'Today';
      case 'weekly': return 'This Week';
      case 'monthly': return 'This Month';
      case 'all_time': return 'All Time';
      default: return 'Today';
    }
  };

  const getPeriodDescription = (period: Period) => {
    switch (period) {
      case 'daily': return 'Top 10 ruggers reset daily at midnight UTC';
      case 'weekly': return 'Top 10 ruggers reset weekly on Sunday';
      case 'monthly': return 'Top 10 ruggers reset monthly on the 1st';
      case 'all_time': return 'Top 10 all-time ruggers since launch';
      default: return '';
    }
  };

  return (
    <Layout>
      <div className="scrollable-page-container">
        <div className="scrollable-content-area">
          <div className="scrollable-inner-content">
            <div className="max-w-6xl mx-auto px-4 py-8">
              {/* Enhanced Header with Real-time Status */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center">
                  <div className="relative">
                    <Trophy className="text-yellow-400 mr-3" size={32} />
                    {leaderboardData.length > 0 && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    )}
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">RuggerBoard</h1>
                    <p className="text-gray-400">{getPeriodDisplayName(period)} Top 10</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-500">{getPeriodDescription(period)}</p>
                      
                      {/* Real-time status indicator with XP tracking */}
                      <div className="flex items-center gap-2">
                        {isRealTimeConnected ? (
                          <div className="flex items-center text-xs text-green-400">
                            <Wifi size={12} className="mr-1" />
                            <span>Live XP</span>
                            {pendingUpdates > 0 && (
                              <div className="ml-1 px-1 bg-green-500 text-white rounded-full text-xs">
                                {pendingUpdates}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center text-xs text-red-400">
                            <WifiOff size={12} className="mr-1" />
                            <span>Offline</span>
                            {connectionAttempts > 0 && (
                              <span className="ml-1">({connectionAttempts})</span>
                            )}
                          </div>
                        )}
                        
                        {socketError && (
                          <div className="text-xs text-yellow-400 ml-2" title={socketError}>
                            <AlertCircle size={12} />
                          </div>
                        )}
                        
                        {lastRealTimeUpdate > 0 && (
                          <span className="text-xs text-gray-500">
                            Updated: {new Date(lastRealTimeUpdate).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Enhanced controls with auto-refresh toggle */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleAutoRefresh}
                    className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                      autoRefreshEnabled 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    <Zap size={14} className="mr-1" />
                    <span className="hidden sm:inline">
                      {autoRefreshEnabled ? 'Live XP' : 'Manual'}
                    </span>
                  </button>
                  
                  <button
                    onClick={handleRefresh}
                    disabled={loading || refreshing}
                    className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </div>

              {/* User Level Info with NEW XP SYSTEM */}
              {isAuthenticated && currentUserData && (
                <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-6 mb-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="flex items-center">
                      <div className="mr-4">
                        <span className="text-3xl">{currentUserData.avatar}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg">{currentUserData.username}</h3>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-400 mb-2">
                          <span className="flex items-center">
                            <Crown size={14} className="mr-1 text-purple-400" />
                            Level {currentUserData.level}
                          </span>
                          <span>•</span>
                          <span className="flex items-center">
                            <Star size={14} className="mr-1 text-blue-400" />
                            {formatXP(currentUserData.experience_points)} XP
                          </span>
                          <span>•</span>
                          <span className="flex items-center">
                            <Medal size={14} className="mr-1 text-yellow-400" />
                            Tier {currentUserData.tier}
                          </span>
                        </div>

                        {(() => {
                          const levelInfo = getLevelInfo(currentUserData.level);
                          return (
                            <div className={`inline-flex items-center px-3 py-1 rounded-lg text-xs border ${levelInfo.color} ${levelInfo.bgColor} border-current/30`}>
                              <span className="mr-2">{levelInfo.icon}</span>
                              <span className="font-medium">{levelInfo.tierText}</span>
                              <span className="ml-2 text-gray-400">- {levelInfo.description}</span>
                            </div>
                          );
                        })()}
                        
                        {currentUserData.badge && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs bg-blue-600/20 text-blue-300 px-2 py-1 rounded border border-blue-600/30">
                              {currentUserData.badge}
                            </span>
                            {currentUserData.badges_earned.length > 1 && (
                              <span className="text-xs text-gray-400">
                                +{currentUserData.badges_earned.length - 1} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {userRank && (
                        <div className="text-center bg-gray-800/50 rounded-lg p-3">
                          <div className="text-2xl font-bold text-yellow-400">#{userRank}</div>
                          <div className="text-xs text-gray-400">Current Rank</div>
                        </div>
                      )}
                    </div>

                    {/* XP Progress with NEW SYSTEM */}
                    <div className="space-y-3">
                      {(() => {
                        const progress = calculateLevelProgress(currentUserData);
                        const levelInfo = getLevelInfo(currentUserData.level);
                        
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-400">
                                Level {currentUserData.level} Progress
                                {progress.isEarlyLevel && (
                                  <span className="ml-2 text-xs text-yellow-400 bg-yellow-400/20 px-2 py-0.5 rounded font-medium">
                                    🚀 3x XP BOOST
                                  </span>
                                )}
                              </span>
                              <span className="text-sm text-purple-400">
                                {progress.readyToLevelUp ? (
                                  <span className="text-green-400 font-bold">Ready to Level Up! 🎉</span>
                                ) : progress.xpNeeded > 0 ? (
                                  `${formatXP(progress.xpNeeded)} XP to Level ${currentUserData.level + 1}`
                                ) : (
                                  "Max Level Reached!"
                                )}
                              </span>
                            </div>
                            
                            <div className="relative">
                              <div className="w-full bg-gray-700 rounded-full h-3">
                                <div 
                                  className={`h-3 rounded-full transition-all duration-700 ease-out relative ${
                                    progress.isEarlyLevel 
                                      ? 'bg-gradient-to-r from-green-400 via-yellow-400 to-orange-400' 
                                      : progress.readyToLevelUp
                                        ? 'bg-gradient-to-r from-yellow-400 to-green-400 animate-pulse'
                                        : 'bg-gradient-to-r from-purple-500 via-blue-500 to-purple-600'
                                  }`}
                                  style={{ width: `${Math.max(5, progress.progressPercentage)}%` }}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full blur-sm opacity-60"></div>
                                  {progress.readyToLevelUp && (
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-bounce"></div>
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-between mt-1 text-xs text-gray-400">
                                <span>{progress.progressPercentage.toFixed(1)}% Complete</span>
                                <span>
                                  {formatXP(progress.xpThisLevel)} / {formatXP(progress.xpNeededThisLevel)} XP
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mt-4">
                              <div className="text-center">
                                <div className="text-lg font-bold text-green-400">
                                  {currentUserData.win_rate.toFixed(1)}%
                                </div>
                                <div className="text-xs text-gray-400">Win Rate</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold text-purple-400">
                                  {currentUserData.best_multiplier.toFixed(2)}x
                                </div>
                                <div className="text-xs text-gray-400">Best Multi</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold text-orange-400">
                                  {currentUserData.current_win_streak}
                                </div>
                                <div className="text-xs text-gray-400">Win Streak</div>
                              </div>
                            </div>

                            {!progress.readyToLevelUp && progress.xpNeeded > 0 && progress.xpNeeded <= 500 && (
                              <div className="mt-3 p-2 bg-purple-600/20 border border-purple-600/30 rounded text-xs text-purple-300">
                                <div className="font-medium mb-1">🎁 Next Level Rewards:</div>
                                <div className="text-gray-400">
                                  • Increased XP multiplier • New badge tier • Bonus features
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* 🚀 MODIFIED: User Stats Overview instead of platform stats */}
              <div className="grid grid-cols-2 lg:grid-cols-7 gap-4 mb-8">
                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-blue-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Your Level</p>
                      <p className="text-xl font-bold text-purple-400">{userStats.level}</p>
                    </div>
                    <Users className="text-blue-400" size={20} />
                  </div>
                </div>
                
                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-green-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Your Games</p>
                      <p className="text-xl font-bold text-white">{userStats.totalGames.toLocaleString()}</p>
                    </div>
                    <TrendingUp className="text-green-400" size={20} />
                  </div>
                </div>
                
                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-purple-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Your Winnings</p>
                      <p className="text-xl font-bold text-green-400">+{userStats.totalWinnings.toFixed(2)}</p>
                    </div>
                    <Award className="text-purple-400" size={20} />
                  </div>
                </div>

                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-orange-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Your Win Rate</p>
                      <p className="text-xl font-bold text-white">{userStats.winRate.toFixed(1)}%</p>
                    </div>
                    <Target className="text-orange-400" size={20} />
                  </div>
                </div>

                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-yellow-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Best Multi</p>
                      <p className="text-xl font-bold text-yellow-400">{userStats.bestMultiplier.toFixed(2)}x</p>
                    </div>
                    <Medal className="text-yellow-400" size={20} />
                  </div>
                </div>

                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-cyan-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Win Streak</p>
                      <p className="text-xl font-bold text-cyan-400">{userStats.currentStreak}</p>
                    </div>
                    <TrendingUp className="text-cyan-400" size={20} />
                  </div>
                </div>

                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-red-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Your XP</p>
                      <p className="text-xl font-bold text-purple-400">{formatXP(userStats.experiencePoints)}</p>
                    </div>
                    <Star className="text-red-400" size={20} />
                  </div>
                </div>
              </div>
              
              {/* Period Selector & Leaderboard */}
              <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b border-gray-800">
                  <h2 className="text-xl font-bold text-white mb-4 sm:mb-0">
                    Top Ruggers - {getPeriodDisplayName(period)}
                  </h2>
                  
                  <div className="flex items-center gap-3">
                    <select 
                      value={period} 
                      onChange={(e) => setPeriod(e.target.value as Period)}
                      className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none transition-colors"
                      disabled={loading}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="all_time">All Time</option>
                    </select>
                    
                    {leaderboardData.length > 0 && (
                      <div className="text-xs text-gray-400 bg-gray-800 px-3 py-2 rounded-lg flex items-center gap-2">
                        <span>Top {leaderboardData.length}</span>
                        {isRealTimeConnected && autoRefreshEnabled && (
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        )}
                        <span className="text-blue-400">XP</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Leaderboard Content */}
                <div className="min-h-[400px]">
                  {loading && (
                    <div className="text-center py-16">
                      <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-gray-400">Loading RuggerBoard...</p>
                      <p className="text-xs text-gray-500 mt-2">Fetching top 10 {getPeriodDisplayName(period).toLowerCase()} ruggers with XP data</p>
                    </div>
                  )}
                  
                  {error && (
                    <div className="text-center py-16">
                      <Trophy className="text-gray-600 mx-auto mb-4" size={48} />
                      <p className="text-red-400 mb-4">{error}</p>
                      <button
                        onClick={handleRefresh}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                  
                  {!loading && !error && leaderboardData.length > 0 && (
                    <div className="p-0">
                      <Leaderboard entries={leaderboardData} />
                    </div>
                  )}
                  
                  {!loading && !error && leaderboardData.length === 0 && (
                    <div className="text-center py-16">
                      <Trophy className="text-gray-600 mx-auto mb-4" size={48} />
                      <p className="text-gray-400 mb-2">No ruggers found for {getPeriodDisplayName(period).toLowerCase()}.</p>
                      <p className="text-gray-500 text-sm mb-4">Players need completed games with winnings to appear on the ruggerboard.</p>
                      <button
                        onClick={handleRefresh}
                        className="text-blue-400 hover:text-blue-300 text-sm underline"
                      >
                        Refresh to check for new data
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Enhanced Information Section with XP details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                    <Medal className="mr-2 text-yellow-400" size={20} />
                    RuggerBoard Rules
                  </h2>
                  <ul className="list-disc list-inside text-gray-400 space-y-2 text-sm">
                    <li>Rankings based on total SOL winnings (positive profits only)</li>
                    <li>Only shows top 10 ruggers for each period</li>
                    <li>Players must have completed games with winnings to qualify</li>
                    <li>Real-time updates as games are played and XP is earned</li>
                    <li>Rankings reset based on selected timeframe</li>
                    <li>🚀 <strong className="text-blue-400">NEW:</strong> Enhanced XP system with level progression</li>
                    <li>Early level boost (3x XP) for levels 1-3</li>
                    <li>Level tiers: Rookie → Rising → Tier 1+ → Elite</li>
                  </ul>
                </div>

                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                    <Star className="mr-2 text-purple-400" size={20} />
                    XP System Features
                  </h2>
                  <ul className="list-disc list-inside text-gray-400 space-y-2 text-sm">
                    <li><strong className="text-white">Live XP Tracking:</strong> Real-time XP gains and level progress</li>
                    <li><strong className="text-white">Early Boost:</strong> 3x XP multiplier for new players (levels 1-3)</li>
                    <li><strong className="text-white">Level Notifications:</strong> Instant alerts for level ups and XP gains</li>
                    <li><strong className="text-white">Progress Visualization:</strong> Enhanced progress bars with tier indicators</li>
                    <li>XP sources: base play, wins, multipliers, streaks, achievements</li>
                    <li>Level rewards: badges, increased multipliers, special features</li>
                  </ul>
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

export default LeaderboardPage;