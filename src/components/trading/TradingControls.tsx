// src/components/trading/TradingControls.tsx
import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon } from 'lucide-react';
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
  
  // Token context and wallet balance
  const [currentToken, setCurrentToken] = useState<TokenType>(TokenType.SOL);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [ruggedBalance, setRuggedBalance] = useState<number>(1000); // Default RUGGED balance
  
  // Update wallet balance from real wallet data
  useEffect(() => {
    if (embeddedWallet && authenticated) {
      // Get real SOL balance from wallet
      const updateBalance = async () => {
        try {
          // You can implement actual balance fetching here
          // For now, use the prop or a default
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
  const [sellAmount, setSellAmount] = useState<string>('');
  const [sellPercentage, setSellPercentage] = useState<number>(100); // Default to 100%
  const [showEffect, setShowEffect] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(true);
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  
  // Auto cashout settings
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  
  // Real game state from server
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  const [hasActiveBet, setHasActiveBet] = useState<boolean>(false);
  
  // Use real game data when available, fall back to props
  const activeCurrentGame = currentGame;
  const activeIsGameActive = activeCurrentGame?.status === 'active' || propIsGameActive;
  const activeCurrentMultiplier = activeCurrentGame?.multiplier || propCurrentMultiplier;
  const activeHasActiveGame = hasActiveBet || propHasActiveGame;
  const activeHoldings = propHoldings; // This would come from bet tracking

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

  // Handle automatic cashout with useCallback to prevent dependency issues
  const handleCashout = useCallback(async () => {
    if (!authenticated || !walletAddress || !isConnected || !hasActiveBet) {
      return;
    }

    setIsCashingOut(true);
    try {
      const success = await cashOut(walletAddress);
      if (success) {
        setHasActiveBet(false);
        toast.success('Cashed out successfully!');
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
  }, [authenticated, walletAddress, isConnected, hasActiveBet, cashOut, onSell]);

  // Auto cashout effect - using useEffect with the correct dependencies
  useEffect(() => {
    // Only trigger auto cashout when all conditions are met
    if (
      activeHasActiveGame && 
      activeIsGameActive && 
      autoCashoutEnabled && 
      parseFloat(autoCashoutValue) > 0 &&
      activeCurrentMultiplier >= parseFloat(autoCashoutValue)
    ) {
      console.log('Auto cashout triggered at', activeCurrentMultiplier, 'x');
      handleCashout();
    }
  }, [activeCurrentMultiplier, autoCashoutEnabled, autoCashoutValue, activeHasActiveGame, activeIsGameActive, handleCashout]);

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Different regex pattern based on token type
    const pattern = currentToken === TokenType.SOL 
      ? /^(\d+)?(\.\d{0,6})?$/ // SOL can have decimals
      : /^\d*$/; // RUGGED is integer only
    
    if (pattern.test(value) || value === '') {
      setAmount(value);
      if (value !== '') {
        setSavedAmount(value);
      }
    }
  };

  // Handle sell amount change
  const handleSellAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Different regex pattern based on token type
    const pattern = currentToken === TokenType.SOL 
      ? /^(\d+)?(\.\d{0,6})?$/ // SOL can have decimals
      : /^\d*$/; // RUGGED is integer only
    
    if (pattern.test(value) || value === '') {
      setSellAmount(value);
      
      // Update the percentage based on the entered amount (if game is active)
      if (value !== '' && activeHasActiveGame && activeHoldings > 0) {
        const parsedValue = parseFloat(value);
        const maxCashout = activeHoldings; // Assuming holdings represents what can be cashed out
        if (!isNaN(parsedValue) && maxCashout > 0) {
          const calculatedPercentage = Math.min((parsedValue / maxCashout) * 100, 100);
          setSellPercentage(Math.round(calculatedPercentage));
        }
      }
    }
  };

  // Quick amount buttons - different for SOL vs RUGGED
  const quickAmounts = currentToken === TokenType.SOL 
    ? [0.01, 0.05, 0.1, 0.5] 
    : [10, 50, 100, 500];

  // Set a quick amount
  const setQuickAmount = (amt: number) => {
    const amtStr = amt.toString();
    setAmount(amtStr);
    setSavedAmount(amtStr);
  };

  // Handle auto cashout value change
  const handleAutoCashoutValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and up to 2 decimal places
    if (/^(\d+)?(\.\d{0,2})?$/.test(value) || value === '') {
      setAutoCashoutValue(value);
    }
  };

  // Quick autoCashout buttons
  const quickAutoCashoutValues = [1.5, 2.0, 3.0, 5.0];

  // Set a quick autoCashout value
  const setQuickAutoCashoutValue = (value: number) => {
    setAutoCashoutValue(value.toString());
  };

  // Set sell percentage and update sell amount
  const handleSetSellPercentage = (percentage: number) => {
    setSellPercentage(percentage);
    
    // Update sell amount based on percentage
    if (activeHasActiveGame && activeHoldings > 0) {
      const calculatedAmount = (activeHoldings * percentage / 100).toFixed(
        currentToken === TokenType.SOL ? 6 : 0
      );
      setSellAmount(calculatedAmount);
    }
  };

  // Handle buy button click - Real server integration
  const handleBuy = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Invalid amount');
      return;
    }
    
    // Check for wallet readiness
    if (!isWalletReady || !isConnected) {
      toast.error('Please login to play');
      return;
    }
    
    // Check if game is active
    if (!activeIsGameActive) {
      toast.error('Game is not active');
      return;
    }

    // Check balance
    if (amountNum > activeBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setIsPlacingBet(true);
    try {
      const success = await placeBet(walletAddress, amountNum, userId || undefined);
      if (success) {
        setHasActiveBet(true);
        toast.success(`Bet placed: ${amountNum} SOL`);
        
        // Show effect
        setIsSuccess(true);
        setShowEffect(true);
        setTimeout(() => setShowEffect(false), 1000);
        
        // Call the buy function if provided
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

  // Handle sell button click - Real server integration
  const handleSell = async () => {
    if (isNaN(sellPercentage) || sellPercentage <= 0) {
      toast.error('Invalid percentage');
      return;
    }
    
    // For crash games, we typically cash out 100%
    await handleCashout();
  };

  // Format token balance with appropriate precision
  const formatBalance = (balance: number, token: TokenType) => {
    if (token === TokenType.SOL) {
      return balance.toFixed(3);
    } else {
      // RUGGED tokens might have different precision
      return balance.toFixed(0);
    }
  };

  // Get the active balance
  const activeBalance = currentToken === TokenType.SOL ? solBalance : ruggedBalance;

  // Mobile simplified UI
  if (isMobile) {
    return (
      <div className="bg-[#0d0d0f] text-white p-3 border border-gray-800 rounded-lg">
        {/* Connection Status */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-sm">Status:</span>
          <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Game Info */}
        {activeCurrentGame && (
          <div className="bg-gray-800 p-2 rounded-md mb-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Game #{activeCurrentGame.gameNumber}</span>
              <span className="text-yellow-400 font-bold text-lg">{activeCurrentGame.multiplier.toFixed(2)}x</span>
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

        {/* Bet Amount Input */}
        <div className="mb-3">
          <input
            type="text"
            value={amount}
            onChange={handleAmountChange}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-md focus:outline-none text-center"
            placeholder="Enter bet amount"
            disabled={!activeIsGameActive || hasActiveBet}
          />
        </div>

        {/* Quick amounts for mobile */}
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
              disabled={!activeIsGameActive || hasActiveBet}
            >
              {amt.toString()}
            </button>
          ))}
        </div>

        {/* Main Action Button */}
        {!hasActiveBet ? (
          <button
            onClick={handleBuy}
            disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive}
            className={`w-full py-3 rounded-md font-bold text-lg ${
              isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isPlacingBet ? 'Placing Bet...' : 'Place Bet'}
          </button>
        ) : (
          <div>
            {/* Potential win display */}
            <div className="bg-blue-900 bg-opacity-30 p-2 rounded-md mb-2 text-center">
              <div className="text-xs text-blue-400">Potential Win</div>
              <div className="text-lg font-bold text-blue-300">
                {(parseFloat(amount) * activeCurrentMultiplier).toFixed(3)} SOL
              </div>
            </div>
            
            <button
              onClick={handleSell}
              disabled={isCashingOut || !isConnected || !activeIsGameActive}
              className={`w-full py-3 rounded-md font-bold text-lg ${
                isCashingOut || !isConnected || !activeIsGameActive
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }`}
            >
              {isCashingOut ? 'Cashing Out...' : `Cash Out (${activeCurrentMultiplier.toFixed(2)}x)`}
            </button>
          </div>
        )}

        {/* Warning messages for mobile */}
        {!isWalletReady && (
          <div className="text-yellow-500 text-xs text-center mt-2">
            Login to play
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-3 p-4 relative border border-gray-800 rounded-lg">
      {/* Connection Status */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400">Connection:</span>
        <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
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
      
      {/* Deposit/Withdraw Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          className="bg-blue-600/20 border-blue-600/40 hover:bg-blue-600/30 flex items-center justify-center"
          onClick={() => setShowDepositModal(true)}
        >
          <ArrowDownLeft size={14} className="mr-1" />
          Deposit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-yellow-600/20 border-yellow-600/40 hover:bg-yellow-600/30 flex items-center justify-center"
          onClick={() => setShowWithdrawModal(true)}
        >
          <ArrowUpRight size={14} className="mr-1" />
          Withdraw
        </Button>
      </div>
      
      {/* Get RUGGED tokens button - only when RUGGED is selected */}
      {currentToken === TokenType.RUGGED && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mb-2 bg-green-600/20 border-green-600/40 hover:bg-green-600/30 flex items-center justify-center"
          onClick={() => setShowAirdropModal(true)}
        >
          <CoinsIcon size={14} className="mr-1" />
          Get RUGGED Tokens
        </Button>
      )}
      
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
                  disabled={!autoCashoutEnabled || !activeIsGameActive}
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
                  disabled={!autoCashoutEnabled || !activeIsGameActive}
                >
                  {value.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* BETTING SECTION */}
      <div className="border-t border-gray-800 pt-3 mb-2">
        <h3 className="text-sm font-bold text-gray-400 mb-2">PLACE BET</h3>
        
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
              disabled={!activeIsGameActive || hasActiveBet}
            />
            <button
              onClick={() => setQuickAmount(activeBalance * 0.5)}
              className="bg-gray-700 text-gray-300 px-2 text-xs border-l border-gray-900"
              disabled={!activeIsGameActive || hasActiveBet}
            >
              Half
            </button>
            <button
              onClick={() => setQuickAmount(activeBalance)}
              className="bg-gray-700 text-gray-300 px-2 text-xs rounded-r-md"
              disabled={!activeIsGameActive || hasActiveBet}
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
              disabled={!activeIsGameActive || hasActiveBet}
            >
              {amt.toString()} {currentToken}
            </button>
          ))}
        </div>
        
        {/* Buy Button */}
        {!hasActiveBet ? (
          <button
            onClick={handleBuy}
            disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
            className={`w-full py-2 rounded-md font-bold mb-2 flex items-center justify-center ${
              isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isPlacingBet ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                Placing Bet...
              </>
            ) : (
              <>
                <Coins className="mr-2 h-5 w-5" />
                Place Bet
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleSell}
            disabled={isCashingOut || !isConnected || !activeIsGameActive}
            className={`w-full py-2 rounded-md font-bold mb-2 flex items-center justify-center ${
              isCashingOut || !isConnected || !activeIsGameActive
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
            }`}
          >
            {isCashingOut ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                Cashing Out...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Cash Out ({activeCurrentMultiplier.toFixed(2)}x)
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Active Bet Display */}
      {hasActiveBet && (
        <div className="bg-blue-900 bg-opacity-30 p-3 rounded-md mb-2">
          <div className="text-center">
            <div className="text-sm text-blue-400">Potential Win</div>
            <div className="text-lg font-bold text-blue-300">
              {(parseFloat(amount) * activeCurrentMultiplier).toFixed(3)} SOL
            </div>
          </div>
        </div>
      )}
      
      {/* Warning messages */}
      <div className="mt-1">
        {/* Warning message when not connected */}
        {!isWalletReady && (
          <div className="text-yellow-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Login to play</span>
          </div>
        )}
        
        {/* Connection warning */}
        {isWalletReady && !isConnected && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Connecting to game server...</span>
          </div>
        )}
        
        {/* Insufficient funds warning */}
        {isWalletReady && parseFloat(amount) > activeBalance && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Insufficient balance</span>
          </div>
        )}
        
        {/* Game paused warning */}
        {!activeIsGameActive && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Game paused. Waiting for next round.</span>
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