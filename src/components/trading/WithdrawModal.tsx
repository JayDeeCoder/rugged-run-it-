// src/components/modals/WithdrawModal.tsx - COMPACT VERSION WITH PROPER SYNC
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import useOutsideClick from '../../hooks/useOutsideClick';
import { 
  ArrowUpRight,
  Wallet, 
  Check, 
  Loader, 
  X, 
  ArrowLeftRight, 
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Zap,
  ChevronRight,
  Send
} from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { toast } from 'react-hot-toast';

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

// 🚀 FIXED: Use EXACT same embedded wallet balance hook as TradingControls
const useWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);

  // EXACT copy from TradingControls
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
      console.error('❌ useWalletBalance: Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading]);

  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    
    // 🔧 FIXED: Add debouncing to prevent rapid refreshes
    const now = Date.now();
    if (now - lastUpdated < 5000) { // Prevent refresh if less than 5 seconds since last update
      console.log('⚠️ WithdrawModal: Embedded refresh blocked - too frequent');
      return;
    }
    
    console.log(`🔄 Force refreshing wallet balance for: ${walletAddress}`);
    await updateBalance();
  }, [walletAddress, updateBalance, lastUpdated]);

  // EXACT polling setup from TradingControls  
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
      }, 30000); // 30 seconds
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    }
  }, [walletAddress, updateBalance]);

  // EXACT socket listeners from TradingControls (with reduced frequency)
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

      // 🔧 FIXED: Reduced frequency - only refresh every 10 seconds after transaction
      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`🔗 REAL-TIME: Transaction confirmed for ${walletAddress}, will refresh in 10s`);
          setTimeout(forceRefresh, 10000); // Increased from 3000 to 10000
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
  
  // 🚀 CRITICAL FIX: Use actual embedded wallet address
  const embeddedWalletAddress = embeddedWallet?.address || '';
  
  // 🚀 UPDATED: Use shared custodial balance hook (exact same as TradingControls)
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useSharedCustodialBalance(userId || '');
  
  // 🚀 UPDATED: Use exact same embedded wallet balance hook as TradingControls
  const { 
    balance: embeddedBalance, 
    loading: embeddedLoading, 
    forceRefresh: refreshEmbeddedBalance 
  } = useWalletBalance(embeddedWalletAddress);
  
  // State management
  const [activeStep, setActiveStep] = useState<WithdrawStep>('transfer');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  
  // 🚀 FIXED: Add missing state variable for refresh debouncing
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 🚀 FIXED: Use SAME refresh pattern as TradingControls
  const refreshAllBalances = useCallback(() => {
    console.log('🔄 WithdrawModal: Manual refresh triggered by user');
    refreshCustodialBalance();
    if (embeddedWalletAddress) {
      refreshEmbeddedBalance();
    }
  }, [refreshCustodialBalance, refreshEmbeddedBalance, embeddedWalletAddress]);

  // 🚀 FIXED: Use proper custodial withdrawal API (not auto-withdraw)
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
  
    if (amount < 0.002) { // Match minimum from API
      setError('Minimum transfer amount is 0.002 SOL');
      return;
    }
  
    console.log('🚀 WithdrawModal: Starting transfer from custodial to embedded');
    
    setError(null);
    setIsTransferring(true);
    
    const transferToastId = `transfer-${Date.now()}`;
    
    try {
      toast.loading('Processing custodial transfer...', { id: transferToastId });
      
      // 🔧 FIXED: Use the CORRECT API endpoint for custodial withdrawals
       // 🔧 FIXED: Use the CORRECT API endpoint that already exists
    const response = await fetch('/api/transfer/custodial-to-privy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        amount: amount
        // Note: embeddedWalletAddress is retrieved from database in the API
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Transfer failed');
    }

    const result = await response.json();

    if (result.success) {
      console.log('✅ Transfer completed:', result);
      
      toast.success(
        `Successfully transferred ${amount} SOL to embedded wallet!`, 
        { id: transferToastId }
      );
      
      // 🚀 ENHANCED: Force immediate balance refresh after successful transfer
      console.log('🔄 Forcing immediate balance refresh after transfer');
      setTimeout(() => {
        refreshCustodialBalance();
        if (embeddedWalletAddress) {
          refreshEmbeddedBalance();
        }
      }, 2000); // Wait 2 seconds for blockchain confirmation
      
      // Clear transfer amount and move to next step
      setTransferAmount('');
      setActiveStep('withdraw');
      
    } else {
      throw new Error(result.error || 'Transfer failed');
    }
    
  } catch (error) {
    console.error('❌ WithdrawModal: Transfer error:', error);
    
    let errorMessage = 'Transfer failed';
    if (error instanceof Error) {
      if (error.message.includes('Daily transfer limit exceeded')) {
        errorMessage = error.message; // Show detailed limit info
      } else if (error.message.includes('Insufficient custodial balance')) {
        errorMessage = `Insufficient balance. Available: ${custodialBalance.toFixed(3)} SOL`;
      } else if (error.message.includes('Invalid amount')) {
        errorMessage = error.message;
      } else if (error.message.includes('Server configuration error')) {
        errorMessage = 'Service temporarily unavailable. Please try again.';
      } else {
        errorMessage = error.message;
      }
    }
    
    setError(errorMessage);
    toast.error(errorMessage, { id: transferToastId });
  } finally {
    setIsTransferring(false);
  }
}, [
  embeddedWallet, 
  embeddedWalletAddress, 
  userId, 
  transferAmount, 
  custodialBalance,
  refreshCustodialBalance,
  refreshEmbeddedBalance
]);

  // 🚀 ENHANCED: Direct embedded wallet withdrawal (using your useSendTransaction pattern)
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

    console.log('🚀 WithdrawModal: Starting direct embedded wallet withdrawal');
    
    setIsWithdrawing(true);
    setError(null);
    setAddressError(null);
    
    const withdrawToastId = `withdraw-${Date.now()}`;
    
    try {
      toast.loading('Creating withdrawal transaction...', { id: withdrawToastId });
      
      // 🚀 ENHANCED: Direct embedded wallet transaction (using pattern from useSendTransaction)
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
      const connection = new Connection(rpcUrl, 'confirmed');
      
      // Create the transfer transaction
      const fromPubkey = new PublicKey(embeddedWalletAddress);
      const toPubkey = new PublicKey(destinationAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Get a recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: lamports,
        })
      );
      
      // Set transaction properties
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;
      
      toast.loading('Auto-signing transaction...', { id: withdrawToastId });
      
      // Use embedded wallet's sendTransaction method
      const walletWithMethods = embeddedWallet as any;
      let signature: string;
      
      if (typeof walletWithMethods.sendTransaction === 'function') {
        // Try the Privy SDK method first
        signature = await embeddedWallet.sendTransaction(transaction, connection);
      } else {
        // Fallback method
        const serializedTx = transaction.serialize({ requireAllSignatures: false });
        const result = await walletWithMethods.sendTransaction({
          transaction: serializedTx,
          message: 'Please sign this withdrawal transaction'
        });
        signature = result;
      }
      
      console.log('✅ WithdrawModal: Transaction sent with signature:', signature);
      
      toast.loading('Waiting for blockchain confirmation...', { id: withdrawToastId });
      
      // 🚀 ENHANCED: Better confirmation logic with retry and timeout handling
      let confirmed = false;
      let confirmationAttempts = 0;
      const maxAttempts = 3;
      
      while (!confirmed && confirmationAttempts < maxAttempts) {
        try {
          confirmationAttempts++;
          console.log(`🔄 Confirmation attempt ${confirmationAttempts}/${maxAttempts}`);
          
          // Use the same blockhash and lastValidBlockHeight from transaction creation
          const confirmation = await Promise.race([
            connection.confirmTransaction({
              signature,
              blockhash,
              lastValidBlockHeight
            }, 'confirmed'),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Confirmation timeout')), 60000) // 60 second timeout
            )
          ]) as any;
          
          if (confirmation.value?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }
          
          confirmed = true;
          console.log('✅ WithdrawModal: Transaction confirmed on blockchain');
          
        } catch (confirmError: any) {
          console.warn(`⚠️ Confirmation attempt ${confirmationAttempts} failed:`, confirmError);
          
          if (confirmationAttempts >= maxAttempts) {
            // Final attempt failed - check if transaction actually succeeded
            console.log('🔍 Checking transaction status manually...');
            
            try {
              const txInfo = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
              });
              
              if (txInfo && !txInfo.meta?.err) {
                console.log('✅ Transaction actually succeeded! Blockchain confirmed it.');
                confirmed = true;
                break;
              } else if (txInfo?.meta?.err) {
                throw new Error(`Transaction failed on blockchain: ${JSON.stringify(txInfo.meta.err)}`);
              } else {
                // Transaction not found - might still be processing
                console.log('⏳ Transaction not found, but this might be temporary...');
                throw new Error(`Transaction confirmation timed out. Check signature ${signature} on Solana Explorer to verify status.`);
              }
            } catch (statusError) {
              console.error('❌ Failed to check transaction status:', statusError);
              throw new Error(`Transaction may have succeeded but confirmation failed. Check signature ${signature} on Solana Explorer: https://explorer.solana.com/tx/${signature}`);
            }
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      if (!confirmed) {
        throw new Error(`Transaction confirmation failed after ${maxAttempts} attempts. Check signature ${signature} on Solana Explorer.`);
      }
      
      // Success!
      toast.success(`Successfully withdrew ${amount} SOL!`, { id: withdrawToastId });
      
      setSuccess(true);
      setSuccessMessage(`Successfully withdrew ${amount} SOL to ${destinationAddress.slice(0, 8)}...${destinationAddress.slice(-8)}`);
      
      // Balance will refresh automatically in next 30s cycle
      console.log('✅ Withdrawal completed - embedded wallet balance will refresh automatically');
      
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
    }
  }, [
    embeddedWallet, 
    embeddedWalletAddress, 
    destinationAddress, 
    withdrawAmount, 
    embeddedBalance,
    onSuccess
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
      const maxAmount = Math.max(0, embeddedBalance - 0.001);
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
      
      // Single initial refresh when modal opens (same as TradingControls)
      console.log('🔄 WithdrawModal: Initial balance refresh on modal open');
      refreshAllBalances();
    }
  }, [isOpen, refreshAllBalances]);

  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isTransferring && !isWithdrawing) onClose();
  });
  
  if (!isOpen) return null;

  const tokenSymbol = currentToken;
  const quickAmounts = [0.01, 0.05, 0.1, 0.5];

  // 🚀 MOBILE: Much more compact mobile layout
  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-end justify-center z-50">
        <div 
          ref={modalRef} 
          className="bg-[#0d0d0f] border border-gray-800 rounded-t-2xl w-full max-h-[85vh] overflow-y-auto"
        >
          {/* Compact Mobile Header */}
          <div className="flex justify-between items-center p-3 border-b border-gray-800 sticky top-0 bg-[#0d0d0f]">
            <h2 className="text-base font-bold text-white flex items-center">
              <ArrowUpRight size={16} className="mr-2" />
              Withdraw {tokenSymbol}
            </h2>
            <button
              onClick={onClose}
              disabled={isTransferring || isWithdrawing}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="p-3">
            {success ? (
              <div className="text-center py-4">
                <div className="flex justify-center mb-2">
                  <div className="w-8 h-8 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center">
                    <Check size={16} className="text-green-500" />
                  </div>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Success!</h3>
                <p className="text-gray-400 mb-3 text-xs">{successMessage}</p>
                <button
                  onClick={onClose}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-xs w-full"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Ultra Compact Balance Display */}
                <div className="bg-gradient-to-r from-purple-900 to-blue-900 bg-opacity-50 rounded p-2 mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-300 text-xs">Balances</span>
                    <button 
                      onClick={refreshAllBalances}
                      disabled={custodialLoading || embeddedLoading || (Date.now() - lastRefreshTime < 3000)}
                      className="text-blue-400 hover:text-blue-300 transition-colors text-xs"
                    >
                      <RefreshCw size={10} className={(custodialLoading || embeddedLoading) ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="bg-green-900 bg-opacity-30 rounded p-2">
                      <div className="text-green-400 text-xs">🎮</div>
                      <div className="text-white font-bold text-xs">
                        {custodialLoading ? '...' : `${custodialBalance.toFixed(2)}`}
                      </div>
                    </div>
                    
                    <div className="bg-purple-900 bg-opacity-30 rounded p-2">
                      <div className="text-purple-400 text-xs">💼</div>
                      <div className="text-white font-bold text-xs">
                        {embeddedLoading ? '...' : `${embeddedBalance.toFixed(2)}`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ultra Compact Flow */}
                <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded p-2 mb-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className={`flex items-center ${activeStep === 'transfer' ? 'text-blue-300' : 'text-gray-500'}`}>
                      <span>🎮</span>
                    </div>
                    <ChevronRight size={10} className="text-gray-400" />
                    <div className={`flex items-center ${activeStep === 'withdraw' || embeddedBalance > 0.001 ? 'text-purple-300' : 'text-gray-500'}`}>
                      <span>💼</span>
                    </div>
                    <ChevronRight size={10} className="text-gray-400" />
                    <div className="flex items-center text-orange-300">
                      <span>🌐</span>
                    </div>
                  </div>
                </div>

                {/* Ultra Compact Step Content */}
                {activeStep === 'transfer' ? (
                  <div className="space-y-2">
                    <div className="bg-gradient-to-r from-green-900 to-purple-900 bg-opacity-30 border border-green-700 text-green-300 p-2 rounded">
                      <div className="flex items-center">
                        <Zap size={12} className="mr-1 text-yellow-400" />
                        <div className="font-medium text-xs">Move to Wallet</div>
                      </div>
                    </div>

                    <div>
                      <div className="relative">
                        <input
                          type="text"
                          value={transferAmount}
                          onChange={handleTransferAmountChange}
                          placeholder="0.000"
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 pr-10 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none text-xs"
                        />
                        <button
                          onClick={setMaxTransferAmount}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-green-400 text-xs hover:text-green-300"
                        >
                          MAX
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {custodialBalance.toFixed(2)} SOL
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {quickAmounts.map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setQuickTransferAmount(amt)}
                          disabled={amt > custodialBalance}
                          className={`py-1 text-xs rounded transition-all ${
                            parseFloat(transferAmount) === amt
                              ? 'bg-gradient-to-r from-green-600 to-purple-600 text-white'
                              : amt > custodialBalance
                              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {amt}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleTransferToEmbedded}
                      disabled={isTransferring || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > custodialBalance}
                      className="w-full bg-gradient-to-r from-green-600 to-purple-600 hover:from-green-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-2 rounded transition-all flex items-center justify-center text-xs"
                    >
                      {isTransferring ? (
                        <>
                          <Loader size={12} className="animate-spin mr-1" />
                          <span>Moving...</span>
                        </>
                      ) : (
                        <>
                          <ArrowLeftRight size={12} className="mr-1" />
                          <span>Move {transferAmount || '0'}</span>
                        </>
                      )}
                    </button>

                    {embeddedBalance > 0.001 && (
                      <button
                        onClick={() => setActiveStep('withdraw')}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-all flex items-center justify-center text-xs"
                      >
                        <span>Skip ({embeddedBalance.toFixed(2)})</span>
                        <ChevronRight size={12} className="ml-1" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-gradient-to-r from-purple-900 to-orange-900 bg-opacity-30 border border-purple-700 text-purple-300 p-2 rounded">
                      <div className="flex items-center">
                        <Send size={12} className="mr-1 text-orange-400" />
                        <div className="font-medium text-xs">Send Out</div>
                      </div>
                    </div>

                    <div>
                      <div className="relative">
                        <input
                          type="text"
                          value={withdrawAmount}
                          onChange={handleWithdrawAmountChange}
                          placeholder="0.000"
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 pr-10 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none text-xs"
                        />
                        <button
                          onClick={setMaxWithdrawAmount}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-purple-400 text-xs hover:text-purple-300"
                        >
                          MAX
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {embeddedBalance.toFixed(2)} SOL
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {quickAmounts.map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setQuickWithdrawAmount(amt)}
                          disabled={amt > embeddedBalance}
                          className={`py-1 text-xs rounded transition-all ${
                            parseFloat(withdrawAmount) === amt
                              ? 'bg-gradient-to-r from-purple-600 to-orange-600 text-white'
                              : amt > embeddedBalance
                              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {amt}
                        </button>
                      ))}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={destinationAddress}
                        onChange={(e) => {
                          setDestinationAddress(e.target.value);
                          if (e.target.value) {
                            validateAddress(e.target.value);
                          }
                        }}
                        placeholder="Solana address"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none text-xs"
                      />
                      {addressError && (
                        <div className="text-red-400 text-xs mt-1 flex items-center">
                          <AlertTriangle size={10} className="mr-1" />
                          Invalid address
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleEmbeddedWithdraw}
                      disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > embeddedBalance || !destinationAddress || !!addressError}
                      className="w-full bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-2 rounded transition-all flex items-center justify-center text-xs"
                    >
                      {isWithdrawing ? (
                        <>
                          <Loader size={12} className="animate-spin mr-1" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send size={12} className="mr-1" />
                          <span>Send {withdrawAmount || '0'}</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setActiveStep('transfer')}
                      disabled={isWithdrawing}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded transition-all flex items-center justify-center text-xs"
                    >
                      <ArrowLeftRight size={12} className="mr-1" />
                      Back
                    </button>
                  </div>
                )}
                
                {/* Compact Error Message */}
                {error && (
                  <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-400 p-2 rounded mt-2">
                    <div className="flex items-center">
                      <AlertTriangle size={12} className="mr-1 flex-shrink-0" />
                      <span className="text-xs">{error}</span>
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

  // 🚀 DESKTOP: More compact desktop layout
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-xl p-5 max-w-md w-full mx-4 shadow-2xl"
      >
        {/* Compact Desktop Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ArrowUpRight size={20} className="mr-2" />
            Withdraw {tokenSymbol}
            <span className="ml-2 text-xs bg-purple-600 text-white px-2 py-1 rounded-full">
              INSTANT
            </span>
          </h2>
          <button
            onClick={onClose}
            disabled={isTransferring || isWithdrawing}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
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
              className="bg-gradient-to-r from-green-600 to-purple-600 hover:from-green-700 hover:to-purple-700 text-white px-6 py-2 rounded-lg transition-all font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Compact Balance Display - Desktop */}
            <div className="bg-gradient-to-r from-purple-900 to-blue-900 bg-opacity-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-300">Your Balances</span>
                <button 
                  onClick={refreshAllBalances}
                  disabled={custodialLoading || embeddedLoading}
                  className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1 text-sm"
                >
                  <RefreshCw size={14} className={(custodialLoading || embeddedLoading) ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-900 bg-opacity-30 rounded-lg p-3">
                  <div className="text-green-400 text-sm mb-1">🎮 Game Balance</div>
                  <div className="text-white font-bold">
                    {custodialLoading ? (
                      <span className="flex items-center">
                        <Loader size={14} className="animate-spin mr-1" />
                        Loading...
                      </span>
                    ) : (
                      `${custodialBalance.toFixed(3)} SOL`
                    )}
                  </div>
                </div>
                
                <div className="bg-purple-900 bg-opacity-30 rounded-lg p-3">
                  <div className="text-purple-400 text-sm mb-1">💼 Embedded Wallet</div>
                  <div className="text-white font-bold">
                    {embeddedLoading ? (
                      <span className="flex items-center">
                        <Loader size={14} className="animate-spin mr-1" />
                        Loading...
                      </span>
                    ) : (
                      `${embeddedBalance.toFixed(3)} SOL`
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Flow Indicator - Desktop */}
            <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <div className={`flex items-center ${activeStep === 'transfer' ? 'text-blue-300 font-medium' : 'text-gray-400'}`}>
                  <span className="mr-1">🎮</span>
                  <div>
                    <div className="text-xs">Game Balance</div>
                    <div className="text-xs opacity-75">{custodialBalance.toFixed(3)} SOL</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400 mx-2" />
                <div className={`flex items-center ${activeStep === 'withdraw' || embeddedBalance > 0.001 ? 'text-purple-300 font-medium' : 'text-gray-400'}`}>
                  <span className="mr-1">💼</span>
                  <div>
                    <div className="text-xs">Embedded Wallet</div>
                    <div className="text-xs opacity-75">{embeddedBalance.toFixed(3)} SOL</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400 mx-2" />
                <div className="flex items-center text-orange-300">
                  <span className="mr-1">🌐</span>
                  <div>
                    <div className="text-xs">External Wallet</div>
                    <div className="text-xs opacity-75">Instant</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Desktop Step Content */}
            {activeStep === 'transfer' ? (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-green-900 to-purple-900 bg-opacity-30 border border-green-700 text-green-300 p-3 rounded-lg">
                  <div className="flex items-center mb-2">
                    <Zap size={18} className="mr-2 text-yellow-400" />
                    <div className="font-medium">Step 1: Move to Embedded Wallet</div>
                  </div>
                  <div className="text-sm opacity-90">
                    Transfer SOL from game balance to embedded wallet.
                  </div>
                </div>

                <div>
                  <div className="relative">
                    <input
                      type="text"
                      value={transferAmount}
                      onChange={handleTransferAmountChange}
                      placeholder="0.000000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 pr-16 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
                    />
                    <button
                      onClick={setMaxTransferAmount}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-green-300 font-medium text-sm"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Available: {custodialBalance.toFixed(6)} SOL
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setQuickTransferAmount(amt)}
                      disabled={amt > custodialBalance}
                      className={`py-2 px-2 text-sm rounded-lg transition-all font-medium ${
                        parseFloat(transferAmount) === amt
                          ? 'bg-gradient-to-r from-green-600 to-purple-600 text-white'
                          : amt > custodialBalance
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {amt} SOL
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleTransferToEmbedded}
                  disabled={isTransferring || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > custodialBalance}
                  className="w-full bg-gradient-to-r from-green-600 to-purple-600 hover:from-green-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg transition-all flex items-center justify-center font-bold"
                >
                  {isTransferring ? (
                    <>
                      <Loader size={18} className="animate-spin mr-2" />
                      <span>Processing Transfer...</span>
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight size={18} className="mr-2" />
                      <span>Transfer {transferAmount || '0'} SOL</span>
                    </>
                  )}
                </button>

                {embeddedBalance > 0.001 && (
                  <button
                    onClick={() => setActiveStep('withdraw')}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-all flex items-center justify-center font-medium"
                  >
                    <span>Skip - Use Existing Balance ({embeddedBalance.toFixed(3)} SOL)</span>
                    <ChevronRight size={16} className="ml-2" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-purple-900 to-orange-900 bg-opacity-30 border border-purple-700 text-purple-300 p-3 rounded-lg">
                  <div className="flex items-center mb-2">
                    <Send size={18} className="mr-2 text-orange-400" />
                    <div className="font-medium">Step 2: Instant Auto-Withdraw</div>
                  </div>
                  <div className="text-sm opacity-90">
                    Send SOL to any external Solana address instantly.
                  </div>
                </div>

                <div>
                  <div className="relative">
                    <input
                      type="text"
                      value={withdrawAmount}
                      onChange={handleWithdrawAmountChange}
                      placeholder="0.000000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 pr-16 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                    />
                    <button
                      onClick={setMaxWithdrawAmount}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-300 font-medium text-sm"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Available: {embeddedBalance.toFixed(6)} SOL
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setQuickWithdrawAmount(amt)}
                      disabled={amt > embeddedBalance}
                      className={`py-2 px-2 text-sm rounded-lg transition-all font-medium ${
                        parseFloat(withdrawAmount) === amt
                          ? 'bg-gradient-to-r from-purple-600 to-orange-600 text-white'
                          : amt > embeddedBalance
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {amt} SOL
                    </button>
                  ))}
                </div>

                <div>
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                  {addressError && (
                    <div className="text-red-400 text-sm mt-1 flex items-center">
                      <AlertTriangle size={14} className="mr-1" />
                      {addressError}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleEmbeddedWithdraw}
                  disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > embeddedBalance || !destinationAddress || !!addressError}
                  className="w-full bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg transition-all flex items-center justify-center font-bold"
                >
                  {isWithdrawing ? (
                    <>
                      <Loader size={18} className="animate-spin mr-2" />
                      <span>Processing Instant Withdrawal...</span>
                    </>
                  ) : (
                    <>
                      <Send size={18} className="mr-2" />
                      <span>Instant Withdraw {withdrawAmount || '0'} SOL</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setActiveStep('transfer')}
                  disabled={isWithdrawing}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-all flex items-center justify-center font-medium"
                >
                  <ArrowLeftRight size={16} className="mr-2" />
                  Back to Transfer Step
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-400 p-3 rounded-lg mt-4">
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
  );
};

export default WithdrawModal;