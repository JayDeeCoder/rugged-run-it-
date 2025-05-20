import { FC } from 'react';
import useTradeHistory from '../../hooks/useTradeHistory';

const TradeHistory: FC = () => {
  const { trades, loading } = useTradeHistory(10); // Get 10 most recent trades
  
  return (
    <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
      {loading ? (
        <div className="text-gray-400">Loading trade history...</div>
      ) : trades.length === 0 ? (
        <div className="text-gray-400">No recent trades found</div>
      ) : (
        <div className="space-y-2">
          {trades.map(trade => (
            <div key={trade.id} className="flex justify-between border-b border-gray-800 pb-2">
              <div>
                <span className={`font-medium ${trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                  {trade.side.toUpperCase()}
                </span>
                <span className="text-gray-400 ml-2">{trade.amount.toFixed(3)} SOL</span>
              </div>
              <div className="text-white">{trade.executionPrice.toFixed(2)}x</div>
              <div className="text-gray-400 text-sm">
                {new Date(trade.executedAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Stats Summary */}
      <div className="mt-4 pt-3 border-t border-gray-800">
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-sm text-gray-400">Total Volume</div>
            <div className="text-lg text-white">
              {loading ? '...' : trades.reduce((sum, trade) => sum + trade.amount, 0).toFixed(3)} SOL
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-400">Avg. Multiplier</div>
            <div className="text-lg text-white">
              {loading || trades.length === 0 ? '...' : 
                (trades.reduce((sum, trade) => sum + trade.executionPrice, 0) / trades.length).toFixed(2)}x
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-400">Best Trade</div>
            <div className="text-lg text-white">
              {loading || trades.length === 0 ? '...' : 
                Math.max(...trades.map(trade => trade.executionPrice)).toFixed(2)}x
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeHistory;