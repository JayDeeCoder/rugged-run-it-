// src/services/RuggedGameService.ts
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { toast } from 'react-hot-toast';
import { safeCreatePublicKey, isValidSolanaAddress } from '../utils/walletUtils';

// Types for game state management
export type TokenType = 'SOL' | 'RUGGED';

export interface GameState {
  gameId: string;
  multiplier: number;
  isActive: boolean;
  betAmount: number;
  betToken: TokenType;
  playerAddress: string;
  startTime: number;
  rugPullProbability: number;
  isRugPulled: boolean;
}

export interface GameResult {
  gameId: string;
  multiplier: number;
  betAmount: number;
  payout: number;
  wasRugPulled: boolean;
  transactionId?: string;
}

// Interface for wallet with embedded wallet methods
export interface EmbeddedWallet {
  address: string;
  walletClientType: string; // 'privy' for embedded wallets
  sendTransaction?: (options: any) => Promise<string>;
  signAndSendTransaction?: (options: any) => Promise<string>;
}

export class RuggedGameService {
  // House wallet address - funds go here when users get rugged
  private static HOUSE_WALLET_ADDRESS = process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS || 
                                       '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';
  
  // Keep track of game states
  private activeGames: Map<string, GameState> = new Map();
  private houseFeePercentage: number = 0.05; // 5% house fee on winnings
  
  constructor() {
    console.log("RuggedGameService initialized with house wallet:", RuggedGameService.HOUSE_WALLET_ADDRESS);
  }
  
  /**
   * Start a new game by placing a bet
   * Only supports embedded wallets
   */
  async placeBet(
    playerAddress: string, 
    betAmount: number, 
    wallet: EmbeddedWallet,
    betToken: TokenType = 'SOL'
  ): Promise<GameState> {
    try {
      // Validate wallet is available
      if (!wallet) {
        throw new Error('Wallet is required to place a bet');
      }

      // Verify this is an embedded wallet
      if (wallet.walletClientType !== 'privy') {
        throw new Error('Only embedded wallets are supported');
      }

      // Validate player address before using
      if (!isValidSolanaAddress(playerAddress)) {
        console.error('Invalid player address:', playerAddress);
        throw new Error('Invalid player address');
      }

      // Validate wallet address before using
      if (!isValidSolanaAddress(wallet.address)) {
        console.error('Invalid wallet address:', wallet.address);
        throw new Error('Invalid wallet address');
      }

      // Generate unique game ID
      const gameId = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Create initial game state
      const gameState: GameState = {
        gameId,
        multiplier: 1.0,
        isActive: true,
        betAmount,
        betToken,
        playerAddress,
        startTime: Date.now(),
        rugPullProbability: 0.05, // Initial 5% chance
        isRugPulled: false
      };
      
      // For SOL bets, transfer the bet amount to the house wallet
      if (betToken === 'SOL') {
        let signature: string;
        
        // Validate house wallet address before using
        if (!isValidSolanaAddress(RuggedGameService.HOUSE_WALLET_ADDRESS)) {
          console.error('Invalid house wallet address:', RuggedGameService.HOUSE_WALLET_ADDRESS);
          throw new Error('Invalid house wallet address');
        }

        // Create safe PublicKey instances
        const fromPubkey = safeCreatePublicKey(wallet.address);
        if (!fromPubkey) {
          console.error('Invalid address:', wallet.address);
          throw new Error('Failed to create valid PublicKey for wallet address');
        }

        const toPubkey = safeCreatePublicKey(RuggedGameService.HOUSE_WALLET_ADDRESS);
        if (!toPubkey) {
          console.error('Invalid address:', RuggedGameService.HOUSE_WALLET_ADDRESS);
          throw new Error('Failed to create valid PublicKey for house wallet address');
        }

        // Create transaction using embedded wallet
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports: Math.floor(betAmount * LAMPORTS_PER_SOL)
          })
        );
        
        // Get proper method from wallet
        if (wallet.sendTransaction) {
          // Privy's sendTransaction method
          signature = await wallet.sendTransaction({
            transaction: transaction.serialize({ requireAllSignatures: false }),
            message: `Bet of ${betAmount} SOL in RUGGED game`
          });
          
          console.log('Transaction sent via Privy wallet sendTransaction:', signature);
        } else if (wallet.signAndSendTransaction) {
          // Alternative method for Privy embedded wallet
          signature = await wallet.signAndSendTransaction({
            transaction: transaction.serialize({ requireAllSignatures: false }),
            message: `Bet of ${betAmount} SOL in RUGGED game`
          });
          
          console.log('Transaction sent via Privy wallet signAndSendTransaction:', signature);
        } else {
          throw new Error('Embedded wallet does not support required transaction methods');
        }
        
