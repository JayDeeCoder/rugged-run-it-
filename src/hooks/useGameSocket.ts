import { useEffect, useState, useCallback } from 'react';
import { gameAPI, GameState } from '../services/api';

interface GameSocketData {
  currentGame: GameState | null;
  gameHistory: GameState[];
  isConnected: boolean;
  placeBet: (walletAddress: string, betAmount: number, userId?: string) => Promise<boolean>;
  cashOut: (walletAddress: string) => Promise<{ success: boolean; multiplier?: number }>;
}

export const useGameSocket = (walletAddress?: string, userId?: string): GameSocketData => {
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [gameHistory, setGameHistory] = useState<GameState[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    // Set up event listeners
    const handleConnect = () => {
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleGameState = (gameState: GameState) => {
      setCurrentGame(gameState);
    };

    const handleGameStarted = (data: any) => {
      setCurrentGame(prev => prev ? { ...prev, ...data } : null);
    };

    const handleMultiplierUpdate = (data: { multiplier: number; timestamp: number }) => {
      setCurrentGame(prev => prev ? { ...prev, multiplier: data.multiplier } : null);
    };

    const handleGameCrashed = (data: { crashMultiplier: number; timestamp: number }) => {
      setCurrentGame(prev => prev ? { ...prev, status: 'crashed', multiplier: data.crashMultiplier } : null);
    };

    const handleGameHistory = (history: GameState[]) => {
      setGameHistory(history);
    };

    gameAPI.on('connect', handleConnect);
    gameAPI.on('disconnect', handleDisconnect);
    gameAPI.on('gameState', handleGameState);
    gameAPI.on('gameStarted', handleGameStarted);
    gameAPI.on('multiplierUpdate', handleMultiplierUpdate);
    gameAPI.on('gameCrashed', handleGameCrashed);
    gameAPI.on('gameHistory', handleGameHistory);

    return () => {
      // Clean up listeners
      gameAPI.off('connect', handleConnect);
      gameAPI.off('disconnect', handleDisconnect);
      gameAPI.off('gameState', handleGameState);
      gameAPI.off('gameStarted', handleGameStarted);
      gameAPI.off('multiplierUpdate', handleMultiplierUpdate);
      gameAPI.off('gameCrashed', handleGameCrashed);
      gameAPI.off('gameHistory', handleGameHistory);
    };
  }, []);

  const placeBet = useCallback(async (walletAddress: string, betAmount: number, userId?: string): Promise<boolean> => {
    return gameAPI.placeBet(walletAddress, betAmount, userId);
  }, []);

  const cashOut = useCallback(async (walletAddress: string): Promise<{ success: boolean; multiplier?: number }> => {
    return gameAPI.cashOut(walletAddress);
  }, []);

  return {
    currentGame,
    gameHistory,
    isConnected,
    placeBet,
    cashOut
  };
};