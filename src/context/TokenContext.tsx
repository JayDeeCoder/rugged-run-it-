'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useRuggedGame } from '../app/dashboard/useRuggedGame';
import { toast } from 'react-hot-toast';

// Define the types for our game state
interface GameState {
  gameId: number | null;
  betAmount: string;
  startTime: number | null;
  currentMultiplier: number;
  isActive: boolean;
  hasAutoCashout: boolean;
  autoCashoutMultiplier: number;
}

// Define transaction history entry type
export interface GameHistoryEntry {
  id: string;
  gameId: number;
  betAmount: string;
  timestamp: number;
  result: 'win' | 'loss' | 'pending';
  cashoutMultiplier: number | null;
  profit: string | null;
}

// Define context type
interface GameContextType {
  gameState: GameState;
  gameHistory: GameHistoryEntry[];
  startGame: (amount: string) => Promise<void>;
  cashout: (percentage: number) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  clearActiveGame: () => void;
  setAutoCashout: (value: boolean, multiplier?: number) => void;
}

// Create the context
const GameContext = createContext<GameContextType | undefined>(undefined);

// Create a provider component
export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { wallets } = useWallets();
  const { authenticated } = usePrivy();
  
  // Get the active wallet
  const activeWallet = wallets.length > 0 ? wallets[0] : null;
  const isConnected = wallets.length > 0 && authenticated;
  const walletAddress = activeWallet?.address;
  
  const { 
    placeBet, 
    cashOut, 
    isPlacingBet, 
    isCashingOut, 
    placeBetError, 
    cashOutError,
    currentGameId 
  } = useRuggedGame();

  // Game state
  const [gameState, setGameState] = useState<GameState>({
    gameId: null,
    betAmount: '0',
    startTime: null,
    currentMultiplier: 1.0,
    isActive: false,
    hasAutoCashout: false,
    autoCashoutMultiplier: 2.0
  });

  // Loading and error states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Game history
  const [gameHistory, setGameHistory] = useState<GameHistoryEntry[]>([]);

  // Load game history from localStorage on mount
  useEffect(() => {
    if (isConnected && walletAddress) {
      const savedHistory = localStorage.getItem(`game_history_${walletAddress}`);
      if (savedHistory) {
        try {
          setGameHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error('Failed to parse game history:', e);
        }
      }
    }
  }, [isConnected, walletAddress]);

  // Save game history to localStorage when it changes
  useEffect(() => {
    if (isConnected && walletAddress && gameHistory.length > 0) {
      localStorage.setItem(`game_history_${walletAddress}`, JSON.stringify(gameHistory));
    }
  }, [gameHistory, isConnected, walletAddress]);

  // Handle auto cashout - Fixed with eslint-disable comment
  useEffect(() => {
    if (
      gameState.isActive && 
      gameState.hasAutoCashout && 
      gameState.currentMultiplier >= gameState.autoCashoutMultiplier
    ) {
      // Auto cashout when the multiplier reaches the threshold
      cashout(100).catch(err => {
        console.error('Auto cashout failed:', err);
        toast.error('Auto cashout failed!');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.currentMultiplier, gameState.hasAutoCashout, gameState.isActive, gameState.autoCashoutMultiplier]);

  // Clear error state when component unmounts
  useEffect(() => {
    return () => {
      setError(null);
    };
  }, []);

  // Set auto cashout settings
  const setAutoCashout = (value: boolean, multiplier: number = 2.0) => {
    setGameState(prevState => ({
      ...prevState,
      hasAutoCashout: value,
      autoCashoutMultiplier: multiplier
    }));
  };

  // Start a new game
  const startGame = async (amount: string) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first!');
      return;
    }

    if (gameState.isActive) {
      toast.error('You already have an active game!');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Place bet through smart contract
      await placeBet(amount);

      // Update game state
      setGameState({
        gameId: currentGameId,
        betAmount: amount,
        startTime: Date.now(),
        currentMultiplier: 1.0,
        isActive: true,
        hasAutoCashout: gameState.hasAutoCashout,
        autoCashoutMultiplier: gameState.autoCashoutMultiplier
      });

      // Add to history as pending
      const newHistoryEntry: GameHistoryEntry = {
        id: `game_${Date.now()}`,
        gameId: currentGameId,
        betAmount: amount,
        timestamp: Date.now(),
        result: 'pending',
        cashoutMultiplier: null,
        profit: null
      };

      setGameHistory(prev => [newHistoryEntry, ...prev]);

      toast.success('Game started!');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start game'));
      toast.error('Failed to start game!');
    } finally {
      setIsLoading(false);
    }
  };

  // Cashout from the current game - using useCallback to avoid recreating function
  const cashout = useCallback(async (percentage: number) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first!');
      return;
    }

    if (!gameState.isActive || !gameState.gameId) {
      toast.error('No active game to cash out from!');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Cash out through smart contract
      await cashOut(gameState.gameId, gameState.currentMultiplier);

      // Calculate profit
      const betAmount = parseFloat(gameState.betAmount);
      const profit = (betAmount * gameState.currentMultiplier) - betAmount;

      // Update history
      setGameHistory(prev => 
        prev.map(entry => 
          entry.gameId === gameState.gameId 
            ? {
                ...entry,
                result: 'win',
                cashoutMultiplier: gameState.currentMultiplier,
                profit: profit.toFixed(4)
              }
            : entry
        )
      );

      // Clear active game
      setGameState(prevState => ({
        ...prevState,
        isActive: false,
        gameId: null,
        startTime: null
      }));

      toast.success(`Cashed out at ${gameState.currentMultiplier.toFixed(2)}x!`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to cash out'));
      toast.error('Failed to cash out!');
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, gameState, cashOut]);

  // Clear active game (used for resets)
  const clearActiveGame = () => {
    setGameState({
      gameId: null,
      betAmount: '0',
      startTime: null,
      currentMultiplier: 1.0,
      isActive: false,
      hasAutoCashout: gameState.hasAutoCashout,
      autoCashoutMultiplier: gameState.autoCashoutMultiplier
    });
  };

  // Create the value object to be provided by the context
  const value = {
    gameState,
    gameHistory,
    startGame,
    cashout,
    isLoading: isLoading || isPlacingBet || isCashingOut,
    error: error || placeBetError || cashOutError,
    clearActiveGame,
    setAutoCashout
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

// Custom hook to use the game context
export const useGameContext = (): GameContextType => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};