        console.log(`Bet of ${betAmount} SOL placed successfully, transaction: ${signature}`);
      } else if (betToken === 'RUGGED') {
        // For RUGGED token implementation
        // This would use SPL token transfer instead of SOL transfer
        console.log(`Bet of ${betAmount} RUGGED token placed (token transfer implementation)`);
        
        // Placeholder for RUGGED token transfer logic
        // This would involve:
        // 1. Creating a token transfer instruction
        // 2. Building, signing, and sending the transaction
        // 3. For now, we'll just simulate it
      }
      
      // Store game state
      this.activeGames.set(gameId, gameState);
      
      // Notify of successful bet placement
      toast.success(`Bet of ${betAmount} ${betToken} placed successfully!`);
      
      return gameState;
    } catch (error) {
      console.error('Error placing bet:', error);
      
      // Show error notification
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to place buy: ${errorMessage}`);
      
      throw new Error(`Failed to place buy: ${errorMessage}`);
    }
  }
  
  /**
   * Cash out from a game before it gets rugged
   */
  async cashOut(
    gameId: string, 
    wallet: EmbeddedWallet
  ): Promise<GameResult> {
    try {
      // Get game state
      const gameState = this.activeGames.get(gameId);
      if (!gameState) {
        throw new Error('Game not found');
      }
      
      if (!gameState.isActive) {
        throw new Error('Game is not active');
      }
      
      if (gameState.isRugPulled) {
        throw new Error('Game was already rugged');
      }
      
      // Validate player address before using
      if (!isValidSolanaAddress(gameState.playerAddress)) {
        console.error('Invalid player address:', gameState.playerAddress);
        throw new Error('Invalid player address in game state');
      }
      
      // Calculate winnings
      const winnings = gameState.betAmount * gameState.multiplier;
      const houseFee = winnings * this.houseFeePercentage;
      const payout = winnings - houseFee;
      
      let signature = '';
      
      // For SOL: House wallet would send the winnings back to player
      // This would be handled by your backend in production
      if (gameState.betToken === 'SOL') {
        // IMPORTANT: In production, this would be a server-side operation
        // where the house wallet is controlled by your backend
        // This frontend simulation is just for demonstration
        
        // Simulate house sending funds to player
        console.log(`House wallet would send ${payout} SOL to ${gameState.playerAddress}`);
        
        // In a real implementation, your backend would sign and send this transaction
        // signature = await this.sendFromHouseWallet(gameState.playerAddress, payout);
        
        // For demo purposes, we're just logging and not actually sending funds
        signature = `simulated_payout_tx_${Date.now()}`;
      } else if (gameState.betToken === 'RUGGED') {
        // For RUGGED token - similar implementation would be needed
        console.log(`House would send ${payout} RUGGED to ${gameState.playerAddress}`);
        signature = `simulated_token_payout_tx_${Date.now()}`;
      }
      
      // Mark game as completed
      gameState.isActive = false;
      this.activeGames.delete(gameId);
      
      // Return result
      return {
        gameId: gameState.gameId,
        multiplier: gameState.multiplier,
        betAmount: gameState.betAmount,
        payout,
        wasRugPulled: false,
        transactionId: signature
      };
    } catch (error) {
      console.error('Error cashing out:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to RUG: ${errorMessage}`);
      throw new Error(`Failed to RUG: ${errorMessage}`);
    }
  }
  
  /**
   * Update game state - called regularly as multiplier increases
   */
  updateGameState(gameId: string, newMultiplier: number): GameState {
    const gameState = this.activeGames.get(gameId);
    if (!gameState || !gameState.isActive) {
      throw new Error('No active game found');
    }
    
    // Update multiplier
    gameState.multiplier = newMultiplier;
    
    // Increase rugpull probability as multiplier increases
    // This creates the risk/reward tension in the game
    const timeElapsed = (Date.now() - gameState.startTime) / 1000; // in seconds
    const baseRisk = 0.05; // Base 5% chance
    const multiplierRisk = (newMultiplier - 1) * 0.02; // 2% per 1x increase
    const timeRisk = timeElapsed * 0.001; // 0.1% per second
    
    gameState.rugPullProbability = Math.min(0.95, baseRisk + multiplierRisk + timeRisk);
    
    // Return updated state
    return { ...gameState };
  }
  
  /**
   * Check if a rugpull should happen based on probability
   */
  checkForRugPull(gameId: string): boolean {
    const gameState = this.activeGames.get(gameId);
    if (!gameState || !gameState.isActive) {
      return false;
    }
    
    // Generate random number and compare to rugpull probability
    const random = Math.random();
    const shouldRugPull = random < gameState.rugPullProbability;
    
    if (shouldRugPull) {
      this.executeRugPull(gameId);
      return true;
    }
    
    return false;
  }
  
  /**
   * Force a rugpull to happen (for testing or admin purposes)
   */
  forceRugPull(gameId: string): GameResult {
    return this.executeRugPull(gameId);
  }
  
  /**
   * Execute the rugpull - user loses their bet, house keeps everything
   */
  private executeRugPull(gameId: string): GameResult {
    const gameState = this.activeGames.get(gameId);
    if (!gameState || !gameState.isActive) {
      throw new Error('No active game found');
    }
    
    // Mark game as rugged and inactive
    gameState.isRugPulled = true;
    gameState.isActive = false;
    
    // House already has the funds, so nothing to transfer
    console.log(`Game ${gameId} rugged at ${gameState.multiplier}x! House keeps ${gameState.betAmount} ${gameState.betToken}`);
    
    // Show toast notification
    toast.error(`RUGGED at ${gameState.multiplier.toFixed(2)}x! Lost ${gameState.betAmount} ${gameState.betToken}`, {
      duration: 5000,
      icon: '💥'
    });
    
    // Clean up
    this.activeGames.delete(gameId);
    
    // Return result
    return {
      gameId: gameState.gameId,
      multiplier: gameState.multiplier,
      betAmount: gameState.betAmount,
      payout: 0, // User gets nothing in a rugpull
      wasRugPulled: true
    };
  }
  
  /**
   * Get current game state
   */
  getGameState(gameId: string): GameState | null {
    return this.activeGames.get(gameId) || null;
  }
  
  /**
   * Get all active games
   */
  getAllActiveGames(): GameState[] {
    return Array.from(this.activeGames.values());
  }
}

// Export singleton instance
export const ruggedGameService = new RuggedGameService();
export default ruggedGameService;