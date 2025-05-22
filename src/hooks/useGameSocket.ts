import { useEffect, useState, useCallback } from 'react';
import { gameAPI, GameState } from '../services/api';

interface GameSocketData {
  currentGame: GameState | null;
  gameHistory: GameState[];
  isConnected: boolean;
  placeBet: (walletAddress: string, betAmount: number, userId?: string) => Promise<boolean>;
  cashOut: (walletAddress: string) => Promise<boolean>;
}

export const useGameSocket = (walletAddress?: string, userId?: string): GameSocketData => {
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [gameHistory, setGameHistory] = useState<GameState[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    // Set up event listeners
    gameAPI.on('connect', () => {
      setIsConnected(true);
    });

    gameAPI.on('disconnect', () => {
      setIsConnected(false);
    });

    gameAPI.on('gameState', (gameState: GameState) => {
      setCurrentGame(gameState);
    });

    gameAPI.on('gameStarted', (data: any) => {
      setCurrentGame(prev => prev ? { ...prev, ...data } : null);
    });

    gameAPI.on('multiplierUpdate', (data: { multiplier: number; timestamp: number }) => {
      setCurrentGame(prev => prev ? { ...prev, multiplier: data.multiplier } : null);
    });

    gameAPI.on('gameCrashed', (data: { crashMultiplier: number; timestamp: number }) => {
      setCurrentGame(prev => prev ? { ...prev, status: 'crashed', multiplier: data.crashMultiplier } : null);
    });

    gameAPI.on('gameHistory', (history: GameState[]) => {
      setGameHistory(history);
    });

    return () => {
      // Clean up listeners
      gameAPI.off('connect', () => {});
      gameAPI.off('disconnect', () => {});
      gameAPI.off('gameState', () => {});
      gameAPI.off('gameStarted', () => {});
      gameAPI.off('multiplierUpdate', () => {});
      gameAPI.off('gameCrashed', () => {});
      gameAPI.off('gameHistory', () => {});
    };
  }, []);

  const placeBet = useCallback(async (walletAddress: string, betAmount: number, userId?: string): Promise<boolean> => {
    return gameAPI.placeBet(walletAddress, betAmount, userId);
  }, []);

  const cashOut = useCallback(async (walletAddress: string): Promise<boolean> => {
    npm install gameAPI.cashOut(walletAddress);
  }, []);

  return {
    currentGame,
    gameHistory,
    isConnected,
    placeBet,
    cashOut
  };
};
