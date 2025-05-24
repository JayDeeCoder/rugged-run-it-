// src/components/trading/TradingControls.tsx
import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon, Timer, Users } from 'lucide-react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../common/Button';
import { useGameSocket } from '../../hooks/useGameSocket';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';

// Import from barrel file instead of direct imports
import { AirdropModal, DepositModal, WithdrawModal } from './index';

// Define TokenType locally if not available
export enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

// Enhanced bet tracking interface
interface ActiveBet {
  id: string;
  amount: number;
  entryMultiplier: number;
  timestamp: number;
  gameId: string;
}

interface TradingControlsProps {
  onBuy?: (amount: number) => void;
  onSell?: (percentage: number) => void;
  isPlacingBet?: boolean;
  isCashingOut?: boolean;
  hasActiveGame?: boolean;
  walletBalance?: number;
  holdings?: number;
  currentMultiplier?: number;
  isGameActive?: boolean;
  isMobile?: boolean;
}

const TradingControls: FC<TradingControlsProps> = ({ 
  onBuy, 
  onSell, 
  isPlacingBet: propIsPlacingBet = false, 
  isCashingOut: propIsCashingOut = false,
  hasActiveGame: propHasActiveGame = false,
  walletBalance: propWalletBalance = 0,
  holdings: propHoldings = 0,
  currentMultiplier: propCurrentMultiplier = 1.0,
  isGameActive: propIsGameActive = true,
  isMobile = false
}) => {
  // Authentication and wallet setup
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // State for user ID
  const [userId, setUserId] = useState<string | null>(null);
  
  // Real game server connection
  const { currentGame, isConnected, placeBet, cashOut } = useGameSocket(walletAddress, userId || undefined);
  
  // Enhanced bet tracking
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
  
  // Token context and wallet balance
  const [currentToken, setCurrentToken] = useState<TokenType>(TokenType.SOL);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [ruggedBalance, setRuggedBalance] = useState<number>(1000); // Default RUGGED balance
  
  // Update wallet balance from real wallet data
  useEffect(() => {
    if (embeddedWallet && authenticated) {
      const updateBalance = async () => {
        try {
          setSolBalance(propWalletBalance || 0.1); // Default small balance for testing
        } catch (error) {
          console.warn('Could not fetch wallet balance:', error);
        }
      };
      updateBalance();
    }
  }, [embeddedWallet, authenticated, propWalletBalance]);
  
  // Check if wallet is ready
  const isWalletReady = authenticated && walletAddress !== '';

  // Use localStorage to remember user's preferred amount
  const [savedAmount, setSavedAmount] = useLocalStorage<string>('default-bet-amount', '0.01');
  const [amount, setAmount] = useState<string>(savedAmount);
  
  // Modal states
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  
  // Auto cashout settings
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  
  // Loading states
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  
  // Real game state from server
  const activeCurrentGame = currentGame;
  const activeIsGameActive = activeCurrentGame?.status === 'active' || activeCurrentGame?.status === 'waiting';
  const activeCurrentMultiplier = activeCurrentGame?.multiplier || propCurrentMultiplier;
  const gameStatus = activeCurrentGame?.status || 'waiting';
  
  // Calculate potential payout based on entry multiplier
  const calculatePotentialWin = () => {
    if (!activeBet) return 0;
    const winMultiplier = Math.max(activeCurrentMultiplier, activeBet.entryMultiplier);
    return activeBet.amount * winMultiplier;
  };

  // Get or create user when wallet connects
  useEffect(() => {
    if (authenticated && walletAddress) {
      const initUser = async () => {
        try {
          const userData = await UserAPI.getUserOrCreate(walletAddress);
          if (userData) {
            setUserId(userData.id);
          }
        } catch (error) {
          console.warn('Could not get user data:', error);
        }
      };
      initUser();
    }
  }, [authenticated, walletAddress]);

  // Update local amount state when saved amount changes
  useEffect(() => {
    setAmount(savedAmount);
  }, [savedAmount]);

  // Handle token switch
  const handleTokenChange = (token: TokenType) => {
    setCurrentToken(token);
  };

  // Enhanced cashout with proper payout calculation
  const handleCashout = useCallback(async () => {
    if (!authenticated || !walletAddress || !isConnected || !activeBet) {
      return;
    }

    setIsCashingOut(true);
    try {
      // Calculate actual payout based on entry point vs current multiplier
      const actualMultiplier = Math.max(activeCurrentMultiplier, activeBet.entryMultiplier);
      const payout = activeBet.amount * actualMultiplier;
      
      // Call cashOut with only walletAddress as expected by useGameSocket
      const success = await cashOut(walletAddress);
      
      if (success) {
        setActiveBet(null);
        toast.success(`Cashed out: ${payout.toFixed(3)} SOL`);
        if (onSell) onSell(100);
      } else {
        toast.error('Failed to cash out');
      }
    } catch (error) {
      console.error('Error cashing out:', error);
      toast.error('Failed to cash out');
    } finally {
      setIsCashingOut(false);
    }
  }, [authenticated, walletAddress, isConnected, activeBet, activeCurrentMultiplier, cashOut, onSell]);

  // Auto cashout effect
  useEffect(() => {
    if (
      activeBet && 
      activeIsGameActive && 
      autoCashoutEnabled && 
      parseFloat(autoCashoutValue) > 0 &&
      activeCurrentMultiplier >= parseFloat(autoCashoutValue) &&
      gameStatus === 'active'
    ) {
      console.log('Auto cashout triggered at', activeCurrentMultiplier, 'x');
      handleCashout();
    }
  }, [activeCurrentMultiplier, autoCashoutEnabled, autoCashoutValue, activeBet, activeIsGameActive, gameStatus, handleCashout]);

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const pattern = currentToken === TokenType.SOL 
      ? /^(\d+)?(\.\d{0,6})?$/ 
      : /^\d*$/;
    
    if (pattern.test(value) || value === '') {
      setAmount(value);
      if (value !== '') {
        setSavedAmount(value);
      }
    }
  };

  // Quick amount buttons
  const quickAmounts = currentToken === TokenType.SOL 
    ? [0.01, 0.05, 0.1, 0.5] 
    : [10, 50, 100, 500];

  const setQuickAmount = (amt: number) => {
    const amtStr = amt.toString();
    setAmount(amtStr);
    setSavedAmount(amtStr);
  };

  // Handle auto cashout value change
  const handleAutoCashoutValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^(\d+)?(\.\d{0,2})?$/.test(value) || value === '') {
      setAutoCashoutValue(value);
    }
  };

  const quickAutoCashoutValues = [1.5, 2.0, 3.0, 5.0];

  const setQuickAutoCashoutValue = (value: number) => {
    setAutoCashoutValue(value.toString());
  };

  // Enhanced bet placement with entry multiplier tracking
  const handleBuy = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Invalid amount');
      return;
    }
    
    if (!isWalletReady || !isConnected) {
      toast.error('Please login to play');
      return;
    }
    
    if (!activeIsGameActive) {
      toast.error('Game is not available');
      return;
    }

    if (amountNum > activeBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setIsPlacingBet(true);
    try {
      // Get current multiplier as entry point (1.0 for waiting games)
      const entryMultiplier = gameStatus === 'waiting' ? 1.0 : activeCurrentMultiplier;
      
      const success = await placeBet(walletAddress, amountNum, userId || undefined);
      if (success) {
        // Store bet with entry multiplier
        const newBet: ActiveBet = {
          id: `bet_${Date.now()}`,
          amount: amountNum,
          entryMultiplier: entryMultiplier,
          timestamp: Date.now(),
          gameId: activeCurrentGame?.id || 'unknown'
        };
        
        setActiveBet(newBet);
        toast.success(`Bet placed: ${amountNum} SOL (Entry: ${entryMultiplier.toFixed(2)}x)`);
        
        if (onBuy) onBuy(amountNum);
      } else {
        toast.error('Failed to place bet');
      }
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error('Failed to place bet');
    } finally {
      setIsPlacingBet(false);
    }
  };

  // Format token balance
  const formatBalance = (balance: number, token: TokenType) => {
    if (token === TokenType.SOL) {
      return balance.toFixed(3);
    } else {
      return balance.toFixed(0);
    }
  };

  const activeBalance = currentToken === TokenType.SOL ? solBalance : ruggedBalance;

  // Get game status display
  const getGameStatusDisplay = () => {
    switch (gameStatus) {
      case 'waiting':
        return { text: 'Next Round', color: 'text-blue-400', bg: 'bg-blue-600' };
      case 'active':
        return { text: 'Round Active', color: 'text-green-400', bg: 'bg-green-600' };
      case 'crashed':
        return { text: 'Round Ended', color: 'text-red-400', bg: 'bg-red-600' };
      default:
        return { text: 'Connecting...', color: 'text-gray-400', bg: 'bg-gray-600' };
    }
  };

  const statusDisplay = getGameStatusDisplay();

  // Enhanced Mobile UI with side-by-side controls
  if (isMobile) {
    return (
      <div className="bg-[#0d0d0f] text-white p-3 border border-gray-800 rounded-lg">
        {/* Connection Status */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-sm">Status:</span>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded text-xs ${statusDisplay.bg}`}>
              {statusDisplay.text}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Game Info */}
        {activeCurrentGame && (
          <div className="bg-gray-800 p-2 rounded-md mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-400 text-sm">Game #{activeCurrentGame.gameNumber}</span>
              <span className="text-yellow-400 font-bold text-lg">{activeCurrentGame.multiplier.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">
                <Users size={12} className="inline mr-1" />
                {activeCurrentGame.totalPlayers} players
              </span>
              <span className="text-gray-400">
                {activeCurrentGame.totalBets.toFixed(2)} SOL total
              </span>
            </div>
          </div>
        )}

        {/* Balance */}
        <div className="bg-gray-800 p-2 rounded-md mb-3">
          <div className="text-center">
            <div className="text-xs text-gray-400">Balance</div>
            <div className="text-sm font-bold text-blue-400">
              {formatBalance(activeBalance, currentToken)} {currentToken}
            </div>
          </div>
        </div>

        {/* Active Bet Display */}
        {activeBet && (
          <div className="bg-blue-900 bg-opacity-30 p-2 rounded-md mb-3">
            <div className="text-center">
              <div className="text-xs text-blue-400">Potential Win</div>
              <div className="text-lg font-bold text-blue-300">
                {calculatePotentialWin().toFixed(3)} SOL
              </div>
              <div className="text-xs text-gray-400">
                Entry: {activeBet.entryMultiplier.toFixed(2)}x | Bet: {activeBet.amount} SOL
              </div>
            </div>
          </div>
        )}

        {/* Bet Amount Input */}
        {!activeBet && (
          <div className="mb-3">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="w-full bg-gray-800 text-white px-3 py-2 rounded-md focus:outline-none text-center"
              placeholder="Enter bet amount"
              disabled={!activeIsGameActive}
            />
          </div>
        )}

        {/* Quick amounts for mobile */}
        {!activeBet && (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                onClick={() => setQuickAmount(amt)}
                className={`px-2 py-1 text-xs rounded-md ${
                  parseFloat(amount) === amt
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300'
                }`}
                disabled={!activeIsGameActive}
              >
                {amt.toString()}
              </button>
            ))}
          </div>
        )}

        {/* Side-by-side Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {!activeBet ? (
            <>
              <button
                onClick={handleBuy}
                disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive}
                className={`py-3 rounded-md font-bold text-sm ${
                  isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isPlacingBet ? 'Placing...' : 'Place Bet'}
              </button>
              <button
                disabled
                className="py-3 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed"
              >
                Cash Out
              </button>
            </>
          ) : (
            <>
              <button
                disabled
                className="py-3 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed"
              >
                Bet Placed
              </button>
              <button
                onClick={handleCashout}
                disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
                className={`py-3 rounded-md font-bold text-sm ${
                  isCashingOut || !isConnected || gameStatus !== 'active'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                }`}
              >
                {isCashingOut ? 'Cashing...' : `Cash Out`}
              </button>
            </>
          )}
        </div>

        {/* Warning messages for mobile */}
        {!isWalletReady && (
          <div className="text-yellow-500 text-xs text-center mt-2">
            Login to play
          </div>
        )}
        
        {gameStatus === 'waiting' && (
          <div className="text-blue-500 text-xs text-center mt-2">
            Waiting for next round
          </div>
        )}
      </div>
    );
  }

  // Enhanced Desktop UI
  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-3 p-4 relative border border-gray-800 rounded-lg">
      {/* Connection Status */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400">Game Status:</span>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded text-xs ${statusDisplay.bg}`}>
            {statusDisplay.text}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Game Info */}
      {activeCurrentGame && (
        <div className="bg-gray-800 p-3 rounded-md mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">Game #{activeCurrentGame.gameNumber}</span>
            <span className="text-yellow-400 font-bold">{activeCurrentGame.multiplier.toFixed(2)}x</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Total Bets:</span>
            <span className="text-white">{activeCurrentGame.totalBets.toFixed(3)} SOL</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Players:</span>
            <span className="text-white">{activeCurrentGame.totalPlayers}</span>
          </div>
        </div>
      )}

      {/* Token Switcher */}
      <div className="flex items-center justify-between bg-gray-800 hover:bg-gray-700 transition-colors rounded-lg p-2 cursor-pointer mb-2">
        <div 
          className="flex items-center justify-between w-full"
          onClick={() => setShowDepositModal(true)}
        >
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${
              currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
            }`}>
              <span className="text-white font-bold text-xs">{currentToken === TokenType.SOL ? 'SOL' : 'RUG'}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-xs text-gray-400">Balance</span>
              <span className={`text-sm font-bold ${
                currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
              }`}>
                {formatBalance(activeBalance, currentToken)} {currentToken}
              </span>
            </div>
          </div>
          
          {/* Token Switch Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTokenChange(TokenType.SOL);
              }}
              className={`px-3 py-1 text-xs rounded-md ${
                currentToken === TokenType.SOL 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              SOL
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTokenChange(TokenType.RUGGED);
                if (ruggedBalance < 10) {
                  setShowAirdropModal(true);
                }
              }}
              className={`px-3 py-1 text-xs rounded-md ${
                currentToken === TokenType.RUGGED 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              RUGGED
            </button>
          </div>
        </div>
      </div>
      
      {/* Auto Cashout Settings */}
      <div className="mb-2">
        <div 
          className="flex justify-between items-center bg-gray-800 p-2 rounded-md cursor-pointer"
          onClick={() => setShowAutoCashout(!showAutoCashout)}
        >
          <div className="flex items-center">
            <div className={`h-3 w-3 rounded-full mr-2 ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
            <span className="text-gray-300">Auto Cashout</span>
          </div>
          <div className="text-gray-400 text-sm">
            {autoCashoutEnabled ? `at ${autoCashoutValue}x` : 'Disabled'}
            <span className="ml-2">{showAutoCashout ? '▲' : '▼'}</span>
          </div>
        </div>
        
        {showAutoCashout && (
          <div className="bg-gray-800 p-3 rounded-md mt-1">
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-300 text-sm">Enable Auto Cashout</label>
              <div className="relative inline-block w-10 h-5">
                <input
                  type="checkbox"
                  id="auto-cashout-toggle"
                  checked={autoCashoutEnabled}
                  onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                  className="opacity-0 absolute w-0 h-0"
                />
                <label 
                  htmlFor="auto-cashout-toggle"
                  className={`absolute cursor-pointer top-0 left-0 right-0 bottom-0 rounded-full transition-colors ${
                    autoCashoutEnabled ? 'bg-green-600' : 'bg-gray-600'
                  }`}
                >
                  <span 
                    className={`absolute h-3 w-3 mt-1 bg-white rounded-full transition-transform ${
                      autoCashoutEnabled ? 'translate-x-5 ml-0' : 'translate-x-1'
                    }`} 
                  />
                </label>
              </div>
            </div>
            
            <div className="mb-2">
              <label className="block text-gray-300 text-sm mb-1">
                Cashout at Multiplier
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={autoCashoutValue}
                  onChange={handleAutoCashoutValueChange}
                  className="flex-1 bg-gray-700 text-white px-3 py-1 rounded-l-md focus:outline-none"
                  placeholder="2.00"
                  disabled={!autoCashoutEnabled}
                />
                <span className="bg-gray-600 text-gray-300 px-3 py-1 rounded-r-md">x</span>
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {quickAutoCashoutValues.map((value) => (
                <button
                  key={value}
                  onClick={() => setQuickAutoCashoutValue(value)}
                  className={`px-2 py-1 text-xs rounded-md ${
                    parseFloat(autoCashoutValue) === value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  disabled={!autoCashoutEnabled}
                >
                  {value.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Active Bet Display */}
      {activeBet && (
        <div className="bg-blue-900 bg-opacity-30 p-3 rounded-md mb-2">
          <div className="text-center">
            <div className="text-sm text-blue-400">Active Bet</div>
            <div className="text-lg font-bold text-blue-300">
              {activeBet.amount} SOL @ {activeBet.entryMultiplier.toFixed(2)}x
            </div>
            <div className="text-sm text-green-400 mt-1">
              Potential Win: {calculatePotentialWin().toFixed(3)} SOL
            </div>
          </div>
        </div>
      )}
      
      {/* BETTING SECTION */}
      <div className="border-t border-gray-800 pt-3 mb-2">
        <h3 className="text-sm font-bold text-gray-400 mb-2">
          {activeBet ? 'ACTIVE BET' : 'PLACE BET'}
        </h3>
        
        {!activeBet && (
          <>
            {/* Amount Input */}
            <div className="mb-2">
              <label className="block text-gray-400 text-xs mb-1">
                Bet Amount ({currentToken})
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  className="flex-1 bg-gray-800 text-white px-3 py-1 rounded-l-md focus:outline-none"
                  placeholder="0.00"
                  disabled={!activeIsGameActive}
                />
                <button
                  onClick={() => setQuickAmount(activeBalance * 0.5)}
                  className="bg-gray-700 text-gray-300 px-2 text-xs border-l border-gray-900"
                  disabled={!activeIsGameActive}
                >
                  Half
                </button>
                <button
                  onClick={() => setQuickAmount(activeBalance)}
                  className="bg-gray-700 text-gray-300 px-2 text-xs rounded-r-md"
                  disabled={!activeIsGameActive}
                >
                  Max
                </button>
              </div>
            </div>
            
            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setQuickAmount(amt)}
                  className={`px-2 py-1 text-xs rounded-md ${
                    parseFloat(amount) === amt
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  disabled={!activeIsGameActive}
                >
                  {amt.toString()} {currentToken}
                </button>
              ))}
            </div>
          </>
        )}
        
        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {!activeBet ? (
            <>
              <button
                onClick={handleBuy}
                disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
                className={`py-2 rounded-md font-bold text-sm flex items-center justify-center ${
                  isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isPlacingBet ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Placing...
                  </>
                ) : (
                  <>
                    <Coins className="mr-2 h-4 w-4" />
                    Place Bet
                  </>
                )}
              </button>
              <button
                disabled
                className="py-2 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Cash Out
              </button>
            </>
          ) : (
            <>
              <button
                disabled
                className="py-2 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
              >
                <Coins className="mr-2 h-4 w-4" />
                Bet Placed
              </button>
              <button
                onClick={handleCashout}
                disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
                className={`py-2 rounded-md font-bold text-sm flex items-center justify-center ${
                  isCashingOut || !isConnected || gameStatus !== 'active'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                }`}
              >
                {isCashingOut ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Cashing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Cash Out ({activeCurrentMultiplier.toFixed(2)}x)
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Warning messages */}
      <div className="mt-1">
        {!isWalletReady && (
          <div className="text-yellow-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Login to play</span>
          </div>
        )}
        
        {isWalletReady && !isConnected && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Connecting to game server...</span>
          </div>
        )}
        
        {isWalletReady && parseFloat(amount) > activeBalance && !activeBet && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Insufficient balance</span>
          </div>
        )}
        
        {gameStatus === 'waiting' && (
          <div className="text-blue-500 text-xs flex items-center">
            <Timer className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Ready to bet - Next round starting soon</span>
          </div>
        )}
        
        {gameStatus === 'crashed' && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Round ended. Waiting for next round.</span>
          </div>
        )}
      </div>

      {/* Modals */}
      <AirdropModal 
        isOpen={showAirdropModal}
        onClose={() => setShowAirdropModal(false)}
      />
      
      <DepositModal 
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        currentToken={currentToken}
        walletAddress={walletAddress}
      />
      
      <WithdrawModal 
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        currentToken={currentToken}
        balance={activeBalance}
      />
    </div>
  );
};

export default TradingControls;