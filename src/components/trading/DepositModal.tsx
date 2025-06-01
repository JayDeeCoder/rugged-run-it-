// src/components/modals/DepositModal.tsx - ENHANCED VERSION WITH MODERN UI/UX
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { 
  ArrowUpToLine, 
  Wallet, 
  Check, 
  Loader, 
  X, 
  Copy, 
  QrCode, 
  RefreshCw, 
  ArrowDownLeft, 
  Zap, 
  ArrowRightLeft, 
  Shield, 
  AlertTriangle,
  TrendingUp,
  Coins,
  ExternalLink
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Import the updated transfer hook from TradingControls
import { usePrivyAutoTransfer } from '../../hooks/usePrivyAutoTransfer';

// Import feature flags
import { 
  isCustodialOnlyMode, 
  shouldShowEmbeddedWalletUI, 
  getWalletMode, 
  getModeDescription,
  logFeatureFlags 
} from '../../utils/featureFlags';

enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentToken: TokenType;
  walletAddress: string;
  userId?: string | null;
  isMobile?: boolean;
}

type DepositTab = 'instant' | 'external';

// Enhanced embedded wallet balance hook (matching TradingControls)
const useEmbeddedWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  const embeddedEnabled = shouldShowEmbeddedWalletUI();

  const updateBalance = useCallback(async () => {
    if (!embeddedEnabled || !walletAddress || loading) return;
    
    setLoading(true);
    
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (!rpcUrl) {
        console.error('DepositModal: Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
        setBalance(0);
        return;
      }
      
      const connectionConfig: any = { commitment: 'confirmed' };
      if (apiKey) {
        connectionConfig.httpHeaders = { 'x-api-key': apiKey };
      }
      
      const connection = new Connection(rpcUrl, connectionConfig);
      const publicKey = new PublicKey(walletAddress);
      const balanceResponse = await connection.getBalance(publicKey);
      const solBalance = balanceResponse / LAMPORTS_PER_SOL;
      
      setBalance(solBalance);
      setLastUpdated(Date.now());
      
    } catch (error) {
      console.error('❌ DepositModal: Failed to fetch embedded wallet balance:', error);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading, embeddedEnabled]);

  const forceRefresh = useCallback(async () => {
    if (!walletAddress || !embeddedEnabled) return;
    await updateBalance();
  }, [walletAddress, updateBalance, embeddedEnabled]);

  useEffect(() => {
    if (walletAddress && embeddedEnabled && walletAddress !== lastWalletRef.current) {
      lastWalletRef.current = walletAddress;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      updateBalance();
      
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateBalance();
        }
      }, 30000);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    } else if (!embeddedEnabled) {
      setBalance(0);
      setLoading(false);
    }
  }, [walletAddress, updateBalance, embeddedEnabled]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current || !embeddedEnabled) return;

    const socket = (window as any).gameSocket;
    if (socket) {
      socketListenersRef.current = true;
      
      const handleWalletBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          setBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          setTimeout(forceRefresh, 2000);
        }
      };
  
      socket.on('walletBalanceUpdate', handleWalletBalanceUpdate);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        socket.off('walletBalanceUpdate', handleWalletBalanceUpdate);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress, forceRefresh, embeddedEnabled]);

  return { balance, loading, lastUpdated, updateBalance, forceRefresh };
};

// Enhanced custodial balance hook (matching TradingControls)
const useCustodialBalance = (userId: string) => {
  const [custodialBalance, setCustodialBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserIdRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  const updateCustodialBalance = useCallback(async () => {
    if (!userId || loading) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setCustodialBalance(0);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
      }
    } catch (error) {
      console.error('❌ DepositModal: Failed to fetch custodial balance:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, loading]);

  const forceRefresh = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    
    try {
      const postResponse = await fetch(`/api/custodial/balance/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', timestamp: Date.now() })
      });
      
      if (postResponse.ok) {
        const data = await postResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          setCustodialBalance(newBalance);
          setLastUpdated(Date.now());
          return;
        }
      }
      
      const getResponse = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}&refresh=true`);
      
      if (getResponse.ok) {
        const data = await getResponse.json();
        if (data.custodialBalance !== undefined) {
          const newBalance = parseFloat(data.custodialBalance) || 0;
          setCustodialBalance(newBalance);
          setLastUpdated(Date.now());
        }
      }
    } catch (error) {
      console.error('❌ DepositModal: Force refresh error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      lastUserIdRef.current = userId;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      updateCustodialBalance();
      
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateCustodialBalance();
        }
      }, 15000);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [userId, updateCustodialBalance]);

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (!userId || socketListenersRef.current) return;

    const socket = (window as any).gameSocket;
    if (socket) {
      socketListenersRef.current = true;
      
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          setCustodialBalance(parseFloat(data.custodialBalance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleDepositConfirmation = (data: any) => {
        if (data.userId === userId) {
          setTimeout(forceRefresh, 1000);
          if (data.depositAmount) {
            toast.success(`Deposit confirmed: +${data.depositAmount?.toFixed(3)} SOL!`);
          }
        }
      };
  
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      
      return () => {
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('depositConfirmed', handleDepositConfirmation);
        socketListenersRef.current = false;
      };
    }
  }, [userId, forceRefresh]);

  return { custodialBalance, loading, lastUpdated, updateCustodialBalance, forceRefresh };
};

const DepositModal: FC<DepositModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentToken,
  walletAddress: propWalletAddress,
  userId: propUserId,
  isMobile = false
}) => {
  // Feature flag checks
  const custodialOnlyMode = isCustodialOnlyMode();
  const showEmbeddedUI = shouldShowEmbeddedWalletUI();
  const walletMode = getWalletMode();

  // Privy wallet setup
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  // Get the actual embedded wallet address from Privy
  const actualEmbeddedWalletAddress = embeddedWallet?.address || propWalletAddress;
  
  // User management
  const [internalUserId, setInternalUserId] = useState<string | null>(propUserId || null);
  const [fetchingUserId, setFetchingUserId] = useState<boolean>(false);
  
  const effectiveUserId = internalUserId || propUserId;
  
  // Balance hooks
  const { 
    balance: embeddedBalance, 
    loading: embeddedLoading, 
    forceRefresh: refreshEmbeddedBalance 
  } = useEmbeddedWalletBalance(showEmbeddedUI ? actualEmbeddedWalletAddress : '');
  
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useCustodialBalance(effectiveUserId || '');
  
  // Enhanced transfer hook (same as TradingControls)
  const { executeAutoTransfer, loading: transferLoading, error: transferError } = usePrivyAutoTransfer();
  
  // State management
  const [activeTab, setActiveTab] = useState<DepositTab>('instant');
  const [amount, setAmount] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const tokenSymbol = currentToken;
  
  // Validation state
  const [addressValidated, setAddressValidated] = useState<boolean>(false);
  const [addressError, setAddressError] = useState<string>('');
  
  // Validate wallet address on load
  useEffect(() => {
    if (actualEmbeddedWalletAddress) {
      try {
        new PublicKey(actualEmbeddedWalletAddress);
        setAddressValidated(true);
        setAddressError('');
      } catch (error) {
        setAddressValidated(false);
        setAddressError('Invalid wallet address format');
      }
    } else {
      setAddressValidated(false);
      setAddressError('No embedded wallet address available');
    }
  }, [actualEmbeddedWalletAddress]);
  
  // Enhanced refresh function
  const refreshAllBalances = useCallback(() => {
    refreshCustodialBalance();
    if (showEmbeddedUI) {
      refreshEmbeddedBalance();
    }
  }, [refreshCustodialBalance, refreshEmbeddedBalance, showEmbeddedUI]);

  // User initialization
  useEffect(() => {
    if (authenticated && actualEmbeddedWalletAddress && !propUserId && !internalUserId && !fetchingUserId) {
      const fetchUserId = async () => {
        try {
          setFetchingUserId(true);
          
          const response = await fetch('/api/users/get-or-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: actualEmbeddedWalletAddress })
          });
          
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          
          const data = await response.json();
          if (data.user && data.user.id) {
            setInternalUserId(data.user.id);
          }
        } catch (error) {
          console.error('❌ DepositModal: Failed to fetch userId:', error);
          setError('Failed to initialize user account');
        } finally {
          setFetchingUserId(false);
        }
      };
      
      fetchUserId();
    }
  }, [authenticated, actualEmbeddedWalletAddress, propUserId, internalUserId, fetchingUserId]);

  // Enhanced instant transfer using the same method as TradingControls
  const handleInstantTransfer = useCallback(async () => {
    if (!embeddedWallet || !actualEmbeddedWalletAddress || !effectiveUserId) {
      toast.error('Wallet not ready for transfer');
      return;
    }

    if (!addressValidated) {
      toast.error('Invalid wallet address');
      return;
    }

    const transferAmount = parseFloat(amount);
    if (!transferAmount || transferAmount <= 0 || transferAmount > embeddedBalance) {
      setError(`Invalid amount. Available: ${embeddedBalance.toFixed(3)} SOL`);
      return;
    }

    if (transferAmount < 0.001) {
      setError('Minimum transfer amount is 0.001 SOL');
      return;
    }

    console.log('🚀 DepositModal: Starting enhanced instant transfer using TradingControls method');
    
    setError(null);
    
    try {
      // Use the same transfer method as TradingControls
      const result = await executeAutoTransfer(
        effectiveUserId, 
        transferAmount,
        // Callback to refresh balances after successful transfer
        async () => {
          console.log('🔄 DepositModal: Transfer completed, refreshing balances...');
          await refreshCustodialBalance();
          
          // Delayed refresh for safety
          setTimeout(() => {
            refreshCustodialBalance();
          }, 1500);
        }
      );

      if (result.success) {
        console.log('✅ DepositModal: Transfer completed successfully:', result);
        
        setSuccess(true);
        setSuccessMessage(`Successfully transferred ${transferAmount} SOL to your game balance! Transaction: ${result.transactionId?.slice(0, 8)}...`);
        
        // Refresh embedded wallet balance too
        setTimeout(() => {
          refreshEmbeddedBalance();
        }, 2000);
        
        if (onSuccess) onSuccess();
        
      } else {
        console.error('❌ DepositModal: Transfer failed:', result.error);
        setError(result.error || 'Transfer failed');
      }
      
    } catch (error) {
      console.error('❌ DepositModal: Transfer error:', error);
      
      let errorMessage = 'Transfer failed';
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('rejected')) {
          errorMessage = 'Transfer cancelled by user';
        } else if (error.message.includes('insufficient funds') || error.message.includes('Insufficient balance')) {
          errorMessage = 'Insufficient SOL for transfer + network fees';
        } else {
          errorMessage = `Transfer failed: ${error.message}`;
        }
      }
      
      setError(errorMessage);
    }
  }, [
    embeddedWallet, 
    actualEmbeddedWalletAddress, 
    effectiveUserId, 
    amount, 
    embeddedBalance, 
    onSuccess, 
    addressValidated,
    executeAutoTransfer,
    refreshCustodialBalance,
    refreshEmbeddedBalance
  ]);

  // Quick transfer with pre-filled amounts
  const handleQuickTransfer = useCallback(async (quickAmount: number) => {
    setAmount(quickAmount.toString());
    setError(null);
    
    // Small delay to let user see the amount was set, then transfer
    setTimeout(() => {
      handleInstantTransfer();
    }, 300);
  }, [handleInstantTransfer]);

  // Transfer all available balance (minus fees)
  const handleTransferAll = useCallback(async () => {
    if (embeddedBalance > 0.001) {
      const transferableAmount = Math.max(0, embeddedBalance - 0.001); // Reserve for fees
      setAmount(transferableAmount.toFixed(6));
      setError(null);
      
      setTimeout(() => {
        handleInstantTransfer();
      }, 300);
    }
  }, [embeddedBalance, handleInstantTransfer]);

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setAmount(value);
      setError(null);
    }
  };

  // Quick amount buttons
  const quickAmounts = [0.01, 0.05, 0.1, 0.5];
  
  const setQuickAmount = (amt: number) => {
    setAmount(amt.toString());
    setError(null);
  };

  const setMaxAmount = () => {
    if (embeddedBalance > 0) {
      const maxAmount = Math.max(0, embeddedBalance - 0.001); // Reserve for fees
      setAmount(maxAmount.toFixed(6));
      setError(null);
    }
  };

  // External deposit address
  const externalDepositAddress = actualEmbeddedWalletAddress;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(externalDepositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Wallet address copied!');
    } catch (error) {
      console.error('Failed to copy address:', error);
      toast.error('Failed to copy address');
    }
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setCopied(false);
      setShowQR(false);
      setError(null);
      setSuccess(false);
      setSuccessMessage('');
      setActiveTab('instant'); // Always default to instant transfer
      
      setTimeout(() => {
        refreshAllBalances();
      }, 500);
    }
  }, [isOpen, refreshAllBalances]);

  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !transferLoading) onClose();
  });
  
  if (!isOpen) return null;

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-end justify-center z-50">
        <div 
          ref={modalRef} 
          className="bg-[#0d0d0f] border border-gray-800 rounded-t-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Mobile Header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-800 sticky top-0 bg-[#0d0d0f]">
            <h2 className="text-lg font-bold text-white flex items-center">
              <ArrowDownLeft size={18} className="mr-2" />
              Deposit {tokenSymbol}
            </h2>
            <button
              onClick={onClose}
              disabled={transferLoading}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-4">
            {success ? (
              <div className="text-center py-8">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center">
                    <Check size={32} className="text-green-500" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Success!</h3>
                <p className="text-gray-400 mb-6 text-sm">{successMessage}</p>
                <button
                  onClick={onClose}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors w-full"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Address validation warning */}
                {!addressValidated && (
                  <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-400 p-3 rounded-lg mb-4 text-sm">
                    <div className="flex items-center">
                      <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
                      <div>
                        <div className="font-medium">Wallet Issue</div>
                        <div className="text-xs mt-1">{addressError}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Enhanced Balance Display */}
                <div className="bg-gradient-to-r from-blue-900 to-purple-900 bg-opacity-50 rounded-xl p-4 mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-300 text-sm">Your Balances</span>
                    <button 
                      onClick={refreshAllBalances}
                      disabled={custodialLoading || embeddedLoading}
                      className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1 text-sm"
                    >
                      <RefreshCw size={14} className={(custodialLoading || embeddedLoading) ? 'animate-spin' : ''} />
                      <span>Refresh</span>
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="bg-green-900 bg-opacity-30 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-green-400 text-sm flex items-center">
                          🎮 Game Balance
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
                    </div>
                    
                    {showEmbeddedUI && (
                      <div className="bg-blue-900 bg-opacity-30 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-blue-400 text-sm flex items-center">
                            💼 Wallet Balance
                          </span>
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
                    )}
                  </div>
                </div>

                {/* Tab Navigation - Always show instant as primary */}
                <div className="flex mb-4 bg-gray-800 rounded-xl p-1">
                  <button
                    onClick={() => setActiveTab('instant')}
                    className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeTab === 'instant'
                        ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    <Zap size={16} className="inline mr-2" />
                    Instant Transfer
                  </button>
                  <button
                    onClick={() => setActiveTab('external')}
                    className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeTab === 'external'
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    <ExternalLink size={16} className="inline mr-2" />
                    External
                  </button>
                </div>

                {/* Enhanced Tab Content */}
                {activeTab === 'instant' ? (
                  <div className="space-y-4">
                    {/* Instant Transfer Hero */}
                    <div className="bg-gradient-to-r from-green-900 to-blue-900 bg-opacity-30 border border-green-700 text-green-300 p-4 rounded-xl">
                      <div className="flex items-center mb-2">
                        <Zap size={20} className="mr-2 text-yellow-400" />
                        <div className="font-medium">⚡ Instant Transfer</div>
                      </div>
                      <div className="text-sm opacity-90">
                        Move SOL from your wallet directly to your game balance. Instant and secure!
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">Transfer Amount (SOL)</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={amount}
                          onChange={handleAmountChange}
                          placeholder="0.000"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-16 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-20 transition-all"
                        />
                        <button
                          onClick={setMaxAmount}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400 text-sm hover:text-green-300 font-medium"
                        >
                          MAX
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-2 flex justify-between">
                        <span>Available: {embeddedBalance.toFixed(6)} SOL</span>
                        {parseFloat(amount) > 0 && parseFloat(amount) < 0.001 && (
                          <span className="text-red-400">Minimum: 0.001 SOL</span>
                        )}
                      </div>
                    </div>

                    {/* Quick Transfer Amounts */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">Quick Transfer:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {quickAmounts.map((amt) => (
                          <button
                            key={amt}
                            onClick={() => handleQuickTransfer(amt)}
                            disabled={amt > embeddedBalance || transferLoading}
                            className={`py-3 px-3 text-sm rounded-xl transition-all font-medium ${
                              parseFloat(amount) === amt
                                ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg'
                                : amt > embeddedBalance || transferLoading
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-105'
                            }`}
                          >
                            <div className="flex flex-col items-center">
                              <span className="font-bold">{amt}</span>
                              <span className="text-xs opacity-75">SOL</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transfer All button */}
                    {embeddedBalance > 0.001 && (
                      <button
                        onClick={handleTransferAll}
                        disabled={transferLoading}
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white py-3 px-4 rounded-xl transition-all flex items-center justify-center text-sm font-medium shadow-lg"
                      >
                        <ArrowRightLeft size={16} className="mr-2" />
                        Transfer All Available ({(embeddedBalance - 0.001).toFixed(6)} SOL)
                      </button>
                    )}

                    {/* Main Transfer Button */}
                    <button
                      onClick={handleInstantTransfer}
                      disabled={transferLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > embeddedBalance || !addressValidated || parseFloat(amount) < 0.001}
                      className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-4 px-4 rounded-xl transition-all flex items-center justify-center font-bold shadow-lg"
                    >
                      {transferLoading ? (
                        <>
                          <Loader size={20} className="animate-spin mr-2" />
                          <span>Processing Transfer...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft size={20} className="mr-2" />
                          <span>Transfer {amount || '0'} SOL to Game Balance</span>
                        </>
                      )}
                    </button>

                    {/* How it works */}
                    <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-xl p-4 text-sm">
                      <div className="font-medium mb-2 text-blue-300 flex items-center">
                        <TrendingUp size={16} className="mr-2" />
                        How Instant Transfer Works:
                      </div>
                      <ol className="text-gray-300 space-y-1 list-decimal list-inside text-xs">
                        <li>Sends SOL from your embedded wallet to house wallet</li>
                        <li>Automatically credits your game balance</li>
                        <li>Updates your balances in real-time</li>
                        <li>Ready to bet immediately!</li>
                      </ol>
                      <div className="text-xs mt-2 text-blue-300 font-medium">
                        ⚡ Transfer typically takes 5-10 seconds
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* External Deposit Hero */}
                    <div className="bg-gradient-to-r from-blue-900 to-purple-900 bg-opacity-30 border border-blue-700 text-blue-300 p-4 rounded-xl">
                      <div className="flex items-center mb-2">
                        <ExternalLink size={20} className="mr-2" />
                        <div className="font-medium">🌐 External Deposit</div>
                      </div>
                      <div className="text-sm opacity-90">
                        Send SOL from any external wallet to your embedded wallet address.
                      </div>
                    </div>

                    {/* Address display */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">
                        <div className="flex items-center">
                          <Shield size={14} className="mr-1 text-green-400" />
                          Your Personal Wallet Address
                        </div>
                      </label>
                      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 mr-3">
                            <div className="text-white font-mono text-sm break-all">
                              {externalDepositAddress}
                            </div>
                            {addressValidated && (
                              <div className="text-green-400 text-xs mt-2 flex items-center">
                                <Check size={10} className="mr-1" />
                                Verified - This is your personal wallet
                              </div>
                            )}
                          </div>
                          <button
                            onClick={copyAddress}
                            className="text-blue-400 text-sm hover:text-blue-300 flex items-center bg-blue-900 bg-opacity-30 px-3 py-2 rounded-lg transition-all"
                          >
                            {copied ? (
                              <>
                                <Check size={14} className="mr-1" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy size={14} className="mr-1" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* QR Code */}
                    <div className="flex justify-center">
                      <button
                        onClick={() => setShowQR(!showQR)}
                        className="flex items-center bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-3 rounded-xl transition-all text-sm font-medium shadow-lg"
                      >
                        <QrCode size={16} className="mr-2" />
                        {showQR ? 'Hide QR Code' : 'Show QR Code'}
                      </button>
                    </div>

                    {showQR && (
                      <div className="flex justify-center bg-white p-6 rounded-xl">
                        <QRCodeSVG 
                          value={externalDepositAddress} 
                          size={200}
                          level="M"
                          includeMargin={true}
                        />
                      </div>
                    )}

                    {/* Security and Instructions */}
                    <div className="space-y-3">
                      <div className="bg-green-900 bg-opacity-20 border border-green-700 text-green-300 p-4 rounded-xl text-sm">
                        <div className="font-medium mb-2 flex items-center">
                          <Shield size={16} className="mr-2" />
                          Security Verified
                        </div>
                        <div className="text-xs space-y-1">
                          <div>✅ This address is uniquely generated for your account</div>
                          <div>✅ Only you can access funds sent to this address</div>
                          <div>✅ Address is validated and secure</div>
                        </div>
                      </div>

                      <div className="bg-yellow-900 bg-opacity-20 border border-yellow-700 text-yellow-300 p-4 rounded-xl text-sm">
                        <div className="font-medium mb-2">⚠️ Important Notes:</div>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>Only send SOL to this address</li>
                          <li>Minimum deposit: 0.001 SOL</li>
                          <li>Funds will appear in your wallet balance</li>
                          <li>Use "Instant Transfer" tab to move funds to game balance</li>
                          <li>Double-check the address before sending</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Error Message */}
                {error && (
                  <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-400 p-4 rounded-xl mt-4">
                    <div className="flex items-center">
                      <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
                      {error}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout (Enhanced)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl"
      >
        {/* Desktop Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <ArrowDownLeft size={24} className="mr-3" />
            Deposit {tokenSymbol}
            <span className="ml-3 text-xs bg-blue-600 text-white px-3 py-1 rounded-full">
              {walletMode.toUpperCase()}
            </span>
          </h2>
          <button
            onClick={onClose}
            disabled={transferLoading}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
          >
            <X size={24} />
          </button>
        </div>
        
        {success ? (
          <div className="text-center py-12">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center">
                <Check size={40} className="text-green-500" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Transfer Successful!</h3>
            <p className="text-gray-400 mb-8">{successMessage}</p>
            <button
              onClick={onClose}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-8 py-3 rounded-xl transition-all font-medium shadow-lg"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Address validation warning */}
            {!addressValidated && (
              <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-400 p-4 rounded-xl mb-6">
                <div className="flex items-center">
                  <AlertTriangle size={20} className="mr-3 flex-shrink-0" />
                  <div>
                    <div className="font-medium">Wallet Address Issue</div>
                    <div className="text-sm mt-1">{addressError}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced Balance Display - Desktop */}
            <div className="bg-gradient-to-r from-blue-900 to-purple-900 bg-opacity-50 rounded-xl p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-300">Your Balances</span>
                <button 
                  onClick={refreshAllBalances}
                  disabled={custodialLoading || embeddedLoading}
                  className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-2"
                >
                  <RefreshCw size={16} className={(custodialLoading || embeddedLoading) ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-900 bg-opacity-30 rounded-xl p-4">
                  <div className="text-green-400 text-sm mb-2 flex items-center">
                    🎮 Game Balance
                  </div>
                  <div className="text-white font-bold text-lg">
                    {custodialLoading ? (
                      <span className="flex items-center">
                        <Loader size={16} className="animate-spin mr-2" />
                        Loading...
                      </span>
                    ) : (
                      `${custodialBalance.toFixed(6)} SOL`
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Ready for gaming</div>
                </div>
                
                {showEmbeddedUI && (
                  <div className="bg-blue-900 bg-opacity-30 rounded-xl p-4">
                    <div className="text-blue-400 text-sm mb-2 flex items-center">
                      💼 Wallet Balance
                    </div>
                    <div className="text-white font-bold text-lg">
                      {embeddedLoading ? (
                        <span className="flex items-center">
                          <Loader size={16} className="animate-spin mr-2" />
                          Loading...
                        </span>
                      ) : (
                        `${embeddedBalance.toFixed(6)} SOL`
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Available for transfer</div>
                  </div>
                )}
              </div>
            </div>

            {/* Tab Navigation - Desktop */}
            <div className="flex mb-6 bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('instant')}
                className={`flex-1 py-4 px-6 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === 'instant'
                    ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Zap size={18} className="inline mr-2" />
                Instant Transfer
              </button>
              <button
                onClick={() => setActiveTab('external')}
                className={`flex-1 py-4 px-6 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === 'external'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <ExternalLink size={18} className="inline mr-2" />
                External Deposit
              </button>
            </div>

            {/* Desktop Tab Content */}
            {activeTab === 'instant' ? (
              <div className="space-y-6">
                {/* Desktop Instant Transfer Content - Similar to mobile but with desktop styling */}
                <div className="bg-gradient-to-r from-green-900 to-blue-900 bg-opacity-30 border border-green-700 text-green-300 p-5 rounded-xl">
                  <div className="flex items-center mb-3">
                    <Zap size={24} className="mr-3 text-yellow-400" />
                    <div className="font-medium text-lg">⚡ Instant Transfer</div>
                  </div>
                  <div className="text-sm opacity-90">
                    Move SOL from your embedded wallet directly to your game balance. Instant, secure, and ready to play!
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">Transfer Amount (SOL)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.000000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 pr-20 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-20 transition-all text-lg"
                    />
                    <button
                      onClick={setMaxAmount}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-green-300 font-medium"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-sm text-gray-500 mt-2 flex justify-between">
                    <span>Available: {embeddedBalance.toFixed(6)} SOL</span>
                    {parseFloat(amount) > 0 && parseFloat(amount) < 0.001 && (
                      <span className="text-red-400">Minimum: 0.001 SOL</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">Quick Transfer Amounts:</label>
                  <div className="grid grid-cols-4 gap-3">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => handleQuickTransfer(amt)}
                        disabled={amt > embeddedBalance || transferLoading}
                        className={`py-4 px-3 text-sm rounded-xl transition-all font-medium ${
                          parseFloat(amount) === amt
                            ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg transform scale-105'
                            : amt > embeddedBalance || transferLoading
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:transform hover:scale-105'
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-lg">{amt}</span>
                          <span className="text-xs opacity-75">SOL</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {embeddedBalance > 0.001 && (
                  <button
                    onClick={handleTransferAll}
                    disabled={transferLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white py-3 px-4 rounded-xl transition-all flex items-center justify-center font-medium shadow-lg"
                  >
                    <ArrowRightLeft size={18} className="mr-2" />
                    Transfer All Available ({(embeddedBalance - 0.001).toFixed(6)} SOL)
                  </button>
                )}

                <button
                  onClick={handleInstantTransfer}
                  disabled={transferLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > embeddedBalance || !addressValidated || parseFloat(amount) < 0.001}
                  className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-5 px-4 rounded-xl transition-all flex items-center justify-center font-bold text-lg shadow-lg"
                >
                  {transferLoading ? (
                    <>
                      <Loader size={24} className="animate-spin mr-3" />
                      <span>Processing Transfer...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft size={24} className="mr-3" />
                      <span>Transfer {amount || '0'} SOL to Game Balance</span>
                    </>
                  )}
                </button>

                <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-xl p-5">
                  <div className="font-medium mb-3 text-blue-300 flex items-center">
                    <TrendingUp size={20} className="mr-2" />
                    How Instant Transfer Works:
                  </div>
                  <ol className="text-gray-300 space-y-2 list-decimal list-inside">
                    <li>Sends SOL from your embedded wallet to house wallet</li>
                    <li>Automatically credits your game balance</li>
                    <li>Updates your balances in real-time</li>
                    <li>Ready to bet immediately!</li>
                  </ol>
                  <div className="text-sm mt-3 text-blue-300 font-medium">
                    ⚡ Transfer typically takes 5-10 seconds
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Desktop External Deposit Content */}
                <div className="bg-gradient-to-r from-blue-900 to-purple-900 bg-opacity-30 border border-blue-700 text-blue-300 p-5 rounded-xl">
                  <div className="flex items-center mb-3">
                    <ExternalLink size={24} className="mr-3" />
                    <div className="font-medium text-lg">🌐 External Deposit</div>
                  </div>
                  <div className="text-sm opacity-90">
                    Send SOL from any external wallet to your embedded wallet address. Then use Instant Transfer to move to game balance.
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">
                    <div className="flex items-center">
                      <Shield size={16} className="mr-2 text-green-400" />
                      Your Personal Embedded Wallet Address
                    </div>
                  </label>
                  <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 mr-4">
                        <div className="text-white font-mono text-base break-all">
                          {externalDepositAddress}
                        </div>
                        {addressValidated && (
                          <div className="text-green-400 text-sm mt-2 flex items-center">
                            <Check size={12} className="mr-1" />
                            Verified - This is your personal wallet
                          </div>
                        )}
                      </div>
                      <button
                        onClick={copyAddress}
                        className="text-blue-400 hover:text-blue-300 flex items-center bg-blue-900 bg-opacity-30 px-4 py-3 rounded-lg transition-all font-medium"
                      >
                        {copied ? (
                          <>
                            <Check size={16} className="mr-2" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={16} className="mr-2" />
                            Copy Address
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="flex items-center bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl transition-all font-medium shadow-lg"
                  >
                    <QrCode size={18} className="mr-2" />
                    {showQR ? 'Hide QR Code' : 'Show QR Code'}
                  </button>
                </div>

                {showQR && (
                  <div className="flex justify-center bg-white p-8 rounded-xl">
                    <QRCodeSVG 
                      value={externalDepositAddress} 
                      size={250}
                      level="M"
                      includeMargin={true}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-green-900 bg-opacity-20 border border-green-700 text-green-300 p-4 rounded-xl">
                    <div className="font-medium mb-2 flex items-center">
                      <Shield size={18} className="mr-2" />
                      Security Verified
                    </div>
                    <div className="text-sm space-y-1">
                      <div>✅ This address is uniquely generated for your account</div>
                      <div>✅ Only you can access funds sent to this address</div>
                      <div>✅ Address is validated and secure</div>
                    </div>
                  </div>

                  <div className="bg-yellow-900 bg-opacity-20 border border-yellow-700 text-yellow-300 p-4 rounded-xl">
                    <div className="font-medium mb-2">⚠️ Important Notes:</div>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Only send SOL to this address</li>
                      <li>Minimum deposit: 0.001 SOL</li>
                      <li>Funds will appear in your embedded wallet balance</li>
                      <li>Use "Instant Transfer" tab to move funds to game balance</li>
                      <li>Double-check the address before sending</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            
            {/* Error Message */}
            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-400 p-4 rounded-xl mt-6">
                <div className="flex items-center">
                  <AlertTriangle size={20} className="mr-3 flex-shrink-0" />
                  {error}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DepositModal;