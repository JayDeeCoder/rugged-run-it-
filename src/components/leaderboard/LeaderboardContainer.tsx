// src/components/leaderboard/LeaderboardContainer.tsx
'use client';

import { FC, useState, useEffect } from 'react';
import { LeaderboardAPI, LeaderboardEntry } from '../../services/api';
import Leaderboard from './Leaderboard';
import { Trophy, RefreshCw, TrendingUp } from 'lucide-react';

interface LeaderboardContainerProps {
  period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  limit?: number;
  showHeader?: boolean;
  showRefresh?: boolean;
  className?: string;
}

const LeaderboardContainer: FC<LeaderboardContainerProps> = ({ 
  period = 'daily', 
  limit = 10,
  showHeader = true,
  showRefresh = false,
  className = ''
}) => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch leaderboard data
  const fetchLeaderboardData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      console.log(`🏆 Fetching ${period} leaderboard data for homepage...`);

      const data = await LeaderboardAPI.getLeaderboard(period);
      
      // Limit the entries if specified
      const limitedData = limit ? data.slice(0, limit) : data;
      setLeaderboardData(limitedData);

      console.log(`✅ Loaded ${limitedData.length} leaderboard entries for homepage`);

    } catch (err) {
      console.error('❌ Homepage leaderboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      setLeaderboardData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Effect to fetch data when period changes
  useEffect(() => {
    fetchLeaderboardData();
  }, [period, limit]);

  // Refresh function
  const handleRefresh = () => {
    fetchLeaderboardData(true);
  };

  // Get period display name
  const getPeriodDisplayName = (period: string) => {
    switch (period) {
      case 'daily': return 'Today';
      case 'weekly': return 'This Week';
      case 'monthly': return 'This Month';
      case 'all_time': return 'All Time';
      default: return 'Today';
    }
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 overflow-hidden ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-800">
          <div className="flex items-center">
            <Trophy className="text-yellow-400 mr-2" size={20} />
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                TOP RUGGERS - {getPeriodDisplayName(period)}
              </h2>
              <p className="text-xs text-gray-400">
              Ranked by win rate • 
              </p>
            </div>
          </div>
          
          {showRefresh && (
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={`mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </button>
          )}
        </div>
      )}
      
      {/* Content */}
      <div className="min-h-[300px]">
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-gray-400 text-sm">Loading top performers...</p>
            <p className="text-xs text-gray-500 mt-1">
              Fetching {getPeriodDisplayName(period).toLowerCase()} rankings
            </p>
          </div>
        )}
        
        {error && (
          <div className="text-center py-8">
            <Trophy className="text-gray-600 mx-auto mb-3" size={32} />
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button
              onClick={handleRefresh}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
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
          <div className="text-center py-8">
            <Trophy className="text-gray-600 mx-auto mb-3" size={32} />
            <p className="text-gray-400 text-sm mb-2">
              No players found for {getPeriodDisplayName(period).toLowerCase()}.
            </p>
            <p className="text-gray-500 text-xs mb-3">
              Players need completed games with profit to appear.
            </p>
            <button
              onClick={handleRefresh}
              className="text-blue-400 hover:text-blue-300 text-xs underline"
            >
              Refresh to check for new data
            </button>
          </div>
        )}
      </div>
      
      {/* Footer link to full leaderboard */}
      {!loading && !error && leaderboardData.length > 0 && (
        <div className="border-t border-gray-800 p-4">
          <a 
            href="/leaderboard"
            className="flex items-center justify-center text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            <TrendingUp size={16} className="mr-2" />
            View Full Leaderboard
          </a>
        </div>
      )}
    </div>
  );
};

export default LeaderboardContainer;