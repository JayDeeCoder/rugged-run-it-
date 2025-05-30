import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import logger from '../utils/logger';
import { safeCreatePublicKey, isValidSolanaAddress } from '../utils/walletUtils';

// Load Solana connection with ALCHEMY RPC
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3', 
  {
    commitment: 'confirmed',
    httpHeaders: {
      'x-api-key': process.env.ALCHEMY_API_KEY || ''
    }
  }
);

// Load house wallet securely using environment variables or secret management
const HOUSE_PRIVATE_KEY = process.env.HOUSE_WALLET_PRIVATE_KEY || '';
let houseKeypair: Keypair;

try {
  const privateKeyBytes = Buffer.from(HOUSE_PRIVATE_KEY, 'base64');
  houseKeypair = Keypair.fromSecretKey(privateKeyBytes);
  logger.info(`House wallet initialized: ${houseKeypair.publicKey.toString()}`);
} catch (error) {
  logger.error('Failed to load house wallet - critical error:', error);
  throw new Error('House wallet configuration error');
}

export interface GameState {
  gameId: string;
  playerId: string;
  playerWallet: string;
  betAmount: number;
  multiplier: number;
  isActive: boolean;
  startTime: number;
  endTime?: number;
  isRugPulled: boolean;
  token: 'SOL' | 'RUGGED';
}

class GameService {
  private games: Map<string, GameState> = new Map();

  /**
   * Start a new game by placing a bet
   */
  async placeBet(
    playerId: string, 
    playerWallet: string, 
    betAmount: number, 
    token: 'SOL' | 'RUGGED' = 'SOL',
    transactionId?: string
  ): Promise<GameState> {
    try {
      // Validate player wallet address before using
      if (!isValidSolanaAddress(playerWallet)) {
        console.error('Invalid player wallet address:', playerWallet);
        throw new Error('Invalid player wallet address');
      }

      // Verify the transaction on the blockchain if transactionId is provided
      if (transactionId) {
        // Get transaction details from Solana
        const tx = await connection.getTransaction(transactionId, {
          commitment: 'confirmed',
        });
        
        if (!tx) {
          throw new Error('Transaction not found or not confirmed');
        }
        
        // Verify transaction details
        // 1. Check that it's a transfer to the house wallet
        // 2. Verify amount matches betAmount
        // 3. Verify sender is playerWallet
        // Implementation depends on transaction structure
      }

      // Generate unique game ID
      const gameId = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // Create game state
      const gameState: GameState = {
        gameId,
        playerId,
        playerWallet,
        betAmount,
        multiplier: 1.0,
        isActive: true,
        startTime: Date.now(),
        isRugPulled: false,
        token
      };
      
      // Store game state
      this.games.set(gameId, gameState);
      
      // Log bet placement
      logger.info(`New bet placed: ${betAmount} ${token} by player ${playerId}`);
      
      return gameState;
    } catch (error) {
      logger.error('Error placing bet:', error);
      throw new Error('Failed to place buy');
    }
  }

  /**
   * Update game multiplier
   */
  updateGameMultiplier(gameId: string, multiplier: number): GameState {
    const game = this.games.get(gameId);
    if (!game || !game.isActive) {
      throw new Error('Game not found or inactive');
    }
    
    game.multiplier = multiplier;
    return game;
  }

  /**
   * Cash out from an active game
   */
  async cashOut(gameId: string, playerId: string): Promise<{
    success: boolean;
    payout: number;
    multiplier: number;
    transactionId?: string;
  }> {
    const game = this.games.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }
    
    if (!game.isActive) {
      throw new Error('Game is already finished');
    }
    
    if (game.playerId !== playerId) {
      throw new Error('Not your game');
    }
    
    // Calculate payout
    const payout = game.betAmount * game.multiplier;
    
    try {
      let transactionId = '';
      
      // Send real transaction using Alchemy RPC
      if (game.token === 'SOL') {
        // Validate player wallet address before using
        if (!isValidSolanaAddress(game.playerWallet)) {
          console.error('Invalid player wallet address:', game.playerWallet);
          throw new Error('Invalid player wallet address');
        }

        // Create safe PublicKey for player wallet
        const toPubkey = safeCreatePublicKey(game.playerWallet);
        if (!toPubkey) {
          console.error('Invalid address:', game.playerWallet);
          throw new Error('Failed to create valid PublicKey for player wallet');
        }

        // Send SOL from house wallet to player
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: houseKeypair.publicKey,
            toPubkey,
            lamports: Math.floor(payout * LAMPORTS_PER_SOL)
          })
        );
        
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = houseKeypair.publicKey;
        
        // Sign and send transaction
        transaction.sign(houseKeypair);
        transactionId = await connection.sendRawTransaction(transaction.serialize());
        
        // Wait for confirmation
        await connection.confirmTransaction(transactionId);
        
        logger.info(`Payout transaction sent: ${transactionId}`);
      } else if (game.token === 'RUGGED') {
        // Implement RUGGED token payout using SPL Token program
        // This requires the token program ID and house token account
        // Implementation would be similar but using Token program instructions
        throw new Error('RUGGED token payouts not yet implemented');
      }
      
      // Update game state
      game.isActive = false;
      game.endTime = Date.now();
      
      return {
        success: true,
        payout,
        multiplier: game.multiplier,
        transactionId
      };
    } catch (error) {
      logger.error('Error cashing out:', error);
      throw new Error('Failed to process cashout');
    }
  }

  /**
   * Trigger a rugpull for a game
   */
  rugPull(gameId: string): GameState {
    const game = this.games.get(gameId);
    if (!game || !game.isActive) {
      throw new Error('Game not found or inactive');
    }
    
    // Mark game as rugged
    game.isRugPulled = true;
    game.isActive = false;
    game.endTime = Date.now();
    
    logger.info(`Game ${gameId} rugged at ${game.multiplier}x`);
    
    return game;
  }

  /**
   * Get game by ID
   */
  getGame(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }

  /**
   * Get all active games
   */
  getActiveGames(): GameState[] {
    return Array.from(this.games.values()).filter(game => game.isActive);
  }
}

export const gameService = new GameService();
export default gameService;