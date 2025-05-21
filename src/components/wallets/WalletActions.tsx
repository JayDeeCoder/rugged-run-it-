import { useState } from 'react';
import { ArrowUpToLine, ArrowDownToLine } from 'lucide-react';
import DepositModal from '../trading/DepositModal';
import WithdrawModal from '../../components/trading/WithdrawModal';

// Define the TokenType enum locally
enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
  // Add other tokens as needed
}

const WalletActions = () => {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  
  // Use the local TokenType enum
  const currentToken = TokenType.SOL;
  
  // Current balance
  const balance = 0.123;
  
  return (
    <div className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-4">Wallet</h2>
      
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
      
      {/* Pass the enum value to the modals */}
      <DepositModal 
        isOpen={isDepositModalOpen} 
        onClose={() => setIsDepositModalOpen(false)} 
        currentToken={currentToken}
      />
      
      <WithdrawModal 
        isOpen={isWithdrawModalOpen} 
        onClose={() => setIsWithdrawModalOpen(false)}
        currentToken={currentToken}
        balance={balance}
        onSuccess={() => {
          // Handle successful withdrawal
          console.log('Withdrawal successful');
        }}
      />
    </div>
  );
};

export default WalletActions;