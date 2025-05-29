import { useState, useEffect } from 'react';
import { ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';

// Import the modals - we'll create proper imports
import DepositModal from '../trading/DepositModal';
import WithdrawModal from '../trading/WithdrawModal';

// Define the TokenType enum locally
enum TokenType {
    SOL = 'SOL',
    RUGGED = 'RUGGED'
}

// Alchemy Solana RPC URL
const ALCHEMY_SOLANA_RPC_URL = 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';

const WalletActions = () => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  
  // Use Privy hooks for authentication and wallet access
  const { authenticated, user, login, ready, createWallet } = usePrivy();
  const { wallets } = useSolanaWallets();
  
  // Find embedded wallet specifically (we don't want external adapters)
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  // Create connection to Solana using Alchemy's endpoint
  const connection = new Connection(ALCHEMY_SOLANA_RPC_URL);
  
  // Use the locally defined TokenType enum
  const currentToken = TokenType.SOL;
  
  // Get wallet address from embedded wallet
  const walletAddress = embeddedWallet?.address || null;
  
  // Handle wallet creation
  const handleCreateWallet = async () => {
    if (!authenticated) return;
    
    setIsCreatingWallet(true);
    try {
      await createWallet();
      // Wallet creation should update the wallets array automatically
    } catch (error) {
      console.error('Error creating wallet:', error);
    } finally {
      setIsCreatingWallet(false);
    }
  };
  
  // Fetch balance when wallet is connected
  useEffect(() => {
    const fetchBalance = async () => {
      if (!authenticated || !walletAddress) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        
        // Validate wallet address before using
        if (!isValidSolanaAddress(walletAddress)) {
          console.error('Invalid wallet address:', walletAddress);
          setIsLoading(false);
          return;
        }
        
        // Get SOL balance from Alchemy's Solana RPC
        const publicKey = safeCreatePublicKey(walletAddress);
        if (!publicKey) {
          console.error('Failed to create PublicKey:', walletAddress);
          setIsLoading(false);
          return;
        }
        
        const balance = await connection.getBalance(publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        
        setBalance(solBalance);
      } catch (error) {
        console.error('Error fetching balance:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBalance();
    
    // Set up polling to refresh balance
    const intervalId = setInterval(fetchBalance, 30000); // Every 30 seconds
    
    return () => clearInterval(intervalId);
  }, [authenticated, walletAddress, connection]);
  
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
            <div className="text-white font-bold">{balance.toFixed(4)} SOL</div>
          </div>
        </div>
      </div>
      
      <div className="flex gap-3">
        <button 
          onClick={() => setIsDepositModalOpen(true)}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium flex items-center justify-center"
        >
          <ArrowUpToLine size={18} className="mr-2" />
          Deposit
        </button>
        
        <button 
          onClick={() => setIsWithdrawModalOpen(true)}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-medium flex items-center justify-center"
        >
          <ArrowDownToLine size={18} className="mr-2" />
          Withdraw
        </button>
      </div>
      
      {/* Modals with correct props */}
      <DepositModal 
        isOpen={isDepositModalOpen} 
        onClose={() => setIsDepositModalOpen(false)} 
        currentToken={currentToken}
        walletAddress={walletAddress!}
        onSuccess={() => {
          // Refresh balance after successful deposit
          if (walletAddress && isValidSolanaAddress(walletAddress)) {
            const publicKey = safeCreatePublicKey(walletAddress);
            if (publicKey) {
              connection.getBalance(publicKey).then(newBalance => {
                setBalance(newBalance / LAMPORTS_PER_SOL);
              }).catch(console.error);
            }
          }
        }}
      />
      
      <WithdrawModal 
  isOpen={isWithdrawModalOpen} 
  onClose={() => setIsWithdrawModalOpen(false)}
  currentToken={currentToken}
  balance={balance}
  walletAddress={walletAddress!}
  userId={null}// Don't pass userId here - let it fallback to wallet address lookup
  onSuccess={() => {
    // Refresh balance after successful withdrawal
    if (walletAddress && isValidSolanaAddress(walletAddress)) {
      const publicKey = safeCreatePublicKey(walletAddress);
      if (publicKey) {
        connection.getBalance(publicKey).then(newBalance => {
          setBalance(newBalance / LAMPORTS_PER_SOL);
        }).catch(console.error);
      }
    }
  }}
/>
    </div>
  );
};

export default WalletActions;