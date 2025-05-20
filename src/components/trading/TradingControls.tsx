import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import useLocalStorage from '../../hooks/useLocalStorage';
import { UserContext } from '../../context/UserContext';
import { TradeContext } from '../../context/TradeContext';
import { useGameContext } from '../../context/GameContext';

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
  // Use localStorage to remember user's preferred amount
  const [savedAmount, setSavedAmount] = useLocalStorage<string>('default-bet-amount', '0.01');
  const [amount, setAmount] = useState<string>(savedAmount);
  const [sellAmount, setSellAmount] = useState<string>('');
  const [sellPercentage, setSellPercentage] = useState<number>(100); // Default to 100%
  
  // Auto-cashout settings
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  
  // Get context information
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { currentUser } = useContext(UserContext);
  const { placeOrder } = useContext(TradeContext);

  // Update local amount state when saved amount changes
  useEffect(() => {
    setAmount(savedAmount);
  }, [savedAmount]);

  // Handle automatic cashout
  const handleCashout = useCallback(() => {
    onSell(100);
  }, [onSell]);

  // Auto cashout effect
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
    // Allow only numbers and up to 6 decimal places
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setAmount(value);
      if (value !== '') {
        setSavedAmount(value);
      }
    }
  };

  // Handle sell amount change
  const handleSellAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and up to 6 decimal places
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setSellAmount(value);
      
      // Update the percentage based on the entered amount
      if (value !== '' && hasActiveGame && holdings > 0) {
        const parsedValue = parseFloat(value);
        const maxCashout = holdings;
        if (!isNaN(parsedValue) && maxCashout > 0) {
          const calculatedPercentage = Math.min((parsedValue / maxCashout) * 100, 100);
          setSellPercentage(Math.round(calculatedPercentage));
        }
      }
    }
  };

  // Quick amount buttons - fewer for mobile
  const quickAmounts = isMobile ? [0.01, 0.1] : [0.01, 0.05, 0.1, 0.5];

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

  // Quick auto-cashout values - fewer for mobile
  const quickAutoCashoutValues = isMobile ? [1.5, 3.0] : [1.5, 2.0, 3.0, 5.0];

  // Set a quick auto-cashout value
  const setQuickAutoCashoutValue = (value: number) => {
    setAutoCashoutValue(value.toString());
  };

  // Set sell percentage and update sell amount
  const handleSetSellPercentage = (percentage: number) => {
    setSellPercentage(percentage);
    
    // Update sell amount based on percentage
    if (hasActiveGame && holdings > 0) {
      const calculatedAmount = (holdings * percentage / 100).toFixed(6);
      setSellAmount(calculatedAmount);
    }
  };

  // Handle buy button click
  const handleBuy = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return;
    }
    
    // Call the buy function
    onBuy(amountNum);
  };

  // Handle sell button click
  const handleSell = () => {
    if (isNaN(sellPercentage) || sellPercentage <= 0) {
      return;
    }
    
    // Call the sell function
    onSell(sellPercentage);
  };

  // COMPACT MOBILE UI
  if (isMobile) {
    return (
      <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-2 p-3 relative border border-gray-800 rounded-lg">
        {/* Balance display */}
        <div className="flex justify-between items-center mb-1">
          <div className="text-sm">
            <span className="text-gray-400">Balance:</span>
            <span className="ml-1 text-green-400 font-bold">{walletBalance.toFixed(3)}</span>
          </div>
          
          {hasActiveGame && (
            <div className="text-sm">
              <span className="text-gray-400">Profit:</span>
              <span className="ml-1 text-yellow-400 font-bold">
                {(holdings * (currentMultiplier - 1)).toFixed(3)}
              </span>
            </div>
          )}
        </div>
        
        {/* Auto Cashout toggle */}
        <div 
          className="flex justify-between items-center bg-gray-800 p-2 rounded-md mb-1 cursor-pointer"
          onClick={() => setShowAutoCashout(!showAutoCashout)}
        >
          <div className="flex items-center text-sm">
            <div className={`h-2 w-2 rounded-full mr-2 ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
            <span className="text-gray-300">Auto @ {autoCashoutValue}x</span>
          </div>
          <div className="text-xs text-gray-400">
            {showAutoCashout ? '▲' : '▼'}
          </div>
        </div>
        
        {/* Auto Cashout settings (collapsible) */}
        {showAutoCashout && (
          <div className="bg-gray-800 p-2 rounded-md mb-1">
            <div className="flex items-center justify-between mb-1">
              <label className="text-gray-300 text-xs">Enable</label>
              <div className="relative inline-block w-8 h-4">
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
                    className={`absolute h-3 w-3 mt-0.5 bg-white rounded-full transition-transform ${
                      autoCashoutEnabled ? 'translate-x-4 ml-0' : 'translate-x-0.5'
                    }`} 
                  />
                </label>
              </div>
            </div>
            
            <div className="flex gap-1 mb-1">
              <input
                type="text"
                value={autoCashoutValue}
                onChange={handleAutoCashoutValueChange}
                className="flex-1 bg-gray-700 text-white px-2 py-1 text-sm rounded-l-md focus:outline-none"
                placeholder="2.00"
                disabled={!autoCashoutEnabled}
              />
              <span className="bg-gray-600 text-gray-300 px-2 py-1 text-sm rounded-r-md">x</span>
            </div>
            
            <div className="grid grid-cols-2 gap-1">
              {quickAutoCashoutValues.map((value) => (
                <button
                  key={value}
                  onClick={() => setQuickAutoCashoutValue(value)}
                  className={`px-2 py-1 text-xs rounded-md ${
                    parseFloat(autoCashoutValue) === value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                  disabled={!autoCashoutEnabled}
                >
                  {value.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Bet input group */}
        <div className="grid grid-cols-3 gap-1 mb-1">
          <input
            type="text"
            value={amount}
            onChange={handleAmountChange}
            className="col-span-2 bg-gray-800 text-white px-3 py-2 rounded-l-md focus:outline-none"
            placeholder="0.00"
            disabled={!isGameActive}
          />
          <button
            onClick={() => setQuickAmount(walletBalance)}
            className="bg-gray-700 text-gray-300 px-2 rounded-r-md text-sm"
            disabled={!isGameActive}
          >
            Max
          </button>
        </div>
        
        {/* Quick amount buttons */}
        <div className="grid grid-cols-2 gap-1 mb-1">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setQuickAmount(amt)}
              className={`px-2 py-1 text-xs rounded-md ${
                parseFloat(amount) === amt
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}
              disabled={!isGameActive}
            >
              {amt.toString()} SOL
            </button>
          ))}
        </div>
        
        {/* Buy/Sell buttons */}
        <div className="grid grid-cols-5 gap-1">
          <button
            onClick={handleBuy}
            disabled={isPlacingBet || !connected || parseFloat(amount) > walletBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
            className={`col-span-2 py-2 rounded-md font-bold flex items-center justify-center ${
              isPlacingBet || !connected || parseFloat(amount) > walletBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
                ? 'bg-gray-700 text-gray-500'
                : 'bg-green-600 text-white'
            }`}
          >
            {isPlacingBet ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
            ) : (
              'Bet'
            )}
          </button>
          
          <button
            onClick={() => handleSetSellPercentage(100)}
            disabled={!hasActiveGame || !isGameActive}
            className={`py-1 rounded-md text-xs ${
              !hasActiveGame || !isGameActive
                ? 'bg-gray-700 text-gray-500'
                : 'bg-blue-600 text-white'
            }`}
          >
            100%
          </button>
          
          <button
            onClick={handleSell}
            disabled={isCashingOut || !connected || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0}
            className={`col-span-2 py-2 rounded-md font-bold flex items-center justify-center ${
              isCashingOut || !connected || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0
                ? 'bg-gray-700 text-gray-500'
                : 'bg-yellow-600 text-white'
            }`}
          >
            {isCashingOut ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
            ) : (
              'Cash'
            )}
          </button>
        </div>
      </div>
    );
  }

  // DESKTOP UI - SIMPLIFIED VERSION (removed problematic imports)
  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-3 p-4 relative border border-gray-800 rounded-lg">
      {/* Wallet Actions - Deposit & Withdraw */}
      <div className="flex justify-between mb-1">
        <button 
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-sm flex items-center"
          onClick={() => {/* Handle deposit */}}
        >
          <span className="mr-1">↓</span> Deposit
        </button>
        
        <button 
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-md text-sm border border-gray-600 flex items-center"
          onClick={() => {/* Handle withdraw */}}
        >
          <span className="mr-1">↑</span> Withdraw
        </button>
      </div>
      
      {/* Balance section */}
      <div className="bg-gray-800 p-3 rounded-md mb-1">
        <div className="text-gray-400 text-sm">Wallet Balance</div>
        <div className="text-xl font-bold text-green-400">
          {walletBalance.toFixed(3)} SOL
        </div>
      </div>
      
      {/* Current multiplier display */}
      <div className="bg-gray-800 p-3 rounded-md mb-1">
        <div className="text-gray-400 text-sm">Current Multiplier</div>
        <div className="text-2xl font-bold text-yellow-400">
          {currentMultiplier.toFixed(2)}x
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
                      : 'bg-gray-700 text-gray-300'
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
            Bet Amount (SOL)
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
              onClick={() => setQuickAmount(walletBalance * 0.5)}
              className="bg-gray-700 text-gray-300 px-2 text-xs border-l border-gray-900"
              disabled={!isGameActive}
            >
              Half
            </button>
            <button
              onClick={() => setQuickAmount(walletBalance)}
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
                  : 'bg-gray-700 text-gray-300'
              }`}
              disabled={!isGameActive}
            >
              {amt.toString()} SOL
            </button>
          ))}
        </div>
        
        {/* Buy Button */}
        <button
          onClick={handleBuy}
          disabled={isPlacingBet || !connected || parseFloat(amount) > walletBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
          className={`w-full py-2 rounded-md font-bold mb-2 flex items-center justify-center ${
            isPlacingBet || !connected || parseFloat(amount) > walletBalance || !isGameActive || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0
              ? 'bg-gray-700 text-gray-500'
              : 'bg-green-600 text-white'
          }`}
        >
          {isPlacingBet ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
              Placing Bet...
            </>
          ) : (
            <>
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
            Cash Out Amount (SOL)
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
                  : 'bg-gray-700 text-gray-300'
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
                  : 'bg-gray-700 text-gray-300'
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
                  : 'bg-gray-700 text-gray-300'
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
                  : 'bg-gray-700 text-gray-300'
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
              +{((holdings * sellPercentage / 100) * (currentMultiplier - 1)).toFixed(4)} SOL
            </div>
          </div>
        )}
        
        {/* Sell Button */}
        <button
          onClick={handleSell}
          disabled={isCashingOut || !connected || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0}
          className={`w-full py-2 rounded-md font-bold flex items-center justify-center ${
            isCashingOut || !connected || holdings <= 0 || !hasActiveGame || !isGameActive || sellPercentage <= 0
              ? 'bg-gray-700 text-gray-500'
              : 'bg-yellow-600 text-white'
          }`}
        >
          {isCashingOut ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
              Cashing Out...
            </>
          ) : (
            <>
              Cash Out
            </>
          )}
        </button>
      </div>
      
      {/* Warning messages */}
      <div className="mt-1">
        {/* Warning message when not connected */}
        {!connected && (
          <div className="text-yellow-500 text-xs flex items-center">
            <span className="text-sm mr-1">⚠️</span>
            <span>Connect wallet to trade</span>
          </div>
        )}
        
        {/* Insufficient funds warning */}
        {connected && parseFloat(amount) > walletBalance && (
          <div className="text-red-500 text-xs flex items-center">
            <span className="text-sm mr-1">⚠️</span>
            <span>Insufficient balance</span>
          </div>
        )}
        
        {/* No holdings warning */}
        {connected && holdings <= 0 && hasActiveGame && (
          <div className="text-yellow-500 text-xs flex items-center">
            <span className="text-sm mr-1">⚠️</span>
            <span>No holdings to sell</span>
          </div>
        )}
        
        {/* Game paused warning */}
        {!isGameActive && (
          <div className="text-red-500 text-xs flex items-center">
            <span className="text-sm mr-1">⚠️</span>
            <span>Game paused. Waiting for next round.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingControls;