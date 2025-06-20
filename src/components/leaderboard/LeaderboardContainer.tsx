// src/components/leaderboard/LeaderboardContainer.tsx
// 🚀 ENHANCED: Container with TOP 10 by WINNINGS and NEW XP SYSTEM integration

import React, { FC, useState, useEffect, useRef } from 'react';
import { LeaderboardAPI, LeaderboardEntry, UserAPI } from '../../services/api';
import { sharedSocket } from '../../services/sharedSocket';
import Leaderboard from './Leaderboard';
import { toast } from 'react-hot-toast';

interface LeaderboardContainerProps {
  currentUserId?: string;
  period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
}

const LeaderboardContainer: FC<LeaderboardContainerProps> = ({
  currentUserId,
  period = 'daily'
}) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<LeaderboardEntry | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // 🚀 ENHANCED: Load TOP 10 leaderboard by WINNINGS with new XP system ordering
  const loadLeaderboardData = async () => {
    try {
      console.log(`📊 Loading ${period} TOP 10 RUGGERS by winnings with NEW XP SYSTEM...`);
      setLoading(true);
      setError(null);
      
      // Get leaderboard data from enhanced API
      const leaderboardData = await LeaderboardAPI.getLeaderboard(period);
      
      // 🚀 MODIFIED: Sort by total winnings (total_won, same as dashboard) and take top 10
      const sortedByWinnings = leaderboardData
        .filter(entry => (entry.total_won || entry.total_profit) > 0) // Only show players with winnings
        .sort((a, b) => {
          const aWinnings = a.total_won || Math.max(0, a.total_profit);
          const bWinnings = b.total_won || Math.max(0, b.total_profit);
          return bWinnings - aWinnings; // Sort by highest winnings first
        })
        .slice(0, 10); // 🚀 TOP 10 ONLY

      // 🚀 ENHANCED: Add computed XP data and proper ranking
      const enhancedEntries = sortedByWinnings.map((entry, index) => {
        // Calculate enhanced level progress using UserAPI
        const levelProgress = UserAPI.calculateLevelProgress({
          level: entry.level,
          experience_points: entry.experience_points,
          total_games_played: entry.games_played,
          win_rate: entry.win_rate
        });

        return {
          ...entry,
          rank: index + 1, // Rank 1-10 based on winnings
          // Add computed XP data for display
          levelProgress,
          isEarlyLevel: entry.level <= 3,
          readyToLevelUp: levelProgress.readyToLevelUp
        };
      });

      if (mountedRef.current) {
        setEntries(enhancedEntries);
                console.log(`✅ Loaded TOP ${enhancedEntries.length} ruggers by total winnings (${enhancedEntries.length > 0 ? (enhancedEntries[0].total_won || enhancedEntries[0].total_profit).toFixed(2) : '0'} - ${enhancedEntries.length > 0 ? (enhancedEntries[enhancedEntries.length - 1].total_won || enhancedEntries[enhancedEntries.length - 1].total_profit).toFixed(2) : '0'} SOL)`);  

        // 🚀 NEW: Get current user's full data if available
        if (currentUserId) {
          try {
            const userData = await LeaderboardAPI.getCurrentUserData(currentUserId);
            if (userData) {
              const userLevelProgress = UserAPI.calculateLevelProgress({
                level: userData.level,
                experience_points: userData.experience_points,
                total_games_played: userData.games_played,
                win_rate: userData.win_rate
              });
              
              setCurrentUserData({
                ...userData,
                levelProgress: userLevelProgress,
                isEarlyLevel: userData.level <= 3,
                readyToLevelUp: userLevelProgress.readyToLevelUp
              } as any);
            }
          } catch (userError) {
            console.warn('⚠️ Could not load current user data:', userError);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error loading enhanced TOP 10 ruggerboard:', error);
      if (mountedRef.current) {
        setError(error instanceof Error ? error.message : 'Failed to load ruggerboard');
        toast.error('Failed to load ruggerboard data');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // 🚀 ENHANCED: Real-time updates with XP system events
  const setupRealtimeUpdates = async () => {
    try {
      const socket = await sharedSocket.getSocket();
      
      if (!socket || !mountedRef.current) {
        console.log('📊 RuggerBoard: No socket connection, using polling updates');
        return;
      }

      console.log('📊 RuggerBoard: Setting up enhanced real-time updates...');
      setSocketConnected(true);

      // 🚀 ENHANCED: Listen for XP and level-related events
      const handleLeaderboardUpdate = (data: any) => {
        if (!mountedRef.current) return;
        
        console.log('📊 RuggerBoard: Real-time update received:', data?.type || 'unknown');
        loadLeaderboardData(); // Refresh with new XP calculations and winnings sorting
      };

      const handleXPUpdate = (data: any) => {
        if (!mountedRef.current) return;
        
        console.log('🎯 XP Update received:', data);
        
        // If it's for current user, update their data immediately
        if (currentUserId && data.userId === currentUserId) {
          loadLeaderboardData(); // Full refresh to get accurate rankings
        } else {
          // Debounced update for other users
          setTimeout(() => {
            if (mountedRef.current) {
              loadLeaderboardData();
            }
          }, 2000);
        }
      };

      const handleLevelUp = (data: any) => {
        if (!mountedRef.current) return;
        
        console.log('🎉 Level up detected:', data);
        
        // Show celebration for current user
        if (currentUserId && data.userId === currentUserId) {
          toast.success(`🎉 Level Up! You reached Level ${data.newLevel}!`, {
            duration: 5000,
            icon: '🎊'
          });
        }
        
        loadLeaderboardData(); // Refresh to show new level
      };

      // Listen for all relevant events
      socket.on('gameCrashed', handleLeaderboardUpdate);
      socket.on('leaderboardUpdate', handleLeaderboardUpdate);
      socket.on('userStatsUpdate', handleLeaderboardUpdate);
      socket.on('xpGained', handleXPUpdate);
      socket.on('levelUp', handleLevelUp);
      socket.on('betResolved', handleLeaderboardUpdate);

      // Cleanup function
      return () => {
        if (socket) {
          socket.off('gameCrashed', handleLeaderboardUpdate);
          socket.off('leaderboardUpdate', handleLeaderboardUpdate);
          socket.off('userStatsUpdate', handleLeaderboardUpdate);
          socket.off('xpGained', handleXPUpdate);
          socket.off('levelUp', handleLevelUp);
          socket.off('betResolved', handleLeaderboardUpdate);
        }
        setSocketConnected(false);
      };

    } catch (error) {
      console.warn('⚠️ RuggerBoard: Could not set up enhanced real-time updates:', error);
      setSocketConnected(false);
    }
  };

  // Initial load and setup
  useEffect(() => {
    mountedRef.current = true;
    
    // Load initial data
    loadLeaderboardData();
    
    // Set up real-time updates
    let cleanup: (() => void) | undefined;
    setupRealtimeUpdates().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    // 🚀 ENHANCED: More frequent updates for XP system (15 seconds for top 10)
    updateIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        console.log('📊 RuggerBoard: Periodic TOP 10 XP refresh...');
        loadLeaderboardData();
      }
    }, 15000);

    return () => {
      mountedRef.current = false;
      
      if (cleanup) {
        cleanup();
      }
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [period, currentUserId]);

  // Handle period changes
  useEffect(() => {
    if (mountedRef.current) {
      loadLeaderboardData();
    }
  }, [period]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 🚀 ENHANCED: Manual refresh with XP recalculation
  const handleRefresh = async () => {
    toast.loading('Refreshing TOP 10 ruggers & XP...', { id: 'ruggerboard-refresh' });
    
    try {
      await loadLeaderboardData();
      toast.success('RuggerBoard updated with latest winnings & XP!', { id: 'ruggerboard-refresh' });
    } catch (error) {
      toast.error('Refresh failed', { id: 'ruggerboard-refresh' });
    }
  };

  // 🚀 ENHANCED: Find current user position with XP context
  const currentUserPosition = currentUserId && entries.length > 0
    ? entries.findIndex(entry => entry.id === currentUserId) + 1
    : null;

  const currentUserEntry = currentUserData || (currentUserId 
    ? entries.find(entry => entry.id === currentUserId)
    : null);

  // 🚀 NEW: Calculate user's XP stats for display
  const getUserXPStatus = () => {
    if (!currentUserEntry) return null;
    
    const levelProgress = UserAPI.calculateLevelProgress({
      level: currentUserEntry.level,
      experience_points: currentUserEntry.experience_points,
      total_games_played: currentUserEntry.games_played,
      win_rate: currentUserEntry.win_rate
    });
    
    return {
      ...levelProgress,
      isEarlyLevel: currentUserEntry.level <= 3,
      nextLevelXP: UserAPI.getXPRequirement(currentUserEntry.level + 1),
      currentLevelXP: UserAPI.getXPRequirement(currentUserEntry.level)
    };
  };

  const userXPStatus = getUserXPStatus();

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400">Loading TOP 10 ruggers with XP data...</span>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-red-400 mb-4">❌ {error}</div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header with refresh button and enhanced status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h2 className="text-xl font-bold text-white">
            {period.charAt(0).toUpperCase() + period.slice(1)} Top Ruggers
          </h2>
          
          {/* Enhanced connection status with XP indicator */}
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${
              socketConnected ? 'bg-green-500' : 'bg-yellow-500'
            }`} title={socketConnected ? 'Real-time XP updates' : 'Polling updates'} />
            <span className="text-xs text-blue-400">XP</span>
            <span className="text-xs text-gray-400">TOP 10</span>
          </div>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50"
        >
          {loading ? '⟳' : '🔄'} Refresh
        </button>
      </div>

      {/* 🚀 ENHANCED: Current user position with winnings context */}
      {currentUserId && currentUserPosition && currentUserEntry && (
        <div className="mb-4 p-3 bg-blue-600/20 border border-blue-600/30 rounded-lg">
          <div className="text-sm text-blue-400 space-y-2">
            <div className="flex items-center justify-between">
              <span>
                You're in the TOP 10! Position: <span className="font-bold text-white">
                  #{currentUserPosition}
                </span>
              </span>
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-green-400">+{(currentUserEntry.total_won || Math.max(0, currentUserEntry.total_profit)).toFixed(2)} SOL</span>
                <span className="text-purple-400">Level {currentUserEntry.level}</span>
              </div>
            </div>
            
            {/* XP Progress for current user */}
            {userXPStatus && (
              <div>
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>Level Progress</span>
                  <span>
                    {userXPStatus.xpNeeded > 0 
                      ? `${userXPStatus.xpNeeded} XP to level ${currentUserEntry.level + 1}`
                      : 'Ready to level up! 🎉'
                    }
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${
                      userXPStatus.isEarlyLevel 
                        ? 'bg-gradient-to-r from-green-400 to-yellow-400' 
                        : userXPStatus.readyToLevelUp
                          ? 'bg-gradient-to-r from-yellow-400 to-green-400'
                          : 'bg-gradient-to-r from-purple-500 to-blue-500'
                    }`}
                    style={{ width: `${Math.max(2, userXPStatus.progressPercentage)}%` }}
                  ></div>
                </div>
                
                {/* Early level boost indicator */}
                {userXPStatus.isEarlyLevel && (
                  <div className="text-xs text-yellow-400 mt-1 font-medium">
                    🚀 Early Level Boost Active! (3x XP)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🚀 ENHANCED: Show if user has winnings but not in top 10 */}
      {currentUserId && !currentUserPosition && currentUserEntry && (currentUserEntry.total_won || Math.max(0, currentUserEntry.total_profit)) > 0 && (
        <div className="mb-4 p-3 bg-amber-600/20 border border-amber-600/30 rounded-lg">
          <div className="text-sm text-amber-400">
            <div className="font-medium mb-1">
              You have +{(currentUserEntry.total_won || Math.max(0, currentUserEntry.total_profit)).toFixed(2)} SOL winnings but aren't in the TOP 10 yet
            </div>
            <div className="text-xs text-gray-300">
              Keep playing to climb the ruggerboard! 🎮
              {currentUserEntry.level <= 3 && (
                <span className="text-yellow-400 ml-2">Early level boost active!</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🚀 ENHANCED: Show if user has no winnings */}
      {currentUserId && !currentUserPosition && (!currentUserEntry || (currentUserEntry.total_won || Math.max(0, currentUserEntry.total_profit)) === 0) && (
        <div className="mb-4 p-3 bg-gray-600/20 border border-gray-600/30 rounded-lg">
          <div className="text-sm text-gray-400">
            <div className="font-medium mb-1">Start winning to appear on the TOP 10 RuggerBoard!</div>
            <div className="text-xs text-gray-300">
              Win games to earn SOL and climb the rankings 🚀
              {currentUserEntry && currentUserEntry.level <= 3 && (
                <span className="text-yellow-400 ml-2">3x XP boost for new players!</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🚀 ENHANCED: Render TOP 10 leaderboard with XP system */}
      <Leaderboard entries={entries} />
      
      {/* 🚀 ENHANCED: Status footer with TOP 10 and XP system info */}
      <div className="mt-4 text-center text-xs text-gray-500 space-y-1">
        <div>
          TOP {entries.length} ruggers by winnings • {socketConnected ? 'Real-time XP' : 'Polling'} updates
          {!socketConnected && (
            <span className="ml-2 text-yellow-400" title="WebSocket unavailable, using periodic updates">
              ⚠️ Limited connectivity
            </span>
          )}
        </div>
        
        <div className="text-xs text-gray-600">
          Enhanced with NEW XP System • Sorted by SOL winnings • Last updated: {new Date().toLocaleTimeString()}
        </div>
        
        {/* XP System status */}
        <div className="text-xs text-blue-400">
          XP calculations include: base play, win bonuses, risk multipliers, streaks & early level boosts
        </div>
        
        {/* TOP 10 explanation */}
        <div className="text-xs text-gray-600 mt-2">
          Only ruggers with positive SOL winnings appear • Minimum 0.01 SOL to qualify for TOP 10
        </div>
      </div>
    </div>
  );
};

export default LeaderboardContainer;