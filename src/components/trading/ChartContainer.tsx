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
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  
  // Local bet tracking (since server doesn't provide userGameState yet)
  const [userBet, setUserBet] = useState<number>(0);
  const [betPlacedAt, setBetPlacedAt] = useState<number | null>(null);
  
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
  
  // Connect to real game server (current implementation)
  const { currentGame, isConnected, placeBet, cashOut } = useGameSocket(walletAddress, currentUser?.id);

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

  // Handle real game state changes (current implementation)
  useEffect(() => {
    if (!currentGame || !isMountedRef.current) return;

    // Handle game crash with current multiplier (no crashedAt property)
    if (currentGame.status === 'crashed') {
      const crashMultiplier = currentGame.multiplier;
      
      // Add to real game results
      const newResult: GameResult = {
        value: crashMultiplier,
        label: `${crashMultiplier.toFixed(2)}x`,
        timestamp: Date.now(),
      };
      
      setGameResults(prev => [newResult, ...prev.slice(0, 49)]);
      
      // Handle user's bet result with local state
      if (userBet > 0) {
        // Since no userGameState, assume they lost if game crashed
        setSellSuccess(false);
        setTriggerSellEffect(true);
        toast.error(`Crashed at ${crashMultiplier.toFixed(2)}x! Lost ${userBet.toFixed(3)} SOL`);
        
        // Reset user bet
        setUserBet(0);
        setBetPlacedAt(null);
      }
      
      // Start countdown for next game (simple 10 second countdown)
      setCountdownSeconds(10);
    }

    // Reset countdown when game starts
    if (currentGame.status === 'active') {
      setCountdownSeconds(0);
    }
  }, [currentGame, userBet]);

  // Handle countdown timer
  useEffect(() => {
    if (countdownSeconds > 0) {
      const timer = setTimeout(() => {
        setCountdownSeconds(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdownSeconds]);

  // ✨ Handle effect completion - RESTORED
  const handleEffectComplete = () => {
    if (isMountedRef.current) {
      setTriggerSellEffect(false);
    }
  };

  // ✨ Handle multiplier updates from chart - RESTORED  
  const handleMultiplierUpdate = (multiplier: number) => {
    // This will be called by the CandlestickChart for visual effects
    // The real multiplier comes from the server via currentGame.multiplier
  };

  // ✨ Handle game crash for visual effects - RESTORED
  const handleGameCrash = (crashMultiplier: number) => {
    // This handles the visual crash effects from the chart
    console.log(`Visual crash effect triggered at ${crashMultiplier.toFixed(2)}x`);
  };

  // Handle placing a bet using current server API
  const handleBuy = useCallback(async (amount: number) => {
    if (amount <= 0 || amount > walletBalance || !currentGame || currentGame.status !== 'active' || !isMountedRef.current) {
      toast.error('Cannot place bet right now');
      return;
    }

    setIsPlacingBet(true);
    
    try {
      console.log(`Placing real bet: ${amount} SOL in game #${currentGame.gameNumber}`);

      // Place bet on real server
      const success = await placeBet(walletAddress, amount, currentUser?.id);
      
      if (success) {
        // Create order for local tracking
        const order: Order = {
          side: 'buy',
          amount,
          timestamp: new Date().toISOString(),
        };

        placeOrder(order);
        
        // Track bet locally
        setUserBet(amount);
        setBetPlacedAt(currentGame.multiplier);
        
        toast.success(`Bet placed: ${amount} SOL`);
      } else {
        toast.error('Failed to place bet on server');
      }
    } catch (error) {
      console.error('Failed to place bet:', error);
      toast.error('Failed to place bet');
    } finally {
      if (isMountedRef.current) {
        setIsPlacingBet(false);
      }
    }
  }, [walletBalance, currentGame, placeBet, walletAddress, currentUser?.id, placeOrder]);

  // Handle selling (full cashout only with current API)
  const handleSell = useCallback(async (percentage: number) => {
    if (userBet <= 0 || !currentGame || currentGame.status !== 'active' || !isMountedRef.current) {
      toast.error('No active bet to cash out');
      return;
    }

    // Only allow 100% cashout with current API
    if (percentage < 100) {
      toast.error('Partial cashouts not supported yet');
      return;
    }

    setIsCashingOut(true);
    
    try {
      const currentMultiplier = currentGame.multiplier;
      console.log(`Cashing out 100% at multiplier ${currentMultiplier}x`);

      // Cash out on real server (current API only takes walletAddress)
      const success = await cashOut(walletAddress);
      
      if (success) {
        // Calculate full cashout amount
        const cashoutAmount = userBet * currentMultiplier;
        
        // Create sell order for local tracking
        const order: Order = {
          side: 'sell',
          amount: cashoutAmount,
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
        
        // ✨ Show win effect - RESTORED
        setSellSuccess(true);
        setTriggerSellEffect(true);
        
        // Reset user bet since we cashed out 100%
        setUserBet(0);
        setBetPlacedAt(null);
        
        const profit = userBet * (currentMultiplier - 1);
        toast.success(`Cashed out: +${profit.toFixed(3)} SOL`);
      } else {
        toast.error('Failed to cash out on server');
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

  // Calculate chart height based on viewport size
  const getChartHeight = () => {
    if (useMobileHeight && isMobile) {
      return 300;
    }
    return isMobile ? 350 : 500;
  };

  // Real game data with current implementation
  const currentMultiplier = currentGame?.multiplier || 1.0;
  const gameStatus = currentGame?.status || 'waiting';
  const gameId = currentGame?.gameNumber || 0;
  const isGameActive = gameStatus === 'active';
  const hasActiveGame = userBet > 0;
  const showCountdown = gameStatus === 'crashed' && countdownSeconds > 0;

  return (
    <div className="p-2 flex flex-col">
      {/* Game Identification and Status - condensed for mobile */}
      <div className="bg-[#0d0d0f] p-2 md:p-3 mb-2 md:mb-3 rounded-lg flex items-center justify-between border border-gray-800 text-sm md:text-base">
        <div className="flex items-center">
          <span className="text-gray-400 text-xs md:text-sm mr-1">Round #</span>
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
          <span className={`ml-1 font-bold ${userBet > 0 ? 'text-blue-400' : 'text-gray-400'}`}>
            {userBet > 0 ? userBet.toFixed(3) : '0.000'}
          </span>
        </div>
        <div className="px-2 py-1">
          <span className="text-gray-400">Potential:</span>
          <span className={`ml-1 font-bold ${userBet > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
            {userBet > 0 ? (userBet * (currentMultiplier - 1)).toFixed(3) : '0.000'}
          </span>
        </div>
      </div>

      {/* Real game info */}
      {currentGame && (
        <div className="bg-[#0d0d0f] p-2 mb-2 rounded-lg border border-gray-800 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Players: {currentGame.totalPlayers || 0}</span>
            <span>Total Bets: {(currentGame.totalBets || 0).toFixed(3)} SOL</span>
          </div>
        </div>
      )}

      {/* Mini charts showing recent game results - REAL DATA */}
      <div className="mb-2">
        <MiniCharts 
          data={gameResults} 
          maxCharts={isMobile ? 5 : 10} 
          onNewGame={(result) => {
            console.log('New game result:', result);
          }}
        />
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
          {/* ✨ RESTORED: All the original props for visual effects */}
          <CandlestickChart 
            onMultiplierUpdate={handleMultiplierUpdate}
            triggerSellEffect={triggerSellEffect}
            onEffectComplete={handleEffectComplete}
            onGameCrash={handleGameCrash}
            currentBet={userBet}
            betPlacedAt={betPlacedAt ?? undefined}
            height={getChartHeight()}
            useMobileHeight={useMobileHeight}
            // Pass real server data to sync visual effects
            serverMultiplier={currentMultiplier}
            serverGameStatus={gameStatus}
            isServerConnected={isConnected}
          />

          {/* ✨ RESTORED: SellEffects component */}
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

      {/* Game Statistics - from real results */}
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
            <div className="text-base md:text-lg font-bold text-blue-400">{gameResults.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartContainer;