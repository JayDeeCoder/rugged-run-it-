import { FC, useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import CandlestickChart from './CandlestickChart';
import TradingControls from './TradingControls';
import SellEffects from './SellEffects';
import GameCountdown from './GameCountdown';
import MiniCharts from './MiniCharts';
import useWindowSize from '../../hooks/useWindowSize';
import { TradeContext } from '../../context/TradeContext';
import { UserContext } from '../../context/UserContext';
import { toast } from 'react-hot-toast';
import type { Order } from '../../types/trade';
import { GameResult } from '../../types/trade';

interface ChartContainerProps {
  useMobileHeight?: boolean;
}

const ChartContainer: FC<ChartContainerProps> = ({ useMobileHeight = false }) => {
  const { width } = useWindowSize();
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [holdings, setHoldings] = useState<number>(0);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [triggerSellEffect, setTriggerSellEffect] = useState<boolean>(false);
  const [sellSuccess, setSellSuccess] = useState<boolean>(false);
  const [showCountdown, setShowCountdown] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(10);
  const [lastCrashMultiplier, setLastCrashMultiplier] = useState<number | null>(null);
  const [isGameActive, setIsGameActive] = useState<boolean>(true);
  const [hasActiveGame, setHasActiveGame] = useState<boolean>(false);
  const [currentBet, setCurrentBet] = useState<number>(0);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  const [gameId, setGameId] = useState<number>(0); // Track current game number
  const [gameStatus, setGameStatus] = useState<'waiting' | 'active' | 'cooldown' | 'crashed'>('waiting');

  // Game history stats
  const [highestMultiplier, setHighestMultiplier] = useState<number>(0);
  const [averageMultiplier, setAverageMultiplier] = useState<number>(0);
  const [roundsPlayed, setRoundsPlayed] = useState<number>(0);
  
  // Create a reference to the chart container
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();

  const { trades, currentPrice, balance: gameBalance, placeOrder } = useContext(TradeContext);
  const { isAuthenticated, currentUser } = useContext(UserContext);

  const isMobile = width ? width < 768 : false;

  // Use ref to track if the component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (connected && publicKey && connection) {
        try {
          const balance = await connection.getBalance(publicKey);
          if (isMountedRef.current) {
            setWalletBalance(balance / LAMPORTS_PER_SOL);
          }
        } catch (error) {
          console.error('Failed to fetch wallet balance:', error);
        }
      } else {
        if (isAuthenticated && gameBalance && isMountedRef.current) {
          setWalletBalance(gameBalance);
        } else if (isMountedRef.current) {
          setWalletBalance(0);
        }
      }
    };

    fetchBalance();
    const intervalId = setInterval(fetchBalance, 5000);
    return () => clearInterval(intervalId);
  }, [connected, publicKey, connection, gameBalance, isAuthenticated]);

  // Calculate holdings from trades
  useEffect(() => {
    const pnl = trades.reduce((total, trade) => {
      if (trade.side === 'buy') {
        return total - trade.amount;
      } else {
        return total + (trade.amount * trade.executionPrice);
      }
    }, 0);
    if (isMountedRef.current) {
      setHoldings(pnl);
    }
  }, [trades]);

  // Calculate game statistics whenever game results change
  useEffect(() => {
    if (gameResults.length > 0) {
      const total = gameResults.reduce((sum, result) => sum + result.value, 0);
      const avg = total / gameResults.length;
      const max = Math.max(...gameResults.map(result => result.value));
      
      if (isMountedRef.current) {
        setAverageMultiplier(avg);
        setHighestMultiplier(max);
      }
    }
  }, [gameResults]);

  // Handle multiplier updates from chart
  const handleMultiplierUpdate = (multiplier: number) => {
    if (isMountedRef.current) {
      setCurrentMultiplier(multiplier);
    }
  };

  // Handle effect completion
  const handleEffectComplete = () => {
    if (isMountedRef.current) {
      setTriggerSellEffect(false);
    }
  };

  // Handle game crash - when the chart crashes
  const handleGameCrash = useCallback((peakMultiplier: number) => {
    if (!isMountedRef.current) return;
    
    console.log(`Game crashed at peak of ${peakMultiplier.toFixed(2)}x`);
    
    if (hasActiveGame) {
      // Add to game results
      const newResult: GameResult = {
        value: peakMultiplier, // Use peak multiplier instead of final crash value
        label: `${peakMultiplier.toFixed(2)}x`,
        timestamp: Date.now(),
      };
      
      setGameResults(prev => [newResult, ...prev.slice(0, 9)]);
      
      // Show loss effect if player had an active bet
      if (currentBet > 0) {
        setSellSuccess(false);
        setTriggerSellEffect(true);
        toast.error(`Crashed at ${peakMultiplier.toFixed(2)}x! Lost ${currentBet.toFixed(3)} SOL`);
      }
      
      // Reset game state
      setHasActiveGame(false);
      setCurrentBet(0);
    }
    
    // Update game status and start cooldown
    setGameStatus('crashed');
    setIsGameActive(false);
    setLastCrashMultiplier(peakMultiplier); // Store peak value
    setShowCountdown(true);
    setCountdownSeconds(10); // 10 second cooldown before next game
    setRoundsPlayed(prev => prev + 1);
  }, [hasActiveGame, currentBet]);

  // Handle countdown completion - start new game
  const handleCountdownComplete = useCallback(() => {
    if (!isMountedRef.current) return;
    
    console.log("Countdown complete - starting new game round at 1.0x multiplier");
    
    // Reset the game state for a new round
    setShowCountdown(false);
    setIsGameActive(true);
    setGameStatus('active');
    setGameId(prev => prev + 1); // Increment game ID
    setCurrentMultiplier(1.0); // Ensure we start exactly at 1.0x
    
    toast.success("New round started!");
  }, []);

  // Handle placing a bet
  const handleBuy = useCallback(async (amount: number) => {
    if (amount <= 0 || amount > walletBalance || !isGameActive || !isMountedRef.current) {
      return;
    }

    setIsPlacingBet(true);
    
    try {
      console.log(`Buying ${amount} SOL at ${currentMultiplier}x in game #${gameId}`);

      // Create order
      const order: Order = {
        side: 'buy',
        amount,
        timestamp: new Date().toISOString(),
      };

      // Place order through context
      placeOrder(order);
      
      // Set active game and current bet
      setHasActiveGame(true);
      setCurrentBet(amount);
      
      toast.success(`Bet placed: ${amount} SOL`);
    } catch (error) {
      console.error('Failed to place bet:', error);
      toast.error('Failed to place bet');
    } finally {
      if (isMountedRef.current) {
        setIsPlacingBet(false);
      }
    }
  }, [walletBalance, isGameActive, currentMultiplier, placeOrder, gameId]);

  // Handle selling (cashing out)
  const handleSell = useCallback(async (percentage: number) => {
    if (!hasActiveGame || !isGameActive || currentBet <= 0 || !isMountedRef.current) {
      return;
    }

    setIsCashingOut(true);
    
    try {
      // Calculate amount to sell based on percentage
      const amountToSell = (currentBet * percentage) / 100;
      console.log(`Selling ${amountToSell} SOL (${percentage}%) at multiplier ${currentMultiplier}x`);

      // Create sell order
      const order: Order = {
        side: 'sell',
        amount: amountToSell * currentMultiplier, // Sell at current multiplier value
        timestamp: new Date().toISOString(),
      };

      // Place order through context
      placeOrder(order);
      
      // Add to game results
      const newResult: GameResult = {
        value: currentMultiplier,
        label: `${currentMultiplier.toFixed(2)}x`,
        timestamp: Date.now(),
      };
      
      setGameResults(prev => [newResult, ...prev.slice(0, 9)]);
      
      // Reset game state
      if (percentage >= 100) {
        setHasActiveGame(false);
        setCurrentBet(0);
      } else {
        // Partial sell
        setCurrentBet(currentBet * (1 - percentage / 100));
      }
      
      // Show win effect - ONLY when user explicitly cashes out
      setSellSuccess(true);
      setTriggerSellEffect(true);
      
      // Create toast notification
      const profit = amountToSell * (currentMultiplier - 1);
      toast.success(`Cashed out: +${profit.toFixed(3)} SOL`);
    } catch (error) {
      console.error('Failed to cash out:', error);
      toast.error('Failed to cash out');
    } finally {
      if (isMountedRef.current) {
        setIsCashingOut(false);
      }
    }
  }, [hasActiveGame, isGameActive, currentBet, currentMultiplier, placeOrder]);

  // Calculate game statistics
  const calculateGameStats = useCallback(() => {
    if (gameResults.length === 0) {
      return { average: "0.00", highest: "0.00" };
    }
    
    // Calculate average
    const avg = gameResults.reduce((sum, item) => sum + item.value, 0) / gameResults.length;
    
    // Find highest value
    const max = Math.max(...gameResults.map(item => item.value));
    
    return { 
      average: avg.toFixed(2), 
      highest: max.toFixed(2)
    };
  }, [gameResults]);
  
  const gameStats = calculateGameStats();

  // Calculate chart height based on viewport size
  const getChartHeight = () => {
    if (useMobileHeight && isMobile) {
      return 300;
    }
    return isMobile ? 350 : 500;
  };

  return (
    <div className="p-2 flex flex-col">
      {/* Game Identification and Status - condensed for mobile */}
      <div className="bg-[#0d0d0f] p-2 md:p-3 mb-2 md:mb-3 rounded-lg flex items-center justify-between border border-gray-800 text-sm md:text-base">
        <div className="flex items-center">
          <span className="text-gray-400 text-xs md:text-sm mr-1">Round #</span>
          <span className="font-bold text-white">{gameId}</span>
        </div>
        
        <div className="flex items-center">
          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
            gameStatus === 'active' ? 'bg-green-600 text-white' : 
            gameStatus === 'crashed' ? 'bg-red-600 text-white' :
            gameStatus === 'cooldown' ? 'bg-yellow-600 text-white' :
            'bg-gray-600 text-white'
          }`}>
            {gameStatus === 'active' ? 'ACTIVE' : 
             gameStatus === 'crashed' ? 'CRASHED' : 
             'COOLDOWN'}
          </span>
        </div>
        
        <div className="flex items-center">
          <span className="text-gray-400 text-xs md:text-sm hidden xs:inline mr-1">Current</span>
          <span className="text-base font-bold text-yellow-400">{currentMultiplier.toFixed(2)}x</span>
        </div>
      </div>

      {/* Balance and Holdings Display - simplified for mobile */}
      <div className="bg-[#0d0d0f] p-2 md:p-3 mb-2 md:mb-3 rounded-lg flex flex-wrap justify-between border border-gray-800 text-xs md:text-sm">
        <div className="px-2 py-1">
          <span className="text-gray-400">Balance:</span>
          <span className="text-green-400 ml-1 font-bold">{walletBalance.toFixed(3)}</span>
        </div>
        <div className="px-2 py-1">
          <span className="text-gray-400">Bet:</span>
          <span className={`ml-1 font-bold ${currentBet > 0 ? 'text-blue-400' : 'text-gray-400'}`}>
            {currentBet > 0 ? currentBet.toFixed(3) : '0.000'}
          </span>
        </div>
        <div className="px-2 py-1">
          <span className="text-gray-400">Potential:</span>
          <span className={`ml-1 font-bold ${currentBet > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
            {currentBet > 0 ? (currentBet * (currentMultiplier - 1)).toFixed(3) : '0.000'}
          </span>
        </div>
      </div>

      {/* Mini charts showing recent game results */}
      <div className="mb-2">
        <MiniCharts data={gameResults} maxCharts={isMobile ? 5 : 10} />
      </div>

      {/* Mobile optimized layout - stacked on small screens, side by side on larger */}
      <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-4'} gap-4`}>
        {/* Chart container - with a fixed height relative to screen size */}
        <div 
          key={`game-${gameId}`} 
          ref={chartContainerRef}
          className={`${isMobile ? '' : 'md:col-span-3'} relative flex flex-col`}
          style={{ height: `${getChartHeight()}px` }}
        >
          <CandlestickChart 
            initialPrice={1.0}
            onMultiplierUpdate={handleMultiplierUpdate}
            triggerSellEffect={triggerSellEffect}
            onEffectComplete={handleEffectComplete}
            onGameCrash={handleGameCrash}
            currentBet={currentBet}
            height={getChartHeight()}
          />

          {triggerSellEffect && (
            <SellEffects 
              isWin={sellSuccess} 
              show={triggerSellEffect} 
              onAnimationComplete={handleEffectComplete}
              multiplier={currentMultiplier}
            />
          )}
          
          {/* Countdown overlay with improved transparency */}
          {showCountdown && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-gradient-to-b from-black/60 to-black/70 backdrop-blur-sm">
              <GameCountdown 
                seconds={countdownSeconds} 
                onComplete={handleCountdownComplete}
                lastCrashMultiplier={lastCrashMultiplier}
              />
            </div>
          )}
        </div>

        {/* Trading controls - always visible */}
        <div className={`${isMobile ? '' : 'md:col-span-1'}`}>
          <TradingControls 
            onBuy={handleBuy} 
            onSell={handleSell} 
            walletBalance={walletBalance}
            holdings={holdings}
            currentMultiplier={currentMultiplier}
            isPlacingBet={isPlacingBet}
            isCashingOut={isCashingOut}
            hasActiveGame={hasActiveGame}
            isGameActive={isGameActive}
            isMobile={isMobile}
          />
        </div>
      </div>

      {/* Game Statistics - simplified for mobile */}
      <div className="mt-4 bg-[#0d0d0f] p-3 rounded-lg border border-gray-800">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs md:text-sm text-gray-400">Average</div>
            <div className="text-base md:text-lg font-bold text-green-400">{gameStats.average}x</div>
          </div>
          <div className="text-center">
            <div className="text-xs md:text-sm text-gray-400">Best</div>
            <div className="text-base md:text-lg font-bold text-yellow-400">{gameStats.highest}x</div>
          </div>
          <div className="text-center">
            <div className="text-xs md:text-sm text-gray-400">Rounds</div>
            <div className="text-base md:text-lg font-bold text-blue-400">{roundsPlayed}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartContainer;