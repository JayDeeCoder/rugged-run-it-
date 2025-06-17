import { FC, useState, useEffect } from 'react';

// Solana logo component
const SolanaLogo = ({ size = 12, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 397.7 311.7" className={`inline-block ${className}`}>
    <defs>
      <linearGradient id="solanaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9945FF"/>
        <stop offset="100%" stopColor="#14F195"/>
      </linearGradient>
    </defs>
    <path 
      fill="url(#solanaGradient)" 
      d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z M333.1,120.1c2.4-2.4,5.7-3.8,9.2-3.8h56.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L333.1,120.1z"
    />
  </svg>
);

// Simple date formatting helper
const formatTimeAgo = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

// Use your existing enhanced interfaces
interface GameHistoryEntry {
  id: string;
  gameId: string;
  timestamp: Date;
  betAmount: number;
  cashoutMultiplier?: number;
  result: 'win' | 'loss' | 'pending';
  profit: string | null;
}

interface DetailedTradeEntry {
  id: string;
  game_id: string;
  user_id: string;
  wallet_address: string;
  bet_amount: number;
  entry_multiplier: number;
  entry_timestamp: string;
  cashout_multiplier?: number;
  exit_timestamp?: string;
  exit_type: 'manual_cashout' | 'auto_cashout' | 'crashed' | 'pending';
  profit_loss: number;
  win_amount?: number;
  house_edge_taken: number;
  game_crash_multiplier?: number;
  risk_level: 'low' | 'medium' | 'high' | 'extreme';
  bet_size_category: 'micro' | 'small' | 'medium' | 'large' | 'whale';
  was_winner: boolean;
  return_percentage: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TransactionHistoryProps {
  userId?: string;
  gameHistory?: GameHistoryEntry[]; // For compatibility with existing dashboard
  maxItems?: number;
  showFilters?: boolean;
}

const TransactionHistory: FC<TransactionHistoryProps> = ({ 
  userId,
  gameHistory = [],
  maxItems = 50,
  showFilters = true
}) => {
  const [trades, setTrades] = useState<DetailedTradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount' | 'profit'>('newest');

  useEffect(() => {
    loadTransactionHistory();
  }, [userId]);

  const loadTransactionHistory = async () => {
    if (!userId) {
      // Fallback to gameHistory if no userId
      setTrades([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Try enhanced API first
      const response = await fetch(`/api/trades/history/${userId}?limit=${maxItems * 2}`);
      if (response.ok) {
        const data = await response.json();
        setTrades(data.trades || []);
      } else {
        // Fallback to basic game history
        console.warn('Enhanced API not available, using basic history');
        setTrades([]);
      }
    } catch (error) {
      console.error('Error loading transaction history:', error);
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  // Convert gameHistory to compatible format if no enhanced data
  const displayTrades = trades.length > 0 ? trades : gameHistory.map(game => ({
    id: game.id,
    game_id: game.gameId,
    user_id: userId || '',
    wallet_address: '',
    bet_amount: game.betAmount,
    entry_multiplier: 1.0,
    entry_timestamp: game.timestamp.toISOString(),
    cashout_multiplier: game.cashoutMultiplier,
    exit_timestamp: game.timestamp.toISOString(),
    exit_type: game.result === 'pending' ? 'pending' : 
                game.cashoutMultiplier ? 'manual_cashout' : 'crashed' as any,
    profit_loss: parseFloat(game.profit || '0'),
    win_amount: undefined,
    house_edge_taken: 0,
    game_crash_multiplier: undefined,
    risk_level: game.betAmount >= 0.1 ? 'high' : 'low' as any,
    bet_size_category: game.betAmount >= 1.0 ? 'large' : 
                      game.betAmount >= 0.1 ? 'medium' : 'small' as any,
    was_winner: game.result === 'win',
    return_percentage: game.betAmount > 0 ? 
      (parseFloat(game.profit || '0') / game.betAmount) * 100 : 0,
    status: game.result,
    created_at: game.timestamp.toISOString(),
    updated_at: game.timestamp.toISOString()
  }));

  // Filter and sort trades
  const filteredTrades = displayTrades.filter(trade => {
    if (filter === 'wins') return trade.was_winner;
    if (filter === 'losses') return !trade.was_winner;
    return true;
  });

  const sortedTrades = [...filteredTrades].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'amount':
        return b.bet_amount - a.bet_amount;
      case 'profit':
        return b.profit_loss - a.profit_loss;
      case 'newest':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const displayedTrades = showAll ? sortedTrades : sortedTrades.slice(0, maxItems);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-orange-500';
      case 'extreme': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  const getBetSizeIcon = (category: string) => {
    switch (category) {
      case 'micro': return '🐣';
      case 'small': return '🐠';
      case 'medium': return '🐋';
      case 'large': return '🦈';
      case 'whale': return '🐳';
      default: return '💎';
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-800 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-800 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h2 className="text-xl text-white font-bold flex items-center gap-2">
          📜 Transaction History
          <span className="text-sm text-gray-400">({filteredTrades.length})</span>
        </h2>
        
        {/* Controls */}
        {showFilters && displayTrades.length > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            {/* Filter buttons */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              {(['all', 'wins', 'losses'] as const).map((filterOption) => (
                <button
                  key={filterOption}
                  onClick={() => setFilter(filterOption)}
                  className={`px-3 py-1 rounded transition-colors capitalize ${
                    filter === filterOption
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {filterOption}
                </button>
              ))}
            </div>
            
            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-1 text-sm"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="amount">Highest Bet</option>
              <option value="profit">Highest Profit</option>
            </select>
          </div>
        )}
      </div>

      {displayTrades.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-4xl mb-3">🎮</div>
          <div className="text-lg mb-2">No transaction history yet</div>
          <div className="text-sm">Start playing to see your game history here!</div>
        </div>
      ) : (
        <>
          {/* Desktop Headers */}
          <div className="hidden sm:grid sm:grid-cols-7 gap-4 py-2 text-gray-400 text-sm border-b border-gray-800 mb-3">
            <div>Game</div>
            <div>Time</div>
            <div>Bet Amount</div>
            <div>Multiplier</div>
            <div>Result</div>
            <div>Return</div>
            <div className="text-right">P&L</div>
          </div>

          {/* Transaction rows */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {displayedTrades.map((trade) => (
              <div 
                key={trade.id} 
                className={`p-3 border border-gray-700 rounded-lg transition-colors hover:bg-gray-900/50 ${
                  trade.was_winner ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                {/* Mobile layout */}
                <div className="sm:hidden space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs font-mono">
                        #{trade.game_id.slice(-6)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimeAgo(trade.created_at)}
                      </span>
                    </div>
                    <div className={`text-sm font-medium ${trade.was_winner ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.was_winner ? '✅ WIN' : '❌ LOSS'}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">
                        {trade.bet_amount.toFixed(3)}
                      </span>
                      <SolanaLogo size={12} />
                      {trades.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${getRiskColor(trade.risk_level)} bg-current bg-opacity-20`}>
                          {trade.risk_level}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${trade.was_winner ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit_loss >= 0 ? '+' : ''}{trade.profit_loss.toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {trade.return_percentage >= 0 ? '+' : ''}{trade.return_percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <div className="text-gray-400">
                      Multiplier: {trade.cashout_multiplier ? 
                        `${trade.cashout_multiplier.toFixed(2)}x` : 
                        'Crashed'
                      }
                    </div>
                  </div>
                </div>

                {/* Desktop layout */}
                <div className="hidden sm:grid sm:grid-cols-7 gap-4 items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-mono text-xs">
                      #{trade.game_id.slice(-6)}
                    </span>
                    {trades.length > 0 && (
                      <span title={`${trade.bet_size_category} bet`}>
                        {getBetSizeIcon(trade.bet_size_category)}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-gray-400 text-xs">
                    {formatTimeAgo(trade.created_at)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      {trade.bet_amount.toFixed(3)}
                    </span>
                    <SolanaLogo size={12} />
                    {trades.length > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getRiskColor(trade.risk_level)} bg-current bg-opacity-20`}>
                        {trade.risk_level}
                      </span>
                    )}
                  </div>
                  
                  <div>
                    {trade.cashout_multiplier ? (
                      <span className="text-yellow-400 font-medium">
                        {trade.cashout_multiplier.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="text-red-400">💥 Crashed</span>
                    )}
                  </div>
                  
                  <div>
                    {trade.was_winner ? (
                      <span className="text-green-400 font-medium">✅ WIN</span>
                    ) : (
                      <span className="text-red-400 font-medium">❌ LOSS</span>
                    )}
                  </div>
                  
                  <div className="text-center">
                    <div className={`font-medium ${trade.return_percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.return_percentage >= 0 ? '+' : ''}{trade.return_percentage.toFixed(1)}%
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`font-bold ${trade.was_winner ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.profit_loss >= 0 ? '+' : ''}{trade.profit_loss.toFixed(4)}
                    </div>
                    <div className="text-xs text-gray-400">SOL</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Show more/less button */}
          {filteredTrades.length > maxItems && (
            <div className="flex justify-center mt-4 pt-4 border-t border-gray-800">
              <button
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? (
                  <>📤 Show Less</>
                ) : (
                  <>📥 Show All ({filteredTrades.length})</>
                )}
              </button>
            </div>
          )}

          {/* Enhanced data indicator */}
          {trades.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-500 text-center">
              ✨ Enhanced transaction data • Risk levels • Bet categories • Live updates
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TransactionHistory;