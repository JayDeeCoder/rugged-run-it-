import { FC, useState, useEffect, useRef, useContext, useCallback } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import CandlestickChart from './CandlestickChart';
import TradingControls from './TradingControls';
import SellEffects from './SellEffects';
import GameCountdown from './GameCountdown';
import MiniCharts from './MiniCharts';
import useWindowSize from '../../hooks/useWindowSize';
import { TradeContext } from '../../context/TradeContext';
import { UserContext } from '../../context/UserContext';
import { useGameSocket } from '../../hooks/useGameSocket';
import { toast } from 'react-hot-toast';
import type { Order } from '../../types/trade';
import { GameResult } from '../../types/trade';
import { useEmbeddedGameWallet } from '../../hooks/useEmbeddedGameWallet';

interface ChartContainerProps {
  useMobileHeight?: boolean;
}

const ChartContainer: FC<ChartContainerProps> = ({ useMobileHeight = false }) => {
  const { width } = useWindowSize();
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [holdings, setHoldings] = useState<number>(0);
  const [triggerSellEffect, setTriggerSellEffect] = useState<boolean>(false);
  const [sellSuccess, setSellSuccess] = useState<boolean>(false);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  
  // Real server bet tracking (no more local state)
  const [userBet, setUserBet] = useState<number>(0);
  const [betEntryMultiplier, setBetEntryMultiplier] = useState<number>(1.0);
  const [lastGameNumber, setLastGameNumber] = useState<number>(0);
  const [userCashedOut, setUserCashedOut] = useState<boolean>(false); // NEW: Track if user cashed out
  
  // Create a reference to the chart container
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Use Privy hooks for authentication
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  
  // Use embedded game wallet hook
  const { wallet: gameWallet, walletData } = useEmbeddedGameWallet();

  const { trades, currentPrice, balance: gameBalance, placeOrder } = useContext(TradeContext);
  const { isAuthenticated, currentUser } = useContext(UserContext);

  // Get wallet address for game socket
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // Connect to real game server - ENHANCED with full data extraction
  const { 
    currentGame, 
    isConnected, 
    placeBet, 
    cashOut, 
    countdown,
    isWaitingPeriod,
    canBet 
  } = useGameSocket(walletAddress, currentUser?.id);

  const isMobile = width ? width < 768 : false;

  // Use ref to track if the component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load game results from localStorage on mount
  useEffect(() => {
    const savedResults = localStorage.getItem('gameResults');
    if (savedResults) {
      try {
        const parsedResults = JSON.parse(savedResults);
        if (Array.isArray(parsedResults)) {
          setGameResults(parsedResults);
        }
      } catch (error) {
        console.error('Failed to parse saved game results:', error);
      }
    }
  }, []);

  // Save game results to localStorage whenever they change
  useEffect(() => {
    if (gameResults.length > 0) {
      try {
        localStorage.setItem('gameResults', JSON.stringify(gameResults.slice(-50))); // Keep last 50 results
      } catch (error) {
        console.error('Failed to save game results:', error);
      }
    }
  }, [gameResults]);

  // Fetch wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (authenticated && gameWallet) {
        try {
          // Use wallet data from the hook
          if (walletData && walletData.balance) {
            if (isMountedRef.current) {
              setWalletBalance(parseFloat(walletData.balance));
            }
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
  }, [authenticated, gameWallet, walletData, gameBalance, isAuthenticated]);

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

  // ENHANCED: Handle real game state changes with server bet tracking
  useEffect(() => {
    if (!currentGame || !isMountedRef.current) return;

    // Reset user bet state on new game
    if (currentGame.gameNumber !== lastGameNumber) {
      setUserBet(0);
      setBetEntryMultiplier(1.0);
      setUserCashedOut(false); // Reset cashout flag for new game
      setLastGameNumber(currentGame.gameNumber);
    }

    // Handle game crash - only process real server events
    if (currentGame.status === 'crashed') {
      const crashMultiplier = currentGame.multiplier;
      
      // Add to real game results
      const newResult: GameResult = {
        value: crashMultiplier,
        label: `${crashMultiplier.toFixed(2)}x`,
        timestamp: Date.now(),
      };
      
      setGameResults(prev => [newResult, ...prev.slice(0, 49)]);
      
      // Handle user's bet result - server should tell us the result
      if (userBet > 0) {
        // If we had a bet and game crashed, we lost (unless we cashed out)
        setSellSuccess(false);
        setTriggerSellEffect(true);
        toast.error(`Crashed at ${crashMultiplier.toFixed(2)}x! Lost ${userBet.toFixed(3)} SOL`);
        
        // Reset user bet
        setUserBet(0);
        setBetEntryMultiplier(1.0);
        setUserCashedOut(false); // Reset cashout flag
      }
    }
  }, [currentGame, lastGameNumber, userBet]);

  // Handle effect completion
  const handleEffectComplete = () => {
    if (isMountedRef.current) {
      setTriggerSellEffect(false);
    }
  };

  // ENHANCED: Real server bet placement with result tracking
  const handleBuy = useCallback(async (amount: number) => {
    if (amount <= 0 || amount > walletBalance || !currentGame || !isMountedRef.current) {
      toast.error('Cannot place bet right now');
      return;
    }

    // Allow betting during waiting period OR active game
    if (currentGame.status !== 'active' && currentGame.status !== 'waiting') {
      toast.error('Game not available for betting');
      return;
    }

    if (!canBet) {
      toast.error('Betting not allowed right now');
      return;
    }

    setIsPlacingBet(true);
    
    try {
      console.log(`Placing real bet: ${amount} SOL in game #${currentGame.gameNumber} (${currentGame.status})`);

      // Place bet on real server - handle both return types
      const result = await placeBet(walletAddress, amount, currentUser?.id);
      
      // Handle different return types from useGameSocket with proper type guards
      let success: boolean;
      let entryMultiplier: number;
      let reason: string | undefined;

      if (typeof result === 'boolean') {
        success = result;
        entryMultiplier = currentGame.multiplier;
        reason = undefined;
      } else if (result && typeof result === 'object' && 'success' in result) {
        success = (result as any).success;
        entryMultiplier = (result as any).entryMultiplier || currentGame.multiplier;
        reason = (result as any).reason;
      } else {
        success = false;
        entryMultiplier = currentGame.multiplier;
        reason = 'Unknown response format';
      }
      
      if (success) {
        // Create order for local tracking
        const order: Order = {
          side: 'buy',
          amount,
          timestamp: new Date().toISOString(),
        };

        placeOrder(order);
        
        // Track bet with entry multiplier from server or current game multiplier
        setUserBet(amount);
        setBetEntryMultiplier(entryMultiplier);
        
        const betType = currentGame.status === 'waiting' ? 'Pre-game bet' : 'Live bet';
        toast.success(`${betType} placed: ${amount} SOL @ ${entryMultiplier.toFixed(2)}x`);
      } else {
        toast.error(reason || 'Failed to place bet on server');
      }
    } catch (error) {
      console.error('Failed to place bet:', error);
      toast.error('Failed to place bet');
    } finally {
      if (isMountedRef.current) {
        setIsPlacingBet(false);
      }
    }
  }, [walletBalance, currentGame, placeBet, walletAddress, currentUser?.id, placeOrder, canBet]);

  // ENHANCED: Real server cashout with server result tracking
  const handleSell = useCallback(async (percentage: number) => {
    if (userBet <= 0 || !currentGame || currentGame.status !== 'active' || !isMountedRef.current) {
      toast.error('No active bet to cash out');
      return;
    }

    // Only allow 100% cashout with current server API
    if (percentage < 100) {
      toast.error('Partial cashouts not supported yet');
      return;
    }

    setIsCashingOut(true);
    
    try {
      const currentMultiplier = currentGame.multiplier;
      console.log(`Cashing out 100% at multiplier ${currentMultiplier}x`);

      // Cash out on real server - handle both return types
      const result = await cashOut(walletAddress);
      
      // Handle different return types from useGameSocket with proper type guards
      let success: boolean;
      let payout: number | undefined;
      let reason: string | undefined;

      if (typeof result === 'boolean') {
        success = result;
        payout = undefined;
        reason = undefined;
      } else if (result && typeof result === 'object' && 'success' in result) {
        success = (result as any).success;
        payout = (result as any).payout;
        reason = (result as any).reason;
      } else {
        success = false;
        payout = undefined;
        reason = 'Unknown response format';
      }
      
      if (success) {
        // Calculate payout if not provided by server
        const finalPayout = payout || (userBet * currentMultiplier * 0.6); // 40% house edge
        
        // Mark that user cashed out
        setUserCashedOut(true);
        
        // Create sell order for local tracking
        const order: Order = {
          side: 'sell',
          amount: finalPayout,
          timestamp: new Date().toISOString(),
        };

        placeOrder(order);
        
        // Add to game results for successful cashouts
        const newResult: GameResult = {
          value: currentMultiplier,
          label: `${currentMultiplier.toFixed(2)}x`,
          timestamp: Date.now(),
        };
        
        setGameResults(prev => [newResult, ...prev.slice(0, 49)]);
        
        // Show win effect
        setSellSuccess(true);
        setTriggerSellEffect(true);
        
        // Reset user bet since we cashed out
        setUserBet(0);
        setBetEntryMultiplier(1.0);
        setUserCashedOut(false); // Reset cashout flag for next bet
        
        const profit = finalPayout - userBet;
        toast.success(`Cashed out: +${profit.toFixed(3)} SOL (${finalPayout.toFixed(3)} total)`);
      } else {
        toast.error(reason || 'Failed to cash out on server');
      }
    } catch (error) {
      console.error('Failed to cash out:', error);
      toast.error('Failed to cash out');
    } finally {
      if (isMountedRef.current) {
        setIsCashingOut(false);
      }
    }
  }, [userBet, currentGame, cashOut, walletAddress, placeOrder]);

  // Calculate game statistics from real results
  const calculateGameStats = useCallback(() => {
    if (gameResults.length === 0) {
      return { average: "0.00", highest: "0.00" };
    }
    
    const avg = gameResults.reduce((sum, item) => sum + item.value, 0) / gameResults.length;
    const max = Math.max(...gameResults.map(item => item.value));
    
    return { 
      average: avg.toFixed(2), 
      highest: max.toFixed(2)
    };
  }, [gameResults]);
  
  const gameStats = calculateGameStats();

  // Calculate chart height based on viewport size - COMPACT SIZE
  const getChartHeight = () => {
    if (useMobileHeight && isMobile) {
      return 240; // Back to 240px - perfect UI size
    }
    return isMobile ? 260 : 500; // Mobile max 260px
  };

  // Real game data from server
  const currentMultiplier = currentGame?.multiplier || 1.0;
  const gameStatus = currentGame?.status || 'waiting';
  const gameId = currentGame?.gameNumber || 0;
  const isGameActive = gameStatus === 'active' || gameStatus === 'waiting';
  const hasActiveGame = userBet > 0;
  const showCountdown = isWaitingPeriod && countdown && countdown > 0;
  const countdownSeconds = countdown ? Math.ceil(countdown / 1000) : 0;

  return (
    <div className="p-2 flex flex-col">
      {/* Game Identification and Status - more compact for mobile */}
      <div className={`bg-[#0d0d0f] p-2 mb-2 rounded-lg flex items-center justify-between border border-gray-800 ${isMobile ? 'text-xs' : 'text-sm md:text-base'}`}>
        <div className="flex items-center">
          <span className="text-gray-400 mr-1">Round #</span>
          <span className="font-bold text-white">{gameId}</span>
          {!isConnected && <span className="ml-2 text-red-400 text-xs">(OFFLINE)</span>}
        </div>
        
        <div className="flex items-center">
          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
            !isConnected ? 'bg-red-600 text-white' :
            gameStatus === 'active' ? 'bg-green-600 text-white' : 
            gameStatus === 'crashed' ? 'bg-red-600 text-white' :
            gameStatus === 'waiting' ? 'bg-yellow-600 text-white' :
            'bg-gray-600 text-white'
          }`}>
            {!isConnected ? 'OFFLINE' :
             gameStatus === 'active' ? 'ACTIVE' : 
             gameStatus === 'crashed' ? 'CRASHED' : 
             gameStatus === 'waiting' ? 'WAITING' : 'UNKNOWN'}
          </span>
        </div>
        
        <div className="flex items-center">
          <span className="text-gray-400 hidden xs:inline mr-1">Current</span>
          <span className={`font-bold text-yellow-400 ${isMobile ? 'text-sm' : 'text-base'}`}>
            {currentMultiplier.toFixed(2)}x
          </span>
        </div>
      </div>

      {/* Balance and Holdings Display - more compact */}
      <div className={`bg-[#0d0d0f] p-2 mb-2 rounded-lg flex flex-wrap justify-between border border-gray-800 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Balance:</span>
          <span className="text-green-400 ml-1 font-bold">{walletBalance.toFixed(3)}</span>
        </div>
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Bet:</span>
          <span className={`ml-1 font-bold ${userBet > 0 ? 'text-blue-400' : 'text-gray-400'}`}>
            {userBet > 0 ? userBet.toFixed(3) : '0.000'}
          </span>
        </div>
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Entry:</span>
          <span className={`ml-1 font-bold ${userBet > 0 ? 'text-purple-400' : 'text-gray-400'}`}>
            {userBet > 0 ? betEntryMultiplier.toFixed(2) + 'x' : '-'}
          </span>
        </div>
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Potential:</span>
          <span className={`ml-1 font-bold ${userBet > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
            {userBet > 0 ? (userBet * Math.max(currentMultiplier, betEntryMultiplier) * 0.6).toFixed(3) : '0.000'}
          </span>
        </div>
      </div>

      {/* Real game info - compact */}
      {currentGame && (
        <div className={`bg-[#0d0d0f] p-2 mb-2 rounded-lg border border-gray-800 ${isMobile ? 'text-xs' : 'text-xs'} text-gray-400`}>
          <div className="flex justify-between">
            <span>Players: {currentGame.totalPlayers || 0}</span>
            <span>Total Bets: {(currentGame.totalBets || 0).toFixed(3)} SOL</span>
            {showCountdown && <span className="text-blue-400">Next: {countdownSeconds}s</span>}
          </div>
        </div>
      )}

      {/* Mini charts showing recent game results - REAL DATA */}
      <div className="mb-2">
        <MiniCharts 
          data={gameResults} 
          maxCharts={isMobile ? 4 : 8} // Reduced for mobile
          onNewGame={(result) => {
            console.log('New game result:', result);
          }}
        />
      </div>

      {/* Mobile optimized layout - smaller containers */}
      <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-4'} gap-4`}>
        {/* Chart container - SMALLER mobile height with better margins */}
        <div 
          key={`game-${gameId}`} 
          ref={chartContainerRef}
          className={`${isMobile ? '' : 'md:col-span-3'} relative flex flex-col`}
          style={{ height: `${getChartHeight()}px` }}
        >
          <CandlestickChart 
            onMultiplierUpdate={() => {}} // Multiplier comes from real server now
            onGameCrash={() => {}} // Handled by real server events
            currentBet={userBet}
            betPlacedAt={betEntryMultiplier}
            height={getChartHeight()}
            useMobileHeight={isMobile}
            // REAL SERVER DATA
            serverMultiplier={currentMultiplier}
            serverGameStatus={gameStatus}
            isServerConnected={isConnected}
            didCashOut={userCashedOut} // NEW: Pass cashout flag
          />

          {triggerSellEffect && (
            <SellEffects 
              isWin={sellSuccess} 
              show={triggerSellEffect} 
              onAnimationComplete={handleEffectComplete}
              multiplier={currentMultiplier}
            />
          )}
          
          {/* Simple countdown overlay */}
          {showCountdown && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-gradient-to-b from-black/60 to-black/70 backdrop-blur-sm">
              <GameCountdown 
                seconds={countdownSeconds} 
                onComplete={() => {}} // Server handles game start
                lastCrashMultiplier={gameResults[0]?.value || null}
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

      {/* Game Statistics - from real results, more compact */}
      <div className={`mt-4 bg-[#0d0d0f] p-3 rounded-lg border border-gray-800 ${isMobile ? 'p-2' : 'p-3'}`}>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>Average</div>
            <div className={`font-bold text-green-400 ${isMobile ? 'text-sm' : 'text-base md:text-lg'}`}>{gameStats.average}x</div>
          </div>
          <div className="text-center">
            <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>Best</div>
            <div className={`font-bold text-yellow-400 ${isMobile ? 'text-sm' : 'text-base md:text-lg'}`}>{gameStats.highest}x</div>
          </div>
          <div className="text-center">
            <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>Rounds</div>
            <div className={`font-bold text-blue-400 ${isMobile ? 'text-sm' : 'text-base md:text-lg'}`}>{gameResults.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartContainer;
