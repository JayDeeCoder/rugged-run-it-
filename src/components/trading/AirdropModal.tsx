// AirdropModal.tsx
import { FC, useState, useRef } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { toast } from 'react-hot-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { useTokenContext, TokenType } from '../../context/TokenContext';

interface AirdropModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AirdropModal: FC<AirdropModalProps> = ({ isOpen, onClose }) => {
  const [amount, setAmount] = useState<string>('0.1');
  const [token, setToken] = useState<TokenType>(TokenType.SOL);
  const { connected } = useWallet();
  const { airdropToken, isAirdropAvailable, lastAirdropTime, airdropCooldown, isProcessingAirdrop } = useTokenContext();
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isProcessingAirdrop) onClose();
  });
  
  if (!isOpen) return null;
  
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and up to 3 decimal places
    if (/^(\d+)?(\.\d{0,3})?$/.test(value) || value === '') {
      setAmount(value);
    }
  };
  
  const handleTokenChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setToken(e.target.value as TokenType);
  };
  
  const handleAirdropRequest = async () => {
    if (!connected) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!isAirdropAvailable) {
      const timeRemaining = lastAirdropTime ? (lastAirdropTime + airdropCooldown - Date.now()) : 0;
      const hoursRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60));
      toast.error(`Airdrop not available. Try again in ${hoursRemaining} hours.`);
      return;
    }
    
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    // Maximum airdrop amount restriction
    const maxAmount = token === TokenType.SOL ? 2 : 100;
    if (amountValue > maxAmount) {
      toast.error(`Maximum airdrop amount is ${maxAmount} ${token}`);
      return;
    }
    
    try {
      const success = await airdropToken(token, amountValue);
      
      if (success) {
        toast.success(`Received ${amountValue} ${token} airdrop!`);
        onClose();
      } else {
        toast.error('Airdrop failed. Please try again later.');
      }
    } catch (error) {
      console.error('Airdrop error:', error);
      toast.error('Airdrop failed. Please try again later.');
    }
  };
  
  // Calculate time until next airdrop is available
  const getTimeUntilNextAirdrop = () => {
    if (!lastAirdropTime) return 'Available now';
    
    const timeRemaining = lastAirdropTime + airdropCooldown - Date.now();
    if (timeRemaining <= 0) return 'Available now';
    
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    return `Available in ${hours}h ${minutes}m`;
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
      >
        <h2 className="text-xl font-bold text-white mb-4">Request Airdrop</h2>
        
        <div className="mb-4">
          <label className="block text-gray-300 mb-2">
            Select Token
          </label>
          <select
            value={token}
            onChange={handleTokenChange}
            className="w-full bg-gray-700 text-white rounded-md px-4 py-2 focus:outline-none focus:ring focus:ring-green-500"
          >
            <option value={TokenType.SOL}>{TokenType.SOL} (Solana)</option>
            <option value={TokenType.RUGGED}>{TokenType.RUGGED} (Rugged Token)</option>
          </select>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-300 mb-2">
            Amount
          </label>
          <div className="flex">
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              className="flex-1 bg-gray-700 text-white rounded-l-md px-4 py-2 focus:outline-none focus:ring focus:ring-green-500"
              placeholder="0.1"
            />
            <span className="bg-gray-600 text-white px-4 py-2 rounded-r-md">
              {token}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {token === TokenType.SOL ? 'Maximum 2 SOL per airdrop' : 'Maximum 100 RUGGED per airdrop'}
          </p>
        </div>
        
        <div className="mb-4">
          <div className="text-sm text-gray-400">
            Airdrop Status: <span className={isAirdropAvailable ? 'text-green-400' : 'text-yellow-400'}>
              {getTimeUntilNextAirdrop()}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Note: Airdrops are limited to once per 24 hours
          </div>
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessingAirdrop}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAirdropRequest}
            disabled={isProcessingAirdrop || !connected || !isAirdropAvailable}
            className={`px-4 py-2 rounded-md transition-colors flex items-center justify-center ${
              isProcessingAirdrop || !connected || !isAirdropAvailable 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isProcessingAirdrop ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Processing...
              </>
            ) : (
              'Request Airdrop'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AirdropModal;