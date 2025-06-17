// Enhanced Leaderboard Component with NEW XP SYSTEM from users_unified
import { FC, useState, useEffect } from 'react';
import { LeaderboardEntry, UserAPI } from '../../services/api';
import { Crown, Star, Medal, Trophy, TrendingUp, Zap, Shield, Award, Activity, BarChart3, TrendingDown } from 'lucide-react';
interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

const Leaderboard: FC<LeaderboardProps> = ({ entries }) => {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [userTradeHistory, setUserTradeHistory] = useState<{[key: string]: any}>({});
const [loadingTradeHistory, setLoadingTradeHistory] = useState<{[key: string]: boolean}>({});

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

  // 🚀 NEW: Use the enhanced XP system from UserAPI
  const calculateLevelProgress = (user: LeaderboardEntry) => {
    // Use the new UserAPI method for accurate level progress calculation
    return UserAPI.calculateLevelProgress({
      level: user.level,
      experience_points: user.experience_points,
      total_games_played: user.games_played,
      win_rate: user.win_rate
    });
  };

  // 🚀 NEW: Get XP requirement for display
  const getXPRequirement = (level: number) => {
    return UserAPI.getXPRequirement(level);
  };

  // 🚀 NEW: Format XP numbers for display
  const formatXP = (xp: number) => {
    if (xp >= 10000) {
      return `${(xp / 1000).toFixed(1)}k`;
    }
    return xp.toString();
  };

  // 🚀 NEW: Get level tier and styling
  const getLevelInfo = (level: number) => {
    const tier = Math.ceil(level / 10);
    const isEarlyLevel = level <= 3;
    
    if (isEarlyLevel) {
      return { 
        tierText: 'Rookie', 
        color: 'text-green-400', 
        bgColor: 'bg-green-600/20',
        icon: '🌱'
      };
    }
    
    if (level <= 8) {
      return { 
        tierText: 'Rising', 
        color: 'text-blue-400', 
        bgColor: 'bg-blue-600/20',
        icon: '⭐'
      };
    }

    if (tier <= 2) {
      return { 
        tierText: `Tier ${tier}`, 
        color: 'text-purple-400', 
        bgColor: 'bg-purple-600/20',
        icon: '💎'
      };
    }

    return { 
      tierText: `Elite T${tier}`, 
      color: 'text-yellow-400', 
      bgColor: 'bg-yellow-600/20',
      icon: '👑'
    };
  };

  const loadTradeHistoryForUser = async (userId: string) => {
  if (userTradeHistory[userId] || loadingTradeHistory[userId]) {
    return; // Already loaded or loading
  }

  setLoadingTradeHistory(prev => ({ ...prev, [userId]: true }));
  
  try {
    console.log(`📊 Loading trade history for user: ${userId}`);
    const tradeHistory = await UserAPI.getEnhancedTradeHistory(userId, 5);
    
    setUserTradeHistory(prev => ({
      ...prev,
      [userId]: tradeHistory
    }));
    
    console.log(`✅ Trade history loaded for user ${userId}:`, tradeHistory);
  } catch (error) {
    console.error(`❌ Error loading trade history for user ${userId}:`, error);
    setUserTradeHistory(prev => ({
      ...prev,
      [userId]: { trades: [], hasEnhancedData: false }
    }));
  } finally {
    setLoadingTradeHistory(prev => ({ ...prev, [userId]: false }));
  }
};

  const toggleExpanded = (entryId: string) => {
    const newExpandedEntry = expandedEntry === entryId ? null : entryId;
    const [userTradeHistory, setUserTradeHistory] = useState<{[key: string]: any}>({});
const [loadingTradeHistory, setLoadingTradeHistory] = useState<{[key: string]: boolean}>({});
    setExpandedEntry(newExpandedEntry);
    
    // Load trade history when expanding
    if (newExpandedEntry) {
      loadTradeHistoryForUser(entryId);
    }
  };

  const TradeHistorySection = ({ userId }: { userId: string }) => {
  const tradeData = userTradeHistory[userId];
  const isLoading = loadingTradeHistory[userId];

  if (isLoading) {
    return (
      <div className="mt-4 pt-3 border-t border-gray-700">
        <h4 className="text-white font-medium mb-2 flex items-center">
          <Activity className="mr-2 text-blue-400" size={16} />
          Recent Trades
        </h4>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full mr-2"></div>
          <span className="text-gray-400 text-sm">Loading trade history...</span>
        </div>
      </div>
    );
  }

  if (!tradeData || tradeData.trades.length === 0) {
    return (
      <div className="mt-4 pt-3 border-t border-gray-700">
        <h4 className="text-white font-medium mb-2 flex items-center">
          <Activity className="mr-2 text-blue-400" size={16} />
          Recent Trades
        </h4>
        <div className="text-center py-3 text-gray-400 text-sm">
          No recent trades available
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-gray-700">
      <h4 className="text-white font-medium mb-2 flex items-center">
        <Activity className="mr-2 text-blue-400" size={16} />
        Recent Trades
        {tradeData.hasEnhancedData && (
          <span className="ml-2 text-xs text-green-400 bg-green-400/20 px-2 py-0.5 rounded">
            ENHANCED
          </span>
        )}
      </h4>

      {/* Trade Analytics Summary */}
      {tradeData.analytics && (
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="text-center">
            <div className="text-sm font-bold text-white">{tradeData.analytics.total_trades}</div>
            <div className="text-xs text-gray-400">Trades</div>
          </div>
          <div className="text-center">
            <div className={`text-sm font-bold ${tradeData.analytics.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {tradeData.analytics.win_rate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">Win Rate</div>
          </div>
          <div className="text-center">
            <div className={`text-sm font-bold ${tradeData.analytics.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {tradeData.analytics.total_profit >= 0 ? '+' : ''}{tradeData.analytics.total_profit.toFixed(3)}
            </div>
            <div className="text-xs text-gray-400">Total P&L</div>
          </div>
          <div className="text-center">
            <div className={`text-sm font-bold ${tradeData.analytics.avg_return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {tradeData.analytics.avg_return >= 0 ? '+' : ''}{tradeData.analytics.avg_return.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">Avg Return</div>
          </div>
        </div>
      )}

      {/* Individual Trades */}
      <div className="space-y-2">
        {tradeData.trades.slice(0, 3).map((trade: any, index: number) => (
          <div 
            key={trade.id || index}
            className={`p-2 rounded border text-xs ${
              trade.was_winner
                ? 'border-green-600/30 bg-green-600/10'
                : 'border-red-600/30 bg-red-600/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {trade.was_winner ? (
                  <TrendingUp className="text-green-400" size={12} />
                ) : (
                  <TrendingDown className="text-red-400" size={12} />
                )}
                <span className="text-white font-medium">
                  {trade.bet_amount.toFixed(3)} SOL
                </span>
                {trade.cashout_multiplier && (
                  <span className="text-gray-400">
                    @ {trade.cashout_multiplier.toFixed(2)}x
                  </span>
                )}
                {tradeData.hasEnhancedData && trade.risk_level && (
                  <span className={`px-1 py-0.5 rounded text-xs ${
                    trade.risk_level === 'high' ? 'bg-red-600/20 text-red-400' :
                    trade.risk_level === 'medium' ? 'bg-yellow-600/20 text-yellow-400' :
                    'bg-green-600/20 text-green-400'
                  }`}>
                    {trade.risk_level.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className={`font-bold ${trade.was_winner ? 'text-green-400' : 'text-red-400'}`}>
                  {trade.return_percentage > 0 ? '+' : ''}{trade.return_percentage.toFixed(1)}%
                </div>
                <div className="text-gray-400 text-xs">
                  {new Date(trade.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {tradeData.trades.length > 3 && (
          <div className="text-center py-2">
            <span className="text-xs text-gray-400">
              +{tradeData.trades.length - 3} more trades
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
        
        // 🚀 NEW: Use enhanced XP system calculations
        const levelProgress = calculateLevelProgress(entry);
        const levelInfo = getLevelInfo(entry.level);
        const nextLevelXP = getXPRequirement(entry.level + 1);
        const currentLevelXP = getXPRequirement(entry.level);

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
                  {/* Username with enhanced level display */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-semibold truncate text-sm sm:text-base">
                      {entry.username}
                    </span>
                    
                    {/* 🚀 ENHANCED: Level badge with tier info */}
                    <div className={`flex items-center px-2 py-0.5 rounded text-xs border ${levelInfo.color} ${levelInfo.bgColor} border-current/30`}>
                      <span className="mr-1">{levelInfo.icon}</span>
                      L{entry.level}
                    </div>
                    
                    {/* Tier indicator for higher levels */}
                    {entry.level > 8 && (
                      <div className="text-xs text-gray-400">
                        {levelInfo.tierText}
                      </div>
                    )}
                    
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
                  
                  {/* 🚀 ENHANCED: Stats row with XP info */}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center">
                      <Star size={10} className="mr-1 text-blue-400" />
                      {formatXP(entry.experience_points)} XP
                    </span>
                    <span>•</span>
                    <span>{entry.games_played} games</span>
                    <span>•</span>
                    <span className="text-green-400">{entry.win_rate.toFixed(1)}% win</span>
                    {/* Show early level boost indicator */}
                    {levelProgress.isEarlyLevel && (
                      <>
                        <span>•</span>
                        <span className="text-yellow-400 font-medium">BOOST!</span>
                      </>
                    )}
                  </div>

                  {/* 🚀 ENHANCED: Level progress bar with better calculations */}
                  <div className="mt-1 w-full max-w-24 sm:max-w-32">
                    <div className="w-full bg-gray-700 rounded-full h-1 relative">
                      <div 
                        className={`h-1 rounded-full transition-all duration-300 ${
                          levelProgress.isEarlyLevel 
                            ? 'bg-gradient-to-r from-green-400 to-yellow-400' 
                            : 'bg-gradient-to-r from-purple-500 to-blue-500'
                        }`}
                        style={{ width: `${Math.max(2, levelProgress.progressPercentage)}%` }}
                      ></div>
                      {/* Ready to level up indicator */}
                      {levelProgress.readyToLevelUp && (
                        <div className="absolute -top-0.5 right-0 w-2 h-2 bg-yellow-400 rounded-full animate-bounce"></div>
                      )}
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

            {/* 🚀 ENHANCED: Expanded details section with new XP system info */}
            {isExpanded && (
              <div className="bg-gray-800/30 px-4 sm:px-6 py-4 border-t border-gray-700">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                  
                  {/* 🚀 ENHANCED: Level & XP Details with new system */}
                  <div className="col-span-2 sm:col-span-4 lg:col-span-6 mb-3">
                    <h4 className="text-white font-medium mb-2 flex items-center">
                      <Crown className="mr-2 text-purple-400" size={16} />
                      Player Profile {levelProgress.isEarlyLevel && <span className="ml-2 text-xs text-yellow-400 bg-yellow-400/20 px-2 py-0.5 rounded">EARLY BOOST ACTIVE</span>}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <div className="text-gray-400 text-xs">Level ({levelInfo.tierText})</div>
                        <div className={`font-semibold ${levelInfo.color}`}>
                          {levelInfo.icon} {entry.level}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Total XP</div>
                        <div className="text-blue-400 font-semibold">{formatXP(entry.experience_points)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Level Progress</div>
                        <div className="text-green-400 font-semibold">
                          {levelProgress.progressPercentage.toFixed(1)}%
                          {levelProgress.readyToLevelUp && <span className="ml-1 text-yellow-400">🎉</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Next Level XP</div>
                        <div className="text-purple-400 font-semibold">
                          {levelProgress.xpNeeded > 0 ? formatXP(levelProgress.xpNeeded) : 'Ready!'}
                        </div>
                      </div>
                    </div>
                    
                    {/* 🚀 NEW: XP Progress visualization */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>XP Progress to Level {entry.level + 1}</span>
                        <span>{formatXP(levelProgress.xpThisLevel)} / {formatXP(levelProgress.xpNeededThisLevel)}</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-500 ${
                            levelProgress.isEarlyLevel 
                              ? 'bg-gradient-to-r from-green-400 via-yellow-400 to-orange-400' 
                              : levelProgress.readyToLevelUp
                                ? 'bg-gradient-to-r from-yellow-400 to-green-400'
                                : 'bg-gradient-to-r from-purple-500 to-blue-500'
                          }`}
                          style={{ width: `${Math.max(2, levelProgress.progressPercentage)}%` }}
                        ></div>
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
                {/* 👇 ADD THIS ONE LINE HERE 👇 */}
<TradeHistorySection userId={entry.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Leaderboard;