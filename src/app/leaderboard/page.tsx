// src/app/leaderboard/page.tsx - Fixed scrolling version
'use client';

import { FC, useState, useEffect } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import Layout from '../../components/layout/Layout';
import Leaderboard from '../../components/leaderboard/Leaderboard';
import { useUser } from '../../context/UserContext';
import { Trophy, RefreshCw, TrendingUp, Users, Award, Crown, Medal, Target, Star, Zap } from 'lucide-react';
import { LeaderboardAPI, LeaderboardEntry, UserAPI } from '../../services/api';

type Period = 'daily' | 'weekly' | 'monthly' | 'all_time';

interface LeaderboardStats {
  totalPlayers: number;
  totalGames: number;
  totalVolume: number;
  averageProfit: number;
  topPlayerProfit: number;
}

const LeaderboardPage: FC = () => {
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { isAuthenticated } = useUser();
  
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

  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const currentUserWallet = embeddedWallet?.address || '';

  // [Keep all your existing functions...]

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

  // [Keep all your existing functions...]

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
      {/* Main container with proper padding and spacing */}
      <div className="min-h-screen bg-[#0d0d0f]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <button
                onClick={() => {}}
                disabled={loading || refreshing}
                className="flex items-center bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Content sections with proper spacing */}
          <div className="space-y-8">
            {/* User Level Info using users_unified data */}
            {isAuthenticated && currentUserData && (
              <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* User Basic Info */}
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
                      
                      {/* Enhanced badges display */}
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
                    
                    {/* Current Rank */}
                    {userRank && (
                      <div className="text-center bg-gray-800/50 rounded-lg p-3">
                        <div className="text-2xl font-bold text-yellow-400">#{userRank}</div>
                        <div className="text-xs text-gray-400">Current Rank</div>
                      </div>
                    )}
                  </div>

                  {/* Level Progress */}
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

                          {/* Quick Stats */}
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

            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
                    <p className="text-xs text-gray-500 mt-2">Fetching {getPeriodDisplayName(period).toLowerCase()} rankings from users_unified</p>
                  </div>
                )}
                
                {error && (
                  <div className="text-center py-16">
                    <Trophy className="text-gray-600 mx-auto mb-4" size={48} />
                    <p className="text-red-400 mb-4">{error}</p>
                    <button
                      onClick={() => {}}
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
                      onClick={() => {}}
                      className="text-blue-400 hover:text-blue-300 text-sm underline"
                    >
                      Refresh to check for new data
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Rules & Information */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <li>Level and XP data synced with dashboard</li>
                  <li>Top performers earn exclusive recognition</li>
                </ul>
              </div>

              {/* How It Works */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                  <TrendingUp className="mr-2 text-green-400" size={20} />
                  Level & XP System
                </h2>
                <ul className="list-disc list-inside text-gray-400 space-y-2 text-sm">
                  <li><strong className="text-white">XP:</strong> Earned by playing games and achieving wins</li>
                  <li><strong className="text-white">Levels:</strong> Unlock new features and recognition</li>
                  <li><strong className="text-white">Tiers:</strong> Every 10 levels advances your tier</li>
                  <li><strong className="text-white">Badges:</strong> Special achievements and milestones</li>
                  <li>All progression synced across dashboard and leaderboard</li>
                </ul>
              </div>
            </div>

            {/* Extra spacing at bottom */}
            <div className="h-16"></div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LeaderboardPage;