// src/components/wallets/WalletActions.tsx
import { useState, useEffect } from 'react';
import { ArrowUpToLine, ArrowDownToLine, ArrowRightLeft, Zap } from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';
import { UserAPI } from '../../services/api';
import { usePrivyAutoTransfer } from '../../hooks/usePrivyAutoTransfer';

// Import the modals
import DepositModal from '../trading/DepositModal';
import WithdrawModal from '../trading/WithdrawModal';

// Define the TokenType enum locally
enum TokenType {
    SOL = 'SOL',
    RUGGED = 'RUGGED'
}

const WalletActions = () => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState<string>('');
  
  // Use Privy hooks for authentication and wallet access
  const { authenticated, user, login, ready, createWallet } = usePrivy();
  
  // Use the auto-transfer hook
  const {
    loading: transferLoading,
    error: transferError,
    lastTransfer,
    embeddedWallet,
    walletAddress,
    executeAutoTransfer,
    executeDirectWithdrawal,
    checkDailyLimits,
    getPrivyBalance,
    registerPrivyWallet,
    clearError
  } = usePrivyAutoTransfer();
  
  // Use the locally defined TokenType enum
  const currentToken = TokenType.SOL;
  
  // Get or create user when wallet connects
  useEffect(() => {
    if (authenticated && walletAddress) {
      const initUser = async () => {
        try {
          console.log(`🔗 Getting user for wallet: ${walletAddress}`);
          const userData = await UserAPI.getUserOrCreate(walletAddress);
          if (userData) {
            setUserId(userData.id);
            console.log(`👤 WalletActions User ID: ${userData.id}`);
            
            // Register the Privy wallet
            await registerPrivyWallet(userData.id);
          }
        } catch (error) {
          console.error('❌ Could not get user data:', error);
        }
      };
      initUser();
    }
  }, [authenticated, walletAddress, registerPrivyWallet]);
  
  // Handle wallet creation
  const handleCreateWallet = async () => {
    if (!authenticated) return;
    
    setIsCreatingWallet(true);
    try {
      await createWallet();
    } catch (error) {
      console.error('Error creating wallet:', error);
    } finally {
      setIsCreatingWallet(false);
    }
  };
  
  // Fetch balance from blockchain
  useEffect(() => {
    const fetchBalance = async () => {
      console.log('🔍 WalletActions fetchBalance called:', {
        embeddedWallet: !!embeddedWallet,
        walletAddress,
        authenticated
      });
      
      if (!embeddedWallet || !walletAddress || !authenticated) {
        console.log('❌ WalletActions: Missing required conditions');
        setBalance(0);
        return;
      }

      try {
        console.log('🚀 WalletActions: Starting balance fetch...');
        setIsLoading(true);
        
        if (!isValidSolanaAddress(walletAddress)) {
          console.error('Invalid wallet address:', walletAddress);
          setBalance(0);
          return;
        }
        
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        
        if (!rpcUrl) {
          console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
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
        const publicKey = safeCreatePublicKey(walletAddress);
        
        if (!publicKey) {
          console.error('Failed to create PublicKey for address:', walletAddress);
          setBalance(0);
          return;
        }
        
        const lamports = await connection.getBalance(publicKey);
        const solBalance = lamports / LAMPORTS_PER_SOL;
        
        console.log(`✅ WalletActions balance fetched: ${solBalance.toFixed(6)} SOL`);
        setBalance(solBalance);
      } catch (error) {
        console.error('❌ Failed to fetch wallet balance:', error);
        setBalance(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();
    
    const intervalId = setInterval(fetchBalance, 30000);
    return () => clearInterval(intervalId);
  }, [embeddedWallet, walletAddress, authenticated]);
  
  // Refresh balance function
  const refreshBalance = async () => {
    if (!embeddedWallet || !walletAddress || !authenticated) return;
    
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        console.error('Invalid wallet address:', walletAddress);
        return;
      }
      
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      
      if (!rpcUrl) {
        console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
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
      const publicKey = safeCreatePublicKey(walletAddress);
      
      if (!publicKey) {
        console.error('Failed to create PublicKey for address:', walletAddress);
        return;
      }
      
      const lamports = await connection.getBalance(publicKey);
      const solBalance = lamports / LAMPORTS_PER_SOL;
      setBalance(solBalance);
      console.log(`🔄 Balance refreshed: ${solBalance.toFixed(6)} SOL`);
    } catch (error) {
      console.error('Error refreshing balance:', error);
    }
  };
  
  // Handle auto-transfer
  const handleAutoTransfer = async () => {
    if (!userId || !transferAmount) return;
    
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    try {
      const result = await executeAutoTransfer(userId, amount);
      
      if (result.success) {
        alert(`Transfer successful! Transaction: ${result.transactionId}`);
        setTransferAmount('');
        setShowTransferModal(false);
        await refreshBalance();
      } else {
        alert(`Transfer failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Transfer error:', error);
      alert('Transfer failed');
    }
  };
  
  // Show loading state while Privy is initializing
  if (!ready) {
    return (
      <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
        <div className="flex justify-center items-center py-4">
          <div className="animate-pulse text-gray-400">
            Initializing wallet...
          </div>
        </div>
      </div>
    );
  }
  
  // Show login prompt if not authenticated
  if (!authenticated) {
    return (
      <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
        <div className="flex flex-col items-center justify-center py-4">
          <div className="text-gray-400 mb-4">Please login to access your wallet</div>
          <button 
            onClick={() => login()}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium"
          >
            Login with Privy
          </button>
        </div>
      </div>
    );
  }
  
  // Show wallet creation UI if authenticated but no embedded wallet
  if (authenticated && !walletAddress) {
    return (
      <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
        <div className="flex flex-col items-center justify-center py-4">
          <div className="text-gray-400 mb-4">You need an embedded wallet to continue</div>
          <button 
            onClick={handleCreateWallet}
            disabled={isCreatingWallet}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium"
          >
            {isCreatingWallet ? 'Creating Wallet...' : 'Create Embedded Wallet'}
          </button>
        </div>
      </div>
    );
  }
  
  // Show connecting state
  if (isLoading && authenticated) {
    return (
      <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
        <div className="flex justify-center items-center py-4">
          <div className="animate-pulse text-gray-400">
            Loading wallet information...
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
      
      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 bg-gray-900 p-2 rounded text-xs">
          <div className="text-gray-400">Debug Info:</div>
          <div className="text-green-400">UserId: {userId || 'Loading...'}</div>
          <div className="text-blue-400">WalletAddress: {walletAddress || 'None'}</div>
          <div className="text-yellow-400">Authenticated: {authenticated ? 'Yes' : 'No'}</div>
          <div className="text-orange-400">EmbeddedWallet: {embeddedWallet ? 'Found' : 'None'}</div>
          <div className="text-purple-400">TransferLoading: {transferLoading ? 'Yes' : 'No'}</div>
          <div className="text-pink-400">TransferError: {transferError || 'None'}</div>
          <div className="text-white">Balance: {balance} SOL</div>
        </div>
      )}
      
      {/* Transfer error display */}
      {transferError && (
        <div className="mb-4 bg-red-900 border border-red-600 rounded-lg p-3">
          <div className="text-red-400 text-sm">Transfer Error:</div>
          <div className="text-red-200 text-sm">{transferError}</div>
          <button 
            onClick={clearError}
            className="mt-2 text-xs text-red-300 hover:text-red-100 underline"
          >
            Clear Error
          </button>
        </div>
      )}
      
      {/* Success message */}
      {lastTransfer && lastTransfer.success && (
        <div className="mb-4 bg-green-900 border border-green-600 rounded-lg p-3">
          <div className="text-green-400 text-sm">Transfer Successful!</div>
          <div className="text-green-200 text-sm">Transaction: {lastTransfer.transactionId}</div>
          {lastTransfer.newBalance && (
            <div className="text-green-300 text-xs">New Balance: {lastTransfer.newBalance.toFixed(6)} SOL</div>
          )}
        </div>
      )}
      
      {/* User info display */}
      {user && (
        <div className="mb-4 bg-gray-800 rounded-lg p-3">
          <div className="text-sm text-gray-400 mb-1">Logged in as</div>
          <div className="text-white">
            {user.email?.address || user.google?.email || 'User'}
          </div>
        </div>
      )}
      
      {/* Embedded wallet display */}
      <div className="mb-4 p-3 bg-gray-800 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400 mb-1">Embedded Wallet</div>
            <div className="text-white font-mono text-sm truncate">{walletAddress}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400 mb-1">Balance</div>
            <div className="text-white font-bold">
              {isLoading ? (
                <span className="text-yellow-400">Loading...</span>
              ) : (
                `${balance.toFixed(6)} SOL`
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button 
          onClick={() => setIsDepositModalOpen(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium flex items-center justify-center"
        >
          <ArrowUpToLine size={18} className="mr-2" />
          Deposit
        </button>
        
        <button 
          onClick={() => setIsWithdrawModalOpen(true)}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-medium flex items-center justify-center"
        >
          <ArrowDownToLine size={18} className="mr-2" />
          Withdraw
        </button>
      </div>
      
      {/* Auto-transfer button */}
      <button 
        onClick={() => setShowTransferModal(true)}
        disabled={transferLoading || !userId}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-medium flex items-center justify-center mb-2"
      >
        {transferLoading ? (
          <>
            <Zap size={18} className="mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <ArrowRightLeft size={18} className="mr-2" />
            Quick Transfer to Game
          </>
        )}
      </button>
      
      {/* Quick transfer modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">Quick Transfer</h3>
            <p className="text-gray-300 text-sm mb-4">
              Transfer SOL from your Privy wallet to your game balance instantly.
            </p>
            
            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-2">Amount (SOL)</label>
              <input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="0.0"
                step="0.001"
                min="0.001"
                max={balance}
                className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
              <div className="text-xs text-gray-400 mt-1">
                Available: {balance.toFixed(6)} SOL
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferAmount('');
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleAutoTransfer}
                disabled={transferLoading || !transferAmount}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded"
              >
                {transferLoading ? 'Processing...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modals - FIXED: Removed onDirectWithdrawal prop */}
      <DepositModal 
        isOpen={isDepositModalOpen} 
        onClose={() => setIsDepositModalOpen(false)} 
        currentToken={currentToken}
        walletAddress={walletAddress!}
        onSuccess={() => {
          refreshBalance();
        }}
      />
      
      <WithdrawModal 
        isOpen={isWithdrawModalOpen} 
        onClose={() => setIsWithdrawModalOpen(false)}
        currentToken={currentToken}
        balance={balance}
        walletAddress={walletAddress!}
        userId={userId}
        onSuccess={() => {
          refreshBalance();
        }}
      />
    </div>
  );
};

export default WalletActions;