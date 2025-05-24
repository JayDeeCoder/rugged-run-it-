// src/components/trading/TradingControls.tsx
import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon, Settings, TrendingUp } from 'lucide-react';
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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  
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

  // Calculate potential profit
  const potentialProfit = hasActiveBet ? (parseFloat(amount) * activeCurrentMultiplier) - parseFloat(amount) : 0;
  const potentialTotal = hasActiveBet ? parseFloat(amount) * activeCurrentMultiplier : 0;

  // 🎮 ENHANCED MOBILE UI - More Ergonomic
  if (isMobile) {
    return (
      <div className="bg-[#0d0d0f] text-white p-4 border border-gray-800 rounded-lg space-y-4">
        {/* Top Status Bar - Compact */}
        <div className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium">{isConnected ? 'Connected' : 'Offline'}</span>
          </div>
          {activeCurrentGame && (
            <div className="text-right">
              <div className="text-xs text-gray-400">Game #{activeCurrentGame.gameNumber}</div>
              <div className="text-lg font-bold text-yellow-400">{activeCurrentGame.multiplier.toFixed(2)}x</div>
            </div>
          )}
        </div>

        {/* Balance Display - Prominent */}
        <div className="bg-gradient-to-r from-blue-900/30 to-blue-800/30 p-4 rounded-lg border border-blue-700/30">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-blue-300 mb-1">Your Balance</div>
              <div className="text-xl font-bold text-blue-400">
                {formatBalance(activeBalance, currentToken)} {currentToken}
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTokenChange(TokenType.SOL);
                }}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                SOL
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTokenChange(TokenType.RUGGED);
                }}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${
                  currentToken === TokenType.RUGGED 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                RUGGED
              </button>
            </div>
          </div>
        </div>

        {/* Active Bet Display - When betting */}
        {hasActiveBet && (
          <div className="bg-gradient-to-r from-yellow-900/40 to-orange-900/40 p-4 rounded-lg border border-yellow-600/30">
            <div className="text-center space-y-2">
              <div className="text-sm text-yellow-300">Your Active Bet</div>
              <div className="text-2xl font-bold text-yellow-400">{parseFloat(amount).toFixed(3)} SOL</div>
              <div className="space-y-1">
                <div className="text-sm text-orange-300">Potential Win</div>
                <div className="text-xl font-bold text-orange-400">{potentialTotal.toFixed(3)} SOL</div>
                <div className="text-sm text-green-400">Profit: +{potentialProfit.toFixed(3)} SOL</div>
              </div>
            </div>
          </div>
        )}

        {/* Main Action Area */}
        {!hasActiveBet ? (
          <div className="space-y-4">
            {/* Bet Amount Input - Large and Touch-Friendly */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">Bet Amount</label>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  className="w-full bg-gray-800 text-white px-4 py-4 text-xl font-bold text-center rounded-xl border border-gray-600 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                  placeholder="0.00"
                  disabled={!activeIsGameActive}
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 font-medium">
                  {currentToken}
                </div>
              </div>
            </div>

            {/* Quick Amount Buttons - Large Touch Targets */}
            <div className="grid grid-cols-4 gap-3">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setQuickAmount(amt)}
                  className={`py-3 px-2 text-sm font-medium rounded-lg transition-all ${
                    parseFloat(amount) === amt
                      ? 'bg-green-600 text-white shadow-lg scale-105'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:scale-95'
                  }`}
                  disabled={!activeIsGameActive}
                >
                  {amt}
                </button>
              ))}
            </div>

            {/* Place Bet Button - Extra Large and Prominent */}
            <button
              onClick={handleBuy}
              disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
              className={`w-full py-5 rounded-xl font-bold text-xl transition-all duration-200 ${
                isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white shadow-lg hover:shadow-xl active:scale-98'
              }`}
            >
              {isPlacingBet ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Placing Bet...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3">
                  <Coins className="h-6 w-6" />
                  <span>Place Bet</span>
                </div>
              )}
            </button>
          </div>
        ) : (
          /* Cash Out Mode - Extra Prominent */
          <div className="space-y-4">
            <button
              onClick={handleSell}
              disabled={isCashingOut || !isConnected || !activeIsGameActive}
              className={`w-full py-6 rounded-xl font-bold text-xl transition-all duration-200 ${
                isCashingOut || !isConnected || !activeIsGameActive
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400 text-white shadow-lg hover:shadow-xl active:scale-98 animate-pulse'
              }`}
            >
              {isCashingOut ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Cashing Out...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3">
                  <Sparkles className="h-6 w-6" />
                  <span>Cash Out ({activeCurrentMultiplier.toFixed(2)}x)</span>
                </div>
              )}
            </button>
          </div>
        )}

        {/* Advanced Settings - Collapsible */}
        <div className="border-t border-gray-700 pt-4">
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="flex items-center justify-between w-full p-3 bg-gray-800/50 rounded-lg text-sm"
          >
            <div className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Advanced Settings</span>
            </div>
            <span className="text-gray-400">{showAdvancedSettings ? '▲' : '▼'}</span>
          </button>

          {showAdvancedSettings && (
            <div className="mt-3 space-y-3">
              {/* Auto Cashout */}
              <div className="bg-gray-800/30 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Auto Cashout</span>
                  <div className="relative inline-block w-10 h-5">
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
                        className={`absolute h-3 w-3 mt-1 bg-white rounded-full transition-transform ${
                          autoCashoutEnabled ? 'translate-x-5' : 'translate-x-1'
                        }`} 
                      />
                    </label>
                  </div>
                </div>
                {autoCashoutEnabled && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={autoCashoutValue}
                      onChange={handleAutoCashoutValueChange}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-md text-center"
                      placeholder="2.00"
                    />
                    <div className="grid grid-cols-4 gap-2">
                      {quickAutoCashoutValues.map((value) => (
                        <button
                          key={value}
                          onClick={() => setQuickAutoCashoutValue(value)}
                          className={`py-1 text-xs rounded-md ${
                            parseFloat(autoCashoutValue) === value
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          {value}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Wallet Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowDepositModal(true)}
                  className="flex items-center justify-center space-x-2 bg-blue-600/20 border border-blue-600/40 py-3 rounded-lg text-sm"
                >
                  <ArrowDownLeft size={16} />
                  <span>Deposit</span>
                </button>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="flex items-center justify-center space-x-2 bg-yellow-600/20 border border-yellow-600/40 py-3 rounded-lg text-sm"
                >
                  <ArrowUpRight size={16} />
                  <span>Withdraw</span>
                </button>
              </div>

              {currentToken === TokenType.RUGGED && (
                <button
                  onClick={() => setShowAirdropModal(true)}
                  className="w-full flex items-center justify-center space-x-2 bg-green-600/20 border border-green-600/40 py-3 rounded-lg text-sm"
                >
                  <CoinsIcon size={16} />
                  <span>Get RUGGED Tokens</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Status Messages */}
        {(!isWalletReady || !isConnected || !activeIsGameActive) && (
          <div className="text-center text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded-lg">
            {!isWalletReady ? 'Login to play' : 
             !isConnected ? 'Connecting...' : 
             'Waiting for next round'}
          </div>
        )}

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
  }

  // 🖥️ ENHANCED DESKTOP UI - Full Featured
  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-4 p-4 relative border border-gray-800 rounded-lg">
      {/* Connection Status */}
      <div className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg">
        <div className="flex items-center space-x-2">
          <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm">Connection:</span>
        </div>
        <span className={`px-3 py-1 rounded-md text-xs font-medium ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Game Info */}
      {activeCurrentGame && (
        <div className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 p-4 rounded-lg border border-gray-700/50">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-300 font-medium">Game #{activeCurrentGame.gameNumber}</span>
            <span className="text-2xl font-bold text-yellow-400">{activeCurrentGame.multiplier.toFixed(2)}x</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Bets:</span>
              <span className="text-white font-medium">{activeCurrentGame.totalBets.toFixed(3)} SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Players:</span>
              <span className="text-white font-medium">{activeCurrentGame.totalPlayers}</span>
            </div>
          </div>
        </div>
      )}

      {/* Token Switcher & Balance */}
      <div className="bg-gradient-to-r from-blue-900/20 to-blue-800/20 p-4 rounded-lg border border-blue-700/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
            }`}>
              <span className="text-white font-bold text-sm">{currentToken === TokenType.SOL ? 'SOL' : 'RUG'}</span>
            </div>
            
            <div>
              <div className="text-xs text-gray-400">Balance</div>
              <div className={`text-lg font-bold ${
                currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
              }`}>
                {formatBalance(activeBalance, currentToken)} {currentToken}
              </div>
            </div>
          </div>
          
          {/* Token Switch Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={() => handleTokenChange(TokenType.SOL)}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                currentToken === TokenType.SOL 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              SOL
            </button>
            <button
              onClick={() => handleTokenChange(TokenType.RUGGED)}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
                currentToken === TokenType.RUGGED 
                  ? 'bg-green-600 text-white shadow-lg' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              RUGGED
            </button>
          </div>
        </div>
      </div>
      
      {/* Wallet Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="sm"
          className="bg-blue-600/20 border-blue-600/40 hover:bg-blue-600/30 flex items-center justify-center py-3"
          onClick={() => setShowDepositModal(true)}
        >
          <ArrowDownLeft size={16} className="mr-2" />
          Deposit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-yellow-600/20 border-yellow-600/40 hover:bg-yellow-600/30 flex items-center justify-center py-3"
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
          className="w-full bg-green-600/20 border-green-600/40 hover:bg-green-600/30 flex items-center justify-center py-3"
          onClick={() => setShowAirdropModal(true)}
        >
          <CoinsIcon size={16} className="mr-2" />
          Get RUGGED Tokens
        </Button>
      )}
      
      {/* Auto Cashout Settings */}
      <div className="border border-gray-700/50 rounded-lg">
        <div 
          className="flex justify-between items-center bg-gray-800/30 p-3 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-colors"
          onClick={() => setShowAutoCashout(!showAutoCashout)}
        >
          <div className="flex items-center space-x-3">
            <div className={`h-3 w-3 rounded-full ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
            <span className="text-gray-300 font-medium">Auto Cashout</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-gray-400 text-sm">
              {autoCashoutEnabled ? `at ${autoCashoutValue}x` : 'Disabled'}
            </span>
            <span className="text-gray-400">{showAutoCashout ? '▲' : '▼'}</span>
          </div>
        </div>
        
        {showAutoCashout && (
          <div className="bg-gray-800/30 p-4 rounded-b-lg border-t border-gray-700/50">
            <div className="flex items-center justify-between mb-3">
              <label className="text-gray-300 font-medium">Enable Auto Cashout</label>
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
                    className={`absolute h-4 w-4 mt-1 bg-white rounded-full transition-transform ${
                      autoCashoutEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} 
                  />
                </label>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-gray-300 text-sm mb-2 font-medium">
                Cashout at Multiplier
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={autoCashoutValue}
                  onChange={handleAutoCashoutValueChange}
                  className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  placeholder="2.00"
                  disabled={!autoCashoutEnabled}
                />
                <span className="bg-gray-600 text-gray-300 px-3 py-2 rounded-r-lg font-medium">x</span>
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {quickAutoCashoutValues.map((value) => (
                <button
                  key={value}
                  onClick={() => setQuickAutoCashoutValue(value)}
                  className={`px-3 py-2 text-sm rounded-lg font-medium transition-all ${
                    parseFloat(autoCashoutValue) === value
                      ? 'bg-green-600 text-white shadow-lg'
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
      
      {/* ENHANCED BETTING SECTION */}
      <div className="border-t border-gray-700 pt-4">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp className="h-5 w-5 text-green-400" />
          <h3 className="text-lg font-bold text-green-400">PLACE BET</h3>
        </div>
        
        {/* Potential Profit Display - Prominent */}
        {hasActiveBet && (
          <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 p-4 rounded-lg mb-4 border border-green-600/30">
            <div className="text-center space-y-2">
              <div className="text-sm text-green-300">Your Active Bet</div>
              <div className="text-xl font-bold text-green-400">{parseFloat(amount).toFixed(3)} SOL</div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <div className="text-xs text-gray-400">Potential Total</div>
                  <div className="text-lg font-bold text-yellow-400">{potentialTotal.toFixed(3)} SOL</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Profit</div>
                  <div className="text-lg font-bold text-green-400">+{potentialProfit.toFixed(3)} SOL</div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2 font-medium">
            Bet Amount ({currentToken})
          </label>
          <div className="flex">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 text-lg font-bold"
              placeholder="0.00"
              disabled={!activeIsGameActive || hasActiveBet}
            />
            <button
              onClick={() => setQuickAmount(activeBalance * 0.5)}
              className="bg-gray-700 text-gray-300 px-3 text-sm border-l border-gray-600 hover:bg-gray-600 transition-colors"
              disabled={!activeIsGameActive || hasActiveBet}
            >
              50%
            </button>
            <button
              onClick={() => setQuickAmount(activeBalance)}
              className="bg-gray-700 text-gray-300 px-3 text-sm rounded-r-lg hover:bg-gray-600 transition-colors"
              disabled={!activeIsGameActive || hasActiveBet}
            >
              MAX
            </button>
          </div>
        </div>
        
        {/* Quick Amount Buttons */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setQuickAmount(amt)}
              className={`px-3 py-3 text-sm rounded-lg font-medium transition-all ${
                parseFloat(amount) === amt
                  ? 'bg-green-600 text-white shadow-lg scale-105'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:scale-95'
              }`}
              disabled={!activeIsGameActive || hasActiveBet}
            >
              {amt.toString()} {currentToken}
            </button>
          ))}
        </div>
        
        {/* Main Action Button */}
        {!hasActiveBet ? (
          <button
            onClick={handleBuy}
            disabled={isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
            className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center space-x-3 transition-all duration-200 ${
              isPlacingBet || !isWalletReady || parseFloat(amount) > activeBalance || !activeIsGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white shadow-lg hover:shadow-xl active:scale-98'
            }`}
          >
            {isPlacingBet ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Placing Bet...</span>
              </>
            ) : (
              <>
                <Coins className="h-6 w-6" />
                <span>Place Bet</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleSell}
            disabled={isCashingOut || !isConnected || !activeIsGameActive}
            className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center space-x-3 transition-all duration-200 ${
              isCashingOut || !isConnected || !activeIsGameActive
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400 text-white shadow-lg hover:shadow-xl active:scale-98 animate-pulse'
            }`}
          >
            {isCashingOut ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Cashing Out...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-6 w-6" />
                <span>Cash Out ({activeCurrentMultiplier.toFixed(2)}x)</span>
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Status Messages */}
      <div className="space-y-2">
        {!isWalletReady && (
          <div className="text-yellow-500 text-sm flex items-center bg-yellow-900/20 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Login to play</span>
          </div>
        )}
        
        {isWalletReady && !isConnected && (
          <div className="text-red-500 text-sm flex items-center bg-red-900/20 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Connecting to game server...</span>
          </div>
        )}
        
        {isWalletReady && parseFloat(amount) > activeBalance && (
          <div className="text-red-500 text-sm flex items-center bg-red-900/20 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Insufficient balance</span>
          </div>
        )}
        
        {!activeIsGameActive && (
          <div className="text-orange-500 text-sm flex items-center bg-orange-900/20 p-3 rounded-lg">
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