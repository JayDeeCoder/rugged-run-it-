// src/services/RuggedGameService.ts
import { Connection, PublicKey, Transaction, SendOptions, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import solanaWalletService from '../services/SolanaWalletService';
import { toast } from 'react-hot-toast';

// Types for game state management
export interface GameState {
  gameId: string;
  multiplier: number;
  isActive: boolean;
  betAmount: number;
  betToken: 'SOL' | 'RUGGED';
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

export class RuggedGameService {
  // House wallet address - funds go here when users get rugged
  private static HOUSE_WALLET_ADDRESS = process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS || 
                                       'DmFLNxVq5k9DvyVGJj7TprKUFjF9TbKdcA4QQfT3xMHM';
  
  // Keep track of game states
  private activeGames: Map<string, GameState> = new Map();
  private houseFeePercentage: number = 0.05; // 5% house fee on winnings
  private connection: Connection;
  
  constructor() {
    console.log("RuggedGameService initialized with house wallet:", RuggedGameService.HOUSE_WALLET_ADDRESS);
    
    // Initialize Solana connection
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.gateway.tatum.io/';
    const apiKey = process.env.NEXT_PUBLIC_TATUM_API_KEY || 't-682a1c08650ecaebde72d2aa-264faa21e495426f9a2eb26f';
    
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      httpHeaders: {
        'x-api-key': apiKey
      }
    });
  }
  
  /**
   * Start a new game by placing a bet
   */
  async placeBet(
    playerAddress: string, 
    betAmount: number, 
    wallet: any,
    betToken: 'SOL' | 'RUGGED' = 'SOL'
  ): Promise<GameState> {
    try {
      // Validate wallet is available
      if (!wallet) {
        throw new Error('Wallet is required to place a bet');
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
        // Create transaction
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: new PublicKey(wallet.address),
            toPubkey: new PublicKey(RuggedGameService.HOUSE_WALLET_ADDRESS),
            lamports: Math.floor(betAmount * LAMPORTS_PER_SOL)
          })
        );
        
        // Get recent blockhash
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = new PublicKey(wallet.address);
        
        // Sign transaction
        const signedTransaction = await wallet.signTransaction(transaction);
        
        // Send transaction
        const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
        
        // Wait for confirmation
        await this.connection.confirmTransaction(signature);
        
        console.log(`Bet of ${betAmount} SOL placed successfully, transaction: ${signature}`);
      } else if (betToken === 'RUGGED') {
        // For RUGGED token implementation
        // This would use SPL token transfer instead of SOL transfer
        console.log(`Bet of ${betAmount} RUGGED token placed (token transfer implementation)`);
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
      toast.error(`Failed to place bet: ${errorMessage}`);
      
      throw new Error(`Failed to place bet: ${errorMessage}`);
    }
  }
  
  /**
   * Cash out from a game before it gets rugged
   */
  async cashOut(
    gameId: string, 
    wallet: any
  ): Promise<GameResult> {
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
    
    // Calculate winnings
    const winnings = gameState.betAmount * gameState.multiplier;
    const houseFee = winnings * this.houseFeePercentage;
    const payout = winnings - houseFee;
    
    try {
      let signature = '';
      
      // For SOL: House wallet sends the winnings back to player
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
      } else {
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
      throw new Error('Failed to cash out. Please try again.');
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