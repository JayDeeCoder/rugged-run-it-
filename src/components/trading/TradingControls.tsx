// src/components/trading/TradingControls.tsx
import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon, ChevronDown, Settings } from 'lucide-react';
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
import { AirdropModal, WithdrawModal } from './index';

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
  const [sellPercentage, setSellPercentage] = useState<number>(100); // Default to 100%
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  
  // Mobile UI states
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [showTokenSwitcher, setShowTokenSwitcher] = useState<boolean>(false);
  
  // Use localStorage for auto cashout settings to persist preferences
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  
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
    if (isMobile) {
      setShowTokenSwitcher(false);
    }
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

  // Quick amount buttons - different for SOL vs RUGGED
  const quickAmounts = currentToken === TokenType.SOL 
    ? (isMobile ? [0.01, 0.1, 0.5] : [0.01, 0.05, 0.1, 0.5])
    : (isMobile ? [10, 100, 500] : [10, 50, 100, 500]);

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
  const quickAutoCashoutValues = isMobile ? [2.0, 5.0] : [1.5, 2.0, 3.0, 5.0];

  // Set a quick autoCashout value
  const setQuickAutoCashoutValue = (value: number) => {
    setAutoCashoutValue(value.toString());
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
      
      {/* Token Balance Display - Simplified for Mobile */}
      <div className="bg-gray-800 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${
              currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
            }`}>
              <span className="text-white font-bold text-xs">{currentToken === TokenType.SOL ? 'SOL' : 'RUG'}</span>
            </div>
            <div>
              <div className="text-xs text-gray-400">Balance</div>
              <div className={`text-sm font-bold ${
                currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
              }`}>
                {formatBalance(activeBalance, currentToken)} {currentToken}
              </div>
            </div>
          </div>
          
          {/* Mobile: Collapsible Token Switcher */}
          {isMobile ? (
            <button
              onClick={() => setShowTokenSwitcher(!showTokenSwitcher)}
              className="flex items-center bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-md text-xs"
            >
              Switch <ChevronDown size={12} className={`ml-1 transition-transform ${showTokenSwitcher ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            // Desktop: Always visible token switches
            <div className="flex space-x-2">
              <button
                onClick={() => handleTokenChange(TokenType.SOL)}
                className={`px-3 py-1 text-xs rounded-md ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                SOL
              </button>
              <button
                onClick={() => {
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
          )}
        </div>
        
        {/* Mobile: Collapsible Token Options */}
        {isMobile && showTokenSwitcher && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleTokenChange(TokenType.SOL)}
                className={`px-3 py-2 text-sm rounded-md ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                SOL
              </button>
              <button
                onClick={() => {
                  handleTokenChange(TokenType.RUGGED);
                  if (ruggedBalance < 10) {
                    setShowAirdropModal(true);
                  }
                }}
                className={`px-3 py-2 text-sm rounded-md ${
                  currentToken === TokenType.RUGGED 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                RUGGED
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Auto Cashout - Always visible with current status */}
      <div className="bg-gray-800 rounded-lg p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`h-3 w-3 rounded-full mr-2 ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
            <span className="text-sm text-gray-300">Auto Cashout</span>
          </div>
          <div className="text-xs text-gray-400">
            {autoCashoutEnabled ? `${autoCashoutValue}x` : 'Off'}
          </div>
        </div>
      </div>
      
      {/* BETTING SECTION - Simplified */}
      <div className="bg-gray-900 rounded-lg p-3">
        <h3 className="text-sm font-bold text-white mb-3 text-center">PLACE BET</h3>
        
        {/* Amount Input - Mobile optimized */}
        <div className="mb-3">
          <div className="flex">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="flex-1 bg-gray-800 text-white px-3 py-3 rounded-l-md focus:outline-none text-center font-bold"
              placeholder="0.00"
              disabled={!isGameActive}
            />
            <div className="bg-gray-700 text-gray-300 px-3 py-3 rounded-r-md text-sm">
              {currentToken}
            </div>
          </div>
        </div>
        
        {/* Quick Amount Buttons - Responsive grid */}
        <div className={`grid gap-2 mb-3 ${isMobile ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setQuickAmount(amt)}
              className={`px-2 py-2 text-xs rounded-md transition-colors ${
                parseFloat(amount) === amt
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              disabled={!isGameActive}
            >
              {amt}
            </button>
          ))}
        </div>
        
        {/* Max/Half buttons */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setQuickAmount(activeBalance * 0.5)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 text-sm rounded-md"
            disabled={!isGameActive}
          >
            Half
          </button>
          <button
            onClick={() => setQuickAmount(activeBalance)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 text-sm rounded-md"
            disabled={!isGameActive}
          >
            Max
          </button>
        </div>
        
        {/* Buy Button - Prominent */}
        <button
          onClick={handleBuy}
          disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
          className={`w-full py-4 rounded-md font-bold text-lg flex items-center justify-center ${
            isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isPlacingBet ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
              Placing Bet...
            </>
          ) : (
            <>
              <Coins className="mr-2 h-6 w-6" />
              Place Bet
            </>
          )}
        </button>
      </div>
      
      {/* CASHOUT SECTION - Simplified */}
      <div className="bg-gray-900 rounded-lg p-3">
        <h3 className="text-sm font-bold text-white mb-3 text-center">CASH OUT</h3>
        
        {/* Potential profit display */}
        {hasActiveGame && (
          <div className="bg-gray-800 p-3 rounded-md text-center mb-3">
            <div className="text-xs text-gray-400 mb-1">Potential Profit</div>
            <div className="text-xl font-bold text-yellow-400">
              +{((holdings * sellPercentage / 100) * (currentMultiplier - 1)).toFixed(currentToken === TokenType.SOL ? 3 : 0)} {currentToken}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              at {currentMultiplier.toFixed(2)}x
            </div>
          </div>
        )}
        
        {/* Sell Percentage Options - Simplified for mobile */}
        <div className={`grid gap-2 mb-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
          {(isMobile ? [50, 100] : [25, 50, 75, 100]).map((percentage) => (
            <button
              key={percentage}
              onClick={() => setSellPercentage(percentage)}
              className={`px-2 py-2 text-sm rounded-md transition-colors ${
                sellPercentage === percentage
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              {percentage}%
            </button>
          ))}
        </div>
        
        {/* Sell Button - Prominent */}
        <button
          onClick={handleSell}
          disabled={isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0}
          className={`w-full py-4 rounded-md font-bold text-lg flex items-center justify-center ${
            isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-yellow-600 hover:bg-yellow-700 text-white'
          }`}
        >
          {isCashingOut ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
              Cashing Out...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-6 w-6" />
              Cash Out {sellPercentage}%
            </>
          )}
        </button>
      </div>

      {/* Advanced Settings - Collapsible */}
      <div className="border-t border-gray-800 pt-3">
        <button
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-700 p-2 rounded-md text-sm"
        >
          <div className="flex items-center">
            <Settings size={16} className="mr-2" />
            Advanced Settings
          </div>
          <ChevronDown size={16} className={`transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
        </button>
        
        {showAdvancedSettings && (
          <div className="mt-3 space-y-3">
            {/* Auto Cashout Settings */}
            <div className="bg-gray-800 p-3 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-300 text-sm">Auto Cashout</label>
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
              
              {autoCashoutEnabled && (
                <>
                  <div className="mb-2">
                    <div className="flex">
                      <input
                        type="text"
                        value={autoCashoutValue}
                        onChange={handleAutoCashoutValueChange}
                        className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-l-md focus:outline-none"
                        placeholder="2.00"
                        disabled={!isGameActive}
                      />
                      <span className="bg-gray-600 text-gray-300 px-3 py-2 rounded-r-md">x</span>
                    </div>
                  </div>
                  
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
                    {quickAutoCashoutValues.map((value) => (
                      <button
                        key={value}
                        onClick={() => setQuickAutoCashoutValue(value)}
                        className={`px-2 py-1 text-xs rounded-md ${
                          parseFloat(autoCashoutValue) === value
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                        disabled={!isGameActive}
                      >
                        {value.toFixed(1)}x
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Wallet Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-yellow-600/20 border-yellow-600/40 hover:bg-yellow-600/30 flex items-center justify-center"
                onClick={() => setShowWithdrawModal(true)}
              >
                <ArrowUpRight size={14} className="mr-1" />
                Withdraw
              </Button>
              
              {currentToken === TokenType.RUGGED && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-green-600/20 border-green-600/40 hover:bg-green-600/30 flex items-center justify-center"
                  onClick={() => setShowAirdropModal(true)}
                >
                  <CoinsIcon size={14} className="mr-1" />
                  Get Tokens
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Warning messages */}
      <div className="space-y-1 text-xs">
        {!isWalletReady && (
          <div className="text-yellow-500 flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Login to play</span>
          </div>
        )}
        
        {isWalletReady && parseFloat(amount) > activeBalance && (
          <div className="text-red-500 flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Insufficient balance</span>
          </div>
        )}
        
        {!isGameActive && (
          <div className="text-red-500 flex items-center">
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