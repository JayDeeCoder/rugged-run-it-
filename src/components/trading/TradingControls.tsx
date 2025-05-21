// src/components/trading/TradingControls.tsx
import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [sellPercentage, setSellPercentage] = useState<number>(100); // Default to 100%
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  
  // Mobile-specific states
  const [activeTab, setActiveTab] = useState<'bet' | 'cashout'>('bet');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  
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
  };

  // Handle automatic cashout with useCallback to prevent dependency issues
  const handleCashout = useCallback(() => {
    onSell(100);
  }, [onSell]);

  // Auto cashout effect - using useEffect with the correct dependencies
  useEffect(() => {
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

  // Handle buy button click
  const handleBuy = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    if (!isWalletReady) {
      toast.error('Please login to play');
      return;
    }
    
    onBuy(amountNum);
  };

  // Handle sell button click
  const handleSell = (percentage: number) => {
    onSell(percentage);
  };

  // Format token balance with appropriate precision
  const formatBalance = (balance: number, token: TokenType) => {
    if (token === TokenType.SOL) {
      return balance.toFixed(3);
    } else {
      return balance.toFixed(0);
    }
  };

  // Get the active balance based on wallet data
  const activeBalance = currentToken === TokenType.SOL ? 
    (walletData.isConnected ? parseFloat(walletData.balance) : solBalance) : 
    ruggedBalance;

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="bg-[#0d0d0f] text-white border-2 border-gray-700 rounded-xl p-4 mx-2 mb-4 shadow-lg">
        {/* Token Balance Header - Always Visible */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-lg p-4 mb-4 border border-gray-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
              }`}>
                <span className="text-white font-bold text-sm">{currentToken === TokenType.SOL ? 'SOL' : 'RUG'}</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-xs text-gray-400">Balance</span>
                <span className={`text-lg font-bold ${
                  currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
                }`}>
                  {formatBalance(activeBalance, currentToken)} {currentToken}
                </span>
              </div>
            </div>
            
            {/* Token Switch Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={() => handleTokenChange(TokenType.SOL)}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
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
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                  currentToken === TokenType.RUGGED 
                    ? 'bg-green-600 text-white shadow-lg' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                RUGGED
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-gray-800 rounded-lg p-1 mb-4 border border-gray-600">
          <button
            onClick={() => setActiveTab('bet')}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition-all ${
              activeTab === 'bet' 
                ? 'bg-green-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Coins className="inline mr-2 h-5 w-5" />
            Place Bet
          </button>
          <button
            onClick={() => setActiveTab('cashout')}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition-all ${
              activeTab === 'cashout' 
                ? 'bg-yellow-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="inline mr-2 h-5 w-5" />
            Cash Out
          </button>
        </div>

        {/* Bet Tab Content */}
        {activeTab === 'bet' && (
          <div className="space-y-4">
            {/* Amount Input - Larger for mobile */}
            <div>
              <label className="block text-gray-300 text-sm mb-2 font-medium">
                Bet Amount ({currentToken})
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  className="flex-1 bg-gray-800 text-white px-4 py-4 text-lg rounded-l-lg focus:outline-none focus:ring-2 focus:ring-green-500 border border-gray-600"
                  placeholder="0.00"
                  disabled={!isGameActive}
                />
                <button
                  onClick={() => setQuickAmount(activeBalance)}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-4 rounded-r-lg border border-l-0 border-gray-600 transition-colors"
                  disabled={!isGameActive}
                >
                  MAX
                </button>
              </div>
            </div>
            
            {/* Quick Amount Buttons - Larger for mobile */}
            <div className="grid grid-cols-2 gap-3">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setQuickAmount(amt)}
                  className={`py-3 px-4 text-sm rounded-lg font-medium transition-all border-2 ${
                    parseFloat(amount) === amt
                      ? 'bg-green-600 text-white border-green-500 shadow-lg'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
                  }`}
                  disabled={!isGameActive}
                >
                  {amt} {currentToken}
                </button>
              ))}
            </div>
            
            {/* Main Buy Button - Much larger for mobile */}
            <button
              onClick={handleBuy}
              disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
              className={`w-full py-4 px-6 rounded-xl font-bold text-lg flex items-center justify-center transition-all border-2 ${
                isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                  : 'bg-green-600 hover:bg-green-700 text-white border-green-500 shadow-lg active:scale-95'
              }`}
            >
              {isPlacingBet ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-3"></div>
                  Placing Bet...
                </>
              ) : (
                <>
                  <Coins className="mr-3 h-6 w-6" />
                  Place Bet
                </>
              )}
            </button>
          </div>
        )}

        {/* Cashout Tab Content */}
        {activeTab === 'cashout' && (
          <div className="space-y-4">
            {/* Current Position Display */}
            {hasActiveGame && (
              <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border border-yellow-600/50 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-sm text-gray-300 mb-1">Current Multiplier</div>
                  <div className="text-2xl font-bold text-yellow-400 mb-2">{currentMultiplier.toFixed(2)}x</div>
                  <div className="text-sm text-gray-300">
                    Potential Profit: 
                    <span className="text-green-400 font-bold ml-1">
                      +{((holdings) * (currentMultiplier - 1)).toFixed(currentToken === TokenType.SOL ? 3 : 0)} {currentToken}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Quick Cashout Buttons - Large for mobile */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleSell(50)}
                disabled={!hasActiveGame || !isGameActive || holdings <= 0}
                className={`py-4 px-4 text-lg rounded-lg font-bold transition-all border-2 ${
                  !hasActiveGame || !isGameActive || holdings <= 0
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500 shadow-lg active:scale-95'
                }`}
              >
                Cash Out 50%
              </button>
              <button
                onClick={() => handleSell(100)}
                disabled={!hasActiveGame || !isGameActive || holdings <= 0}
                className={`py-4 px-4 text-lg rounded-lg font-bold transition-all border-2 ${
                  !hasActiveGame || !isGameActive || holdings <= 0
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500 shadow-lg active:scale-95'
                }`}
              >
                Cash Out All
              </button>
            </div>

            {/* Full Cashout Button */}
            <button
              onClick={() => handleSell(100)}
              disabled={isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive}
              className={`w-full py-4 px-6 rounded-xl font-bold text-lg flex items-center justify-center transition-all border-2 ${
                isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500 shadow-lg active:scale-95'
              }`}
            >
              {isCashingOut ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-3"></div>
                  Cashing Out...
                </>
              ) : (
                <>
                  <Sparkles className="mr-3 h-6 w-6" />
                  Cash Out Now
                </>
              )}
            </button>
          </div>
        )}

        {/* Advanced Settings Collapsible */}
        <div className="mt-4 border-t border-gray-700 pt-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-gray-300 hover:text-white transition-colors py-2"
          >
            <span className="font-medium">Advanced Settings</span>
            {showAdvanced ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              {/* Auto Cashout Toggle */}
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-300 font-medium">Auto Cashout</span>
                  <div className="relative inline-block w-12 h-6">
                    <input
                      type="checkbox"
                      id="auto-cashout-mobile"
                      checked={autoCashoutEnabled}
                      onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                      className="opacity-0 absolute w-0 h-0"
                    />
                    <label 
                      htmlFor="auto-cashout-mobile"
                      className={`absolute cursor-pointer top-0 left-0 right-0 bottom-0 rounded-full transition-colors ${
                        autoCashoutEnabled ? 'bg-green-600' : 'bg-gray-600'
                      }`}
                    >
                      <span 
                        className={`absolute h-4 w-4 mt-1 bg-white rounded-full transition-transform ${
                          autoCashoutEnabled ? 'translate-x-7 ml-0' : 'translate-x-1'
                        }`} 
                      />
                    </label>
                  </div>
                </div>
                
                {autoCashoutEnabled && (
                  <>
                    <div className="flex mb-2">
                      <input
                        type="text"
                        value={autoCashoutValue}
                        onChange={handleAutoCashoutValueChange}
                        className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-l-lg focus:outline-none border border-gray-600"
                        placeholder="2.00"
                      />
                      <span className="bg-gray-600 text-gray-300 px-3 py-2 rounded-r-lg border border-l-0 border-gray-600">x</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {quickAutoCashoutValues.map((value) => (
                        <button
                          key={value}
                          onClick={() => setQuickAutoCashoutValue(value)}
                          className={`px-2 py-1 text-xs rounded-md transition-all ${
                            parseFloat(autoCashoutValue) === value
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {value.toFixed(1)}x
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Wallet Actions */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-blue-600/20 border-blue-600/40 hover:bg-blue-600/30 py-3"
                  onClick={() => setShowDepositModal(true)}
                >
                  <ArrowDownLeft size={16} className="mr-1" />
                  Deposit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-yellow-600/20 border-yellow-600/40 hover:bg-yellow-600/30 py-3"
                  onClick={() => setShowWithdrawModal(true)}
                >
                  <ArrowUpRight size={16} className="mr-1" />
                  Withdraw
                </Button>
                {currentToken === TokenType.RUGGED && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-green-600/20 border-green-600/40 hover:bg-green-600/30 py-3"
                    onClick={() => setShowAirdropModal(true)}
                  >
                    <CoinsIcon size={16} className="mr-1" />
                    Airdrop
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Warning Messages */}
        <div className="mt-4 space-y-2">
          {!isWalletReady && (
            <div className="text-yellow-400 text-sm flex items-center bg-yellow-900/20 p-3 rounded-lg border border-yellow-600/50">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>Login to start playing</span>
            </div>
          )}
          
          {isWalletReady && parseFloat(amount) > activeBalance && (
            <div className="text-red-400 text-sm flex items-center bg-red-900/20 p-3 rounded-lg border border-red-600/50">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>Insufficient balance</span>
            </div>
          )}
          
          {!isGameActive && (
            <div className="text-orange-400 text-sm flex items-center bg-orange-900/20 p-3 rounded-lg border border-orange-600/50">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
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
  }

  // Desktop Layout (existing code)
  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-3 p-6 relative border-2 border-gray-700 rounded-lg shadow-lg">
      {/* Token Switcher */}
      <div className="flex items-center justify-between bg-gray-800 hover:bg-gray-700 transition-colors rounded-lg p-3 cursor-pointer mb-2 border border-gray-600">
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
          className="flex justify-between items-center bg-gray-800 p-2 rounded-md cursor-pointer border border-gray-600"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <div className="flex items-center">
            <div className={`h-3 w-3 rounded-full mr-2 ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
            <span className="text-gray-300">Auto Cashout</span>
          </div>
          <div className="text-gray-400 text-sm">
            {autoCashoutEnabled ? `at ${autoCashoutValue}x` : 'Disabled'}
            <span className="ml-2">{showAdvanced ? '▲' : '▼'}</span>
          </div>
        </div>
        
        {showAdvanced && (
          <div className="bg-gray-800 p-3 rounded-md mt-1 border border-gray-600">
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
                  className="flex-1 bg-gray-700 text-white px-3 py-1 rounded-l-md focus:outline-none border border-gray-600"
                  placeholder="2.00"
                  disabled={!autoCashoutEnabled || !isGameActive}
                />
                <span className="bg-gray-600 text-gray-300 px-3 py-1 rounded-r-md border border-l-0 border-gray-600">x</span>
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
      <div className="border-t border-gray-700 pt-3 mb-2">
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
              className="flex-1 bg-gray-800 text-white px-3 py-1 rounded-l-md focus:outline-none border border-gray-600"
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
          className={`w-full py-2 rounded-md font-bold mb-2 flex items-center justify-center border ${
            isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
              : 'bg-green-600 hover:bg-green-700 text-white border-green-500'
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
      <div className="border-t border-gray-700 pt-3">
        <h3 className="text-sm font-bold text-gray-400 mb-2">CASH OUT</h3>
        
        {/* Sell Percentage Options */}
        <div className="mb-3">
          <label className="block text-gray-400 text-xs mb-1">
            Cash Out Percentage
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSellPercentage(25)}
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
              onClick={() => setSellPercentage(50)}
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
              onClick={() => setSellPercentage(75)}
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
              onClick={() => setSellPercentage(100)}
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
          <div className="bg-gray-800 p-2 rounded-md text-center mb-3 border border-gray-600">
            <span className="text-xs text-gray-400">Potential profit at current multiplier:</span>
            <div className="text-lg font-bold text-yellow-400">
              +{((holdings * sellPercentage / 100) * (currentMultiplier - 1)).toFixed(currentToken === TokenType.SOL ? 3 : 0)} {currentToken}
            </div>
          </div>
        )}
        
        {/* Sell Button */}
        <button
          onClick={() => handleSell(sellPercentage)}
          disabled={isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0}
          className={`w-full py-2 rounded-md font-bold flex items-center justify-center border ${
            isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
              : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500'
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
        {!isWalletReady && (
          <div className="text-yellow-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Login to play</span>
          </div>
        )}
        
        {isWalletReady && parseFloat(amount) > activeBalance && (
          <div className="text-red-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>Insufficient balance</span>
          </div>
        )}
        
        {isWalletReady && holdings <= 0 && hasActiveGame && (
          <div className="text-yellow-500 text-xs flex items-center">
            <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
            <span>No holdings to sell</span>
          </div>
        )}
        
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