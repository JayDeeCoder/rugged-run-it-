// src/components/modals/WithdrawModal.tsx - Fixed with TradingControls Balance Method
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowDownToLine, Wallet, Check, Loader, X, Copy, ExternalLink, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

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
  balance: number;
  walletAddress: string;
  userId: string | null;
}

// Tab types for different actions
type ModalTab = 'withdraw' | 'transfer';

// Balance types
interface BalanceInfo {
  custodial: number;
  embedded: number;
  loading: boolean;
}

// 🔧 FIXED: Use the SAME working hook pattern as TradingControls
const useEmbeddedWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const updateBalance = useCallback(async () => {
    if (!walletAddress) {
      console.log('🔍 WithdrawModal useEmbeddedWalletBalance: No wallet address provided');
      return;
    }
    
    console.log('🚀 WithdrawModal useEmbeddedWalletBalance: Starting balance fetch for:', walletAddress);
    setLoading(true);
    
    try {
      // Use same validation as Navbar and TradingControls
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      console.log('🔧 WithdrawModal useEmbeddedWalletBalance RPC config:', {
        hasRpcUrl: !!rpcUrl,
        hasApiKey: !!apiKey,
        rpcUrl: rpcUrl?.substring(0, 50) + '...'
      });
      
      if (!rpcUrl) {
        console.error('WithdrawModal: Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
        setBalance(0);
        return;
      }
      
      // Same connection config as Navbar and TradingControls
      const connectionConfig: any = {
        commitment: 'confirmed',
      };
      
      if (apiKey) {
        connectionConfig.httpHeaders = {
          'x-api-key': apiKey
        };
      }
      
      const connection = new Connection(rpcUrl, connectionConfig);
      
      // Create PublicKey with error handling
      const publicKey = new PublicKey(walletAddress);
      const balanceResponse = await connection.getBalance(publicKey);
      const solBalance = balanceResponse / LAMPORTS_PER_SOL;
      
      console.log(`✅ WithdrawModal useEmbeddedWalletBalance: Balance fetched and SETTING STATE: ${solBalance.toFixed(6)} SOL`);
      setBalance(solBalance);
      setLastUpdated(Date.now());
      
      // Double-check state was set
      setTimeout(() => {
        console.log(`🔍 WithdrawModal useEmbeddedWalletBalance: State check - balance should be ${solBalance.toFixed(6)}`);
      }, 100);
      
    } catch (error) {
      console.error('❌ WithdrawModal useEmbeddedWalletBalance: Failed to fetch balance:', error);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      console.log('🔄 WithdrawModal useEmbeddedWalletBalance: useEffect triggered for wallet:', walletAddress);
      updateBalance();
      const interval = setInterval(updateBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, updateBalance]);

  // Log whenever balance state changes
  useEffect(() => {
    console.log(`📊 WithdrawModal useEmbeddedWalletBalance: Balance state updated to ${balance.toFixed(6)} SOL`);
  }, [balance]);

  return { balance, loading, lastUpdated, updateBalance };
};

// 🔧 FIXED: Custodial balance hook (same pattern as TradingControls)
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const updateCustodialBalance = useCallback(async () => {
    if (!userId) {
      console.log('🔍 WithdrawModal useCustodialBalance: No userId provided');
      return;
    }
    
    console.log('🚀 WithdrawModal useCustodialBalance: Starting balance fetch for userId:', userId);
    setLoading(true);
    try {
      const response = await fetch(`/api/custodial/balance/${userId}`);
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        setCustodialBalance(data.custodialBalance);
        setLastUpdated(Date.now());
        console.log(`💎 WithdrawModal: Custodial SOL balance updated: ${data.custodialBalance.toFixed(3)} SOL`);
      } else {
        console.warn('WithdrawModal: No custodialBalance in response:', data);
      }
    } catch (error) {
      console.error('WithdrawModal: Failed to fetch custodial balance:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      console.log('🔄 WithdrawModal useCustodialBalance: useEffect triggered for userId:', userId);
      updateCustodialBalance();
      const interval = setInterval(updateCustodialBalance, 10000);
      return () => clearInterval(interval);
    }
  }, [userId, updateCustodialBalance]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance };
};

const WithdrawModal: FC<WithdrawModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentToken,
  balance,
  walletAddress,
  userId
}) => {
  // Privy wallet setup
  const { authenticated, user } = usePrivy();
  
  // 🔧 FIXED: Ensure we have a valid userId - fetch it if not provided
  const [internalUserId, setInternalUserId] = useState<string | null>(userId);
  
  // Fetch userId if not provided as prop
  useEffect(() => {
    if (authenticated && walletAddress && !userId) {
      const fetchUserId = async () => {
        try {
          console.log('🔍 WithdrawModal: Fetching userId for walletAddress:', walletAddress);
          // Use the same UserAPI as TradingControls (you'll need to import it)
          const response = await fetch('/api/user/get-or-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
          });
          
          if (response.ok) {
            const userData = await response.json();
            if (userData.id) {
              setInternalUserId(userData.id);
              console.log('✅ WithdrawModal: Got userId:', userData.id);
            }
          }
        } catch (error) {
          console.error('❌ WithdrawModal: Failed to fetch userId:', error);
        }
      };
      
      fetchUserId();
    } else if (userId) {
      setInternalUserId(userId);
    }
  }, [authenticated, walletAddress, userId]);
  
  // Use the internal userId (either from prop or fetched)
  const effectiveUserId = internalUserId || userId;
  
  // 🔧 FIXED: Use the same working hooks as TradingControls
  const { 
    balance: embeddedBalance, 
    loading: embeddedLoading, 
    updateBalance: updateEmbeddedBalance 
  } = useEmbeddedWalletBalance(walletAddress);
  
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    updateCustodialBalance 
  } = useCustodialBalance(effectiveUserId || '');
  
  // Tab state
  const [activeTab, setActiveTab] = useState<ModalTab>('withdraw');
  
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
  
  // 🔧 FIXED: Combined balances from hooks
  const balances = {
    custodial: custodialBalance,
    embedded: embeddedBalance,
    loading: custodialLoading || embeddedLoading
  };
  
  // Manual refresh function
  const refreshBalances = useCallback(() => {
    console.log('🔄 WithdrawModal: Manual balance refresh triggered');
    updateCustodialBalance();
    updateEmbeddedBalance();
  }, [updateCustodialBalance, updateEmbeddedBalance]);
  
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
        console.log('🔄 Withdrawing from custodial balance:', { userId, amount: withdrawAmount, destinationAddress });
        
        const response = await fetch('/api/custodial/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: withdrawAmount,
            destinationAddress
          })
        });
        
        console.log('📡 Custodial withdraw response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Custodial withdraw API error:', errorText);
          throw new Error(`Withdrawal failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('📡 Custodial withdraw result:', result);
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully withdrew ${withdrawAmount} SOL from game balance`);
          refreshBalances();
          if (onSuccess) onSuccess();
        } else {
          throw new Error(result.error || 'Withdrawal failed');
        }
      } else {
        // Withdraw from embedded wallet (Privy)
        console.log('🔄 Withdrawing from embedded wallet:', { userId, walletAddress, amount: withdrawAmount, destinationAddress });
        
        const response = await fetch('/api/privy/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            walletAddress,
            amount: withdrawAmount,
            destinationAddress
          })
        });
        
        console.log('📡 Privy withdraw response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Privy withdraw API error:', errorText);
          throw new Error(`Withdrawal failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('📡 Privy withdraw result:', result);
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully withdrew ${withdrawAmount} SOL from embedded wallet`);
          refreshBalances();
          if (onSuccess) onSuccess();
        } else {
          throw new Error(result.error || 'Withdrawal failed');
        }
      }
      
    } catch (err) {
      console.error('❌ Withdraw error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Withdrawal failed';
      setError(errorMessage);
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
        console.log('🔄 Transferring custodial to embedded:', { userId, amount: transferAmount });
        
        const response = await fetch('/api/transfer/custodial-to-privy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: transferAmount
          })
        });
        
        console.log('📡 Custodial to embedded response status:', response.status);
        
        // Check if response is ok before parsing JSON
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Custodial to embedded API error:', errorText);
          throw new Error(`Transfer failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('📡 Custodial to embedded result:', result);
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully transferred ${transferAmount} SOL to embedded wallet`);
          refreshBalances();
          if (onSuccess) onSuccess();
        } else {
          throw new Error(result.error || 'Transfer failed');
        }
      } else {
        // Transfer from embedded wallet to custodial
        console.log('🔄 Transferring embedded to custodial:', { userId, amount: transferAmount });
        
        const response = await fetch('/api/transfer/privy-to-custodial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            amount: transferAmount
          })
        });
        
        console.log('📡 Embedded to custodial response status:', response.status);
        console.log('📡 Embedded to custodial response headers:', Object.fromEntries(response.headers));
        
        // 🔧 FIXED: Better error handling for JSON parsing
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Embedded to custodial API error:', errorText);
          throw new Error(`Transfer failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const responseText = await response.text();
          console.error('❌ Non-JSON response from embedded to custodial:', responseText);
          throw new Error('Server returned non-JSON response');
        }
        
        let result;
        try {
          const responseText = await response.text();
          console.log('📡 Embedded to custodial raw response:', responseText);
          result = JSON.parse(responseText);
        } catch (jsonError) {
          console.error('❌ Failed to parse JSON from embedded to custodial:', jsonError);
          throw new Error('Invalid response format from server');
        }
        
        console.log('📡 Embedded to custodial parsed result:', result);
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully transferred ${transferAmount} SOL to game balance`);
          refreshBalances();
          if (onSuccess) onSuccess();
        } else if (result.action === 'signature_required') {
          // 🔧 ADDED: Handle signature required case
          console.log('🔐 Signature required for embedded to custodial transfer');
          setError('This transfer requires wallet signature. Please try again or use a smaller amount.');
        } else {
          throw new Error(result.error || 'Transfer failed');
        }
      }
      
    } catch (err) {
      console.error('❌ Transfer error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transfer failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      console.log('🚀 WithdrawModal: Modal opened, resetting state and refreshing balances');
      setAmount('');
      setDestinationAddress('');
      setError(null);
      setSuccess(false);
      setAddressError(null);
      setSuccessMessage('');
      setActiveTab('withdraw');
      
      // Trigger immediate balance refresh
      setTimeout(() => {
        refreshBalances();
      }, 500); // Small delay to ensure everything is ready
    }
  }, [isOpen, refreshBalances]);
  
  // 🔧 ADDED: Log whenever balances change
  useEffect(() => {
    console.log('📊 WithdrawModal: Balance state updated:', {
      custodial: custodialBalance.toFixed(6),
      embedded: embeddedBalance.toFixed(6),
      custodialLoading,
      embeddedLoading,
      walletAddress: walletAddress?.slice(0, 8) + '...' + walletAddress?.slice(-4),
      userId
    });
  }, [custodialBalance, embeddedBalance, custodialLoading, embeddedLoading, walletAddress, userId]);
  
  // Handle outside clicks
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading) onClose();
  });
  
  // If not open, don't render
  if (!isOpen) return null;
  
  // Get token symbol
  const tokenSymbol = currentToken;
  
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
            {/* Debug Info - Enhanced */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-gray-900 p-3 rounded mb-4 text-xs space-y-1">
                <div className="text-gray-400 font-bold">🔍 Debug Info:</div>
                <div className="text-green-400">UserId: {userId || 'None'}</div>
                <div className="text-blue-400">WalletAddress: {walletAddress || 'None'}</div>
                <div className="text-yellow-400">Authenticated: {authenticated ? 'Yes' : 'No'}</div>
                <div className="text-purple-400">
                  RPC URL: {process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.substring(0, 50) || 'Missing'}...
                </div>
                <div className="text-pink-400">
                  API Key: {process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ? 'Set' : 'Not Set'}
                </div>
                <div className="text-orange-400">
                  Hook States: Custodial Loading: {custodialLoading ? 'Yes' : 'No'}, 
                  Embedded Loading: {embeddedLoading ? 'Yes' : 'No'}
                </div>
              </div>
            )}
            
            {/* 🔧 ENHANCED: Balance Display with hook-based data */}
            <div className="bg-gray-800 p-4 rounded-md mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 text-sm">Your Balances</span>
                <button 
                  onClick={refreshBalances}
                  disabled={balances.loading}
                  className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1"
                  title="Refresh balances"
                >
                  <RefreshCw size={14} className={balances.loading ? 'animate-spin' : ''} />
                  <span className="text-xs">Refresh</span>
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-green-400 text-sm">🎮 Game Balance</span>
                  <span className="text-white font-bold">
                    {custodialLoading ? (
                      <span className="flex items-center">
                        <Loader size={12} className="animate-spin mr-1" />
                        Loading...
                      </span>
                    ) : (
                      `${custodialBalance.toFixed(6)} SOL`
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400 text-sm">💼 Embedded Wallet</span>
                  <span className="text-white font-bold">
                    {embeddedLoading ? (
                      <span className="flex items-center">
                        <Loader size={12} className="animate-spin mr-1" />
                        Loading...
                      </span>
                    ) : (
                      `${embeddedBalance.toFixed(6)} SOL`
                    )}
                  </span>
                </div>
              </div>
              
              {/* Show wallet address for debugging */}
              {walletAddress && (
                <div className="mt-3 pt-2 border-t border-gray-700">
                  <div className="text-xs text-gray-500">
                    Wallet: {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                  </div>
                </div>
              )}
              
              {/* 🔧 ENHANCED: Show total balance */}
              {!balances.loading && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Total Balance</span>
                    <span className="text-yellow-400 text-sm font-bold">
                      {(custodialBalance + embeddedBalance).toFixed(6)} SOL
                    </span>
                  </div>
                </div>
              )}

              {/* Loading indicator when fetching */}
              {balances.loading && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="flex items-center justify-center">
                    <Loader size={16} className="animate-spin mr-2" />
                    <span className="text-sm text-gray-400">Fetching latest balances...</span>
                  </div>
                </div>
              )}
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
                      <div>🎮 Game Balance</div>
                      <div className="text-xs opacity-75">
                        {custodialBalance.toFixed(3)} SOL
                      </div>
                    </button>
                    <button
                      onClick={() => setWithdrawSource('embedded')}
                      className={`flex-1 py-2 px-3 rounded text-sm ${
                        withdrawSource === 'embedded'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <div>💼 Embedded Wallet</div>
                      <div className="text-xs opacity-75">
                        {embeddedBalance.toFixed(3)} SOL
                      </div>
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
                      <div className="text-xs">
                        {custodialBalance.toFixed(3)} → {embeddedBalance.toFixed(3)}
                      </div>
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
                      <div className="text-xs">
                        {embeddedBalance.toFixed(3)} → {custodialBalance.toFixed(3)}
                      </div>
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