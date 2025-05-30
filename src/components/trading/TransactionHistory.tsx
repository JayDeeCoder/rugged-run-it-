import { FC, useState } from 'react';
import { useGameContext, GameHistoryEntry } from '../../context/GameContext';
import { formatDistanceToNow } from 'date-fns';

interface TransactionHistoryProps {
  maxItems?: number;
}

const TransactionHistory: FC<TransactionHistoryProps> = ({ maxItems = 10 }) => {
  const { gameHistory } = useGameContext();
  const [showAll, setShowAll] = useState(false);

  // Calculate total profit/loss
  const totalProfit = gameHistory.reduce((sum, game) => {
    if (game.profit === null) return sum;
    return sum + parseFloat(game.profit);
  }, 0);

  // Function to display formatted profit/loss
  const displayProfit = (profit: string | null) => {
    if (profit === null) return '-';
    
    const value = parseFloat(profit);
    const formattedValue = Math.abs(value).toFixed(4);
    
    if (value > 0) {
      return <span className="text-green-500">+{formattedValue}</span>;
    } else if (value < 0) {
      return <span className="text-red-500">-{formattedValue.replace('-', '')}</span>;
    } else {
      return <span className="text-gray-400">0.000</span>;
    }
  };

  // Filter and limit the history
  const displayedHistory = showAll
    ? gameHistory
    : gameHistory.slice(0, maxItems);

  return (
    <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl text-white font-bold">Transaction History</h2>
        <div className="text-right">
          <div className="text-sm text-gray-400">Total Profit/Loss</div>
          <div className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(4)} SOL
          </div>
        </div>
      </div>

      {gameHistory.length === 0 ? (
        <div className="text-center py-6 text-gray-400">
          No transaction history yet. Start playing to see your results here!
        </div>
      ) : (
        <>
          {/* Headers */}
          <div className="grid grid-cols-6 gap-4 py-2 text-gray-400 text-sm border-b border-gray-800">
            <div>Game #</div>
            <div>Timestamp</div>
            <div>Bet Amount</div>
            <div>Multiplier</div>
            <div>Result</div>
            <div className="text-right">Profit/Loss</div>
          </div>

          {/* Transaction rows */}
          <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
            {displayedHistory.map((game) => (
              <div 
                key={game.id} 
                className={`grid grid-cols-6 gap-4 py-3 text-sm border-b border-gray-700 ${
                  game.result === 'pending' 
                    ? 'text-yellow-500' 
                    : game.result === 'win' 
                      ? 'text-green-500' 
                      : 'text-red-500'
                }`}
              >
                <div>{game.gameId}</div>
                <div>{formatDistanceToNow(game.timestamp, { addSuffix: true })}</div>
                <div>{game.betAmount} SOL</div>
                <div>
                  {game.cashoutMultiplier 
                    ? `${game.cashoutMultiplier.toFixed(2)}x` 
                    : game.result === 'loss' 
                      ? 'Crashed'
                      : 'Pending'
                  }
                </div>
                <div className="capitalize">{game.result}</div>
                <div className="text-right">{displayProfit(game.profit)}</div>
              </div>
            ))}
          </div>

          {/* Show more button */}
          {gameHistory.length > maxItems && (
            <div className="flex justify-center mt-4">
              <button
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Show Less' : `Show All (${gameHistory.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TransactionHistory;