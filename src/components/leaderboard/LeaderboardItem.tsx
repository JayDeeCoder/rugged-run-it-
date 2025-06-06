import { FC, useState } from 'react';

// Complete UserBadge type definition
export type UserBadge = 
  | 'newcomer' 
  | 'user' 
  | 'verified' 
  | 'bronze' 
  | 'silver' 
  | 'gold' 
  | 'diamond' 
  | 'legend'
  | 'moderator'
  | 'admin';

// Extended user interface
interface LeaderboardUser {
  username: string;
  level: number;
  role: string;
  avatar?: string;
  badge?: UserBadge;
  gamesPlayed?: number;
  winRate?: number;
  bestMultiplier?: number;
}

interface LeaderboardItemProps {
  rank: number;
  user: LeaderboardUser;
  profit: number;
  totalProfit?: number; // Absolute profit amount
  showDetails?: boolean;
  onClick?: () => void;
  isCurrentUser?: boolean;
}

const LeaderboardItem: FC<LeaderboardItemProps> = ({ 
  rank, 
  user, 
  profit, 
  totalProfit,
  showDetails = false,
  onClick,
  isCurrentUser = false
}) => {
  const [showExpandedInfo, setShowExpandedInfo] = useState(false);

  // Enhanced badge system with colors and icons
  const getBadgeInfo = (badge?: UserBadge) => {
    switch (badge) {
      case 'newcomer':
        return { icon: '🆕', color: 'text-gray-400', bgColor: 'bg-gray-600/20' };
      case 'verified':
        return { icon: '✓', color: 'text-blue-400', bgColor: 'bg-blue-600/20' };
      case 'bronze':
        return { icon: '🥉', color: 'text-orange-400', bgColor: 'bg-orange-600/20' };
      case 'silver':
        return { icon: '🥈', color: 'text-gray-300', bgColor: 'bg-gray-500/20' };
      case 'gold':
        return { icon: '🥇', color: 'text-yellow-400', bgColor: 'bg-yellow-600/20' };
      case 'diamond':
        return { icon: '💎', color: 'text-cyan-400', bgColor: 'bg-cyan-600/20' };
      case 'legend':
        return { icon: '👑', color: 'text-purple-400', bgColor: 'bg-purple-600/20' };
      case 'moderator':
        return { icon: '🛡️', color: 'text-green-400', bgColor: 'bg-green-600/20' };
      case 'admin':
        return { icon: '⚡', color: 'text-red-400', bgColor: 'bg-red-600/20' };
      default:
        return { icon: '', color: 'text-gray-400', bgColor: 'bg-gray-600/20' };
    }
  };

  // Enhanced profit formatting with proper color coding
  const formatProfit = (profit: number) => {
    const isPositive = profit >= 0;
    const absProfit = Math.abs(profit);
    
    if (absProfit >= 1000) {
      return {
        text: `${isPositive ? '+' : '-'}${(absProfit / 1000).toFixed(1)}k%`,
        color: isPositive ? 'text-green-400' : 'text-red-400'
      };
    }
    
    return {
      text: `${isPositive ? '+' : '-'}${absProfit.toFixed(2)}%`,
      color: isPositive ? 'text-green-400' : 'text-red-400'
    };
  };

  // Format absolute profit amount
  const formatAbsoluteProfit = (amount: number) => {
    const isPositive = amount >= 0;
    const absAmount = Math.abs(amount);
    
    if (absAmount >= 1000) {
      return `${isPositive ? '+' : '-'}$${(absAmount / 1000).toFixed(1)}k`;
    } else if (absAmount >= 1) {
      return `${isPositive ? '+' : '-'}$${absAmount.toFixed(2)}`;
    } else {
      return `${isPositive ? '+' : '-'}$${absAmount.toFixed(4)}`;
    }
  };

  // Get rank styling based on position
  const getRankStyling = (rank: number) => {
    switch (rank) {
      case 1:
        return 'text-yellow-400 font-bold text-lg';
      case 2:
        return 'text-gray-300 font-bold';
      case 3:
        return 'text-orange-400 font-bold';
      default:
        return rank <= 10 ? 'text-white font-medium' : 'text-gray-500 font-medium';
    }
  };

  // Get special rank indicators
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '👑';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '';
    }
  };

  const badgeInfo = getBadgeInfo(user.badge);
  const profitFormatted = formatProfit(profit);
  const rankStyling = getRankStyling(rank);

  return (
    <div 
      className={`
        flex items-center py-2.5 sm:py-2 border-b border-gray-800 text-xs sm:text-sm 
        transition-all duration-150 cursor-pointer
        ${isCurrentUser ? 'bg-blue-900/20 border-blue-700' : 'hover:bg-gray-900/30'}
        ${onClick ? 'hover:bg-gray-800/50' : ''}
      `}
      onClick={() => {
        if (onClick) onClick();
        if (showDetails) setShowExpandedInfo(!showExpandedInfo);
      }}
    >
      <div className="flex items-center w-full">
        {/* Rank with special styling for top 3 */}
        <div className={`w-8 sm:w-10 text-center ${rankStyling} relative`}>
          <span className="relative z-10">{rank}</span>
          {getRankIcon(rank) && (
            <span className="absolute -top-1 -right-1 text-xs">
              {getRankIcon(rank)}
            </span>
          )}
        </div>
        
        {/* User Info */}
        <div className="flex-1 flex items-center ml-4 sm:ml-7 min-w-0">
          {/* Avatar with better fallback */}
          <div className="mr-2 text-base sm:text-lg flex-shrink-0 relative">
            <span className="relative z-10">
              {user.avatar || '👤'}
            </span>
            {isCurrentUser && (
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border border-gray-800"></div>
            )}
          </div>
          
          <div className="min-w-0 flex-1">
            {/* Username with badge */}
            <div className="text-white font-medium truncate flex items-center">
              <span className={isCurrentUser ? 'text-blue-300' : 'text-white'}>
                {user.username}
                {isCurrentUser && <span className="ml-1 text-xs">(You)</span>}
              </span>
              
              {/* Enhanced badge display */}
              {user.badge && badgeInfo.icon && (
                <span 
                  className={`ml-2 px-1.5 py-0.5 rounded text-xs ${badgeInfo.color} ${badgeInfo.bgColor} border border-current/20`}
                  title={`${user.badge} badge`}
                >
                  {badgeInfo.icon}
                </span>
              )}
            </div>
            
            {/* Level and additional info */}
            <div className="text-xs text-gray-400 flex items-center space-x-2">
              <span>Level {user.level}</span>
              {user.gamesPlayed && (
                <span>• {user.gamesPlayed} games</span>
              )}
              {user.winRate && (
                <span>• {user.winRate.toFixed(1)}% win rate</span>
              )}
            </div>
          </div>
        </div>
        
        {/* Profit Section */}
        <div className="text-right w-20 sm:w-24 flex-shrink-0">
          {/* Percentage profit */}
          <div className={`font-medium ${profitFormatted.color}`}>
            <span className="hidden sm:inline">{profitFormatted.text}</span>
            <span className="sm:hidden">
              {formatProfit(profit).text}
            </span>
          </div>
          
          {/* Absolute profit (if provided) */}
          {totalProfit !== undefined && (
            <div className="text-xs text-gray-400 mt-0.5">
              {formatAbsoluteProfit(totalProfit)}
            </div>
          )}
        </div>

        {/* Expand indicator */}
        {showDetails && (
          <div className="ml-2 text-gray-500">
            <span className={`transform transition-transform ${showExpandedInfo ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </div>
        )}
      </div>

      {/* Expanded details section */}
      {showDetails && showExpandedInfo && (
        <div className="w-full mt-2 pt-2 border-t border-gray-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {user.gamesPlayed && (
              <div>
                <div className="text-gray-500">Games</div>
                <div className="text-white">{user.gamesPlayed}</div>
              </div>
            )}
            {user.winRate && (
              <div>
                <div className="text-gray-500">Win Rate</div>
                <div className="text-white">{user.winRate.toFixed(1)}%</div>
              </div>
            )}
            {user.bestMultiplier && (
              <div>
                <div className="text-gray-500">Best Multi</div>
                <div className="text-white">{user.bestMultiplier.toFixed(2)}x</div>
              </div>
            )}
            {totalProfit && (
              <div>
                <div className="text-gray-500">Total Profit</div>
                <div className={profitFormatted.color}>
                  {formatAbsoluteProfit(totalProfit)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaderboardItem;