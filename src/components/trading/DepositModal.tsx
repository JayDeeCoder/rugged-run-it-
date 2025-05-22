// src/components/trading/DepositModal.tsx
import { FC, useRef, useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import useOutsideClick from '../../hooks/useOutsideClick';
import { X, Copy, Check } from 'lucide-react';

// Define enum locally instead of importing
enum TokenType {
    SOL = 'SOL',
    RUGGED = 'RUGGED'
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentToken: TokenType;
  walletAddress: string; // Add wallet address prop
}

const DepositModal: FC<DepositModalProps> = ({ 
  isOpen, 
  onClose, 
  currentToken,
  walletAddress 
}) => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const modalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  
  // Get embedded wallet
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const actualWalletAddress = embeddedWallet?.address || walletAddress;
  
  // Handle clicks outside the modal
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen) onClose();
  });
  
  // Fetch real balance from blockchain
  useEffect(() => {
    const fetchBalance = async () => {
      if (authenticated && actualWalletAddress && currentToken === TokenType.SOL) {
        try {
          setIsLoadingBalance(true);
          
          // Create Solana connection using Alchemy RPC
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
          const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '6CqgIf5nqVF9rWeernULokib0PAr6yh3';
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            httpHeaders: {
              'x-api-key': apiKey
            }
          });
          
          // Get actual balance from blockchain
          const publicKey = new PublicKey(actualWalletAddress);
          const lamports = await connection.getBalance(publicKey);
          const solBalance = lamports / LAMPORTS_PER_SOL;
          
          setCurrentBalance(solBalance);
        } catch (error) {
          console.error('Failed to fetch wallet balance:', error);
          setCurrentBalance(0);
        } finally {
          setIsLoadingBalance(false);
        }
      } else if (currentToken === TokenType.RUGGED) {
        // For RUGGED tokens, use localStorage or API
        const savedBalance = localStorage.getItem(`rugged_balance_${actualWalletAddress}`);
        setCurrentBalance(savedBalance ? parseFloat(savedBalance) : 0);
      } else {
        setCurrentBalance(0);
      }
    };

    if (isOpen) {
      fetchBalance();
    }
  }, [authenticated, actualWalletAddress, currentToken, isOpen]);
  
  // Don't render if not open
  if (!isOpen) return null;
  
  // Get token symbol
  const tokenSymbol = currentToken;
  
  // Function to copy address to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(actualWalletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Format address for display (truncate)
  const formatAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">
            Deposit {tokenSymbol}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Current Balance */}
        <div className="bg-gray-800 p-4 rounded-md mb-6">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Current Balance</span>
            <span className="text-xl font-bold text-white">
              {isLoadingBalance ? 'Loading...' : `${currentBalance.toFixed(6)} ${tokenSymbol}`}
            </span>
          </div>
        </div>
        
        {/* Wallet Address Display with copy button */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2 text-sm">
            Your Wallet Address
          </label>
          <div className="flex bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
            <div className="flex-1 p-4 font-mono text-white break-all overflow-x-auto">
              {actualWalletAddress || 'No wallet connected'}
            </div>
            {actualWalletAddress && (
              <button 
                onClick={copyToClipboard}
                className="bg-gray-700 px-3 hover:bg-gray-600 transition-colors flex items-center"
                title="Copy address"
              >
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
              </button>
            )}
          </div>
          <div className="text-center mt-2 text-xs text-gray-400">
            Send {tokenSymbol} only to this address
          </div>
        </div>
        
        {/* QR Code placeholder - can be implemented with a QR code library */}
        {actualWalletAddress && (
          <div className="flex justify-center mb-6">
            <div className="w-48 h-48 bg-white p-2 rounded-md flex items-center justify-center">
              <div className="text-black text-xs text-center">
                QR Code for {formatAddress(actualWalletAddress)}
                <br />
                (Use a QR code library to implement)
              </div>
            </div>
          </div>
        )}
        
        {/* Warning */}
        <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-4 rounded-md mb-6 text-sm">
          <p>Important: Only send {tokenSymbol} to this address. Sending any other assets may result in permanent loss.</p>
        </div>
        
        {/* Wallet connection status */}
        {!authenticated && (
          <div className="bg-red-900 bg-opacity-20 border border-red-800 text-red-500 p-4 rounded-md text-sm">
            <p>Please login to access your wallet address.</p>
          </div>
        )}
        
        {authenticated && !actualWalletAddress && (
          <div className="bg-orange-900 bg-opacity-20 border border-orange-800 text-orange-500 p-4 rounded-md text-sm">
            <p>Wallet is connecting. Please wait...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositModal;