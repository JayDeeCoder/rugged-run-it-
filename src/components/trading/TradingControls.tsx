// src/components/trading/TradingControls.tsx - Fixed Version
import { FC, useState, useEffect, useContext, useCallback } from 'react';
import { Sparkles, Coins, ArrowUpRight, ArrowDownLeft, AlertCircle, CoinsIcon, Timer, Users, Settings, Wallet, TrendingUp } from 'lucide-react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import useLocalStorage from '../../hooks/useLocalStorage';
import Button from '../common/Button';
import { useGameSocket } from '../../hooks/useGameSocket';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Import from barrel file instead of direct imports
import { AirdropModal, DepositModal, WithdrawModal } from './index';

// Define TokenType locally if not available
export enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

// Enhanced bet tracking interface
interface ActiveBet {
  id: string;
  amount: number;
  entryMultiplier: number;
  timestamp: number;
  gameId: string;
  transactionId?: string;
}

interface TradingControlsProps {
  onBuy?: (amount: number) => void;
  onSell?: (percentage: number) => void;
  isPlacingBet?: boolean;
  isCashingOut?: boolean;
  hasActiveGame?: boolean;
  walletBalance?: number;
  holdings?: number;
  currentMultiplier?: number;
  isGameActive?: boolean;
  isMobile?: boolean;
}

