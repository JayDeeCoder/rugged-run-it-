// src/components/trading/DepositModal.tsx
import { FC, useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowUpToLine, Wallet, Check, Loader, X, Copy, ExternalLink, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// Define the TokenType enum locally
enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentToken: TokenType;
  walletAddress: string;
}

const DepositModal: FC<DepositModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentToken,
  walletAddress
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Get token symbol based on currentToken
  const tokenSymbol = currentToken;
  
  const { user } = usePrivy();
  const { currentUser } = useContext(UserContext);
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShowQR(false);
      setIsLoading(false);
    }
  }, [isOpen]);
  
  // Handle outside clicks
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading) onClose();
  });
  
  // If not open, don't render
  if (!isOpen) return null;
  
  // Copy wallet address to clipboard
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  // Handle deposit confirmation (for UI purposes)
  const handleDepositConfirmation = () => {
    setIsLoading(true);
    
    // Simulate checking for deposit
    setTimeout(() => {
      setIsLoading(false);
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    }, 3000);
  };

  // Get network info based on token
  const getNetworkInfo = () => {
    switch (currentToken) {
      case TokenType.SOL:
        return {
          network: 'Solana Mainnet',
          minDeposit: '0.001 SOL',
          confirmations: '1 confirmation'
        };
      case TokenType.RUGGED:
        return {
          network: 'Solana (SPL Token)',
          minDeposit: '1 RUGGED',
          confirmations: '1 confirmation'
        };
      default:
        return {
          network: 'Unknown',
          minDeposit: 'N/A',
          confirmations: 'N/A'
        };
    }
  };

  const networkInfo = getNetworkInfo();
  
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
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Network Info */}
        <div className="bg-gray-800 p-4 rounded-md mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">Network:</span>
            <span className="text-white font-medium">{networkInfo.network}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">Min Deposit:</span>
            <span className="text-white">{networkInfo.minDeposit}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Confirmations:</span>
            <span className="text-white">{networkInfo.confirmations}</span>
          </div>
        </div>
        
        {/* Wallet Address Section */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2 text-sm">
            Your Deposit Address
          </label>
          
          {/* Address Display */}
          <div className="bg-gray-800 p-3 rounded-md mb-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-2">
                <div className="text-white font-mono text-sm break-all">
                  {walletAddress}
                </div>
              </div>
              <button
                onClick={copyAddress}
                className="flex items-center bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={14} className="mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} className="mr-1" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* QR Code Toggle */}
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setShowQR(!showQR)}
              className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              <QrCode size={16} className="mr-2" />
              {showQR ? 'Hide QR Code' : 'Show QR Code'}
            </button>
          </div>
          
          {/* QR Code Display */}
          {showQR && (
            <div className="flex justify-center bg-white p-4 rounded-lg mb-4">
              <QRCodeSVG 
                value={walletAddress} 
                size={200}
                level="M"
                includeMargin={true}
              />
            </div>
          )}
        </div>
        
        {/* Important Notes */}
        <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md mb-6 text-sm">
          <div className="font-medium mb-2">Important Notes:</div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Only send {tokenSymbol} to this address</li>
            <li>Deposits will appear after {networkInfo.confirmations}</li>
            <li>Minimum deposit: {networkInfo.minDeposit}</li>
            <li>Double-check the address before sending</li>
          </ul>
        </div>
        
        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors"
          >
            Close
          </button>
          
          <button
            onClick={handleDepositConfirmation}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 rounded-md transition-colors flex items-center justify-center ${
              isLoading
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isLoading ? (
              <>
                <Loader size={16} className="mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Wallet size={16} className="mr-2" />
                I've Sent {tokenSymbol}
              </>
            )}
          </button>
        </div>
        
        {/* Loading State Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
            <div className="bg-gray-800 p-4 rounded-lg text-center">
              <Loader size={32} className="animate-spin text-green-500 mx-auto mb-2" />
              <div className="text-white font-medium">Checking for deposit...</div>
              <div className="text-gray-400 text-sm">This may take a few moments</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositModal;