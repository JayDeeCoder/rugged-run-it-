// src/components/trading/DepositModal.tsx
import { FC, useRef } from 'react';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';

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
  const { currentUser } = useContext(UserContext);
  const modalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  
  // Handle clicks outside the modal
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen) onClose();
  });
  
  // Don't render if not open
  if (!isOpen) return null;
  
  // Get token symbol
  const tokenSymbol = currentToken;
  
  // Function to copy address to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(walletAddress);
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
              {currentUser?.balance?.toFixed(6) || '0.000000'} {tokenSymbol}
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
              {walletAddress}
            </div>
            <button 
              onClick={copyToClipboard}
              className="bg-gray-700 px-3 hover:bg-gray-600 transition-colors flex items-center"
              title="Copy address"
            >
              {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
            </button>
          </div>
          <div className="text-center mt-2 text-xs text-gray-400">
            Send {tokenSymbol} only to this address
          </div>
        </div>
        
        {/* QR Code placeholder - can be implemented with a QR code library */}
        <div className="flex justify-center mb-6">
          <div className="w-48 h-48 bg-white p-2 rounded-md flex items-center justify-center">
            <div className="text-black text-xs text-center">
              QR Code for {formatAddress(walletAddress)}
              <br />
              (Use a QR code library to implement)
            </div>
          </div>
        </div>
        
        {/* Warning */}
        <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-4 rounded-md mb-6 text-sm">
          <p>Important: Only send {tokenSymbol} to this address. Sending any other assets may result in permanent loss.</p>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;