// Solana connection for balance checks
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Enhanced wallet balance hook
const useWalletBalance = (walletAddress: string) => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const updateBalance = useCallback(async () => {
    if (!walletAddress) return;
    
    setLoading(true);
    try {
      const publicKey = new PublicKey(walletAddress);
      const balanceResponse = await connection.getBalance(publicKey);
      const solBalance = balanceResponse / LAMPORTS_PER_SOL;
      setBalance(solBalance);
      setLastUpdated(Date.now());
      console.log(`💰 Wallet balance updated: ${solBalance.toFixed(3)} SOL`);
    } catch (error) {
      console.error('Failed to fetch wallet balance:', error);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Auto-update balance every 30 seconds
  useEffect(() => {
    if (walletAddress) {
      updateBalance();
      const interval = setInterval(updateBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, updateBalance]);

  return { balance, loading, updateBalance, lastUpdated };
};

// Compact Game Info Component
const CompactGameInfo: FC<{
  game: any;
  countdown: number;
  showCountdown: boolean;
  isConnected: boolean;
  isMobile: boolean;
}> = ({ game, countdown, showCountdown, isConnected, isMobile }) => {
  const getStatusDisplay = () => {
    if (!game) return { text: 'Connecting...', color: 'text-gray-400', bg: 'bg-gray-600' };
    switch (game.status) {
      case 'waiting':
        return { text: 'Next Round', color: 'text-blue-400', bg: 'bg-blue-600' };
      case 'active':
        return { text: 'Active', color: 'text-green-400', bg: 'bg-green-600' };
      case 'crashed':
        return { text: 'Ended', color: 'text-red-400', bg: 'bg-red-600' };
      default:
        return { text: 'Connecting...', color: 'text-gray-400', bg: 'bg-gray-600' };
    }
  };

  const status = getStatusDisplay();

  if (isMobile) {
    return (
      <div className="bg-gray-800 rounded-lg p-2 mb-3">
        {/* Compact header row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.bg}`}>
              {status.text}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
              {isConnected ? '●' : '○'}
            </span>
          </div>
          {game && (
            <span className="text-yellow-400 font-bold text-lg">
              {game.multiplier?.toFixed(2) || '1.00'}x
            </span>
          )}
        </div>

        {/* Game details row */}
        {game && (
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>#{game.gameNumber}</span>
            <div className="flex space-x-3">
              <span>{game.totalPlayers || 0} players</span>
              <span>{(game.totalBets || 0).toFixed(2)} SOL</span>
            </div>
          </div>
        )}

        {/* Countdown */}
        {showCountdown && countdown > 0 && (
          <div className="text-center mt-1 p-1 bg-blue-900 bg-opacity-30 rounded">
            <div className="text-blue-400 text-xs">Starting in {Math.ceil(countdown / 1000)}s</div>
          </div>
        )}
      </div>
    );
  }

  // Desktop version - slightly more detailed
  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded text-xs ${status.bg}`}>
            {status.text}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {game && (
          <span className="text-yellow-400 font-bold text-xl">
            {game.multiplier?.toFixed(2) || '1.00'}x
          </span>
        )}
      </div>

      {game && (
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
          <div>
            <span className="block text-gray-500">Game</span>
            <span className="text-white">#{game.gameNumber}</span>
          </div>
          <div>
            <span className="block text-gray-500">Players</span>
            <span className="text-white">{game.totalPlayers || 0}</span>
          </div>
          <div>
            <span className="block text-gray-500">Total</span>
            <span className="text-white">{(game.totalBets || 0).toFixed(2)} SOL</span>
          </div>
        </div>
      )}

      {showCountdown && countdown > 0 && (
        <div className="text-center mt-2 p-2 bg-blue-900 bg-opacity-30 rounded">
          <div className="text-blue-400 text-sm">Starting in {Math.ceil(countdown / 1000)}s</div>
          <div className="text-xs text-gray-400">Pre-game betting open!</div>
        </div>
      )}
    </div>
  );
};

// Enhanced Balance Display Component with real-time updates
const BalanceDisplay: FC<{
  currentToken: TokenType;
  activeBalance: number;
  onTokenChange: (token: TokenType) => void;
  onDepositClick: () => void;
  onWithdrawClick: () => void;
  onAirdropClick: () => void;
  isMobile: boolean;
  showExpanded: boolean;
  onToggleExpanded: () => void;
  isLoading: boolean;
  onRefreshBalance: () => void;
}> = ({ 
  currentToken, 
  activeBalance, 
  onTokenChange, 
  onDepositClick, 
  onWithdrawClick, 
  onAirdropClick, 
  isMobile, 
  showExpanded, 
  onToggleExpanded,
  isLoading,
  onRefreshBalance
}) => {
  const formatBalance = (balance: number, token: TokenType) => {
    if (token === TokenType.SOL) {
      return balance.toFixed(3);
    } else {
      return balance.toFixed(0);
    }
  };

  if (isMobile) {
    return (
      <div className="mb-2">
        <div 
          className="flex items-center justify-between bg-gray-800 rounded-lg p-2 cursor-pointer"
          onClick={onToggleExpanded}
        >
          <div className="flex items-center space-x-2">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
              currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
            }`}>
              <span className="text-white font-bold text-xs">
                {currentToken === TokenType.SOL ? 'S' : 'R'}
              </span>
            </div>
            <div>
              <div className={`text-sm font-bold ${
                currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
              }`}>
                {formatBalance(activeBalance, currentToken)} {currentToken}
                {isLoading && <span className="ml-1 text-xs text-gray-400">↻</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onRefreshBalance();
              }}
              className="text-gray-400 hover:text-white"
            >
              <Wallet className="w-4 h-4" />
            </button>
            <span className="text-gray-400 text-sm">{showExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {showExpanded && (
          <div className="bg-gray-800 rounded-lg p-2 mt-1">
            {/* Token switcher */}
            <div className="flex space-x-2 mb-2">
              <button
                onClick={() => onTokenChange(TokenType.SOL)}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  currentToken === TokenType.SOL 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                SOL
              </button>
              <button
                onClick={() => {
                  onTokenChange(TokenType.RUGGED);
                  if (activeBalance < 10) {
                    onAirdropClick();
                  }
                }}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  currentToken === TokenType.RUGGED 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                RUGGED
              </button>
            </div>

            {/* Wallet actions */}
            <div className="flex space-x-2">
              <button
                onClick={onDepositClick}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded text-xs flex items-center justify-center"
              >
                <ArrowDownLeft className="w-3 h-3 mr-1" />
                Deposit
              </button>
              <button
                onClick={onWithdrawClick}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1 px-2 rounded text-xs flex items-center justify-center"
              >
                <ArrowUpRight className="w-3 h-3 mr-1" />
                Withdraw
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop version
  return (
    <div className="bg-gray-800 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            currentToken === TokenType.SOL ? 'bg-blue-500' : 'bg-green-500'
          }`}>
            <span className="text-white font-bold text-sm">
              {currentToken === TokenType.SOL ? 'SOL' : 'RUG'}
            </span>
          </div>
          
          <div>
            <div className="text-xs text-gray-400">Balance</div>
            <div className={`text-lg font-bold ${
              currentToken === TokenType.SOL ? 'text-blue-400' : 'text-green-400'
            }`}>
              {formatBalance(activeBalance, currentToken)} {currentToken}
              {isLoading && <span className="ml-2 text-xs text-gray-400">Updating...</span>}
            </div>
          </div>
        </div>
        
        {/* Token Switch Buttons and Refresh */}
        <div className="flex space-x-2">
          <button
            onClick={onRefreshBalance}
            className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
            disabled={isLoading}
          >
            {isLoading ? '↻' : '⟳'}
          </button>
          <button
            onClick={() => onTokenChange(TokenType.SOL)}
            className={`px-3 py-1 text-xs rounded ${
              currentToken === TokenType.SOL 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            SOL
          </button>
          <button
            onClick={() => {
              onTokenChange(TokenType.RUGGED);
              if (activeBalance < 10) {
                onAirdropClick();
              }
            }}
            className={`px-3 py-1 text-xs rounded ${
              currentToken === TokenType.RUGGED 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            RUGGED
          </button>
        </div>
      </div>

      {/* Wallet Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onDepositClick}
          className="bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center"
        >
          <ArrowDownLeft className="w-4 h-4 mr-2" />
          Deposit
        </button>
        <button
          onClick={onWithdrawClick}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm flex items-center justify-center"
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Withdraw
        </button>
      </div>
    </div>
  );
};

// Auto Cashout Component (unchanged)
const AutoCashoutSection: FC<{
  autoCashoutEnabled: boolean;
  autoCashoutValue: string;
  onToggle: (enabled: boolean) => void;
  onValueChange: (value: string) => void;
  onQuickValue: (value: number) => void;
  isMobile: boolean;
  showExpanded: boolean;
  onToggleExpanded: () => void;
}> = ({ 
  autoCashoutEnabled, 
  autoCashoutValue, 
  onToggle, 
  onValueChange, 
  onQuickValue,
  isMobile,
  showExpanded,
  onToggleExpanded
}) => {
  const quickValues = [1.5, 2.0, 3.0, 5.0];

  return (
    <div className="mb-3">
      <div 
        className="flex justify-between items-center bg-gray-800 p-2 rounded-lg cursor-pointer"
        onClick={onToggleExpanded}
      >
        <div className="flex items-center space-x-2">
          <div className={`h-3 w-3 rounded-full ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
          <span className="text-gray-300 text-sm">Auto Cashout</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-gray-400 text-sm">
            {autoCashoutEnabled ? `${autoCashoutValue}x` : 'Off'}
          </span>
          <Settings className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      
      {showExpanded && (
        <div className="bg-gray-800 p-3 rounded-lg mt-1">
          <div className="flex items-center justify-between mb-3">
            <label className="text-gray-300 text-sm">Enable Auto Cashout</label>
            <div className="relative inline-block w-10 h-5">
              <input
                type="checkbox"
                id="auto-cashout-toggle"
                checked={autoCashoutEnabled}
                onChange={(e) => onToggle(e.target.checked)}
                className="opacity-0 absolute w-0 h-0"
              />
              <label 
                htmlFor="auto-cashout-toggle"
                className={`absolute cursor-pointer top-0 left-0 right-0 bottom-0 rounded-full transition-colors ${
                  autoCashoutEnabled ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span 
                  className={`absolute h-3 w-3 mt-1 bg-white rounded-full transition-transform ${
                    autoCashoutEnabled ? 'translate-x-5 ml-0' : 'translate-x-1'
                  }`} 
                />
              </label>
            </div>
          </div>
          
          <div className="mb-3">
            <label className="block text-gray-300 text-sm mb-1">
              Cashout at Multiplier
            </label>
            <div className="flex">
              <input
                type="text"
                value={autoCashoutValue}
                onChange={(e) => onValueChange(e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-1 rounded-l-md focus:outline-none text-sm"
                placeholder="2.00"
                disabled={!autoCashoutEnabled}
              />
              <span className="bg-gray-600 text-gray-300 px-3 py-1 rounded-r-md text-sm">x</span>
            </div>
          </div>
          
          <div className={`grid gap-2 ${isMobile ? 'grid-cols-4' : 'grid-cols-4'}`}>
            {quickValues.map((value) => (
              <button
                key={value}
                onClick={() => onQuickValue(value)}
                className={`px-2 py-1 text-xs rounded ${
                  parseFloat(autoCashoutValue) === value
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } ${isMobile ? 'text-[10px] px-1' : ''}`}
                disabled={!autoCashoutEnabled}
              >
                {value.toFixed(1)}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Active Bet Display Component (unchanged)
const ActiveBetDisplay: FC<{
  bet: ActiveBet;
  currentMultiplier: number;
  isMobile: boolean;
}> = ({ bet, currentMultiplier, isMobile }) => {
  const calculatePotentialWin = () => {
    const growthRatio = currentMultiplier / bet.entryMultiplier;
    const rawPayout = bet.amount * growthRatio;
    const finalPayout = rawPayout * (1 - 0.40); // Apply 40% house edge
    return Math.max(0, finalPayout);
  };

  const profit = calculatePotentialWin() - bet.amount;
  const isProfit = profit > 0;

  return (
    <div className="bg-blue-900 bg-opacity-30 p-3 rounded-lg mb-3">
      <div className="text-center">
        <div className="text-sm text-blue-400 mb-1">Active Bet</div>
        <div className="text-lg font-bold text-blue-300">
          {bet.amount} SOL @ {bet.entryMultiplier.toFixed(2)}x
        </div>
        <div className={`text-sm mt-1 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
          Potential: {calculatePotentialWin().toFixed(3)} SOL
        </div>
        <div className={`text-xs mt-1 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
          P&L: {profit >= 0 ? '+' : ''}{profit.toFixed(3)} SOL
        </div>
        {isMobile && (
          <div className="text-xs text-gray-400 mt-1">
            Current: {currentMultiplier.toFixed(2)}x
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced Betting Section Component
const BettingSection: FC<{
  activeBet: ActiveBet | null;
  amount: string;
  onAmountChange: (amount: string) => void;
  onQuickAmount: (amount: number) => void;
  onPlaceBet: () => void;
  onCashout: () => void;
  quickAmounts: number[];
  currentToken: TokenType;
  activeBalance: number;
  isPlacingBet: boolean;
  isCashingOut: boolean;
  isWalletReady: boolean;
  canBet: boolean;
  isWaitingPeriod: boolean;
  gameStatus: string;
  isConnected: boolean;
  currentMultiplier: number;
  isMobile: boolean;
  betValidationError?: string;
}> = ({
  activeBet,
  amount,
  onAmountChange,
  onQuickAmount,
  onPlaceBet,
  onCashout,
  quickAmounts,
  currentToken,
  activeBalance,
  isPlacingBet,
  isCashingOut,
  isWalletReady,
  canBet,
  isWaitingPeriod,
  gameStatus,
  isConnected,
  currentMultiplier,
  isMobile,
  betValidationError
}) => {
  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0 && amountNum <= activeBalance;
  const minBetAmount = currentToken === TokenType.SOL ? 0.001 : 1;
  const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
  
  const amountInRange = amountNum >= minBetAmount && amountNum <= maxBetAmount;

  if (isMobile) {
    return (
      <div>
        {!activeBet ? (
          <>
            {/* Compact amount input with inline quick amounts */}
            <div className="mb-2">
              <div className="flex gap-1 mb-1">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className="flex-1 bg-gray-700 text-white px-2 py-1.5 rounded text-sm focus:outline-none"
                  placeholder={`Min: ${minBetAmount}`}
                  disabled={!canBet}
                />
                <button
                  onClick={() => onQuickAmount(activeBalance * 0.5)}
                  className="bg-gray-600 text-gray-300 px-2 text-xs rounded hover:bg-gray-500"
                  disabled={!canBet}
                >
                  ½
                </button>
                <button
                  onClick={() => onQuickAmount(Math.min(activeBalance, maxBetAmount))}
                  className="bg-gray-600 text-gray-300 px-2 text-xs rounded hover:bg-gray-500"
                  disabled={!canBet}
                >
                  Max
                </button>
              </div>
              
              {/* Ultra compact quick amounts */}
              <div className="grid grid-cols-4 gap-1">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => onQuickAmount(amt)}
                    className={`py-1 text-xs rounded transition-colors ${
                      parseFloat(amount) === amt
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                    disabled={!canBet}
                  >
                    {amt}
                  </button>
                ))}
              </div>

              {/* Validation error */}
              {betValidationError && (
                <div className="text-red-400 text-xs mt-1">{betValidationError}</div>
              )}
            </div>
          </>
        ) : null}
        
        {/* Compact action buttons */}
        <div className="grid grid-cols-2 gap-2">
          {!activeBet ? (
            <>
              <button
                onClick={onPlaceBet}
                disabled={isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isPlacingBet ? (
                  <>
                    <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></div>
                    Placing
                  </>
                ) : (
                  <>
                    <Coins className="mr-1 h-4 w-4" />
                    {isWaitingPeriod ? 'Pre-Bet' : 'Bet'}
                  </>
                )}
              </button>
              <button
                disabled
                className="py-2.5 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
              >
                <Sparkles className="mr-1 h-4 w-4" />
                Cash Out
              </button>
            </>
          ) : (
            <>
              <button
                disabled
                className="py-2.5 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
              >
                <Coins className="mr-1 h-4 w-4" />
                Bet Active
              </button>
              <button
                onClick={onCashout}
                disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
                className={`py-2.5 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                  isCashingOut || !isConnected || gameStatus !== 'active'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                }`}
              >
                {isCashingOut ? (
                  <>
                    <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></div>
                    Cashing
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 h-4 w-4" />
                    Cash Out
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Desktop version with enhanced validation
  return (
    <div className="border-t border-gray-800 pt-3">
      <h3 className="text-sm font-bold text-gray-400 mb-3">
        {activeBet ? 'ACTIVE BET' : 'PLACE BET'}
      </h3>
      
      {!activeBet && (
        <>
          {/* Amount Input */}
          <div className="mb-3">
            <label className="block text-gray-400 text-xs mb-1">
              Bet Amount ({currentToken}) - Min: {minBetAmount}, Max: {maxBetAmount}
            </label>
            <div className="flex">
              <input
                type="text"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-l-md focus:outline-none"
                placeholder={`Min: ${minBetAmount}`}
                disabled={!canBet}
              />
              <button
                onClick={() => onQuickAmount(activeBalance * 0.5)}
                className="bg-gray-600 text-gray-300 px-2 text-xs border-l border-gray-900 hover:bg-gray-500"
                disabled={!canBet}
              >
                Half
              </button>
              <button
                onClick={() => onQuickAmount(Math.min(activeBalance, maxBetAmount))}
                className="bg-gray-600 text-gray-300 px-2 text-xs rounded-r-md hover:bg-gray-500"
                disabled={!canBet}
              >
                Max
              </button>
            </div>
            
            {/* Validation error */}
            {betValidationError && (
              <div className="text-red-400 text-xs mt-1">{betValidationError}</div>
            )}
          </div>
          
          {/* Quick Amount Buttons */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                onClick={() => onQuickAmount(amt)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  parseFloat(amount) === amt
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={!canBet}
              >
                {amt.toString()} {currentToken}
              </button>
            ))}
          </div>
        </>
      )}
      
      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {!activeBet ? (
          <>
            <button
              onClick={onPlaceBet}
              disabled={isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                isPlacingBet || !isWalletReady || !amountValid || !amountInRange || !canBet
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isPlacingBet ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Placing...
                </>
              ) : (
                <>
                  <Coins className="mr-2 h-4 w-4" />
                  {isWaitingPeriod ? 'Pre-Bet' : 'Place Bet'}
                </>
              )}
            </button>
            <button
              disabled
              className="py-3 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Cash Out
            </button>
          </>
        ) : (
          <>
            <button
              disabled
              className="py-3 rounded-md font-bold text-sm bg-gray-700 text-gray-500 cursor-not-allowed flex items-center justify-center"
            >
              <Coins className="mr-2 h-4 w-4" />
              Bet Placed
            </button>
            <button
              onClick={onCashout}
              disabled={isCashingOut || !isConnected || gameStatus !== 'active'}
              className={`py-3 rounded-md font-bold text-sm flex items-center justify-center transition-colors ${
                isCashingOut || !isConnected || gameStatus !== 'active'
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }`}
            >
              {isCashingOut ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Cashing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Cash Out ({currentMultiplier.toFixed(2)}x)
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Enhanced Status Messages Component
const StatusMessages: FC<{
  isWalletReady: boolean;
  isConnected: boolean;
  amount: string;
  activeBalance: number;
  activeBet: ActiveBet | null;
  isWaitingPeriod: boolean;
  canBet: boolean;
  gameStatus: string;
  currentMultiplier: number;
  countdownSeconds: number;
  serverError?: string;
}> = ({
  isWalletReady,
  isConnected,
  amount,
  activeBalance,
  activeBet,
  isWaitingPeriod,
  canBet,
  gameStatus,
  currentMultiplier,
  countdownSeconds,
  serverError
}) => {
  const getStatusMessage = () => {
    if (serverError) {
      return { text: serverError, icon: AlertCircle, color: 'text-red-500' };
    }

    if (!isWalletReady) {
      return { text: 'Login to play', icon: AlertCircle, color: 'text-yellow-500' };
    }
    
    if (isWalletReady && !isConnected) {
      return { text: 'Connecting to game server...', icon: AlertCircle, color: 'text-red-500' };
    }
    
    if (isWalletReady && parseFloat(amount) > activeBalance && !activeBet) {
      return { text: 'Insufficient balance', icon: AlertCircle, color: 'text-red-500' };
    }
    
    if (isWaitingPeriod && canBet) {
      return { text: `Pre-game betting open - ${countdownSeconds}s remaining`, icon: Timer, color: 'text-blue-500' };
    }
    
    if (isWaitingPeriod && !canBet) {
      return { text: 'Too late to bet - Game starting now!', icon: AlertCircle, color: 'text-red-500' };
    }
    
    if (gameStatus === 'active' && !activeBet && canBet) {
      return { text: `Game active - Place bet now at ${currentMultiplier.toFixed(2)}x`, icon: Timer, color: 'text-green-500' };
    }
    
    if (gameStatus === 'active' && !canBet) {
      return { text: 'Too late to bet - Multiplier too high', icon: AlertCircle, color: 'text-red-500' };
    }
    
    if (gameStatus === 'crashed') {
      return { text: 'Round ended. Next round starting soon.', icon: AlertCircle, color: 'text-red-500' };
    }

    return null;
  };

  const status = getStatusMessage();
  if (!status) return null;

  const IconComponent = status.icon;

  return (
    <div className="mt-2">
      <div className={`${status.color} text-xs flex items-center`}>
        <IconComponent className="h-3 w-3 mr-1 flex-shrink-0" />
        <span>{status.text}</span>
      </div>
    </div>
  );
};

const TradingControls: FC<TradingControlsProps> = ({ 
  onBuy, 
  onSell, 
  isPlacingBet: propIsPlacingBet = false, 
  isCashingOut: propIsCashingOut = false,
  hasActiveGame: propHasActiveGame = false,
  walletBalance: propWalletBalance = 0,
  holdings: propHoldings = 0,
  currentMultiplier: propCurrentMultiplier = 1.0,
  isGameActive: propIsGameActive = true,
  isMobile = false
}) => {
  // Authentication and wallet setup
  const { authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';
  
  // State for user ID
  const [userId, setUserId] = useState<string | null>(null);
  
  // Enhanced game server connection (compatible with existing hook)
  const { currentGame, isConnected, placeBet, cashOut, countdown, isWaitingPeriod, canBet } = useGameSocket(walletAddress, userId || undefined);
  
  // Real wallet balance integration
  const { balance: realSolBalance, loading: balanceLoading, updateBalance } = useWalletBalance(walletAddress);
  
  // Calculate countdown values
  const countdownSeconds = countdown ? Math.ceil(countdown / 1000) : 0;
  const showCountdown = Boolean(countdown && countdown > 0 && currentGame?.status === 'waiting');
  
  // Enhanced bet tracking
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
  
  // Token context and wallet balance
  const [currentToken, setCurrentToken] = useState<TokenType>(TokenType.SOL);
  const [ruggedBalance, setRuggedBalance] = useState<number>(1000); // Default RUGGED balance
  
  // Check if wallet is ready
  const isWalletReady = authenticated && walletAddress !== '';

  // Use localStorage to remember user's preferred amount
  const [savedAmount, setSavedAmount] = useLocalStorage<string>('default-bet-amount', '0.01');
  const [amount, setAmount] = useState<string>(savedAmount);
  
  // Modal states
  const [showAirdropModal, setShowAirdropModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  
  // Auto cashout settings
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useLocalStorage<boolean>('auto-cashout-enabled', true);
  const [autoCashoutValue, setAutoCashoutValue] = useLocalStorage<string>('auto-cashout-value', '2.0');
  const [showAutoCashout, setShowAutoCashout] = useState<boolean>(false);
  
  // Loading states
  const [isPlacingBet, setIsPlacingBet] = useState<boolean>(false);
  const [isCashingOut, setIsCashingOut] = useState<boolean>(false);
  
  // State for expanded sections
  const [showBalanceExpanded, setShowBalanceExpanded] = useState<boolean>(false);
  
  // Error state
  const [serverError, setServerError] = useState<string>('');
  
  // Real game state from server
  const activeCurrentGame = currentGame;
  const activeIsGameActive = activeCurrentGame?.status === 'active' || activeCurrentGame?.status === 'waiting';
  const activeCurrentMultiplier = activeCurrentGame?.multiplier || propCurrentMultiplier;
  const gameStatus = activeCurrentGame?.status || 'waiting';

  // Get or create user when wallet connects
  useEffect(() => {
    if (authenticated && walletAddress) {
      const initUser = async () => {
        try {
          const userData = await UserAPI.getUserOrCreate(walletAddress);
          if (userData) {
            setUserId(userData.id);
          }
        } catch (error) {
          console.warn('Could not get user data:', error);
        }
      };
      initUser();
    }
  }, [authenticated, walletAddress]);

  // Update local amount state when saved amount changes
  useEffect(() => {
    setAmount(savedAmount);
  }, [savedAmount]);

  // Handle socket errors - removed since not available in current hook
  // useEffect(() => {
  //   if (socketError) {
  //     setServerError(socketError);
  //     setTimeout(() => setServerError(''), 5000);
  //   }
  // }, [socketError]);

  // Handle token switch
  const handleTokenChange = (token: TokenType) => {
    setCurrentToken(token);
  };

  // Enhanced cashout (compatible with existing hook)
  const handleCashout = useCallback(async () => {
    if (!authenticated || !walletAddress || !isConnected || !activeBet) {
      return;
    }

    setIsCashingOut(true);
    try {
      const success = await cashOut(walletAddress);
      
      if (success) {
        setActiveBet(null);
        updateBalance(); // Refresh wallet balance after cashout
        toast.success('Cashed out successfully!');
        if (onSell) onSell(100);
      } else {
        setServerError('Failed to cash out');
        toast.error('Failed to cash out');
      }
    } catch (error) {
      console.error('Error cashing out:', error);
      setServerError('Failed to cash out');
      toast.error('Failed to cash out');
    } finally {
      setIsCashingOut(false);
    }
  }, [authenticated, walletAddress, isConnected, activeBet, cashOut, onSell, updateBalance]);

  // Auto cashout effect
  useEffect(() => {
    if (
      activeBet && 
      activeIsGameActive && 
      autoCashoutEnabled && 
      parseFloat(autoCashoutValue) > 0 &&
      activeCurrentMultiplier >= parseFloat(autoCashoutValue) &&
      gameStatus === 'active'
    ) {
      console.log('Auto cashout triggered at', activeCurrentMultiplier, 'x');
      handleCashout();
    }
  }, [activeCurrentMultiplier, autoCashoutEnabled, autoCashoutValue, activeBet, activeIsGameActive, gameStatus, handleCashout]);

  // Handle amount change
  const handleAmountChange = (value: string) => {
    const pattern = currentToken === TokenType.SOL 
      ? /^(\d+)?(\.\d{0,6})?$/ 
      : /^\d*$/;
    
    if (pattern.test(value) || value === '') {
      setAmount(value);
      if (value !== '') {
        setSavedAmount(value);
      }
    }
  };

  // Quick amount buttons
  const quickAmounts = currentToken === TokenType.SOL 
    ? [0.01, 0.05, 0.1, 0.5] 
    : [10, 50, 100, 500];

  const setQuickAmount = (amt: number) => {
    const amtStr = amt.toString();
    setAmount(amtStr);
    setSavedAmount(amtStr);
  };

  // Handle auto cashout value change
  const handleAutoCashoutValueChange = (value: string) => {
    if (/^(\d+)?(\.\d{0,2})?$/.test(value) || value === '') {
      setAutoCashoutValue(value);
    }
  };

  const setQuickAutoCashoutValue = (value: number) => {
    setAutoCashoutValue(value.toString());
  };

  // Enhanced bet placement (compatible with existing hook)
  const handleBuy = async () => {
    const amountNum = parseFloat(amount);
    
    // Clear previous errors
    setServerError('');
    
    // Enhanced validation
    if (isNaN(amountNum) || amountNum <= 0) {
      setServerError('Invalid amount');
      toast.error('Invalid amount');
      return;
    }
    
    const minBetAmount = currentToken === TokenType.SOL ? 0.001 : 1;
    const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
    
    if (amountNum < minBetAmount) {
      setServerError(`Minimum bet: ${minBetAmount} ${currentToken}`);
      toast.error(`Minimum bet: ${minBetAmount} ${currentToken}`);
      return;
    }
    
    if (amountNum > maxBetAmount) {
      setServerError(`Maximum bet: ${maxBetAmount} ${currentToken}`);
      toast.error(`Maximum bet: ${maxBetAmount} ${currentToken}`);
      return;
    }
    
    // Check for wallet readiness
    if (!isWalletReady || !isConnected) {
      setServerError('Please login to play');
      toast.error('Please login to play');
      return;
    }
    
    // Enhanced game availability check
    if (!activeIsGameActive || !canBet) {
      if (isWaitingPeriod && countdownSeconds <= 2) {
        setServerError('Too late - game starting soon!');
        toast.error('Too late - game starting soon!');
      } else {
        setServerError('Game is not available');
        toast.error('Game is not available');
      }
      return;
    }

    // Check balance
    if (amountNum > activeBalance) {
      setServerError('Insufficient balance');
      toast.error('Insufficient balance');
      return;
    }

    setIsPlacingBet(true);
    try {
      // Compatible bet placement with existing hook
      const success = await placeBet(walletAddress, amountNum, userId || undefined);
      
      if (success) {
        // Store bet with calculated entry multiplier
        const entryMultiplier = gameStatus === 'waiting' ? 1.0 : activeCurrentMultiplier;
        
        const newBet: ActiveBet = {
          id: `bet_${Date.now()}`,
          amount: amountNum,
          entryMultiplier,
          timestamp: Date.now(),
          gameId: activeCurrentGame?.id || 'unknown'
        };
        
        setActiveBet(newBet);
        updateBalance(); // Refresh wallet balance after bet placement
        
        const betType = gameStatus === 'waiting' ? 'Pre-game bet' : 'Bet';
        toast.success(`${betType} placed: ${amountNum} SOL (Entry: ${entryMultiplier.toFixed(2)}x)`);
        
        if (onBuy) onBuy(amountNum);
      } else {
        const errorMsg = 'Failed to place bet';
        setServerError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Error placing bet:', error);
      const errorMsg = 'Failed to place bet';
      setServerError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsPlacingBet(false);
    }
  };

  const activeBalance = currentToken === TokenType.SOL ? realSolBalance : ruggedBalance;

  // Validation error message
  const getBetValidationError = () => {
    const amountNum = parseFloat(amount);
    const minBetAmount = currentToken === TokenType.SOL ? 0.001 : 1;
    const maxBetAmount = currentToken === TokenType.SOL ? 10.0 : 10000;
    
    if (isNaN(amountNum) || amountNum <= 0) return 'Enter valid amount';
    if (amountNum < minBetAmount) return `Minimum: ${minBetAmount} ${currentToken}`;
    if (amountNum > maxBetAmount) return `Maximum: ${maxBetAmount} ${currentToken}`;
    if (amountNum > activeBalance) return 'Insufficient balance';
    return '';
  };

  const betValidationError = getBetValidationError();

  // Enhanced responsive container
  const containerClasses = `
    bg-[#0d0d0f] text-white border border-gray-800 rounded-lg
    ${isMobile 
      ? 'p-3 max-w-sm mx-auto' 
      : 'p-4 min-w-[320px] max-w-md'
    }
  `;

  // Mobile-optimized layout
  if (isMobile) {
    return (
      <div className={containerClasses}>
        {/* Compact Game Info */}
        <CompactGameInfo
          game={activeCurrentGame}
          countdown={countdown || 0}
          showCountdown={showCountdown}
          isConnected={isConnected}
          isMobile={isMobile}
        />

        {/* Active Bet Display */}
        {activeBet && (
          <ActiveBetDisplay
            bet={activeBet}
            currentMultiplier={activeCurrentMultiplier}
            isMobile={isMobile}
          />
        )}

        {/* Betting Section */}
        <div className="bg-gray-900 bg-opacity-50 rounded-lg p-3 mb-3">
          <BettingSection
            activeBet={activeBet}
            amount={amount}
            onAmountChange={handleAmountChange}
            onQuickAmount={setQuickAmount}
            onPlaceBet={handleBuy}
            onCashout={handleCashout}
            quickAmounts={quickAmounts}
            currentToken={currentToken}
            activeBalance={activeBalance}
            isPlacingBet={isPlacingBet}
            isCashingOut={isCashingOut}
            isWalletReady={isWalletReady}
            canBet={canBet}
            isWaitingPeriod={isWaitingPeriod}
            gameStatus={gameStatus}
            isConnected={isConnected}
            currentMultiplier={activeCurrentMultiplier}
            isMobile={isMobile}
            betValidationError={betValidationError}
          />
        </div>

        {/* Collapsible Balance Display */}
        <BalanceDisplay
          currentToken={currentToken}
          activeBalance={activeBalance}
          onTokenChange={handleTokenChange}
          onDepositClick={() => setShowDepositModal(true)}
          onWithdrawClick={() => setShowWithdrawModal(true)}
          onAirdropClick={() => setShowAirdropModal(true)}
          isMobile={isMobile}
          showExpanded={showBalanceExpanded}
          onToggleExpanded={() => setShowBalanceExpanded(!showBalanceExpanded)}
          isLoading={balanceLoading}
          onRefreshBalance={updateBalance}
        />

        {/* Auto Cashout Settings */}
        <AutoCashoutSection
          autoCashoutEnabled={autoCashoutEnabled}
          autoCashoutValue={autoCashoutValue}
          onToggle={setAutoCashoutEnabled}
          onValueChange={handleAutoCashoutValueChange}
          onQuickValue={setQuickAutoCashoutValue}
          isMobile={isMobile}
          showExpanded={showAutoCashout}
          onToggleExpanded={() => setShowAutoCashout(!showAutoCashout)}
        />

        {/* Status Messages */}
        <StatusMessages
          isWalletReady={isWalletReady}
          isConnected={isConnected}
          amount={amount}
          activeBalance={activeBalance}
          activeBet={activeBet}
          isWaitingPeriod={isWaitingPeriod}
          canBet={canBet}
          gameStatus={gameStatus}
          currentMultiplier={activeCurrentMultiplier}
          countdownSeconds={countdownSeconds}
          serverError={serverError}
        />

        {/* Modals */}
        <AirdropModal 
          isOpen={showAirdropModal}
          onClose={() => setShowAirdropModal(false)}
        />
        
        <DepositModal 
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          currentToken={currentToken}
          walletAddress={walletAddress}
        />
        
        <WithdrawModal 
          isOpen={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          currentToken={currentToken}
          balance={activeBalance}
        />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className={containerClasses}>
      {/* Compact Game Info */}
      <CompactGameInfo
        game={activeCurrentGame}
        countdown={countdown || 0}
        showCountdown={showCountdown}
        isConnected={isConnected}
        isMobile={isMobile}
      />

      {/* Balance Display with Wallet Actions */}
      <BalanceDisplay
        currentToken={currentToken}
        activeBalance={activeBalance}
        onTokenChange={handleTokenChange}
        onDepositClick={() => setShowDepositModal(true)}
        onWithdrawClick={() => setShowWithdrawModal(true)}
        onAirdropClick={() => setShowAirdropModal(true)}
        isMobile={isMobile}
        showExpanded={showBalanceExpanded}
        onToggleExpanded={() => setShowBalanceExpanded(!showBalanceExpanded)}
        isLoading={balanceLoading}
        onRefreshBalance={updateBalance}
      />

      {/* Auto Cashout Settings */}
      <AutoCashoutSection
        autoCashoutEnabled={autoCashoutEnabled}
        autoCashoutValue={autoCashoutValue}
        onToggle={setAutoCashoutEnabled}
        onValueChange={handleAutoCashoutValueChange}
        onQuickValue={setQuickAutoCashoutValue}
        isMobile={isMobile}
        showExpanded={showAutoCashout}
        onToggleExpanded={() => setShowAutoCashout(!showAutoCashout)}
      />

      {/* Active Bet Display */}
      {activeBet && (
        <ActiveBetDisplay
          bet={activeBet}
          currentMultiplier={activeCurrentMultiplier}
          isMobile={isMobile}
        />
      )}

      {/* Betting Section */}
      <BettingSection
        activeBet={activeBet}
        amount={amount}
        onAmountChange={handleAmountChange}
        onQuickAmount={setQuickAmount}
        onPlaceBet={handleBuy}
        onCashout={handleCashout}
        quickAmounts={quickAmounts}
        currentToken={currentToken}
        activeBalance={activeBalance}
        isPlacingBet={isPlacingBet}
        isCashingOut={isCashingOut}
        isWalletReady={isWalletReady}
        canBet={canBet}
        isWaitingPeriod={isWaitingPeriod}
        gameStatus={gameStatus}
        isConnected={isConnected}
        currentMultiplier={activeCurrentMultiplier}
        isMobile={isMobile}
        betValidationError={betValidationError}
      />

      {/* Status Messages */}
      <StatusMessages
        isWalletReady={isWalletReady}
        isConnected={isConnected}
        amount={amount}
        activeBalance={activeBalance}
        activeBet={activeBet}
        isWaitingPeriod={isWaitingPeriod}
        canBet={canBet}
        gameStatus={gameStatus}
        currentMultiplier={activeCurrentMultiplier}
        countdownSeconds={countdownSeconds}
        serverError={serverError}
      />

      {/* Modals */}
      <AirdropModal 
        isOpen={showAirdropModal}
        onClose={() => setShowAirdropModal(false)}
      />
      
      <DepositModal 
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        currentToken={currentToken}
        walletAddress={walletAddress}
      />
      
      <WithdrawModal 
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        currentToken={currentToken}
        balance={activeBalance}
      />
    </div>
  );
};

export default TradingControls;