// src/components/modals/DepositModal.tsx - STREAMLINED VERSION MATCHING TRADINGCONTROLS
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import useOutsideClick from '../../hooks/useOutsideClick';
import { 
  ArrowDownLeft, 
  Wallet, 
  Check, 
  Loader, 
  X, 
  Copy, 
  RefreshCw, 
  ArrowRightLeft, 
  Shield, 
  AlertTriangle
} from 'lucide-react';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Import the same hooks and components as TradingControls
import { usePrivyAutoTransfer } from '../../hooks/usePrivyAutoTransfer';
import { 
  useSharedCustodialBalance 
} from '../../hooks/useSharedState';

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

// Same embedded wallet balance hook as TradingControls
const useWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  const updateBalance = useCallback(async () => {
    if (!walletAddress) return;
    
    if (loading) return;
    
    setLoading(true);
    
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (!rpcUrl) {
        console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
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
      console.error('❌ Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading]);

  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    console.log(`🔄 Force refreshing wallet balance for: ${walletAddress}`);
    await updateBalance();
  }, [walletAddress, updateBalance]);

  useEffect(() => {
    if (walletAddress && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 Setting up wallet balance polling for: ${walletAddress}`);
      lastWalletRef.current = walletAddress;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      updateBalance();
      
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateBalance();
        }
      }, 15000);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [walletAddress, updateBalance]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 Setting up REAL-TIME wallet balance listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      const handleWalletBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 REAL-TIME: Wallet balance update - ${data.balance?.toFixed(6)} SOL`);
          setBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`🔗 REAL-TIME: Transaction confirmed for ${walletAddress}, refreshing balance...`);
          setTimeout(forceRefresh, 2000);
        }
      };

      socket.on('walletBalanceUpdate', handleWalletBalanceUpdate);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 Cleaning up REAL-TIME wallet balance listeners for: ${walletAddress}`);
        socket.off('walletBalanceUpdate', handleWalletBalanceUpdate);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress, forceRefresh]);

  return { balance, loading, lastUpdated, updateBalance, forceRefresh };
};

// Same balance display component as TradingControls but simplified for modal
const BalanceDisplay: FC<{
  custodialBalance: number;
  embeddedWalletBalance: number;
  isLoading: boolean;
  onRefresh: () => void;
  isMobile: boolean;
}> = ({ custodialBalance, embeddedWalletBalance, isLoading, onRefresh, isMobile }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-2 mb-2">
      <div className="mb-2 p-2 bg-gray-900 rounded-md relative">
        {/* Refresh button in top right */}
        <button
          onClick={onRefresh}
          className="absolute top-1 right-1 text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-700"
          disabled={isLoading}
          title="Refresh all balances"
        >
          <span className={`text-sm ${isLoading ? 'animate-spin' : ''}`}>⟳</span>
        </button>
        
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-1' : 'grid-cols-2 gap-2'} text-sm pr-6`}>
          <div>
            <div className="text-green-400 text-xs mb-1">🎮 Game Balance</div>
            <div className="text-white font-bold text-sm">{custodialBalance.toFixed(3)} SOL</div>
            <div className="text-xs text-gray-500">Ready for gaming</div>
          </div>
          <div>
            <div className="text-blue-400 text-xs mb-1">💼 Wallet Balance</div>
            <div className="text-white font-bold text-sm">{embeddedWalletBalance.toFixed(3)} SOL</div>
            <div className="text-xs text-gray-500">Available for transfer</div>
          </div>
        </div>
      </div>
    </div>
  );
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
  // Privy wallet setup
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  const actualWalletAddress = embeddedWallet?.address || propWalletAddress;
  
  // User management
  const [internalUserId, setInternalUserId] = useState<string | null>(propUserId || null);
  const [fetchingUserId, setFetchingUserId] = useState<boolean>(false);
  const effectiveUserId = internalUserId || propUserId;
  
  // Same balance hooks as TradingControls
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useSharedCustodialBalance(effectiveUserId || '');
  
  const { 
    balance: embeddedWalletBalance, 
    loading: embeddedWalletLoading, 
    forceRefresh: refreshEmbeddedBalance 
  } = useWalletBalance(actualWalletAddress);
  
  // Same transfer hook as TradingControls
  const { executeAutoTransfer, loading: transferLoading, error: transferError } = usePrivyAutoTransfer();
  
  // State management
  const [amount, setAmount] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  
  // Validation state
  const [addressValidated, setAddressValidated] = useState<boolean>(false);
  
  // Portal mounting
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  // Validate wallet address on load
  useEffect(() => {
    if (actualWalletAddress) {
      try {
        new PublicKey(actualWalletAddress);
        setAddressValidated(true);
      } catch (error) {
        setAddressValidated(false);
      }
    } else {
      setAddressValidated(false);
    }
  }, [actualWalletAddress]);
  
  // Refresh function for all balances
  const refreshAllBalances = useCallback(() => {
    refreshCustodialBalance();
    refreshEmbeddedBalance();
  }, [refreshCustodialBalance, refreshEmbeddedBalance]);

  // User initialization (same as TradingControls)
  useEffect(() => {
    if (authenticated && actualWalletAddress && !propUserId && !internalUserId && !fetchingUserId) {
      const fetchUserId = async () => {
        try {
          setFetchingUserId(true);
          const userData = await UserAPI.getUserOrCreate(actualWalletAddress);
          if (userData && userData.id) {
            setInternalUserId(userData.id);
          }
        } catch (error) {
          console.error('❌ Failed to fetch userId:', error);
          setError('Failed to initialize user account');
        } finally {
          setFetchingUserId(false);
        }
      };
      
      fetchUserId();
    }
  }, [authenticated, actualWalletAddress, propUserId, internalUserId, fetchingUserId]);

  // Enhanced instant transfer (same method as TradingControls)
  const handleInstantTransfer = useCallback(async (transferAmount?: number) => {
    if (!embeddedWallet || !actualWalletAddress || !effectiveUserId) {
      toast.error('Wallet not ready for transfer');
      return;
    }

    if (!addressValidated) {
      toast.error('Invalid wallet address');
      return;
    }

    const amountToTransfer = transferAmount || parseFloat(amount);
    if (!amountToTransfer || amountToTransfer <= 0 || amountToTransfer > embeddedWalletBalance) {
      setError(`Invalid amount. Available: ${embeddedWalletBalance.toFixed(3)} SOL`);
      return;
    }

    if (amountToTransfer < 0.005) {
      setError('Minimum transfer amount is 0.005 SOL');
      return;
    }

    if (amountToTransfer > 1.0) {
      setError('Maximum transfer amount is 1.0 SOL');
      return;
    }

    console.log('🚀 Starting instant transfer:', amountToTransfer);
    
    setError(null);
    
    try {
      const result = await executeAutoTransfer(
        effectiveUserId, 
        amountToTransfer,
        async () => {
          console.log('🔄 Transfer completed, refreshing balances...');
          setTimeout(() => {
            refreshCustodialBalance();
          }, 1000);
        }
      );

      if (result.success) {
        console.log('✅ Transfer completed successfully:', result);
        
        setSuccess(true);
        setSuccessMessage(`Successfully transferred ${amountToTransfer} SOL to your game balance!`);
        
        // Refresh embedded wallet balance
        setTimeout(() => {
          refreshEmbeddedBalance();
        }, 2000);
        
        if (onSuccess) onSuccess();
        
      } else {
        console.error('❌ Transfer failed:', result.error);
        setError(result.error || 'Transfer failed');
      }
      
    } catch (error) {
      console.error('❌ Transfer error:', error);
      
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
    actualWalletAddress, 
    effectiveUserId, 
    amount, 
    embeddedWalletBalance, 
    onSuccess, 
    addressValidated,
    executeAutoTransfer,
    refreshCustodialBalance,
    refreshEmbeddedBalance
  ]);

  // Quick transfer with pre-filled amounts (same as TradingControls)
  const handleQuickTransfer = useCallback(async (quickAmount: number) => {
    console.log(`💳 Quick Transfer: ${quickAmount} SOL`);
    await handleInstantTransfer(quickAmount);
  }, [handleInstantTransfer]);

  // Transfer all available balance (same as TradingControls)
  const handleTransferAll = useCallback(async () => {
    if (embeddedWalletBalance > 0.005) {
      const transferableAmount = Math.min(Math.max(0, embeddedWalletBalance - 0.005), 1.0); // Reserve for fees, cap at 1.0
      await handleInstantTransfer(transferableAmount);
    }
  }, [embeddedWalletBalance, handleInstantTransfer]);

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setAmount(value);
      setError(null);
    }
  };

  // Quick amount buttons (same as TradingControls)
  const quickAmounts = [0.05, 0.1, 0.5, 1.0];
  
  const setMaxAmount = () => {
    if (embeddedWalletBalance > 0) {
      const maxAmount = Math.min(Math.max(0, embeddedWalletBalance - 0.005), 1.0); // Reserve for fees, cap at 1.0
      setAmount(maxAmount.toFixed(6));
      setError(null);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(actualWalletAddress);
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
      setError(null);
      setSuccess(false);
      setSuccessMessage('');
      
      // Lock body scroll on mobile to prevent layering issues
      if (isMobile) {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = '0';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.bottom = '0';
      }
      
      setTimeout(() => {
        refreshAllBalances();
      }, 500);
    } else {
      // Restore body scroll
      if (isMobile) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.bottom = '';
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (isMobile) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.bottom = '';
      }
    };
  }, [isOpen, refreshAllBalances, isMobile]);

  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !transferLoading) onClose();
  });
  
  if (!isOpen || !mounted) return null;

  const containerClasses = `
    bg-[#0d0d0f] text-white border border-gray-800 rounded-lg
    ${isMobile 
      ? 'fixed inset-0 bg-black bg-opacity-70 flex items-end justify-center' 
      : 'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center'
    }
  `;

  const containerStyles = {
    zIndex: 99999,
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  };

  const modalClasses = `
    bg-[#0d0d0f] border border-gray-800 text-white
    ${isMobile 
      ? 'rounded-t-2xl w-full max-h-[85vh] overflow-y-auto' 
      : 'rounded-xl p-3 max-w-sm w-full mx-4 shadow-2xl'
    }
  `;

  const modalStyles = {
    zIndex: 100000,
    position: 'relative' as const,
    isolation: 'isolate' as const
  };

  return createPortal(
    <div className={containerClasses} style={containerStyles}>
      <div ref={modalRef} className={modalClasses} style={modalStyles}>
        {/* Header */}
        <div className={`flex justify-between items-center ${isMobile ? 'p-3' : 'pb-3'} border-b border-gray-800`}>
          <h2 className="text-base font-bold text-white flex items-center">
            <ArrowDownLeft size={16} className="mr-2" />
            Deposit SOL
          </h2>
          <button
            onClick={onClose}
            disabled={transferLoading}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className={isMobile ? 'p-3' : 'pt-3'}>
          {success ? (
            <div className="text-center py-6">
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center">
                  <Check size={24} className="text-green-500" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Success!</h3>
              <p className="text-gray-400 mb-4 text-sm">{successMessage}</p>
              <button
                onClick={onClose}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors w-full"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Address validation warning */}
              {!addressValidated && (
                <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-400 p-2 rounded-lg mb-2 text-sm">
                  <div className="flex items-center">
                    <AlertTriangle size={14} className="mr-2 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-xs">Wallet Issue</div>
                      <div className="text-xs mt-1">Invalid wallet address</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Balance Display - Same as TradingControls */}
              <BalanceDisplay
                custodialBalance={custodialBalance}
                embeddedWalletBalance={embeddedWalletBalance}
                isLoading={custodialLoading || embeddedWalletLoading}
                onRefresh={refreshAllBalances}
                isMobile={isMobile}
              />

              {/* Wallet Address Display */}
              <div className="bg-gray-800 rounded-lg p-2 mb-2">
                <div className="text-gray-400 text-xs mb-1 flex items-center">
                  <Shield size={12} className="mr-1 text-green-400" />
                  Your Wallet Address
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex-1 mr-2">
                    <div className="text-white font-mono text-xs break-all">
                      {actualWalletAddress}
                    </div>
                  </div>
                  <button
                    onClick={copyAddress}
                    className="text-blue-400 text-xs hover:text-blue-300 flex items-center bg-blue-900 bg-opacity-30 px-2 py-1 rounded transition-all"
                  >
                    {copied ? (
                      <>
                        <Check size={10} className="mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={10} className="mr-1" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Transfer Section - Same styling as TradingControls */}
              <div className="border-t border-gray-800 pt-2">
                <h3 className="text-sm font-bold text-gray-400 mb-2">INSTANT TRANSFER</h3>
                
                {/* Amount Input */}
                <div className="mb-2">
                  <label className="block text-gray-400 text-xs mb-1">
                    Transfer Amount (SOL) - Min: 0.005, Max: 1.0
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      className="flex-1 bg-gray-700 text-white px-2 py-2 rounded-l-md focus:outline-none text-sm"
                      placeholder="0.005"
                      disabled={!addressValidated}
                    />
                    <button
                      onClick={setMaxAmount}
                      className="px-2 text-xs rounded-r-md bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
                      disabled={!addressValidated}
                    >
                      Max
                    </button>
                  </div>
                </div>
                
                {/* Quick Transfer Amounts - Same as TradingControls */}
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => handleQuickTransfer(amt)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        parseFloat(amount) === amt
                          ? 'bg-green-600 text-white'
                          : amt > embeddedWalletBalance || !addressValidated || amt > 1.0
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      disabled={amt > embeddedWalletBalance || transferLoading || !addressValidated || amt > 1.0}
                    >
                      {amt} SOL
                    </button>
                  ))}
                </div>

                {/* Transfer All Button */}
                {embeddedWalletBalance > 0.005 && (
                  <button
                    onClick={handleTransferAll}
                    disabled={transferLoading || !addressValidated}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-2 px-3 rounded text-sm mb-2 flex items-center justify-center transition-colors"
                  >
                    <ArrowRightLeft size={14} className="mr-1" />
                    Transfer All ({Math.min(Math.max(0, embeddedWalletBalance - 0.005), 1.0).toFixed(3)} SOL)
                  </button>
                )}
                
                {/* Main Transfer Button - Same styling as TradingControls */}
                <button
                  onClick={() => handleInstantTransfer()}
                  disabled={transferLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > embeddedWalletBalance || !addressValidated || parseFloat(amount) < 0.005 || parseFloat(amount) > 1.0}
                  className={`w-full py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                    transferLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > embeddedWalletBalance || !addressValidated || parseFloat(amount) < 0.005 || parseFloat(amount) > 1.0
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {transferLoading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Transferring...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Transfer {amount || '0'} SOL
                    </>
                  )}
                </button>
              </div>
              
              {/* Error Message */}
              {error && (
                <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-400 p-2 rounded-lg mt-2 text-sm">
                  <div className="flex items-center">
                    <AlertTriangle size={12} className="mr-2 flex-shrink-0" />
                    {error}
                  </div>
                </div>
              )}

              {/* Info Section */}
              <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-2 mt-2 text-sm">
                <div className="text-blue-300 font-medium mb-1 text-xs">⚡ How it works:</div>
                <div className="text-gray-300 text-xs">
                  Moves SOL from your wallet to game balance instantly. Ready to bet immediately!
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DepositModal;