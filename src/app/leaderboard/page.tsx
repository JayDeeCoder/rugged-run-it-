// src/app/leaderboard/page.tsx
'use client';

import { FC, useState, useEffect, useContext } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { UserContext } from '../../context/UserContext';
import { Trophy, RefreshCw, TrendingUp, Users, Award, Crown, Medal, Target } from 'lucide-react';
import { LeaderboardAPI, LeaderboardEntry, supabase } from '../../services/api';

type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';

interface LeaderboardStats {
  totalPlayers: number;
  totalGames: number;
  totalVolume: number;
  averageProfit: number;
  topPlayerProfit: number;
}

const LeaderboardPage: FC = () => {
  // Hooks
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { currentUser } = useContext(UserContext);
  
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

  // Get current user's wallet
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const currentUserWallet = embeddedWallet?.address || '';

  // Fetch leaderboard data using the API
  const fetchLeaderboardData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      console.log(`🏆 Fetching ${period} leaderboard data...`);

      // Use the LeaderboardAPI instead of manual queries
      const data = await LeaderboardAPI.getLeaderboard(period);
      
      if (data.length === 0) {
        console.warn('⚠️ No leaderboard data found for period:', period);
        setError(`No players found for ${getPeriodDisplayName(period).toLowerCase()}. Players need games and profit to appear.`);
        setLeaderboardData([]);
        return;
      }

      // Mark current user in the data
      const enrichedData = data.map(entry => ({
        ...entry,
        isCurrentUser: authenticated && 
          (entry.wallet_address.toLowerCase() === currentUserWallet.toLowerCase())
      }));

      setLeaderboardData(enrichedData);

      // Calculate stats from leaderboard data
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

      // Get current user's rank if they're authenticated
      if (authenticated && currentUserWallet) {
        const rank = await LeaderboardAPI.getUserRank(currentUserWallet, period);
        setUserRank(rank);
      }

      console.log(`✅ Loaded ${data.length} leaderboard entries`);

    } catch (err) {
      console.error('❌ Leaderboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      setLeaderboardData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch additional stats from database
  const fetchDatabaseStats = async () => {
    try {
      // Get overall statistics from users_unified table
      const { data: userStats, error: statsError } = await supabase
        .from('users_unified')
        .select('total_games_played, total_wagered, net_profit')
        .gt('total_games_played', 0);

      if (!statsError && userStats) {
        const totalGames = userStats.reduce((sum, user) => sum + (user.total_games_played || 0), 0);
        const totalVolume = userStats.reduce((sum, user) => sum + (user.total_wagered || 0), 0);
        
        // Update stats with database values
        setStats(prev => ({
          ...prev,
          totalGames,
          totalVolume: Number(totalVolume.toFixed(2))
        }));
      }
    } catch (error) {
      console.warn('Could not fetch additional stats:', error);
    }
  };

  // Effect to fetch data when period changes
  useEffect(() => {
    const loadData = async () => {
      await fetchLeaderboardData();
      await fetchDatabaseStats();
    };

    loadData();
  }, [period, authenticated, currentUserWallet]);

  // Refresh function
  const handleRefresh = () => {
    fetchLeaderboardData(true);
    fetchDatabaseStats();
  };

  // Get period display name
  const getPeriodDisplayName = (period: Period) => {
    switch (period) {
      case 'daily': return 'Today';
      case 'weekly': return 'This Week';
      case 'monthly': return 'This Month';
      case 'all_time': return 'All Time';
      default: return 'Today';
    }
  };

  // Get period description
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
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
              <p className="text-xs text-gray-500">{getPeriodDescription(period)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* User Rank Badge */}
            {authenticated && userRank && (
              <div className="bg-blue-900/30 border border-blue-700 rounded-lg px-3 py-2">
                <div className="flex items-center text-blue-300">
                  <Crown size={16} className="mr-2" />
                  <span className="text-sm">Your Rank: #{userRank}</span>
                </div>
              </div>
            )}
            
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

        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs">Total Players</p>
                <p className="text-xl font-bold text-white">{stats.totalPlayers}</p>
              </div>
              <Users className="text-blue-400" size={20} />
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs">Total Games</p>
                <p className="text-xl font-bold text-white">{stats.totalGames.toLocaleString()}</p>
              </div>
              <TrendingUp className="text-green-400" size={20} />
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs">Volume</p>
                <p className="text-xl font-bold text-white">{stats.totalVolume.toFixed(2)}</p>
              </div>
              <Award className="text-purple-400" size={20} />
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs">Avg Profit</p>
                <p className="text-xl font-bold text-white">{stats.averageProfit.toFixed(2)}</p>
              </div>
              <Target className="text-orange-400" size={20} />
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
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
          {/* Period Selector Header */}
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
                <div className="text-xs text-gray-400 bg-gray-800 px-3 py-2 rounded-lg">
                  {leaderboardData.length} players
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
        
        {/* Rules & Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Rules */}
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
              <li>Top performers earn exclusive recognition</li>
            </ul>
          </div>

          {/* How It Works */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
              <TrendingUp className="mr-2 text-green-400" size={20} />
              How Rankings Work
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2 text-sm">
              <li><strong className="text-white">Daily:</strong> Last 24 hours of performance</li>
              <li><strong className="text-white">Weekly:</strong> Current week performance</li>
              <li><strong className="text-white">Monthly:</strong> Current month performance</li>
              <li><strong className="text-white">All Time:</strong> Total lifetime performance</li>
              <li>Higher profit percentages rank higher</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LeaderboardPage;