// src/app/leaderboard/page.tsx
'use client';

import { FC, useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { LeaderboardAPI, LeaderboardEntry } from '@/services/api';

const LeaderboardPage: FC = () => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'all_time'>('daily');

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        // Use your actual API method
        const data = await LeaderboardAPI.getLeaderboard(period);
        setLeaderboardData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [period]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">Leaderboard</h1>
        
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400">
              Top traders ranked by profit percentage. Compete with others and climb the ranks!
            </p>
            
            {/* Period selector */}
            <select 
              value={period} 
              onChange={(e) => setPeriod(e.target.value as any)}
              className="bg-gray-800 text-white px-3 py-1 rounded border border-gray-700"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="all_time">All Time</option>
            </select>
          </div>
          
          {loading && <p className="text-gray-400">Loading leaderboard...</p>}
          {error && <p className="text-red-400">Error: {error}</p>}
          {!loading && !error && <Leaderboard entries={leaderboardData} />}
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