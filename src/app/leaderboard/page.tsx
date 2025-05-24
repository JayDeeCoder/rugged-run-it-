// src/app/leaderboard/page.tsx
'use client';

import { FC, useState, useEffect, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { UserContext } from '../../context/UserContext';
import { Trophy, RefreshCw, TrendingUp, Users, Award } from 'lucide-react';
import { LeaderboardEntry as APILeaderboardEntry } from '../../services/api';

// Local types for internal processing
interface ProcessedLeaderboardEntry {
  rank: number;
  userId?: string;
  walletAddress: string;
  username: string;
  totalProfit: number;
  profitPercentage: number;
  gamesPlayed: number;
  bestMultiplier: number;
  winRate: number;
  totalWagered: number;
  isCurrentUser?: boolean;
}

type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';

const LeaderboardPage: FC = () => {
  // Hooks
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { currentUser } = useContext(UserContext);
  
  // State
  const [leaderboardData, setLeaderboardData] = useState<APILeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('daily');
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalPlayers: 0,
    totalGames: 0,
    totalVolume: 0
  });

  // Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Get current user's wallet
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const currentUserWallet = embeddedWallet?.address || '';

  // Calculate date range for period
  const getDateRange = (period: Period) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
      case 'daily':
        return { start: today.toISOString(), end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString() };
      case 'weekly':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return { start: weekStart.toISOString(), end: now.toISOString() };
      case 'monthly':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: monthStart.toISOString(), end: now.toISOString() };
      case 'all_time':
        return { start: '2024-01-01T00:00:00Z', end: now.toISOString() };
      default:
        return { start: today.toISOString(), end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString() };
    }
  };

  // Convert processed entry to API format
  const convertToAPIFormat = (entry: ProcessedLeaderboardEntry): APILeaderboardEntry => {
    return {
      id: entry.userId || entry.walletAddress,
      wallet_address: entry.walletAddress,
      username: entry.username,
      total_profit: entry.totalProfit,
      profit_percentage: entry.profitPercentage,
      games_played: entry.gamesPlayed,
      best_multiplier: entry.bestMultiplier,
      rank: entry.rank,
      avatar: '👤', // Default avatar
      level: 1, // Default level
      badge: 'user' // Default badge
    };
  };

  // Fetch leaderboard data from Supabase
  const fetchLeaderboardData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const { start, end } = getDateRange(period);

      // Query player bets with user data
      const { data: bets, error: betsError } = await supabase
        .from('player_bets')
        .select(`
          wallet_address,
          user_id,
          bet_amount,
          profit_loss,
          cashout_multiplier,
          status,
          created_at,
          users (
            username,
            avatar,
            level,
            badge
          )
        `)
        .gte('created_at', start)
        .lte('created_at', end)
        .not('profit_loss', 'is', null);

      if (betsError) {
        console.error('Supabase query error:', betsError);
        throw new Error('Failed to fetch leaderboard data');
      }

      // Process data to create leaderboard entries
      const playerStats = new Map<string, {
        walletAddress: string;
        userId?: string;
        username: string;
        totalProfit: number;
        totalWagered: number;
        gamesPlayed: number;
        wins: number;
        bestMultiplier: number;
        avatar?: string;
        level?: number;
        badge?: string;
      }>();

      // Aggregate stats by wallet address
      bets?.forEach(bet => {
        const key = bet.wallet_address;
        
        // Fix: Properly handle user data whether it's an object or array
        let userData: any = null;
        if (bet.users) {
          if (Array.isArray(bet.users)) {
            userData = bet.users.length > 0 ? bet.users[0] : null;
          } else {
            userData = bet.users;
          }
        }
        
        const existing = playerStats.get(key) || {
          walletAddress: bet.wallet_address,
          userId: bet.user_id,
          username: userData?.username || `${bet.wallet_address.slice(0, 6)}...${bet.wallet_address.slice(-4)}`,
          totalProfit: 0,
          totalWagered: 0,
          gamesPlayed: 0,
          wins: 0,
          bestMultiplier: 0,
          avatar: userData?.avatar || '👤',
          level: userData?.level || 1,
          badge: userData?.badge || 'user'
        };

        existing.totalProfit += bet.profit_loss || 0;
        existing.totalWagered += bet.bet_amount || 0;
        existing.gamesPlayed += 1;
        if ((bet.profit_loss || 0) > 0) existing.wins += 1;
        existing.bestMultiplier = Math.max(existing.bestMultiplier, bet.cashout_multiplier || 0);

        playerStats.set(key, existing);
      });

      // Filter players with minimum 5 games and calculate leaderboard
      const processedLeaderboard: ProcessedLeaderboardEntry[] = Array.from(playerStats.values())
        .filter(player => player.gamesPlayed >= 5) // Minimum games requirement
        .map(player => ({
          rank: 0, // Will be set after sorting
          userId: player.userId,
          walletAddress: player.walletAddress,
          username: player.username,
          totalProfit: Number(player.totalProfit.toFixed(6)),
          profitPercentage: player.totalWagered > 0 ? Number(((player.totalProfit / player.totalWagered) * 100).toFixed(2)) : 0,
          gamesPlayed: player.gamesPlayed,
          bestMultiplier: Number(player.bestMultiplier.toFixed(2)),
          winRate: Number(((player.wins / player.gamesPlayed) * 100).toFixed(1)),
          totalWagered: Number(player.totalWagered.toFixed(6)),
          isCurrentUser: authenticated && player.walletAddress === currentUserWallet
        }))
        .sort((a, b) => b.profitPercentage - a.profitPercentage) // Sort by profit percentage
        .map((entry, index) => ({ ...entry, rank: index + 1 }))
        .slice(0, 100); // Top 100

      // Convert to API format for the Leaderboard component
      const apiFormattedData: APILeaderboardEntry[] = processedLeaderboard.map(convertToAPIFormat);
      setLeaderboardData(apiFormattedData);

      // Calculate overall stats
      const totalPlayers = playerStats.size;
      const totalGames = Array.from(playerStats.values()).reduce((sum, p) => sum + p.gamesPlayed, 0);
      const totalVolume = Array.from(playerStats.values()).reduce((sum, p) => sum + p.totalWagered, 0);

      setStats({
        totalPlayers,
        totalGames,
        totalVolume: Number(totalVolume.toFixed(2))
      });

    } catch (err) {
      console.error('Leaderboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch from game server as fallback
  const fetchFromGameServer = async () => {
    try {
      const response = await fetch(`http://3.16.49.236:3001/api/leaderboard/${period}`);
      if (!response.ok) throw new Error('Game server API error');
      
      const data = await response.json();
      if (Array.isArray(data)) {
        const processedData: APILeaderboardEntry[] = data.map((entry, index) => ({
          id: entry.id || entry.walletAddress || `entry-${index}`,
          wallet_address: entry.walletAddress || entry.wallet_address,
          username: entry.username,
          total_profit: entry.totalProfit || entry.total_profit,
          profit_percentage: entry.profitPercentage || entry.profit_percentage,
          games_played: entry.gamesPlayed || entry.games_played,
          best_multiplier: entry.bestMultiplier || entry.best_multiplier,
          rank: index + 1,
          avatar: entry.avatar || '👤',
          level: entry.level || 1,
          badge: entry.badge || 'user'
        }));
        setLeaderboardData(processedData);
      }
    } catch (error) {
      console.error('Game server fetch failed:', error);
      throw error;
    }
  };

  // Effect to fetch data when period changes
  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchLeaderboardData();
      } catch (error) {
        // Fallback to game server
        console.log('Trying game server as fallback...');
        try {
          await fetchFromGameServer();
          setError(null);
        } catch (fallbackError) {
          setError('Failed to load leaderboard from all sources');
        }
      }
    };

    loadData();
  }, [period, authenticated, currentUserWallet]);

  // Refresh function
  const handleRefresh = () => {
    fetchLeaderboardData(true);
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

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <Trophy className="text-yellow-400 mr-3" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
              <p className="text-gray-400">{getPeriodDisplayName(period)} Rankings</p>
            </div>
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-900 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Players</p>
                <p className="text-2xl font-bold text-white">{stats.totalPlayers}</p>
              </div>
              <Users className="text-blue-400" size={24} />
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Games</p>
                <p className="text-2xl font-bold text-white">{stats.totalGames}</p>
              </div>
              <TrendingUp className="text-green-400" size={24} />
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Volume</p>
                <p className="text-2xl font-bold text-white">{stats.totalVolume} SOL</p>
              </div>
              <Award className="text-purple-400" size={24} />
            </div>
          </div>
        </div>
        
        {/* Period Selector & Leaderboard */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white mb-4 sm:mb-0">
              Top Performers - {getPeriodDisplayName(period)}
            </h2>
            
            <select 
              value={period} 
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              disabled={loading}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="all_time">All Time</option>
            </select>
          </div>
          
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-400">Loading leaderboard...</p>
            </div>
          )}
          
          {error && (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">Error: {error}</p>
              <button
                onClick={handleRefresh}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
          
          {!loading && !error && leaderboardData.length > 0 && (
            <Leaderboard entries={leaderboardData} />
          )}
          
          {!loading && !error && leaderboardData.length === 0 && (
            <div className="text-center py-12">
              <Trophy className="text-gray-600 mx-auto mb-4" size={48} />
              <p className="text-gray-400 mb-2">No leaderboard data available for this period.</p>
              <p className="text-gray-500 text-sm">Players need at least 5 games to qualify.</p>
            </div>
          )}
        </div>
        
        {/* Rules */}
        <div className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Leaderboard Rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Rankings based on profit percentage over selected timeframe</li>
              <li>Minimum 5 completed games required to qualify</li>
              <li>Profit percentage calculated as (Total Profit / Total Wagered) × 100</li>
            </ul>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Leaderboard updates in real-time as games complete</li>
              <li>Rankings reset at the end of each period</li>
              <li>Top performers receive exclusive rewards and recognition</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LeaderboardPage;