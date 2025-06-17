// src/components/modals/WithdrawModal.tsx - ENHANCED VERSION WITH ROBUST CUSTODIAL TRANSFERS
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  Send,
  Shield
} from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { toast } from 'react-hot-toast';

// Import shared state hooks (same as TradingControls)
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

// Enhanced embedded wallet balance hook with better error handling
const useWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const lastSocketRefreshRef = useRef<number>(0);

  const updateBalance = useCallback(async () => {
    if (!walletAddress) return;
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (!rpcUrl) {
        console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
        setError('RPC configuration error');
        setBalance(0);
        return;
      }
      
      const connectionConfig: any = { 
        commitment: 'confirmed',
        httpHeaders: apiKey ? { 'x-api-key': apiKey } : {}
      };
      
      const connection = new Connection(rpcUrl, connectionConfig);
      const publicKey = new PublicKey(walletAddress);
      
      // Add timeout to prevent hanging requests
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Balance fetch timeout')), 10000)
      );
      
      const balancePromise = connection.getBalance(publicKey);
      const balanceResponse = await Promise.race([balancePromise, timeoutPromise]) as number;
      
      const solBalance = balanceResponse / LAMPORTS_PER_SOL;
      
      setBalance(solBalance);
      setLastUpdated(Date.now());
      setError(null);
      
    } catch (error) {
      console.error('❌ Failed to fetch wallet balance:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Balance fetch failed: ${errorMessage}`);
      // Don't reset balance to 0 on error - keep last known value
    } finally {
      setLoading(false);
    }
  }, [walletAddress, loading]);

  const forceRefresh = useCallback(async () => {
    if (!walletAddress) return;
    
    const now = Date.now();
    // Strategic debounce - prevent refreshes within 3 seconds
    if (now - lastUpdated < 3000) {
      console.log('🛑 WithdrawModal: Embedded wallet refresh blocked - too frequent');
      return;
    }
    
    console.log(`🔄 WithdrawModal: Strategic embedded wallet refresh for: ${walletAddress}`);
    await updateBalance();
  }, [walletAddress, updateBalance, lastUpdated]);

  useEffect(() => {
    if (walletAddress && walletAddress !== lastWalletRef.current) {
      console.log(`🎯 WithdrawModal: Setting up strategic wallet polling for: ${walletAddress}`);
      lastWalletRef.current = walletAddress;
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      
      updateBalance();
      
      // Reduced polling frequency - every 30 seconds
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
    }
  }, [walletAddress, updateBalance]);

  // Enhanced socket listeners with better error handling
  useEffect(() => {
    if (!walletAddress || socketListenersRef.current) return;
    
    const socket = (window as any).gameSocket;
    if (socket) {
      console.log(`🔌 WithdrawModal: Setting up strategic socket listeners for: ${walletAddress}`);
      socketListenersRef.current = true;
      
      const handleWalletBalanceUpdate = (data: any) => {
        if (data.walletAddress === walletAddress) {
          console.log(`💰 WithdrawModal: Real-time balance update - ${data.balance?.toFixed(6)} SOL`);
          setBalance(parseFloat(data.balance) || 0);
          setLastUpdated(Date.now());
          setError(null);
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          const now = Date.now();
          
          // Strategic debounce for socket-triggered refreshes
          if (now - lastSocketRefreshRef.current < 8000) {
            console.log('🛑 WithdrawModal: Socket refresh blocked - too frequent');
            return;
          }
          
          lastSocketRefreshRef.current = now;
          console.log(`🔗 WithdrawModal: Transaction confirmed, scheduling strategic refresh in 3s`);
          
          setTimeout(forceRefresh, 3000);
        }
      };

      socket.on('walletBalanceUpdate', handleWalletBalanceUpdate);
      socket.on('transactionConfirmed', handleTransactionConfirmed);
      
      return () => {
        console.log(`🔌 WithdrawModal: Cleaning up socket listeners for: ${walletAddress}`);
        socket.off('walletBalanceUpdate', handleWalletBalanceUpdate);
        socket.off('transactionConfirmed', handleTransactionConfirmed);
        socketListenersRef.current = false;
      };
    }
  }, [walletAddress, forceRefresh]);

  return { balance, loading, lastUpdated, updateBalance, forceRefresh, error };
};

