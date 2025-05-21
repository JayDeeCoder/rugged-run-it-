import { useState, useEffect } from 'react';
import { ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import DepositModal from '../trading/DepositModal';
import WithdrawModal from '../../components/trading/WithdrawModal';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

// Define the TokenType enum locally
enum TokenType {
    SOL = 'SOL',
    RUGGED = 'RUGGED'
}

// Solana connection settings
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const WalletActions = () => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  
  // Use Solana wallet adapter to get wallet state
  const { publicKey, connected, connecting } = useWallet();
  
  // Use the locally defined TokenType enum
  const currentToken = TokenType.SOL;
  
  // Get wallet address from publicKey
  const walletAddress = publicKey?.toString() || null;
  
  // Fetch balance when wallet is connected
  useEffect(() => {
    const fetchBalance = async () => {
      if (!connected || !publicKey) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        
        // Create connection to Solana
        const connection = new Connection(SOLANA_RPC_URL);
        
        // Get SOL balance
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
  }, [connected, publicKey]);
  
  // Show connecting state
  if (connecting || isLoading) {
    return (
      <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
        <div className="flex justify-center items-center py-4">
          <div className="animate-pulse text-gray-400">
            {connecting ? 'Connecting to wallet...' : 'Loading wallet information...'}
          </div>
        </div>
      </div>
    );
  }
  
  // Show not connected state
  if (!connected || !walletAddress) {
    return (
      <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
        <div className="flex justify-center items-center py-4">
          <div className="text-gray-400">Please connect your wallet</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
      
      {/* Wallet address and balance display */}
      <div className="mb-4 p-3 bg-gray-800 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-400 mb-1">Wallet Address</div>
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
      
      {/* Modals with real wallet address and balance */}
      <DepositModal 
        isOpen={isDepositModalOpen} 
        onClose={() => setIsDepositModalOpen(false)} 
        currentToken={currentToken}
        walletAddress={walletAddress}
      />
      
      <WithdrawModal 
        isOpen={isWithdrawModalOpen} 
        onClose={() => setIsWithdrawModalOpen(false)}
        currentToken={currentToken}
        balance={balance}
        onSuccess={() => {
          // Refresh wallet data after successful withdrawal
          // In a real app, you might want to manually refresh the balance here
          // rather than doing a full page reload
        }}
      />
    </div>
  );
};

export default WalletActions;