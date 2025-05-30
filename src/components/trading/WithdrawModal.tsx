// src/components/modals/WithdrawModal.tsx - Updated with Feature Flags
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowDownToLine, Wallet, Check, Loader, X, Copy, ExternalLink, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// 🚩 ADD: Import feature flags
import { 
  isCustodialOnlyMode, 
  shouldShowEmbeddedWalletUI, 
  getWalletMode, 
  getModeDescription,
  logFeatureFlags 
} from '../../utils/featureFlags';

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

// 🔧 EXISTING: Your embedded wallet balance hook (unchanged)
const useEmbeddedWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  // 🚩 ADD: Only fetch if embedded wallets are enabled
  const embeddedEnabled = shouldShowEmbeddedWalletUI();

  const updateBalance = useCallback(async () => {
    // 🚩 ADD: Skip if embedded wallets disabled
    if (!embeddedEnabled) {
      console.log('🚩 Embedded wallets disabled, skipping balance fetch');
      setBalance(0);
      return;
    }

    if (!walletAddress) {
      console.log('🔍 WithdrawModal useEmbeddedWalletBalance: No wallet address provided');
      return;
    }
    
    console.log('🚀 WithdrawModal useEmbeddedWalletBalance: Starting balance fetch for:', walletAddress);
    setLoading(true);
    
    try {
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
      
      const connectionConfig: any = {
        commitment: 'confirmed',
      };
      
      if (apiKey) {
        connectionConfig.httpHeaders = {
          'x-api-key': apiKey
        };
      }
      
      const connection = new Connection(rpcUrl, connectionConfig);
      const publicKey = new PublicKey(walletAddress);
      const balanceResponse = await connection.getBalance(publicKey);
      const solBalance = balanceResponse / LAMPORTS_PER_SOL;
      
      console.log(`✅ WithdrawModal useEmbeddedWalletBalance: Balance fetched and SETTING STATE: ${solBalance.toFixed(6)} SOL`);
      setBalance(solBalance);
      setLastUpdated(Date.now());
      
    } catch (error) {
      console.error('❌ WithdrawModal useEmbeddedWalletBalance: Failed to fetch balance:', error);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, embeddedEnabled]);

  useEffect(() => {
    if (walletAddress && embeddedEnabled) {
      console.log('🔄 WithdrawModal useEmbeddedWalletBalance: useEffect triggered for wallet:', walletAddress);
      updateBalance();
      const interval = setInterval(updateBalance, 30000);
      return () => clearInterval(interval);
    } else if (!embeddedEnabled) {
      // Reset balance when embedded wallets are disabled
      setBalance(0);
      setLoading(false);
    }
  }, [walletAddress, updateBalance, embeddedEnabled]);

  return { balance, loading, lastUpdated, updateBalance };
};

// 🔧 UPDATED: Enhanced custodial balance hook
// In your WithdrawModal.tsx, replace the existing hook with:
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const updateCustodialBalance = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // 🚩 CORRECTED: Use your actual API endpoint
      const response = await fetch(`/api/custodial/balance/${userId}`);
      const data = await response.json();
      
      // 🚩 CORRECTED: Use custodialBalance from your API
      setCustodialBalance(data.custodialBalance || 0);
      setLastUpdated(Date.now());
      console.log(`💎 Custodial balance: ${(data.custodialBalance || 0).toFixed(3)} SOL`);
      
    } catch (error) {
      console.error('Failed to fetch custodial balance:', error);
      setCustodialBalance(0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
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
  // 🚩 ADD: Feature flag checks
  const custodialOnlyMode = isCustodialOnlyMode();
  const showEmbeddedUI = shouldShowEmbeddedWalletUI();
  const walletMode = getWalletMode();

  // Privy wallet setup
  const { authenticated, user } = usePrivy();
  
  // Your existing userId management (unchanged)
  const [internalUserId, setInternalUserId] = useState<string | null>(userId);
  const [fetchingUserId, setFetchingUserId] = useState<boolean>(false);
  
  useEffect(() => {
    if (authenticated && walletAddress && !userId && !fetchingUserId) {
      const fetchUserId = async () => {
        try {
          setFetchingUserId(true);
          console.log('🔍 WithdrawModal: Fetching userId via API for walletAddress:', walletAddress);
          
          const response = await fetch('/api/users/get-or-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ WithdrawModal: API error:', errorText);
            throw new Error(`API error: ${response.status}`);
          }
          
          const data = await response.json();
          if (data.user && data.user.id) {
            setInternalUserId(data.user.id);
            console.log('✅ WithdrawModal: Got userId from API:', data.user.id);
          } else {
            console.error('❌ WithdrawModal: No user in API response:', data);
          }
        } catch (error) {
          console.error('❌ WithdrawModal: Failed to fetch userId via API:', error);
        } finally {
          setFetchingUserId(false);
        }
      };
      
      fetchUserId();
    } else if (userId) {
      setInternalUserId(userId);
      console.log('✅ WithdrawModal: Using provided userId:', userId);
    }
  }, [authenticated, walletAddress, userId, fetchingUserId]);

  const retryGetUserId = useCallback(async () => {
    if (!walletAddress || fetchingUserId) return;
    
    try {
      setFetchingUserId(true);
      console.log('🔄 WithdrawModal: Manual retry fetching userId via API for:', walletAddress);
      
      const response = await fetch('/api/users/get-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ WithdrawModal: Retry API error:', errorText);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.user && data.user.id) {
        setInternalUserId(data.user.id);
        console.log('✅ WithdrawModal: Retry got userId from API:', data.user.id);
      } else {
        console.error('❌ WithdrawModal: Retry - No user in API response:', data);
      }
    } catch (error) {
      console.error('❌ WithdrawModal: Retry failed to fetch userId via API:', error);
    } finally {
      setFetchingUserId(false);
    }
  }, [walletAddress, fetchingUserId]);
  
  const effectiveUserId = internalUserId || userId;
  
  // 🔧 UPDATED: Conditional hook usage based on feature flags
  const { 
    balance: embeddedBalance, 
    loading: embeddedLoading, 
    updateBalance: updateEmbeddedBalance 
  } = useEmbeddedWalletBalance(showEmbeddedUI ? walletAddress : '');
  
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    updateCustodialBalance 
  } = useCustodialBalance(effectiveUserId || '');
  
  // 🚩 UPDATE: Tab state - default to withdraw, hide transfer in custodial-only mode
  const [activeTab, setActiveTab] = useState<ModalTab>('withdraw');
  
  // Your existing form states (unchanged)
  const [amount, setAmount] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  // 🚩 UPDATE: Transfer states - only used if not custodial-only
  const [transferDirection, setTransferDirection] = useState<'custodial-to-embedded' | 'embedded-to-custodial'>('custodial-to-embedded');
  const [withdrawSource, setWithdrawSource] = useState<'custodial' | 'embedded'>(
    custodialOnlyMode ? 'custodial' : 'custodial'
  );
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 🔧 UPDATED: Combined balances with conditional loading
  const balances = {
    custodial: custodialBalance,
    embedded: showEmbeddedUI ? embeddedBalance : 0,
    loading: custodialLoading || (showEmbeddedUI && embeddedLoading)
  };
  
  // 🔧 UPDATED: Conditional refresh function
  const refreshBalances = useCallback(() => {
    console.log('🔄 WithdrawModal: Manual balance refresh triggered');
    updateCustodialBalance();
    if (showEmbeddedUI) {
      updateEmbeddedBalance();
    }
  }, [updateCustodialBalance, updateEmbeddedBalance, showEmbeddedUI]);

  // Your existing validation and handler functions (mostly unchanged)
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
  
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setAmount(value);
    }
  };
  
  const handleSetMaxAmount = () => {
    let maxBalance = 0;
    
    if (activeTab === 'withdraw') {
      if (custodialOnlyMode) {
        maxBalance = balances.custodial;
      } else {
        maxBalance = withdrawSource === 'custodial' ? balances.custodial : balances.embedded;
      }
    } else {
      maxBalance = transferDirection === 'custodial-to-embedded' ? balances.custodial : balances.embedded;
    }
    
    if (maxBalance > 0) {
      const maxAmount = Math.max(0, maxBalance - 0.001);
      setAmount(maxAmount.toFixed(6));
    }
  };
  
  // 🔧 UPDATED: Enhanced withdraw handler
  const handleWithdraw = async () => {
    try {
      setError(null);
      
      if (!effectiveUserId) {
        setError('User not initialized. Please wait a moment and try again.');
        console.error('❌ Withdraw failed: No userId available');
        return;
      }
      
      if (!amount || parseFloat(amount) <= 0) {
        setError('Please enter a valid amount');
        return;
      }
      
      if (!validateAddress(destinationAddress)) {
        return;
      }
      
      const withdrawAmount = parseFloat(amount);
      
      // 🚩 UPDATE: Determine source based on mode
      let sourceBalance: number;
      let actualWithdrawSource: 'custodial' | 'embedded';
      
      if (custodialOnlyMode) {
        sourceBalance = balances.custodial;
        actualWithdrawSource = 'custodial';
      } else {
        sourceBalance = withdrawSource === 'custodial' ? balances.custodial : balances.embedded;
        actualWithdrawSource = withdrawSource;
      }
      
      if (withdrawAmount > sourceBalance) {
        setError('Insufficient balance');
        return;
      }
      
      setIsLoading(true);
      
      if (actualWithdrawSource === 'custodial') {
        console.log('🔄 Withdrawing from custodial balance:', { userId: effectiveUserId, amount: withdrawAmount, destinationAddress });
        
        // 🚩 UPDATE: Use simple custodial withdraw for custodial-only mode
        const endpoint = custodialOnlyMode ? '/api/custodial/simple-withdraw' : '/api/custodial/withdraw';
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
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
          setSuccessMessage(`Successfully withdrew ${withdrawAmount} SOL from ${custodialOnlyMode ? 'game balance' : 'custodial balance'}`);
          refreshBalances();
          if (onSuccess) onSuccess();
        } else {
          throw new Error(result.error || 'Withdrawal failed');
        }
      } else {
        // Only available in hybrid mode
        console.log('🔄 Withdrawing from embedded wallet:', { userId: effectiveUserId, walletAddress, amount: withdrawAmount, destinationAddress });
        
        const response = await fetch('/api/privy/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
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
  
  // Your existing transfer handler (unchanged but only used if not custodial-only)
  const handleTransfer = async () => {
    if (custodialOnlyMode) {
      setError('Transfers are not available in custodial-only mode');
      return;
    }
    
    // ... rest of your existing transfer logic unchanged
    try {
      setError(null);
      
      if (!effectiveUserId) {
        setError('User not initialized. Please wait a moment and try again.');
        console.error('❌ Transfer failed: No userId available');
        return;
      }
      
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
        console.log('🔄 Transferring custodial to embedded:', { userId: effectiveUserId, amount: transferAmount });
        
        const response = await fetch('/api/transfer/custodial-to-privy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
            amount: transferAmount
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Custodial to embedded API error:', errorText);
          throw new Error(`Transfer failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully transferred ${transferAmount} SOL to embedded wallet`);
          refreshBalances();
          if (onSuccess) onSuccess();
        } else {
          throw new Error(result.error || 'Transfer failed');
        }
      } else {
        console.log('🔄 Transferring embedded to custodial:', { userId: effectiveUserId, amount: transferAmount });
        
        const response = await fetch('/api/transfer/privy-to-custodial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: effectiveUserId,
            amount: transferAmount
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Transfer failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          setSuccess(true);
          setSuccessMessage(`Successfully transferred ${transferAmount} SOL to game balance`);
          refreshBalances();
          if (onSuccess) onSuccess();
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
      
      // 🚩 UPDATE: Reset withdraw source for custodial-only mode
      if (custodialOnlyMode) {
        setWithdrawSource('custodial');
      }
      
      setTimeout(() => {
        refreshBalances();
      }, 500);
    }
  }, [isOpen, refreshBalances, custodialOnlyMode]);
  
  // 🚩 ADD: Log feature flags and balances
  useEffect(() => {
    logFeatureFlags();
    console.log('📊 WithdrawModal: Balance state updated:', {
      custodial: custodialBalance.toFixed(6),
      embedded: embeddedBalance.toFixed(6),
      custodialLoading,
      embeddedLoading,
      walletMode,
      custodialOnlyMode,
      showEmbeddedUI,
      walletAddress: walletAddress?.slice(0, 8) + '...' + walletAddress?.slice(-4),
      propUserId: userId,
      effectiveUserId: effectiveUserId
    });
  }, [custodialBalance, embeddedBalance, custodialLoading, embeddedLoading, walletAddress, userId, effectiveUserId, walletMode, custodialOnlyMode, showEmbeddedUI]);
  
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading) onClose();
  });
  
  if (!isOpen) return null;
  
  const tokenSymbol = currentToken;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        {/* 🚩 UPDATE: Header with mode indicator */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Wallet size={20} className="mr-2" />
            Wallet Manager
            {/* Mode indicator */}
            <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-1 rounded">
              {walletMode.toUpperCase()}
            </span>
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
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
            {/* 🚩 UPDATE: Enhanced debug info with feature flags */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-gray-900 p-3 rounded mb-4 text-xs space-y-1">
                <div className="text-gray-400 font-bold">🔍 Debug Info:</div>
                <div className="text-purple-400">Wallet Mode: {walletMode}</div>
                <div className="text-orange-400">Custodial Only: {custodialOnlyMode ? 'Yes' : 'No'}</div>
                <div className="text-cyan-400">Show Embedded UI: {showEmbeddedUI ? 'Yes' : 'No'}</div>
                <div className="text-green-400">Prop UserId: {userId || 'None'}</div>
                <div className="text-cyan-400">Internal UserId: {internalUserId || 'None'}</div>
                <div className="text-lime-400">Effective UserId: {effectiveUserId || 'None'}</div>
                <div className="text-blue-400">WalletAddress: {walletAddress || 'None'}</div>
                <div className="text-yellow-400">Authenticated: {authenticated ? 'Yes' : 'No'}</div>
                <div className="text-purple-400">Fetching UserId: {fetchingUserId ? 'Yes' : 'No'}</div>
                <div className="text-teal-400">
                  Hook States: Custodial Loading: {custodialLoading ? 'Yes' : 'No'}, 
                  Embedded Loading: {embeddedLoading ? 'Yes' : 'No'}
                </div>
                {!effectiveUserId && !fetchingUserId && (
                  <div className="text-red-400 font-bold">⚠️ No userId available - transfers will fail!</div>
                )}
                {fetchingUserId && (
                  <div className="text-yellow-400 font-bold">🔄 Fetching userId from API...</div>
                )}
              </div>
            )}
            
            {/* Mode description */}
            {custodialOnlyMode && (
              <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md mb-4 text-sm">
                <div className="font-medium mb-1">🏦 {getModeDescription()}</div>
                <div className="text-xs">
                  All funds are managed in your game balance for instant transactions and easy withdrawals.
                </div>
              </div>
            )}
            
            {/* User ID status notification */}
            {authenticated && walletAddress && !effectiveUserId && !fetchingUserId && (
              <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md mb-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold mb-1">⚠️ User Setup Required</div>
                    <div className="text-xs">Unable to initialize user account. Please retry.</div>
                  </div>
                  <button
                    onClick={retryGetUserId}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
            
            {/* 🚩 UPDATE: Conditional balance display */}
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
                {/* Always show custodial balance */}
                <div className="flex justify-between items-center">
                  <span className="text-green-400 text-sm">
                    🎮 {custodialOnlyMode ? 'Game Balance' : 'Game Balance'}
                  </span>
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
                
                {/* Only show embedded balance if not custodial-only */}
                {showEmbeddedUI && (
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
                )}
              </div>
              
              {/* Show wallet address for debugging */}
              {walletAddress && (
                <div className="mt-3 pt-2 border-t border-gray-700">
                  <div className="text-xs text-gray-500">
                    Wallet: {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                  </div>
                </div>
              )}
              
              {/* Show total balance */}
              {!balances.loading && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Total Balance</span>
                    <span className="text-yellow-400 text-sm font-bold">
                      {(custodialBalance + (showEmbeddedUI ? embeddedBalance : 0)).toFixed(6)} SOL
                    </span>
                  </div>
                </div>
              )}

              {balances.loading && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="flex items-center justify-center">
                    <Loader size={16} className="animate-spin mr-2" />
                    <span className="text-sm text-gray-400">Fetching latest balances...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* 🚩 UPDATE: Conditional tab navigation */}
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
              
              {/* Only show transfer tab if not custodial-only */}
              {!custodialOnlyMode && (
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
              )}
            </div>

            {/* 🚩 UPDATE: Conditional tab content */}
            {activeTab === 'withdraw' ? (
              <div className="space-y-4">
                {/* 🚩 UPDATE: Conditional source selection */}
                {!custodialOnlyMode && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Withdraw From</label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setWithdrawSource('custodial')}
                        className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                          withdrawSource === 'custodial'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        🎮 Game Balance
                        <div className="text-xs opacity-75">
                          {custodialBalance.toFixed(6)} SOL
                        </div>
                      </button>
                      <button
                        onClick={() => setWithdrawSource('embedded')}
                        className={`flex-1 py-2 px-3 rounded text-sm transition-colors ${
                          withdrawSource === 'embedded'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        💼 Embedded Wallet
                        <div className="text-xs opacity-75">
                          {embeddedBalance.toFixed(6)} SOL
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Amount ({tokenSymbol})</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 pr-16 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={handleSetMaxAmount}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-blue-400 text-xs hover:text-blue-300"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Available: {custodialOnlyMode 
                      ? custodialBalance.toFixed(6) 
                      : (withdrawSource === 'custodial' ? custodialBalance.toFixed(6) : embeddedBalance.toFixed(6))
                    } SOL
                  </div>
                </div>

                {/* Destination Address */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Destination Address</label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    placeholder="Enter Solana wallet address"
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  {addressError && (
                    <div className="text-red-500 text-sm mt-1">{addressError}</div>
                  )}
                </div>

                {/* Withdraw Button */}
                <button
                  onClick={handleWithdraw}
                  disabled={isLoading || !effectiveUserId || !amount || !destinationAddress}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-md transition-colors flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader size={16} className="animate-spin mr-2" />
                      Processing Withdrawal...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine size={16} className="mr-2" />
                      Withdraw {amount || '0'} SOL
                    </>
                  )}
                </button>
              </div>
            ) : (
              // Transfer tab - only shown if not custodial-only
              <div className="space-y-4">
                {/* Your existing transfer UI - unchanged */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Transfer Direction</label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setTransferDirection('custodial-to-embedded')}
                      className={`w-full py-3 px-4 rounded text-sm transition-colors flex items-center justify-between ${
                        transferDirection === 'custodial-to-embedded'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <div className="flex items-center">
                        <span className="mr-3">🎮→💼</span>
                        <div className="text-left">
                          <div className="font-medium">Game → Embedded Wallet</div>
                          <div className="text-xs opacity-75">
                            Move SOL to your embedded wallet
                          </div>
                        </div>
                      </div>
                      <div className="text-xs">
                        {custodialBalance.toFixed(6)} SOL available
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setTransferDirection('embedded-to-custodial')}
                      className={`w-full py-3 px-4 rounded text-sm transition-colors flex items-center justify-between ${
                        transferDirection === 'embedded-to-custodial'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <div className="flex items-center">
                        <span className="mr-3">💼→🎮</span>
                        <div className="text-left">
                          <div className="font-medium">Embedded Wallet → Game</div>
                          <div className="text-xs opacity-75">
                            Move SOL to your game balance
                          </div>
                        </div>
                      </div>
                      <div className="text-xs">
                        {embeddedBalance.toFixed(6)} SOL available
                      </div>
                    </button>
                  </div>
                </div>

                {/* Amount Input for Transfer */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Amount ({tokenSymbol})</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 pr-16 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={handleSetMaxAmount}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-blue-400 text-xs hover:text-blue-300"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Available: {transferDirection === 'custodial-to-embedded' 
                      ? custodialBalance.toFixed(6) 
                      : embeddedBalance.toFixed(6)} SOL
                  </div>
                </div>

                {/* Transfer Button */}
                <button
                  onClick={handleTransfer}
                  disabled={isLoading || !effectiveUserId || !amount}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-md transition-colors flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader size={16} className="animate-spin mr-2" />
                      Processing Transfer...
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight size={16} className="mr-2" />
                      Transfer {amount || '0'} SOL
                      <span className="ml-2">
                        {transferDirection === 'custodial-to-embedded' ? '🎮→💼' : '💼→🎮'}
                      </span>
                    </>
                  )}
                </button>

                {/* Transfer Info */}
                <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md text-sm">
                  <div className="font-medium mb-1">ℹ️ Transfer Info</div>
                  <div className="text-xs">
                    {transferDirection === 'custodial-to-embedded' 
                      ? 'Moving SOL from your game balance to your embedded wallet for withdrawals or external use.'
                      : 'Moving SOL from your embedded wallet to your game balance for trading and gameplay.'
                    }
                  </div>
                </div>
              </div>
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