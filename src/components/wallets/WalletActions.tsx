import { useState, useEffect } from 'react';
import { ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';
import { UserAPI } from '../../services/api';

// Import the modals - we'll create proper imports
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
  const [userId, setUserId] = useState<string | null>(null); // Add userId state
  
  // Use Privy hooks for authentication and wallet access
  const { authenticated, user, login, ready, createWallet } = usePrivy();
  const { wallets } = useSolanaWallets();
  
  // Find embedded wallet specifically (we don't want external adapters)
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  // Use the locally defined TokenType enum
  const currentToken = TokenType.SOL;
  
  // Get wallet address from embedded wallet
  const walletAddress = embeddedWallet?.address || null;
  
  // 🔧 FIXED: Get or create user when wallet connects (same as TradingControls)
  useEffect(() => {
    if (authenticated && walletAddress) {
      const initUser = async () => {
        try {
          console.log(`🔗 Getting user for wallet: ${walletAddress}`);
          const userData = await UserAPI.getUserOrCreate(walletAddress);
          if (userData) {
            setUserId(userData.id);
            console.log(`👤 WalletActions User ID: ${userData.id}`);
          }
        } catch (error) {
          console.error('❌ Could not get user data:', error);
        }
      };
      initUser();
    }
  }, [authenticated, walletAddress]);
  
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
  
  // 🔧 FIXED: Use EXACT same balance fetching method as working Navbar
  useEffect(() => {
    const fetchBalance = async () => {
      console.log('🔍 WalletActions fetchBalance called:', {
        embeddedWallet: !!embeddedWallet,
        walletAddress,
        authenticated
      });
      
      // EXACT same condition check as Navbar
      if (!embeddedWallet || !walletAddress || !authenticated) {
        console.log('❌ WalletActions: Missing required conditions');
        setBalance(0);
        return;
      }

      try {
        console.log('🚀 WalletActions: Starting balance fetch...');
        setIsLoading(true);
        
        // EXACT same validation as Navbar
        if (!isValidSolanaAddress(walletAddress)) {
          console.error('Invalid wallet address:', walletAddress);
          setBalance(0);
          return;
        }
        
        // EXACT same RPC configuration as Navbar
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        
        console.log('🔧 WalletActions RPC config:', {
          rpcUrl: rpcUrl?.substring(0, 50) + '...',
          hasApiKey: !!apiKey
        });
        
        if (!rpcUrl) {
          console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
          setBalance(0);
          return;
        }
        
        // EXACT same connection config as Navbar
        const connectionConfig: any = {
          commitment: 'confirmed',
        };
        
        if (apiKey) {
          connectionConfig.httpHeaders = {
            'x-api-key': apiKey
          };
        }
        
        console.log('🔗 WalletActions: Creating connection...');
        const connection = new Connection(rpcUrl, connectionConfig);
        
        // EXACT same PublicKey creation as Navbar
        console.log('🔑 WalletActions: Creating PublicKey...');
        const publicKey = safeCreatePublicKey(walletAddress);
        if (!publicKey) {
          console.error('Failed to create PublicKey for address:', walletAddress);
          setBalance(0);
          return;
        }
        
        // EXACT same balance fetching as Navbar
        console.log('💰 WalletActions: Fetching balance from RPC...');
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
    
    // EXACT same interval setup as Navbar
    const intervalId = setInterval(fetchBalance, 30000);
    return () => clearInterval(intervalId);
  }, [embeddedWallet, walletAddress, authenticated]); // EXACT same dependencies as Navbar
  
  // 🔧 FIXED: Balance refresh function using EXACT same method as Navbar
  const refreshBalance = async () => {
    if (!embeddedWallet || !walletAddress || !authenticated) return;
    
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        console.error('Invalid wallet address:', walletAddress);
        return;
      }
      
      // EXACT same RPC configuration as Navbar
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
          <div className="text-cyan-400">Ready: {ready ? 'Yes' : 'No'}</div>
          <div className="text-purple-400">RPC URL: {process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.substring(0, 50)}...</div>
          <div className="text-pink-400">API Key: {process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ? 'Set' : 'Not Set'}</div>
          <div className="text-red-400">IsLoading: {isLoading ? 'Yes' : 'No'}</div>
          <div className="text-white">Balance: {balance} SOL</div>
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
      
      {/* 🔧 FIXED: Modals with correct props */}
      <DepositModal 
        isOpen={isDepositModalOpen} 
        onClose={() => setIsDepositModalOpen(false)} 
        currentToken={currentToken}
        walletAddress={walletAddress!}
        onSuccess={() => {
          // Refresh balance after successful deposit using same method as Navbar
          refreshBalance();
        }}
      />
      
      <WithdrawModal 
        isOpen={isWithdrawModalOpen} 
        onClose={() => setIsWithdrawModalOpen(false)}
        currentToken={currentToken}
        balance={balance}
        walletAddress={walletAddress!}
        userId={userId} // 🔧 FIXED: Now passes the actual userId
        onSuccess={() => {
          // Refresh balance after successful withdrawal using same method as Navbar
          refreshBalance();
        }}
      />
    </div>
  );
};

export default WalletActions;