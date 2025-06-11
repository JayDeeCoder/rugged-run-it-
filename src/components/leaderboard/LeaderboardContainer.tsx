// src/components/leaderboard/LeaderboardContainer.tsx
// 🚀 IMPROVED: Type-safe leaderboard container with utility functions

import React, { FC, useState, useEffect, useRef } from 'react';
import { LeaderboardAPI, LeaderboardEntry } from '../../services/api';
import { sharedSocket } from '../../services/sharedSocket';
import Leaderboard from './Leaderboard';
import { toast } from 'react-hot-toast';

// 🚀 ENHANCED: Import utility functions for better type safety
import { 
  BaseLeaderboardEntry, 
  LeaderboardUtils, 
  LeaderboardContainerProps as BaseContainerProps 
} from '../../types/leaderboard';

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
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // 🚀 SAFE: Load leaderboard data without socket dependency
  const loadLeaderboardData = async () => {
    try {
      console.log(`📊 Loading ${period} leaderboard data...`);
      setLoading(true);
      setError(null);
      
      const leaderboardData = await LeaderboardAPI.getLeaderboard(period);
      
      if (mountedRef.current) {
        setEntries(leaderboardData);
        console.log(`✅ Loaded ${leaderboardData.length} leaderboard entries`);
      }
    } catch (error) {
      console.error('❌ Error loading leaderboard:', error);
      if (mountedRef.current) {
        setError(error instanceof Error ? error.message : 'Failed to load leaderboard');
        toast.error('Failed to load leaderboard data');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // 🚀 ENHANCED: Set up real-time updates via shared socket (with error handling)
  const setupRealtimeUpdates = async () => {
    try {
      // Only try to connect if shared socket is available
      const socket = await sharedSocket.getSocket();
      
      if (!socket || !mountedRef.current) {
        console.log('📊 Leaderboard: No socket connection, using polling updates');
        return;
      }

      console.log('📊 Leaderboard: Setting up real-time updates...');
      setSocketConnected(true);

      // Listen for leaderboard updates
      const handleLeaderboardUpdate = (data: any) => {
        if (!mountedRef.current) return;
        
        console.log('📊 Leaderboard: Real-time update received');
        loadLeaderboardData(); // Refresh data
      };

      // Listen for relevant events that might affect leaderboard
      socket.on('gameCrashed', handleLeaderboardUpdate);
      socket.on('leaderboardUpdate', handleLeaderboardUpdate);
      socket.on('userStatsUpdate', handleLeaderboardUpdate);

      // Cleanup function
      return () => {
        if (socket) {
          socket.off('gameCrashed', handleLeaderboardUpdate);
          socket.off('leaderboardUpdate', handleLeaderboardUpdate);
          socket.off('userStatsUpdate', handleLeaderboardUpdate);
        }
        setSocketConnected(false);
      };

    } catch (error) {
      console.warn('⚠️ Leaderboard: Could not set up real-time updates:', error);
      // Don't throw error - fallback to polling
      setSocketConnected(false);
    }
  };

  // Initial load and periodic updates
  useEffect(() => {
    mountedRef.current = true;
    
    // Load initial data
    loadLeaderboardData();
    
    // Set up real-time updates (optional)
    let cleanup: (() => void) | undefined;
    setupRealtimeUpdates().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    // 🚀 FALLBACK: Polling updates every 30 seconds
    updateIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        console.log('📊 Leaderboard: Periodic refresh...');
        loadLeaderboardData();
      }
    }, 30000);

    return () => {
      mountedRef.current = false;
      
      if (cleanup) {
        cleanup();
      }
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [period]);

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

  // 🚀 ENHANCED: Manual refresh function
  const handleRefresh = async () => {
    toast.loading('Refreshing leaderboard...', { id: 'leaderboard-refresh' });
    
    try {
      await loadLeaderboardData();
      toast.success('Leaderboard updated!', { id: 'leaderboard-refresh' });
    } catch (error) {
      toast.error('Refresh failed', { id: 'leaderboard-refresh' });
    }
  };

  // 🚀 IMPROVED: Use utility function to find current user's position
  const currentUserPosition = currentUserId 
    ? LeaderboardUtils.findUserPosition(entries as BaseLeaderboardEntry[], currentUserId)
    : null;

  // 🚀 NEW: Find current user entry for additional info
  const currentUserEntry = currentUserId 
    ? entries.find(entry => 
        LeaderboardUtils.isCurrentUser(entry as BaseLeaderboardEntry, currentUserId)
      )
    : null;

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-400">Loading leaderboard...</span>
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
      {/* Header with refresh button and connection status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h2 className="text-xl font-bold text-white">
            {period.charAt(0).toUpperCase() + period.slice(1)} Leaderboard
          </h2>
          
          {/* Connection status indicator */}
          <div className={`w-2 h-2 rounded-full ${
            socketConnected ? 'bg-green-500' : 'bg-yellow-500'
          }`} title={socketConnected ? 'Real-time updates' : 'Polling updates'} />
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50"
        >
          {loading ? '⟳' : '🔄'} Refresh
        </button>
      </div>

      {/* 🚀 ENHANCED: Current user position indicator with more details */}
      {currentUserId && currentUserPosition && (
        <div className="mb-4 p-3 bg-blue-600/20 border border-blue-600/30 rounded-lg">
          <div className="text-sm text-blue-400 space-y-1">
            <div>
              Your current position: <span className="font-bold text-white">
                #{currentUserPosition}{LeaderboardUtils.getRankSuffix(currentUserPosition)}
              </span>
            </div>
            {currentUserEntry && (
              <div className="text-xs text-gray-300">
                {(currentUserEntry as any).score && (
                  <span>Score: {LeaderboardUtils.formatScore((currentUserEntry as any).score)}</span>
                )}
                {(currentUserEntry as any).winnings && (
                  <span className="ml-3">
                    Winnings: {LeaderboardUtils.formatWinnings((currentUserEntry as any).winnings)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🚀 NEW: Show if user is not on leaderboard */}
      {currentUserId && !currentUserPosition && entries.length > 0 && (
        <div className="mb-4 p-3 bg-amber-600/20 border border-amber-600/30 rounded-lg">
          <div className="text-sm text-amber-400">
            You're not currently on the {period} leaderboard. Keep playing to earn your spot! 🎮
          </div>
        </div>
      )}

      {/* 🚀 FIXED: Render leaderboard component with correct props */}
      <Leaderboard 
        entries={entries}
      />
      
      {/* 🚀 ENHANCED: Status footer with more information */}
      <div className="mt-4 text-center text-xs text-gray-500 space-y-1">
        <div>
          {entries.length} entries • {socketConnected ? 'Real-time' : 'Polling'} updates
          {!socketConnected && (
            <span className="ml-2 text-yellow-400" title="WebSocket unavailable, using periodic updates">
              ⚠️ Limited connectivity
            </span>
          )}
        </div>
        
        {/* Show last refresh time */}
        <div className="text-xs text-gray-600">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardContainer;