import { FC, useState, useEffect } from 'react';
import { LeaderboardAPI, LeaderboardEntry } from '../../services/api';
import LeaderboardItem from './LeaderboardItem';

interface LeaderboardProps {
  entries?: LeaderboardEntry[];
}

const Leaderboard: FC<LeaderboardProps> = ({ entries: propEntries }) => {
  const [activeTimeframe, setActiveTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'all_time'>('daily');
  const [entries, setEntries] = useState<LeaderboardEntry[]>(propEntries || []);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch leaderboard data when timeframe changes
  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`📊 Fetching ${activeTimeframe} leaderboard...`);
        
        const data = await LeaderboardAPI.getLeaderboard(activeTimeframe);
        
        if (data.length === 0) {
          console.warn('⚠️ No leaderboard data found');
          setError('No leaderboard data available for this period');
        } else {
          console.log(`✅ Loaded ${data.length} leaderboard entries`);
          setEntries(data);
        }
        
      } catch (err) {
        console.error('❌ Error fetching leaderboard:', err);
        setError('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [activeTimeframe]);

  return (
    <div className="bg-[#0d0d0f] border border-gray-800 mx-2 rounded-lg text-gray-400 p-3 sm:p-4 mt-8">
      {/* Header Section - Mobile Responsive */}
      <div className="mb-4 space-y-3 sm:space-y-0">
        {/* Title and Live Indicator Row */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl lg:text-3xl uppercase font-semibold text-white">
            RUGGER Board
          </h2>
          <div className='flex items-center'>
            <span className="h-2 w-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
            <span className="text-xs text-gray-400 hidden sm:inline">Live Updates</span>
            <span className="text-xs text-gray-400 sm:hidden">Live</span>
          </div>
        </div>
        
        {/* Timeframe Buttons Row */}
        <div className='flex flex-wrap gap-2 sm:gap-3'>
          <button 
            className={`flex-1 sm:flex-none border border-gray-800 rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm transition-all duration-200 min-w-0 ${
              activeTimeframe === 'daily' 
                ? 'bg-gray-700 text-white border-gray-600' 
                : 'hover:bg-gray-700 hover:border-gray-600'
            }`}
            onClick={() => setActiveTimeframe('daily')}
          >
            24hrs
          </button>
          <button 
            className={`flex-1 sm:flex-none border border-gray-800 rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm transition-all duration-200 min-w-0 ${
              activeTimeframe === 'weekly' 
                ? 'bg-gray-700 text-white border-gray-600' 
                : 'hover:bg-gray-700 hover:border-gray-600'
            }`}
            onClick={() => setActiveTimeframe('weekly')}
          >
            7days
          </button>
          <button 
            className={`flex-1 sm:flex-none border border-gray-800 rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm transition-all duration-200 min-w-0 ${
              activeTimeframe === 'monthly' 
                ? 'bg-gray-700 text-white border-gray-600' 
                : 'hover:bg-gray-700 hover:border-gray-600'
            }`}
            onClick={() => setActiveTimeframe('monthly')}
          >
            30days
          </button>
          <button 
            className={`flex-1 sm:flex-none border border-gray-800 rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm transition-all duration-200 min-w-0 ${
              activeTimeframe === 'all_time' 
                ? 'bg-gray-700 text-white border-gray-600' 
                : 'hover:bg-gray-700 hover:border-gray-600'
            }`}
            onClick={() => setActiveTimeframe('all_time')}
          >
            All Time
          </button>
        </div>
      </div>
      
      {/* Table Header */}
      <div className="flex text-gray-500 text-xs sm:text-sm py-2 border-b border-gray-800 font-medium">
        <div className="w-8 sm:w-10 text-center">Rank</div>
        <div className="flex-1 ml-4 sm:ml-7">User</div>
        <div className="text-right w-16 sm:w-20">Profit</div>
      </div>
      
      {/* Scrollable container with hidden scrollbar */}
      <div className="max-h-64 sm:max-h-80 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-pulse text-gray-400 text-sm">Loading Ruggerboard...</div>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-red-500 text-sm">{error}</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-sm">No entries for this period</div>
          </div>
        ) : (
          entries.map((entry) => (
            <LeaderboardItem
              key={entry.id}
              rank={entry.rank}
              user={{
                username: entry.username,
                level: entry.level || 1,
                role: 'user',
                avatar: entry.avatar || '👤',
                badge: entry.badge as any || 'user',
                gamesPlayed: entry.games_played,
                bestMultiplier: entry.best_multiplier
              }}
              profit={entry.profit_percentage} // Use profit_percentage for display
              totalProfit={entry.total_profit} // Show absolute profit amount
              showDetails={true} // Enable expandable details
              onClick={() => console.log('Clicked user:', entry.username)} // Add click handler
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Leaderboard;