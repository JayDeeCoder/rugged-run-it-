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
  
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { wallet: gameWallet, walletData } = useEmbeddedGameWallet();
  
  const isWalletReady = authenticated && gameWallet !== undefined;

  // Use localStorage to remember user's preferred amount
  const [savedAmount, setSavedAmount] = useLocalStorage<string>('default-bet-amount', '0.01');
  const [amount, setAmount] = useState<string>(savedAmount);
  const [sellPercentage, setSellPercentage] = useState<number>(100);
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  
  // Mobile-specific states
  const [activeTab, setActiveTab] = useState<'bet' | 'cashout'>('bet');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  
  // Use localStorage for auto cashout settings
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  
  // Get context information
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

  // Handle automatic cashout
  const handleCashout = useCallback(() => {
    onSell(100);
  }, [onSell]);

  // Auto cashout effect
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

  // Quick amount buttons
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

  // Format token balance
  const formatBalance = (balance: number, token: TokenType) => {
    if (token === TokenType.SOL) {
      return balance.toFixed(3);
    } else {
      return balance.toFixed(0);
    }
  };

  // Get the active balance
  const activeBalance = currentToken === TokenType.SOL ? 
    (walletData.isConnected ? parseFloat(walletData.balance) : solBalance) : 
    ruggedBalance;

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="bg-[#0d0d0f] text-white border-3 border-gray-600 rounded-2xl p-5 mx-3 mb-5 shadow-2xl">
        {/* Token Balance Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-xl p-5 mb-5 border-2 border-gray-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 shadow-lg ${
                currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
              }`}>
                <span className="text-white font-bold text-sm">{currentToken === TokenType.SOL ? 'SOL' : 'RUG'}</span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-sm text-gray-400 font-medium">Balance</span>
                <span className={`text-xl font-bold ${
                  currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
                }`}>
                  {formatBalance(activeBalance, currentToken)} {currentToken}
                </span>
              </div>
            </div>
            
            {/* Token Switch Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => handleTokenChange(TokenType.SOL)}
                className={`px-5 py-3 text-sm rounded-xl font-bold transition-all shadow-md ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 text-white shadow-blue-500/50' 
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
                className={`px-5 py-3 text-sm rounded-xl font-bold transition-all shadow-md ${
                  currentToken === TokenType.RUGGED 
                    ? 'bg-green-600 text-white shadow-green-500/50' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                RUGGED
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-gray-800 rounded-xl p-2 mb-5 border-2 border-gray-600">
          <button
            onClick={() => setActiveTab('bet')}
            className={`flex-1 py-4 px-5 rounded-xl font-bold transition-all ${
              activeTab === 'bet' 
                ? 'bg-green-600 text-white shadow-lg transform scale-105' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <Coins className="inline mr-2 h-5 w-5" />
            Place Bet
          </button>
          <button
            onClick={() => setActiveTab('cashout')}
            className={`flex-1 py-4 px-5 rounded-xl font-bold transition-all ${
              activeTab === 'cashout' 
                ? 'bg-yellow-600 text-white shadow-lg transform scale-105' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <Sparkles className="inline mr-2 h-5 w-5" />
            Cash Out
          </button>
        </div>

        {/* Bet Tab Content */}
        {activeTab === 'bet' && (
          <div className="space-y-5">
            {/* Amount Input */}
            <div>
              <label className="block text-gray-300 text-sm mb-3 font-semibold">
                Bet Amount ({currentToken})
              </label>
              <div className="flex border-2 border-gray-600 rounded-xl overflow-hidden">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  className="flex-1 bg-gray-800 text-white px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0.00"
                  disabled={!isGameActive}
                />
                <button
                  onClick={() => setQuickAmount(activeBalance * 0.5)}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-4 font-semibold transition-colors border-l-2 border-gray-600"
                  disabled={!isGameActive}
                >
                  Half
                </button>
                <button
                  onClick={() => setQuickAmount(activeBalance)}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-4 font-semibold transition-colors border-l-2 border-gray-600"
                  disabled={!isGameActive}
                >
                  Max
                </button>
              </div>
            </div>
            
            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-2 gap-4">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setQuickAmount(amt)}
                  className={`py-4 px-5 text-sm rounded-xl font-bold transition-all border-2 shadow-md ${
                    parseFloat(amount) === amt
                      ? 'bg-green-600 text-white border-green-500 shadow-green-500/50 transform scale-105'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600 hover:border-gray-500'
                  }`}
                  disabled={!isGameActive}
                >
                  {amt} {currentToken}
                </button>
              ))}
            </div>
            
            {/* Main Buy Button */}
            <button
              onClick={handleBuy}
              disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
              className={`w-full py-5 px-6 rounded-2xl font-bold text-lg flex items-center justify-center transition-all border-3 shadow-lg ${
                isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                  : 'bg-green-600 hover:bg-green-700 text-white border-green-500 shadow-green-500/50 active:scale-95 hover:shadow-green-500/70'
              }`}
            >
              {isPlacingBet ? (
                <>
                  <div className="animate-spin h-6 w-6 border-3 border-white border-t-transparent rounded-full mr-3"></div>
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
          <div className="space-y-5">
            {/* Current Position Display */}
            {hasActiveGame && (
              <div className="bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border-2 border-yellow-500/70 rounded-xl p-5 shadow-lg">
                <div className="text-center">
                  <div className="text-sm text-gray-300 mb-2 font-medium">Current Multiplier</div>
                  <div className="text-3xl font-bold text-yellow-400 mb-3 shadow-text">{currentMultiplier.toFixed(2)}x</div>
                  <div className="text-sm text-gray-300">
                    Potential Profit: 
                    <span className="text-green-400 font-bold ml-2 text-lg">
                      +{((holdings) * (currentMultiplier - 1)).toFixed(currentToken === TokenType.SOL ? 3 : 0)} {currentToken}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Quick Cashout Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleSell(50)}
                disabled={!hasActiveGame || !isGameActive || holdings <= 0}
                className={`py-5 px-5 text-lg rounded-xl font-bold transition-all border-2 shadow-md ${
                  !hasActiveGame || !isGameActive || holdings <= 0
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500 shadow-yellow-500/50 active:scale-95 hover:shadow-yellow-500/70'
                }`}
              >
                Cash Out 50%
              </button>
              <button
                onClick={() => handleSell(100)}
                disabled={!hasActiveGame || !isGameActive || holdings <= 0}
                className={`py-5 px-5 text-lg rounded-xl font-bold transition-all border-2 shadow-md ${
                  !hasActiveGame || !isGameActive || holdings <= 0
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500 shadow-yellow-500/50 active:scale-95 hover:shadow-yellow-500/70'
                }`}
              >
                Cash Out All
              </button>
            </div>

            {/* Full Cashout Button */}
            <button
              onClick={() => handleSell(100)}
              disabled={isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive}
              className={`w-full py-5 px-6 rounded-2xl font-bold text-lg flex items-center justify-center transition-all border-3 shadow-lg ${
                isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500 shadow-yellow-500/50 active:scale-95 hover:shadow-yellow-500/70'
              }`}
            >
              {isCashingOut ? (
                <>
                  <div className="animate-spin h-6 w-6 border-3 border-white border-t-transparent rounded-full mr-3"></div>
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
        <div className="mt-6 border-t-2 border-gray-700 pt-5">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-gray-300 hover:text-white transition-colors py-3 px-2"
          >
            <span className="font-bold text-lg">Advanced Settings</span>
            {showAdvanced ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </button>
          
          {showAdvanced && (
            <div className="mt-4 space-y-4">
              {/* Auto Cashout Toggle */}
              <div className="bg-gray-800 rounded-xl p-4 border-2 border-gray-600">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-300 font-bold">Auto Cashout</span>
                  <div className="relative inline-block w-14 h-7">
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
                        className={`absolute h-5 w-5 mt-1 bg-white rounded-full transition-transform shadow-md ${
                          autoCashoutEnabled ? 'translate-x-8 ml-0' : 'translate-x-1'
                        }`} 
                      />
                    </label>
                  </div>
                </div>
                
                {autoCashoutEnabled && (
                  <>
                    <div className="flex mb-3 border-2 border-gray-600 rounded-xl overflow-hidden">
                      <input
                        type="text"
                        value={autoCashoutValue}
                        onChange={handleAutoCashoutValueChange}
                        className="flex-1 bg-gray-700 text-white px-4 py-3 focus:outline-none"
                        placeholder="2.00"
                      />
                      <span className="bg-gray-600 text-gray-300 px-4 py-3 font-bold">x</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {quickAutoCashoutValues.map((value) => (
                        <button
                          key={value}
                          onClick={() => setQuickAutoCashoutValue(value)}
                          className={`px-3 py-2 text-sm rounded-lg transition-all border-2 ${
                            parseFloat(autoCashoutValue) === value
                              ? 'bg-green-600 text-white border-green-500'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
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
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-blue-600/30 border-2 border-blue-600/60 hover:bg-blue-600/40 py-4 text-sm font-bold"
                  onClick={() => setShowDepositModal(true)}
                >
                  <ArrowDownLeft size={18} className="mr-1" />
                  Deposit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-yellow-600/30 border-2 border-yellow-600/60 hover:bg-yellow-600/40 py-4 text-sm font-bold"
                  onClick={() => setShowWithdrawModal(true)}
                >
                  <ArrowUpRight size={18} className="mr-1" />
                  Withdraw
                </Button>
                {currentToken === TokenType.RUGGED && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-green-600/30 border-2 border-green-600/60 hover:bg-green-600/40 py-4 text-sm font-bold"
                    onClick={() => setShowAirdropModal(true)}
                  >
                    <CoinsIcon size={18} className="mr-1" />
                    Airdrop
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Warning Messages */}
        <div className="mt-5 space-y-3">
          {!isWalletReady && (
            <div className="text-yellow-400 text-sm flex items-center bg-yellow-900/30 p-4 rounded-xl border-2 border-yellow-600/60">
              <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
              <span className="font-medium">Login to start playing</span>
            </div>
          )}
          
          {isWalletReady && parseFloat(amount) > activeBalance && (
            <div className="text-red-400 text-sm flex items-center bg-red-900/30 p-4 rounded-xl border-2 border-red-600/60">
              <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
              <span className="font-medium">Insufficient balance</span>
            </div>
          )}
          
          {!isGameActive && (
            <div className="text-orange-400 text-sm flex items-center bg-orange-900/30 p-4 rounded-xl border-2 border-orange-600/60">
              <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
              <span className="font-medium">Game paused. Waiting for next round.</span>
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

  // Desktop Layout (enhanced with better borders and padding)
  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-4 p-6 relative border-3 border-gray-600 rounded-xl shadow-2xl">
      {/* Token Switcher */}
      <div className="flex items-center justify-between bg-gray-800 hover:bg-gray-700 transition-colors rounded-xl p-4 cursor-pointer mb-3 border-2 border-gray-600">
        <div 
          className="flex items-center justify-between w-full"
          onClick={() => setShowDepositModal(true)}
        >
          <div className="flex items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 shadow-lg ${
              currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
            }`}>
              <span className="text-white font-bold text-sm">{currentToken === TokenType.SOL ? 'SOL' : 'RUG'}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-sm text-gray-400 font-medium">Balance</span>
              <span className={`text-lg font-bold ${
                currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
              }`}>
                {formatBalance(activeBalance, currentToken)} {currentToken}
              </span>
            </div>
          </div>
          
          {/* Token Switch Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTokenChange(TokenType.SOL);
              }}
              className={`px-4 py-2 text-sm rounded-lg font-bold border-2 transition-all ${
                currentToken === TokenType.SOL 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/50' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
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
              className={`px-4 py-2 text-sm rounded-lg font-bold border-2 transition-all ${
                currentToken === TokenType.RUGGED 
                  ? 'bg-green-600 text-white border-green-500 shadow-green-500/50' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
              }`}
            >
              RUGGED
            </button>
          </div>
        </div>
      </div>
      
      {/* Deposit/Withdraw Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Button
          variant="outline"
          size="sm"
          className="bg-blue-600/30 border-2 border-blue-600/60 hover:bg-blue-600/40 flex items-center justify-center py-3 font-bold"
          onClick={() => setShowDepositModal(true)}
        >
          <ArrowDownLeft size={16} className="mr-2" />
          Deposit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-yellow-600/30 border-2 border-yellow-600/60 hover:bg-yellow-600/40 flex items-center justify-center py-3 font-bold"
          onClick={() => setShowWithdrawModal(true)}
        >
          <ArrowUpRight size={16} className="mr-2" />
          Withdraw
        </Button>
      </div>
      
      {/* Get RUGGED tokens button */}
      {currentToken === TokenType.RUGGED && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mb-3 bg-green-600/30 border-2 border-green-600/60 hover:bg-green-600/40 flex items-center justify-center py-3 font-bold"
          onClick={() => setShowAirdropModal(true)}
        >
          <CoinsIcon size={16} className="mr-2" />
          Get RUGGED Tokens
        </Button>
      )}
      
      {/* Auto Cashout Settings */}
      <div className="mb-3">
        <div 
          className="flex justify-between items-center bg-gray-800 p-3 rounded-xl cursor-pointer border-2 border-gray-600 hover:border-gray-500 transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <div className="flex items-center">
            <div className={`h-4 w-4 rounded-full mr-3 ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
            <span className="text-gray-300 font-bold">Auto Cashout</span>
          </div>
          <div className="text-gray-400 text-sm font-medium">
            {autoCashoutEnabled ? `at ${autoCashoutValue}x` : 'Disabled'}
            <span className="ml-2">{showAdvanced ? '▲' : '▼'}</span>
          </div>
        </div>
        
        {showAdvanced && (
          <div className="bg-gray-800 p-4 rounded-xl mt-2 border-2 border-gray-600">
            <div className="flex items-center justify-between mb-3">
              <label className="text-gray-300 text-sm font-bold">Enable Auto Cashout</label>
              <div className="relative inline-block w-12 h-6">
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
                    className={`absolute h-4 w-4 mt-1 bg-white rounded-full transition-transform shadow-md ${
                      autoCashoutEnabled ? 'translate-x-6 ml-0' : 'translate-x-1'
                    }`} 
                  />
                </label>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-gray-300 text-sm mb-2 font-bold">
                Cashout at Multiplier
              </label>
              <div className="flex border-2 border-gray-600 rounded-xl overflow-hidden">
                <input
                  type="text"
                  value={autoCashoutValue}
                  onChange={handleAutoCashoutValueChange}
                  className="flex-1 bg-gray-700 text-white px-4 py-2 focus:outline-none"
                  placeholder="2.00"
                  disabled={!autoCashoutEnabled || !isGameActive}
                />
                <span className="bg-gray-600 text-gray-300 px-4 py-2 font-bold">x</span>
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {quickAutoCashoutValues.map((value) => (
                <button
                  key={value}
                  onClick={() => setQuickAutoCashoutValue(value)}
                  className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                    parseFloat(autoCashoutValue) === value
                      ? 'bg-green-600 text-white border-green-500'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
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
      <div className="border-t-2 border-gray-700 pt-4 mb-3">
        <h3 className="text-sm font-bold text-gray-400 mb-3">PLACE BET</h3>
        
        {/* Amount Input */}
        <div className="mb-3">
          <label className="block text-gray-400 text-sm mb-2 font-bold">
            Bet Amount ({currentToken})
          </label>
          <div className="flex border-2 border-gray-600 rounded-xl overflow-hidden">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="flex-1 bg-gray-800 text-white px-4 py-2 focus:outline-none"
              placeholder="0.00"
              disabled={!isGameActive}
            />
            <button
              onClick={() => setQuickAmount(activeBalance * 0.5)}
              className="bg-gray-700 text-gray-300 px-3 text-sm font-bold border-l-2 border-gray-600 hover:bg-gray-600 transition-colors"
              disabled={!isGameActive}
            >
              Half
            </button>
            <button
              onClick={() => setQuickAmount(activeBalance)}
              className="bg-gray-700 text-gray-300 px-3 text-sm font-bold border-l-2 border-gray-600 hover:bg-gray-600 transition-colors"
              disabled={!isGameActive}
            >
              Max
            </button>
          </div>
        </div>
        
        {/* Quick Amount Buttons */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setQuickAmount(amt)}
              className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                parseFloat(amount) === amt
                  ? 'bg-green-600 text-white border-green-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
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
          className={`w-full py-3 rounded-xl font-bold mb-3 flex items-center justify-center border-2 transition-all ${
            isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
              : 'bg-green-600 hover:bg-green-700 text-white border-green-500 shadow-green-500/50'
          }`}
        >
          {isPlacingBet ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
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
      <div className="border-t-2 border-gray-700 pt-4">
        <h3 className="text-sm font-bold text-gray-400 mb-3">CASH OUT</h3>
        
        {/* Sell Percentage Options */}
        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2 font-bold">
            Cash Out Percentage
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSellPercentage(25)}
              className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                sellPercentage === 25
                  ? 'bg-yellow-600 text-white border-yellow-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              25%
            </button>
            <button
              onClick={() => setSellPercentage(50)}
              className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                sellPercentage === 50
                  ? 'bg-yellow-600 text-white border-yellow-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              50%
            </button>
            <button
              onClick={() => setSellPercentage(75)}
              className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                sellPercentage === 75
                  ? 'bg-yellow-600 text-white border-yellow-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              75%
            </button>
            <button
              onClick={() => setSellPercentage(100)}
              className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                sellPercentage === 100
                  ? 'bg-yellow-600 text-white border-yellow-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
              }`}
              disabled={!hasActiveGame || !isGameActive}
            >
              100%
            </button>
          </div>
        </div>
        
        {/* Potential profit display */}
        {hasActiveGame && (
          <div className="bg-gray-800 p-3 rounded-xl text-center mb-4 border-2 border-gray-600">
            <span className="text-sm text-gray-400 font-medium">Potential profit at current multiplier:</span>
            <div className="text-lg font-bold text-yellow-400">
              +{((holdings * sellPercentage / 100) * (currentMultiplier - 1)).toFixed(currentToken === TokenType.SOL ? 3 : 0)} {currentToken}
            </div>
          </div>
        )}
        
        {/* Sell Button */}
        <button
          onClick={() => handleSell(sellPercentage)}
          disabled={isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0}
          className={`w-full py-3 rounded-xl font-bold flex items-center justify-center border-2 transition-all ${
            isCashingOut || !isWalletReady || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed border-gray-600'
              : 'bg-yellow-600 hover:bg-yellow-700 text-white border-yellow-500 shadow-yellow-500/50'
          }`}
        >
          {isCashingOut ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
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
      <div className="mt-2 space-y-2">
        {!isWalletReady && (
          <div className="text-yellow-500 text-sm flex items-center bg-yellow-900/20 p-3 rounded-lg border-2 border-yellow-600/50">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="font-medium">Login to play</span>
          </div>
        )}
        
        {isWalletReady && parseFloat(amount) > activeBalance && (
          <div className="text-red-500 text-sm flex items-center bg-red-900/20 p-3 rounded-lg border-2 border-red-600/50">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="font-medium">Insufficient balance</span>
          </div>
        )}
        
        {isWalletReady && holdings <= 0 && hasActiveGame && (
          <div className="text-yellow-500 text-sm flex items-center bg-yellow-900/20 p-3 rounded-lg border-2 border-yellow-600/50">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="font-medium">No holdings to sell</span>
          </div>
        )}
        
        {!isGameActive && (
          <div className="text-red-500 text-sm flex items-center bg-red-900/20 p-3 rounded-lg border-2 border-red-600/50">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="font-medium">Game paused. Waiting for next round.</span>
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