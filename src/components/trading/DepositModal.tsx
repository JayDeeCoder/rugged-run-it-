// src/components/trading/DepositModal.tsx
import { FC, useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowUpToLine, QrCode, Copy, X, Info, ExternalLink, RefreshCw, Check } from 'lucide-react';

// Since we don't have QRCodeSVG imported yet, we'll need to add it
// You'll need to install qrcode.react: npm install qrcode.react
import { QRCodeSVG } from 'qrcode.react';

// Define the TokenType enum if it doesn't exist yet
export enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentToken: TokenType;
}

const DepositModal: FC<DepositModalProps> = ({ 
  isOpen, 
  onClose,
  currentToken
}) => {
  const { user } = usePrivy();
  const { currentUser } = useContext(UserContext);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Get embedded wallet address from user context
  const walletAddress = currentUser?.walletAddress || '';
  
  // Use currentToken to display token-specific information
  const tokenSymbol = currentToken;
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Reset states when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
    }
  }, [isOpen]);
  
  // Handle clicks outside the modal
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen) onClose();
  });
  
  // Don't render if not open
  if (!isOpen) return null;
  
  // Copy address to clipboard
  const copyToClipboard = async () => {
    if (!walletAddress) return;
    
    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address', err);
    }
  };
  
  // Handle refreshing wallet balance
  const refreshBalance = () => {
    setIsLoading(true);
    
    // Simulate a balance refresh
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  };
  
  // Format address for display
  const formatAddress = (address: string): string => {
    if (!address) return '';
    if (address.length <= 12) return address;
    
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Get the appropriate balance based on token type
  const getTokenBalance = () => {
    if (currentToken === TokenType.SOL) {
      return currentUser?.balance?.toFixed(6) || '0.000000';
    } else {
      // Assuming ruggedBalance is a property on currentUser
      return currentUser?.ruggedBalance?.toFixed(2) || '0.00';
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ArrowUpToLine size={20} className="mr-2" />
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
            <div className="flex items-center">
              <span className="text-xl font-bold text-white mr-2">
                {getTokenBalance()} {tokenSymbol}
              </span>
              <button 
                onClick={refreshBalance} 
                className="text-gray-400 hover:text-white"
                disabled={isLoading}
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
        
        {/* Wallet Address Display */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2 text-sm">
            Your Wallet Address
          </label>
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
            <div className="flex-1 px-4 py-3 text-white font-mono text-sm truncate">
              {walletAddress || 'Loading wallet address...'}
            </div>
            <button
              onClick={copyToClipboard}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-3 transition-colors"
              title="Copy to clipboard"
            >
              {isCopied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          {isCopied && (
            <p className="text-green-500 text-xs mt-1">Copied to clipboard!</p>
          )}
        </div>
        
        {/* QR Code */}
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-white rounded-lg">
            {walletAddress ? (
              <QRCodeSVG value={walletAddress} size={180} />
            ) : (
              <div className="w-[180px] h-[180px] flex items-center justify-center bg-gray-200">
                <span className="text-gray-500">Loading...</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Instructions */}
        <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-4 rounded-md mb-6 text-sm">
          <div className="flex items-start">
            <Info size={18} className="mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <p className="mb-2">To deposit {tokenSymbol} into your wallet:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Send {tokenSymbol} to the wallet address above</li>
                <li>Only send {tokenSymbol} tokens through the Solana network</li>
                <li>Deposits typically confirm within 30 seconds</li>
              </ul>
            </div>
          </div>
        </div>
        
        {/* View on Explorer Button */}
        {walletAddress && (
          
            href={`https://explorer.solana.com/address/${walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-md font-medium flex items-center justify-center transition-colors"
          >
            <ExternalLink size={18} className="mr-2" />
            View on Solana Explorer
          </a>
        )}
      </div>
    </div>
  );
};

export default DepositModal;