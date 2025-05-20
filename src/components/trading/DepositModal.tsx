// src/components/trading/DepositModal.tsx
import { FC, useState, useRef } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { toast } from 'react-hot-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useTokenContext, TokenType } from '../../context/TokenContext';
import Button from '../common/Button';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentToken?: TokenType;
  balance?: number;
}

const DepositModal: FC<DepositModalProps> = ({ 
  isOpen, 
  onClose, 
  currentToken = TokenType.SOL,
  balance = 0
}) => {
  const [amount, setAmount] = useState<string>('0.1');
  const [token, setToken] = useState<TokenType>(currentToken);
  
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { tokens, depositToken, isProcessingTransaction } = useTokenContext();
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isProcessingTransaction) onClose();
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
  
  const getMaxAmount = () => {
    if (!connected || !publicKey) return '0';
    
    const token = tokens.find(t => t.symbol === TokenType.SOL);
    if (token) {
      // Subtract a small amount for transaction fees
      const maxAmount = Math.max(0, token.balance - 0.01);
      return maxAmount.toFixed(3);
    }
    return '0';
  };
  
  const handleMaxAmount = () => {
    setAmount(getMaxAmount());
  };
  
  const handleDeposit = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    // For SOL, check if user has enough balance
    if (token === TokenType.SOL) {
      const token = tokens.find(t => t.symbol === TokenType.SOL);
      if (!token || token.balance < amountValue) {
        toast.error('Insufficient SOL balance');
        return;
      }
    }
    
    try {
      const success = await depositToken(token, amountValue);
      
      if (success) {
        toast.success(`${amountValue} ${token} deposited successfully!`);
        onClose();
      } else {
        toast.error('Deposit failed. Please try again later.');
      }
    } catch (error) {
      console.error('Deposit error:', error);
      toast.error('Deposit failed. Please try again later.');
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
      >
        <h2 className="text-xl font-bold text-white mb-4">Deposit</h2>
        
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
            {token === TokenType.SOL && (
              <button
                onClick={handleMaxAmount}
                className="bg-gray-600 text-white px-4 py-2"
              >
                Max
              </button>
            )}
            <span className="bg-gray-600 text-white px-4 py-2 rounded-r-md">
              {token}
            </span>
          </div>
          {token === TokenType.SOL && (
            <p className="text-xs text-gray-400 mt-1">
              Available: {getMaxAmount()} SOL
            </p>
          )}
        </div>
        
        <div className="my-4 p-3 bg-gray-700 rounded-md text-sm text-gray-300">
          <p>Depositing funds will allow you to use them for gameplay within this application.</p>
        </div>
        
        <div className="flex justify-end space-x-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isProcessingTransaction}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDeposit}
            disabled={isProcessingTransaction || !connected}
          >
            {isProcessingTransaction ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Processing...
              </>
            ) : (
              'Deposit'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;