// src/app/leaderboard/page.tsx - FIXED with Shared Socket Service
'use client';

import { FC, useState, useEffect, useRef, useCallback } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { useUser } from '../../context/UserContext';
import { Trophy, RefreshCw, TrendingUp, Users, Award, Crown, Medal, Target, Star, Zap, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { LeaderboardAPI, LeaderboardEntry, UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { sharedSocket } from '../../services/sharedSocket'; // 🚀 Use shared socket service

type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';

interface LeaderboardStats {
  totalPlayers: number;
  totalGames: number;
  totalVolume: number;
  averageProfit: number;
  topPlayerProfit: number;
}

// 🚀 SIMPLIFIED: Socket connection hook using shared service
const useSocketConnection = () => {
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const initAttempted = useRef(false);

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    console.log('🔌 Leaderboard: Initializing socket connection via shared service...');
    
    const initSocket = async () => {
      try {
        const gameSocket = await sharedSocket.getSocket();
        
        if (gameSocket) {
          console.log('✅ Leaderboard: Got socket from shared service');
          setSocket(gameSocket);
          setIsConnected(gameSocket.connected);
          setError(null);
          
          // Set up event listeners for connection status
          const handleConnect = () => {
            console.log('✅ Leaderboard: Socket connected');
            setIsConnected(true);
            setError(null);
            setConnectionAttempts(0);
          };

          const handleDisconnect = () => {
            console.log('🔌 Leaderboard: Socket disconnected');
            setIsConnected(false);
          };

          const handleError = (err: any) => {
            console.error('❌ Leaderboard: Socket error:', err);
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
          console.warn('⚠️ Leaderboard: Failed to get socket from shared service');
          setError('Failed to connect to game server');
          setConnectionAttempts(prev => prev + 1);
        }
      } catch (err) {
        console.error('❌ Leaderboard: Error initializing socket:', err);
        setError(err instanceof Error ? err.message : 'Socket initialization failed');
        setConnectionAttempts(prev => prev + 1);
      }
    };

    initSocket();
  }, []);

  // Monitor shared socket connection status
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = sharedSocket.isConnected();
      if (connected !== isConnected) {
        setIsConnected(connected);
        console.log(`🔌 Leaderboard: Connection status changed: ${connected}`);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return { socket, isConnected, connectionAttempts, error };
};

const LeaderboardPage: FC = () => {
  // Hooks
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { isAuthenticated } = useUser();
  
  // 🚀 SIMPLIFIED: Use socket connection hook
  const { socket: gameSocket, isConnected: socketConnected, connectionAttempts, error: socketError } = useSocketConnection();
  
  // State
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('daily');
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<LeaderboardStats>({
    totalPlayers: 0,
    totalGames: 0,
    totalVolume: 0,
    averageProfit: 0,
    topPlayerProfit: 0
  });
  const [userRank, setUserRank] = useState<number | null>(null);
  const [currentUserData, setCurrentUserData] = useState<LeaderboardEntry | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // 🚀 SIMPLIFIED: Real-time state with proper socket connection
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

  // 🚀 SIMPLIFIED: Update real-time connection status based on socket
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
        console.log(`🔍 Leaderboard: Getting user ID for wallet: ${currentUserWallet}`);
        const userData = await UserAPI.getUserOrCreate(currentUserWallet);
        
        if (userData) {
          setUserId(userData.id);
          console.log(`✅ Leaderboard: User ID set: ${userData.id}`);
          
          const userLeaderboardData = await LeaderboardAPI.getCurrentUserData(userData.id);
          setCurrentUserData(userLeaderboardData);
        }
      } catch (error) {
        console.error('❌ Leaderboard: Error initializing user:', error);
      }
    };

    initUser();
  }, [authenticated, currentUserWallet]);

  // Calculate level progress
  const calculateLevelProgress = (user: LeaderboardEntry) => {
    const currentLevel = user.level;
    const currentXP = user.experience_points;
    
    const baseXP = 100;
    const xpForNextLevel = baseXP * Math.pow(1.5, currentLevel - 1);
    const xpForCurrentLevel = currentLevel > 1 ? baseXP * Math.pow(1.5, currentLevel - 2) : 0;
    const xpNeededThisLevel = xpForNextLevel - xpForCurrentLevel;
    const xpProgressThisLevel = currentXP - xpForCurrentLevel;
    
    const progressPercentage = Math.min(100, Math.max(0, (xpProgressThisLevel / xpNeededThisLevel) * 100));
    const xpToNextLevel = Math.ceil(xpForNextLevel - currentXP);

    return {
      progressPercentage,
      xpToNextLevel,
      xpNeededThisLevel,
      xpProgressThisLevel
    };
  };

  // Debounced real-time leaderboard refresh
  const debouncedLeaderboardRefresh = useCallback(() => {
    if (!autoRefreshEnabled) {
      console.log('🔄 Leaderboard: Auto-refresh disabled, skipping update');
      return;
    }

    if (realTimeUpdateRef.current) {
      clearTimeout(realTimeUpdateRef.current);
    }

    setPendingUpdates(prev => prev + 1);

    realTimeUpdateRef.current = setTimeout(async () => {
      console.log('🔄 Leaderboard REAL-TIME: Refreshing leaderboard data...');
      
      try {
        // Don't show loading state for real-time updates
        const data = await LeaderboardAPI.getLeaderboard(period);
        
        setLeaderboardData(prevData => {
          // Only update if data actually changed
          if (JSON.stringify(prevData) !== JSON.stringify(data)) {
            console.log(`✅ Leaderboard REAL-TIME: Updated with ${data.length} entries`);
            setLastRealTimeUpdate(Date.now());
            
            // Update stats
            const totalPlayers = data.length;
            const totalGames = data.reduce((sum, entry) => sum + (entry.games_played || 0), 0);
            const totalVolume = data.reduce((sum, entry) => sum + (entry.total_profit || 0), 0);
            const averageProfit = totalPlayers > 0 ? totalVolume / totalPlayers : 0;
            const topPlayerProfit = data.length > 0 ? data[0].total_profit : 0;

            setStats({
              totalPlayers,
              totalGames,
              totalVolume: Number(totalVolume.toFixed(2)),
              averageProfit: Number(averageProfit.toFixed(2)),
              topPlayerProfit: Number(topPlayerProfit.toFixed(2))
            });

            return data;
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

        // Refresh current user data
        if (userId) {
          try {
            const userLeaderboardData = await LeaderboardAPI.getCurrentUserData(userId);
            setCurrentUserData(userLeaderboardData);
          } catch (error) {
            console.warn('Could not refresh current user data:', error);
          }
        }

      } catch (error) {
        console.error('❌ Leaderboard REAL-TIME: Refresh failed:', error);
      } finally {
        setPendingUpdates(prev => Math.max(0, prev - 1));
      }
    }, 3000); // 3 second debounce for real-time updates
  }, [period, isAuthenticated, currentUserWallet, userId, autoRefreshEnabled]);

  // 🚀 SIMPLIFIED: Real-time socket listeners setup with shared socket
  useEffect(() => {
    if (!socketConnected || socketListenersSetup.current) return;

    console.log('🔌 Leaderboard: Setting up REAL-TIME socket listeners...');
    socketListenersSetup.current = true;

    // Game event listeners that should trigger leaderboard updates
    const handleGameEnd = (data: any) => {
      console.log('🎮 Leaderboard REAL-TIME: Game ended - triggering leaderboard refresh');
      debouncedLeaderboardRefresh();
    };

    const handleCustodialCashout = (data: any) => {
      console.log('💸 Leaderboard REAL-TIME: Cashout processed - triggering leaderboard refresh');
      debouncedLeaderboardRefresh();
    };

    const handleUserStatsUpdate = (data: any) => {
      console.log('📊 Leaderboard REAL-TIME: User stats updated - triggering leaderboard refresh');
      debouncedLeaderboardRefresh();
    };

    const handleBetResult = (data: any) => {
      console.log('🎲 Leaderboard REAL-TIME: Bet resolved - triggering leaderboard refresh');
      debouncedLeaderboardRefresh();
    };

    const handleLeaderboardUpdate = (data: any) => {
      console.log('🏆 Leaderboard REAL-TIME: Direct leaderboard update received');
      debouncedLeaderboardRefresh();
    };

    // Set up listeners using shared socket
    sharedSocket.on('gameEnd', handleGameEnd);
    sharedSocket.on('custodialCashout', handleCustodialCashout);
    sharedSocket.on('userStatsUpdate', handleUserStatsUpdate);
    sharedSocket.on('betResult', handleBetResult);
    sharedSocket.on('leaderboardUpdate', handleLeaderboardUpdate);

    return () => {
      console.log('🔌 Leaderboard: Cleaning up REAL-TIME socket listeners');
      sharedSocket.off('gameEnd', handleGameEnd);
      sharedSocket.off('custodialCashout', handleCustodialCashout);
      sharedSocket.off('userStatsUpdate', handleUserStatsUpdate);
      sharedSocket.off('betResult', handleBetResult);
      sharedSocket.off('leaderboardUpdate', handleLeaderboardUpdate);
      
      if (realTimeUpdateRef.current) {
        clearTimeout(realTimeUpdateRef.current);
      }
      
      socketListenersSetup.current = false;
    };
  }, [socketConnected, debouncedLeaderboardRefresh]);

  // Fetch leaderboard data
  const fetchLeaderboardData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      console.log(`🏆 Leaderboard: Fetching ${period} leaderboard data...`);

      const data = await LeaderboardAPI.getLeaderboard(period);
      
      if (data.length === 0) {
        console.warn('⚠️ No leaderboard data found for period:', period);
        setError(`No players found for ${getPeriodDisplayName(period).toLowerCase()}. Players need games and profit to appear.`);
        setLeaderboardData([]);
        setStats({
          totalPlayers: 0,
          totalGames: 0,
          totalVolume: 0,
          averageProfit: 0,
          topPlayerProfit: 0
        });
        return;
      }

      setLeaderboardData(data);

      // Calculate stats
      const totalPlayers = data.length;
      const totalGames = data.reduce((sum, entry) => sum + (entry.games_played || 0), 0);
      const totalVolume = data.reduce((sum, entry) => sum + (entry.total_profit || 0), 0);
      const averageProfit = totalPlayers > 0 ? totalVolume / totalPlayers : 0;
      const topPlayerProfit = data.length > 0 ? data[0].total_profit : 0;

      setStats({
        totalPlayers,
        totalGames,
        totalVolume: Number(totalVolume.toFixed(2)),
        averageProfit: Number(averageProfit.toFixed(2)),
        topPlayerProfit: Number(topPlayerProfit.toFixed(2))
      });

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

      // Refresh current user data
      if (userId) {
        try {
          const userLeaderboardData = await LeaderboardAPI.getCurrentUserData(userId);
          setCurrentUserData(userLeaderboardData);
        } catch (error) {
          console.warn('Could not refresh current user data:', error);
        }
      }

      console.log(`✅ Leaderboard: Loaded ${data.length} entries for ${period}`);

    } catch (err) {
      console.error('❌ Leaderboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      setLeaderboardData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Effect to fetch data when period changes
  useEffect(() => {
    // Reset real-time tracking when period changes
    if (lastPeriodRef.current !== period) {
      console.log(`🔄 Leaderboard: Period changed from ${lastPeriodRef.current} to ${period}`);
      lastPeriodRef.current = period;
      setLastRealTimeUpdate(0);
      setPendingUpdates(0);
    }

    fetchLeaderboardData();
  }, [period, isAuthenticated, currentUserWallet, userId]);

  // Manual refresh function
  const handleRefresh = useCallback(() => {
    console.log('🔄 Leaderboard: Manual refresh triggered');
    fetchLeaderboardData(true);
    toast.success('Leaderboard refreshed!', { duration: 2000 });
  }, [period, isAuthenticated, currentUserWallet, userId]);

  // Toggle auto-refresh
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled(prev => {
      const newValue = !prev;
      console.log(`🔄 Leaderboard: Auto-refresh ${newValue ? 'enabled' : 'disabled'}`);
      
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
      case 'daily': return 'Rankings reset daily at midnight UTC';
      case 'weekly': return 'Rankings reset weekly on Sunday';
      case 'monthly': return 'Rankings reset monthly on the 1st';
      case 'all_time': return 'All-time performance since launch';
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
                    <h1 className="text-3xl font-bold text-white">RUGGER Board</h1>
                    <p className="text-gray-400">{getPeriodDisplayName(period)} Rankings</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-500">{getPeriodDescription(period)}</p>
                      
                      {/* 🚀 SIMPLIFIED: Real-time status indicator */}
                      <div className="flex items-center gap-2">
                        {isRealTimeConnected ? (
                          <div className="flex items-center text-xs text-green-400">
                            <Wifi size={12} className="mr-1" />
                            <span>Live</span>
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
                      {autoRefreshEnabled ? 'Live' : 'Manual'}
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

              {/* User Level Info */}
              {isAuthenticated && currentUserData && (
                <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-6 mb-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="flex items-center">
                      <div className="mr-4">
                        <span className="text-3xl">{currentUserData.avatar}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg">{currentUserData.username}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center">
                            <Crown size={14} className="mr-1 text-purple-400" />
                            Level {currentUserData.level}
                          </span>
                          <span>•</span>
                          <span className="flex items-center">
                            <Star size={14} className="mr-1 text-blue-400" />
                            {currentUserData.experience_points} XP
                          </span>
                          <span>•</span>
                          <span className="flex items-center">
                            <Medal size={14} className="mr-1 text-yellow-400" />
                            Tier {currentUserData.tier}
                          </span>
                        </div>
                        
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

                    <div className="space-y-3">
                      {(() => {
                        const progress = calculateLevelProgress(currentUserData);
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-400">
                                Level {currentUserData.level} Progress
                              </span>
                              <span className="text-sm text-purple-400">
                                {progress.xpToNextLevel > 0 
                                  ? `${progress.xpToNextLevel} XP to Level ${currentUserData.level + 1}`
                                  : "Max Level!"
                                }
                              </span>
                            </div>
                            
                            <div className="relative">
                              <div className="w-full bg-gray-700 rounded-full h-3">
                                <div 
                                  className="bg-gradient-to-r from-purple-500 via-blue-500 to-purple-600 h-3 rounded-full transition-all duration-700 ease-out relative"
                                  style={{ width: `${Math.max(5, progress.progressPercentage)}%` }}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full blur-sm opacity-60"></div>
                                </div>
                              </div>
                              <div className="flex justify-between mt-1 text-xs text-gray-400">
                                <span>{progress.progressPercentage.toFixed(1)}% Complete</span>
                                <span>Next Level</span>
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
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Enhanced Stats Overview with real-time indicators */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-blue-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Total Players</p>
                      <p className="text-xl font-bold text-white">{stats.totalPlayers}</p>
                    </div>
                    <Users className="text-blue-400" size={20} />
                  </div>
                </div>
                
                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-green-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Total Games</p>
                      <p className="text-xl font-bold text-white">{stats.totalGames.toLocaleString()}</p>
                    </div>
                    <TrendingUp className="text-green-400" size={20} />
                  </div>
                </div>
                
                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-purple-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Volume</p>
                      <p className="text-xl font-bold text-white">{stats.totalVolume.toFixed(2)}</p>
                    </div>
                    <Award className="text-purple-400" size={20} />
                  </div>
                </div>

                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-orange-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Avg Profit</p>
                      <p className="text-xl font-bold text-white">{stats.averageProfit.toFixed(2)}</p>
                    </div>
                    <Target className="text-orange-400" size={20} />
                  </div>
                </div>

                <div className={`bg-gray-900 rounded-lg p-4 border border-gray-800 transition-all duration-500 ${
                  pendingUpdates > 0 ? 'ring-2 ring-yellow-400 ring-opacity-30' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Top Player</p>
                      <p className="text-xl font-bold text-yellow-400">{stats.topPlayerProfit.toFixed(2)}</p>
                    </div>
                    <Medal className="text-yellow-400" size={20} />
                  </div>
                </div>
              </div>
              
              {/* Period Selector & Leaderboard */}
              <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b border-gray-800">
                  <h2 className="text-xl font-bold text-white mb-4 sm:mb-0">
                    Top Performers - {getPeriodDisplayName(period)}
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
                        <span>{leaderboardData.length} players</span>
                        {isRealTimeConnected && autoRefreshEnabled && (
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Leaderboard Content */}
                <div className="min-h-[400px]">
                  {loading && (
                    <div className="text-center py-16">
                      <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-gray-400">Loading RUGGER board...</p>
                      <p className="text-xs text-gray-500 mt-2">Fetching {getPeriodDisplayName(period).toLowerCase()} rankings</p>
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
                      <p className="text-gray-400 mb-2">No players found for {getPeriodDisplayName(period).toLowerCase()}.</p>
                      <p className="text-gray-500 text-sm mb-4">Players need completed games with profit to appear on the leaderboard.</p>
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
              
              {/* Enhanced Information Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                    <Medal className="mr-2 text-yellow-400" size={20} />
                    Leaderboard Rules
                  </h2>
                  <ul className="list-disc list-inside text-gray-400 space-y-2 text-sm">
                    <li>Rankings based on profit percentage: (Total Profit / Total Wagered) × 100</li>
                    <li>Players must have completed games to qualify</li>
                    <li>Real-time updates as games are played</li>
                    <li>Rankings reset based on selected timeframe</li>
                    <li>Level and XP data synced with dashboard</li>
                    <li>Top performers earn exclusive recognition</li>
                  </ul>
                </div>

                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                    <TrendingUp className="mr-2 text-green-400" size={20} />
                    Real-Time Features
                  </h2>
                  <ul className="list-disc list-inside text-gray-400 space-y-2 text-sm">
                    <li><strong className="text-white">Live Updates:</strong> Leaderboard refreshes automatically after games</li>
                    <li><strong className="text-white">Connection Status:</strong> Real-time connection indicator</li>
                    <li><strong className="text-white">Auto Refresh:</strong> Toggle automatic updates on/off</li>
                    <li><strong className="text-white">Manual Refresh:</strong> Force refresh anytime</li>
                    <li>Updates debounced to prevent excessive refreshing</li>
                    <li>Visual indicators show when data is being updated</li>
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