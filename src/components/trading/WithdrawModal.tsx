// src/components/modals/WithdrawModal.tsx - FIXED VERSION WITH PROPER EMBEDDED WALLET INTEGRATION
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { 
  ArrowDownToLine, 
  Wallet, 
  Check, 
  Loader, 
  X, 
  Copy, 
  ExternalLink, 
  ArrowLeftRight, 
  RefreshCw,
  ArrowUpRight,
  Shield,
  AlertTriangle,
  TrendingUp,
  Zap,
  ChevronRight,
  Send
} from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { toast } from 'react-hot-toast';

// Import the updated transfer hook and feature flags
import { usePrivyAutoTransfer } from '../../hooks/usePrivyAutoTransfer';
import { 
  isCustodialOnlyMode, 
  shouldShowEmbeddedWalletUI, 
  getWalletMode, 
  getModeDescription,
  logFeatureFlags 
} from '../../utils/featureFlags';

// 🚀 UPDATED: Import shared state hooks (same as TradingControls)
import { 
  useSharedCustodialBalance
} from '../../hooks/useSharedState';

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
  isMobile?: boolean;
}

type WithdrawStep = 'transfer' | 'withdraw';

// 🚀 EXACT COPY: Use identical embedded wallet balance hook as TradingControls
const useEmbeddedWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  // Create stable update function with useCallback (exactly like TradingControls)
  const updateBalance = useCallback(async () => {
    if (!walletAddress) return;
    
    // Prevent multiple simultaneous updates
    if (loading) return;
    
    setLoading(true);
    
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (!rpcUrl) {
        console.error('WithdrawModal: Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
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
      console.error('❌ WithdrawModal: Failed to fetch embedded wallet balance:', error);
      // Don't reset balance on error
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading]);

  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    console.log(`🔄 WithdrawModal: Force refreshing embedded wallet balance for: ${walletAddress}`);
    await updateBalance();
  }, [walletAddress, updateBalance]);

  // Polling setup (exactly like TradingControls)
  useEffect(() => {
    if (walletAddress && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 WithdrawModal: Setting up embedded wallet balance polling for: ${walletAddress}`);
      lastWalletRef.current = walletAddress;
      
      // Clear existing interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      // Initial fetch
      updateBalance();
      
      // Set new interval
      updateIntervalRef.current = setInterval(() => {
        if (!loading) {
          updateBalance();
        }
      }, 30000); // 30 seconds
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [walletAddress, updateBalance]);

  // 🚀 EXACT COPY: Socket listeners from TradingControls
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 WithdrawModal: Setting up REAL-TIME embedded wallet listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      // Wallet balance update event
      const handleWalletBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 WithdrawModal REAL-TIME: Embedded wallet balance update - ${data.balance?.toFixed(6)} SOL`);
          setBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
        }
      };

      // Transaction confirmed for this wallet
      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`🔗 WithdrawModal REAL-TIME: Transaction confirmed for ${walletAddress}, refreshing balance...`);
          
          // Force refresh after confirmation with delay for blockchain settlement
          setTimeout(forceRefresh, 3000);
        }
      };

      // Register wallet-specific event listeners
      socket.on('walletBalanceUpdate', handleWalletBalanceUpdate);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 WithdrawModal: Cleaning up REAL-TIME embedded wallet listeners for: ${walletAddress}`);
        socket.off('walletBalanceUpdate', handleWalletBalanceUpdate);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress, forceRefresh]);

  return { balance, loading, lastUpdated, updateBalance, forceRefresh };
};

const WithdrawModal: FC<WithdrawModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentToken,
  balance,
  walletAddress,
  userId,
  isMobile = false
}) => {
  // 🔧 FIXED: Proper Privy wallet setup (same as TradingControls)
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  // 🚀 CRITICAL FIX: Use actual embedded wallet address, not fallback
  const embeddedWalletAddress = embeddedWallet?.address || '';
  
  // 🚀 UPDATED: Use shared custodial balance hook (same as TradingControls)
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useSharedCustodialBalance(userId || '');
  
  // 🚀 UPDATED: Use proper embedded wallet balance hook with EXACT same call pattern as TradingControls
  const { 
    balance: embeddedBalance, 
    loading: embeddedLoading, 
    forceRefresh: refreshEmbeddedBalance 
  } = useEmbeddedWalletBalance(embeddedWalletAddress);
  
  // Enhanced transfer hook
  const { executeAutoTransfer, loading: transferLoading, error: transferError } = usePrivyAutoTransfer();
  
  // State management
  const [activeStep, setActiveStep] = useState<WithdrawStep>('transfer');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  
  // Transfer status tracking
  const [transferStatus, setTransferStatus] = useState<string>('');
  const [withdrawStatus, setWithdrawStatus] = useState<string>('');
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Enhanced refresh function
  const refreshAllBalances = useCallback(() => {
    console.log('🔄 WithdrawModal: Refreshing all balances...');
    refreshCustodialBalance();
    if (embeddedWalletAddress) {
      refreshEmbeddedBalance();
    }
  }, [refreshCustodialBalance, refreshEmbeddedBalance, embeddedWalletAddress]);

  // Step 1: Transfer from custodial to embedded using existing API
  const handleTransferToEmbedded = useCallback(async () => {
    if (!embeddedWallet || !embeddedWalletAddress || !userId) {
      toast.error('Wallet not ready for transfer');
      return;
    }

    const amount = parseFloat(transferAmount);
    if (!amount || amount <= 0 || amount > custodialBalance) {
      setError(`Invalid amount. Available: ${custodialBalance.toFixed(3)} SOL`);
      return;
    }

    if (amount < 0.001) {
      setError('Minimum transfer amount is 0.001 SOL');
      return;
    }

    console.log('🚀 WithdrawModal: Starting transfer from custodial to embedded');
    
    setError(null);
    setTransferStatus('Preparing transfer...');
    
    try {
      // Use the custodial withdraw-to-embedded API endpoint
      const response = await fetch('/api/custodial/withdraw-to-embedded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          amount: amount,
          embeddedWalletAddress: embeddedWalletAddress
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transfer failed');
      }

      const result = await response.json();

      if (result.success) {
        setTransferStatus('Transfer completed!');
        toast.success(`Successfully moved ${amount} SOL to embedded wallet!`);
        
        // Refresh balances
        setTimeout(() => {
          refreshAllBalances();
        }, 1000);
        
        // Move to next step
        setActiveStep('withdraw');
        setTransferStatus('');
        
      } else {
        throw new Error(result.error || 'Transfer failed');
      }
      
    } catch (error) {
      console.error('❌ WithdrawModal: Transfer error:', error);
      
      let errorMessage = 'Transfer failed';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setTransferStatus('');
    }
  }, [
    embeddedWallet, 
    embeddedWalletAddress, 
    userId, 
    transferAmount, 
    custodialBalance,
    refreshAllBalances
  ]);

  // 🚀 ENHANCED: Proper auto-signed withdrawal using embedded wallet instance
  const handleEmbeddedWithdraw = useCallback(async () => {
    if (!embeddedWallet || !embeddedWalletAddress || !destinationAddress) {
      toast.error('Missing required information for withdrawal');
      return;
    }

    // Validate destination address
    try {
      new PublicKey(destinationAddress);
    } catch (error) {
      setAddressError('Invalid Solana address');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0 || amount > embeddedBalance) {
      setError(`Invalid amount. Available: ${embeddedBalance.toFixed(6)} SOL`);
      return;
    }

    if (amount < 0.001) {
      setError('Minimum withdrawal amount is 0.001 SOL');
      return;
    }

    console.log('🚀 WithdrawModal: Starting auto-signed withdrawal from embedded wallet');
    
    setIsWithdrawing(true);
    setError(null);
    setAddressError(null);
    
    const withdrawToastId = `withdraw-${Date.now()}`;
    
    try {
      setWithdrawStatus('Creating withdrawal transaction...');
      toast.loading('Creating withdrawal transaction...', { id: withdrawToastId });
      
      // 🚀 ENHANCED: Direct embedded wallet transaction (instant)
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVzzNb_M2I0WQ0b85sYoNEYx';
      const connection = new Connection(rpcUrl, 'confirmed');
      
      // Create the transfer transaction
      const fromPublicKey = new PublicKey(embeddedWalletAddress);
      const toPublicKey = new PublicKey(destinationAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Get latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      // Create transaction
      const transaction = new Transaction({
        feePayer: fromPublicKey,
        recentBlockhash: blockhash
      });
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: fromPublicKey,
          toPubkey: toPublicKey,
          lamports: lamports
        })
      );
      
      // Auto-sign and send the transaction using Privy embedded wallet
      setWithdrawStatus('Auto-signing transaction...');
      toast.loading('Auto-signing transaction...', { id: withdrawToastId });
      
      console.log('✅ WithdrawModal: Sending transaction with embedded wallet...');
      const signature = await embeddedWallet.sendTransaction(transaction, connection);
      console.log('✅ WithdrawModal: Transaction sent with signature:', signature);
      
      // Wait for confirmation
      setWithdrawStatus('Waiting for confirmation...');
      toast.loading('Waiting for blockchain confirmation...', { id: withdrawToastId });
      
      // Get the latest blockhash for confirmation
      const { blockhash: confirmBlockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: confirmBlockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('✅ WithdrawModal: Transaction confirmed on blockchain');
      
      // Success!
      setWithdrawStatus('Withdrawal completed!');
      toast.success(`Successfully withdrew ${amount} SOL!`, { id: withdrawToastId });
      
      setSuccess(true);
      setSuccessMessage(`Successfully withdrew ${amount} SOL to ${destinationAddress.slice(0, 8)}...${destinationAddress.slice(-8)}`);
      
      // Refresh embedded wallet balance
      setTimeout(() => {
        refreshEmbeddedBalance();
      }, 2000);
      
      if (onSuccess) onSuccess();
      
    } catch (error) {
      console.error('❌ WithdrawModal: Withdrawal error:', error);
      
      let errorMessage = 'Withdrawal failed';
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('rejected')) {
          errorMessage = 'Withdrawal cancelled by user';
        } else if (error.message.includes('insufficient funds') || error.message.includes('Insufficient balance')) {
          errorMessage = 'Insufficient SOL for withdrawal + network fees';
        } else if (error.message.includes('Transaction failed')) {
          errorMessage = 'Blockchain transaction failed';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Withdrawal timed out - please try again';
        } else {
          errorMessage = `Withdrawal failed: ${error.message}`;
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage, { id: withdrawToastId });
    } finally {
      setIsWithdrawing(false);
      setWithdrawStatus('');
    }
  }, [
    embeddedWallet, 
    embeddedWalletAddress, 
    destinationAddress, 
    withdrawAmount, 
    embeddedBalance,
    onSuccess,
    refreshEmbeddedBalance
  ]);

  // Quick amount handlers
  const setQuickTransferAmount = (amt: number) => {
    setTransferAmount(amt.toString());
    setError(null);
  };

  const setMaxTransferAmount = () => {
    if (custodialBalance > 0) {
      const maxAmount = Math.max(0, custodialBalance - 0.001);
      setTransferAmount(maxAmount.toFixed(6));
      setError(null);
    }
  };

  const setQuickWithdrawAmount = (amt: number) => {
    setWithdrawAmount(amt.toString());
    setError(null);
  };

  const setMaxWithdrawAmount = () => {
    if (embeddedBalance > 0) {
      const maxAmount = Math.max(0, embeddedBalance - 0.001); // Reserve for fees
      setWithdrawAmount(maxAmount.toFixed(6));
      setError(null);
    }
  };

  // Handle amount changes
  const handleTransferAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setTransferAmount(value);
      setError(null);
    }
  };

  const handleWithdrawAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setWithdrawAmount(value);
      setError(null);
    }
  };

  // Address validation
  const validateAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      setAddressError(null);
      return true;
    } catch (error) {
      setAddressError('Please enter a valid Solana address');
      return false;
    }
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTransferAmount('');
      setWithdrawAmount('');
      setDestinationAddress('');
      setError(null);
      setAddressError(null);
      setSuccess(false);
      setSuccessMessage('');
      setActiveStep('transfer');
      setTransferStatus('');
      setWithdrawStatus('');
      
      setTimeout(() => {
        refreshAllBalances();
      }, 500);
    }
  }, [isOpen, refreshAllBalances]);

  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !transferLoading && !isWithdrawing) onClose();
  });
  
  if (!isOpen) return null;

  // 🚀 DEBUG INFO
  console.log('🔍 WithdrawModal Debug:', {
    embeddedWalletAddress,
    embeddedBalance,
    custodialBalance,
    walletAddress,
    userId
  });

  const tokenSymbol = currentToken;
  const quickAmounts = [0.01, 0.05, 0.1, 0.5];

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
              <ArrowUpRight size={18} className="mr-2" />
              Withdraw {tokenSymbol}
            </h2>
            <button
              onClick={onClose}
              disabled={transferLoading || isWithdrawing}
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
                <h3 className="text-xl font-bold text-white mb-2">Withdrawal Successful!</h3>
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
                {/* Enhanced Balance Display */}
                <div className="bg-gradient-to-r from-purple-900 to-blue-900 bg-opacity-50 rounded-xl p-4 mb-4">
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
                    
                    <div className="bg-purple-900 bg-opacity-30 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-purple-400 text-sm flex items-center">
                          💼 Embedded Wallet
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
                      {embeddedWalletAddress && (
                        <div className="text-xs text-gray-500 mt-1">
                          {embeddedWalletAddress.slice(0, 8)}...{embeddedWalletAddress.slice(-8)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Withdrawal Flow Steps */}
                <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-xl p-4 mb-4">
                  <div className="flex items-center mb-2">
                    <TrendingUp size={16} className="mr-2 text-blue-400" />
                    <div className="font-medium text-blue-300">Withdrawal Flow</div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className={`flex items-center ${activeStep === 'transfer' ? 'text-blue-300' : 'text-gray-500'}`}>
                      <span className="mr-1">🎮</span>
                      Game Balance
                    </div>
                    <ChevronRight size={14} className="text-gray-400" />
                    <div className={`flex items-center ${activeStep === 'withdraw' || embeddedBalance > 0.001 ? 'text-purple-300' : 'text-gray-500'}`}>
                      <span className="mr-1">💼</span>
                      Embedded Wallet
                    </div>
                    <ChevronRight size={14} className="text-gray-400" />
                    <div className="flex items-center text-orange-300">
                      <span className="mr-1">🌐</span>
                      External Wallet
                    </div>
                  </div>
                </div>

                {/* Step Content */}
                {activeStep === 'transfer' ? (
                  <div className="space-y-4">
                    {/* Step 1: Transfer to Embedded */}
                    <div className="bg-gradient-to-r from-green-900 to-purple-900 bg-opacity-30 border border-green-700 text-green-300 p-4 rounded-xl">
                      <div className="flex items-center mb-2">
                        <Zap size={20} className="mr-2 text-yellow-400" />
                        <div className="font-medium">Step 1: Move to Embedded Wallet</div>
                      </div>
                      <div className="text-sm opacity-90">
                        Transfer SOL from your game balance to your embedded wallet for withdrawal.
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">Transfer Amount (SOL)</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={transferAmount}
                          onChange={handleTransferAmountChange}
                          placeholder="0.000"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-16 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-20 transition-all"
                        />
                        <button
                          onClick={setMaxTransferAmount}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400 text-sm hover:text-green-300 font-medium"
                        >
                          MAX
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Available: {custodialBalance.toFixed(6)} SOL
                      </div>
                    </div>

                    {/* Quick Transfer Amounts */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">Quick Amounts:</label>
                      <div className="grid grid-cols-4 gap-2">
                        {quickAmounts.map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setQuickTransferAmount(amt)}
                            disabled={amt > custodialBalance}
                            className={`py-2 px-2 text-xs rounded-lg transition-all font-medium ${
                              parseFloat(transferAmount) === amt
                                ? 'bg-gradient-to-r from-green-600 to-purple-600 text-white shadow-lg'
                                : amt > custodialBalance
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {amt} SOL
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transfer Status */}
                    {transferStatus && (
                      <div className="bg-blue-900 bg-opacity-30 border border-blue-800 text-blue-400 p-3 rounded-lg">
                        <div className="flex items-center">
                          <Loader size={16} className="animate-spin mr-2" />
                          <span className="text-sm">{transferStatus}</span>
                        </div>
                      </div>
                    )}

                    {/* Transfer Button */}
                    <button
                      onClick={handleTransferToEmbedded}
                      disabled={transferLoading || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > custodialBalance}
                      className="w-full bg-gradient-to-r from-green-600 to-purple-600 hover:from-green-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-4 px-4 rounded-xl transition-all flex items-center justify-center font-bold shadow-lg"
                    >
                      {transferLoading ? (
                        <>
                          <Loader size={20} className="animate-spin mr-2" />
                          <span>Processing Transfer...</span>
                        </>
                      ) : (
                        <>
                          <ArrowLeftRight size={20} className="mr-2" />
                          <span>Transfer {transferAmount || '0'} SOL to Embedded Wallet</span>
                        </>
                      )}
                    </button>

                    {/* Skip to Step 2 if embedded wallet has balance */}
                    {embeddedBalance > 0.001 && (
                      <button
                        onClick={() => setActiveStep('withdraw')}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-xl transition-all flex items-center justify-center font-medium"
                      >
                        <span>Skip - Use Existing Embedded Balance ({embeddedBalance.toFixed(3)} SOL)</span>
                        <ChevronRight size={16} className="ml-2" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Step 2: Withdraw from Embedded */}
                    <div className="bg-gradient-to-r from-purple-900 to-orange-900 bg-opacity-30 border border-purple-700 text-purple-300 p-4 rounded-xl">
                      <div className="flex items-center mb-2">
                        <Send size={20} className="mr-2 text-orange-400" />
                        <div className="font-medium">Step 2: Instant Auto-Withdraw</div>
                      </div>
                      <div className="text-sm opacity-90">
                        Send SOL directly from your embedded wallet to any external Solana address. Transaction is auto-signed and instant.
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">Withdrawal Amount (SOL)</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={withdrawAmount}
                          onChange={handleWithdrawAmountChange}
                          placeholder="0.000"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-16 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-20 transition-all"
                        />
                        <button
                          onClick={setMaxWithdrawAmount}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 text-sm hover:text-purple-300 font-medium"
                        >
                          MAX
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Available: {embeddedBalance.toFixed(6)} SOL
                      </div>
                    </div>

                    {/* Quick Withdraw Amounts */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">Quick Amounts:</label>
                      <div className="grid grid-cols-4 gap-2">
                        {quickAmounts.map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setQuickWithdrawAmount(amt)}
                            disabled={amt > embeddedBalance}
                            className={`py-2 px-2 text-xs rounded-lg transition-all font-medium ${
                              parseFloat(withdrawAmount) === amt
                                ? 'bg-gradient-to-r from-purple-600 to-orange-600 text-white shadow-lg'
                                : amt > embeddedBalance
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {amt} SOL
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Destination Address */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2 font-medium">Destination Address</label>
                      <input
                        type="text"
                        value={destinationAddress}
                        onChange={(e) => {
                          setDestinationAddress(e.target.value);
                          if (e.target.value) {
                            validateAddress(e.target.value);
                          }
                        }}
                        placeholder="Enter Solana wallet address"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-20 transition-all"
                      />
                      {addressError && (
                        <div className="text-red-400 text-sm mt-2 flex items-center">
                          <AlertTriangle size={14} className="mr-1" />
                          {addressError}
                        </div>
                      )}
                    </div>

                    {/* Withdraw Status */}
                    {withdrawStatus && (
                      <div className="bg-purple-900 bg-opacity-30 border border-purple-800 text-purple-400 p-3 rounded-lg">
                        <div className="flex items-center">
                          <Loader size={16} className="animate-spin mr-2" />
                          <span className="text-sm">{withdrawStatus}</span>
                        </div>
                      </div>
                    )}

                    {/* Withdraw Button */}
                    <button
                      onClick={handleEmbeddedWithdraw}
                      disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > embeddedBalance || !destinationAddress || !!addressError}
                      className="w-full bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-4 px-4 rounded-xl transition-all flex items-center justify-center font-bold shadow-lg"
                    >
                      {isWithdrawing ? (
                        <>
                          <Loader size={20} className="animate-spin mr-2" />
                          <span>Processing Instant Withdrawal...</span>
                        </>
                      ) : (
                        <>
                          <Send size={20} className="mr-2" />
                          <span>Instant Withdraw {withdrawAmount || '0'} SOL</span>
                        </>
                      )}
                    </button>

                    {/* Back Button */}
                    <button
                      onClick={() => setActiveStep('transfer')}
                      disabled={isWithdrawing}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-xl transition-all flex items-center justify-center font-medium"
                    >
                      <ArrowLeftRight size={16} className="mr-2" />
                      Back to Transfer Step
                    </button>
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

  // Desktop Layout (same structure but with desktop styling)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl"
      >
        {/* Desktop Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <ArrowUpRight size={24} className="mr-3" />
            Withdraw {tokenSymbol}
            <span className="ml-3 text-xs bg-purple-600 text-white px-3 py-1 rounded-full">
              INSTANT
            </span>
          </h2>
          <button
            onClick={onClose}
            disabled={transferLoading || isWithdrawing}
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
            <h3 className="text-2xl font-bold text-white mb-3">Instant Withdrawal Successful!</h3>
            <p className="text-gray-400 mb-8">{successMessage}</p>
            <button
              onClick={onClose}
              className="bg-gradient-to-r from-green-600 to-purple-600 hover:from-green-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl transition-all font-medium shadow-lg"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Enhanced Balance Display - Desktop */}
            <div className="bg-gradient-to-r from-purple-900 to-blue-900 bg-opacity-50 rounded-xl p-5 mb-6">
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
                  <div className="text-xs text-gray-400 mt-1">Available for transfer</div>
                </div>
                
                <div className="bg-purple-900 bg-opacity-30 rounded-xl p-4">
                  <div className="text-purple-400 text-sm mb-2 flex items-center">
                    💼 Embedded Wallet
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
                  <div className="text-xs text-gray-400 mt-1">Ready for instant withdrawal</div>
                  {embeddedWalletAddress && (
                    <div className="text-xs text-gray-500 mt-1">
                      {embeddedWalletAddress.slice(0, 12)}...{embeddedWalletAddress.slice(-12)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Withdrawal Flow Steps - Desktop */}
            <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-xl p-5 mb-6">
              <div className="flex items-center mb-3">
                <TrendingUp size={20} className="mr-2 text-blue-400" />
                <div className="font-medium text-blue-300 text-lg">Instant Withdrawal Process</div>
              </div>
              <div className="flex items-center justify-between">
                <div className={`flex items-center ${activeStep === 'transfer' ? 'text-blue-300 font-medium' : 'text-gray-400'}`}>
                  <span className="mr-2 text-lg">🎮</span>
                  <div>
                    <div className="text-sm">Game Balance</div>
                    <div className="text-xs opacity-75">{custodialBalance.toFixed(3)} SOL</div>
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-400 mx-4" />
                <div className={`flex items-center ${activeStep === 'withdraw' || embeddedBalance > 0.001 ? 'text-purple-300 font-medium' : 'text-gray-400'}`}>
                  <span className="mr-2 text-lg">💼</span>
                  <div>
                    <div className="text-sm">Embedded Wallet</div>
                    <div className="text-xs opacity-75">{embeddedBalance.toFixed(3)} SOL</div>
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-400 mx-4" />
                <div className="flex items-center text-orange-300">
                  <span className="mr-2 text-lg">🌐</span>
                  <div>
                    <div className="text-sm">External Wallet</div>
                    <div className="text-xs opacity-75">Instant</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Step Content */}
            {activeStep === 'transfer' ? (
              <div className="space-y-6">
                {/* Step 1 content for desktop */}
                <div className="bg-gradient-to-r from-green-900 to-purple-900 bg-opacity-30 border border-green-700 text-green-300 p-5 rounded-xl">
                  <div className="flex items-center mb-3">
                    <Zap size={24} className="mr-3 text-yellow-400" />
                    <div className="font-medium text-lg">Step 1: Move to Embedded Wallet</div>
                  </div>
                  <div className="text-sm opacity-90">
                    Transfer SOL from your game balance to your embedded wallet for external withdrawal.
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">Transfer Amount (SOL)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={transferAmount}
                      onChange={handleTransferAmountChange}
                      placeholder="0.000000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 pr-20 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-20 transition-all text-lg"
                    />
                    <button
                      onClick={setMaxTransferAmount}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-green-300 font-medium"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    Available: {custodialBalance.toFixed(6)} SOL
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">Quick Transfer Amounts:</label>
                  <div className="grid grid-cols-4 gap-3">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setQuickTransferAmount(amt)}
                        disabled={amt > custodialBalance}
                        className={`py-4 px-3 text-sm rounded-xl transition-all font-medium ${
                          parseFloat(transferAmount) === amt
                            ? 'bg-gradient-to-r from-green-600 to-purple-600 text-white shadow-lg transform scale-105'
                            : amt > custodialBalance
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

                {transferStatus && (
                  <div className="bg-blue-900 bg-opacity-30 border border-blue-800 text-blue-400 p-4 rounded-xl">
                    <div className="flex items-center">
                      <Loader size={18} className="animate-spin mr-3" />
                      <span>{transferStatus}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleTransferToEmbedded}
                  disabled={transferLoading || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > custodialBalance}
                  className="w-full bg-gradient-to-r from-green-600 to-purple-600 hover:from-green-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-5 px-4 rounded-xl transition-all flex items-center justify-center font-bold text-lg shadow-lg"
                >
                  {transferLoading ? (
                    <>
                      <Loader size={24} className="animate-spin mr-3" />
                      <span>Processing Transfer...</span>
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight size={24} className="mr-3" />
                      <span>Transfer {transferAmount || '0'} SOL to Embedded Wallet</span>
                    </>
                  )}
                </button>

                {embeddedBalance > 0.001 && (
                  <button
                    onClick={() => setActiveStep('withdraw')}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-xl transition-all flex items-center justify-center font-medium"
                  >
                    <span>Skip - Use Existing Embedded Balance ({embeddedBalance.toFixed(3)} SOL)</span>
                    <ChevronRight size={18} className="ml-2" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Step 2 content for desktop */}
                <div className="bg-gradient-to-r from-purple-900 to-orange-900 bg-opacity-30 border border-purple-700 text-purple-300 p-5 rounded-xl">
                  <div className="flex items-center mb-3">
                    <Send size={24} className="mr-3 text-orange-400" />
                    <div className="font-medium text-lg">Step 2: Instant Auto-Withdraw</div>
                  </div>
                  <div className="text-sm opacity-90">
                    Send SOL directly from your embedded wallet to any external Solana address. Transaction is automatically signed and executed instantly.
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">Withdrawal Amount (SOL)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={withdrawAmount}
                      onChange={handleWithdrawAmountChange}
                      placeholder="0.000000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 pr-20 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-20 transition-all text-lg"
                    />
                    <button
                      onClick={setMaxWithdrawAmount}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-300 font-medium"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    Available: {embeddedBalance.toFixed(6)} SOL (minus network fees)
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">Quick Withdrawal Amounts:</label>
                  <div className="grid grid-cols-4 gap-3">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setQuickWithdrawAmount(amt)}
                        disabled={amt > embeddedBalance}
                        className={`py-4 px-3 text-sm rounded-xl transition-all font-medium ${
                          parseFloat(withdrawAmount) === amt
                            ? 'bg-gradient-to-r from-purple-600 to-orange-600 text-white shadow-lg transform scale-105'
                            : amt > embeddedBalance
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

                <div>
                  <label className="block text-sm text-gray-400 mb-3 font-medium">Destination Address</label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => {
                      setDestinationAddress(e.target.value);
                      if (e.target.value) {
                        validateAddress(e.target.value);
                      }
                    }}
                    placeholder="Enter Solana wallet address (e.g., 7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56)"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-20 transition-all"
                  />
                  {addressError && (
                    <div className="text-red-400 text-sm mt-2 flex items-center">
                      <AlertTriangle size={16} className="mr-2" />
                      {addressError}
                    </div>
                  )}
                </div>

                {withdrawStatus && (
                  <div className="bg-purple-900 bg-opacity-30 border border-purple-800 text-purple-400 p-4 rounded-xl">
                    <div className="flex items-center">
                      <Loader size={18} className="animate-spin mr-3" />
                      <span>{withdrawStatus}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleEmbeddedWithdraw}
                  disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > embeddedBalance || !destinationAddress || !!addressError}
                  className="w-full bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-5 px-4 rounded-xl transition-all flex items-center justify-center font-bold text-lg shadow-lg"
                >
                  {isWithdrawing ? (
                    <>
                      <Loader size={24} className="animate-spin mr-3" />
                      <span>Processing Instant Withdrawal...</span>
                    </>
                  ) : (
                    <>
                      <Send size={24} className="mr-3" />
                      <span>Instant Withdraw {withdrawAmount || '0'} SOL</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setActiveStep('transfer')}
                  disabled={isWithdrawing}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-xl transition-all flex items-center justify-center font-medium"
                >
                  <ArrowLeftRight size={18} className="mr-2" />
                  Back to Transfer Step
                </button>
              </div>
            )}

            {/* Rest of desktop content - similar to mobile but with different styling */}
            {/* [Same step content as mobile but with larger padding, text sizes, etc.] */}

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

export default WithdrawModal;