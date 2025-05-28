// src/components/modals/WithdrawModal.tsx - Enhanced with Custodial + Transfer
import { FC, useState, useRef, useEffect } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowDownToLine, Wallet, Check, Loader, X, Copy, ExternalLink, ArrowLeftRight, RefreshCw } from 'lucide-react';

// Define the TokenType enum locally
enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentToken: TokenType;
  balance: number; // This will be the active balance (custodial or embedded based on context)
}

// Tab types for different actions
type ModalTab = 'withdraw' | 'transfer';

// Balance types
interface BalanceInfo {
  custodial: number;
  embedded: number;
  loading: boolean;
}

const WithdrawModal: FC<WithdrawModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentToken,
  balance 
}) => {
  // Privy wallet setup
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // User context
  const { currentUser } = useContext(UserContext);
  const userId = currentUser?.id || '';
  
  // Tab state
  const [activeTab, setActiveTab] = useState<ModalTab>('withdraw');
  
  // Balance state
  const [balances, setBalances] = useState<BalanceInfo>({
    custodial: 0,
    embedded: 0,
    loading: false
  });
  
  // Form states
  const [amount, setAmount] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  // Transfer states
  const [transferDirection, setTransferDirection] = useState<'custodial-to-embedded' | 'embedded-to-custodial'>('custodial-to-embedded');
  const [withdrawSource, setWithdrawSource] = useState<'custodial' | 'embedded'>('custodial');
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Fetch both balances
  const fetchBalances = async () => {
    if (!userId || !walletAddress) return;
    
    setBalances(prev => ({ ...prev, loading: true }));
    
    try {
      // Fetch custodial balance
      const custodialResponse = await fetch(`/api/custodial/balance/${userId}`);
      const custodialData = await custodialResponse.json();
      
      // Fetch embedded wallet balance (Privy)
      const embeddedResponse = await fetch(`/api/privy/${userId}`);
      const embeddedData = await embeddedResponse.json();
      
      setBalances({
        custodial: custodialData.custodialBalance || 0,
        embedded: embeddedData.success ? embeddedData.wallet.balance : 0,
        loading: false
      });
    } catch (error) {
      console.error('Failed to fetch balances:', error);
      setBalances(prev => ({ ...prev, loading: false }));
    }
  };
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setDestinationAddress('');
      setError(null);
      setSuccess(false);
      setAddressError(null);
      setSuccessMessage('');
      setActiveTab('withdraw');
      fetchBalances();
    }
  }, [isOpen]);
  
  // Handle outside clicks
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading) onClose();
  });
  
  // If not open, don't render
  if (!isOpen) return null;
  
  // Get token symbol
  const tokenSymbol = currentToken;
  
  // Validate Solana address
  const validateAddress = (address: string): boolean => {
    const isValidFormat = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    
    if (!address) {
      setAddressError('Destination address is required');
      return false;
    } else if (!isValidFormat) {
      setAddressError('Please enter a valid Solana address');
      return false;
    }
    
    setAddressError(null);
    return true;
  };
  
  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setAmount(value);
    }
  };
  
  // Handle setting max amount
  const handleSetMaxAmount = () => {
    let maxBalance = 0;
    
    if (activeTab === 'withdraw') {
      maxBalance = withdrawSource === 'custodial' ? balances.custodial : balances.embedded;
    } else {
      maxBalance = transferDirection === 'custodial-to-embedded' ? balances.custodial : balances.embedded;
    }
    
    if (maxBalance > 0) {
      const maxAmount = Math.max(0, maxBalance - 0.001); // Account for fees
      setAmount(maxAmount.toFixed(6));
    }
  };
  
  // Handle withdraw
  const handleWithdraw = async () => {
    try {
      setError(null);
      
      if (!amount || parseFloat(amount) <= 0) {
        setError('Please enter a valid amount');
        return;
      }
      
      if (!validateAddress(destinationAddress)) {
        return;
      }
      
      const withdrawAmount = parseFloat(amount);
      const sourceBalance = withdrawSource === 'custodial' ? balances.custodial : balances.embedded;
      
      if (withdrawAmount > sourceBalance) {
        setError('Insufficient balance');
        return;
      }
      
      setIsLoading(true);
      
      if (withdrawSource === 'custodial') {
        // Withdraw from custodial balance
        const response = await fetch('/api/custodial/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: withdrawAmount,
            destinationAddress
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully withdrew ${withdrawAmount} SOL from game balance`);
          fetchBalances();
        } else {
          throw new Error(result.error || 'Withdrawal failed');
        }
      } else {
        // Withdraw from embedded wallet (Privy)
        const response = await fetch('/api/privy/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: withdrawAmount,
            destinationAddress
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully withdrew ${withdrawAmount} SOL from embedded wallet`);
          fetchBalances();
        } else {
          throw new Error(result.error || 'Withdrawal failed');
        }
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle transfer between balances
  const handleTransfer = async () => {
    try {
      setError(null);
      
      if (!amount || parseFloat(amount) <= 0) {
        setError('Please enter a valid amount');
        return;
      }
      
      const transferAmount = parseFloat(amount);
      const sourceBalance = transferDirection === 'custodial-to-embedded' ? balances.custodial : balances.embedded;
      
      if (transferAmount > sourceBalance) {
        setError('Insufficient balance');
        return;
      }
      
      setIsLoading(true);
      
      if (transferDirection === 'custodial-to-embedded') {
        // Transfer from custodial to embedded wallet
        const response = await fetch('/api/transfer/custodial-to-privy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: transferAmount
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully transferred ${transferAmount} SOL to embedded wallet`);
          fetchBalances();
        } else {
          throw new Error(result.error || 'Transfer failed');
        }
      } else {
        // Transfer from embedded wallet to custodial
        const response = await fetch('/api/transfer/privy-to-custodial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: transferAmount
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully transferred ${transferAmount} SOL to game balance`);
          fetchBalances();
        } else {
          throw new Error(result.error || 'Transfer failed');
        }
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Wallet size={20} className="mr-2" />
            Wallet Manager
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Success State */}
        {success ? (
          <div className="text-center py-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center">
                <Check size={32} className="text-green-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Success!</h3>
            <p className="text-gray-400 mb-6">{successMessage}</p>
            <button
              onClick={onClose}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors w-full"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Balance Display */}
            <div className="bg-gray-800 p-4 rounded-md mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 text-sm">Your Balances</span>
                <button 
                  onClick={fetchBalances}
                  disabled={balances.loading}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <RefreshCw size={14} className={balances.loading ? 'animate-spin' : ''} />
                </button>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-green-400 text-sm">🎮 Game Balance</span>
                  <span className="text-white font-bold">
                    {balances.loading ? '...' : balances.custodial.toFixed(6)} SOL
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400 text-sm">💼 Embedded Wallet</span>
                  <span className="text-white font-bold">
                    {balances.loading ? '...' : balances.embedded.toFixed(6)} SOL
                  </span>
                </div>
              </div>
            </div>
            
            {/* Tab Navigation */}
            <div className="flex mb-6 bg-gray-800 rounded-md p-1">
              <button
                onClick={() => setActiveTab('withdraw')}
                className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                  activeTab === 'withdraw'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <ArrowDownToLine size={16} className="inline mr-2" />
                Withdraw
              </button>
              <button
                onClick={() => setActiveTab('transfer')}
                className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                  activeTab === 'transfer'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <ArrowLeftRight size={16} className="inline mr-2" />
                Transfer
              </button>
            </div>
            
            {/* Withdraw Tab */}
            {activeTab === 'withdraw' && (
              <>
                {/* Source Selection */}
                <div className="mb-4">
                  <label className="block text-gray-300 mb-2 text-sm">
                    Withdraw From
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setWithdrawSource('custodial')}
                      className={`flex-1 py-2 px-3 rounded text-sm ${
                        withdrawSource === 'custodial'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      🎮 Game Balance
                    </button>
                    <button
                      onClick={() => setWithdrawSource('embedded')}
                      className={`flex-1 py-2 px-3 rounded text-sm ${
                        withdrawSource === 'embedded'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      💼 Embedded Wallet
                    </button>
                  </div>
                </div>
                
                {/* Amount Input */}
                <div className="mb-4">
                  <label className="block text-gray-300 mb-2 text-sm">
                    Amount to Withdraw
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.000000"
                      disabled={isLoading}
                      className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-l-md focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-700"
                    />
                    <button
                      onClick={handleSetMaxAmount}
                      disabled={isLoading}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-3 rounded-r-md transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                
                {/* Destination Address */}
                <div className="mb-6">
                  <label className="block text-gray-300 mb-2 text-sm">
                    Destination Wallet Address
                  </label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    onBlur={() => validateAddress(destinationAddress)}
                    placeholder="Solana Wallet Address"
                    disabled={isLoading}
                    className={`w-full bg-gray-800 text-white px-4 py-3 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 border ${
                      addressError ? 'border-red-500' : 'border-gray-700'
                    }`}
                  />
                  {addressError && (
                    <p className="text-red-500 text-xs mt-1">{addressError}</p>
                  )}
                </div>
                
                {/* Warning */}
                <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md mb-6 text-sm">
                  ⚠️ Double check the destination address. Withdrawals cannot be reversed!
                </div>
                
                {/* Withdraw Button */}
                <button
                  onClick={handleWithdraw}
                  disabled={isLoading || !amount || !destinationAddress}
                  className={`w-full py-3 rounded-md font-bold flex items-center justify-center ${
                    isLoading || !amount || !destinationAddress
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader size={18} className="mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine size={18} className="mr-2" />
                      Withdraw SOL
                    </>
                  )}
                </button>
              </>
            )}
            
            {/* Transfer Tab */}
            {activeTab === 'transfer' && (
              <>
                {/* Transfer Direction */}
                <div className="mb-4">
                  <label className="block text-gray-300 mb-2 text-sm">
                    Transfer Direction
                  </label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setTransferDirection('custodial-to-embedded')}
                      className={`w-full py-3 px-4 rounded text-sm flex items-center justify-between ${
                        transferDirection === 'custodial-to-embedded'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span>🎮 Game Balance → 💼 Embedded Wallet</span>
                      <ArrowLeftRight size={16} />
                    </button>
                    <button
                      onClick={() => setTransferDirection('embedded-to-custodial')}
                      className={`w-full py-3 px-4 rounded text-sm flex items-center justify-between ${
                        transferDirection === 'embedded-to-custodial'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span>💼 Embedded Wallet → 🎮 Game Balance</span>
                      <ArrowLeftRight size={16} />
                    </button>
                  </div>
                </div>
                
                {/* Amount Input */}
                <div className="mb-6">
                  <label className="block text-gray-300 mb-2 text-sm">
                    Amount to Transfer
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.000000"
                      disabled={isLoading}
                      className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-l-md focus:outline-none focus:ring-1 focus:ring-green-500 border border-gray-700"
                    />
                    <button
                      onClick={handleSetMaxAmount}
                      disabled={isLoading}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-3 rounded-r-md transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                
                {/* Transfer Info */}
                <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md mb-6 text-sm">
                  <div className="flex items-center mb-2">
                    <ArrowLeftRight size={16} className="mr-2" />
                    <span className="font-medium">Transfer Details</span>
                  </div>
                  <div className="text-xs">
                    {transferDirection === 'custodial-to-embedded' ? (
                      <p>Move SOL from your game balance to your embedded wallet for external use</p>
                    ) : (
                      <p>Move SOL from your embedded wallet to your game balance for instant gaming</p>
                    )}
                  </div>
                </div>
                
                {/* Transfer Button */}
                <button
                  onClick={handleTransfer}
                  disabled={isLoading || !amount}
                  className={`w-full py-3 rounded-md font-bold flex items-center justify-center ${
                    isLoading || !amount
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader size={18} className="mr-2 animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight size={18} className="mr-2" />
                      Transfer SOL
                    </>
                  )}
                </button>
              </>
            )}
            
            {/* Error Message */}
            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-500 p-3 rounded-md mt-4">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WithdrawModal;