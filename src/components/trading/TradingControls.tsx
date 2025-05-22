// src/components/trading/TradingControls.tsx
import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon } from 'lucide-react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../common/Button';
import { UserContext } from '../../context/UserContext';
import { TradeContext } from '../../context/TradeContext';
import { addPlayerBet } from '../../utils/gameDataGenerator';
import { useTokenContext, TokenType } from '../../context/TokenContext';
import { useEmbeddedGameWallet } from '../../hooks/useEmbeddedGameWallet';
import { toast } from 'react-hot-toast';

// Import from barrel file instead of direct imports
import { AirdropModal, DepositModal, WithdrawModal } from './index';

interface TradingControlsProps {
  onBuy: (amount: number) => void;
  onSell: (percentage: number) => void;
  isPlacingBet?: boolean;
  isCashingOut?: boolean;
  hasActiveGame?: boolean;
  walletBalance: number;
  holdings: number;
  currentMultiplier: number;
  isGameActive: boolean;
  isMobile?: boolean;
}

const TradingControls: FC<TradingControlsProps> = ({ 
  onBuy, 
  onSell, 
  isPlacingBet = false, 
  isCashingOut = false,
  hasActiveGame = false,
  walletBalance = 0,
  holdings = 0,
  currentMultiplier = 1.0,
  isGameActive = true,
  isMobile = false
}) => {
  // Get token context
  const { 
    currentToken, 
    setCurrentToken, 
    solBalance, 
    ruggedBalance 
  } = useTokenContext();
  
  // Use embedded game wallet instead of regular wallet
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { wallet: gameWallet, walletData } = useEmbeddedGameWallet();
  
  // Check if wallet is ready using the game wallet data
  const isWalletReady = authenticated && gameWallet !== undefined;

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
  // Use localStorage for auto cashout settings to persist preferences
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  
  // Get context information (for backward compatibility)
  const { currentUser, isAuthenticated } = useContext(UserContext);
  const { placeOrder } = useContext(TradeContext);

  // Update local amount state when saved amount changes
  useEffect(() => {
    setAmount(savedAmount);
  }, [savedAmount]);

  // Handle token switch
  const handleTokenChange = (token: TokenType) => {
    setCurrentToken(token);
  };

  // Handle automatic cashout with useCallback to prevent dependency issues
  const handleCashout = useCallback(() => {
    onSell(100);
  }, [onSell]);

  // Auto cashout effect - using useEffect with the correct dependencies
  useEffect(() => {
    // Only trigger auto cashout when all conditions are met
    if (
      hasActiveGame && 
      isGameActive && 
      autoCashoutEnabled && 
      parseFloat(autoCashoutValue) > 0 &&
      currentMultiplier >= parseFloat(autoCashoutValue)
    ) {
      console.log('Auto cashout triggered at', currentMultiplier, 'x');
      handleCashout();
    }
  }, [currentMultiplier, autoCashoutEnabled, autoCashoutValue, hasActiveGame, isGameActive, handleCashout]);

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
      if (value !== '' && hasActiveGame && holdings > 0) {
        const parsedValue = parseFloat(value);
        const maxCashout = holdings; // Assuming holdings represents what can be cashed out
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
    if (hasActiveGame && holdings > 0) {
      const calculatedAmount = (holdings * percentage / 100).toFixed(
        currentToken === TokenType.SOL ? 6 : 0
      );
      setSellAmount(calculatedAmount);
    }
  };

  // Handle buy button click - updated to use the embedded wallet
  const handleBuy = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.log('Invalid amount');
      return;
    }
    
    // Check for embedded wallet first
    if (!isWalletReady) {
      toast.error('Please login to play');
      return;
    }
    
    // Show effect
    setIsSuccess(true);
    setShowEffect(true);
    setTimeout(() => setShowEffect(false), 1000);
    
    // Call the buy function
    onBuy(amountNum);
  };

  // Handle sell button click
  const handleSell = () => {
    if (isNaN(sellPercentage) || sellPercentage <= 0) {
      console.log('Invalid percentage');
      return;
    }
    
    // Call the sell function
    onSell(sellPercentage);
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

  // Get the active balance based on wallet data
  const activeBalance = currentToken === TokenType.SOL ? 
    (walletData.isConnected ? parseFloat(walletData.balance) : solBalance) : 
    ruggedBalance;

  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-3 p-4 relative border border-gray-800 rounded-lg">
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
                  disabled={!autoCashoutEnabled || !isGameActive}
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
                  disabled={!autoCashoutEnabled || !isGameActive}
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
              disabled={!isGameActive}
            />
            <button
              onClick={() => setQuickAmount(activeBalance * 0.5)}
              className="bg-gray-700 text-gray-300 px-2 text-xs border-l border-gray-900"
              disabled={!isGameActive}
            >
              Half
            </button>
            <button
              onClick={() => setQuickAmount(activeBalance)}
              className="bg-gray-700 text-gray-300 px-2 text-xs rounded-r-md"
              disabled={!isGameActive}
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
              disabled={!isGameActive}
            >
              {amt.toString()} {currentToken}
            </button>
          ))}
        </div>
        
        {/* Buy Button */}
        <button
          onClick={handleBuy}
          disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
          className={`w-full py-2 rounded-md font-bold mb-2 flex items-center justify-center ${
            isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
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
      </div>
      
      {/* CASHOUT SECTION */}
      <div className="border-t border-gray-800 pt-3">
        <h3 className="text-sm font-bold text-gray-400 mb-2">CASH OUT</h3>
        
        {/* Sell Amount Input */}
        <div className="mb-2">
          <label className="block text-gray-400 text-xs mb-1">
            Cash Out Amount ({currentToken})
          </label>
          <div className="flex">
            <input
              type="text"
              value={sellAmount}
              onChange={handleSellAmountChange}
              className="flex-1 bg-gray-800 text-white px-3 py-1 rounded-l-md focus:outline-none"
              placeholder="0.00"
              disabled={!hasActiveGame || !isGameActive}
            />
            <button
              onClick={() => handleSetSellPercentage(50)}
              className="bg-gray-700 text-gray-300 px-2 text-xs border-l border-gray-900"
              disabled={!hasActiveGame || !isGameActive}
            >
              Half
            </button>
            <button
              onClick={() => handleSetSellPercentage(100)}
              className="bg-gray-700 text-gray-300 px-2 text-xs rounded-r-md"
              disabled={!hasActiveGame || !isGameActive}
            >
              Max
            </button>
          </div>
        </div>
        
        {/* Sell Percentage Options */}
        <div className="mb-3">
          <label className="block text-gray-400 text-xs mb-1">
            Cash Out Percentage
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleSetSellPercentage(25)}
              className={`px-2 py-1 text-xs rounded-md ${
                sellPercentage === 25
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              25%
            </button>
            <button
              onClick={() => handleSetSellPercentage(50)}
              className={`px-2 py-1 text-xs rounded-md ${
                sellPercentage === 50
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              50%
            </button>
            <button
              onClick={() => handleSetSellPercentage(75)}
              className={`px-2 py-1 text-xs rounded-md ${
                sellPercentage === 75
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              75%
            </button>
            <button
              onClick={() => handleSetSellPercentage(100)}
              className={`px-2 py-1 text-xs rounded-md ${
                sellPercentage === 100
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              100%
            </button>
          </div>
        </div>
        
        {/* Potential profit display */}
        {hasActiveGame && (
          <div className="bg-gray-800 p-2 rounded-md text-center mb-3">
            <span className="text-xs text-gray-400">Potential profit at current multiplier:</span>
            <div className="text-lg font-bold text-yellow-400">
              +{((holdings * sellPercentage / 100) * (currentMultiplier - 1)).toFixed(currentToken === TokenType.SOL ? 3 : 0)} {currentToken}
            </div>
          </div>
        )}
        
        {/* Sell Button */}
        <button
          onClick={handleSell}
          disabled={isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0}
          className={`w-full py-2 rounded-md font-bold flex items-center justify-center ${
            isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0
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
              Cash Out
            </>
          )}
        </button>
      </div>
      
      {/* Warning messages */}
      <div className="mt-1">
        {/* Warning message when not connected */}
        {!isWalletReady && (
          <div className="text-yellow-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Login to play</span>
          </div>
        )}
        
        {/* Insufficient funds warning */}
        {isWalletReady && parseFloat(amount) > activeBalance && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Insufficient balance</span>
          </div>
        )}
        
        {/* No holdings warning */}
        {isWalletReady && holdings <= 0 && hasActiveGame && (
          <div className="text-yellow-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>No holdings to sell</span>
          </div>
        )}
        
        {/* Game paused warning */}
        {!isGameActive && (
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
        walletAddress={walletData.address || ''}
      />
      
      <WithdrawModal 
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        currentToken={currentToken}
        balance={currentToken === TokenType.SOL ? 
          (walletData.isConnected ? parseFloat(walletData.balance) : solBalance) : 
          ruggedBalance}
      />
    </div>
  );
};

export default TradingControls;