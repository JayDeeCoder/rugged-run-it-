// src/components/trading/TradingControls.tsx
import { FC, useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import useLocalStorage from '../../hooks/useLocalStorage';
import DepositModal from './DepositModal';

// Define the TokenType enum locally if not imported elsewhere
enum TokenType {
    SOL = 'SOL',
    RUGGED = 'RUGGED'
}

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
  
  // Add state for deposit modal
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  
  // Auto-cashout settings
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  
  // Use Privy for wallet info
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  
  // Get the embedded wallet address
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';

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

  // Handle deposit button click
  const handleDepositClick = () => {
    setIsDepositModalOpen(true);
  };

  // Rest of the component with UI rendering...
  
  // At the end where the deposit modal is rendered:
  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-3 p-4 relative border border-gray-800 rounded-lg">
      {/* Wallet Actions - Deposit & Withdraw */}
      <div className="flex justify-between mb-1">
        <button 
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-sm flex items-center"
          onClick={handleDepositClick}
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
      
      {/* Rest of your trading controls UI... */}
      
      {/* Deposit Modal with wallet address */}
      <DepositModal 
        isOpen={isDepositModalOpen} 
        onClose={() => setIsDepositModalOpen(false)} 
        currentToken={TokenType.SOL}
        walletAddress={walletAddress}
      />
    </div>
  );
};

export default TradingControls;