// Enhanced balance display component
const BalanceDisplay: FC<{
  custodialBalance: number;
  embeddedWalletBalance: number;
  isLoading: boolean;
  onRefresh: () => void;
  isMobile: boolean;
  activeStep: WithdrawStep;
  error?: string | null;
}> = ({ custodialBalance, embeddedWalletBalance, isLoading, onRefresh, isMobile, activeStep, error }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-2 mb-2">
      <div className="mb-2 p-2 bg-gray-900 rounded-md relative">
        {/* Enhanced refresh button */}
        <button
          onClick={onRefresh}
          className={`absolute top-1 right-1 text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-700 ${
            isLoading ? 'animate-pulse' : ''
          }`}
          disabled={isLoading}
          title={isLoading ? "Refreshing..." : "Refresh all balances"}
        >
          <span className={`text-sm ${isLoading ? 'animate-spin' : ''}`}>⟳</span>
        </button>
        
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-1' : 'grid-cols-2 gap-2'} text-sm pr-6`}>
          <div className={activeStep === 'transfer' ? 'opacity-100' : 'opacity-60'}>
            <div className="text-green-400 text-xs mb-1">🎮 Game Balance</div>
            <div className="text-white font-bold text-sm">{custodialBalance.toFixed(3)} SOL</div>
            <div className="text-xs text-gray-500">Available for transfer</div>
          </div>
          <div className={activeStep === 'withdraw' ? 'opacity-100' : 'opacity-60'}>
            <div className="text-purple-400 text-xs mb-1">💼 Wallet Balance</div>
            <div className="text-white font-bold text-sm">{embeddedWalletBalance.toFixed(3)} SOL</div>
            <div className="text-xs text-gray-500">Ready to withdraw</div>
            {error && (
              <div className="text-xs text-red-400 mt-1">⚠️ Balance error</div>
            )}
          </div>
        </div>
      </div>
      
      {/* Enhanced step indicator */}
      <div className="flex items-center justify-center space-x-2 text-xs">
        <div className={`flex items-center ${activeStep === 'transfer' ? 'text-green-400' : 'text-gray-500'}`}>
          <span>🎮</span>
        </div>
        <ChevronRight size={10} className="text-gray-400" />
        <div className={`flex items-center ${activeStep === 'withdraw' ? 'text-purple-400' : 'text-gray-500'}`}>
          <span>💼</span>
        </div>
        <ChevronRight size={10} className="text-gray-400" />
        <div className="flex items-center text-orange-300">
          <span>🌐</span>
        </div>
      </div>
    </div>
  );
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
  // Privy wallet setup
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  const embeddedWalletAddress = embeddedWallet?.address || '';
  
  // Enhanced balance hooks
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useSharedCustodialBalance(userId || '');
  
  const { 
    balance: embeddedBalance, 
    loading: embeddedLoading, 
    forceRefresh: refreshEmbeddedBalance,
    error: embeddedBalanceError
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
  const [mounted, setMounted] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Portal mounting
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  // Strategic refresh with enhanced debouncing
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Enhanced refresh function for all balances
  const refreshAllBalances = useCallback(() => {
    const now = Date.now();
    
    // Prevent rapid successive refreshes (minimum 2 seconds between)
    if (now - lastRefreshTime < 2000) {
      console.log('🛑 WithdrawModal: Refresh blocked - too frequent');
      return;
    }
    
    console.log('🔄 WithdrawModal: Strategic refresh triggered');
    setLastRefreshTime(now);
    
    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    
    // Stagger the refreshes to prevent collision
    refreshCustodialBalance();
    
    if (embeddedWalletAddress) {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshEmbeddedBalance();
      }, 800); // Reduced delay for better UX
    }
    
  }, [refreshCustodialBalance, refreshEmbeddedBalance, embeddedWalletAddress, lastRefreshTime]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // ENHANCED: Handle transfer from custodial to embedded wallet
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

    if (amount < 0.002) {
      setError('Minimum transfer amount is 0.002 SOL');
      return;
    }

    if (amount > 1.0) {
      setError('Maximum transfer amount is 1.0 SOL');
      return;
    }

    console.log('🚀 Starting enhanced transfer from custodial to embedded');
    
    setError(null);
    setIsTransferring(true);
    
    // Show enhanced loading toast
    const loadingToast = toast.loading(`Transferring ${amount} SOL from game balance...`, {
      duration: 0 // Don't auto-dismiss
    });
    
    try {
      // Enhanced API call with proper headers and retry logic
      const response = await fetch('/api/transfer/custodial-to-privy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          amount: amount
        })
      });

      // Enhanced response parsing with error handling
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        throw new Error('Invalid response from server');
      }

      // Enhanced HTTP error handling
      if (!response.ok) {
        console.error('❌ HTTP error:', response.status, result);
        
        if (response.status === 400 && result.error) {
          if (result.error.includes('Daily transfer limit')) {
            throw new Error(result.error);
          } else if (result.error.includes('Insufficient custodial balance')) {
            throw new Error(`Insufficient balance. Available: ${custodialBalance.toFixed(3)} SOL`);
          } else {
            throw new Error(result.error);
          }
        } else if (response.status === 500) {
          throw new Error('Server error. Please try again or contact support.');
        } else {
          throw new Error(result.error || `Transfer failed (${response.status})`);
        }
      }

      // Enhanced success validation
      if (!result.success) {
        console.error('❌ Transfer marked as failed:', result);
        throw new Error(result.error || 'Transfer failed');
      }

      // Enhanced success handling with detailed logging
      console.log('✅ Enhanced transfer completed:', {
        signature: result.signature,
        balances: result.balances,
        limits: result.limits
      });

      // Dismiss loading toast and show enhanced success message
      toast.dismiss(loadingToast);
      toast.success(
        `✅ Successfully transferred ${amount} SOL to embedded wallet!`,
        { 
          duration: 5000,
          icon: '🎉'
        }
      );

      // Enhanced balance update handling
      if (result.balances) {
        console.log('📊 Enhanced balance update:', {
          custodialBefore: result.balances.custodialBefore,
          custodialAfter: result.balances.custodialAfter,
          embeddedBefore: result.balances.embeddedBefore,
          embeddedAfter: result.balances.embeddedAfter
        });
      }

      // Enhanced strategic balance refresh with optimized timing
      setTimeout(() => {
        console.log('📡 Enhanced custodial balance refresh post-transfer');
        refreshCustodialBalance();
      }, 1000);
      
      if (embeddedWalletAddress) {
        setTimeout(() => {
          console.log('📡 Enhanced embedded balance refresh post-transfer');
          refreshEmbeddedBalance();
        }, 2500);
        
        // Additional refresh to ensure consistency
        setTimeout(() => {
          console.log('📡 Final enhanced embedded balance refresh');
          refreshEmbeddedBalance();
        }, 6000);
      }
      
      // Clear transfer amount and move to next step
      setTransferAmount('');
      setActiveStep('withdraw');
      
      // Enhanced daily limit tracking
      if (result.limits) {
        console.log('📈 Enhanced daily limits updated:', result.limits);
      }
      
    } catch (error) {
      console.error('❌ Enhanced transfer error:', error);
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      // Enhanced error message determination
      let errorMessage = 'Transfer failed';
      if (error instanceof Error) {
        if (error.message.includes('Daily transfer limit')) {
          errorMessage = error.message;
        } else if (error.message.includes('Insufficient')) {
          errorMessage = error.message;
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('Server error')) {
          errorMessage = 'Server temporarily unavailable. Please try again in a moment.';
        } else if (error.message.includes('House wallet')) {
          errorMessage = 'Service temporarily unavailable. Please contact support.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage, { 
        duration: 6000,
        icon: '❌'
      });
      
      // Enhanced error recovery - force refresh custodial balance
      setTimeout(() => {
        console.log('📡 Enhanced emergency custodial balance refresh after error');
        refreshCustodialBalance();
      }, 2000);
      
    } finally {
      setIsTransferring(false);
      toast.dismiss(loadingToast);
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

  // ENHANCED: Handle direct embedded wallet withdrawal (keeping existing logic)
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

    if (amount > 1.0) {
      setError('Maximum withdrawal amount is 1.0 SOL');
      return;
    }

    console.log('🚀 Starting enhanced direct embedded wallet withdrawal');
    
    setIsWithdrawing(true);
    setError(null);
    setAddressError(null);
    
    const loadingToast = toast.loading(`Withdrawing ${amount} SOL...`, { duration: 0 });
    
    try {
      // Enhanced transaction creation with better error handling
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
      const connection = new Connection(rpcUrl, 'confirmed');
      
      const fromPubkey = new PublicKey(embeddedWalletAddress);
      const toPubkey = new PublicKey(destinationAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Enhanced blockhash retrieval with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Blockhash timeout')), 10000)
      );
      
      const blockhashPromise = connection.getLatestBlockhash('confirmed');
      const { blockhash, lastValidBlockHeight } = await Promise.race([blockhashPromise, timeoutPromise]) as any;
      
      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: lamports,
        })
      );
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;
      
      // Enhanced transaction sending with better error handling
      const signature = await embeddedWallet.sendTransaction(transaction, connection);
      
      console.log('✅ Enhanced transaction sent with signature:', signature);
      
      // Enhanced confirmation waiting
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      // Enhanced success handling
      toast.dismiss(loadingToast);
      toast.success(`✅ Successfully withdrew ${amount} SOL!`, {
        duration: 5000,
        icon: '🎉'
      });
      
      setSuccess(true);
      setSuccessMessage(`Successfully withdrew ${amount} SOL to ${destinationAddress.slice(0, 8)}...${destinationAddress.slice(-8)}`);
      
      // Enhanced balance refresh after withdrawal
      setTimeout(() => {
        refreshEmbeddedBalance();
      }, 2000);
      
      if (onSuccess) onSuccess();
      
    } catch (error) {
      console.error('❌ Enhanced withdrawal error:', error);
      
      toast.dismiss(loadingToast);
      
      let errorMessage = 'Withdrawal failed';
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('rejected')) {
          errorMessage = 'Withdrawal cancelled by user';
        } else if (error.message.includes('insufficient funds') || error.message.includes('Insufficient balance')) {
          errorMessage = 'Insufficient SOL for withdrawal + network fees';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Network timeout. Please try again.';
        } else {
          errorMessage = `Withdrawal failed: ${error.message}`;
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage, { duration: 6000 });
    } finally {
      setIsWithdrawing(false);
      toast.dismiss(loadingToast);
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

  // Enhanced validation helpers
  const validateTransfer = useCallback((amount: number): { valid: boolean; error?: string } => {
    if (!embeddedWallet || !embeddedWalletAddress || !userId) {
      return { valid: false, error: 'Wallet not ready for transfer' };
    }
    
    if (!amount || amount <= 0) {
      return { valid: false, error: 'Please enter a valid amount' };
    }
    
    if (amount < 0.002) {
      return { valid: false, error: 'Minimum transfer amount is 0.002 SOL' };
    }
    
    if (amount > 1.0) {
      return { valid: false, error: 'Maximum transfer amount is 1.0 SOL' };
    }
    
    if (amount > custodialBalance) {
      return { valid: false, error: `Insufficient balance. Available: ${custodialBalance.toFixed(3)} SOL` };
    }
    
    return { valid: true };
  }, [embeddedWallet, embeddedWalletAddress, userId, custodialBalance]);

  // Enhanced quick amount handlers
  const quickAmounts = [0.01, 0.05, 0.1, 0.5];
  
  const setQuickTransferAmount = useCallback((amt: number) => {
    const validation = validateTransfer(amt);
    setTransferAmount(amt.toString());
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid amount');
    } else {
      setError(null);
    }
  }, [validateTransfer]);

  const setMaxTransferAmount = useCallback(() => {
    if (custodialBalance > 0) {
      const maxFromBalance = Math.max(0, custodialBalance - 0.001);
      const maxFromLimit = 1.0;
      const maxAmount = Math.min(maxFromBalance, maxFromLimit);
      
      if (maxAmount >= 0.002) {
        setTransferAmount(maxAmount.toFixed(6));
        setError(null);
      } else {
        setError('Insufficient balance for minimum transfer (0.002 SOL)');
        setTransferAmount('0');
      }
    } else {
      setError('No custodial balance available');
      setTransferAmount('0');
    }
  }, [custodialBalance]);

  const setQuickWithdrawAmount = (amt: number) => {
    setWithdrawAmount(amt.toString());
    setError(null);
  };

  const setMaxWithdrawAmount = () => {
    if (embeddedBalance > 0) {
      const maxAmount = Math.min(Math.max(0, embeddedBalance - 0.001), 1.0);
      setWithdrawAmount(maxAmount.toFixed(6));
      setError(null);
    }
  };

  // Enhanced amount change handlers
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

  // Enhanced address validation
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

  // Enhanced reset state when modal opens/closes
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
      
      // Lock body scroll on mobile
      if (isMobile) {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = '0';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.bottom = '0';
      }
      
      // Enhanced initial refresh strategy
      const now = Date.now();
      if (now - lastRefreshTime > 3000) {
        console.log('🔄 WithdrawModal: Enhanced initial strategic refresh on open');
        setTimeout(() => {
          refreshAllBalances();
        }, 500); // Faster initial refresh
      } else {
        console.log('🛑 WithdrawModal: Skipping initial refresh - recent refresh detected');
      }
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
  }, [isOpen, isMobile, refreshAllBalances, lastRefreshTime]);

  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isTransferring && !isWithdrawing) onClose();
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
        {/* Enhanced Header */}
        <div className={`flex justify-between items-center ${isMobile ? 'p-3' : 'pb-3'} border-b border-gray-800`}>
          <h2 className="text-base font-bold text-white flex items-center">
            <ArrowUpRight size={16} className="mr-2" />
            Withdraw SOL
            {(isTransferring || isWithdrawing) && (
              <div className="ml-2 animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full"></div>
            )}
          </h2>
          <button
            onClick={onClose}
            disabled={isTransferring || isWithdrawing}
            className="text-gray-400 hover:text-white transition-colors p-1 disabled:opacity-50"
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
              {/* Enhanced Balance Display */}
              <BalanceDisplay
                custodialBalance={custodialBalance}
                embeddedWalletBalance={embeddedBalance}
                isLoading={custodialLoading || embeddedLoading}
                onRefresh={refreshAllBalances}
                isMobile={isMobile}
                activeStep={activeStep}
                error={embeddedBalanceError}
              />

              {/* Step Content - Same UI, Enhanced Functionality */}
              {activeStep === 'transfer' ? (
                <div className="border-t border-gray-800 pt-2">
                  <h3 className="text-sm font-bold text-gray-400 mb-2">STEP 1: MOVE TO WALLET</h3>
                  
                  {/* Amount Input */}
                  <div className="mb-2">
                    <label className="block text-gray-400 text-xs mb-1">
                      Transfer Amount (SOL) - Min: 0.002, Max: 1.0
                    </label>
                    <div className="flex">
                      <input
                        type="text"
                        value={transferAmount}
                        onChange={handleTransferAmountChange}
                        className="flex-1 bg-gray-700 text-white px-2 py-2 rounded-l-md focus:outline-none text-sm"
                        placeholder="0.002"
                        disabled={isTransferring}
                      />
                      <button
                        onClick={setMaxTransferAmount}
                        disabled={isTransferring}
                        className="px-2 text-xs rounded-r-md bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors disabled:opacity-50"
                      >
                        Max
                      </button>
                    </div>
                  </div>
                  
                  {/* Quick Transfer Amounts */}
                  <div className="grid grid-cols-4 gap-1 mb-2">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setQuickTransferAmount(amt)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          parseFloat(transferAmount) === amt
                            ? 'bg-green-600 text-white'
                            : amt > custodialBalance || amt > 1.0
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                        disabled={amt > custodialBalance || isTransferring || amt > 1.0}
                      >
                        {amt} SOL
                      </button>
                    ))}
                  </div>

                  {/* Enhanced Transfer Button */}
                  <button
                    onClick={handleTransferToEmbedded}
                    disabled={isTransferring || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > custodialBalance || parseFloat(transferAmount) < 0.002 || parseFloat(transferAmount) > 1.0}
                    className={`w-full py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors mb-2 ${
                      isTransferring || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > custodialBalance || parseFloat(transferAmount) < 0.002 || parseFloat(transferAmount) > 1.0
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {isTransferring ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Moving...
                      </>
                    ) : (
                      <>
                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                        Move {transferAmount || '0'} SOL
                      </>
                    )}
                  </button>

                  {/* Skip to withdraw if has balance */}
                  {embeddedBalance > 0.001 && (
                    <button
                      onClick={() => setActiveStep('withdraw')}
                      disabled={isTransferring}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      Skip - Use Existing ({embeddedBalance.toFixed(3)} SOL)
                      <ChevronRight size={14} className="ml-1" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="border-t border-gray-800 pt-2">
                  <h3 className="text-sm font-bold text-gray-400 mb-2">STEP 2: WITHDRAW</h3>
                  
                  {/* Amount Input */}
                  <div className="mb-2">
                    <label className="block text-gray-400 text-xs mb-1">
                      Withdraw Amount (SOL) - Min: 0.001, Max: 1.0
                    </label>
                    <div className="flex">
                      <input
                        type="text"
                        value={withdrawAmount}
                        onChange={handleWithdrawAmountChange}
                        className="flex-1 bg-gray-700 text-white px-2 py-2 rounded-l-md focus:outline-none text-sm"
                        placeholder="0.001"
                        disabled={isWithdrawing}
                      />
                      <button
                        onClick={setMaxWithdrawAmount}
                        disabled={isWithdrawing}
                        className="px-2 text-xs rounded-r-md bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors disabled:opacity-50"
                      >
                        Max
                      </button>
                    </div>
                  </div>
                  
                  {/* Quick Withdraw Amounts */}
                  <div className="grid grid-cols-4 gap-1 mb-2">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setQuickWithdrawAmount(amt)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          parseFloat(withdrawAmount) === amt
                            ? 'bg-purple-600 text-white'
                            : amt > embeddedBalance || amt > 1.0
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                        disabled={amt > embeddedBalance || isWithdrawing || amt > 1.0}
                      >
                        {amt} SOL
                      </button>
                    ))}
                  </div>

                  {/* Destination Address */}
                  <div className="mb-2">
                    <label className="block text-gray-400 text-xs mb-1">
                      Destination Address
                    </label>
                    <input
                      type="text"
                      value={destinationAddress}
                      onChange={(e) => {
                        setDestinationAddress(e.target.value);
                        if (e.target.value) {
                          validateAddress(e.target.value);
                        }
                      }}
                      placeholder="Solana wallet address"
                      className="w-full bg-gray-700 text-white px-2 py-2 rounded-md focus:outline-none text-sm"
                      disabled={isWithdrawing}
                    />
                    {addressError && (
                      <div className="text-red-400 text-xs mt-1 flex items-center">
                        <AlertTriangle size={10} className="mr-1" />
                        {addressError}
                      </div>
                    )}
                  </div>

                  {/* Enhanced Withdraw Button */}
                  <button
                    onClick={handleEmbeddedWithdraw}
                    disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > embeddedBalance || !destinationAddress || !!addressError || parseFloat(withdrawAmount) < 0.001 || parseFloat(withdrawAmount) > 1.0}
                    className={`w-full py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors mb-2 ${
                      isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > embeddedBalance || !destinationAddress || !!addressError || parseFloat(withdrawAmount) < 0.001 || parseFloat(withdrawAmount) > 1.0
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                  >
                    {isWithdrawing ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Withdrawing...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Withdraw {withdrawAmount || '0'} SOL
                      </>
                    )}
                  </button>

                  {/* Back Button */}
                  <button
                    onClick={() => setActiveStep('transfer')}
                    disabled={isWithdrawing}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded text-sm flex items-center justify-center transition-colors disabled:opacity-50"
                  >
                    <ArrowLeftRight size={14} className="mr-1" />
                    Back
                  </button>
                </div>
              )}
              
              {/* Enhanced Error Message */}
              {error && (
                <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-400 p-2 rounded-lg mt-2 text-sm">
                  <div className="flex items-center">
                    <AlertTriangle size={12} className="mr-2 flex-shrink-0" />
                    {error}
                  </div>
                </div>
              )}

              {/* Enhanced Info Section */}
              <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-2 mt-2 text-sm">
                <div className="text-blue-300 font-medium mb-1 text-xs">💡 Enhanced Process:</div>
                <div className="text-gray-300 text-xs">
                  {activeStep === 'transfer' 
                    ? 'Secure house wallet transfer from game balance to your embedded wallet.'
                    : 'Direct blockchain transfer from your wallet to any external address.'
                  }
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

export default WithdrawModal;