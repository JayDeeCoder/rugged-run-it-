import { FC, useState, useEffect } from 'react';
import { useGameSocket } from '../../hooks/useGameSocket';
import { UserAPI } from '../../services/api';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { toast } from 'react-hot-toast';

interface UpdatedTradingControlsProps {
  onBuy?: (amount: number) => void;
  onSell?: (percentage: number) => void;
  walletBalance: number;
  isGameActive: boolean;
}

const UpdatedTradingControls: FC<UpdatedTradingControlsProps> = ({
  walletBalance,
  isGameActive
}) => {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [amount, setAmount] = useState<string>('0.01');
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  const [hasActiveBet, setHasActiveBet] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';

  const { currentGame, isConnected, placeBet, cashOut } = useGameSocket(walletAddress, userId || undefined);

  // Get or create user
  useEffect(() => {
    if (authenticated && walletAddress) {
      const initUser = async () => {
        const userData = await UserAPI.getUserOrCreate(walletAddress);
        if (userData) {
          setUserId(userData.id);
        }
      };
      initUser();
    }
  }, [authenticated, walletAddress]);

  const handlePlaceBet = async () => {
    if (!authenticated || !walletAddress || !isConnected || !isGameActive) {
      toast.error('Cannot place bet at this time');
      return;
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0 || betAmount > walletBalance) {
      toast.error('Invalid bet amount');
      return;
    }

    setIsPlacingBet(true);
    try {
      const success = await placeBet(walletAddress, betAmount, userId || undefined);
      if (success) {
        setHasActiveBet(true);
        toast.success(`Bet placed: ${betAmount} SOL`);
      } else {
        toast.error('Failed to place bet');
      }
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error('Failed to place bet');
    } finally {
      setIsPlacingBet(false);
    }
  };

  const handleCashOut = async () => {
    if (!authenticated || !walletAddress || !isConnected || !hasActiveBet) {
      toast.error('Cannot cash out at this time');
      return;
    }

    setIsCashingOut(true);
    try {
      const success = await cashOut(walletAddress);
      if (success) {
        setHasActiveBet(false);
        toast.success('Cashed out successfully!');
      } else {
        toast.error('Failed to cash out');
      }
    } catch (error) {
      console.error('Error cashing out:', error);
      toast.error('Failed to cash out');
    } finally {
      setIsCashingOut(false);
    }
  };

  return (
    <div className="bg-[#0d0d0f] text-white grid grid-cols-1 gap-3 p-4 border border-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400">Connection:</span>
        <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {currentGame && (
        <div className="bg-gray-800 p-3 rounded-md mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">Game #{currentGame.gameNumber}</span>
            <span className="text-yellow-400 font-bold">{currentGame.multiplier.toFixed(2)}x</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Total Bets:</span>
            <span className="text-white">{currentGame.totalBets.toFixed(3)} SOL</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Players:</span>
            <span className="text-white">{currentGame.totalPlayers}</span>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-gray-400 text-xs mb-1">Bet Amount (SOL)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-gray-800 text-white px-3 py-2 rounded-md focus:outline-none"
          placeholder="0.01"
          step="0.001"
          min="0.001"
          max={walletBalance}
          disabled={!isGameActive || hasActiveBet}
        />
      </div>

      {!hasActiveBet ? (
        <button
          onClick={handlePlaceBet}
          disabled={isPlacingBet || !isConnected || !isGameActive || !authenticated}
          className={`w-full py-3 rounded-md font-bold ${
            isPlacingBet || !isConnected || !isGameActive || !authenticated
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isPlacingBet ? 'Placing Bet...' : 'Place Bet'}
        </button>
      ) : (
        <button
          onClick={handleCashOut}
          disabled={isCashingOut || !isConnected || !isGameActive}
          className={`w-full py-3 rounded-md font-bold ${
            isCashingOut || !isConnected || !isGameActive
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-yellow-600 hover:bg-yellow-700 text-white'
          }`}
        >
          {isCashingOut ? 'Cashing Out...' : `Cash Out (${currentGame?.multiplier.toFixed(2)}x)`}
        </button>
      )}

      {hasActiveBet && currentGame && (
        <div className="bg-blue-900 bg-opacity-30 p-3 rounded-md">
          <div className="text-center">
            <div className="text-sm text-blue-400">Potential Win</div>
            <div className="text-lg font-bold text-blue-300">
              {(parseFloat(amount) * currentGame.multiplier).toFixed(3)} SOL
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpdatedTradingControls;