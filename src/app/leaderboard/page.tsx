// src/app/leaderboard/page.tsx
'use client';

import { FC } from 'react';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { mockLeaderboardEntries } from '../../data/MockData';

const LeaderboardPage: FC = () => {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">Leaderboard</h1>
        
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <p className="text-gray-400 mb-4">
            Top traders ranked by profit percentage. Compete with others and climb the ranks!
          </p>
          
          {/* Use the same Leaderboard component from the homepage */}
          <Leaderboard entries={mockLeaderboardEntries} />
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