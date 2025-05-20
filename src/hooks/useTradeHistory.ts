import { useState, useEffect, useContext } from 'react';
import { UserContext } from '../context/UserContext';
import { Trade } from '../types/trade';

function useTradeHistory(limit = 20) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useContext(UserContext);

  useEffect(() => {
    if (!currentUser) {
      setTrades([]);
      setLoading(false);
      return;
    }

    // In a real app, this would fetch from an API
    // For now, just simulate with mock data
    setLoading(true);
    
    // Mock API call
    setTimeout(() => {
      const mockTrades: Trade[] = Array(limit).fill(0).map((_, i) => ({
        id: `trade-${i}`,
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        amount: parseFloat((Math.random() * 5).toFixed(3)),
        executionPrice: parseFloat((Math.random() * 3 + 0.5).toFixed(4)),
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        status: 'executed',
        executedAt: new Date(Date.now() - i * 3600000).toISOString(),
        price: parseFloat((Math.random() * 3 + 0.5).toFixed(4))
      }));
      
      setTrades(mockTrades);
      setLoading(false);
    }, 500);
  }, [currentUser, limit]);

  return { trades, loading };
}

export default useTradeHistory;