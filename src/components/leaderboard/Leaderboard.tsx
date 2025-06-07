// Enhanced Leaderboard Component with users_unified data
import { FC, useState } from 'react';
import { LeaderboardEntry } from '../../services/api';
import { Crown, Star, Medal, Trophy, TrendingUp, Zap, Shield, Award } from 'lucide-react';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

const Leaderboard: FC<LeaderboardProps> = ({ entries }) => {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  // Enhanced badge system with colors and icons
  const getBadgeInfo = (badge?: string) => {
    switch (badge) {
      case 'newcomer':
        return { icon: '🆕', color: 'text-gray-400', bgColor: 'bg-gray-600/20', label: 'Newcomer' };
      case 'verified':
        return { icon: '✓', color: 'text-blue-400', bgColor: 'bg-blue-600/20', label: 'Verified' };
      case 'bronze':
        return { icon: '🥉', color: 'text-orange-400', bgColor: 'bg-orange-600/20', label: 'Bronze' };
      case 'silver':
        return { icon: '🥈', color: 'text-gray-300', bgColor: 'bg-gray-500/20', label: 'Silver' };
      case 'gold':
        return { icon: '🥇', color: 'text-yellow-400', bgColor: 'bg-yellow-600/20', label: 'Gold' };
      case 'diamond':
        return { icon: '💎', color: 'text-cyan-400', bgColor: 'bg-cyan-600/20', label: 'Diamond' };
      case 'legend':
        return { icon: '👑', color: 'text-purple-400', bgColor: 'bg-purple-600/20', label: 'Legend' };
      case 'moderator':
        return { icon: '🛡️', color: 'text-green-400', bgColor: 'bg-green-600/20', label: 'Moderator' };
      case 'admin':
        return { icon: '⚡', color: 'text-red-400', bgColor: 'bg-red-600/20', label: 'Admin' };
      default:
        return { icon: '', color: 'text-gray-400', bgColor: 'bg-gray-600/20', label: 'User' };
    }
  };

  // Get rank styling based on position
  const getRankStyling = (rank: number) => {
    switch (rank) {
      case 1:
        return 'text-yellow-400 font-bold text-lg drop-shadow-lg';
      case 2:
        return 'text-gray-300 font-bold text-lg';
      case 3:
        return 'text-orange-400 font-bold text-lg';
      default:
        return rank <= 10 ? 'text-white font-medium' : 'text-gray-400 font-medium';
    }
  };

  // Get special rank indicators
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="text-yellow-400 ml-1" size={16} />;
      case 2: return <Medal className="text-gray-300 ml-1" size={16} />;
      case 3: return <Award className="text-orange-400 ml-1" size={16} />;
      default: return null;
    }
  };

  // Format profit with proper color coding
  const formatProfit = (profit: number) => {
    const isPositive = profit >= 0;
    const absProfit = Math.abs(profit);
    
    if (absProfit >= 1000) {
      return {
        text: `${isPositive ? '+' : '-'}${(absProfit / 1000).toFixed(1)}k`,
        color: isPositive ? 'text-green-400' : 'text-red-400'
      };
    }
    
    return {
      text: `${isPositive ? '+' : '-'}${absProfit.toFixed(2)}`,
      color: isPositive ? 'text-green-400' : 'text-red-400'
    };
  };

  // Format percentage
  const formatPercentage = (percentage: number) => {
    const isPositive = percentage >= 0;
    return {
      text: `${isPositive ? '+' : ''}${percentage.toFixed(1)}%`,
      color: isPositive ? 'text-green-400' : 'text-red-400'
    };
  };

  // Calculate level progress (same logic as dashboard)
  const calculateLevelProgress = (user: LeaderboardEntry) => {
    const currentLevel = user.level;
    const currentXP = user.experience_points;
    
    const baseXP = 100;
    const xpForNextLevel = baseXP * Math.pow(1.5, currentLevel - 1);
    const xpForCurrentLevel = currentLevel > 1 ? baseXP * Math.pow(1.5, currentLevel - 2) : 0;
    const xpNeededThisLevel = xpForNextLevel - xpForCurrentLevel;
    const xpProgressThisLevel = currentXP - xpForCurrentLevel;
    
    const progressPercentage = Math.min(100, Math.max(0, (xpProgressThisLevel / xpNeededThisLevel) * 100));

    return { progressPercentage };
  };

  const toggleExpanded = (entryId: string) => {
    setExpandedEntry(expandedEntry === entryId ? null : entryId);
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Trophy size={48} className="mx-auto mb-4 text-gray-600" />
        <p>No leaderboard entries found</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-800">
      {entries.map((entry) => {
        const badgeInfo = getBadgeInfo(entry.badge);
        const profitFormatted = formatProfit(entry.total_profit);
        const percentageFormatted = formatPercentage(entry.profit_percentage);
        const rankStyling = getRankStyling(entry.rank);
        const isExpanded = expandedEntry === entry.id;
        const levelProgress = calculateLevelProgress(entry);

        return (
          <div key={entry.id} className="transition-all duration-200">
            {/* Main Entry Row */}
            <div 
              className={`
                flex items-center py-4 px-4 sm:px-6 cursor-pointer
                transition-all duration-150
                ${entry.rank <= 3 ? 'bg-gradient-to-r from-yellow-900/10 to-transparent' : 'hover:bg-gray-800/30'}
                ${isExpanded ? 'bg-gray-800/50' : ''}
              `}
              onClick={() => toggleExpanded(entry.id)}
            >
              {/* Rank with special styling for top 3 */}
              <div className={`w-12 sm:w-16 text-center ${rankStyling} relative flex items-center justify-center`}>
                <span className="relative z-10">#{entry.rank}</span>
                {getRankIcon(entry.rank)}
              </div>
              
              {/* User Info */}
              <div className="flex-1 flex items-center ml-3 sm:ml-4 min-w-0">
                {/* Avatar */}
                <div className="mr-3 text-lg sm:text-xl flex-shrink-0 relative">
                  <span className="relative z-10">{entry.avatar || '👤'}</span>
                  {entry.rank <= 3 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                  )}
                </div>
                
                <div className="min-w-0 flex-1">
                  {/* Username with level and badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-semibold truncate text-sm sm:text-base">
                      {entry.username}
                    </span>
                    
                    {/* Level badge */}
                    <div className="flex items-center bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded text-xs border border-purple-600/30">
                      <Crown size={10} className="mr-1" />
                      {entry.level}
                    </div>
                    
                    {/* User badge */}
                    {entry.badge && badgeInfo.icon && (
                      <div 
                        className={`px-1.5 py-0.5 rounded text-xs ${badgeInfo.color} ${badgeInfo.bgColor} border border-current/20`}
                        title={badgeInfo.label}
                      >
                        {badgeInfo.icon}
                      </div>
                    )}
                  </div>
                  
                  {/* Stats row */}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center">
                      <Star size={10} className="mr-1 text-blue-400" />
                      {entry.experience_points} XP
                    </span>
                    <span>•</span>
                    <span>{entry.games_played} games</span>
                    <span>•</span>
                    <span className="text-green-400">{entry.win_rate.toFixed(1)}% win</span>
                  </div>

                  {/* Level progress bar (compact) */}
                  <div className="mt-1 w-full max-w-24 sm:max-w-32">
                    <div className="w-full bg-gray-700 rounded-full h-1">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(2, levelProgress.progressPercentage)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Performance Stats */}
              <div className="text-right flex-shrink-0 w-20 sm:w-28">
                {/* Profit percentage */}
                <div className={`font-semibold text-sm sm:text-base ${percentageFormatted.color}`}>
                  {percentageFormatted.text}
                </div>
                
                {/* Total profit */}
                <div className={`text-xs ${profitFormatted.color} mt-0.5`}>
                  {profitFormatted.text} SOL
                </div>
                
                {/* Best multiplier */}
                <div className="text-xs text-purple-400 mt-0.5">
                  {entry.best_multiplier.toFixed(2)}x
                </div>
              </div>

              {/* Expand indicator */}
              <div className="ml-2 sm:ml-3 text-gray-500">
                <span className={`transform transition-transform text-xs ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </div>
            </div>

            {/* Expanded details section */}
            {isExpanded && (
              <div className="bg-gray-800/30 px-4 sm:px-6 py-4 border-t border-gray-700">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                  {/* Level & XP Details */}
                  <div className="col-span-2 sm:col-span-4 lg:col-span-6 mb-3">
                    <h4 className="text-white font-medium mb-2 flex items-center">
                      <Crown className="mr-2 text-purple-400" size={16} />
                      Player Profile
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <div className="text-gray-400 text-xs">Level</div>
                        <div className="text-purple-400 font-semibold">{entry.level}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Experience</div>
                        <div className="text-blue-400 font-semibold">{entry.experience_points}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Tier</div>
                        <div className="text-yellow-400 font-semibold">{entry.tier}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Progress</div>
                        <div className="text-green-400 font-semibold">{levelProgress.progressPercentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Game Stats */}
                  <div>
                    <div className="text-gray-400 text-xs">Games Played</div>
                    <div className="text-white font-semibold">{entry.games_played}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Win Rate</div>
                    <div className="text-green-400 font-semibold">{entry.win_rate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Best Multiplier</div>
                    <div className="text-purple-400 font-semibold">{entry.best_multiplier.toFixed(2)}x</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Win Streak</div>
                    <div className="text-orange-400 font-semibold">{entry.current_win_streak}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Best Streak</div>
                    <div className="text-yellow-400 font-semibold">{entry.best_win_streak}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Total Wagered</div>
                    <div className="text-blue-400 font-semibold">{entry.total_wagered.toFixed(2)}</div>
                  </div>
                </div>

                {/* Badges & Achievements */}
                {(entry.badges_earned.length > 0 || entry.achievements.length > 0) && (
                  <div className="mt-4 pt-3 border-t border-gray-700">
                    <h4 className="text-white font-medium mb-2 flex items-center">
                      <Award className="mr-2 text-yellow-400" size={16} />
                      Achievements
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {entry.badges_earned.slice(0, 5).map((badge, index) => (
                        <span 
                          key={index}
                          className="text-xs bg-yellow-600/20 text-yellow-300 px-2 py-1 rounded border border-yellow-600/30"
                        >
                          {badge}
                        </span>
                      ))}
                      {entry.badges_earned.length > 5 && (
                        <span className="text-xs text-gray-400 px-2 py-1">
                          +{entry.badges_earned.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Leaderboard;