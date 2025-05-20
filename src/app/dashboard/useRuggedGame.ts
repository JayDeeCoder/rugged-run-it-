import { useState } from 'react';

export function useRuggedGame() {
  // Mock implementation for development/testing
  const [playerStats] = useState({
    totalWagered: '125.75',
    totalPayout: '130.22',
    gamesPlayed: 42
  });

  return {
    minBet: '0.01',
    maxBet: '10.0',
    houseEdge: 5,
    currentGameId: 123,
    playerStats,
    
    placeBet: async (amount: string) => {
      console.log('Mock placeBet:', amount);
      return { hash: '0x123' };
    },
    
    cashOut: async (gameId: number, multiplier: number) => {
      console.log('Mock cashOut:', gameId, multiplier);
      return { hash: '0x456' };
    },
    
    deposit: async (amount: string) => {
      console.log('Mock deposit:', amount);
      return { hash: '0x789' };
    },
    
    isPlacingBet: false,
    isCashingOut: false,
    isDepositing: false,
    
    placeBetError: null,
    cashOutError: null,
    depositError: null
  };
}