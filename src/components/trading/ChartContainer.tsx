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

// Import shared hooks for consistency with TradingControls
import { 
  useSharedCustodialBalance, 
  useSharedBetState, 
  useSharedGameState,
  ActiveBet 
} from '../../hooks/useSharedState';

interface ChartContainerProps {
  useMobileHeight?: boolean;
}

const ChartContainer: FC<ChartContainerProps> = ({ useMobileHeight = false }) => {
  const { width } = useWindowSize();
  const [holdings, setHoldings] = useState<number>(0);
  const [triggerSellEffect, setTriggerSellEffect] = useState<boolean>(false);
  const [sellSuccess, setSellSuccess] = useState<boolean>(false);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // Use Privy hooks for authentication
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  
  const { trades, currentPrice, placeOrder } = useContext(TradeContext);
  const { isAuthenticated, currentUser } = useContext(UserContext);

  // Get wallet address for game socket
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // 🚀 ENHANCED: Use shared hooks for perfect consistency with TradingControls
  const { 
    custodialBalance, 
    loading: custodialBalanceLoading, 
    forceRefresh: refreshCustodialBalance,
    error: balanceError
  } = useSharedCustodialBalance(currentUser?.id || '');
  
  const { 
    activeBet, 
    isPlacingBet, 
    isCashingOut, 
    lastGameNumber,
    setActiveBet,
    setIsPlacingBet,
    setIsCashingOut,
    setLastGameNumber,
    clearActiveBet,
    resetBetState
  } = useSharedBetState();
  
  // Connect to real game server
  const { 
    currentGame, 
    isConnected, 
    countdown,
    isWaitingPeriod,
    canBet,
    placeCustodialBet,
    custodialCashOut
  } = useGameSocket(walletAddress, currentUser?.id);

  // 🚀 ENHANCED: Use shared game state for perfectly synchronized calculations
  const gameDisplayInfo = useSharedGameState(currentGame, currentUser?.id || '');

  const isMobile = width ? width < 768 : false;

  // 🚀 ENHANCED: Calculate potential payout with proper validation - UPDATED LOGIC
  const calculatePotentialPayout = useCallback(() => {
    if (!activeBet || !currentGame) return 0;
    
    const currentMultiplier = currentGame.multiplier || 1.0;
    const entryMultiplier = activeBet.entryMultiplier || 1.0;
    const betAmount = activeBet.amount || 0;
    
    // Calculate potential payout based on current multiplier vs entry point
    // If current multiplier is higher than entry, calculate gain
    // If current multiplier is lower than entry, this represents potential loss/no gain
    const multiplierDifference = currentMultiplier - entryMultiplier;
    const effectiveMultiplier = entryMultiplier + Math.max(0, multiplierDifference);
    
    // Apply 95% payout rate (5% house edge)
    const potentialPayout = betAmount * effectiveMultiplier * 0.95;
    
    return potentialPayout;
  }, [activeBet, currentGame]);

  // 🚀 ENHANCED: Calculate potential profit with color coding - UPDATED LOGIC
  const calculatePotentialProfit = useCallback(() => {
    if (!activeBet) return { profit: 0, isProfit: false };
    
    const potentialPayout = calculatePotentialPayout();
    const profit = potentialPayout - activeBet.amount;
    
    return {
      profit,
      isProfit: profit > 0
    };
  }, [activeBet, calculatePotentialPayout]);

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
        localStorage.setItem('gameResults', JSON.stringify(gameResults.slice(-50)));
      } catch (error) {
        console.error('Failed to save game results:', error);
      }
    }
  }, [gameResults]);

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

  // 🚀 ENHANCED: Handle game state changes with shared bet state
  useEffect(() => {
    if (!currentGame || !isMountedRef.current) return;

    // Reset user bet state on new game
    if (currentGame.gameNumber !== lastGameNumber) {
      console.log(`🎮 New game #${currentGame.gameNumber} - Resetting shared bet state`);
      resetBetState();
      setLastGameNumber(currentGame.gameNumber);
    }

    // Handle game crash
    if (currentGame.status === 'crashed') {
      const crashMultiplier = currentGame.multiplier;
      
      const newResult: GameResult = {
        value: crashMultiplier,
        label: `${crashMultiplier.toFixed(2)}x`,
        timestamp: Date.now(),
      };
      
      setGameResults(prev => [newResult, ...prev.slice(0, 49)]);
      
      if (activeBet) {
        setSellSuccess(false);
        setTriggerSellEffect(true);
        toast.error(`Crashed at ${crashMultiplier.toFixed(2)}x! Lost ${activeBet.amount.toFixed(3)} SOL`);
        
        // Clear the shared bet state
        clearActiveBet();
      }
    }
  }, [currentGame, lastGameNumber, activeBet, resetBetState, setLastGameNumber, clearActiveBet]);

  const handleEffectComplete = () => {
    if (isMountedRef.current) {
      setTriggerSellEffect(false);
    }
  };

  // 🚀 UPDATED: Use shared bet state and custodial betting with enhanced validation
  const handleBuy = useCallback(async (amount: number) => {
    if (amount <= 0 || amount > custodialBalance || !currentGame || !isMountedRef.current) {
      toast.error('Cannot buy right now');
      return;
    }

    if (currentGame.status !== 'active' && currentGame.status !== 'waiting') {
      toast.error('Game not available');
      return;
    }

    if (!canBet) {
      toast.error('Betting not allowed right now');
      return;
    }

    if (!currentUser?.id) {
      toast.error('User not authenticated');
      return;
    }

    // Check if there's already an active bet
    if (activeBet) {
      toast.error('You already have an active bet');
      return;
    }

    setIsPlacingBet(true);
    
    try {
      console.log(`🎯 Placing custodial bet: ${amount} SOL in game #${currentGame.gameNumber} (${currentGame.status})`);

      const success = await placeCustodialBet(currentUser.id, amount);
      
      if (success) {
        const order: Order = {
          side: 'buy',
          amount,
          timestamp: new Date().toISOString(),
        };

        placeOrder(order);
        
        const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.multiplier;
        
        // Create new bet using shared state (same structure as TradingControls)
        const newBet: ActiveBet = {
          id: `custodial_bet_${Date.now()}`,
          amount,
          entryMultiplier,
          timestamp: Date.now(),
          gameId: currentGame.gameNumber.toString(),
          tokenType: 'SOL',
          userId: currentUser.id
        };
        
        setActiveBet(newBet);
        
        const betType = currentGame.status === 'waiting' ? 'Pre-game bet' : 'Live bet';
        toast.success(`${betType} placed: ${amount} SOL @ ${entryMultiplier.toFixed(2)}x`);
      } else {
        toast.error('Failed to place bet');
      }
    } catch (error) {
      console.error('Failed to place bet:', error);
      toast.error('Failed to place bet');
    } finally {
      if (isMountedRef.current) {
        setIsPlacingBet(false);
      }
    }
  }, [custodialBalance, currentGame, placeCustodialBet, currentUser?.id, placeOrder, canBet, activeBet, setIsPlacingBet, setActiveBet]);

  // 🚀 UPDATED: Use shared bet state and custodial cashout with enhanced payout calculation
  const handleSell = useCallback(async (percentage: number) => {
    if (!activeBet || !currentGame || currentGame.status !== 'active' || !isMountedRef.current) {
      toast.error('No active bet to RUG');
      return;
    }

    if (percentage < 100) {
      toast.error('Partial cashouts not supported yet');
      return;
    }

    if (!currentUser?.id) {
      toast.error('User not authenticated');
      return;
    }

    setIsCashingOut(true);
    
    try {
      const currentMultiplier = currentGame.multiplier;
      const potentialPayout = calculatePotentialPayout();
      const potentialProfit = potentialPayout - activeBet.amount;
      
      console.log(`💸 Cashing out 100% at multiplier ${currentMultiplier}x - Potential: ${potentialPayout.toFixed(3)} SOL`);

      const result = await custodialCashOut(currentUser.id, walletAddress);
      
      let success: boolean;
      let actualPayout: number | undefined;
      let reason: string | undefined;

      if (typeof result === 'boolean') {
        success = result;
        actualPayout = success ? potentialPayout : undefined;
        reason = undefined;
      } else if (result && typeof result === 'object' && 'success' in result) {
        success = (result as any).success;
        actualPayout = (result as any).payout || potentialPayout;
        reason = (result as any).reason;
      } else {
        success = false;
        actualPayout = undefined;
        reason = 'Unknown response format';
      }
      
      if (success) {
        const finalPayout = actualPayout || potentialPayout;
        
        const order: Order = {
          side: 'sell',
          amount: finalPayout,
          timestamp: new Date().toISOString(),
        };

        placeOrder(order);
        
        const newResult: GameResult = {
          value: currentMultiplier,
          label: `${currentMultiplier.toFixed(2)}x`,
          timestamp: Date.now(),
        };
        
        setGameResults(prev => [newResult, ...prev.slice(0, 49)]);
        
        setSellSuccess(true);
        setTriggerSellEffect(true);
        
        // Clear the shared bet state
        clearActiveBet();
        
        const actualProfit = finalPayout - activeBet.amount;
        toast.success(`🎉 Cashed out at ${currentMultiplier.toFixed(2)}x! Profit: +${actualProfit.toFixed(3)} SOL (${finalPayout.toFixed(3)} total)`);
      } else {
        toast.error(reason || 'Failed to RUG');
        // Clear bet state even on failure to prevent stuck states
        clearActiveBet();
      }
    } catch (error) {
      console.error('Failed to RUG:', error);
      toast.error('Failed to RUG');
      // Clear bet state on error
      clearActiveBet();
    } finally {
      if (isMountedRef.current) {
        setIsCashingOut(false);
      }
    }
  }, [activeBet, currentGame, custodialCashOut, currentUser?.id, walletAddress, placeOrder, setIsCashingOut, clearActiveBet, calculatePotentialPayout]);

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

  const getChartHeight = () => {
    if (useMobileHeight && isMobile) {
      return 240;
    }
    return isMobile ? 260 : 500;
  };

  // 🚀 ENHANCED: Real game data from server and shared state with proper calculations
  const currentMultiplier = currentGame?.multiplier || 1.0;
  const gameStatus = currentGame?.status || 'waiting';
  const gameId = currentGame?.gameNumber || 0;
  const isGameActive = gameStatus === 'active' || gameStatus === 'waiting';
  const hasActiveGame = !!activeBet;
  const showCountdown = isWaitingPeriod && countdown && countdown > 0;
  const countdownSeconds = countdown ? Math.ceil(countdown / 1000) : 0;
  
  // Calculate current values using shared data
  const potentialPayout = calculatePotentialPayout();
  const { profit: potentialProfit, isProfit } = calculatePotentialProfit();

  return (
    <div className="p-2 flex flex-col">
      {/* Game Identification and Status */}
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
             gameStatus === 'crashed' ? 'RUGGED' : 
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

      {/* 🚀 ENHANCED: Bet Display - Keep Bet, Entry, Payout, and Profit */}
      <div className={`bg-[#0d0d0f] p-2 mb-2 rounded-lg flex flex-wrap justify-between border border-gray-800 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Bet:</span>
          <span className={`ml-1 font-bold ${hasActiveGame ? 'text-blue-400' : 'text-gray-500'}`}>
            {activeBet ? activeBet.amount.toFixed(3) : '0.000'} SOL
          </span>
        </div>
        
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Entry:</span>
          <span className={`ml-1 font-bold ${hasActiveGame ? 'text-purple-400' : 'text-gray-500'}`}>
            {activeBet ? activeBet.entryMultiplier.toFixed(2) + 'x' : '-'}
          </span>
        </div>
        
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Payout:</span>
          <span className={`ml-1 font-bold ${hasActiveGame ? 'text-green-400' : 'text-gray-500'}`}>
            {potentialPayout.toFixed(3)} SOL
          </span>
        </div>
        
        {/* 🚀 Show potential profit with color coding */}
        {activeBet && (
          <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
            <span className="text-gray-400">Profit:</span>
            <span className={`ml-1 font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}{potentialProfit.toFixed(3)} SOL
            </span>
          </div>
        )}
      </div>

      {currentGame && (
  <div className={`bg-[#0d0d0f] p-2 mb-2 rounded-lg border border-gray-800 ${isMobile ? 'text-xs' : 'text-xs'} text-gray-400`}>
    <div className="flex justify-between items-center flex-wrap">
      <span>RUGGERS: {currentGame.boostedPlayerCount || currentGame.totalPlayers || 0}</span>
      <span>Total Liq: {(currentGame.boostedTotalBets || currentGame.totalBets || 0).toFixed(3)} SOL</span>
      {showCountdown && (
        <span className="text-blue-400 animate-pulse">Next: {countdownSeconds}s</span>
      )}
      {hasActiveGame && (
        <span className={`font-medium ${
          isPlacingBet ? 'text-blue-400 animate-pulse' : 
          isCashingOut ? 'text-yellow-400 animate-pulse' : 
          'text-green-400'
        }`}>
          {isPlacingBet ? 'Placing...' : isCashingOut ? 'Cashing...' : 'Active Bet'}
        </span>
      )}
    </div>
  </div>
)}

      {/* Mini charts showing recent game results */}
      <div className="mb-2">
        <MiniCharts 
          data={gameResults} 
          maxCharts={isMobile ? 4 : 8}
          onNewGame={(result) => {
            console.log('New game result:', result);
          }}
        />
      </div>

      {/* Mobile optimized layout */}
      <div className={`grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-4'} gap-4`}>
        {/* Chart container */}
        <div 
          key={`game-${gameId}`} 
          ref={chartContainerRef}
          className={`${isMobile ? '' : 'md:col-span-3'} relative flex flex-col`}
          style={{ height: `${getChartHeight()}px` }}
        >
          <CandlestickChart 
            onMultiplierUpdate={() => {}}
            onGameCrash={() => {}}
            currentBet={activeBet?.amount || 0}
            betPlacedAt={activeBet?.entryMultiplier || 1.0}
            height={getChartHeight()}
            useMobileHeight={isMobile}
            serverMultiplier={currentMultiplier}
            serverGameStatus={gameStatus}
            isServerConnected={isConnected}
            didCashOut={!hasActiveGame && gameResults.length > 0 && 
                       gameResults[0]?.timestamp != null && 
                       (Date.now() - gameResults[0].timestamp) < 10000}
          />

          {triggerSellEffect && (
            <SellEffects 
              isWin={sellSuccess} 
              show={triggerSellEffect} 
              onAnimationComplete={handleEffectComplete}
              multiplier={currentMultiplier}
            />
          )}
          
          {showCountdown && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-gradient-to-b from-black/60 to-black/70 backdrop-blur-sm">
              <GameCountdown 
                seconds={countdownSeconds} 
                onComplete={() => {}}
                lastCrashMultiplier={gameResults[0]?.value || null}
                isServerSynced={isConnected}
              />
            </div>
          )}
        </div>

        {/* 🚀 ENHANCED: Trading controls - Using shared state for perfect consistency */}
        <div className={`${isMobile ? '' : 'md:col-span-1'}`}>
          <TradingControls 
            onBuy={handleBuy} 
            onSell={handleSell} 
            walletBalance={custodialBalance}
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

      {/* 🚀 ENHANCED: Game Statistics with better formatting */}
      <div className={`mt-4 bg-[#0d0d0f] p-3 rounded-lg border border-gray-800 ${isMobile ? 'p-2' : 'p-3'}`}>
        <div className="grid grid-cols-4 gap-4">
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
          <div className="text-center">
            <div className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>Balance</div>
            <div className={`font-bold text-green-400 ${isMobile ? 'text-sm' : 'text-base md:text-lg'}`}>
              {custodialBalance.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 ENHANCED: Debug information in development with detailed shared state */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-400 space-y-1">
          <div>
            <strong>Shared State Debug:</strong>
          </div>
          <div>
            Balance: {custodialBalance.toFixed(3)} SOL | 
            Bet: {activeBet?.amount.toFixed(3) || '0.000'} | 
            Entry: {activeBet?.entryMultiplier.toFixed(2) || '0.00'}x | 
            Current: {currentMultiplier.toFixed(2)}x
          </div>
          <div>
            Potential Payout: {potentialPayout.toFixed(3)} SOL | 
            Potential Profit: {isProfit ? '+' : ''}{potentialProfit.toFixed(3)} SOL | 
            Status: {gameStatus}
          </div>
          <div>
            Active Bet: {hasActiveGame ? 'YES' : 'NO'} | 
            Placing: {isPlacingBet ? 'YES' : 'NO'} | 
            Cashing: {isCashingOut ? 'YES' : 'NO'} | 
            Connected: {isConnected ? 'YES' : 'NO'}
          </div>
          <div>
            Loading: {custodialBalanceLoading ? 'YES' : 'NO'} | 
            Error: {balanceError || 'None'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartContainer;