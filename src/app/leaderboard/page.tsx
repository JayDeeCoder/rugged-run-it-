// src/app/leaderboard/page.tsx
'use client';

import { FC, useState, useEffect, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { UserContext } from '../../context/UserContext';
import { RefreshCw } from 'lucide-react';
import { LeaderboardEntry } from '@/services/api'; // Import the existing type

type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';

const LeaderboardPage: FC = () => {
  // State (matching your original)
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('daily');

  // Hooks
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { currentUser } = useContext(UserContext);

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

  // Fetch leaderboard data from Supabase
  const fetchLeaderboardData = async () => {
    try {
      setLoading(true);
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
          created_at
        `)
        .gte('created_at', start)
        .lte('created_at', end)
        .not('profit_loss', 'is', null);

      if (betsError) {
        throw new Error('Failed to fetch leaderboard data');
      }

      // Also fetch user data separately to avoid relationship issues
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, wallet_address, username, avatar, level, badge');

      // Create user lookup map
      const userMap = new Map();
      users?.forEach(user => {
        if (user.wallet_address) {
          userMap.set(user.wallet_address, user);
        }
      });

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
      }>();

      // Aggregate stats by wallet address
      bets?.forEach(bet => {
        const key = bet.wallet_address;
        const user = userMap.get(bet.wallet_address);
        
        const existing = playerStats.get(key) || {
          walletAddress: bet.wallet_address,
          userId: bet.user_id,
          username: user?.username || `${bet.wallet_address.slice(0, 6)}...${bet.wallet_address.slice(-4)}`,
          totalProfit: 0,
          totalWagered: 0,
          gamesPlayed: 0,
          wins: 0,
          bestMultiplier: 0
        };

        existing.totalProfit += bet.profit_loss || 0;
        existing.totalWagered += bet.bet_amount || 0;
        existing.gamesPlayed += 1;
        if ((bet.profit_loss || 0) > 0) existing.wins += 1;
        existing.bestMultiplier = Math.max(existing.bestMultiplier, bet.cashout_multiplier || 0);

        playerStats.set(key, existing);
      });

      // Filter players with minimum 5 games and create leaderboard entries
      const leaderboard: LeaderboardEntry[] = Array.from(playerStats.values())
        .filter(player => player.gamesPlayed >= 5)
        .map((player, index) => ({
          id: player.userId || player.walletAddress,
          rank: 0, // Will be set after sorting
          wallet_address: player.walletAddress,
          username: player.username,
          total_profit: Number(player.totalProfit.toFixed(6)),
          profit_percentage: player.totalWagered > 0 ? Number(((player.totalProfit / player.totalWagered) * 100).toFixed(2)) : 0,
          games_played: player.gamesPlayed,
          best_multiplier: Number(player.bestMultiplier.toFixed(2)),
          win_rate: Number(((player.wins / player.gamesPlayed) * 100).toFixed(1)),
          total_wagered: Number(player.totalWagered.toFixed(6)),
          isCurrentUser: authenticated && player.walletAddress === currentUserWallet
        }))
        .sort((a, b) => b.profit_percentage - a.profit_percentage)
        .map((entry, index) => ({ ...entry, rank: index + 1 }))
        .slice(0, 50); // Top 50

      setLeaderboardData(leaderboard);

    } catch (err) {
      console.error('Leaderboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  // Effect to fetch data when period changes
  useEffect(() => {
    fetchLeaderboardData();
  }, [period, authenticated, currentUserWallet]);

  // Refresh function
  const handleRefresh = () => {
    fetchLeaderboardData();
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">Leaderboard</h1>
        
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400">
              Top traders ranked by profit percentage. Compete with others and climb the ranks!
            </p>
            
            <div className="flex items-center space-x-3">
              {/* Period selector */}
              <select 
                value={period} 
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="bg-gray-800 text-white px-3 py-1 rounded border border-gray-700"
                disabled={loading}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="all_time">All Time</option>
              </select>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded border border-gray-700 transition-colors disabled:opacity-50 flex items-center"
              >
                <RefreshCw size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
          
          {loading && <p className="text-gray-400">Loading leaderboard...</p>}
          
          {error && (
            <div className="text-center py-4">
              <p className="text-red-400 mb-2">Error: {error}</p>
              <button
                onClick={handleRefresh}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
          
          {!loading && !error && leaderboardData.length > 0 && (
            <Leaderboard entries={leaderboardData} />
          )}
          
          {!loading && !error && leaderboardData.length === 0 && (
            <p className="text-gray-400">No leaderboard data available for this period.</p>
          )}
        </div>
        
        <div className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Leaderboard Rules</h2>
          <ul className="list-disc list-inside text-gray-400 space-y-2">
            <li>Rankings are based on profit percentage over the selected timeframe</li>
            <li>Users must complete at least 5 trades to qualify for the leaderboard</li>
            <li>Leaderboard resets at the end of each period</li>
            <li>Top performers receive exclusive rewards and badges</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
};

export default LeaderboardPage;