// src/components/modals/WithdrawModal.tsx - STREAMLINED VERSION MATCHING DEPOSITMODAL
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

// Same embedded wallet balance hook with strategic refresh
const useWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWalletRef = useRef<string>('');
  const socketListenersRef = useRef<boolean>(false);
  const lastSocketRefreshRef = useRef<number>(0);

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
    
    const now = Date.now();
    // Strategic debounce - prevent refreshes within 5 seconds
    if (now - lastUpdated < 5000) {
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

  // Strategic socket listeners with smart debouncing
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
        }
      };

      const handleTransactionConfirmed = (data: any) => {
        if (data.walletAddress === walletAddress) {
          const now = Date.now();
          
          // Strategic debounce for socket-triggered refreshes
          if (now - lastSocketRefreshRef.current < 10000) {
            console.log('🛑 WithdrawModal: Socket refresh blocked - too frequent');
            return;
          }
          
          lastSocketRefreshRef.current = now;
          console.log(`🔗 WithdrawModal: Transaction confirmed, scheduling strategic refresh in 5s`);
          
          setTimeout(forceRefresh, 5000); // Increased delay to 5 seconds
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

  return { balance, loading, lastUpdated, updateBalance, forceRefresh };
};

// Compact balance display component
const BalanceDisplay: FC<{
  custodialBalance: number;
  embeddedWalletBalance: number;
  isLoading: boolean;
  onRefresh: () => void;
  isMobile: boolean;
  activeStep: WithdrawStep;
}> = ({ custodialBalance, embeddedWalletBalance, isLoading, onRefresh, isMobile, activeStep }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-2 mb-2">
      <div className="mb-2 p-2 bg-gray-900 rounded-md relative">
        {/* Refresh button in top right */}
        <button
          onClick={onRefresh}
          className="absolute top-1 right-1 text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-700"
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
          </div>
        </div>
      </div>
      
      {/* Compact step indicator */}
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
  
  // Same balance hooks as TradingControls and DepositModal
  const { 
    custodialBalance, 
    loading: custodialLoading, 
    forceRefresh: refreshCustodialBalance 
  } = useSharedCustodialBalance(userId || '');
  
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
  const [mounted, setMounted] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Portal mounting
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  // Strategic refresh with debouncing
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refresh function for all balances with strategic timing
  const refreshAllBalances = useCallback(() => {
    const now = Date.now();
    
    // Prevent rapid successive refreshes (minimum 3 seconds between)
    if (now - lastRefreshTime < 3000) {
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
      }, 1000); // 1 second delay between balance refreshes
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

  // Handle transfer from custodial to embedded wallet
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
  
    console.log('🚀 Starting transfer from custodial to embedded');
    
    setError(null);
    setIsTransferring(true);
    
    try {
      const response = await fetch('/api/transfer/custodial-to-privy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          amount: amount
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transfer failed');
      }

      const result = await response.json();

      if (result.success) {
        console.log('✅ Transfer completed:', result);
        
        toast.success(`Successfully transferred ${amount} SOL to embedded wallet!`);
        
        // Force immediate balance refresh with strategic timing
        setTimeout(() => {
          console.log('📡 Refreshing custodial balance post-custodial-transfer');
          refreshCustodialBalance();
        }, 2000);
        
        if (embeddedWalletAddress) {
          setTimeout(() => {
            console.log('📡 Refreshing embedded balance post-custodial-transfer');
            refreshEmbeddedBalance();
          }, 4000);
        }
        
        // Clear transfer amount and move to next step
        setTransferAmount('');
        setActiveStep('withdraw');
        
      } else {
        throw new Error(result.error || 'Transfer failed');
      }
    } catch (error) {
      console.error('❌ Transfer error:', error);
      
      let errorMessage = 'Transfer failed';
      if (error instanceof Error) {
        if (error.message.includes('Daily transfer limit exceeded')) {
          errorMessage = error.message;
        } else if (error.message.includes('Insufficient custodial balance')) {
          errorMessage = `Insufficient balance. Available: ${custodialBalance.toFixed(3)} SOL`;
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
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

  // Handle direct embedded wallet withdrawal
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

    console.log('🚀 Starting direct embedded wallet withdrawal');
    
    setIsWithdrawing(true);
    setError(null);
    setAddressError(null);
    
    try {
      // Create the transfer transaction
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
      const connection = new Connection(rpcUrl, 'confirmed');
      
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
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;
      
      // Send transaction
      const signature = await embeddedWallet.sendTransaction(transaction, connection);
      
      console.log('✅ Transaction sent with signature:', signature);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      // Success!
      toast.success(`Successfully withdrew ${amount} SOL!`);
      
      setSuccess(true);
      setSuccessMessage(`Successfully withdrew ${amount} SOL to ${destinationAddress.slice(0, 8)}...${destinationAddress.slice(-8)}`);
      
      if (onSuccess) onSuccess();
      
    } catch (error) {
      console.error('❌ Withdrawal error:', error);
      
      let errorMessage = 'Withdrawal failed';
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('rejected')) {
          errorMessage = 'Withdrawal cancelled by user';
        } else if (error.message.includes('insufficient funds') || error.message.includes('Insufficient balance')) {
          errorMessage = 'Insufficient SOL for withdrawal + network fees';
        } else {
          errorMessage = `Withdrawal failed: ${error.message}`;
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
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
  const quickAmounts = [0.01, 0.05, 0.1, 0.5];
  
  const setQuickTransferAmount = (amt: number) => {
    setTransferAmount(amt.toString());
    setError(null);
  };

  const setMaxTransferAmount = () => {
    if (custodialBalance > 0) {
      const maxAmount = Math.min(Math.max(0, custodialBalance - 0.001), 1.0);
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
      const maxAmount = Math.min(Math.max(0, embeddedBalance - 0.001), 1.0);
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

  // Reset state when modal opens/closes with strategic refresh
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
      
      // Strategic initial refresh - only if modal just opened
      const now = Date.now();
      if (now - lastRefreshTime > 5000) { // Only refresh if it's been 5+ seconds
        console.log('🔄 WithdrawModal: Initial strategic refresh on open');
        setTimeout(() => {
          refreshAllBalances();
        }, 1000); // 1 second delay after modal opens
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
        {/* Header */}
        <div className={`flex justify-between items-center ${isMobile ? 'p-3' : 'pb-3'} border-b border-gray-800`}>
          <h2 className="text-base font-bold text-white flex items-center">
            <ArrowUpRight size={16} className="mr-2" />
            Withdraw SOL
          </h2>
          <button
            onClick={onClose}
            disabled={isTransferring || isWithdrawing}
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
              {/* Balance Display */}
              <BalanceDisplay
                custodialBalance={custodialBalance}
                embeddedWalletBalance={embeddedBalance}
                isLoading={custodialLoading || embeddedLoading}
                onRefresh={refreshAllBalances}
                isMobile={isMobile}
                activeStep={activeStep}
              />

              {/* Step Content */}
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
                      />
                      <button
                        onClick={setMaxTransferAmount}
                        className="px-2 text-xs rounded-r-md bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
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

                  {/* Transfer Button */}
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
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center transition-colors"
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
                      />
                      <button
                        onClick={setMaxWithdrawAmount}
                        className="px-2 text-xs rounded-r-md bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
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
                    />
                    {addressError && (
                      <div className="text-red-400 text-xs mt-1 flex items-center">
                        <AlertTriangle size={10} className="mr-1" />
                        {addressError}
                      </div>
                    )}
                  </div>

                  {/* Withdraw Button */}
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
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded text-sm flex items-center justify-center transition-colors"
                  >
                    <ArrowLeftRight size={14} className="mr-1" />
                    Back
                  </button>
                </div>
              )}
              
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
                <div className="text-blue-300 font-medium mb-1 text-xs">💡 How it works:</div>
                <div className="text-gray-300 text-xs">
                  {activeStep === 'transfer' 
                    ? 'Move SOL from game balance to your embedded wallet first.'
                    : 'Send SOL directly from your wallet to any external address.'
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