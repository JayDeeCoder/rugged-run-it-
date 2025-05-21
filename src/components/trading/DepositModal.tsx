// src/components/trading/DepositModal.tsx
import { FC, useRef } from 'react';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { X } from 'lucide-react';
import { TokenType } from '../../types/tokens';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentToken: TokenType;
}

const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, currentToken }) => {
  const { currentUser } = useContext(UserContext);
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Handle clicks outside the modal
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen) onClose();
  });
  
  // Don't render if not open
  if (!isOpen) return null;
  
  // Get token symbol
  const tokenSymbol = currentToken;
  
  // IMPORTANT: For debugging, let's see what properties currentUser actually has
  console.log("Current user object:", currentUser);
  
  // Temporary hardcoded wallet address for testing
  const dummyAddress = "8ZU6Pq...2fkm";
  
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
        
        {/* Wallet Address Display - Simple Version */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2 text-sm">
            Your Wallet Address
          </label>
          <div className="bg-gray-800 border border-gray-700 rounded-md p-4 text-center">
            <p className="text-white font-mono break-all">
              {dummyAddress}
            </p>
          </div>
        </div>
        
        {/* Simple Instructions */}
        <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-4 rounded-md mb-6 text-sm">
          <p>To deposit {tokenSymbol}, send tokens to the wallet address above.</p>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;