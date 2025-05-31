// src/components/modals/DepositModal.tsx - Enhanced with Instant Transfer and Balance Management
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowUpToLine, Wallet, Check, Loader, X, Copy, QrCode, RefreshCw, ArrowDownLeft, Zap, ArrowRightLeft } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

// 🚩 ADD: Import feature flags (matching your other modals)
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
}

type DepositTab = 'instant' | 'external';

// 🔧 ENHANCED: Embedded wallet balance hook with socket events (from TradingControls)
const useEmbeddedWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  // 🚩 ADD: Only fetch if embedded wallets are enabled
  const embeddedEnabled = shouldShowEmbeddedWalletUI();

  const updateBalance = useCallback(async () => {
    if (!embeddedEnabled) {
      console.log('🚩 DepositModal: Embedded wallets disabled, skipping balance fetch');
      setBalance(0);
      return;
    }

    if (!walletAddress || loading) return;
    
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
    
    console.log(`🔄 DepositModal: Force refreshing embedded wallet balance for: ${walletAddress}`);
    await updateBalance();
  }, [walletAddress, updateBalance, embeddedEnabled]);

  useEffect(() => {
    if (walletAddress && embeddedEnabled && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 DepositModal: Setting up embedded wallet balance polling for: ${walletAddress}`);
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

  // 🔧 NEW: Socket listeners for wallet balance updates
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current || !embeddedEnabled) return;

    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 DepositModal: Setting up wallet balance listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      const handleWalletBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 DepositModal: Real-time wallet balance update: ${data.balance?.toFixed(6)} SOL`);
          setBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`🔗 DepositModal: Transaction confirmed for ${walletAddress}, refreshing balance...`);
          setTimeout(forceRefresh, 2000);
        }
      };
  
      socket.on('walletBalanceUpdate', handleWalletBalanceUpdate);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 DepositModal: Cleaning up wallet balance listeners for: ${walletAddress}`);
        socket.off('walletBalanceUpdate', handleWalletBalanceUpdate);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress, forceRefresh, embeddedEnabled]);

  return { balance, loading, lastUpdated, updateBalance, forceRefresh };
};

// 🔧 ENHANCED: Custodial balance hook with socket events (from TradingControls)
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
      console.log(`🔄 DepositModal: Fetching custodial balance for user ${userId}...`);
      
      const response = await fetch(`/api/custodial/balance/${userId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`👤 DepositModal: User ${userId} not found - balance remains 0`);
          setCustodialBalance(0);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 DepositModal: Custodial balance updated: ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
      } else {
        console.warn('DepositModal: Invalid response format:', data);
      }
    } catch (error) {
      console.error('❌ DepositModal: Failed to fetch custodial balance:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, loading]);

  // 🔧 NEW: Enhanced force refresh with cache busting and POST method
const forceRefresh = useCallback(async () => {
  if (!userId) return;
  
  console.log(`🔄 Force refreshing balance for ${userId}...`);
  setLoading(true);
  
  try {
    // Method 1: Try POST with refresh action first
    const postResponse = await fetch(`/api/custodial/balance/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh' })
    });
    
    if (postResponse.ok) {
      const data = await postResponse.json();
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 Force refresh (POST): ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
        return;
      }
    }
    
    // Method 2: Fallback to GET with cache busting
    const getResponse = await fetch(`/api/custodial/balance/${userId}?t=${Date.now()}&refresh=true`);
    
    if (getResponse.ok) {
      const data = await getResponse.json();
      if (data.custodialBalance !== undefined) {
        const newBalance = parseFloat(data.custodialBalance) || 0;
        console.log(`💰 Force refresh (GET): ${newBalance.toFixed(6)} SOL`);
        setCustodialBalance(newBalance);
        setLastUpdated(Date.now());
      }
    } else {
      console.error('❌ Force refresh failed:', getResponse.status);
    }
    
  } catch (error) {
    console.error('❌ Force refresh error:', error);
  } finally {
    setLoading(false);
  }
}, [userId]);

  useEffect(() => {
    if (userId && userId !== lastUserIdRef.current) {
      console.log(`🎯 DepositModal: Setting up custodial balance polling for user: ${userId}`);
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
      console.log(`🔌 DepositModal: Setting up real-time balance listeners for user: ${userId}`);
      socketListenersRef.current = true;
      
      const handleCustodialBalanceUpdate = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 DepositModal: Real-time custodial balance update: ${data.custodialBalance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.custodialBalance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleBalanceUpdate = (data: any) => {
        if (data.userId === userId && data.type === 'custodial') {
          console.log(`💰 DepositModal: Real-time balance update: ${data.balance?.toFixed(6)} SOL`);
          setCustodialBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleDepositConfirmation = (data: any) => {
        if (data.userId === userId) {
          console.log(`💰 DepositModal: Deposit confirmed, refreshing balance...`);
          setTimeout(forceRefresh, 1000);
        }
      };
  
      socket.on('custodialBalanceUpdate', handleCustodialBalanceUpdate);
      socket.on('balanceUpdate', handleBalanceUpdate);
      socket.on('depositConfirmed', handleDepositConfirmation);
      
      return () => {
        console.log(`🔌 DepositModal: Cleaning up balance listeners for user: ${userId}`);
        socket.off('custodialBalanceUpdate', handleCustodialBalanceUpdate);
        socket.off('balanceUpdate', handleBalanceUpdate);
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
  walletAddress,
  userId: propUserId
}) => {
  // 🚩 Feature flag checks
  const custodialOnlyMode = isCustodialOnlyMode();
  const showEmbeddedUI = shouldShowEmbeddedWalletUI();
  const walletMode = getWalletMode();

  // Privy wallet setup
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  // House wallet for instant transfers (from TradingControls)
  const HOUSE_WALLET = '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';
  
  // User management
  const [internalUserId, setInternalUserId] = useState<string | null>(propUserId || null);
  const [fetchingUserId, setFetchingUserId] = useState<boolean>(false);
  
  const effectiveUserId = internalUserId || propUserId;
  
  // Balance hooks
  const { 
    balance: embeddedBalance, 
    loading: embeddedLoading, 
    forceRefresh: refreshEmbeddedBalance 
  } = useEmbeddedWalletBalance(showEmbeddedUI ? walletAddress : '');
  
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useCustodialBalance(effectiveUserId || '');
  
  // State management
  const [activeTab, setActiveTab] = useState<DepositTab>('instant');
  const [amount, setAmount] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const tokenSymbol = currentToken;
  
  // 🔧 Enhanced refresh function
  const refreshAllBalances = useCallback(() => {
    console.log('🔄 DepositModal: Manual balance refresh triggered');
    refreshCustodialBalance();
    if (showEmbeddedUI) {
      refreshEmbeddedBalance();
    }
  }, [refreshCustodialBalance, refreshEmbeddedBalance, showEmbeddedUI]);

  // 🔧 User initialization (simplified)
  useEffect(() => {
    if (authenticated && walletAddress && !propUserId && !internalUserId && !fetchingUserId) {
      const fetchUserId = async () => {
        try {
          setFetchingUserId(true);
          console.log('🔍 DepositModal: Fetching userId via API for walletAddress:', walletAddress);
          
          const response = await fetch('/api/users/get-or-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
          });
          
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          
          const data = await response.json();
          if (data.user && data.user.id) {
            setInternalUserId(data.user.id);
            console.log('✅ DepositModal: Got userId from API:', data.user.id);
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
  }, [authenticated, walletAddress, propUserId, internalUserId, fetchingUserId]);

  // 🔧 NEW: Instant transfer function (from TradingControls)
  const handleInstantTransfer = useCallback(async () => {
    if (!embeddedWallet || !walletAddress || !effectiveUserId) {
      toast.error('Wallet not ready for transfer');
      return;
    }

    const transferAmount = parseFloat(amount);
    if (!transferAmount || transferAmount <= 0 || transferAmount > embeddedBalance) {
      setError(`Invalid amount. Available: ${embeddedBalance.toFixed(3)} SOL`);
      return;
    }

    console.log('🚀 DepositModal: Starting instant transfer:', { amount: transferAmount, from: walletAddress, to: HOUSE_WALLET });
    
    setIsLoading(true);
    setError(null);
    
    try {
      toast.loading('Transferring SOL to game balance...', { id: 'transfer' });
      
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVzzNb_M2I0WQ0b85sYoNEYx'
      );
      
      const fromPubkey = new PublicKey(walletAddress);
      const toPubkey = new PublicKey(HOUSE_WALLET);
      const lamports = Math.floor(transferAmount * LAMPORTS_PER_SOL);
      
      const { blockhash } = await connection.getLatestBlockhash();
      
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey
      }).add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports
        })
      );
      
      const signature = await embeddedWallet.sendTransaction(transaction, connection); 
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      toast.success(`Transferred ${transferAmount} SOL to game balance!`, { id: 'transfer' });
      
      // Manual credit trigger
      try {
        await fetch('/api/custodial/balance/' + effectiveUserId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'credit',
            amount: transferAmount,
            source: 'embedded_wallet_transfer',
            transactionId: signature
          })
        });
      } catch (error) {
        console.log('⚠️ Manual credit failed:', error);
      }
      
      setSuccess(true);
      setSuccessMessage(`Successfully transferred ${transferAmount} SOL to your game balance!`);
      
      // Refresh balances
      setTimeout(() => {
        refreshAllBalances();
      }, 2000);
      
      if (onSuccess) onSuccess();
      
    } catch (error) {
      console.error('❌ Instant transfer failed:', error);
      
      let errorMessage = 'Transfer failed';
      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = 'Transfer cancelled by user';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient SOL for transfer + fees';
        } else {
          errorMessage = `Transfer failed: ${error.message}`;
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage, { id: 'transfer' });
    } finally {
      setIsLoading(false);
    }
  }, [embeddedWallet, walletAddress, effectiveUserId, amount, embeddedBalance, onSuccess, refreshAllBalances]);

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

  // External deposit address - use user's embedded wallet address
  const externalDepositAddress = walletAddress;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(externalDepositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Address copied!');
    } catch (error) {
      console.error('Failed to copy address:', error);
      toast.error('Failed to copy address');
    }
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      console.log('🚀 DepositModal: Modal opened, resetting state');
      setAmount('');
      setCopied(false);
      setShowQR(false);
      setIsLoading(false);
      setError(null);
      setSuccess(false);
      setSuccessMessage('');
      setActiveTab(showEmbeddedUI ? 'instant' : 'external');
      
      setTimeout(() => {
        refreshAllBalances();
      }, 500);
    }
  }, [isOpen, refreshAllBalances, showEmbeddedUI]);

  // Socket listeners for real-time updates
  useEffect(() => {
    const socket = (window as any).gameSocket;
    if (socket && effectiveUserId) {
      console.log(`🔌 DepositModal: Setting up transaction listeners for user: ${effectiveUserId}`);
      
      const handleDepositConfirmed = (data: any) => {
        if (data.userId === effectiveUserId) {
          console.log(`💰 DepositModal: Deposit confirmed for ${effectiveUserId}, refreshing balances...`);
          setTimeout(refreshAllBalances, 1000);
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress || data.userId === effectiveUserId) {
          console.log(`🔗 DepositModal: Transaction confirmed, refreshing balances...`);
          setTimeout(refreshAllBalances, 2000);
        }
      };

      socket.on('depositConfirmed', handleDepositConfirmed);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 DepositModal: Cleaning up transaction listeners for user: ${effectiveUserId}`);
        socket.off('depositConfirmed', handleDepositConfirmed);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
      };
    }
  }, [effectiveUserId, walletAddress, refreshAllBalances]);

  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading) onClose();
  });
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ArrowUpToLine size={20} className="mr-2" />
            Deposit {tokenSymbol}
            <span className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded">
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
            {/* Debug info */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-gray-900 p-3 rounded mb-4 text-xs space-y-1">
                <div className="text-gray-400 font-bold">🔍 Debug Info:</div>
                <div className="text-purple-400">Wallet Mode: {walletMode}</div>
                <div className="text-orange-400">Custodial Only: {custodialOnlyMode ? 'Yes' : 'No'}</div>
                <div className="text-cyan-400">Show Embedded UI: {showEmbeddedUI ? 'Yes' : 'No'}</div>
                <div className="text-green-400">UserId: {effectiveUserId || 'None'}</div>
                <div className="text-blue-400">WalletAddress: {walletAddress || 'None'}</div>
                <div className="text-yellow-400">Embedded Balance: {embeddedBalance.toFixed(6)} SOL</div>
                <div className="text-purple-400">Game Balance: {custodialBalance.toFixed(6)} SOL</div>
              </div>
            )}
            
            {/* Mode description */}
            <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md mb-4 text-sm">
              <div className="font-medium mb-1">💰 {getModeDescription()}</div>
              <div className="text-xs">
                {showEmbeddedUI 
                  ? 'Use instant transfer for immediate deposits from your embedded wallet, or external address for deposits from other wallets to your embedded wallet first.'
                  : 'All deposits are processed directly to your game balance.'
                }
              </div>
            </div>

            {/* Balance display */}
            <div className="bg-gray-800 p-4 rounded-md mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 text-sm">Your Balances</span>
                <button 
                  onClick={refreshAllBalances}
                  disabled={custodialLoading || embeddedLoading}
                  className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1"
                  title="Refresh balances"
                >
                  <RefreshCw size={14} className={(custodialLoading || embeddedLoading) ? 'animate-spin' : ''} />
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
            </div>

            {/* Tab navigation */}
            {showEmbeddedUI && (
              <div className="flex mb-6 bg-gray-800 rounded-md p-1">
                <button
                  onClick={() => setActiveTab('instant')}
                  className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                    activeTab === 'instant'
                      ? 'bg-green-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Zap size={16} className="inline mr-2" />
                  Instant Transfer
                </button>
                <button
                  onClick={() => setActiveTab('external')}
                  className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                    activeTab === 'external'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <ArrowUpToLine size={16} className="inline mr-2" />
                  External
                </button>
              </div>
            )}

            {/* Tab content */}
            {(activeTab === 'instant' && showEmbeddedUI) ? (
              <div className="space-y-4">
                <div className="bg-green-900 bg-opacity-20 border border-green-800 text-green-400 p-3 rounded-md text-sm">
                  <div className="font-medium mb-1">⚡ Instant Transfer</div>
                  <div className="text-xs">
                    Transfer SOL from your embedded wallet directly to your game balance. Instant and gasless!
                  </div>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Amount (SOL)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 pr-16 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
                    />
                    <button
                      onClick={setMaxAmount}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-green-400 text-xs hover:text-green-300"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Available: {embeddedBalance.toFixed(6)} SOL
                  </div>
                </div>

                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setQuickAmount(amt)}
                      disabled={amt > embeddedBalance}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        parseFloat(amount) === amt
                          ? 'bg-green-600 text-white'
                          : amt > embeddedBalance
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {amt} SOL
                    </button>
                  ))}
                </div>

                {/* Transfer button */}
                <button
                  onClick={handleInstantTransfer}
                  disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > embeddedBalance}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-md transition-colors flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader size={16} className="animate-spin mr-2" />
                      Transferring...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft size={16} className="mr-2" />
                      Transfer {amount || '0'} SOL
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md text-sm">
                  <div className="font-medium mb-1">🌐 External Deposit</div>
                  <div className="text-xs">
                    Send SOL from any external wallet to your embedded wallet address. Then use "Instant Transfer" to move funds to your game balance.
                  </div>
                </div>

                {/* Address display */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Your Embedded Wallet Address</label>
                  <div className="bg-gray-800 border border-gray-700 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 mr-2">
                        <div className="text-white font-mono text-sm break-all">
                          {externalDepositAddress}
                        </div>
                      </div>
                      <button
                        onClick={copyAddress}
                        className="text-blue-400 text-xs hover:text-blue-300 flex items-center"
                      >
                        {copied ? (
                          <>
                            <Check size={12} className="mr-1" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={12} className="mr-1" />
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
                    className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md transition-colors text-sm"
                  >
                    <QrCode size={14} className="mr-2" />
                    {showQR ? 'Hide QR' : 'Show QR'}
                  </button>
                </div>

                {showQR && (
                  <div className="flex justify-center bg-white p-4 rounded-lg">
                    <QRCodeSVG 
                      value={externalDepositAddress} 
                      size={200}
                      level="M"
                      includeMargin={true}
                    />
                  </div>
                )}

                {/* Important notes */}
                <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md text-sm">
                  <div className="font-medium mb-2">⚠️ Important Notes:</div>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Only send SOL to this address</li>
                    <li>Minimum deposit: 0.001 SOL</li>
                    <li>Funds will appear in your embedded wallet balance</li>
                    <li>Use "Instant Transfer" tab to move funds to game balance</li>
                    <li>Double-check the address before sending</li>
                  </ul>
                </div>

                {/* Additional helper */}
                <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md text-sm">
                  <div className="font-medium mb-1">💡 Next Steps</div>
                  <div className="text-xs">
                    After your external deposit arrives, switch to the "Instant Transfer" tab to instantly move your SOL to your game balance for trading.
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

export default DepositModal;