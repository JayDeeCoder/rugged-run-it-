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

interface ChartContainerProps {
  useMobileHeight?: boolean;
}

// 🚀 ENHANCED: Custodial balance hook with real-time socket listeners
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  // Create stable update function with useCallback
  const updateCustodialBalance = useCallback(async () => {
    if (!userId) return;
    
    if (loading) return;
    
    setLoading(true);
    try {
      console.log(`🔄 Fetching custodial balance for user ${userId}...`);
      
      const response = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`👤 User ${userId} not found - balance remains 0`);
          setCustodialBalance(0);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 Custodial balance updated: ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
      } else {
        console.warn('Invalid response format:', data);
      }
    } catch (error) {
      console.error('❌ Failed to fetch custodial balance:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, loading]);

  // Enhanced force refresh
  const forceRefresh = useCallback(async () => {
    if (!userId) return;
    console.log(`🔄 Force refreshing custodial balance for ${userId}...`);
    setLoading(true);

    try {
      const postResponse = await fetch(`/api/custodial/balance/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', timestamp: Date.now() })
      });
      
      if (postResponse.ok) {
        const data = await postResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          console.log(`💰 Force refresh (POST): ${newBalance.toFixed(6)} SOL`);
          setCustodialBalance(newBalance);
          setLastUpdated(Date.now());
          return;
        }
      }
      
      const getResponse = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}&refresh=true`);
      
      if (getResponse.ok) {
        const data = await getResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          console.log(`💰 Force refresh (GET): ${newBalance.toFixed(6)} SOL`);
          setCustodialBalance(newBalance);
          setLastUpdated(Date.now());
        }
      } else {
        console.error('❌ Force refresh failed:', getResponse.status);
      }
      
    } catch (error) {
      console.error('❌ Force refresh error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);
   
  // Polling setup
  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 Setting up custodial balance polling for user: ${userId}`);
      lastUserIdRef.current = userId;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      updateCustodialBalance();
      
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateCustodialBalance();
        }
      }, 15000); // 15 seconds
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [userId, updateCustodialBalance]);
   
  // 🚀 ENHANCED REAL-TIME SOCKET LISTENERS
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up REAL-TIME custodial balance listeners for user: ${userId}`);
      socketListenersRef.current = true;
      
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 REAL-TIME: Custodial balance update - ${data.custodialBalance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.custodialBalance) || 0);
          setLastUpdated(Date.now());
          
          if (data.updateType === 'deposit_processed') {
            toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL`);
          } else if (data.updateType === 'bet_placed') {
            toast(`Bet placed: -${data.change?.toFixed(3)} SOL`, { icon: '🎯' });
          } else if (data.updateType === 'cashout_processed') {
            toast.success(`Cashout: +${data.change?.toFixed(3)} SOL`);
          }
        }
      };

      const handleUserBalanceUpdate = (data: any) => {
        if (data.userId === userId && data.balanceType === 'custodial') {
          console.log(`💰 REAL-TIME: User balance update - ${data.newBalance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.newBalance) || 0);
          setLastUpdated(Date.now());
          
          if (data.transactionType === 'deposit') {
            toast.success(`Deposit: +${data.change?.toFixed(3)} SOL`);
          }
        }
      };

      const handleDepositConfirmation = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 REAL-TIME: Deposit confirmed for ${userId}, amount: ${data.depositAmount}`);
          
          setCustodialBalance(prev => prev + (parseFloat(data.depositAmount) || 0));
          setLastUpdated(Date.now());
          
          setTimeout(forceRefresh, 1500);
          
          toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL!`);
        }
      };

      const handleCustodialBetResult = (data: any) => {
        if (data.userId === userId) {
          console.log(`🎯 REAL-TIME: Custodial bet result for ${userId}`);
          
          if (data.success && data.custodialBalance !== undefined) {
            setCustodialBalance(parseFloat(data.custodialBalance) || 0);
            setLastUpdated(Date.now());
          } else {
            setTimeout(forceRefresh, 1000);
          }
        }
      };

      const handleCustodialCashoutResult = (data: any) => {
        if (data.userId === userId) {
          console.log(`💸 REAL-TIME: Custodial cashout result for ${userId}`);
          
          if (data.success && data.custodialBalance !== undefined) {
            setCustodialBalance(parseFloat(data.custodialBalance) || 0);
            setLastUpdated(Date.now());
            
            if (data.payout) {
              toast.success(`Cashout: +${data.payout?.toFixed(3)} SOL`);
            }
          } else {
            setTimeout(forceRefresh, 1000);
          }
        }
      };
      
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('userBalanceUpdate', handleUserBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      socket.on('custodialBetResult', handleCustodialBetResult);
      socket.on('custodialCashOutResult', handleCustodialCashoutResult);
      
      return () => {
        console.log(`🔌 Cleaning up REAL-TIME custodial balance listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('userBalanceUpdate', handleUserBalanceUpdate);
        socket.off('depositConfirmed', handleDepositConfirmation);
        socket.off('custodialBetResult', handleCustodialBetResult);
        socket.off('custodialCashOutResult', handleCustodialCashoutResult);
        socketListenersRef.current = false;
      };
    }
  }, [userId, forceRefresh]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance, forceRefresh };
};

const ChartContainer: FC<ChartContainerProps> = ({ useMobileHeight = false }) => {
  const { width } = useWindowSize();
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
  const [userCashedOut, setUserCashedOut] = useState<boolean>(false);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Use Privy hooks for authentication
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  
  const { trades, currentPrice, placeOrder } = useContext(TradeContext);
  const { isAuthenticated, currentUser } = useContext(UserContext);

  // Get wallet address for game socket
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // 🚀 UPDATED: Use custodial balance instead of embedded wallet balance
  const { 
    custodialBalance, 
    loading: custodialBalanceLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useCustodialBalance(currentUser?.id || '');
  
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

  const isMobile = width ? width < 768 : false;
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

  // ENHANCED: Handle real game state changes with server bet tracking
  useEffect(() => {
    if (!currentGame || !isMountedRef.current) return;

    // Reset user bet state on new game
    if (currentGame.gameNumber !== lastGameNumber) {
      setUserBet(0);
      setBetEntryMultiplier(1.0);
      setUserCashedOut(false);
      setLastGameNumber(currentGame.gameNumber);
      
      console.log(`🎮 New game #${currentGame.gameNumber} - User state reset`);
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
      
      if (userBet > 0) {
        setSellSuccess(false);
        setTriggerSellEffect(true);
        toast.error(`Crashed at ${crashMultiplier.toFixed(2)}x! Lost ${userBet.toFixed(3)} SOL`);
        
        setUserBet(0);
        setBetEntryMultiplier(1.0);
        setUserCashedOut(false);
      }
    }
  }, [currentGame, lastGameNumber, userBet]);

  const handleEffectComplete = () => {
    if (isMountedRef.current) {
      setTriggerSellEffect(false);
    }
  };

  // 🚀 UPDATED: Use custodial betting instead of regular betting
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

    setIsPlacingBet(true);
    
    try {
      console.log(`Placing custodial bet: ${amount} SOL in game #${currentGame.gameNumber} (${currentGame.status})`);

      const success = await placeCustodialBet(currentUser.id, amount);
      
      if (success) {
        const order: Order = {
          side: 'buy',
          amount,
          timestamp: new Date().toISOString(),
        };

        placeOrder(order);
        
        const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.multiplier;
        setUserBet(amount);
        setBetEntryMultiplier(entryMultiplier);
        
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
  }, [custodialBalance, currentGame, placeCustodialBet, currentUser?.id, placeOrder, canBet]);

  // 🚀 UPDATED: Use custodial cashout instead of regular cashout
  const handleSell = useCallback(async (percentage: number) => {
    if (userBet <= 0 || !currentGame || currentGame.status !== 'active' || !isMountedRef.current) {
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
      console.log(`Cashing out 100% at multiplier ${currentMultiplier}x`);

      const result = await custodialCashOut(currentUser.id, walletAddress);
      
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
        const finalPayout = payout || (userBet * currentMultiplier * 0.6);
        
        setUserCashedOut(true);
        
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
        
        setUserBet(0);
        setBetEntryMultiplier(1.0);
        setUserCashedOut(false);
        
        const profit = finalPayout - userBet;
        toast.success(`Cashed out: +${profit.toFixed(3)} SOL (${finalPayout.toFixed(3)} total)`);
      } else {
        toast.error(reason || 'Failed to RUG');
      }
    } catch (error) {
      console.error('Failed to RUG:', error);
      toast.error('Failed to RUG');
    } finally {
      if (isMountedRef.current) {
        setIsCashingOut(false);
      }
    }
  }, [userBet, currentGame, custodialCashOut, currentUser?.id, walletAddress, placeOrder]);

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

      {/* 🚀 UPDATED: Balance Display - Now shows custodial balance */}
      <div className={`bg-[#0d0d0f] p-2 mb-2 rounded-lg flex flex-wrap justify-between border border-gray-800 ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Balance:</span>
          <span className="text-green-400 ml-1 font-bold">{custodialBalance.toFixed(3)}</span>
        </div>
        <div className={`${isMobile ? 'px-1 py-0.5' : 'px-2 py-1'}`}>
          <span className="text-gray-400">Ape:</span>
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

      {/* 🚀 UPDATED: Real game info - Changed "Players" to "RUGGERS" */}
      {currentGame && (
        <div className={`bg-[#0d0d0f] p-2 mb-2 rounded-lg border border-gray-800 ${isMobile ? 'text-xs' : 'text-xs'} text-gray-400`}>
          <div className="flex justify-between">
            <span>RUGGERS: {currentGame.totalPlayers || 0}</span>
            <span>Total Liq: {(currentGame.totalBets || 0).toFixed(3)} SOL</span>
            {showCountdown && <span className="text-blue-400">Next: {countdownSeconds}s</span>}
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
            currentBet={userBet}
            betPlacedAt={betEntryMultiplier}
            height={getChartHeight()}
            useMobileHeight={isMobile}
            serverMultiplier={currentMultiplier}
            serverGameStatus={gameStatus}
            isServerConnected={isConnected}
            didCashOut={userCashedOut}
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

        {/* 🚀 UPDATED: Trading controls - Now uses custodial balance */}
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

      {/* Game Statistics */}
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