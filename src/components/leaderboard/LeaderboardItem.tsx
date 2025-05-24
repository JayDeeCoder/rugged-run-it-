import { FC } from 'react';
import { UserBadge } from '../../types/user';

interface LeaderboardItemProps {
  rank: number;
  user: {
    username: string;
    level: number;
    role: string;
    avatar?: string;
    badge?: UserBadge;
  };
  profit: number;
}

const LeaderboardItem: FC<LeaderboardItemProps> = ({ rank, user, profit }) => {
  const getBadgeIcon = (badge?: UserBadge) => {
    switch (badge) {
      case 'verified': return '✓';
      case 'gold': return '🥇';
      case 'silver': return '🥈';
      case 'bronze': return '🥉';
      default: return '';
    }
  };

  // Format profit for better mobile display
  const formatProfit = (profit: number) => {
    if (Math.abs(profit) >= 1000) {
      return `+${(profit / 1000).toFixed(1)}k%`;
    }
    return `+${profit.toFixed(2)}%`;
  };

  return (
    <div className="flex items-center py-2.5 sm:py-2 border-b border-gray-800 text-xs sm:text-sm hover:bg-gray-900/30 transition-colors duration-150">
      {/* Rank */}
      <div className="w-8 sm:w-10 text-center text-gray-500 font-medium">
        {rank}
      </div>
      
      {/* User Info */}
      <div className="flex-1 flex items-center ml-4 sm:ml-7 min-w-0">
        <span className="mr-2 text-base sm:text-lg flex-shrink-0">
          {user.avatar || '👤'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-medium truncate">
            {user.username}
            {user.badge && (
              <span className="ml-1 text-xs" title={user.badge}>
                {getBadgeIcon(user.badge)}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400">
            Level {user.level}
          </div>
        </div>
      </div>
      
      {/* Profit */}
      <div className="text-right font-medium text-green-400 w-16 sm:w-20 flex-shrink-0">
        <span className="hidden sm:inline">+{profit.toFixed(3)}%</span>
        <span className="sm:hidden">{formatProfit(profit)}</span>
      </div>
    </div>
  );
};

export default LeaderboardItem;