// src/components/trading/WithdrawModal.tsx
import { FC, useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { isValidSolanaAddress } from '../../utils/walletUtils';
import { ArrowDownToLine, Wallet, Check, Loader, X, Copy, ExternalLink } from 'lucide-react';

// Define the TokenType enum locally
enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
  // Add other tokens as needed
}

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentToken: TokenType; // Add this prop
  balance: number; // Add this prop
}

const WithdrawModal: FC<WithdrawModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentToken, // Use the new prop
  balance // Use the new prop 
}) => {
  const [amount, setAmount] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  
  // Get token symbol based on currentToken
  const tokenSymbol = currentToken;
  
  const { user } = usePrivy();
  const { currentUser } = useContext(UserContext);
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setDestinationAddress('');
      setError(null);
      setSuccess(false);
      setAddressError(null);
    }
  }, [isOpen]);
  
  // Handle outside clicks
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading) onClose();
  });
  
  // If not open, don't render
  if (!isOpen) return null;
  
  // Validate Solana address using the new utility
  const validateAddress = (address: string): boolean => {
    if (!address) {
      setAddressError('Destination address is required');
      return false;
    } 
    
    if (!isValidSolanaAddress(address)) {
      setAddressError('Please enter a valid Solana address');
      return false;
    }
    
    setAddressError(null);
    return true;
  };
  
  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and up to 6 decimal places
    if (/^(\d+)?(\.\d{0,6})?$/.test(value) || value === '') {
      setAmount(value);
    }
  };
  
  // Handle setting max amount
  const handleSetMaxAmount = () => {
    // Use balance prop instead of currentUser.balance
    if (balance > 0) {
      // Set slightly less than max to account for network fees
      const maxAmount = Math.max(0, balance - 0.001);
      setAmount(maxAmount.toFixed(6));
    }
  };
  
  // Handle withdraw submit
  const handleWithdraw = async () => {
    try {
      setError(null);
      
      // Validate inputs
      if (!amount || parseFloat(amount) <= 0) {
        setError('Please enter a valid amount');
        return;
      }
      
      if (!validateAddress(destinationAddress)) {
        return;
      }
      
      const withdrawAmount = parseFloat(amount);
      
      // Use balance prop instead of currentUser.balance
      if (withdrawAmount > balance) {
        setError('Insufficient balance');
        return;
      }
      
      // Start loading
      setIsLoading(true);
      
      // Here you would call your API to process the withdrawal
      // For this example, we'll simulate a successful withdrawal after a delay
      setTimeout(() => {
        setIsLoading(false);
        setSuccess(true);
        
        // Call onSuccess callback if provided
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 2000);
        }
      }, 2000);
      
    } catch (err) {
      setIsLoading(false);
      setError('Failed to process withdrawal. Please try again.');
      console.error('Withdraw error:', err);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        {/* Header - now with dynamic token symbol */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ArrowDownToLine size={20} className="mr-2" />
            Withdraw {tokenSymbol}
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Success State */}
        {success ? (
          <div className="text-center py-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center">
                <Check size={32} className="text-green-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Withdrawal Successful</h3>
            <p className="text-gray-400 mb-6">Your {tokenSymbol} has been sent to the specified address.</p>
            <button
              onClick={onClose}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors w-full"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form State */
          <>
            {/* Balance Display - now with dynamic token symbol and using the balance prop */}
            <div className="bg-gray-800 p-4 rounded-md mb-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Available Balance</span>
                <span className="text-xl font-bold text-white">
                  {balance.toFixed(6)} {tokenSymbol}
                </span>
              </div>
            </div>
            
            {/* Amount Input */}
            <div className="mb-6">
              <label className="block text-gray-300 mb-2 text-sm">
                Amount to Withdraw
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.000000"
                  disabled={isLoading}
                  className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-l-md focus:outline-none focus:ring-1 focus:ring-green-500 border border-gray-700"
                />
                <button
                  onClick={handleSetMaxAmount}
                  disabled={isLoading}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-3 rounded-r-md transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>
            
            {/* Destination Address Input */}
            <div className="mb-6">
              <label className="block text-gray-300 mb-2 text-sm">
                Destination Wallet Address
              </label>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                onBlur={() => validateAddress(destinationAddress)}
                placeholder="Solana Wallet Address"
                disabled={isLoading}
                className={`w-full bg-gray-800 text-white px-4 py-3 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 border ${
                  addressError ? 'border-red-500' : 'border-gray-700'
                }`}
              />
              {addressError && (
                <p className="text-red-500 text-xs mt-1">{addressError}</p>
              )}
            </div>
            
            {/* Error Message */}
            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-500 p-3 rounded-md mb-6">
                {error}
              </div>
            )}
            
            {/* Warning Message */}
            <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md mb-6 text-sm">
              Double check the destination address. Withdrawals cannot be reversed!
            </div>
            
            {/* Submit Button - now with dynamic token symbol */}
            <button
              onClick={handleWithdraw}
              disabled={isLoading || !amount || !destinationAddress}
              className={`w-full py-3 rounded-md font-bold flex items-center justify-center ${
                isLoading || !amount || !destinationAddress
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader size={18} className="mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Wallet size={18} className="mr-2" />
                  Withdraw {tokenSymbol}
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WithdrawModal;