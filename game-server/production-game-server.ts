// production-game-server.ts - Complete Production-Ready Version with Enhanced Transaction Monitoring
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { 
    Connection, 
    PublicKey,
    SystemInstruction, 
    LAMPORTS_PER_SOL, 
    Transaction,
    SystemProgram,
    Keypair,
    sendAndConfirmTransaction,
    VersionedTransaction,
    TransactionMessage,
    ComputeBudgetProgram,
    TransactionInstruction,
    TransactionResponse
} from '@solana/web3.js';
import * as crypto from 'crypto';
import bs58 from 'bs58';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
const PORT = process.env.PORT || 3001;
const HOUSE_WALLET_ADDRESS = process.env.HOUSE_WALLET_ADDRESS!;
const HOUSE_WALLET_PRIVATE_KEY = process.env.HOUSE_WALLET_PRIVATE_KEY!; // Base58 encoded
const NODE_ENV = process.env.NODE_ENV || '';

// Initialize services
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseService = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY!);
const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3001",
        methods: ["GET", "POST"]
    }
});

// Initialize house wallet
let houseWallet: Keypair;
let housePublicKey: PublicKey;

try {
    houseWallet = Keypair.fromSecretKey(bs58.decode(HOUSE_WALLET_PRIVATE_KEY));
    housePublicKey = new PublicKey(HOUSE_WALLET_ADDRESS);
    
    if (!houseWallet.publicKey.equals(housePublicKey)) {
        throw new Error('House wallet private key does not match public key');
    }
    console.log('✅ House wallet initialized:', housePublicKey.toString());
} catch (error) {
    console.error('❌ Failed to initialize house wallet:', error);
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(".next/static"));
app.use(express.static("public"));

// TRANSACTION MONITORING - Track processed transactions to avoid duplicates
const processedSignatures = new Set<string>();

// GAME COUNTER FIX: Add persistent cycling game counter (1-100)
let globalGameCounter = 0;

// GAME COUNTER FIX: Initialize game counter from database on startup
async function initializeGameCounter(): Promise<void> {
    try {
        // Get the highest game number from database
        const { data: latestGame, error } = await supabaseService
            .from('games')
            .select('game_number')
            .order('game_number', { ascending: false })
            .limit(1)
            .single();

        if (!error && latestGame) {
            globalGameCounter = latestGame.game_number;
            console.log(`🎮 Game counter initialized from database: ${globalGameCounter}`);
        } else {
            // No games in database yet, start from 0
            globalGameCounter = 0;
            console.log('🎮 Game counter initialized: Starting from 0');
        }
    } catch (error) {
        console.warn('⚠️ Could not initialize game counter from database, starting from 0:', error);
        globalGameCounter = 0;
    }
}

// Enhanced Types
interface WalletBalance {
    address: string;
    balance: number;
    lastUpdated: number;
}

interface PendingTransaction {
    id: string;
    type: 'bet_collection' | 'payout' | 'refund';
    fromAddress: string;
    toAddress: string;
    amount: number;
    gameId: string;
    userId?: string;
    attempts: number;
    maxAttempts: number;
    createdAt: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface GameState {
    id: string;
    gameNumber: number;
    startTime: number;
    currentMultiplier: number;
    maxMultiplier: number;
    status: 'waiting' | 'active' | 'crashed';
    totalBets: number;
    totalPlayers: number;
    boostedPlayerCount: number; // ✅ Already exists
    boostedTotalBets: number;   // 🔧 ADD THIS LINE
    crashMultiplier?: number;
    seed: string;
    chartData: ChartPoint[];
    activeBets: Map<string, PlayerBet>;
    houseBalance: number;
    maxPayoutCapacity: number;
}
interface BootstrapFomoSystem {
    enabled: boolean;
    
    // Detection settings
    noPlayersThreshold: number;        // Consider "empty" if total bets < this
    minEmptyGamesBeforeFomo: number;   // How many empty games before starting FOMO
    
    // FOMO multiplier settings
    fomoMultiplierRange: {
        min: number;                   // Minimum FOMO multiplier (e.g., 5x)
        max: number;                   // Maximum FOMO multiplier (e.g., 50x)
    };
    
    fomoChance: number;                // Chance of FOMO run vs normal run (e.g., 0.7 = 70%)
    
    // Pattern control
    consecutiveFomoLimit: number;      // Max consecutive FOMO runs
    fomoBreakChance: number;           // Chance to break FOMO streak with low run
    
    // State tracking
    currentEmptyStreak: number;        // Current streak of empty games
    currentFomoStreak: number;         // Current streak of FOMO runs
    lastFomoGameNumber: number;        // Last game that had FOMO
    recentFomoHistory: Array<{
        gameNumber: number;
        multiplier: number;
        wasEmpty: boolean;
        timestamp: number;
    }>;
}


interface ExtremeMultiplierConfig {
    enabled: boolean;
    lowBetThreshold: number;        // Max total bets to trigger (e.g., 2.0 SOL)
    extremeChance: number;          // Probability (e.g., 0.02 = 2%)
    minExtremeMultiplier: number;   // Minimum extreme multiplier (e.g., 50x)
    maxExtremeMultiplier: number;   // Maximum extreme multiplier (e.g., 200x)
    maxRiskAmount: number;          // Max total risk allowed (e.g., 5 SOL)
    cooldownMinutes: number;        // Cooldown between events (e.g., 30 min)
    lastExtremeTime: number;        // Timestamp of last extreme event
}

interface PlayerBet {
    userId: string;
    walletAddress: string;
    betAmount: number;
    placedAt: number;
    entryMultiplier: number;
    maxPayout: number;
    cashedOut?: boolean;
    cashoutMultiplier?: number;
    cashoutAmount?: number;
    cashoutTime?: number;
    isValid?: boolean;
    transactionId?: string;
    betCollected?: boolean;
    payoutProcessed?: boolean;
}

interface ChartPoint {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface TradingState {
    trend: 'up' | 'down' | 'sideways';
    momentum: number;
    volatility: number;
    lastDirection: number;
    consecutiveRises: number;
    rugPullPending: boolean;
    rugPullProbability: number;
    totalBetsSinceStart: number;
    highBetCount: number;
}

// ===== HYBRID SYSTEM INTERFACES =====
interface HybridUserWallet {
    userId: string;
    externalWalletAddress: string;
    
    // Custodial (gaming) balance
    custodialBalance: number;
    custodialTotalDeposited: number;
    lastCustodialDeposit: number;
    
    // Embedded wallet reference
    embeddedWalletId?: string;
    embeddedBalance: number;
    lastEmbeddedWithdrawal: number;
    
    // Transfer tracking
    lastTransferBetweenWallets: number;
    totalTransfersToEmbedded: number;
    totalTransfersToCustodial: number;
    
    createdAt: number;
}

interface HybridSystemStats {
    totalUsers: number;
    totalCustodialBalance: number;
    totalEmbeddedBalance: number;
    activeGamingUsers: number;
    totalTransfers: number;
}

// ===== ADVANCED ANALYTICS & REPORTING SYSTEM =====

// Enhanced interfaces for analytics
interface UserAnalytics {
    userId: string;
    totalGamesPlayed: number;
    totalBetsPlaced: number;
    totalWagered: number;
    totalWon: number;
    totalLost: number;
    netProfit: number;
    winRate: number;
    averageBetSize: number;
    largestWin: number;
    largestLoss: number;
    preferredBetRange: string;
    lastActive: number;
    totalSessionTime: number;
    custodialDeposits: number;
    privyTransfers: number;
    lifetimeValue: number;
    riskScore: number;
    behaviorPattern: string;
}

interface GameAnalytics {
    gameNumber: number;
    date: number;
    crashMultiplier: number;
    totalBets: number;
    totalPlayers: number;
    totalWagered: number;
    totalPayouts: number;
    houseProfit: number;
    houseProfitMargin: number;
    averageBetSize: number;
    largestBet: number;
    playersWon: number;
    playersLost: number;
    winRate: number;
    gameDuration: number;
    bootstrapMode: boolean;
    rugPullTriggered: boolean;
}

interface FinancialAnalytics {
    period: string; // 'hour', 'day', 'week', 'month'
    timestamp: number;
    totalRevenue: number;
    totalPayouts: number;
    grossProfit: number;
    netProfit: number;
    profitMargin: number;
    totalGames: number;
    totalBets: number;
    averageGameProfit: number;
    custodialDeposits: number;
    privyTransfers: number;
    houseBalance: number;
    activeUsers: number;
    newUsers: number;
    retentionRate: number;
}

interface SystemAnalytics {
    timestamp: number;
    serverUptime: number;
    totalUsers: number;
    activeUsers: number;
    totalWallets: number;
    totalBalance: number;
    custodialBalance: number;
    privyBalance: number;
    gameHealth: {
        gamesPlayed: number;
        averageGameDuration: number;
        crashRate: number;
        rugPullRate: number;
    };
    performanceMetrics: {
        avgResponseTime: number;
        errorRate: number;
        throughput: number;
    };
}

// Global analytics storage
const userAnalyticsCache = new Map<string, UserAnalytics>();
const gameAnalyticsHistory: GameAnalytics[] = [];
const financialAnalyticsHistory: FinancialAnalytics[] = [];
let systemAnalytics: SystemAnalytics;

// ===== USER ANALYTICS FUNCTIONS =====

function updateUserAnalytics(userId: string, gameData?: any, betData?: any): void {
    try {
        let userAnalytics = userAnalyticsCache.get(userId) || {
            userId,
            totalGamesPlayed: 0,
            totalBetsPlaced: 0,
            totalWagered: 0,
            totalWon: 0,
            totalLost: 0,
            netProfit: 0,
            winRate: 0,
            averageBetSize: 0,
            largestWin: 0,
            largestLoss: 0,
            preferredBetRange: 'small',
            lastActive: Date.now(),
            totalSessionTime: 0,
            custodialDeposits: 0,
            privyTransfers: 0,
            lifetimeValue: 0,
            riskScore: 0,
            behaviorPattern: 'casual'
        };

        // Update with new data
        if (betData) {
            userAnalytics.totalBetsPlaced++;
            userAnalytics.totalWagered += betData.amount;
            userAnalytics.lastActive = Date.now();
            
            if (betData.won) {
                userAnalytics.totalWon += betData.payout;
                if (betData.payout > userAnalytics.largestWin) {
                    userAnalytics.largestWin = betData.payout;
                }
            } else {
                userAnalytics.totalLost += betData.amount;
                if (betData.amount > userAnalytics.largestLoss) {
                    userAnalytics.largestLoss = betData.amount;
                }
            }
            
            // Calculate derived metrics
            userAnalytics.netProfit = userAnalytics.totalWon - userAnalytics.totalLost;
            userAnalytics.winRate = userAnalytics.totalBetsPlaced > 0 ? 
                (userAnalytics.totalWon > 0 ? userAnalytics.totalWon / userAnalytics.totalWagered : 0) : 0;
            userAnalytics.averageBetSize = userAnalytics.totalWagered / userAnalytics.totalBetsPlaced;
            
            // Determine preferred bet range
            if (userAnalytics.averageBetSize < 0.1) userAnalytics.preferredBetRange = 'micro';
            else if (userAnalytics.averageBetSize < 0.5) userAnalytics.preferredBetRange = 'small';
            else if (userAnalytics.averageBetSize < 2.0) userAnalytics.preferredBetRange = 'medium';
            else if (userAnalytics.averageBetSize < 5.0) userAnalytics.preferredBetRange = 'large';
            else userAnalytics.preferredBetRange = 'whale';
            
            // Calculate risk score (0-100)
            const betFrequency = userAnalytics.totalBetsPlaced / Math.max(1, (Date.now() - (userAnalytics.lastActive - 86400000)) / 86400000);
            const betSizeRatio = userAnalytics.averageBetSize / 1.0; // Normalized to 1 SOL
            const lossStreak = userAnalytics.netProfit < 0 ? Math.abs(userAnalytics.netProfit) / userAnalytics.totalWagered : 0;
            
            userAnalytics.riskScore = Math.min(100, Math.max(0, 
                (betFrequency * 20) + (betSizeRatio * 30) + (lossStreak * 50)
            ));
            
            // Determine behavior pattern
            if (userAnalytics.riskScore > 80) userAnalytics.behaviorPattern = 'high_risk';
            else if (userAnalytics.riskScore > 60) userAnalytics.behaviorPattern = 'aggressive';
            else if (userAnalytics.riskScore > 40) userAnalytics.behaviorPattern = 'moderate';
            else if (userAnalytics.riskScore > 20) userAnalytics.behaviorPattern = 'conservative';
            else userAnalytics.behaviorPattern = 'casual';
        }

        if (gameData) {
            userAnalytics.totalGamesPlayed++;
        }

        // Calculate lifetime value
        const userWallet = hybridUserWallets.get(userId);
        userAnalytics.custodialDeposits = userWallet?.custodialTotalDeposited || 0;
        userAnalytics.privyTransfers = (userWallet?.totalTransfersToEmbedded || 0) + (userWallet?.totalTransfersToCustodial || 0);
        userAnalytics.lifetimeValue = userAnalytics.custodialDeposits + (userAnalytics.totalWagered * 0.1); // Rough LTV calculation

        userAnalyticsCache.set(userId, userAnalytics);
        
        // Save to database periodically
        if (Math.random() < 0.1) { // 10% chance to save
            saveUserAnalytics(userAnalytics);
        }
        
    } catch (error) {
        console.error('❌ Failed to update user analytics:', error);
    }
}

async function saveUserAnalytics(analytics: UserAnalytics): Promise<void> {
    try {
        await supabaseService
            .from('user_analytics')
            .upsert({
                user_id: analytics.userId,
                total_games_played: analytics.totalGamesPlayed,
                total_bets_placed: analytics.totalBetsPlaced,
                total_wagered: analytics.totalWagered,
                total_won: analytics.totalWon,
                total_lost: analytics.totalLost,
                net_profit: analytics.netProfit,
                win_rate: analytics.winRate,
                average_bet_size: analytics.averageBetSize,
                largest_win: analytics.largestWin,
                largest_loss: analytics.largestLoss,
                preferred_bet_range: analytics.preferredBetRange,
                last_active: new Date(analytics.lastActive).toISOString(),
                custodial_deposits: analytics.custodialDeposits,
                privy_transfers: analytics.privyTransfers,
                lifetime_value: analytics.lifetimeValue,
                risk_score: analytics.riskScore,
                behavior_pattern: analytics.behaviorPattern,
                updated_at: new Date().toISOString()
            });
    } catch (error) {
        console.warn('User analytics save failed (non-critical):', error);
    }
}

// ===== GAME ANALYTICS FUNCTIONS =====

function recordGameAnalytics(gameData: GameState, totalPayouts: number): void {
    try {
        const gameAnalytics: GameAnalytics = {
            gameNumber: gameData.gameNumber,
            date: Date.now(),
            crashMultiplier: gameData.crashMultiplier || gameData.currentMultiplier,
            totalBets: gameData.totalBets,
            totalPlayers: gameData.totalPlayers,
            totalWagered: gameData.totalBets,
            totalPayouts,
            houseProfit: gameData.totalBets - totalPayouts,
            houseProfitMargin: gameData.totalBets > 0 ? ((gameData.totalBets - totalPayouts) / gameData.totalBets) * 100 : 0,
            averageBetSize: gameData.totalPlayers > 0 ? gameData.totalBets / gameData.totalPlayers : 0,
            largestBet: Math.max(...Array.from(gameData.activeBets.values()).map(bet => bet.betAmount)),
            playersWon: Array.from(gameData.activeBets.values()).filter(bet => bet.cashedOut).length,
            playersLost: Array.from(gameData.activeBets.values()).filter(bet => !bet.cashedOut).length,
            winRate: gameData.totalPlayers > 0 ? 
                (Array.from(gameData.activeBets.values()).filter(bet => bet.cashedOut).length / gameData.totalPlayers) * 100 : 0,
            gameDuration: Date.now() - gameData.startTime,
            bootstrapMode: getCurrentGameConfig()._BOOTSTRAP_MODE,
            rugPullTriggered: gameData.crashMultiplier ? gameData.crashMultiplier < 2.0 : false
        };

        gameAnalyticsHistory.push(gameAnalytics);
        
        // Keep only last 1000 games in memory
        if (gameAnalyticsHistory.length > 1000) {
            gameAnalyticsHistory.shift();
        }

        // Save to database
        saveGameAnalytics(gameAnalytics);

        console.log(`📊 Game ${gameData.gameNumber} analytics: ${gameAnalytics.houseProfit.toFixed(3)} SOL profit (${gameAnalytics.houseProfitMargin.toFixed(1)}% margin)`);
        
    } catch (error) {
        console.error('❌ Failed to record game analytics:', error);
    }
}

async function saveGameAnalytics(analytics: GameAnalytics): Promise<void> {
    try {
        await supabaseService
            .from('game_analytics')
            .insert({
                game_number: analytics.gameNumber,
                date: new Date(analytics.date).toISOString(),
                crash_multiplier: analytics.crashMultiplier,
                total_bets: analytics.totalBets,
                total_players: analytics.totalPlayers,
                total_wagered: analytics.totalWagered,
                total_payouts: analytics.totalPayouts,
                house_profit: analytics.houseProfit,
                house_profit_margin: analytics.houseProfitMargin,
                average_bet_size: analytics.averageBetSize,
                largest_bet: analytics.largestBet,
                players_won: analytics.playersWon,
                players_lost: analytics.playersLost,
                win_rate: analytics.winRate,
                game_duration: analytics.gameDuration,
                bootstrap_mode: analytics.bootstrapMode,
                rug_pull_triggered: analytics.rugPullTriggered
            });
    } catch (error) {
        console.warn('Game analytics save failed (non-critical):', error);
    }
}

// ===== FINANCIAL ANALYTICS FUNCTIONS =====

function updateFinancialAnalytics(period: string = 'hour'): void {
    try {
        const now = Date.now();
        let periodStart: number;
        
        switch (period) {
            case 'hour':
                periodStart = now - (60 * 60 * 1000);
                break;
            case 'day':
                periodStart = now - (24 * 60 * 60 * 1000);
                break;
            case 'week':
                periodStart = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                periodStart = now - (30 * 24 * 60 * 60 * 1000);
                break;
            default:
                periodStart = now - (60 * 60 * 1000);
        }

        const recentGames = gameAnalyticsHistory.filter(game => game.date >= periodStart);
        
        const financial: FinancialAnalytics = {
            period,
            timestamp: now,
            totalRevenue: recentGames.reduce((sum, game) => sum + game.totalWagered, 0),
            totalPayouts: recentGames.reduce((sum, game) => sum + game.totalPayouts, 0),
            grossProfit: recentGames.reduce((sum, game) => sum + game.houseProfit, 0),
            netProfit: recentGames.reduce((sum, game) => sum + game.houseProfit, 0), // Simplified - would subtract operational costs
            profitMargin: 0,
            totalGames: recentGames.length,
            totalBets: recentGames.reduce((sum, game) => sum + game.totalBets, 0),
            averageGameProfit: 0,
            custodialDeposits: 0,
            privyTransfers: 0,
            houseBalance: houseBalance,
            activeUsers: userAnalyticsCache.size,
            newUsers: 0, // Would need to track registration dates
            retentionRate: 0 // Would need historical user data
        };

        // Calculate derived metrics
        if (financial.totalRevenue > 0) {
            financial.profitMargin = (financial.grossProfit / financial.totalRevenue) * 100;
        }
        
        if (financial.totalGames > 0) {
            financial.averageGameProfit = financial.grossProfit / financial.totalGames;
        }

        // Add to history
        financialAnalyticsHistory.push(financial);
        
        // Keep only last 168 records (1 week of hourly data)
        if (financialAnalyticsHistory.length > 168) {
            financialAnalyticsHistory.shift();
        }

        console.log(`💰 Financial analytics (${period}): ${financial.grossProfit.toFixed(3)} SOL profit from ${financial.totalGames} games`);
        
    } catch (error) {
        console.error('❌ Failed to update financial analytics:', error);
    }
}

// 🎭 DYNAMIC GAME-ROUND ARTIFICIAL LIQUIDITY SYSTEM
let artificialPlayerCount = Math.floor(Math.random() * 21) + 5; // 5-25
let artificialLiquidity = 0; // Will be set per game round
let baseGameLiquidity = 0; // Starting liquidity for current game
let liquidityGrowthRate = 0; // How fast liquidity grows this round
let lastArtificialUpdate = Date.now();
let lastLiquidityGrowth = Date.now();

interface GameLiquidityProfile {
    baseAmount: number;        // Starting artificial liquidity (2-8 SOL)
    growthRate: number;        // SOL per second growth (0.01-0.05)
    volatility: number;        // How much it fluctuates (0.1-0.4)
    peakMultiplier: number;    // When growth peaks (1.5x-3.0x)
    declineRate: number;       // Reduction after peak (0.8-0.95)
}

function generateGameLiquidityProfile(): GameLiquidityProfile {
    const gameIntensity = Math.random(); // 0-1, determines how active this round feels
    
    return {
        baseAmount: 2 + gameIntensity * 6,           // 2-8 SOL base
        growthRate: 0.01 + gameIntensity * 0.04,     // 0.01-0.05 SOL/sec
        volatility: 0.1 + gameIntensity * 0.3,       // 0.1-0.4 fluctuation
        peakMultiplier: 1.5 + gameIntensity * 1.5,   // Peak at 1.5x-3.0x
        declineRate: 0.8 + gameIntensity * 0.15      // 0.8-0.95 decline rate
    };
}

let currentLiquidityProfile: GameLiquidityProfile = generateGameLiquidityProfile();

function initializeGameLiquidity(): void {
    // Generate new liquidity profile for this game round
    currentLiquidityProfile = generateGameLiquidityProfile();
    
    // Set base artificial liquidity for this round
    baseGameLiquidity = currentLiquidityProfile.baseAmount;
    artificialLiquidity = baseGameLiquidity;
    
    // Reset growth tracking
    lastLiquidityGrowth = Date.now();
    
    console.log(`🎭 New game liquidity profile:`);
    console.log(`   Base: ${baseGameLiquidity.toFixed(3)} SOL`);
    console.log(`   Growth rate: ${(currentLiquidityProfile.growthRate * 60).toFixed(2)} SOL/min`);
    console.log(`   Peak at: ${currentLiquidityProfile.peakMultiplier.toFixed(1)}x multiplier`);
    console.log(`   Volatility: ${(currentLiquidityProfile.volatility * 100).toFixed(0)}%`);
}

function updateGameLiquidity(): void {
    if (!currentGame || currentGame.status !== 'active') return;
    
    const now = Date.now();
    const timeSinceLastGrowth = (now - lastLiquidityGrowth) / 1000; // seconds
    const currentMultiplier = currentGame.currentMultiplier;
    
    // Calculate growth based on game phase
    let growthMultiplier = 1.0;
    
    if (currentMultiplier < currentLiquidityProfile.peakMultiplier) {
        // Growing phase - accelerating growth as multiplier increases
        growthMultiplier = 0.5 + (currentMultiplier / currentLiquidityProfile.peakMultiplier) * 1.5;
    } else {
        // Past peak - declining growth (simulate some players cashing out)
        const declineProgress = Math.min((currentMultiplier - currentLiquidityProfile.peakMultiplier) / 2, 1);
        growthMultiplier = currentLiquidityProfile.declineRate * (1 - declineProgress * 0.5);
    }
    
    // Base growth for this time period
    const baseGrowth = currentLiquidityProfile.growthRate * timeSinceLastGrowth * growthMultiplier;
    
    // Add volatility (random fluctuations)
    const volatilityFactor = (Math.random() - 0.5) * currentLiquidityProfile.volatility;
    const volatilityChange = baseGrowth * volatilityFactor;
    
    // Calculate total change
    const totalChange = baseGrowth + volatilityChange;
    
    // Apply change with bounds
    const newLiquidity = Math.max(baseGameLiquidity * 0.3, artificialLiquidity + totalChange);
    const maxLiquidity = baseGameLiquidity * 4; // Don't exceed 4x base
    
    artificialLiquidity = Math.min(newLiquidity, maxLiquidity);
    artificialLiquidity = Math.round(artificialLiquidity * 1000) / 1000; // Round to 3 decimals
    
    // Update game state
    if (currentGame) {
        currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;
    }
    
    lastLiquidityGrowth = now;
    
    // Log significant changes
    if (Math.abs(totalChange) > 0.05 || Math.random() < 0.1) {
        console.log(`💰 Liquidity update: ${(artificialLiquidity - totalChange).toFixed(3)} → ${artificialLiquidity.toFixed(3)} SOL (${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(3)}) @ ${currentMultiplier.toFixed(2)}x`);
    }
}

function simulateBetActivity(realBetAmount: number): void {
    // When real bets come in, simulate additional artificial activity
    const activityBoost = realBetAmount * (0.5 + Math.random() * 1.5); // 0.5x to 2x the real bet
    artificialLiquidity += activityBoost;
    
    // Also trigger player count boost for large bets
    if (realBetAmount >= 0.1) {
        const playerBoost = Math.floor(Math.random() * 3) + 1; // +1 to +3 players
        artificialPlayerCount = Math.min(25, artificialPlayerCount + playerBoost);
    }
    
    console.log(`🎯 Bet activity boost: +${activityBoost.toFixed(3)} SOL artificial liquidity, players: ${artificialPlayerCount}`);
    
    if (currentGame) {
        currentGame.boostedPlayerCount = currentGame.totalPlayers + artificialPlayerCount;
        currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;
    }
}

function simulateCashoutActivity(cashoutAmount: number): void {
    // When players cash out, simulate some artificial liquidity reduction
    const liquidityReduction = cashoutAmount * (0.2 + Math.random() * 0.6); // 20%-80% of cashout
    artificialLiquidity = Math.max(baseGameLiquidity * 0.2, artificialLiquidity - liquidityReduction);
    
    // Possible slight player reduction
    if (Math.random() < 0.3) {
        artificialPlayerCount = Math.max(5, artificialPlayerCount - 1);
    }
    
    console.log(`💸 Cashout activity: -${liquidityReduction.toFixed(3)} SOL artificial liquidity, players: ${artificialPlayerCount}`);
    
    if (currentGame) {
        currentGame.boostedPlayerCount = currentGame.totalPlayers + artificialPlayerCount;
        currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;
    }
}

function generateNewArtificialPlayerCount(currentCount: number): number {
    // Same player count logic as before
    const isSmallChange = Math.random() < 0.7;
    
    let newCount: number;
    if (isSmallChange) {
        const change = Math.floor(Math.random() * 6) - 2; // -2 to +3
        newCount = currentCount + change;
    } else {
        const change = Math.floor(Math.random() * 8) - 3; // -3 to +4
        newCount = currentCount + change;
    }
    
    // Keep within bounds (5-25)
    newCount = Math.max(5, Math.min(25, newCount));
    
    // Nudge away from bounds
    if (newCount === 5 && Math.random() < 0.6) {
        newCount += Math.floor(Math.random() * 3) + 1;
    } else if (newCount === 25 && Math.random() < 0.6) {
        newCount -= Math.floor(Math.random() * 3) + 1;
    }
    
    return newCount;
}

function updateArtificialCounts(): void {
    const newPlayerCount = generateNewArtificialPlayerCount(artificialPlayerCount);
    
    if (newPlayerCount !== artificialPlayerCount) {
        console.log(`🎭 Player count update: ${artificialPlayerCount} → ${newPlayerCount}`);
        artificialPlayerCount = newPlayerCount;
        
        if (currentGame) {
            currentGame.boostedPlayerCount = currentGame.totalPlayers + artificialPlayerCount;
        }
    }
    
    lastArtificialUpdate = Date.now();
}

// 🎭 Trigger updates on game events
function triggerArtificialUpdate(eventType: 'new_game' | 'crash' | 'big_bet' | 'waiting'): void {
    console.log(`🎭 Triggering artificial update due to: ${eventType}`);
    
    switch (eventType) {
        case 'new_game':
            // Fresh start for new game
            initializeGameLiquidity();
            artificialPlayerCount = generateNewArtificialPlayerCount(artificialPlayerCount);
            break;
            
        case 'crash':
            // After crash, some players leave, liquidity resets
            artificialPlayerCount = Math.max(5, artificialPlayerCount - Math.floor(Math.random() * 5));
            // Keep some residual liquidity for next round
            artificialLiquidity = Math.max(1, artificialLiquidity * 0.2);
            break;
            
        case 'big_bet':
            // Big bet attracts more activity
            simulateBetActivity(0.5); // Simulate 0.5 SOL worth of additional activity
            break;
            
        case 'waiting':
            // Waiting period - moderate reset
            artificialPlayerCount = generateNewArtificialPlayerCount(artificialPlayerCount);
            artificialLiquidity = 1 + Math.random() * 3; // 1-4 SOL for waiting
            break;
    }
    
    if (currentGame) {
        currentGame.boostedPlayerCount = currentGame.totalPlayers + artificialPlayerCount;
        currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;
    }
}
// ===== SYSTEM ANALYTICS FUNCTIONS =====

function updateSystemAnalytics(): void {
    try {
        systemAnalytics = {
            timestamp: Date.now(),
            serverUptime: process.uptime(),
            totalUsers: hybridSystemStats.totalUsers,
            activeUsers: userAnalyticsCache.size,
            totalWallets: privyIntegrationManager.totalPrivyWallets + hybridSystemStats.totalUsers,
            totalBalance: hybridSystemStats.totalCustodialBalance + hybridSystemStats.totalEmbeddedBalance + houseBalance,
            custodialBalance: hybridSystemStats.totalCustodialBalance,
            privyBalance: hybridSystemStats.totalEmbeddedBalance,
            gameHealth: {
                gamesPlayed: gameAnalyticsHistory.length,
                averageGameDuration: gameAnalyticsHistory.length > 0 ? 
                    gameAnalyticsHistory.reduce((sum, game) => sum + game.gameDuration, 0) / gameAnalyticsHistory.length : 0,
                crashRate: gameAnalyticsHistory.length > 0 ? 
                    (gameAnalyticsHistory.filter(game => game.crashMultiplier < 2.0).length / gameAnalyticsHistory.length) * 100 : 0,
                rugPullRate: gameAnalyticsHistory.length > 0 ? 
                    (gameAnalyticsHistory.filter(game => game.rugPullTriggered).length / gameAnalyticsHistory.length) * 100 : 0
            },
            performanceMetrics: {
                avgResponseTime: 50, // Would be measured from actual requests
                errorRate: 0.1, // Would be calculated from error logs
                throughput: gameAnalyticsHistory.length > 0 ? gameAnalyticsHistory.length / (process.uptime() / 3600) : 0 // Games per hour
            }
        };
        
    } catch (error) {
        console.error('❌ Failed to update system analytics:', error);
    }
}

// ===== ANALYTICS REPORTING FUNCTIONS =====

function generateDailyReport(): any {
    const now = Date.now();
    const dayStart = now - (24 * 60 * 60 * 1000);
    
    const dailyGames = gameAnalyticsHistory.filter(game => game.date >= dayStart);
    const dailyUsers = Array.from(userAnalyticsCache.values()).filter(user => user.lastActive >= dayStart);
    
    return {
        date: new Date().toISOString().split('T')[0],
        summary: {
            totalGames: dailyGames.length,
            totalRevenue: dailyGames.reduce((sum, game) => sum + game.totalWagered, 0),
            totalProfit: dailyGames.reduce((sum, game) => sum + game.houseProfit, 0),
            activeUsers: dailyUsers.length,
            averageGameProfit: dailyGames.length > 0 ? 
                dailyGames.reduce((sum, game) => sum + game.houseProfit, 0) / dailyGames.length : 0
        },
        gameMetrics: {
            averageCrashMultiplier: dailyGames.length > 0 ? 
                dailyGames.reduce((sum, game) => sum + game.crashMultiplier, 0) / dailyGames.length : 0,
            averagePlayersPerGame: dailyGames.length > 0 ? 
                dailyGames.reduce((sum, game) => sum + game.totalPlayers, 0) / dailyGames.length : 0,
            winRate: dailyGames.length > 0 ? 
                dailyGames.reduce((sum, game) => sum + game.winRate, 0) / dailyGames.length : 0,
            rugPullRate: dailyGames.length > 0 ? 
                (dailyGames.filter(game => game.rugPullTriggered).length / dailyGames.length) * 100 : 0
        },
        userMetrics: {
            totalUsers: dailyUsers.length,
            averageBetSize: dailyUsers.length > 0 ? 
                dailyUsers.reduce((sum, user) => sum + user.averageBetSize, 0) / dailyUsers.length : 0,
            highRiskUsers: dailyUsers.filter(user => user.riskScore > 70).length,
            whaleUsers: dailyUsers.filter(user => user.preferredBetRange === 'whale').length
        },
        topPerformers: {
            biggestWinner: dailyUsers.reduce((max, user) => 
                user.netProfit > (max?.netProfit || 0) ? user : max, null as UserAnalytics | null),
            biggestLoser: dailyUsers.reduce((min, user) => 
                user.netProfit < (min?.netProfit || 0) ? user : min, null as UserAnalytics | null),
            mostActiveUser: dailyUsers.reduce((max, user) => 
                user.totalBetsPlaced > (max?.totalBetsPlaced || 0) ? user : max, null as UserAnalytics | null)
        }
    };
}

function getAnalyticsTrends(days: number = 7): any {
    const trends = [];
    const now = Date.now();
    
    for (let i = days - 1; i >= 0; i--) {
        const dayStart = now - (i * 24 * 60 * 60 * 1000);
        const dayEnd = dayStart + (24 * 60 * 60 * 1000);
        
        const dayGames = gameAnalyticsHistory.filter(game => game.date >= dayStart && game.date < dayEnd);
        
        trends.push({
            date: new Date(dayStart).toISOString().split('T')[0],
            games: dayGames.length,
            revenue: dayGames.reduce((sum, game) => sum + game.totalWagered, 0),
            profit: dayGames.reduce((sum, game) => sum + game.houseProfit, 0),
            players: dayGames.reduce((sum, game) => sum + game.totalPlayers, 0),
            averageCrash: dayGames.length > 0 ? 
                dayGames.reduce((sum, game) => sum + game.crashMultiplier, 0) / dayGames.length : 0
        });
    }
    
    return trends;
}

// ===== ANALYTICS INITIALIZATION =====
async function initializeAnalyticsSystem(): Promise<void> {
    try {
        console.log('📊 Initializing advanced analytics system...');
        
        // Load user analytics from database
        const { data: userAnalytics, error: userError } = await supabaseService
            .from('user_analytics')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1000);

        if (!userError && userAnalytics) {
            for (const analytics of userAnalytics) {
                const userAnalytic: UserAnalytics = {
                    userId: analytics.user_id,
                    totalGamesPlayed: analytics.total_games_played || 0,
                    totalBetsPlaced: analytics.total_bets_placed || 0,
                    totalWagered: parseFloat(analytics.total_wagered) || 0,
                    totalWon: parseFloat(analytics.total_won) || 0,
                    totalLost: parseFloat(analytics.total_lost) || 0,
                    netProfit: parseFloat(analytics.net_profit) || 0,
                    winRate: parseFloat(analytics.win_rate) || 0,
                    averageBetSize: parseFloat(analytics.average_bet_size) || 0,
                    largestWin: parseFloat(analytics.largest_win) || 0,
                    largestLoss: parseFloat(analytics.largest_loss) || 0,
                    preferredBetRange: analytics.preferred_bet_range || 'small',
                    lastActive: new Date(analytics.last_active).getTime(),
                    totalSessionTime: analytics.total_session_time || 0,
                    custodialDeposits: parseFloat(analytics.custodial_deposits) || 0,
                    privyTransfers: parseFloat(analytics.privy_transfers) || 0,
                    lifetimeValue: parseFloat(analytics.lifetime_value) || 0,
                    riskScore: parseFloat(analytics.risk_score) || 0,
                    behaviorPattern: analytics.behavior_pattern || 'casual'
                };
                
                userAnalyticsCache.set(userAnalytic.userId, userAnalytic);
            }
            
            console.log(`✅ Loaded ${userAnalytics.length} user analytics records`);
        }
        
        // Load recent game analytics
        const { data: gameAnalytics, error: gameError } = await supabaseService
            .from('game_analytics')
            .select('*')
            .order('date', { ascending: false })
            .limit(500);

        if (!gameError && gameAnalytics) {
            for (const game of gameAnalytics) {
                const gameAnalytic: GameAnalytics = {
                    gameNumber: game.game_number,
                    date: new Date(game.date).getTime(),
                    crashMultiplier: parseFloat(game.crash_multiplier) || 0,
                    totalBets: parseFloat(game.total_bets) || 0,
                    totalPlayers: game.total_players || 0,
                    totalWagered: parseFloat(game.total_wagered) || 0,
                    totalPayouts: parseFloat(game.total_payouts) || 0,
                    houseProfit: parseFloat(game.house_profit) || 0,
                    houseProfitMargin: parseFloat(game.house_profit_margin) || 0,
                    averageBetSize: parseFloat(game.average_bet_size) || 0,
                    largestBet: parseFloat(game.largest_bet) || 0,
                    playersWon: game.players_won || 0,
                    playersLost: game.players_lost || 0,
                    winRate: parseFloat(game.win_rate) || 0,
                    gameDuration: game.game_duration || 0,
                    bootstrapMode: game.bootstrap_mode || false,
                    rugPullTriggered: game.rug_pull_triggered || false
                };
                
                gameAnalyticsHistory.push(gameAnalytic);
            }
            
            console.log(`✅ Loaded ${gameAnalytics.length} game analytics records`);
        }
        
        // Initialize financial analytics
        updateFinancialAnalytics('day');
        updateSystemAnalytics();
        
        console.log('✅ Advanced analytics system initialized');
        
    } catch (error) {
        console.warn('⚠️ Could not fully initialize analytics system:', error);
    }
}

// ===== PRIVY INTEGRATION SYSTEM =====

// ===== PRIVY INTERFACES =====
interface PrivyWallet {
    userId: string;
    privyWalletAddress: string;
    privyWalletId?: string;
    balance: number;
    lastBalanceUpdate: number;
    isConnected: boolean;
    createdAt: number;
    lastUsed: number;
}

interface PrivyTransfer {
    transferId: string;
    userId: string;
    amount: number;
    fromType: 'custodial' | 'privy';
    toType: 'custodial' | 'privy';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: number;
    completedAt?: number;
    transactionId?: string;
    error?: string;
}

interface PrivyIntegrationManager {
    privyWallets: Map<string, PrivyWallet>;
    totalPrivyWallets: number;
    connectedPrivyWallets: number;
    totalPrivyBalance: number;
}

// ===== PRIVY INTEGRATION MANAGER =====
const privyIntegrationManager: PrivyIntegrationManager = {
    privyWallets: new Map<string, PrivyWallet>(),
    totalPrivyWallets: 0,
    connectedPrivyWallets: 0,
    totalPrivyBalance: 0
};

// ===== ACTIVE TRANSFERS TRACKING =====
const activeTransfers = new Map<string, PrivyTransfer>();

// ===== PRIVY WALLET FUNCTIONS =====

async function registerPrivyWallet(
    userId: string, 
    privyWalletAddress: string, 
    privyWalletId?: string
): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> {
    try {
        console.log(`🔗 Registering embedded wallet for ${userId}: ${privyWalletAddress}`);
        
        // Validate wallet address
        try {
            new PublicKey(privyWalletAddress);
        } catch (error) {
            return { success: false, error: 'Invalid Solana wallet address' };
        }
        
        // ENHANCED: Ensure user exists in user_profiles
        let userProfile;
        let isNewUser = false;
        
        try {
            const userResult = await getOrCreateUser(privyWalletAddress);
            userProfile = userResult.userProfile;
            isNewUser = userResult.isNewUser;
            
            // If the userId provided doesn't match the found/created user, update it
            if (userResult.userId !== userId) {
                console.log(`🔄 User ID mismatch: provided ${userId}, found/created ${userResult.userId}`);
                userId = userResult.userId;
            }
            
        } catch (userError) {
            console.error(`❌ Failed to get/create user for Privy wallet registration:`, userError);
            return { success: false, error: 'Failed to create user profile' };
        }
        
        // Check if Privy wallet is already registered
        const existingWallet = privyIntegrationManager.privyWallets.get(userId);
        if (existingWallet) {
            // Update existing wallet
            const oldAddress = existingWallet.privyWalletAddress;
            existingWallet.privyWalletAddress = privyWalletAddress;
            existingWallet.privyWalletId = privyWalletId;
            existingWallet.isConnected = true;
            existingWallet.lastUsed = Date.now();
            
            if (oldAddress !== privyWalletAddress) {
                console.log(`🔄 Updated embedded wallet address for ${userId}: ${oldAddress} → ${privyWalletAddress}`);
                existingWallet.balance = 0;
                existingWallet.lastBalanceUpdate = 0;
            } else {
                console.log(`✅ Reconnected existing embedded wallet for ${userId}`);
            }
        } else {
            // Create new wallet registration
            const privyWallet: PrivyWallet = {
                userId,
                privyWalletAddress,
                privyWalletId,
                balance: 0,
                lastBalanceUpdate: 0,
                isConnected: true,
                createdAt: Date.now(),
                lastUsed: Date.now()
            };
            
            privyIntegrationManager.privyWallets.set(userId, privyWallet);
            console.log(`✅ Registered new embedded wallet for ${userId}: ${privyWalletAddress}`);
        }
        
        // Update balance from blockchain
        await updatePrivyWalletBalance(userId);
        
        // Save to database
        const wallet = privyIntegrationManager.privyWallets.get(userId)!;
        await savePrivyWalletToDatabase(wallet);
        
        // Update stats
        updatePrivyIntegrationStats();
        
        console.log(`✅ Privy wallet registration complete for ${userId} (${isNewUser ? 'NEW' : 'EXISTING'} user)`);
        
        return { success: true, isNewUser };
        
    } catch (error) {
        console.error('❌ Embedded wallet registration failed:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Registration failed' 
        };
    }
}

async function updatePrivyWalletBalance(userId: string): Promise<number> {
    try {
        const privyWallet = privyIntegrationManager.privyWallets.get(userId);
        if (!privyWallet) {
            console.warn(`⚠️ No embedded wallet found for user ${userId}`);
            return 0;
        }
        
        // Get balance from blockchain with retry logic
        let balance = 0;
        let retries = 3;
        
        while (retries > 0) {
            try {
                const publicKey = new PublicKey(privyWallet.privyWalletAddress);
                const balanceResponse = await solanaConnection.getBalance(publicKey);
                balance = balanceResponse / LAMPORTS_PER_SOL;
                break; // Success, exit retry loop
            } catch (error) {
                retries--;
                if (retries === 0) {
                    console.error(`❌ Failed to get balance for ${userId} after 3 attempts:`, error);
                    return privyWallet.balance; // Return cached balance
                }
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Update wallet
        privyWallet.balance = balance;
        privyWallet.lastBalanceUpdate = Date.now();
        privyWallet.lastUsed = Date.now();
        
        // Save to database (non-blocking)
        savePrivyWalletToDatabase(privyWallet).catch(error => {
            console.warn(`⚠️ Failed to save embedded wallet data for ${userId}:`, error);
        });
        
        // Update stats
        updatePrivyIntegrationStats();
        
        console.log(`💰 Updated embedded wallet balance for ${userId}: ${balance.toFixed(6)} SOL`);
        return balance;
        
    } catch (error) {
        console.error(`❌ Failed to update embedded wallet balance for ${userId}:`, error);
        return 0;
    }
}

async function transferCustodialToPrivy(
    userId: string, 
    amount: number
): Promise<{ success: boolean; transferId?: string; error?: string }> {
    try {
        console.log(`🔄 Transferring ${amount} SOL from custodial to Privy for ${userId}`);
        
        const transferId = `custodial-to-privy-${userId}-${Date.now()}`;
        
        // Get user wallets
        const userHybridWallet = hybridUserWallets.get(userId);
        const privyWallet = privyIntegrationManager.privyWallets.get(userId);
        
        if (!userHybridWallet) {
            return { success: false, error: 'User custodial wallet not found' };
        }
        
        if (!privyWallet) {
            return { success: false, error: 'Privy wallet not registered for user' };
        }
        
        // Check custodial balance
        if (userHybridWallet.custodialBalance < amount) {
            return { 
                success: false, 
                error: `Insufficient custodial balance: ${userHybridWallet.custodialBalance.toFixed(3)} SOL available` 
            };
        }
        
        // Validate amount
        if (amount < 0.01) {
            return { success: false, error: 'Minimum transfer amount is 0.01 SOL' };
        }
        
        if (amount > 50) {
            return { success: false, error: 'Maximum transfer amount is 50 SOL' };
        }
        
        // Create transfer record
        const transfer: PrivyTransfer = {
            transferId,
            userId,
            amount,
            fromType: 'custodial',
            toType: 'privy',
            status: 'processing',
            createdAt: Date.now()
        };
        
        activeTransfers.set(transferId, transfer);
        
        try {
            // Execute blockchain transfer (house wallet sends to Privy wallet)
            const privyPublicKey = new PublicKey(privyWallet.privyWalletAddress);
            const transaction = await createTransaction(housePublicKey, privyPublicKey, amount);
            
            const { blockhash } = await solanaConnection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = housePublicKey;
            
            transaction.sign(houseWallet);
            const signature = await solanaConnection.sendRawTransaction(transaction.serialize());
            
            // Wait for confirmation
            await solanaConnection.confirmTransaction(signature, 'confirmed');
            
            // Update balances
            userHybridWallet.custodialBalance -= amount;
            userHybridWallet.totalTransfersToEmbedded += amount;
            userHybridWallet.lastTransferBetweenWallets = Date.now();
            
            // Update Privy wallet balance
            await updatePrivyWalletBalance(userId);
            
            // Complete transfer
            transfer.status = 'completed';
            transfer.completedAt = Date.now();
            transfer.transactionId = signature;
            
            // Save to database
            await saveHybridWallet(userHybridWallet);
            await saveTransferToDatabase(transfer);
            
            console.log(`✅ Custodial to Privy transfer completed: ${transferId} (${signature})`);
            
            return { success: true, transferId };
            
        } catch (error) {
            // Handle transfer failure
            transfer.status = 'failed';
            transfer.error = error instanceof Error ? error.message : 'Transfer failed';
            
            await saveTransferToDatabase(transfer);
            
            throw error;
        }
        
    } catch (error) {
        console.error('❌ Custodial to Privy transfer failed:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Transfer failed' 
        };
    }
}

async function transferPrivyToCustodial(
    userId: string, 
    amount: number, 
    signedTransaction?: string
): Promise<{ 
    success: boolean; 
    transferId?: string; 
    error?: string; 
    unsignedTransaction?: string 
}> {
    try {
        console.log(`🔄 Transferring ${amount} SOL from Privy to custodial for ${userId}`);
        
        const transferId = `privy-to-custodial-${userId}-${Date.now()}`;
        
        // Get user wallets
        const userHybridWallet = hybridUserWallets.get(userId);
        const privyWallet = privyIntegrationManager.privyWallets.get(userId);
        
        if (!userHybridWallet) {
            return { success: false, error: 'User custodial wallet not found' };
        }
        
        if (!privyWallet) {
            return { success: false, error: 'Privy wallet not registered for user' };
        }
        
        // Update and check Privy balance
        const currentBalance = await updatePrivyWalletBalance(userId);
        if (currentBalance < amount + 0.01) { // Include fee buffer
            return { 
                success: false, 
                error: `Insufficient Privy wallet balance: ${currentBalance.toFixed(3)} SOL available` 
            };
        }
        
        if (!signedTransaction) {
            // Step 1: Create unsigned transaction for user to sign
            const privyPublicKey = new PublicKey(privyWallet.privyWalletAddress);
            const transaction = await createTransaction(privyPublicKey, housePublicKey, amount);
            
            const { blockhash } = await solanaConnection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = privyPublicKey;
            
            // Add memo
            const memo = `privy-to-custodial-${transferId}`;
            transaction.add(
                new TransactionInstruction({
                    keys: [],
                    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
                    data: Buffer.from(memo, 'utf8')
                })
            );
            
            const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
            const base64Transaction = serializedTransaction.toString('base64');
            
            // Create pending transfer record
            const transfer: PrivyTransfer = {
                transferId,
                userId,
                amount,
                fromType: 'privy',
                toType: 'custodial',
                status: 'pending',
                createdAt: Date.now()
            };
            
            activeTransfers.set(transferId, transfer);
            
            return { 
                success: false,
                transferId,
                unsignedTransaction: base64Transaction,
                error: 'Transaction created - user must sign'
            };
        }
        
        // Step 2: Process signed transaction
        const transfer = activeTransfers.get(transferId);
        if (transfer) {
            transfer.status = 'processing';
        }
        
        const transactionBuffer = Buffer.from(signedTransaction, 'base64');
        
        // Submit to blockchain
        const signature = await solanaConnection.sendRawTransaction(
            transactionBuffer,
            { skipPreflight: false, preflightCommitment: 'confirmed' }
        );
        
        // Wait for confirmation
        const confirmation = await Promise.race([
            solanaConnection.confirmTransaction(signature, 'confirmed'),
            new Promise<any>((_, reject) => 
                setTimeout(() => reject(new Error('Transaction timeout')), 30000)
            )
        ]);
        
        if (confirmation && confirmation.value && confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        // Update custodial balance
        userHybridWallet.custodialBalance += amount;
        userHybridWallet.totalTransfersToCustodial += amount;
        userHybridWallet.lastTransferBetweenWallets = Date.now();
        
        // Update Privy wallet balance
        await updatePrivyWalletBalance(userId);
        
        // Complete transfer
        if (transfer) {
            transfer.status = 'completed';
            transfer.completedAt = Date.now();
            transfer.transactionId = signature;
        }
        
        // Save to database
        await saveHybridWallet(userHybridWallet);
        if (transfer) {
            await saveTransferToDatabase(transfer);
        }
        
        console.log(`✅ Privy to custodial transfer completed: ${transferId} (${signature})`);
        
        return { success: true, transferId };
        
    } catch (error) {
        console.error('❌ Privy to custodial transfer failed:', error);
        
        // Update transfer status
        const transfer = activeTransfers.get(`privy-to-custodial-${userId}-${Date.now()}`);
        if (transfer) {
            transfer.status = 'failed';
            transfer.error = error instanceof Error ? error.message : 'Transfer failed';
            await saveTransferToDatabase(transfer);
        }
        
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Transfer failed' 
        };
    }
}

function updatePrivyIntegrationStats(): void {
    const wallets = Array.from(privyIntegrationManager.privyWallets.values());
    
    privyIntegrationManager.totalPrivyWallets = wallets.length;
    privyIntegrationManager.connectedPrivyWallets = wallets.filter(w => w.isConnected).length;
    privyIntegrationManager.totalPrivyBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
    
    console.log(`📊 Privy Stats: ${privyIntegrationManager.totalPrivyWallets} wallets, ${privyIntegrationManager.totalPrivyBalance.toFixed(3)} SOL`);
}

// ===== DATABASE FUNCTIONS =====

async function savePrivyWalletToDatabase(wallet: PrivyWallet): Promise<void> {
    try {
        await supabaseService
            .from('privy_wallets')
            .upsert({
                user_id: wallet.userId,
                privy_wallet_address: wallet.privyWalletAddress,
                privy_wallet_id: wallet.privyWalletId,
                balance: wallet.balance,
                last_balance_update: wallet.lastBalanceUpdate > 0 ? new Date(wallet.lastBalanceUpdate).toISOString() : null,
                is_connected: wallet.isConnected,
                created_at: new Date(wallet.createdAt).toISOString(),
                last_used: wallet.lastUsed > 0 ? new Date(wallet.lastUsed).toISOString() : null,
                updated_at: new Date().toISOString()
            });
    } catch (error) {
        console.warn('⚠️ Failed to save Privy wallet to database:', error);
    }
}

async function saveTransferToDatabase(transfer: PrivyTransfer): Promise<void> {
    try {
        await supabaseService
            .from('wallet_transfers')
            .upsert({
                transfer_id: transfer.transferId,
                user_id: transfer.userId,
                amount: transfer.amount,
                from_type: transfer.fromType,
                to_type: transfer.toType,
                status: transfer.status,
                created_at: new Date(transfer.createdAt).toISOString(),
                completed_at: transfer.completedAt ? new Date(transfer.completedAt).toISOString() : null,
                transaction_id: transfer.transactionId,
                error_message: transfer.error,
                updated_at: new Date().toISOString()
            });
    } catch (error) {
        console.warn('⚠️ Failed to save transfer to database:', error);
    }
}

// ===== INITIALIZATION FUNCTION =====

async function initializePrivyIntegration(): Promise<void> {
    try {
        console.log('🔄 Initializing Privy integration system...');
        
        // Load existing Privy wallets from database
        const { data: privyWallets, error } = await supabaseService
            .from('privy_wallets')
            .select('*');

        if (!error && privyWallets) {
            privyWallets.forEach((wallet: any) => {
                const privyWallet: PrivyWallet = {
                    userId: wallet.user_id,
                    privyWalletAddress: wallet.privy_wallet_address,
                    privyWalletId: wallet.privy_wallet_id,
                    balance: parseFloat(wallet.balance) || 0,
                    lastBalanceUpdate: wallet.last_balance_update ? new Date(wallet.last_balance_update).getTime() : 0,
                    isConnected: wallet.is_connected || false,
                    createdAt: new Date(wallet.created_at).getTime(),
                    lastUsed: wallet.last_used ? new Date(wallet.last_used).getTime() : 0
                };
                
                privyIntegrationManager.privyWallets.set(wallet.user_id, privyWallet);
            });
            
            updatePrivyIntegrationStats();
            console.log(`✅ Loaded ${privyWallets.length} Privy wallets`);
        } else {
            console.log('📝 No existing Privy wallets found - starting fresh');
        }
        
        // Load active transfers
        const { data: transfers, error: transferError } = await supabaseService
            .from('wallet_transfers')
            .select('*')
            .in('status', ['pending', 'processing']);

        if (!transferError && transfers) {
            transfers.forEach((transfer: any) => {
                const privyTransfer: PrivyTransfer = {
                    transferId: transfer.transfer_id,
                    userId: transfer.user_id,
                    amount: parseFloat(transfer.amount),
                    fromType: transfer.from_type,
                    toType: transfer.to_type,
                    status: transfer.status,
                    createdAt: new Date(transfer.created_at).getTime(),
                    completedAt: transfer.completed_at ? new Date(transfer.completed_at).getTime() : undefined,
                    transactionId: transfer.transaction_id,
                    error: transfer.error_message
                };
                
                activeTransfers.set(transfer.transfer_id, privyTransfer);
            });
            
            console.log(`✅ Loaded ${transfers.length} active transfers`);
        }
        
    } catch (error) {
        console.warn('⚠️ Could not load Privy integration data:', error);
    }
}

// Transaction confirmation interface
interface TransactionConfirmation {
    value: {
        err: any;
        confirmationStatus?: string;
    } | null;
}

// Transfer instruction decoder
function decodeTransferInstruction(instruction: TransactionInstruction): {
    fromPubkey: PublicKey;
    toPubkey: PublicKey;
    lamports: number;
  } {
    try {
      console.log('🔍 Trying SystemInstruction.decodeTransfer...');
      // Use Solana's built-in decoder
      const decoded = SystemInstruction.decodeTransfer(instruction);
      console.log('✅ Successfully decoded transfer:', {
        from: decoded.fromPubkey.toString(),
        to: decoded.toPubkey.toString(),
        lamports: Number(decoded.lamports)
      });
      return {
        fromPubkey: decoded.fromPubkey,
        toPubkey: decoded.toPubkey,
        lamports: Number(decoded.lamports)  // ← Convert bigint to number
      };
    } catch (error) {
      console.log('❌ SystemInstruction.decodeTransfer failed:', error);
      console.log('🔍 Falling back to manual decode...');
      
      // Fallback to your existing manual decoder
      const data = instruction.data;
      if (data.length < 12 || data[0] !== 2) {
        console.log('❌ Manual decode also failed:', {
          length: data.length,
          firstByte: data[0],
          allBytes: Array.from(data)
        });
        throw new Error('Not a valid transfer instruction');
      }
      
      const lamportsBuffer = data.slice(4, 12);
      const lamports = Number(lamportsBuffer.readBigUInt64LE(0));
      return {
        fromPubkey: instruction.keys[0].pubkey,
        toPubkey: instruction.keys[1].pubkey,
        lamports
      };
    }
  }

// Helper function to find transfer instruction in transaction
function findTransferInstruction(transaction: TransactionResponse): TransactionInstruction | null {
    try {
        const message = transaction.transaction.message;
        
        for (let i = 0; i < message.instructions.length; i++) {
            const ix = message.instructions[i];
            const programId = message.accountKeys[ix.programIdIndex];
            
            if (programId.equals(SystemProgram.programId)) {
                // Reconstruct the instruction
                const keys = ix.accounts.map(accountIndex => ({
                    pubkey: message.accountKeys[accountIndex],
                    isSigner: accountIndex < message.header.numRequiredSignatures,
                    isWritable: accountIndex < message.header.numRequiredSignatures - message.header.numReadonlySignedAccounts ||
                              (accountIndex >= message.header.numRequiredSignatures && 
                               accountIndex < message.accountKeys.length - message.header.numReadonlyUnsignedAccounts)
                }));
                
                return {
                    programId,
                    keys,
                    data: Buffer.from(ix.data, 'base64')
                } as TransactionInstruction;
            }
        }
        
        return null;
    } catch (error) {
        console.warn('Error finding transfer instruction:', error);
        return null;
    }
}

// ===== BOOTSTRAP SYSTEM =====
const BOOTSTRAP_CONFIG = {
    ENABLED: true,
    INITIAL_START_TIME: Date.now(),
    MAX_TOTAL_DURATION: 7 * 24 * 60 * 60 * 1000,
    MAX_SINGLE_SESSION: 48 * 60 * 60 * 1000,
    
    ENTER_BOOTSTRAP_THRESHOLD: 20.0,
    EXIT_BOOTSTRAP_THRESHOLD: 35.0,
    EMERGENCY_THRESHOLD: 5.0,
    
    COOLDOWN_AFTER_EXIT: 2 * 60 * 60 * 1000,
    
    EMERGENCY_SETTINGS: {
        houseEdge: 0.15,  // 15% house edge (was 0.70)
        maxPayout: 0.5,
        maxBet: 1.0,
        rugPullMultiplier: 3.0,
        maxMultiplier: 2.0,
        instantRugThreshold: 0.5
    },
    
    CRITICAL_SETTINGS: {
        houseEdge: 0.10,  // 10% house edge (was 0.60)
        maxPayout: 1.5,
        maxBet: 2.5,
        rugPullMultiplier: 2.5,
        maxMultiplier: 5.0,
        instantRugThreshold: 1.5
    },
    
    BOOTSTRAP_SETTINGS: {
        houseEdge: 0.08,  // 8% house edge (was 0.50)
        maxPayout: 2.5,
        maxBet: 4.0,
        rugPullMultiplier: 2.0,
        maxMultiplier: 8.0,
        instantRugThreshold: 3.0
    },
    
    NORMAL_SETTINGS: {
        houseEdge: 0.05,
        maxPayout: 15.0,           
        maxBet: 10.0,              
        instantRugThreshold: 10.2, 
        maxMultiplier: 100.0,
        rugPullMultiplier: 1.0
    }
};

const BOOTSTRAP_FOMO_SYSTEM: BootstrapFomoSystem = {
    enabled: true,
    
    noPlayersThreshold: 0.05,          // < 0.05 SOL total bets = "empty"
    minEmptyGamesBeforeFomo: 2,        // Start FOMO after 2 empty games
    
    fomoMultiplierRange: {
        min: 3.0,                      // Minimum 3x for FOMO
        max: 25.0                      // Maximum 25x for FOMO
    },
    
    fomoChance: 0.75,                  // 75% chance of FOMO run when empty
    
    consecutiveFomoLimit: 4,           // Max 4 consecutive FOMO runs
    fomoBreakChance: 0.3,              // 30% chance to break with low run
    
    // State
    currentEmptyStreak: 0,
    currentFomoStreak: 0,
    lastFomoGameNumber: 0,
    recentFomoHistory: []
};

const EXTREME_MULTIPLIER_CONFIG: ExtremeMultiplierConfig = {
    enabled: true,
    lowBetThreshold: 2.0,           // Only trigger if total bets ≤ 2 SOL
    extremeChance: 0.03,            // 3% chance per game
    minExtremeMultiplier: 50.0,     // Minimum 50x multiplier
    maxExtremeMultiplier: 500.0,    // Maximum 500x multiplier  
    maxRiskAmount: 10.0,            // Max 10 SOL total risk
    cooldownMinutes: 20,            // 20 minute cooldown
    lastExtremeTime: 0              // Initialize to 0
};

let bootstrapState = {
    masterEnabled: BOOTSTRAP_CONFIG.ENABLED,
    currentlyActive: false,
    currentSessionStart: 0,
    lastExitTime: 0,
    totalBootstrapTime: 0,
    totalSessions: 0,
    lifetimeGamesPlayed: 0,
    lifetimeProfitGenerated: 0,
    currentSessionGames: 0,
    currentSessionProfit: 0,
    currentMode: 'normal' as 'emergency' | 'critical' | 'bootstrap' | 'normal',
    lastModeChange: Date.now()
};

function determineBootstrapMode(houseBalance: number): 'emergency' | 'critical' | 'bootstrap' | 'normal' {
    if (!bootstrapState.masterEnabled) return 'normal';
    
    const totalTimeElapsed = Date.now() - BOOTSTRAP_CONFIG.INITIAL_START_TIME;
    if (totalTimeElapsed > BOOTSTRAP_CONFIG.MAX_TOTAL_DURATION) {
        console.log('🛑 Bootstrap lifetime limit reached - permanently disabled');
        bootstrapState.masterEnabled = false;
        return 'normal';
    }
    
    if (houseBalance < BOOTSTRAP_CONFIG.EMERGENCY_THRESHOLD) {
        return 'emergency';
    } else if (houseBalance < BOOTSTRAP_CONFIG.ENTER_BOOTSTRAP_THRESHOLD) {
        return 'critical';
    } else if (houseBalance < BOOTSTRAP_CONFIG.EXIT_BOOTSTRAP_THRESHOLD) {
        return 'bootstrap';
    } else {
        return 'normal';
    }
}

function canEnterBootstrap(targetMode: string): boolean {
    if (!bootstrapState.masterEnabled) return false;
    if (targetMode === 'normal') return true;
    
    const now = Date.now();
    
    if (bootstrapState.lastExitTime > 0) {
        const timeSinceExit = now - bootstrapState.lastExitTime;
        if (timeSinceExit < BOOTSTRAP_CONFIG.COOLDOWN_AFTER_EXIT) {
            const minutesRemaining = Math.ceil((BOOTSTRAP_CONFIG.COOLDOWN_AFTER_EXIT - timeSinceExit) / 60000);
            console.log(`⏳ Bootstrap cooldown: ${minutesRemaining} minutes remaining`);
            return false;
        }
    }
    
    if (bootstrapState.currentlyActive && bootstrapState.currentSessionStart > 0) {
        const sessionDuration = now - bootstrapState.currentSessionStart;
        if (sessionDuration > BOOTSTRAP_CONFIG.MAX_SINGLE_SESSION) {
            console.log('⏰ Bootstrap session time limit reached');
            return false;
        }
    }
    
    return true;
}

function isGameEffectivelyEmpty(): boolean {
    if (!currentGame) return true;
    
    // Check total real bets (excluding artificial liquidity)
    const realBets = currentGame.totalBets;
    const isEmpty = realBets < BOOTSTRAP_FOMO_SYSTEM.noPlayersThreshold;
    
    console.log(`🔍 Empty Game Check: ${realBets.toFixed(4)} SOL real bets ${isEmpty ? '<' : '>='} ${BOOTSTRAP_FOMO_SYSTEM.noPlayersThreshold} threshold → ${isEmpty ? 'EMPTY' : 'HAS PLAYERS'}`);
    
    return isEmpty;
}

function shouldTriggerBootstrapFomo(gameNumber: number): {
    trigger: boolean;
    targetMultiplier?: number;
    reason: string;
    pattern?: string;
} {
    if (!BOOTSTRAP_FOMO_SYSTEM.enabled) {
        return { trigger: false, reason: 'FOMO system disabled' };
    }
    
    // Only during bootstrap mode
    const config = getCurrentGameConfig();
    if (!config._BOOTSTRAP_MODE) {
        return { trigger: false, reason: 'Not in bootstrap mode' };
    }
    
    const isEmpty = isGameEffectivelyEmpty();
    
    if (!isEmpty) {
        // Reset empty streak if players are present
        BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak = 0;
        BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak = 0;
        return { trigger: false, reason: 'Players present - normal game rules apply' };
    }
    
    // Increment empty streak
    BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak++;
    
    // Need minimum empty games before starting FOMO
    if (BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak < BOOTSTRAP_FOMO_SYSTEM.minEmptyGamesBeforeFomo) {
        return { 
            trigger: false, 
            reason: `Empty streak too short: ${BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak}/${BOOTSTRAP_FOMO_SYSTEM.minEmptyGamesBeforeFomo}` 
        };
    }
    
    // Check consecutive FOMO limit
    if (BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak >= BOOTSTRAP_FOMO_SYSTEM.consecutiveFomoLimit) {
        // Force a break with low multiplier
        BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak = 0;
        
        const breakMultiplier = 1.0 + Math.random() * 0.8; // 1.0x - 1.8x
        console.log(`🛑 FOMO BREAK: Forced low run ${breakMultiplier.toFixed(2)}x after ${BOOTSTRAP_FOMO_SYSTEM.consecutiveFomoLimit} FOMO games`);
        
        return {
            trigger: true,
            targetMultiplier: breakMultiplier,
            reason: 'Forced FOMO break - preventing pattern detection',
            pattern: 'break'
        };
    }
    
    // Random chance to break FOMO streak early
    if (BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak > 0 && Math.random() < BOOTSTRAP_FOMO_SYSTEM.fomoBreakChance) {
        BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak = 0;
        
        const earlyBreakMultiplier = 1.0 + Math.random() * 1.2; // 1.0x - 2.2x
        console.log(`🎲 FOMO EARLY BREAK: Random break ${earlyBreakMultiplier.toFixed(2)}x (${(BOOTSTRAP_FOMO_SYSTEM.fomoBreakChance * 100).toFixed(0)}% chance)`);
        
        return {
            trigger: true,
            targetMultiplier: earlyBreakMultiplier,
            reason: 'Random FOMO break',
            pattern: 'early_break'
        };
    }
    
    // Check FOMO chance
    if (Math.random() > BOOTSTRAP_FOMO_SYSTEM.fomoChance) {
        // Normal bootstrap behavior
        return { 
            trigger: false, 
            reason: `FOMO chance failed (${(BOOTSTRAP_FOMO_SYSTEM.fomoChance * 100).toFixed(0)}% chance)` 
        };
    }
    
    // Generate FOMO multiplier
    const range = BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange.max - BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange.min;
    const rawMultiplier = BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange.min + (Math.random() * range);
    
    // Add some variety in the pattern
    let targetMultiplier = rawMultiplier;
    let pattern = 'standard';
    
    // 20% chance for extra high FOMO
    if (Math.random() < 0.2) {
        targetMultiplier = rawMultiplier * (1.2 + Math.random() * 0.8); // 1.2x - 2x boost
        targetMultiplier = Math.min(targetMultiplier, BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange.max * 1.5);
        pattern = 'extra_high';
    }
    
    // 15% chance for moderate FOMO (to mix it up)
    if (Math.random() < 0.15 && pattern === 'standard') {
        targetMultiplier = BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange.min + (range * 0.3); // Lower 30% of range
        pattern = 'moderate';
    }
    
    BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak++;
    BOOTSTRAP_FOMO_SYSTEM.lastFomoGameNumber = gameNumber;
    
    // Track FOMO event
    BOOTSTRAP_FOMO_SYSTEM.recentFomoHistory.push({
        gameNumber,
        multiplier: targetMultiplier,
        wasEmpty: true,
        timestamp: Date.now()
    });
    
    // Keep only last 20 FOMO events
    if (BOOTSTRAP_FOMO_SYSTEM.recentFomoHistory.length > 20) {
        BOOTSTRAP_FOMO_SYSTEM.recentFomoHistory.shift();
    }
    
    console.log(`🚀 BOOTSTRAP FOMO TRIGGERED!`);
    console.log(`   Target: ${targetMultiplier.toFixed(2)}x (${pattern})`);
    console.log(`   Empty streak: ${BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak}`);
    console.log(`   FOMO streak: ${BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak}/${BOOTSTRAP_FOMO_SYSTEM.consecutiveFomoLimit}`);
    console.log(`   Bootstrap level: ${config._BOOTSTRAP_LEVEL}`);
    
    return {
        trigger: true,
        targetMultiplier: Math.floor(targetMultiplier * 100) / 100, // Round to 2 decimals
        reason: `Bootstrap FOMO: ${targetMultiplier.toFixed(2)}x ${pattern} run`,
        pattern
    };
}

function onPlayersJoinGame(): void {
    if (BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak > 0) {
        console.log(`👥 Players joined! Ending empty streak of ${BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak} games`);
        
        BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak = 0;
        BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak = 0;
        
        // Broadcast that FOMO period is ending
        io.emit('bootstrapFomoEnded', {
            reason: 'Players joined the game',
            previousEmptyStreak: BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak,
            message: '👥 Players detected - switching to normal game rules',
            timestamp: Date.now()
        });
    }
}

// Add this function around line 1850, after onPlayersJoinGame
function trackExtremeOutcome(gameNumber: number, targetMultiplier: number, actualMultiplier: number): void {
    try {
        const wasSuccessful = actualMultiplier >= targetMultiplier * 0.95; // Within 5% of target
        
        console.log(`🎆 EXTREME GAME OUTCOME: Game ${gameNumber}`);
        console.log(`   Target: ${targetMultiplier}x | Actual: ${actualMultiplier}x`);
        console.log(`   Success: ${wasSuccessful ? 'YES' : 'NO'} (${((actualMultiplier/targetMultiplier)*100).toFixed(1)}% of target)`);
        
        // Update extreme multiplier cooldown based on outcome
        if (wasSuccessful) {
            // Successful extreme run - normal cooldown
            EXTREME_MULTIPLIER_CONFIG.lastExtremeTime = Date.now();
        } else {
            // Failed extreme run - reduced cooldown for retry
            EXTREME_MULTIPLIER_CONFIG.lastExtremeTime = Date.now() - (EXTREME_MULTIPLIER_CONFIG.cooldownMinutes * 60 * 1000 * 0.5);
        }
        
        // Broadcast extreme outcome
        io.emit('extremeGameOutcome', {
            gameNumber,
            targetMultiplier,
            actualMultiplier,
            wasSuccessful,
            achievementPercentage: (actualMultiplier / targetMultiplier) * 100,
            message: wasSuccessful ? 
                `🎆 EXTREME SUCCESS! ${actualMultiplier}x achieved!` : 
                `💥 Stopped at ${actualMultiplier}x (target was ${targetMultiplier}x)`,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Error tracking extreme outcome:', error);
    }
}
function getBootstrapStatus(houseBalance: number): { 
    active: boolean; 
    mode: string; 
    settings: any; 
    canReenter: boolean;
    reason?: string;
} {
    const targetMode = determineBootstrapMode(houseBalance);
    const canEnter = canEnterBootstrap(targetMode);
    const shouldBeActive = targetMode !== 'normal' && canEnter;
    
    if (shouldBeActive && !bootstrapState.currentlyActive) {
        bootstrapState.currentlyActive = true;
        bootstrapState.currentSessionStart = Date.now();
        bootstrapState.totalSessions++;
        bootstrapState.currentSessionGames = 0;
        bootstrapState.currentSessionProfit = 0;
        
        console.log(`🚀 Entering ${targetMode} bootstrap mode: House balance ${houseBalance.toFixed(3)} SOL`);
        
    } else if (!shouldBeActive && bootstrapState.currentlyActive) {
        const sessionDuration = Date.now() - bootstrapState.currentSessionStart;
        bootstrapState.totalBootstrapTime += sessionDuration;
        bootstrapState.currentlyActive = false;
        bootstrapState.lastExitTime = Date.now();
        
        console.log(`✅ Exiting bootstrap mode: House balance ${houseBalance.toFixed(3)} SOL, Session duration: ${(sessionDuration/3600000).toFixed(1)}h`);
    }
    
    if (bootstrapState.currentMode !== targetMode) {
        console.log(`🔄 Mode change: ${bootstrapState.currentMode} → ${targetMode}`);
        bootstrapState.currentMode = targetMode;
        bootstrapState.lastModeChange = Date.now();
    }
    
    let currentSettings;
    switch (targetMode) {
        case 'emergency':
            currentSettings = BOOTSTRAP_CONFIG.EMERGENCY_SETTINGS;
            break;
        case 'critical':
            currentSettings = BOOTSTRAP_CONFIG.CRITICAL_SETTINGS;
            break;
        case 'bootstrap':
            currentSettings = BOOTSTRAP_CONFIG.BOOTSTRAP_SETTINGS;
            break;
        default:
            currentSettings = BOOTSTRAP_CONFIG.NORMAL_SETTINGS;
    }
    
    return {
        active: shouldBeActive,
        mode: targetMode,
        settings: currentSettings,
        canReenter: canEnterBootstrap('bootstrap'),
        reason: !canEnter ? 'Cooldown active or time limit reached' : undefined
    };
}

function getCurrentGameConfig() {
    const status = getBootstrapStatus(houseBalance);
    const settings = status.settings;
    
    if (status.active) {
        return {
            MIN_GAME_DURATION: 5000,
            MAX_GAME_DURATION: 180000,
            HOUSE_EDGE: settings.houseEdge,
            UPDATE_INTERVAL: 100,
            MIN_BET: 0.002,
            MAX_BET: settings.maxBet,
            MAX_MULTIPLIER: settings.maxMultiplier,
            HIGH_BET_THRESHOLD: Math.min(2.0, settings.maxBet * 0.8),
            INSTANT_RUG_THRESHOLD: settings.instantRugThreshold,
            VOLATILITY_BASE: 0.02,
            TREND_CHANGE_CHANCE: 0.15,
            RUG_PULL_CHANCE_BASE: 0.002 * settings.rugPullMultiplier,
            MAX_RISE_WITHOUT_DIP: 2.0,
            MIN_HOUSE_BALANCE: Math.min(3.0, houseBalance * 0.1),
            MAX_SINGLE_PAYOUT: settings.maxPayout,
            TRANSACTION_TIMEOUT: 30000,
            BALANCE_CACHE_DURATION: 10000,
            _BOOTSTRAP_MODE: true,
            _BOOTSTRAP_LEVEL: status.mode,
            _BOOTSTRAP_MULTIPLIER: settings.rugPullMultiplier
        };
    } else {
        return {
            MIN_GAME_DURATION: 5000,
            MAX_GAME_DURATION: 180000,
            HOUSE_EDGE: 0.05,
            UPDATE_INTERVAL: 100,
            MIN_BET: 0.002,
            MAX_BET: 10.0,
            MAX_MULTIPLIER: 100.0,
            HIGH_BET_THRESHOLD: 5.0,
            INSTANT_RUG_THRESHOLD: 10.0,
            VOLATILITY_BASE: 0.02,
            TREND_CHANGE_CHANCE: 0.15,
            RUG_PULL_CHANCE_BASE: 0.001,
            MAX_RISE_WITHOUT_DIP: 2.5,
            MIN_HOUSE_BALANCE: 50.0,
            MAX_SINGLE_PAYOUT: 5.0,
            TRANSACTION_TIMEOUT: 30000,
            BALANCE_CACHE_DURATION: 10000,
            _BOOTSTRAP_MODE: false,
            _BOOTSTRAP_LEVEL: 'normal',
            _BOOTSTRAP_MULTIPLIER: 1.0
        };
    }
}

function trackBootstrapProgress(gameProfit: number) {
    if (bootstrapState.currentlyActive) {
        bootstrapState.currentSessionGames++;
        bootstrapState.currentSessionProfit += gameProfit;
        bootstrapState.lifetimeGamesPlayed++;
        bootstrapState.lifetimeProfitGenerated += gameProfit;
        
        const status = getBootstrapStatus(houseBalance);
        console.log(`🎯 ${status.mode.toUpperCase()} Game ${bootstrapState.currentSessionGames}: Profit ${gameProfit.toFixed(3)} SOL, House ${houseBalance.toFixed(3)} SOL, Session total: ${bootstrapState.currentSessionProfit.toFixed(3)} SOL`);
    }
}

// Wallet and transaction management
const walletBalances = new Map<string, WalletBalance>();
const pendingTransactions = new Map<string, PendingTransaction>();
let houseBalance = 0;
let lastHouseBalanceUpdate = 0;

const BET_VALIDATION = {
    MIN_HOLD_TIME: 2000,
    MAX_PAYOUT_MULTIPLIER: 100.0,
    LATE_BET_PENALTY: 0.0,
    HOUSE_EDGE: 0.05
};

// Game state
let currentGame: GameState | null = null;
let gameHistory: GameState[] = [];
let gameStartLock = false;
let gameCountdown: NodeJS.Timeout | null = null;
let countdownTimeRemaining = 0;

let tradingState: TradingState = {
    trend: 'up',
    momentum: 0.3,
    volatility: 0.02,
    lastDirection: 1,
    consecutiveRises: 0,
    rugPullPending: false,
    rugPullProbability: 0.001,
    totalBetsSinceStart: 0,
    highBetCount: 0
};

// ===== HYBRID SYSTEM STORAGE =====
const hybridUserWallets = new Map<string, HybridUserWallet>();
let hybridSystemStats: HybridSystemStats = {
    totalUsers: 0,
    totalCustodialBalance: 0,
    totalEmbeddedBalance: 0,
    activeGamingUsers: 0,
    totalTransfers: 0
};

// Enhanced Multiplier Control System
interface GameHistoryEntry {
    gameNumber: number;
    crashMultiplier: number;
    totalBets: number;
    totalPayouts: number;
    houseProfit: number;
    timestamp: number;
    playerCount: number;
}

interface MultiplierControl {
    recentGames: GameHistoryEntry[];
    lastHighMultiplier: number;
    consecutiveHighCount: number;
    rollingHouseProfit: number;
    maxHistorySize: number;
    cooldownActive: boolean;
    cooldownUntil: number;
}

const MULTIPLIER_CONTROL = {
    HIGH_MULTIPLIER_THRESHOLD: 5.0,
    VERY_HIGH_MULTIPLIER_THRESHOLD: 10.0,
    MAX_CONSECUTIVE_HIGH: 2,
    COOLDOWN_DURATION: 300000,
    MIN_COOLDOWN_DURATION: 60000,
    ROLLING_WINDOW_SIZE: 15,
    TARGET_HOUSE_EDGE_RATIO: 0.35,
    MAX_MULTIPLIER_DURING_COOLDOWN: 3.0,
    PROBABILITY_REDUCTION_FACTOR: 0.3
};

let multiplierControl: MultiplierControl = {
    recentGames: [],
    lastHighMultiplier: 0,
    consecutiveHighCount: 0,
    rollingHouseProfit: 0,
    maxHistorySize: MULTIPLIER_CONTROL.ROLLING_WINDOW_SIZE,
    cooldownActive: false,
    cooldownUntil: 0
};

// ===== ENHANCED TRANSACTION MONITORING SYSTEM =====

// FIXED: Enhanced transaction monitoring with proper house balance updates
// 🔧 ENHANCED: Updated transaction monitoring for user_profiles
// COMPLETE FIXED VERSION: Replace your entire monitorAndUpdateDatabase function with this
async function monitorAndUpdateDatabase(): Promise<void> {
    try {
        console.log('🔍 Monitoring house wallet transactions and updating database...');
        
        const signatures = await solanaConnection.getSignaturesForAddress(
            housePublicKey,
            { limit: 20 }
        );

        let balanceChanged = false;

        for (const sigInfo of signatures) {
            if (processedSignatures.has(sigInfo.signature)) {
                continue;
            }

            if (sigInfo.err) {
                console.log(`⚠️ Skipping failed transaction: ${sigInfo.signature}`);
                processedSignatures.add(sigInfo.signature);
                continue;
            }

            try {
                const transaction = await solanaConnection.getTransaction(sigInfo.signature, {
                    commitment: 'confirmed'
                });

                if (!transaction) {
                    console.log(`⚠️ Could not fetch transaction: ${sigInfo.signature}`);
                    continue;
                }

                const transferInstruction = findTransferInstruction(transaction);
                let decoded: { fromPubkey: PublicKey; toPubkey: PublicKey; lamports: number } | null = null;

                // Try balance change analysis first
                try {
                    const preBalances = transaction.meta?.preBalances || [];
                    const postBalances = transaction.meta?.postBalances || [];
                    const accountKeys = transaction.transaction.message.accountKeys;
                    
                    const houseWalletIndex = accountKeys.findIndex(key => key.equals(housePublicKey));
                    
                    if (houseWalletIndex !== -1) {
                        const preBalance = preBalances[houseWalletIndex] || 0;
                        const postBalance = postBalances[houseWalletIndex] || 0;
                        const balanceChange = postBalance - preBalance;
                        
                        if (balanceChange > 0) {
                            for (let i = 0; i < accountKeys.length; i++) {
                                if (i !== houseWalletIndex) {
                                    const accountPreBalance = preBalances[i] || 0;
                                    const accountPostBalance = postBalances[i] || 0;
                                    const accountChange = accountPostBalance - accountPreBalance;
                                    
                                    if (accountChange < 0 && Math.abs(Math.abs(accountChange) - balanceChange) < 10000) {
                                        decoded = {
                                            fromPubkey: accountKeys[i],
                                            toPubkey: housePublicKey,
                                            lamports: balanceChange
                                        };
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch (balanceError) {
                    console.log('⚠️ Balance analysis failed:', balanceError);
                }

                // Fallback to instruction decoding
                if (!decoded && transferInstruction) {
                    try {
                        decoded = decodeTransferInstruction(transferInstruction);
                    } catch (instructionError) {
                        console.log('❌ Instruction decoding also failed:', instructionError);
                    }
                }

                if (decoded && decoded.toPubkey.equals(housePublicKey)) {
                    const fromAddress = decoded.fromPubkey.toString();
                    const amount = decoded.lamports / LAMPORTS_PER_SOL;
                    
                    console.log(`💰 Detected incoming deposit: ${amount} SOL from ${fromAddress}`);
                    balanceChanged = true;
                    
                    // ENHANCED: Try to find or create user
                    let userFound = false;
                    let userId = null;
                    
                    try {
                        const userResult = await getOrCreateUser(fromAddress);
                        userId = userResult.userId;
                        userFound = true;
                        
                        console.log(`👤 ${userResult.isNewUser ? 'Created new' : 'Found existing'} user: ${userId}`);
                        
                        // Use the enhanced balance update system
                        const { data: balanceResult, error: balanceError } = await supabaseService
                            .rpc('update_unified_user_balance', {  // ✅ Change function name
                                p_user_id: userId,
                                p_custodial_change: amount,
                                p_privy_change: 0,
                                p_embedded_change: 0,
                                p_transaction_type: 'external_deposit',
                                p_transaction_id: 'external_deposit',
                                p_game_id: currentGame?.id,
                                p_is_deposit: true,  // or true for deposits
                                p_deposit_amount: amount   // or actual deposit amount
                            });

                        if (balanceError) {
                            console.error(`❌ Failed to update balance for user ${userId}:`, balanceError);
                            throw balanceError;
                        }

                        // FIXED: Get all required variables from RPC response
                        const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);
                        const newTotalBalance = parseFloat(balanceResult[0].new_total_balance || balanceResult[0].new_custodial_balance);
                        const newTotalDeposited = parseFloat(balanceResult[0].new_total_deposited || balanceResult[0].new_custodial_balance);
                        
                        console.log(`✅ Balance updated: ${userId} - Custodial: ${newCustodialBalance.toFixed(3)} SOL`);

                        // FIXED: Broadcast balance update with proper variables
                        io.emit('custodialBalanceUpdate', {
                            userId,
                            custodialBalance: newCustodialBalance,
                            totalBalance: newTotalBalance,
                            totalDeposited: newTotalDeposited,
                            depositAmount: amount,
                            transactionSignature: sigInfo.signature,
                            timestamp: Date.now(),
                            source: 'external_deposit_auto_created',
                            isNewUser: userResult.isNewUser,
                            walletAddress: fromAddress,
                            updateType: 'deposit_processed'
                        });

                        // FIXED: Also emit user-specific balance update
                        io.emit('userBalanceUpdate', {
                            userId,
                            walletAddress: fromAddress,
                            balanceType: 'custodial',
                            oldBalance: newCustodialBalance - amount,
                            newBalance: newCustodialBalance,
                            change: amount,
                            transactionType: 'deposit',
                            transactionSignature: sigInfo.signature,
                            timestamp: Date.now(),
                            source: 'blockchain_deposit'
                        });

                    } catch (userCreationError) {
                        console.error(`❌ Failed to create/find user for deposit from ${fromAddress}:`, userCreationError);
                        userFound = false;
                    }
                    
                    // Fallback: Store as pending deposit if user creation failed
                    if (!userFound) {
                        console.log(`⚠️ User creation failed for wallet ${fromAddress}, storing as pending deposit`);
                        
                        const { error: pendingError } = await supabaseService
                            .from('pending_deposits')
                            .insert({
                                wallet_address: fromAddress,
                                amount: amount,
                                transaction_signature: sigInfo.signature,
                                detected_at: new Date().toISOString(),
                                status: 'pending'
                            });

                        if (pendingError) {
                            console.error('Failed to store pending deposit:', pendingError);
                        } else {
                            console.log(`📝 Stored pending deposit: ${amount} SOL from ${fromAddress}`);
                        }
                    }
                }

                processedSignatures.add(sigInfo.signature);
                
            } catch (error) {
                console.error(`❌ Error processing transaction ${sigInfo.signature}:`, error);
                processedSignatures.add(sigInfo.signature);
            }
        }

        // Update house balance if any changes detected
        if (balanceChanged) {
            console.log('💰 Deposits detected, updating house balance...');
            const oldBalance = houseBalance;
            await updateHouseBalance();
            const change = houseBalance - oldBalance;
            
            console.log(`🏛️ House balance updated: ${oldBalance.toFixed(3)} → ${houseBalance.toFixed(3)} SOL (${change >= 0 ? '+' : ''}${change.toFixed(3)})`);
            
            io.to('admin_monitoring').emit('adminHouseBalanceUpdate', {
                oldBalance,
                newBalance: houseBalance,
                change,
                maxPayoutCapacity: calculateMaxPayoutCapacity(),
                timestamp: Date.now(),
                source: 'deposit_processing'
            });
            
            if (currentGame) {
                currentGame.houseBalance = houseBalance;
                currentGame.maxPayoutCapacity = calculateMaxPayoutCapacity();
                
                io.emit('gameCapacityUpdate', {
                    maxPayoutCapacity: calculateMaxPayoutCapacity(),
                    canAcceptLargeBets: houseBalance > 50,
                    timestamp: Date.now()
                });
            }
        }

        // Clean up old processed signatures
        if (processedSignatures.size > 1000) {
            const oldSignatures = Array.from(processedSignatures).slice(0, 500);
            oldSignatures.forEach(sig => processedSignatures.delete(sig));
        }

    } catch (error) {
        console.error('❌ Error in transaction monitoring:', error);
    }
}
// Function to resolve pending deposits when users register
async function resolvePendingDeposits(): Promise<void> {
    try {
        console.log('🔄 Checking for pending deposits to resolve...');
        
        // Get all pending deposits
        const { data: pendingDeposits, error: pendingError } = await supabaseService
            .from('pending_deposits')
            .select('*')
            .eq('status', 'pending');

        if (pendingError || !pendingDeposits || pendingDeposits.length === 0) {
            return;
        }

        console.log(`📋 Found ${pendingDeposits.length} pending deposits to check`);

        for (const deposit of pendingDeposits) {
            // Try to find user for this wallet address now
            const { data: userWallet, error: walletError } = await supabaseService
                .from('users_unified')
                .select('*')
                .eq('external_wallet_address', deposit.wallet_address)
                .single();

            if (!walletError && userWallet) {
                // User found! Credit their balance
                const userId = userWallet.user_id;
                const currentBalance = parseFloat(userWallet.custodial_balance) || 0;
                const currentDeposited = parseFloat(userWallet.custodial_total_deposited) || 0;
                const depositAmount = parseFloat(deposit.amount);
                
                const newBalance = currentBalance + depositAmount;
                const newTotalDeposited = currentDeposited + depositAmount;
                
                console.log(`✅ Resolving pending deposit: ${depositAmount} SOL for user ${userId}`);
                
                // Update user balance
                const { error: updateError } = await supabaseService
                    .from('users_unified')
                    .update({
                        custodial_balance: newBalance,
                        custodial_total_deposited: newTotalDeposited,
                        last_custodial_deposit: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', userId);

                if (!updateError) {
                    // Record the deposit
                    await supabaseService
                        .from('custodial_deposits')
                        .insert({
                            user_id: userId,
                            wallet_address: deposit.wallet_address,
                            amount: depositAmount,
                            transaction_signature: deposit.transaction_signature,
                            processed_at: new Date().toISOString(),
                            status: 'completed'
                        });

                    // Mark pending deposit as resolved
                    await supabaseService
                        .from('pending_deposits')
                        .update({ 
                            status: 'resolved',
                            resolved_at: new Date().toISOString(),
                            resolved_user_id: userId
                        })
                        .eq('id', deposit.id);

                    // Update in-memory state if user is loaded
                    const memoryWallet = hybridUserWallets.get(userId);
                    if (memoryWallet) {
                        memoryWallet.custodialBalance = newBalance;
                        memoryWallet.custodialTotalDeposited = newTotalDeposited;
                        memoryWallet.lastCustodialDeposit = Date.now();
                    }

                    // Emit real-time update
                    if (typeof io !== 'undefined') {
                        io.emit('custodialBalanceUpdate', {
                            userId,
                            custodialBalance: newBalance,
                            totalDeposited: newTotalDeposited,
                            depositAmount: depositAmount,
                            transactionSignature: deposit.transaction_signature,
                            timestamp: Date.now()
                        });
                    }

                    console.log(`✅ Resolved pending deposit: ${depositAmount} SOL for user ${userId}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error resolving pending deposits:', error);
    }
}

// Wallet Management Functions
// 🔧 ENHANCED: Better house balance update with error handling
async function updateHouseBalance(): Promise<number> {
    try {
        const config = getCurrentGameConfig();
        const now = Date.now();
        
        // Don't cache for too long when processing deposits
        if (now - lastHouseBalanceUpdate < config.BALANCE_CACHE_DURATION / 2) {
            return houseBalance;
        }

        const balanceResponse = await solanaConnection.getBalance(housePublicKey);
        const newBalance = balanceResponse / LAMPORTS_PER_SOL;
        
        // Only log significant changes
        if (Math.abs(newBalance - houseBalance) > 0.001) {
            console.log(`🏛️ House balance updated: ${houseBalance.toFixed(3)} → ${newBalance.toFixed(3)} SOL`);
        }
        
        houseBalance = newBalance;
        lastHouseBalanceUpdate = now;
        
        return houseBalance;
    } catch (error) {
        console.error('❌ Failed to update house balance:', error);
        return houseBalance; // Return cached value on error
    }
}

async function getUserWalletBalance(walletAddress: string): Promise<number> {
    try {
        const config = getCurrentGameConfig();
        const cached = walletBalances.get(walletAddress);
        const now = Date.now();
        
        if (cached && now - cached.lastUpdated < config.BALANCE_CACHE_DURATION) {
            return cached.balance;
        }

        const publicKey = new PublicKey(walletAddress);
        const balanceResponse = await solanaConnection.getBalance(publicKey);
        const balance = balanceResponse / LAMPORTS_PER_SOL;
        
        walletBalances.set(walletAddress, {
            address: walletAddress,
            balance,
            lastUpdated: now
        });
        
        return balance;
    } catch (error) {
        console.error(`❌ Failed to get balance for ${walletAddress}:`, error);
        return 0;
    }
}

// ===== HYBRID SYSTEM FUNCTIONS =====
// ============================================================================
// UPDATED USER FUNCTIONS - Uses users_unified table
// Replaces the old fragmented table approach
// ============================================================================

async function registerNewUser(walletAddress: string): Promise<string> {
    try {
        // Check if user already exists in users_unified (case-insensitive!)
        const { data: existingUser, error: userCheckError } = await supabaseService
            .from('users_unified')
            .select('id, username')
            .or(`wallet_address.ilike.${walletAddress},external_wallet_address.ilike.${walletAddress},privy_wallet_address.ilike.${walletAddress}`)
            .single();
            
        if (!userCheckError && existingUser) {
            console.log(`✅ User already exists: ${existingUser.username} (${existingUser.id})`);
            return existingUser.id;
        }
        
        // Generate new user ID (UUID)
        const userId = crypto.randomUUID();
        const username = `user_${userId.slice(-8)}`;
        
        console.log(`🆕 Creating new user ${username} for wallet ${walletAddress}`);
        
        // Create user in users_unified table (single table, no fragmentation!)
        const { error: insertError } = await supabaseService
            .from('users_unified')
            .insert({
                id: userId,
                username,
                wallet_address: walletAddress,
                external_wallet_address: walletAddress,
                privy_wallet_address: walletAddress,
                custodial_balance: 0,
                privy_balance: 0,
                embedded_balance: 0,
                total_deposited: 0,
                custodial_total_deposited: 0,
                total_transfers_to_privy: 0,
                total_transfers_from_privy: 0,
                total_transfers_to_embedded: 0,
                total_transfers_to_custodial: 0,
                level: 1,
                experience: 0,
                experience_points: 0,
                experience_to_next_level: 100,
                total_games_played: 0,
                total_bets_placed: 0,
                games_won: 0,
                games_lost: 0,
                total_wagered: 0,
                total_won: 0,
                total_lost: 0,
                average_bet_size: 0,
                largest_win: 0,
                largest_loss: 0,
                best_multiplier: 0,
                daily_profit: 0,
                weekly_profit: 0,
                monthly_profit: 0,
                current_win_streak: 0,
                best_win_streak: 0,
                risk_score: 0,
                behavior_pattern: 'casual',
                preferred_bet_range: 'small',
                badge: 'newcomer',
                badges_earned: [],
                achievements: [],
                chat_level: 0,
                is_chat_moderator: false,
                is_connected: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            
        if (insertError) {
            console.error(`❌ Failed to create user in users_unified:`, insertError);
            throw insertError;
        }
        
        console.log(`✅ Created new user ${username} (${userId}) in users_unified`);
        return userId;
        
    } catch (error) {
        console.error('❌ User registration failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(errorMessage); // ✅ Throw instead of return object
    }
}


// Enhanced function to get or create user by wallet address
async function getOrCreateUser(walletAddress: string): Promise<{ 
    userId: string; 
    isNewUser: boolean; 
    userProfile: any 
}> {
    try {
        // Try to find existing user first using the new unified table
        const { data: existingProfile, error: profileError } = await supabaseService
            .from('users_unified') // ✅ Changed from 'user_profiles'
            .select('id')
            .or(`wallet_address.ilike.${walletAddress},external_wallet_address.ilike.${walletAddress},privy_wallet_address.ilike.${walletAddress}`)
            .single();
            
        if (!profileError && existingProfile) {
            return {
                userId: existingProfile.id, // ✅ Changed from 'user_id' to 'id'
                isNewUser: false,
                userProfile: existingProfile
            };
        }
        
        // User doesn't exist, create new one
        const userId = await registerNewUser(walletAddress);
        
        // Fetch the newly created profile
        const { data: newProfile, error: fetchError } = await supabaseService
            .from('users_unified') // ✅ Changed from 'user_profiles'
            .select('*')
            .eq('id', userId) // ✅ Changed from 'user_id'
            .single();
            
        if (fetchError || !newProfile) {
            throw new Error('Failed to fetch newly created user profile');
        }
        
        return {
            userId,
            isNewUser: true,
            userProfile: newProfile
        };
        
    } catch (error) {
        console.error('❌ Get or create user failed:', error);
        throw error;
    }
}

// Simplified user lookup - no more searching across multiple tables!
async function findUserByWalletAddress(walletAddress: string): Promise<{ userId: string; userProfile: any } | null> {
    try {
        console.log(`🔍 UNIFIED: Searching for user with wallet: ${walletAddress}`);
        
        // Single query across all wallet fields (case-insensitive)
        const { data: user, error } = await supabaseService
            .from('users_unified')
            .select('*')
            .or(`wallet_address.ilike.${walletAddress},external_wallet_address.ilike.${walletAddress},privy_wallet_address.ilike.${walletAddress}`)
            .single();
        
        if (!error && user) {
            console.log(`✅ Found user: ${user.username} (${user.id})`);
            return {
                userId: user.id,
                userProfile: user
            };
        }
        
        console.log(`❌ User not found for wallet: ${walletAddress}`);
        return null;
        
    } catch (error) {
        console.error('❌ Error searching for user:', error);
        return null; // ✅ Return null instead of object
    }
}


// New function for deposit processing (replaces your complex deposit logic)
async function processDeposit(walletAddress: string, amount: number, transactionId?: string): Promise<{
    success: boolean;
    user?: any;
    oldBalance?: number;
    newBalance?: number;
    error?: string;
}> {
    try {
        console.log(`💰 Processing deposit: ${amount} for wallet ${walletAddress}`);
        
        const { data: depositResult, error } = await supabaseService
            .rpc('update_unified_user_balance', {
                p_wallet_address: walletAddress,
                p_custodial_change: amount,
                p_transaction_type: 'deposit',
                p_transaction_id: transactionId || null
            });
        
        if (error) {
            console.error('❌ Deposit function error:', error);
            return { success: false, error: error.message };
        }
        
        if (!depositResult || !depositResult.success) {
            console.log('❌ User not found for deposit wallet:', walletAddress);
            return { success: false, error: 'User not found' };
        }
        
        console.log(`✅ Deposit successful! User: ${depositResult.username}, Balance: ${depositResult.old_balance} → ${depositResult.new_balance}`);
        
        return {
            success: true,
            user: {
                id: depositResult.user_id,
                username: depositResult.username
            },
            oldBalance: depositResult.old_balance,
            newBalance: depositResult.new_balance
        };
        
    } catch (error) {
        console.error('❌ Deposit processing failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return { success: false, error: errorMessage };
    }
}

// New function for balance updates (bets, wins, etc.)
async function updateUserBalanceUnified(params: {
    userId?: string;
    walletAddress?: string;
    custodialChange?: number;
    privyChange?: number;
    embeddedChange?: number;
    transactionType?: string;
    transactionId?: string;
    gameId?: string;
}): Promise<{
    success: boolean;
    user?: any;
    oldBalance?: number;
    newBalance?: number;
    error?: string;
}> {
    try {
        const {
            userId,
            walletAddress,
            custodialChange = 0,
            privyChange = 0,
            embeddedChange = 0,
            transactionType = 'game',
            transactionId,
            gameId
        } = params;
        
        // Determine userId if not provided
        let finalUserId = userId;
        let username = '';
        
        if (!finalUserId && walletAddress) {
            console.log(`🔍 Looking up user by wallet: ${walletAddress}`);
            
            const { data: userData, error: userError } = await supabaseService
                .from('users_unified')
                .select('id, username')
                .or(`external_wallet_address.ilike.${walletAddress},wallet_address.ilike.${walletAddress}`)
                .single();
            
            if (userError || !userData) {
                return { success: false, error: 'User not found for wallet address' };
            }
            
            finalUserId = userData.id;
            username = userData.username;
        }
        
        if (!finalUserId) {
            return { success: false, error: 'Either userId or walletAddress must be provided' };
        }
        
        console.log(`🔄 Updating unified balance for user ${finalUserId}: custodial=${custodialChange}, privy=${privyChange}, embedded=${embeddedChange}`);
        
        // Execute the RPC call with all required parameters
        const { data: result, error } = await supabaseService
            .rpc('update_unified_user_balance', {
                p_user_id: finalUserId,
                p_custodial_change: custodialChange,
                p_privy_change: privyChange,
                p_embedded_change: embeddedChange,
                p_transaction_type: transactionType,
                p_transaction_id: transactionId || null,
                p_game_id: gameId || null,
                p_is_deposit: custodialChange > 0,
                p_deposit_amount: custodialChange > 0 ? custodialChange : 0
            });
        
        if (error) {
            console.error(`❌ Unified balance update error for user ${finalUserId}:`, error);
            return { success: false, error: error.message || 'Balance update failed' };
        }
        
        if (!result || result.length === 0) {
            console.error(`❌ No result returned for user ${finalUserId}`);
            return { success: false, error: 'No result returned from database' };
        }
        
        const firstResult = result[0];
        
        return {
            success: true,
            user: { 
                id: firstResult.user_id || firstResult.id || finalUserId,
                username: firstResult.username || username
            },
            oldBalance: parseFloat(firstResult.old_custodial_balance) || 0,
            newBalance: parseFloat(firstResult.new_custodial_balance) || 0
        };
        
    } catch (error) {
        console.error('❌ Unified balance update failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

async function updateUserBalance(
    walletAddress: string, 
    balanceChange: number, 
    transactionType: string = 'game', 
    transactionId?: string
): Promise<{
    success: boolean;
    user?: any;
    oldBalance?: number;
    newBalance?: number;
    error?: string;
}> {
    return updateUserBalanceUnified({
        walletAddress,
        custodialChange: balanceChange,
        transactionType,
        transactionId,
        gameId: currentGame?.id
    });
}
// New function to get user stats for leaderboards/dashboard
async function getUserStats(userId: string): Promise<any | null> {
    try {
        const { data: user, error } = await supabaseService
            .from('users_unified')
            .select(`
                id, username, avatar, level, experience_points,
                custodial_balance, privy_balance, embedded_balance, total_balance,
                total_deposited, total_wagered, total_won, total_lost, net_profit,
                total_games_played, games_won, games_lost, win_rate,
                current_win_streak, best_win_streak, largest_win, largest_loss,
                daily_profit, weekly_profit, monthly_profit,
                badge, badges_earned, achievements,
                wallet_address, external_wallet_address, privy_wallet_address,
                created_at, last_active
            `)
            .eq('id', userId)
            .single();
        
        if (error) {
            console.error('❌ Failed to get user stats:', error);
            return null;
        }
        
        return user;
        
   
    } catch (error) {
        console.error('❌ Error getting user stats:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Use errorMessage instead of error.message
        return { success: false, error: errorMessage };
    }
}

// Export all functions for easy replacement
export {
    registerNewUser,
    getOrCreateUser,
    findUserByWalletAddress,
    processDeposit,
    updateUserBalance,
    getUserStats
};
// ENHANCED: Function to resolve pending deposits for a specific user
// FIXED: Function to resolve pending deposits for a specific user
// FIXED: Function to resolve pending deposits for a specific user
async function resolvePendingDepositsForUser(walletAddress: string): Promise<void> {
    try {
        console.log(`🔄 Checking for pending deposits for wallet: ${walletAddress}`);
        
        // Get pending deposits for this wallet
        const { data: pendingDeposits, error: pendingError } = await supabaseService
            .from('pending_deposits')
            .select('*')
            .eq('wallet_address', walletAddress)
            .eq('status', 'pending');

        if (pendingError || !pendingDeposits || pendingDeposits.length === 0) {
            return;
        }

        console.log(`📋 Found ${pendingDeposits.length} pending deposits for ${walletAddress}`);

        for (const deposit of pendingDeposits) {
            try {
                // Get the user (should exist now)
                const userResult = await getOrCreateUser(walletAddress);
                const userId = userResult.userId;
                const depositAmount = parseFloat(deposit.amount);
                
                console.log(`✅ Resolving pending deposit: ${depositAmount} SOL for user ${userId}`);
                
                // Use the RPC function to update balance
                const { data: balanceResult, error: balanceError } = await supabaseService
            
                    .rpc('update_unified_user_balance', {  // ✅ Change function name
                        p_user_id: userId,
                        p_custodial_change: depositAmount,
                        p_privy_change: 0,
                        p_embedded_change: 0,
                        p_transaction_type: 'pending_deposit_resolved',
                        p_transaction_id: 'pending_deposit_resolved',
                        p_game_id: currentGame?.id,
                        p_is_deposit: true,  // or true for deposits
                        p_deposit_amount: depositAmount   // or actual deposit amount
                    });
                if (!balanceError && balanceResult) {
                    // FIXED: Get all the required variables from the RPC response
                    const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);
                    const newTotalBalance = parseFloat(balanceResult[0].new_total_balance || balanceResult[0].new_custodial_balance);
                    const newTotalDeposited = parseFloat(balanceResult[0].new_total_deposited || balanceResult[0].new_custodial_balance);
                    
                    // Mark pending deposit as resolved
                    await supabaseService
                        .from('pending_deposits')
                        .update({ 
                            status: 'resolved',
                            resolved_at: new Date().toISOString(),
                            resolved_user_id: userId
                        })
                        .eq('id', deposit.id);

                    // FIXED: Emit real-time update with proper variables - KEEP THESE SOCKET UPDATES!
                    io.emit('custodialBalanceUpdate', {
                        userId,
                        custodialBalance: newCustodialBalance,
                        totalBalance: newTotalBalance,
                        totalDeposited: newTotalDeposited,
                        depositAmount: depositAmount, // ✅ Fixed variable name
                        transactionSignature: deposit.transaction_signature, // ✅ Fixed variable name
                        timestamp: Date.now(),
                        source: 'pending_deposit_resolved', // ✅ Fixed source name
                        isNewUser: userResult.isNewUser,
                        walletAddress: walletAddress, // ✅ Fixed variable name
                        updateType: 'pending_deposit_resolved'
                    });

                    // KEEP THIS SOCKET UPDATE TOO!
                    io.emit('userBalanceUpdate', {
                        userId,
                        walletAddress: walletAddress,
                        balanceType: 'custodial',
                        oldBalance: newCustodialBalance - depositAmount,
                        newBalance: newCustodialBalance,
                        change: depositAmount,
                        transactionType: 'pending_deposit',
                        transactionSignature: deposit.transaction_signature,
                        timestamp: Date.now(),
                        source: 'pending_deposit_resolved'
                    });

                    console.log(`✅ Resolved pending deposit: ${depositAmount} SOL for user ${userId}`);
                }
                
            } catch (depositError) {
                console.error(`❌ Failed to resolve pending deposit ${deposit.id}:`, depositError);
            }
        }
        
    } catch (error) {
        console.error(`❌ Error resolving pending deposits for ${walletAddress}:`, error);
    }
}

async function initializeHybridSystem(): Promise<void> {
    try {
        console.log('🔄 Initializing hybrid wallet system...');
        
        const { data: hybridWallets, error } = await supabaseService
            .from('users_unified')
            .select('*');

        if (!error && hybridWallets) {
            hybridWallets.forEach((wallet: any) => {
                hybridUserWallets.set(wallet.user_id, {
                    userId: wallet.user_id,
                    externalWalletAddress: wallet.external_wallet_address,
                    custodialBalance: parseFloat(wallet.custodial_balance) || 0,
                    custodialTotalDeposited: parseFloat(wallet.custodial_total_deposited) || 0,
                    lastCustodialDeposit: wallet.last_custodial_deposit ? new Date(wallet.last_custodial_deposit).getTime() : 0,
                    embeddedWalletId: wallet.embedded_wallet_id,
                    embeddedBalance: parseFloat(wallet.embedded_balance) || 0,
                    lastEmbeddedWithdrawal: wallet.last_embedded_withdrawal ? new Date(wallet.last_embedded_withdrawal).getTime() : 0,
                    lastTransferBetweenWallets: wallet.last_transfer_between_wallets ? new Date(wallet.last_transfer_between_wallets).getTime() : 0,
                    totalTransfersToEmbedded: parseFloat(wallet.total_transfers_to_embedded) || 0,
                    totalTransfersToCustodial: parseFloat(wallet.total_transfers_to_custodial) || 0,
                    createdAt: new Date(wallet.created_at).getTime()
                });
            });
            
            updateHybridSystemStats();
            console.log(`✅ Loaded ${hybridWallets.length} hybrid wallets`);
        } else {
            console.log('📝 No existing hybrid wallets found - starting fresh');
        }
    } catch (error) {
        console.warn('⚠️ Could not load hybrid wallets:', error);
    }
}

async function saveHybridWallet(wallet: HybridUserWallet): Promise<void> {
    try {
        await supabaseService
            .from('users_unified')
            .upsert({
                user_id: wallet.userId,
                external_wallet_address: wallet.externalWalletAddress,
                custodial_balance: wallet.custodialBalance,
                custodial_total_deposited: wallet.custodialTotalDeposited,
                last_custodial_deposit: wallet.lastCustodialDeposit > 0 ? new Date(wallet.lastCustodialDeposit).toISOString() : null,
                embedded_wallet_id: wallet.embeddedWalletId,
                embedded_balance: wallet.embeddedBalance,
                last_embedded_withdrawal: wallet.lastEmbeddedWithdrawal > 0 ? new Date(wallet.lastEmbeddedWithdrawal).toISOString() : null,
                last_transfer_between_wallets: wallet.lastTransferBetweenWallets > 0 ? new Date(wallet.lastTransferBetweenWallets).toISOString() : null,
                total_transfers_to_embedded: wallet.totalTransfersToEmbedded,
                total_transfers_to_custodial: wallet.totalTransfersToCustodial,
                updated_at: new Date().toISOString()
            });
    } catch (error) {
        console.warn('⚠️ Failed to save hybrid wallet:', error);
    }
}

// ===== CUSTODIAL DEPOSIT FUNCTION (FIXED) =====
async function depositToCustodialBalance(
    userId: string,
    externalWalletAddress: string,
    depositAmount: number,
    signedTransaction?: string
): Promise<{ success: boolean; custodialBalance?: number; error?: string; unsignedTransaction?: string }> {
    try {
        console.log(`💰 CUSTODIAL DEPOSIT: ${depositAmount} SOL from ${userId}`);
        
        if (!signedTransaction) {
            // Step 1: Create unsigned transaction for user to sign
            const userPublicKey = new PublicKey(externalWalletAddress);
            const transaction = await createTransaction(userPublicKey, housePublicKey, depositAmount);
            
            const { blockhash } = await solanaConnection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPublicKey;
            
            // Add memo to prevent replay attacks
            const memo = `custodial-deposit-${userId}-${Date.now()}`;
            transaction.add(
                new TransactionInstruction({
                    keys: [],
                    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
                    data: Buffer.from(memo, 'utf8')
                })
            );
            
            const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
            const base64Transaction = serializedTransaction.toString('base64');
            
            return { 
                success: false, 
                error: 'Transaction created - user must sign',
                unsignedTransaction: base64Transaction 
            };
        }

        // Step 2: Process signed transaction
        const transactionBuffer = Buffer.from(signedTransaction, 'base64');
        
        // Submit to blockchain (we'll validate on blockchain instead of pre-validating)
        const signature = await solanaConnection.sendRawTransaction(
            transactionBuffer,
            { skipPreflight: false, preflightCommitment: 'confirmed' }
        );
        
        // Wait for confirmation
        const confirmation = await Promise.race([
            solanaConnection.confirmTransaction(signature, 'confirmed'),
            new Promise<any>((_, reject) => 
                setTimeout(() => reject(new Error('Transaction timeout')), 30000)
            )
        ]);
        
        // Check if confirmation has error
        if (confirmation && confirmation.value && confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`✅ Transaction confirmed: ${signature}`);
        
        // Update custodial balance
        let userWallet = hybridUserWallets.get(userId);
        if (!userWallet) {
            userWallet = {
                userId,
                externalWalletAddress,
                custodialBalance: 0,
                custodialTotalDeposited: 0,
                lastCustodialDeposit: 0,
                embeddedWalletId: undefined,
                embeddedBalance: 0,
                lastEmbeddedWithdrawal: 0,
                lastTransferBetweenWallets: 0,
                totalTransfersToEmbedded: 0,
                totalTransfersToCustodial: 0,
                createdAt: Date.now()
            };
        }
        
        userWallet.custodialBalance += depositAmount;
        userWallet.custodialTotalDeposited += depositAmount;
        userWallet.lastCustodialDeposit = Date.now();
        hybridUserWallets.set(userId, userWallet);
        
        // Save to database
        await saveHybridWallet(userWallet);
        updateHybridSystemStats();
        
        // Update house balance
        await updateHouseBalance();
        
        console.log(`✅ CUSTODIAL DEPOSIT: ${depositAmount} SOL → Balance: ${userWallet.custodialBalance.toFixed(3)} SOL (${signature})`);
        
        return { 
            success: true, 
            custodialBalance: userWallet.custodialBalance
        };
        
    } catch (error) {
        console.error('❌ Custodial deposit failed:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Deposit failed' 
        };
    }
}

function updateHybridSystemStats(): void {
    const wallets = Array.from(hybridUserWallets.values());
    hybridSystemStats = {
        totalUsers: wallets.length,
        totalCustodialBalance: wallets.reduce((sum, w) => sum + w.custodialBalance, 0),
        totalEmbeddedBalance: wallets.reduce((sum, w) => sum + w.embeddedBalance, 0),
        activeGamingUsers: wallets.filter(w => w.custodialBalance > 0.001).length,
        totalTransfers: wallets.reduce((sum, w) => sum + w.totalTransfersToEmbedded + w.totalTransfersToCustodial, 0)
    };
}

// 🔧 NEW: Helper function to sync user balance from database
async function syncUserBalanceFromDatabase(userId: string): Promise<number> {
    try {
        console.log(`🔄 Syncing balance from unified table for user ${userId}...`);
        
        const { data: freshUserData, error } = await supabaseService
            .from('users_unified') // ✅ Changed from 'user_hybrid_wallets'
            .select('*')
            .eq('id', userId) // ✅ Changed from 'user_id'
            .single();

        if (error || !freshUserData) {
            console.warn(`❌ Failed to sync balance for user ${userId}:`, error);
            return 0;
        }

        // Update in-memory wallet with fresh data from unified table
        let userWallet = hybridUserWallets.get(userId);
        if (!userWallet) {
            // Create new wallet record if it doesn't exist
            userWallet = {
                userId,
                externalWalletAddress: freshUserData.external_wallet_address || freshUserData.wallet_address,
                custodialBalance: parseFloat(freshUserData.custodial_balance) || 0,
                custodialTotalDeposited: parseFloat(freshUserData.custodial_total_deposited) || 0,
                lastCustodialDeposit: freshUserData.last_custodial_deposit ? new Date(freshUserData.last_custodial_deposit).getTime() : 0,
                embeddedWalletId: freshUserData.embedded_wallet_id,
                embeddedBalance: parseFloat(freshUserData.embedded_balance) || 0,
                lastEmbeddedWithdrawal: freshUserData.last_embedded_withdrawal ? new Date(freshUserData.last_embedded_withdrawal).getTime() : 0,
                lastTransferBetweenWallets: freshUserData.last_transfer_between_wallets ? new Date(freshUserData.last_transfer_between_wallets).getTime() : 0,
                totalTransfersToEmbedded: parseFloat(freshUserData.total_transfers_to_embedded) || 0,
                totalTransfersToCustodial: parseFloat(freshUserData.total_transfers_to_custodial) || 0,
                createdAt: new Date(freshUserData.created_at).getTime()
            };
        } else {
            // Update existing wallet with fresh data
            userWallet.custodialBalance = parseFloat(freshUserData.custodial_balance) || 0;
            userWallet.custodialTotalDeposited = parseFloat(freshUserData.custodial_total_deposited) || 0;
            userWallet.embeddedBalance = parseFloat(freshUserData.embedded_balance) || 0;
            userWallet.totalTransfersToEmbedded = parseFloat(freshUserData.total_transfers_to_embedded) || 0;
            userWallet.totalTransfersToCustodial = parseFloat(freshUserData.total_transfers_to_custodial) || 0;
        }

        hybridUserWallets.set(userId, userWallet);
        console.log(`✅ Balance synced for ${userId}: ${userWallet.custodialBalance.toFixed(3)} SOL from unified table`);
        
        return userWallet.custodialBalance;
    } catch (error) {
        console.error(`❌ Failed to sync balance for user ${userId}:`, error);
        return 0;
    }
}

// ===== INSTANT CUSTODIAL BETTING =====
async function placeBetFromCustodialBalance(
    userId: string,
    betAmount: number
): Promise<{ success: boolean; reason?: string; entryMultiplier?: number; custodialBalance?: number }> {
    const config = getCurrentGameConfig();
    
    console.log(`🎯 CUSTODIAL BET: ${betAmount} SOL from user ${userId}`);

    // Check game availability
    if (!currentGame || (currentGame.status !== 'active' && currentGame.status !== 'waiting')) {
        return { success: false, reason: 'Game not available' };
    }

    if (currentGame.status === 'waiting' && countdownTimeRemaining <= 2) {
        return { success: false, reason: 'Too late to place bet' };
    }

    // 🔧 NEW: Get FRESH user profile from unified table (single source of truth)
    let userProfile;
    try {
        console.log(`🔄 Loading user profile from unified table for ${userId}...`);
        
        const { data: profileData, error } = await supabaseService
    .from('users_unified')
    .select('id, username, custodial_balance, privy_balance, total_balance, external_wallet_address, level')
    .eq('id', userId)
    .single();


        if (error || !profileData) {
            console.error(`❌ User profile not found for ${userId}:`, error);
            return { success: false, reason: 'User profile not found - please register first' };
        }

        userProfile = {
            userId: profileData.id, // ✅ Changed from user_id to id
            username: profileData.username,
            custodialBalance: parseFloat(profileData.custodial_balance) || 0,
            privyBalance: parseFloat(profileData.privy_balance) || 0,
            totalBalance: parseFloat(profileData.total_balance) || 0,
            externalWalletAddress: profileData.external_wallet_address,
            level: profileData.level || 1
        };

        console.log(`💰 Fresh profile loaded: ${userProfile.custodialBalance.toFixed(3)} SOL custodial balance for ${userId}`);
        
    } catch (error) {
        console.error(`❌ Database error loading user profile for ${userId}:`, error);
        return { success: false, reason: 'Database error loading user profile' };
    }

    // Check sufficient custodial balance (now using fresh data from unified table!)
    if (userProfile.custodialBalance < betAmount) {
        console.log(`❌ Insufficient balance: ${userProfile.custodialBalance.toFixed(3)} SOL < ${betAmount} SOL`);
        return { 
            success: false, 
            reason: `Insufficient custodial balance: ${userProfile.custodialBalance.toFixed(3)} SOL available, need ${betAmount} SOL`,
            custodialBalance: userProfile.custodialBalance
        };
    }

    // Validate bet amount
    if (betAmount < config.MIN_BET || betAmount > config.MAX_BET) {
        return { success: false, reason: `Bet must be between ${config.MIN_BET} and ${config.MAX_BET} SOL` };
    }

    // Check if user already has active bet
    const existingBet = currentGame.activeBets.get(userProfile.externalWalletAddress);
if (existingBet && !existingBet.cashedOut && existingBet.isValid) {
    return { success: false, reason: 'Already has active bet' };
}

    try {
        // INSTANT RUG PULL CHECK
        if (betAmount > config.INSTANT_RUG_THRESHOLD) {
            console.log(`🚨💥 CUSTODIAL INSTANT RUG: ${betAmount} SOL > ${config.INSTANT_RUG_THRESHOLD} SOL!`);
            
            // 🔧 NEW: Use atomic balance update function
            const { data: balanceResult, error: balanceError } = await supabaseService
            
        
                .rpc('update_unified_user_balance', {  // ✅ Change function name
                    p_user_id: userId,
                    p_custodial_change: -betAmount,
                    p_privy_change: 0,
                    p_embedded_change: 0,
                    p_transaction_type: 'instant_rug_bet',
                    p_transaction_id: 'instant_rug_bet',
                    p_game_id: currentGame?.id,
                    p_is_deposit: false,  // or true for deposits
                    p_deposit_amount: 0   // or actual deposit amount
                });
            if (balanceError || !balanceResult || balanceResult.length === 0) {
                console.error(`❌ Failed to update balance for instant rug bet ${userId}:`, balanceError);
                return { success: false, reason: 'Failed to process bet' };
            }

            const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);
            
            // Add bet to game
            const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier;
            const bet: PlayerBet = {
                userId,
                walletAddress: userProfile.externalWalletAddress,
                betAmount,
                placedAt: Date.now(),
                entryMultiplier,
                maxPayout: betAmount * BET_VALIDATION.MAX_PAYOUT_MULTIPLIER,
                isValid: true,
                transactionId: `custodial_instant_rug_${Date.now()}_${userId}`,
                betCollected: true,
                payoutProcessed: false
            };

            currentGame.activeBets.set(userProfile.externalWalletAddress, bet);
            currentGame.totalBets += betAmount;
currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;

// 🎭 Simulate additional betting activity
simulateBetActivity(betAmount);
console.log(`💰 Bet placed: ${betAmount} SOL real + ${artificialLiquidity.toFixed(3)} SOL artificial = ${currentGame.boostedTotalBets.toFixed(3)} SOL total display`);
            currentGame.totalPlayers = currentGame.activeBets.size;
            currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;

            simulateBetActivity(betAmount);

console.log(`💰 Bet placed: ${betAmount} SOL real + ${artificialLiquidity.toFixed(3)} SOL artificial = ${currentGame.boostedTotalBets.toFixed(3)} SOL total display`);
            // Update game stats in unified table
            await supabaseService.rpc('update_user_game_stats', {
                p_user_id: userId,
                p_bet_amount: betAmount,
                p_won: false, // Will lose due to instant rug
                p_payout: 0,
                p_multiplier: 0
            });
            
            // Crash game immediately
            // 🎭 Update artificial count after crash (simulate players leaving/joining)
setTimeout(() => {
    updateArtificialCounts();

}, 2000);
            setTimeout(() => {
                if (currentGame) crashGame();
            }, 1000);
            
            return { 
                success: true, 
                entryMultiplier,
                custodialBalance: newCustodialBalance,
                reason: 'Bet placed - HIGH RISK!' 
            };
        }

        // NORMAL CUSTODIAL BET
        const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier;
        
        // 🔧 NEW: Use atomic balance update function for normal bet
        const { data: balanceResult, error: balanceError } = await supabaseService
            
            .rpc('update_unified_user_balance', {  // ✅ Change function name
                p_user_id: userId,
                p_custodial_change: -betAmount,
                p_privy_change: 0,
                p_embedded_change: 0,
                p_transaction_type: 'custodial_bet',
                p_transaction_id: 'custodial_bet',
                p_game_id: currentGame?.id,
                p_is_deposit: true,  // or true for deposits
                p_deposit_amount: 0   // or actual deposit amount
            });
        if (balanceError || !balanceResult || balanceResult.length === 0) {
            console.error(`❌ Failed to update balance for bet ${userId}:`, balanceError);
            return { success: false, reason: 'Failed to process bet' };
        }

        const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);
        console.log(`💰 Balance updated: ${userProfile.custodialBalance.toFixed(3)} → ${newCustodialBalance.toFixed(3)} SOL`);
        
        // Create bet
        const bet: PlayerBet = {
            userId,
            walletAddress: userProfile.externalWalletAddress,
            betAmount,
            placedAt: Date.now(),
            entryMultiplier,
            maxPayout: betAmount * BET_VALIDATION.MAX_PAYOUT_MULTIPLIER,
            isValid: true,
            transactionId: `custodial_${Date.now()}_${userId}`,
            betCollected: true,
            payoutProcessed: false
        };

        currentGame.activeBets.set(userProfile.externalWalletAddress, bet);
        currentGame.totalBets += betAmount;
        // After: currentGame.totalBets += betAmount;
currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;

// 🎭 Simulate additional betting activity
simulateBetActivity(betAmount);

console.log(`💰 Bet placed: ${betAmount} SOL real + ${artificialLiquidity.toFixed(3)} SOL artificial = ${currentGame.boostedTotalBets.toFixed(3)} SOL total display`);


        // Update trading state
        tradingState.totalBetsSinceStart += betAmount;
        if (betAmount >= config.HIGH_BET_THRESHOLD) {
            tradingState.highBetCount++;
            tradingState.volatility *= 1.5;
        }

        console.log(`⚡ CUSTODIAL BET PLACED: ${betAmount} SOL, entry ${entryMultiplier}x, remaining: ${newCustodialBalance.toFixed(3)} SOL`);

         // Save bet to database
         try {
            await supabaseService
                .from('player_bets')
                .insert({
                    game_id: currentGame.id,
                    user_id: userId,
                    wallet_address: userProfile.externalWalletAddress,
                    bet_amount: betAmount,
                    entry_multiplier: entryMultiplier,
                    status: 'active',
                    placed_at: new Date().toISOString(),
                    bet_type: 'custodial',
                    transaction_id: bet.transactionId,
                    bet_collected: true
                });
        } catch (dbError) {
            console.warn('Bet database save failed (non-critical):', dbError);
        }

        // 🔧 FIXED: Return the proper response format
        return { 
        success: true, 
        entryMultiplier,
        custodialBalance: newCustodialBalance,
        reason: 'Bet placed successfully'
    };

} catch (error) {
    console.error('❌ Custodial bet failed:', error);
    
        
    try {
        await supabaseService.rpc('update_unified_user_balance', {
            p_user_id: userId,
            p_custodial_change: betAmount, // Refund
            p_privy_change: 0,
            p_embedded_change: 0,
            p_transaction_type: 'bet_refund',
            p_transaction_id: 'bet_refund',
            p_game_id: currentGame?.id,
            p_is_deposit: false,
            p_deposit_amount: 0
        });
        console.log(`💰 Refunded ${betAmount} SOL to user ${userId} due to error`);
    } catch (refundError) {
        console.error(`❌ Failed to refund ${userId}:`, refundError);
    }
    
    return { 
        success: false, 
        reason: error instanceof Error ? error.message : 'Server error processing bet',
        custodialBalance: userProfile.custodialBalance 
    };
}
}

// ===== INSTANT CUSTODIAL CASHOUT =====
async function cashOutToCustodialBalance(
    userId: string,
    walletAddress: string
): Promise<{ success: boolean; payout?: number; custodialBalance?: number; reason?: string }> {
    console.log(`💸 CUSTODIAL CASHOUT: User ${userId} attempting cashout`);

    // Check game state
    if (!currentGame || currentGame.status !== 'active') {
        return { success: false, reason: 'Game not active' };
    }

    // Find the bet
    const bet = currentGame.activeBets.get(walletAddress);
    if (!bet || bet.cashedOut || !bet.isValid || !bet.betCollected) {
        return { success: false, reason: 'No valid active bet found' };
    }

    // Check if this is a custodial bet
    if (!bet.transactionId?.startsWith('custodial_')) {
        return { success: false, reason: 'Not a custodial bet - use regular cashout' };
    }

    // Validate hold time
    const holdTime = Date.now() - bet.placedAt;
    if (holdTime < BET_VALIDATION.MIN_HOLD_TIME) {
        return { 
            success: false, 
            reason: `Must wait ${(BET_VALIDATION.MIN_HOLD_TIME - holdTime) / 1000}s before cashing out` 
        };
    }

    try {
        const config = getCurrentGameConfig();
        const cashoutMultiplier = currentGame.currentMultiplier;
        
        // Calculate payout
        const growthRatio = cashoutMultiplier / bet.entryMultiplier;
        const rawPayout = bet.betAmount * growthRatio;
        const payoutWithHouseEdge = rawPayout * (1 - config.HOUSE_EDGE);
        const finalPayout = Math.min(payoutWithHouseEdge, config.MAX_SINGLE_PAYOUT);
        const safePayout = Math.max(0, finalPayout);
        
        console.log(`💰 CUSTODIAL CASHOUT CALCULATION:
   Bet: ${bet.betAmount} SOL @ ${bet.entryMultiplier}x
   Current: ${cashoutMultiplier}x
   Growth: ${growthRatio.toFixed(3)}x
   Payout: ${safePayout.toFixed(3)} SOL`);

        // Check for payout limits
        if (payoutWithHouseEdge > config.MAX_SINGLE_PAYOUT) {
            console.log(`🚨 CUSTODIAL CASHOUT RUG: ${payoutWithHouseEdge.toFixed(3)} SOL > ${config.MAX_SINGLE_PAYOUT} SOL limit`);
            
           
            // Mark bet as cashed out
bet.cashedOut = true;
bet.cashoutMultiplier = cashoutMultiplier;
bet.cashoutAmount = safePayout;
bet.cashoutTime = Date.now();
bet.payoutProcessed = true;

currentGame.activeBets.delete(walletAddress);
console.log(`🗑️ Removed cashed out bet for ${walletAddress} from active bets`);

// Also update the player count
currentGame.totalPlayers = currentGame.activeBets.size;
            
            // Crash the game
            setTimeout(() => {
                if (currentGame) crashGame();
            }, 500);
            
            return { success: false, reason: 'Payout limit exceeded - game crashed' };
        }

        // 🔧 NEW: Use atomic balance update for payout
        const { data: balanceResult, error: balanceError } = await supabaseService
        
            .rpc('update_unified_user_balance', {  // ✅ Change function name
                p_user_id: userId,
                p_custodial_change: safePayout,
                p_privy_change: 0,
                p_embedded_change: 0,
                p_transaction_type: 'custodial_cashout',
                p_transaction_id: 'custodial_cashout',
                p_game_id: currentGame?.id,
                p_is_deposit: true,  // or true for deposits
                p_deposit_amount: 0   // or actual deposit amount
            });

        if (balanceError || !balanceResult || balanceResult.length === 0) {
            console.error(`❌ Failed to update balance for cashout ${userId}:`, balanceError);
            return { success: false, reason: 'Failed to process cashout' };
        }

        const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);

        // Mark bet as cashed out
        bet.cashedOut = true;
        bet.cashoutMultiplier = cashoutMultiplier;
        bet.cashoutAmount = safePayout;
        bet.cashoutTime = Date.now();
        bet.payoutProcessed = true;

        // 🎭 Simulate liquidity reduction from cashout
simulateCashoutActivity(safePayout);
console.log(`💸 Cashout: ${safePayout.toFixed(3)} SOL - Artificial liquidity now: ${artificialLiquidity.toFixed(3)} SOL`);

        const profit = safePayout - bet.betAmount;
        const isLoss = cashoutMultiplier < bet.entryMultiplier;

        // Update game stats in unified table
        await supabaseService.rpc('update_user_game_stats', {
            p_user_id: userId,
            p_bet_amount: bet.betAmount,
            p_won: true,
            p_payout: safePayout,
            p_multiplier: cashoutMultiplier
        });

        console.log(`⚡ CUSTODIAL CASHOUT SUCCESS: 
   Payout: ${safePayout.toFixed(3)} SOL
   Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(3)} SOL
   New balance: ${newCustodialBalance.toFixed(3)} SOL`);

   // 🎭 Simulate liquidity reduction from cashout
simulateCashoutActivity(safePayout);
console.log(`💸 Cashout: ${safePayout.toFixed(3)} SOL - Artificial liquidity now: ${artificialLiquidity.toFixed(3)} SOL`);

        // Save cashout to database
        try {
            if (!currentGame.id.startsWith('memory-')) {
                await supabaseService
                    .from('player_bets')
                    .update({
                        cashout_multiplier: cashoutMultiplier,
                        cashout_amount: safePayout,
                        profit_loss: profit,
                        status: isLoss ? 'cashed_out_loss' : 'cashed_out_profit',
                        cashed_out_at: new Date().toISOString()
                    })
                    .eq('game_id', currentGame.id)
                    .eq('wallet_address', walletAddress);
            }
        } catch (dbError) {
            console.warn('Custodial cashout database save failed (non-critical):', dbError);
        }

        // Emit success event
        io.emit('custodialCashout', {
            gameId: currentGame.id,
            userId,
            walletAddress,
            entryMultiplier: bet.entryMultiplier,
            cashoutMultiplier,
            growthRatio,
            amount: safePayout,
            profit,
            isLoss,
            custodialBalance: newCustodialBalance,
            timestamp: Date.now()
        });

        return { 
            success: true, 
            payout: safePayout,
            custodialBalance: newCustodialBalance 
        };

    } catch (error) {
        console.error('❌ Custodial cashout failed:', error);
        return { 
            success: false, 
            reason: 'Server error during cashout' 
        };
    }
}

async function syncUserBalanceAfterTransaction(
    userId: string, 
    transactionType: string,
    amount: number,
    gameId?: string
): Promise<void> {
    try {
        // Get current balance from database
        const { data: currentBalance } = await supabaseService
            .from('users_unified')
            .select('custodial_balance')
            .eq('id', userId)
            .single();

        // Update in-memory cache
        const userWallet = hybridUserWallets.get(userId);
        if (userWallet && currentBalance) {
            userWallet.custodialBalance = parseFloat(currentBalance.custodial_balance) || 0;
            hybridUserWallets.set(userId, userWallet);
        }

        // Log transaction
        console.log(`💰 Balance sync: ${userId} - ${transactionType} ${amount} SOL - New balance: ${userWallet?.custodialBalance || 0} SOL`);
        
        // Emit real-time balance update
        io.emit('balanceUpdate', {
            userId,
            custodialBalance: userWallet?.custodialBalance || 0,
            transactionType,
            amount,
            gameId,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error(`❌ Failed to sync balance for ${userId}:`, error);
    }
}

async function createTransaction(
    fromPubkey: PublicKey,
    toPubkey: PublicKey,
    amount: number
): Promise<Transaction> {
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction();
    
    transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1000,
        })
    );
    
    transaction.add(
        SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports
        })
    );
    
    return transaction;
}

// Enhanced collectBetFromUser with production-ready validation
async function collectBetFromUser(
    userWallet: string, 
    betAmount: number, 
    gameId: string, 
    userId?: string,
    signedTransaction?: string
): Promise<{ success: boolean; transactionId?: string; error?: string; unsignedTransaction?: string }> {
    try {
        if (signedTransaction) {
            console.log(`💰 Processing signed transaction from ${userWallet}`);
            
            const transactionBuffer = Buffer.from(signedTransaction, 'base64');
            const transaction = Transaction.from(transactionBuffer);
            
            // Enhanced validation
            const transferInstruction = transaction.instructions.find(
                ix => ix.programId.equals(SystemProgram.programId)
            );
            
            if (!transferInstruction) {
                throw new Error('No transfer instruction found in transaction');
            }
            
            const transferData = decodeTransferInstruction(transferInstruction);
            
            if (!transferData.fromPubkey.equals(new PublicKey(userWallet))) {
                throw new Error(`Transaction sender mismatch: expected ${userWallet}, got ${transferData.fromPubkey.toString()}`);
            }
            
            if (!transferData.toPubkey.equals(housePublicKey)) {
                throw new Error(`Transaction receiver mismatch: expected ${housePublicKey.toString()}, got ${transferData.toPubkey.toString()}`);
            }
            
            const transactionAmount = transferData.lamports / LAMPORTS_PER_SOL;
            const tolerance = 0.001;
            if (Math.abs(transactionAmount - betAmount) > tolerance) {
                throw new Error(`Amount mismatch: expected ${betAmount} SOL, got ${transactionAmount} SOL`);
            }
            
            console.log(`✅ Transaction validation passed: ${transactionAmount} SOL from ${userWallet} to ${housePublicKey.toString()}`);
            
            const signature = await solanaConnection.sendRawTransaction(
                transactionBuffer,
                {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed'
                }
            );
            
            const confirmation = await Promise.race([
                solanaConnection.confirmTransaction(signature, 'confirmed'),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000)
                )
            ]) as TransactionConfirmation;
            
            if (confirmation?.value?.err) {
                throw new Error(`Transaction failed on blockchain: ${JSON.stringify(confirmation.value.err)}`);
            }
            
            console.log(`✅ Bet collected: ${betAmount} SOL from ${userWallet} (${signature})`);
            
            await updateHouseBalance();
            
            return { 
                success: true, 
                transactionId: signature 
            };
            
        } else {
            console.log(`📝 Creating unsigned transaction for ${betAmount} SOL from ${userWallet}`);
            
            const userPublicKey = new PublicKey(userWallet);
            const transaction = await createTransaction(userPublicKey, housePublicKey, betAmount);
            
            const { blockhash } = await solanaConnection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPublicKey;
            
            // Add memo to prevent replay attacks
            const memo = `bet-${gameId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            transaction.add(
                new TransactionInstruction({
                    keys: [],
                    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
                    data: Buffer.from(memo, 'utf8')
                })
            );
            
            const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
            const base64Transaction = serializedTransaction.toString('base64');
            
            return { 
                success: false, 
                error: 'Transaction created - user must sign',
                unsignedTransaction: base64Transaction 
            };
        }
        
    } catch (error) {
        console.error('❌ Bet collection failed:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        };
    }
}

async function payoutToUser(
    userWallet: string, 
    payoutAmount: number, 
    gameId: string, 
    userId?: string
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
        const config = getCurrentGameConfig();
        
        const currentHouseBalance = await updateHouseBalance();
        if (currentHouseBalance < payoutAmount + config.MIN_HOUSE_BALANCE) {
            throw new Error(`Insufficient house balance: ${currentHouseBalance.toFixed(3)} SOL available, need ${(payoutAmount + config.MIN_HOUSE_BALANCE).toFixed(3)} SOL`);
        }

        const cappedPayout = Math.min(payoutAmount, config.MAX_SINGLE_PAYOUT);
        if (cappedPayout < payoutAmount) {
            console.log(`⚠️ Payout capped: ${payoutAmount.toFixed(3)} SOL → ${cappedPayout.toFixed(3)} SOL`);
        }

        const userPublicKey = new PublicKey(userWallet);
        const transaction = await createTransaction(housePublicKey, userPublicKey, cappedPayout);
        
        const { blockhash } = await solanaConnection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = housePublicKey;
        
        transaction.sign(houseWallet);
        const signature = await solanaConnection.sendRawTransaction(transaction.serialize());
        
        await solanaConnection.confirmTransaction(signature, 'confirmed');
        
        console.log(`💸 Payout sent: ${cappedPayout.toFixed(3)} SOL to ${userWallet} (${signature})`);
        
        await updateHouseBalance();
        
        return { 
            success: true, 
            transactionId: signature 
        };
        
    } catch (error) {
        console.error('❌ Payout failed:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        };
    }
}

function calculateMaxPayoutCapacity(): number {
    const config = getCurrentGameConfig();
    const availableBalance = Math.max(0, houseBalance - config.MIN_HOUSE_BALANCE);
    return availableBalance * 0.8;
}

function getCurrentMaxSafe(): number {
    if (!currentGame) return 100;
    
    const config = getCurrentGameConfig();
    
    if (currentGame.totalBets === 0) {
        return config.MAX_MULTIPLIER;
    }
    
    const availableBalance = Math.max(0, houseBalance - config.MIN_HOUSE_BALANCE);
    
    if (availableBalance < 1) {
        console.log(`🚨 EMERGENCY: Very low house balance, capping multiplier`);
        return Math.max(1.2, currentGame.currentMultiplier * 1.05);
    }
    
    let totalRisk = 0;
    for (const [_, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            const worstCasePayout = bet.betAmount * (config.MAX_MULTIPLIER / bet.entryMultiplier) * (1 - config.HOUSE_EDGE);
            totalRisk += Math.min(worstCasePayout, config.MAX_SINGLE_PAYOUT);
        }
    }
    
    if (totalRisk > availableBalance * 2) {
        const safeCap = Math.max(5, currentGame.currentMultiplier * 1.5);
        console.log(`🛡️ Risk management: Total risk ${totalRisk.toFixed(2)} SOL, capping at ${safeCap.toFixed(2)}x`);
        return safeCap;
    }
    
    return config.MAX_MULTIPLIER;
}

// Enhanced crash point calculation

// Modify calculateControlledCrashPoint function to include FOMO check
// Replace the existing calculateControlledCrashPoint function (around line 1750)
function calculateControlledCrashPoint(seed: string, gameNumber: number): number {
    const config = getCurrentGameConfig();
    
    // Check for extreme multiplier event FIRST (existing system)
    const extremeCheck = shouldTriggerExtremeMultiplier(gameNumber);
    if (extremeCheck.trigger && extremeCheck.targetMultiplier) {
        console.log(`🎆 EXTREME EVENT: Game ${gameNumber} targeting ${extremeCheck.targetMultiplier}x!`);
        
        io.emit('extremeMultiplierEvent', {
            gameId: currentGame?.id,
            gameNumber,
            targetMultiplier: extremeCheck.targetMultiplier,
            totalBets: currentGame?.totalBets || 0,
            message: `🚀 EXTREME RUN INCOMING! Target: ${extremeCheck.targetMultiplier}x`,
            timestamp: Date.now(),
            rarity: 'LEGENDARY'
        });

        return extremeCheck.targetMultiplier;
    }
    
    // NEW: Check for bootstrap FOMO event
    if (config._BOOTSTRAP_MODE) {
        const fomoCheck = shouldTriggerBootstrapFomo(gameNumber);
        if (fomoCheck.trigger && fomoCheck.targetMultiplier) {
            console.log(`📈 BOOTSTRAP FOMO: Game ${gameNumber} targeting ${fomoCheck.targetMultiplier}x (${fomoCheck.pattern})`);
            
            // Broadcast FOMO event
            io.emit('bootstrapFomoEvent', {
                gameId: currentGame?.id,
                gameNumber,
                targetMultiplier: fomoCheck.targetMultiplier,
                pattern: fomoCheck.pattern,
                emptyStreak: BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak,
                fomoStreak: BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak,
                bootstrapLevel: config._BOOTSTRAP_LEVEL,
                message: fomoCheck.pattern === 'break' || fomoCheck.pattern === 'early_break' 
                    ? `🛑 Quick run: ${fomoCheck.targetMultiplier}x` 
                    : `📈 Green run: ${fomoCheck.targetMultiplier}x - Jump in!`,
                timestamp: Date.now(),
                rarity: fomoCheck.pattern === 'extra_high' ? 'RARE' : 'COMMON'
            });

            return fomoCheck.targetMultiplier;
        }
    }
    
    // Regular crash point calculation (existing logic unchanged)
    const hash = crypto.createHash('sha256').update(seed + gameNumber).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    
    let baseCrashPoint = Math.max(1.0, (hashInt / 0xFFFFFFFF) * config.MAX_MULTIPLIER);
    
    if (config._BOOTSTRAP_MODE) {
        // Original bootstrap mode logic for when players ARE present
        if (config._BOOTSTRAP_LEVEL === 'emergency' && Math.random() < 0.5) {
            baseCrashPoint = Math.min(baseCrashPoint, 1.5);
        } else if (config._BOOTSTRAP_LEVEL === 'critical' && Math.random() < 0.35) {
            baseCrashPoint = Math.min(baseCrashPoint, 2.5);
        } else if (config._BOOTSTRAP_LEVEL === 'bootstrap' && Math.random() < 0.25) {
            baseCrashPoint = Math.min(baseCrashPoint, 4.0);
        }
        
        baseCrashPoint = Math.min(baseCrashPoint, config.MAX_MULTIPLIER);
        
        if (baseCrashPoint <= 2.0) {
            console.log(`🔽 ${config._BOOTSTRAP_LEVEL} bootstrap normal crash: ${baseCrashPoint.toFixed(2)}x (Game ${gameNumber}) - Players present`);
        }
    } else {
        baseCrashPoint = applyMultiplierControl(baseCrashPoint, gameNumber);
    }
    
    return Math.floor(baseCrashPoint * 100) / 100;
}

function shouldTriggerExtremeMultiplier(gameNumber: number): { 
    trigger: boolean; 
    targetMultiplier?: number; 
    reason?: string 
} {
    if (!EXTREME_MULTIPLIER_CONFIG.enabled) {
        return { trigger: false, reason: 'Extreme multipliers disabled' };
    }

    if (!currentGame) {
        return { trigger: false, reason: 'No active game' };
    }

    // Check cooldown
    const now = Date.now();
    const timeSinceLastExtreme = now - EXTREME_MULTIPLIER_CONFIG.lastExtremeTime;
    const cooldownMs = EXTREME_MULTIPLIER_CONFIG.cooldownMinutes * 60 * 1000;
    
    if (timeSinceLastExtreme < cooldownMs) {
        const minutesLeft = Math.ceil((cooldownMs - timeSinceLastExtreme) / 60000);
        return { trigger: false, reason: `Cooldown: ${minutesLeft}m remaining` };
    }

    // Check if total bets are low enough
    if (currentGame.totalBets > EXTREME_MULTIPLIER_CONFIG.lowBetThreshold) {
        return { 
            trigger: false, 
            reason: `Bets too high: ${currentGame.totalBets.toFixed(3)} > ${EXTREME_MULTIPLIER_CONFIG.lowBetThreshold}` 
        };
    }

    // Calculate total risk if game went to extreme multiplier
    let totalRisk = 0;
    const testMultiplier = EXTREME_MULTIPLIER_CONFIG.minExtremeMultiplier;
    
    for (const [_, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            const potentialPayout = bet.betAmount * (testMultiplier / bet.entryMultiplier) * 0.95; // With house edge
            totalRisk += Math.min(potentialPayout, 15.0); // Cap at max payout
        }
    }

    if (totalRisk > EXTREME_MULTIPLIER_CONFIG.maxRiskAmount) {
        return { 
            trigger: false, 
            reason: `Risk too high: ${totalRisk.toFixed(3)} > ${EXTREME_MULTIPLIER_CONFIG.maxRiskAmount}` 
        };
    }

    // Random chance check
    if (Math.random() > EXTREME_MULTIPLIER_CONFIG.extremeChance) {
        return { trigger: false, reason: 'Random chance failed' };
    }

    // Generate extreme multiplier
    const range = EXTREME_MULTIPLIER_CONFIG.maxExtremeMultiplier - EXTREME_MULTIPLIER_CONFIG.minExtremeMultiplier;
    const targetMultiplier = EXTREME_MULTIPLIER_CONFIG.minExtremeMultiplier + (Math.random() * range);

    console.log(`🚀 EXTREME MULTIPLIER TRIGGERED!`);
    console.log(`   Target: ${targetMultiplier.toFixed(1)}x`);
    console.log(`   Total bets: ${currentGame.totalBets.toFixed(3)} SOL`);
    console.log(`   Total risk: ${totalRisk.toFixed(3)} SOL`);
    console.log(`   Game: ${gameNumber}`);

    // Update last extreme time
    EXTREME_MULTIPLIER_CONFIG.lastExtremeTime = now;

    return { 
        trigger: true, 
        targetMultiplier: Math.floor(targetMultiplier * 10) / 10, // Round to 1 decimal
        reason: `Extreme event: ${targetMultiplier.toFixed(1)}x target`
    };
}

function applyMultiplierControl(baseCrashPoint: number, gameNumber: number): number {
    const now = Date.now();
    
    if (multiplierControl.cooldownUntil > now) {
        multiplierControl.cooldownActive = true;
    } else {
        multiplierControl.cooldownActive = false;
    }
    
    const rollingStats = calculateRollingStats();
    
    console.log(`🎲 Multiplier Control - Game ${gameNumber}:`);
    console.log(`   Base: ${baseCrashPoint.toFixed(2)}x`);
    console.log(`   Recent games: ${multiplierControl.recentGames.length}`);
    console.log(`   Consecutive high: ${multiplierControl.consecutiveHighCount}`);
    console.log(`   Rolling house profit: ${rollingStats.houseProfitRatio.toFixed(2)}%`);
    console.log(`   Cooldown active: ${multiplierControl.cooldownActive}`);
    
    let finalCrashPoint = baseCrashPoint;
    
    if (multiplierControl.cooldownActive) {
        finalCrashPoint = Math.min(finalCrashPoint, MULTIPLIER_CONTROL.MAX_MULTIPLIER_DURING_COOLDOWN);
        console.log(`   🔒 Cooldown applied: ${finalCrashPoint.toFixed(2)}x`);
    }
    
    if (multiplierControl.consecutiveHighCount >= MULTIPLIER_CONTROL.MAX_CONSECUTIVE_HIGH) {
        if (finalCrashPoint >= MULTIPLIER_CONTROL.HIGH_MULTIPLIER_THRESHOLD) {
            finalCrashPoint = Math.min(finalCrashPoint, MULTIPLIER_CONTROL.HIGH_MULTIPLIER_THRESHOLD - 0.1);
            console.log(`   ⛔ Consecutive limit applied: ${finalCrashPoint.toFixed(2)}x`);
        }
    }
    
    if (rollingStats.houseProfitRatio < MULTIPLIER_CONTROL.TARGET_HOUSE_EDGE_RATIO) {
        if (finalCrashPoint >= MULTIPLIER_CONTROL.HIGH_MULTIPLIER_THRESHOLD) {
            const reductionFactor = 1 - MULTIPLIER_CONTROL.PROBABILITY_REDUCTION_FACTOR;
            finalCrashPoint = Math.min(finalCrashPoint, MULTIPLIER_CONTROL.HIGH_MULTIPLIER_THRESHOLD * reductionFactor);
            console.log(`   📉 Profit adjustment applied: ${finalCrashPoint.toFixed(2)}x (House profit: ${rollingStats.houseProfitRatio.toFixed(1)}%)`);
        }
    }
    
    if (rollingStats.houseProfitRatio < 0.1 && rollingStats.gamesCount >= 5) {
        finalCrashPoint = Math.min(finalCrashPoint, 2.0);
        console.log(`   🚨 Emergency house protection: ${finalCrashPoint.toFixed(2)}x`);
    }
    
    return finalCrashPoint;
}

function calculateRollingStats(): { houseProfitRatio: number; gamesCount: number; totalBets: number; totalPayouts: number } {
    if (multiplierControl.recentGames.length === 0) {
        return { houseProfitRatio: 1.0, gamesCount: 0, totalBets: 0, totalPayouts: 0 };
    }
    
    const totalBets = multiplierControl.recentGames.reduce((sum, game) => sum + game.totalBets, 0);
    const totalPayouts = multiplierControl.recentGames.reduce((sum, game) => sum + game.totalPayouts, 0);
    const houseProfitRatio = totalBets > 0 ? (totalBets - totalPayouts) / totalBets : 1.0;
    
    return {
        houseProfitRatio,
        gamesCount: multiplierControl.recentGames.length,
        totalBets,
        totalPayouts
    };
}

function updateMultiplierHistory(gameData: GameState, totalPayouts: number): void {
    const now = Date.now();
    const houseProfit = gameData.totalBets - totalPayouts;
    
    const historyEntry: GameHistoryEntry = {
        gameNumber: gameData.gameNumber,
        crashMultiplier: gameData.crashMultiplier || gameData.currentMultiplier,
        totalBets: gameData.totalBets,
        totalPayouts,
        houseProfit,
        timestamp: now,
        playerCount: gameData.totalPlayers
    };
    
    multiplierControl.recentGames.push(historyEntry);
    
    if (multiplierControl.recentGames.length > multiplierControl.maxHistorySize) {
        multiplierControl.recentGames.shift();
    }
    
    const crashMultiplier = historyEntry.crashMultiplier;
    if (crashMultiplier >= MULTIPLIER_CONTROL.HIGH_MULTIPLIER_THRESHOLD) {
        multiplierControl.consecutiveHighCount++;
        multiplierControl.lastHighMultiplier = now;
        
        if (crashMultiplier >= MULTIPLIER_CONTROL.VERY_HIGH_MULTIPLIER_THRESHOLD) {
            const cooldownDuration = Math.max(
                MULTIPLIER_CONTROL.MIN_COOLDOWN_DURATION,
                MULTIPLIER_CONTROL.COOLDOWN_DURATION * (crashMultiplier / 10)
            );
            multiplierControl.cooldownUntil = now + cooldownDuration;
            console.log(`🔒 Cooldown activated for ${(cooldownDuration / 60000).toFixed(1)} minutes due to ${crashMultiplier.toFixed(2)}x multiplier`);
        }
    } else {
        multiplierControl.consecutiveHighCount = 0;
    }
    
    multiplierControl.rollingHouseProfit = multiplierControl.recentGames.reduce((sum, game) => sum + game.houseProfit, 0);
    
    const stats = calculateRollingStats();
    console.log(`📊 Multiplier History Updated - Game ${gameData.gameNumber}:`);
    console.log(`   Crash: ${crashMultiplier.toFixed(2)}x`);
    console.log(`   House profit this game: ${houseProfit.toFixed(3)} SOL`);
    console.log(`   Rolling house profit ratio: ${(stats.houseProfitRatio * 100).toFixed(1)}%`);
    console.log(`   Consecutive high count: ${multiplierControl.consecutiveHighCount}`);
    console.log(`   Next cooldown until: ${multiplierControl.cooldownUntil > now ? new Date(multiplierControl.cooldownUntil).toLocaleTimeString() : 'None'}`);
}

// Trading System Functions
function generateProvablyFairSeed(): string {
    return crypto.randomBytes(32).toString('hex');
}

function generateGameDuration(crashPoint: number): number {
    const config = getCurrentGameConfig();
    const baseTime = config.MIN_GAME_DURATION;
    const maxTime = config.MAX_GAME_DURATION;
    const factor = Math.min(crashPoint / 10, 1);
    return baseTime + (maxTime - baseTime) * factor;
}

function resetTradingState(): void {
    const randVal = Math.random();
    let selectedTrend: 'up' | 'down' | 'sideways';
    
    if (randVal < 0.35) {
        selectedTrend = 'up';
    } else if (randVal < 0.70) {
        selectedTrend = 'down';
    } else {
        selectedTrend = 'sideways';
    }
    
    tradingState = {
        trend: selectedTrend,
        momentum: (Math.random() - 0.5) * 2.0,
        volatility: 0.015 + Math.random() * 0.02,
        lastDirection: Math.random() < 0.5 ? 1 : -1,
        consecutiveRises: 0,
        rugPullPending: false,
        rugPullProbability: 0.001,
        totalBetsSinceStart: 0,
        highBetCount: 0
    };
    
    console.log(`🎮 AGGRESSIVE Trading state reset - Trend: ${tradingState.trend}, Momentum: ${tradingState.momentum.toFixed(3)}, Volatility: ${(tradingState.volatility * 100).toFixed(1)}%`);
}

function changeTrend(): void {
    const oldTrend = tradingState.trend;
    const randVal = Math.random();
    
    if (tradingState.trend === 'up') {
        tradingState.trend = randVal < 0.7 ? 'down' : 'sideways';
    } else if (tradingState.trend === 'down') {
        tradingState.trend = randVal < 0.7 ? 'up' : 'sideways';
    } else {
        tradingState.trend = randVal < 0.5 ? 'up' : 'down';
    }
    
    tradingState.momentum = (Math.random() - 0.5) * 2.5;
    tradingState.volatility = 0.01 + Math.random() * 0.03;
    
    console.log(`📊 AGGRESSIVE Trend change: ${oldTrend} → ${tradingState.trend}, momentum: ${tradingState.momentum.toFixed(3)}, volatility: ${(tradingState.volatility * 100).toFixed(1)}%`);
}

function calculateTraderMultiplier(elapsed: number, duration: number): number {
    if (!currentGame) return 1.0;

    const currentMultiplier = currentGame.currentMultiplier;
    let baseChange = 0;
    
    switch (tradingState.trend) {
        case 'up':
            baseChange = 0.002 + (Math.random() * 0.008) * Math.max(0.2, tradingState.momentum);
            break;
        case 'down':
            baseChange = -0.003 - (Math.random() * 0.012) * Math.max(0.2, Math.abs(tradingState.momentum));
            break;
        case 'sideways':
            baseChange = (Math.random() - 0.5) * 0.006;
            break;
    }
    
    const volatilityEffect = (Math.random() - 0.5) * tradingState.volatility * 4;
    baseChange += volatilityEffect;
    
    if (Math.abs(tradingState.momentum) > 0.5) {
        baseChange *= (1 + Math.abs(tradingState.momentum) * 0.8);
    }
    
    if (Math.random() < 0.15) {
        changeTrend();
    }
    
    if (tradingState.consecutiveRises >= 6) {
        baseChange = -0.008 - (Math.random() * 0.015);
        tradingState.consecutiveRises = 0;
        tradingState.trend = 'down';
        tradingState.momentum = -(0.8 + Math.random() * 1.0);
        console.log('📉 AGGRESSIVE forced dip after consecutive rises');
    }
    
    if (baseChange > 0.0005) {
        tradingState.consecutiveRises++;
        tradingState.lastDirection = 1;
    } else if (baseChange < -0.0005) {
        tradingState.consecutiveRises = 0;
        tradingState.lastDirection = -1;
    }
    
    const newMultiplier = Math.max(0.5, currentMultiplier * (1 + baseChange));
    
    if (Math.abs(baseChange) > 0.005 || Math.random() < 0.2) {
        console.log(`📈 MULTIPLIER: ${currentMultiplier.toFixed(3)}x → ${newMultiplier.toFixed(3)}x (${baseChange >= 0 ? '+' : ''}${(baseChange * 100).toFixed(2)}%) | Trend: ${tradingState.trend} | Momentum: ${tradingState.momentum.toFixed(2)}`);
    }
    
    const maxSafe = getCurrentMaxSafe();
    if (newMultiplier > maxSafe && maxSafe < 50) {
        console.log(`⚠️ Safety cap applied: ${newMultiplier.toFixed(3)}x → ${maxSafe.toFixed(3)}x`);
        return maxSafe;
    }
    
    return newMultiplier;
}

function shouldInstantRugPull(): boolean {
    if (!currentGame) return false;
    
    const config = getCurrentGameConfig();
    
    for (const [_, bet] of currentGame.activeBets) {
        if (!bet.cashedOut && bet.betAmount >= config.INSTANT_RUG_THRESHOLD) {
            console.log(`💥 Instant rug: ${bet.betAmount} SOL bet > ${config.INSTANT_RUG_THRESHOLD} SOL limit`);
            return true;
        }
    }
    
    let totalExposure = 0;
    for (const [_, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            const exposure = bet.betAmount * (currentGame.currentMultiplier / bet.entryMultiplier);
            totalExposure += exposure;
        }
    }
    
    const availableBalance = Math.max(0, houseBalance - config.MIN_HOUSE_BALANCE);
    
    if (totalExposure > availableBalance * 3) {
        console.log(`💥 Instant rug: Total exposure ${totalExposure.toFixed(2)} SOL > ${(availableBalance * 3).toFixed(2)} SOL limit`);
        return true;
    }
    
    return false;
}

function shouldRugPull(): boolean {
    if (!currentGame) return false;
    
    const config = getCurrentGameConfig();
    let rugChance = config.RUG_PULL_CHANCE_BASE;
    
    const highBets = Array.from(currentGame.activeBets.values())
        .filter(bet => !bet.cashedOut && bet.betAmount >= config.HIGH_BET_THRESHOLD);
    
    if (highBets.length > 0) {
        rugChance += highBets.length * 0.003;
        console.log(`🎰 High bet rug risk: ${highBets.length} bets, chance: ${(rugChance * 100).toFixed(2)}%`);
    }
    
    if (currentGame.currentMultiplier > 8) {
        rugChance += (currentGame.currentMultiplier - 8) * 0.002;
    }
    
    if (currentGame.totalBets > 15) {
        rugChance += (currentGame.totalBets - 15) * 0.001;
    }
    
    const finalRugChance = Math.min(0.04, rugChance);
    tradingState.rugPullProbability = finalRugChance;
    
    return Math.random() < finalRugChance;
}

// Enhanced placeBet function
async function placeBet(walletAddress: string, betAmount: number, userId?: string, signedTransaction?: string): Promise<{ success: boolean; reason?: string; entryMultiplier?: number; unsignedTransaction?: string }> {
    const config = getCurrentGameConfig();
    
    console.log('🎯 SERVER: Bet request received:', {
        walletAddress,
        betAmount,
        userId,
        gameStatus: currentGame?.status,
        gameId: currentGame?.id,
        countdownTimeRemaining,
        totalActiveBets: currentGame?.activeBets.size || 0,
        houseBalance,
        maxPayoutCapacity: currentGame?.maxPayoutCapacity || 0,
        bootstrapMode: config._BOOTSTRAP_MODE,
        bootstrapLevel: config._BOOTSTRAP_LEVEL,
        hasSignedTransaction: !!signedTransaction
    });

    if (!currentGame || (currentGame.status !== 'active' && currentGame.status !== 'waiting')) {
        console.log('❌ SERVER: Game not available - Status:', currentGame?.status || 'No game');
        return { success: false, reason: 'Game not available' };
    }

    if (currentGame.status === 'waiting' && countdownTimeRemaining <= 2) {
        console.log('❌ SERVER: Too late - game starting, countdown:', countdownTimeRemaining);
        return { success: false, reason: 'Too late to place bet - game starting soon' };
    }

    console.log('✅ SERVER: Game status check passed - Status:', currentGame.status);

    if (betAmount < config.MIN_BET) {
        console.log('❌ SERVER: Bet amount too low:', betAmount, 'Min:', config.MIN_BET);
        return { success: false, reason: 'Bet amount too low' };
    }

    // INSTANT RUG PULL CHECK
    if (betAmount > config.INSTANT_RUG_THRESHOLD) {
        if (config._BOOTSTRAP_MODE) {
            console.log(`🚨💥 BOOTSTRAP INSTANT RUG PULL: Bet ${betAmount} SOL > ${config.INSTANT_RUG_THRESHOLD} SOL in ${config._BOOTSTRAP_LEVEL} mode!`);
        } else {
            console.log(`🚨💥 NORMAL INSTANT RUG PULL: Bet ${betAmount} SOL > ${config.INSTANT_RUG_THRESHOLD} SOL!`);
        }
        
        if (signedTransaction) {
            const collection = await collectBetFromUser(walletAddress, betAmount, currentGame.id, userId, signedTransaction);
            
            if (collection.success) {
                const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier;
                
                const bet: PlayerBet = {
                    userId: userId || '',
                    walletAddress,
                    betAmount,
                    placedAt: Date.now(),
                    entryMultiplier,
                    maxPayout: betAmount * BET_VALIDATION.MAX_PAYOUT_MULTIPLIER,
                    isValid: true,
                    transactionId: collection.transactionId,
                    betCollected: true,
                    payoutProcessed: false
                };

                currentGame.activeBets.set(walletAddress, bet);
                currentGame.totalBets += betAmount;
                currentGame.totalPlayers = currentGame.activeBets.size;
                currentGame.boostedTotalBets = currentGame.totalBets + artificialLiquidity;

// 🎭 Simulate additional betting activity
simulateBetActivity(betAmount);
console.log(`💰 Bet placed: ${betAmount} SOL real + ${artificialLiquidity.toFixed(3)} SOL artificial = ${currentGame.boostedTotalBets.toFixed(3)} SOL total display`);
            }
            
            setTimeout(() => {
                if (currentGame) {
                    console.log(`💥 RUG PULL EXECUTED: Game crashed due to ${betAmount} SOL bet exceeding limit`);
                    crashGame();
                }
            }, 1000);
        }
        
        return { 
            success: true, 
            entryMultiplier: currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier,
            reason: 'Bet placed - HIGH RISK!' 
        };
    }

    if (betAmount > config.MAX_BET) {
        console.log('❌ SERVER: Bet amount too high:', betAmount, 'Max:', config.MAX_BET);
        return { success: false, reason: 'Bet amount too high' };
    }

    if (currentGame.activeBets.has(walletAddress)) {
        console.log('❌ SERVER: Already has active bet for wallet:', walletAddress);
        return { success: false, reason: 'Already has active bet' };
    }

    try {
        console.log('🔍 SERVER: Starting wallet validation and bet collection...');
        
        const userBalance = await getUserWalletBalance(walletAddress);
        console.log('💰 SERVER: User balance check:', { walletAddress, balance: userBalance, required: betAmount + 0.01 });
        
        if (userBalance < betAmount + 0.01) {
            console.log('❌ SERVER: Insufficient balance:', userBalance, 'needed:', betAmount + 0.01);
            return { success: false, reason: 'Insufficient balance' };
        }

        await updateHouseBalance();
        const maxPayoutCapacity = calculateMaxPayoutCapacity();
        const potentialPayout = betAmount * config.MAX_MULTIPLIER * (1 - config.HOUSE_EDGE);
        
        console.log('🏛️ SERVER: House capacity check:', { 
            houseBalance, 
            maxPayoutCapacity, 
            potentialPayout,
            betAmount 
        });
        
        if (potentialPayout > maxPayoutCapacity) {
            console.log('❌ SERVER: Bet exceeds house payout capacity:', potentialPayout, '>', maxPayoutCapacity);
            return { success: false, reason: 'Bet exceeds house payout capacity' };
        }

        console.log('💸 SERVER: Attempting to collect bet from user...');
        
        const collection = await collectBetFromUser(walletAddress, betAmount, currentGame.id, userId, signedTransaction);
        
        if (!collection.success && collection.unsignedTransaction) {
            console.log('📝 SERVER: Unsigned transaction created, returning to frontend');
            return { 
                success: false, 
                reason: 'Transaction created - please sign',
                unsignedTransaction: collection.unsignedTransaction 
            };
        }
        
        if (!collection.success) {
            console.log('❌ SERVER: Bet collection failed:', collection.error);
            return { success: false, reason: collection.error || 'Failed to collect bet' };
        }

        console.log('✅ SERVER: Bet collection successful:', collection.transactionId);

        // Add this function around line 4389 or replace existing notifyPlayerActivity call
function notifyPlayerActivity(): void {
    if (!currentGame) return;
    
    const wasEmpty = isGameEffectivelyEmpty();
    
    // Call this after bet is placed to detect transition from empty to active
    setTimeout(() => {
        const isEmptyNow = isGameEffectivelyEmpty();
        if (wasEmpty && !isEmptyNow) {
            onPlayersJoinGame();
        }
    }, 100);
}
        
        

        const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier;
        
        const bet: PlayerBet = {
            userId: userId || '',
            walletAddress,
            betAmount,
            placedAt: Date.now(),
            entryMultiplier,
            maxPayout: betAmount * BET_VALIDATION.MAX_PAYOUT_MULTIPLIER,
            isValid: true,
            transactionId: collection.transactionId,
            betCollected: true,
            payoutProcessed: false
        };

        currentGame.activeBets.set(walletAddress, bet);
        currentGame.totalBets += betAmount;
        currentGame.totalPlayers = currentGame.activeBets.size;
        currentGame.houseBalance = houseBalance;
        currentGame.maxPayoutCapacity = maxPayoutCapacity;

        tradingState.totalBetsSinceStart += betAmount;
        
        if (betAmount >= config.HIGH_BET_THRESHOLD) {
            tradingState.highBetCount++;
            tradingState.volatility *= 1.5;
            
            const rugMultiplier = config._BOOTSTRAP_MULTIPLIER || 1.0;
            tradingState.rugPullProbability = Math.min(0.02, tradingState.rugPullProbability * 2 * rugMultiplier);
        }

        if (config._BOOTSTRAP_MODE) {
            console.log(`💰 ${config._BOOTSTRAP_LEVEL} bet: ${betAmount} SOL (Total bets: ${currentGame.totalBets.toFixed(3)} SOL, House: ${houseBalance.toFixed(3)} SOL)`);
        }

        try {
            if (!currentGame.id.startsWith('memory-') && !currentGame.id.startsWith('waiting-')) {
                await supabaseService
                    .from('player_bets')
                    .insert({
                        game_id: currentGame.id,
                        user_id: userId,
                        wallet_address: walletAddress,
                        bet_amount: betAmount,
                        entry_multiplier: entryMultiplier,
                        status: 'active',
                        placed_at: new Date().toISOString(),
                        bet_type: currentGame.status,
                        transaction_id: collection.transactionId,
                        bet_collected: true
                    });
            }
        } catch (dbError) {
            console.warn('Bet database save failed (non-critical):', dbError);
        }

        io.emit('betPlaced', {
            gameId: currentGame.id,
            walletAddress,
            betAmount,
            entryMultiplier,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            gameStatus: currentGame.status,
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
            transactionId: collection.transactionId,
            countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
        });

        // ✅ CORRECT analytics event for bet placement
        io.to('analytics_dashboard').emit('betPlacedAnalytics', {
            type: 'bet_placed',
            gameNumber: currentGame.gameNumber,
            gameId: currentGame.id,
            betAmount: betAmount,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            currentMultiplier: currentGame.currentMultiplier,
            timestamp: Date.now()
        });

        return { success: true, entryMultiplier };

    } catch (error) {
        console.error('❌ SERVER: Critical error in placeBet:', error);
        return { success: false, reason: 'Server error' };
    }
}

// Enhanced cashOut function
async function cashOut(walletAddress: string): Promise<{ success: boolean; payout?: number; reason?: string }> {
    if (!currentGame || currentGame.status !== 'active') {
        return { success: false, reason: 'Game not active' };
    }

    const bet = currentGame.activeBets.get(walletAddress);
    if (!bet || bet.cashedOut || !bet.isValid || !bet.betCollected) {
        return { success: false, reason: 'No valid active bet found' };
    }

    const holdTime = Date.now() - bet.placedAt;
    if (holdTime < BET_VALIDATION.MIN_HOLD_TIME) {
        return { 
            success: false, 
            reason: `Must wait ${(BET_VALIDATION.MIN_HOLD_TIME - holdTime) / 1000}s before cashing out` 
        };
    }

    try {
        const config = getCurrentGameConfig();
        const cashoutMultiplier = currentGame.currentMultiplier;
        
        const growthRatio = cashoutMultiplier / bet.entryMultiplier;
        const rawPayout = bet.betAmount * growthRatio;
        
        const payoutWithHouseEdge = rawPayout * (1 - config.HOUSE_EDGE);
        
        const finalPayout = Math.min(payoutWithHouseEdge, config.MAX_SINGLE_PAYOUT);
        const safePayout = Math.max(0, finalPayout);
        
        if (safePayout > config.MAX_SINGLE_PAYOUT) {
            if (config._BOOTSTRAP_MODE) {
                console.log(`🚨 ${config._BOOTSTRAP_LEVEL} payout rug: ${safePayout.toFixed(3)} SOL > ${config.MAX_SINGLE_PAYOUT} SOL limit`);
            }
            
            bet.cashedOut = true;
            bet.cashoutMultiplier = cashoutMultiplier;
            bet.cashoutAmount = safePayout;
            bet.cashoutTime = Date.now();
            bet.payoutProcessed = false;
            
            setTimeout(() => {
                if (currentGame) crashGame();
            }, 500);

            // After the crash processing, add:

// 🎭 Simulate liquidity drain after crash
setTimeout(() => {
    triggerArtificialUpdate('crash');
    console.log(`💥 Post-crash liquidity reset: ${artificialLiquidity.toFixed(3)} SOL artificial remaining`);
}, 1000);
            
            return { success: false, reason: 'Payout temporarily unavailable' };
        }

        const payout = await payoutToUser(walletAddress, safePayout, currentGame.id, bet.userId);
        if (!payout.success) {
            return { success: false, reason: payout.error || 'Payout failed' };
        }

        bet.cashedOut = true;
        bet.cashoutMultiplier = cashoutMultiplier;
        bet.cashoutAmount = safePayout;
        bet.cashoutTime = Date.now();
        bet.payoutProcessed = true;

        const profit = safePayout - bet.betAmount;
        const isLoss = cashoutMultiplier < bet.entryMultiplier;

        if (config._BOOTSTRAP_MODE) {
            console.log(`💸 ${config._BOOTSTRAP_LEVEL} cashout: ${safePayout.toFixed(3)} SOL (House edge: ${(config.HOUSE_EDGE * 100).toFixed(0)}%, Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(3)} SOL)`);
        }

        await updateHouseBalance();
        if (currentGame) {
            currentGame.houseBalance = houseBalance;
            currentGame.maxPayoutCapacity = calculateMaxPayoutCapacity();
        }

        try {
            if (!currentGame.id.startsWith('memory-')) {
                await supabaseService
                    .from('player_bets')
                    .update({
                        cashout_multiplier: cashoutMultiplier,
                        cashout_amount: safePayout,
                        profit_loss: profit,
                        status: isLoss ? 'cashed_out_loss' : 'cashed_out_profit',
                        cashed_out_at: new Date().toISOString(),
                        payout_transaction_id: payout.transactionId,
                        payout_processed: true,
                        entry_multiplier: bet.entryMultiplier,
                        growth_ratio: growthRatio
                    })
                    .eq('game_id', currentGame.id)
                    .eq('wallet_address', walletAddress);
            }
        } catch (dbError) {
            console.warn('Cashout save failed:', dbError);
        }

        io.emit('playerCashedOut', {
            gameId: currentGame.id,
            walletAddress,
            entryMultiplier: bet.entryMultiplier,
            cashoutMultiplier,
            growthRatio,
            amount: safePayout,
            profit,
            isLoss,
            houseEdge: config.HOUSE_EDGE,
            transactionId: payout.transactionId,
            houseBalance: currentGame.houseBalance
        });

        updateUserAnalytics(bet.userId, null, {
            amount: bet.betAmount,
            payout: safePayout,
            won: true,
            multiplier: cashoutMultiplier,
            type: 'cashout'
        });

        return { success: true, payout: safePayout };

    } catch (error) {
        console.error('Error cashing out:', error);
        return { success: false, reason: 'Server error' };
    }
}

// Enhanced game loop with integrated extreme multiplier and bootstrap FOMO systems
// Replace the existing runGameLoop function (around line 4870)
async function runGameLoop(duration: number): Promise<void> {
    if (!currentGame) return;

    const startTime = Date.now();
    const endTime = startTime + duration;
    let lastChartUpdate = startTime;
    let lastLogTime = startTime;

    // 🔧 NEW: Detect special game types
    const isExtremeGame = currentGame.maxMultiplier >= 50.0; // Extreme multiplier threshold
    const isBootstrapMode = getCurrentGameConfig()._BOOTSTRAP_MODE;
    const isFomoGame = isBootstrapMode && currentGame.maxMultiplier >= BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange.min;
    const gameIsEmpty = isGameEffectivelyEmpty();

    // 🔧 NEW: Enhanced game type detection and logging
    let gameTypeLabel = 'NORMAL';
    if (isExtremeGame) {
        gameTypeLabel = 'EXTREME';
    } else if (isFomoGame && gameIsEmpty) {
        gameTypeLabel = 'BOOTSTRAP FOMO';
    } else if (isBootstrapMode) {
        gameTypeLabel = `BOOTSTRAP ${getCurrentGameConfig()._BOOTSTRAP_LEVEL.toUpperCase()}`;
    }

    console.log(`🎮 Starting ${gameTypeLabel} game loop for Game ${currentGame.gameNumber} - Duration: ${duration}ms`);

    const gameLoop = setInterval(() => {
        if (!currentGame || currentGame.status !== 'active') {
            clearInterval(gameLoop);
            return;
        }

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Enhanced rug pull logic based on game type
        if (isExtremeGame) {
            // For extreme games, only rug if risk becomes dangerously high
            let currentRisk = 0;
            for (const [_, bet] of currentGame.activeBets) {
                if (!bet.cashedOut) {
                    const potentialPayout = bet.betAmount * (currentGame.currentMultiplier / bet.entryMultiplier) * 0.95;
                    currentRisk += Math.min(potentialPayout, 15.0);
                }
            }
            
            if (currentRisk > 30.0) {
                console.log(`🚨 EXTREME GAME EMERGENCY RUG: Risk ${currentRisk.toFixed(3)} SOL too high`);
                crashGame();
                clearInterval(gameLoop);
                return;
            }
        } else if (isFomoGame && gameIsEmpty) {
            // For FOMO games with no real players, no rug pulls needed
            console.log(`📈 FOMO display game - no rug protection needed (empty game)`);
        } else {
            // Normal rug pull logic for regular games
            if (shouldInstantRugPull()) {
                console.log('💥 INSTANT RUG PULL TRIGGERED');
                crashGame();
                clearInterval(gameLoop);
                return;
            }

            if (shouldRugPull()) {
                console.log('💥 PROBABILITY RUG PULL TRIGGERED');
                crashGame();
                clearInterval(gameLoop);
                return;
            }
        }

        // Natural game duration ending
        if (progress >= 1 || now >= endTime) {
            const endReason = isExtremeGame ? 'EXTREME TARGET REACHED' : 
                            isFomoGame ? 'FOMO DISPLAY COMPLETE' : 
                            'naturally';
            console.log(`⏰ Game duration reached, crashing ${endReason}`);
            crashGame();
            clearInterval(gameLoop);
            return;
        }

        const oldMultiplier = currentGame.currentMultiplier;
        const newMultiplier = calculateTraderMultiplier(elapsed, duration);
        currentGame.currentMultiplier = Math.round(newMultiplier * 100) / 100;

        // Update artificial liquidity every update cycle
        updateGameLiquidity();

        // Enhanced multiplier updates with game type context and null checks
        if (currentGame) {
            io.emit('multiplierUpdate', {
                gameId: currentGame.id,
                gameNumber: currentGame.gameNumber,
                multiplier: currentGame.currentMultiplier,
                timestamp: now,
                serverTime: now,
                progress: progress,
                trend: tradingState.trend,
                rugPullRisk: isExtremeGame ? 0.001 : isFomoGame && gameIsEmpty ? 0.000 : tradingState.rugPullProbability,
                houseBalance: currentGame.houseBalance,
                maxPayoutCapacity: currentGame.maxPayoutCapacity,
                totalBets: currentGame.totalBets,
                boostedTotalBets: currentGame.boostedTotalBets,
                liquidityGrowth: (artificialLiquidity - baseGameLiquidity).toFixed(3),
                
                // Game type indicators
                gameType: gameTypeLabel,
                isExtremeGame: isExtremeGame,
                isFomoGame: isFomoGame && gameIsEmpty,
                isBootstrapMode: isBootstrapMode,
                bootstrapLevel: isBootstrapMode ? getCurrentGameConfig()._BOOTSTRAP_LEVEL : null,
                targetMultiplier: isExtremeGame || isFomoGame ? currentGame.maxMultiplier : undefined,
                
                // Player engagement data
                gameIsEmpty: gameIsEmpty,
                emptyStreak: isBootstrapMode ? BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak : 0,
                fomoStreak: isBootstrapMode ? BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak : 0,
                
                // Risk and safety indicators
                riskLevel: isExtremeGame ? 'HIGH' : isFomoGame && gameIsEmpty ? 'NONE' : isBootstrapMode ? 'MEDIUM' : 'NORMAL',
                safetyMode: getCurrentGameConfig()._BOOTSTRAP_MODE ? 'BOOTSTRAP' : 'NORMAL'
            });
        }

        // Chart updates with enhanced volatility for special games and null checks
        if (currentGame && now - lastChartUpdate >= 1000) {
            // Adjust volatility based on game type
            let chartVolatility = tradingState.volatility;
            if (isExtremeGame) {
                chartVolatility *= 1.5; // More dramatic for extreme games
            } else if (isFomoGame && gameIsEmpty) {
                chartVolatility *= 0.8; // Smoother for FOMO display
            }
            
            const chartPoint = {
                timestamp: now,
                open: currentGame.chartData.length > 0 ? currentGame.chartData[currentGame.chartData.length - 1].close : 1.0,
                high: currentGame.currentMultiplier * (1 + Math.random() * chartVolatility),
                low: currentGame.currentMultiplier * (1 - Math.random() * chartVolatility),
                close: currentGame.currentMultiplier,
                volume: currentGame.totalBets,
                
                // Chart metadata for enhanced UI
                gameType: gameTypeLabel,
                isSpecialEvent: isExtremeGame || (isFomoGame && gameIsEmpty),
                intensity: isExtremeGame ? 'extreme' : isFomoGame ? 'fomo' : 'normal'
            };

            currentGame.chartData.push(chartPoint);
            lastChartUpdate = now;
        }

    }, getCurrentGameConfig().UPDATE_INTERVAL);

    // FIXED: Proper cleanup without reassigning clearInterval
    const cleanupGameLoop = () => {
        clearInterval(gameLoop);
        
        // Track special game outcomes with null checks
        if (currentGame) {
            const isExtremeGameFinal = currentGame.maxMultiplier >= 50.0;
            const isFomoGameFinal = getCurrentGameConfig()._BOOTSTRAP_MODE && 
                               currentGame.maxMultiplier >= BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange.min;
            const gameIsEmptyFinal = isGameEffectivelyEmpty();
            
            if (isExtremeGameFinal) {
                trackExtremeOutcome(
                    currentGame.gameNumber, 
                    currentGame.maxMultiplier, 
                    currentGame.currentMultiplier
                );
            }
            
            if (isFomoGameFinal && gameIsEmptyFinal) {
                // Track FOMO display outcome
                console.log(`📈 FOMO Display Complete: Game ${currentGame.gameNumber} - Target: ${currentGame.maxMultiplier}x | Actual: ${currentGame.currentMultiplier}x`);
            }
        }
    };
    
    // Return cleanup function to be called when game ends
    return new Promise<void>((resolve) => {
        const originalInterval = gameLoop;
        
        // Monitor for game end
        const endChecker = setInterval(() => {
            if (!currentGame || currentGame.status !== 'active') {
                clearInterval(originalInterval);
                clearInterval(endChecker);
                cleanupGameLoop();
                resolve();
            }
        }, 100);
    });
}

async function startWaitingPeriod(): Promise<void> {
    // Clear any existing countdown first
    clearGameCountdown();
    
    if (gameStartLock) {
        console.log('⚠️ Game start lock active, skipping waiting period...');
        return;
    }

    console.log('🔄 Starting waiting period for next game...');
    
    try {
        // Create a temporary waiting game state
        const waitingGameId = `waiting-${Date.now()}`;
        
        // 🎭 Initialize waiting period with minimal liquidity
triggerArtificialUpdate('waiting');

currentGame = {
    id: waitingGameId,
    gameNumber: globalGameCounter + 1,
    startTime: Date.now(),
    currentMultiplier: 1.0,
    maxMultiplier: 0,
    status: 'waiting',
    totalBets: 0,
    totalPlayers: 0,
    boostedPlayerCount: artificialPlayerCount,
    boostedTotalBets: artificialLiquidity, // Small amount during waiting
    seed: '',
    chartData: [],
    activeBets: new Map(),
    houseBalance: houseBalance,
    maxPayoutCapacity: calculateMaxPayoutCapacity()
};
        // 🎭 Initialize waiting period with minimal liquidity

        // Emit initial waiting state
        io.emit('gameWaiting', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            status: 'waiting',
            serverTime: Date.now(),
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
            countdown: 10000 // 10 seconds in milliseconds
        });

        
        // Start countdown - FIXED: Initialize properly
        countdownTimeRemaining = 10; // 10 seconds countdown
        console.log(`⏰ Starting countdown: ${countdownTimeRemaining} seconds`);
        
        const countdownInterval = setInterval(() => {
            countdownTimeRemaining--;
            
            console.log(`⏰ Countdown: ${countdownTimeRemaining} seconds remaining`);
            
            // Emit countdown event
            io.emit('countdown', {
                gameId: currentGame?.id,
                gameNumber: currentGame?.gameNumber,
                timeRemaining: countdownTimeRemaining,
                countdownMs: countdownTimeRemaining * 1000, // Also provide milliseconds
                status: 'waiting',
                timestamp: Date.now()
            });
            
            // Also emit server sync with countdown info
            io.emit('serverSync', {
                gameId: currentGame?.id,
                gameNumber: currentGame?.gameNumber,
                multiplier: 1.0,
                serverTime: Date.now(),
                status: 'waiting',
                countdown: countdownTimeRemaining * 1000,
                countdownSeconds: countdownTimeRemaining,
                canBet: countdownTimeRemaining > 2 // Allow betting until 2 seconds left
            });
            
            if (countdownTimeRemaining <= 0) {
                console.log('⏰ Countdown finished, starting new game...');
                clearInterval(countdownInterval);
                gameCountdown = null;
                startNewGame();
            }
        }, 1000);

        gameCountdown = countdownInterval;
        
        console.log(`✅ Waiting period started with ${countdownTimeRemaining}s countdown`);

    } catch (error) {
        console.error('❌ Error in waiting period:', error);
        // Retry after delay
        setTimeout(() => {
            console.log('🔄 Retrying waiting period after error...');
            startWaitingPeriod();
        }, 5000);
    }
}

function clearGameCountdown(): void {
    if (gameCountdown) {
        console.log('🛑 Clearing existing game countdown');
        clearInterval(gameCountdown);
        gameCountdown = null;
    }
    countdownTimeRemaining = 0;
}

// GAME COUNTER FIX: Enhanced startNewGame with persistent cycling counter
// Enhanced startNewGame with proper active bet clearing
async function startNewGame(): Promise<void> {
    resetTradingState();
    
    // 🔧 CRITICAL: Get existing bets from the PREVIOUS game before clearing
    const existingBets = currentGame?.activeBets || new Map();
    const existingTotalBets = currentGame?.totalBets || 0;
    const existingTotalPlayers = currentGame?.totalPlayers || 0;

    // 🔧 DEBUG: Log existing bets before clearing
    console.log(`🔍 Starting new game - Previous game had ${existingBets.size} active bets`);
    if (existingBets.size > 0) {
        console.log(`🔍 Previous active bet wallets:`, Array.from(existingBets.keys()));
    }

    if (gameStartLock) {
        console.log('Game start already in progress, skipping...');
        return;
    }

    gameStartLock = true;

    try {
        await updateHouseBalance();
        
        const seed = generateProvablyFairSeed();
        
        globalGameCounter++;
        if (globalGameCounter > 100) {
            globalGameCounter = 1;
        }
        const gameNumber = globalGameCounter;
        
        const crashPoint = calculateControlledCrashPoint(seed, gameNumber);
        const duration = generateGameDuration(crashPoint);

        let gameId = `memory-${gameNumber}`;
        try {
            const { data: gameData, error } = await supabaseService
                .from('games')
                .insert({
                    game_number: gameNumber,
                    seed: seed,
                    crash_multiplier: crashPoint,
                    status: 'active',
                    start_time: new Date().toISOString(),
                    pre_game_bets: existingTotalBets,
                    pre_game_players: existingTotalPlayers,
                    house_balance_start: houseBalance
                })
                .select()
                .single();

            if (!error) {
                gameId = gameData.id;
                console.log(`✅ Game ${gameNumber} saved to database successfully`);
            }
            console.log(`✅ Game ${gameNumber} created:`);
        } catch (dbError) {
            console.warn(`⚠️ Database save failed for game ${gameNumber}, running in memory mode:`, dbError);
        }

        // 🔧 CRITICAL: Create completely fresh game object with empty activeBets
 // 🎭 Initialize fresh liquidity profile for new game
// 🎭 Initialize fresh liquidity profile for new game
triggerArtificialUpdate('new_game');

currentGame = {
    id: gameId,
    gameNumber,
    startTime: Date.now(),
    currentMultiplier: 1.0,
    maxMultiplier: crashPoint,
    status: 'active',
    totalBets: existingTotalBets,
    totalPlayers: existingTotalPlayers,
    boostedPlayerCount: existingTotalPlayers + artificialPlayerCount,
    boostedTotalBets: existingTotalBets + artificialLiquidity, // Fresh artificial liquidity
    crashMultiplier: crashPoint,
    seed,
    chartData: [],
    activeBets: new Map(),
    houseBalance: houseBalance,
    maxPayoutCapacity: calculateMaxPayoutCapacity()
};

console.log(`🎮 Game ${gameNumber} liquidity initialized:`);
console.log(`   Real bets: ${existingTotalBets.toFixed(3)} SOL`);
console.log(`   Artificial: ${artificialLiquidity.toFixed(3)} SOL`);
console.log(`   Total display: ${(existingTotalBets + artificialLiquidity).toFixed(3)} SOL`);

        // 🔧 TRANSFER: Only transfer valid bets from previous game
        let transferredBets = 0;
        for (const [walletAddress, bet] of existingBets) {
            if (bet.isValid && bet.betCollected && !bet.cashedOut) {
                console.log(`🔄 Transferring bet from ${walletAddress}: ${bet.betAmount} SOL`);
                currentGame.activeBets.set(walletAddress, bet);
                transferredBets++;
            } else {
                console.log(`🗑️ NOT transferring invalid/cashed bet from ${walletAddress}:`, {
                    isValid: bet.isValid,
                    betCollected: bet.betCollected,
                    cashedOut: bet.cashedOut
                });
            }
        }

        // 🔧 VERIFICATION: Log the final state
        console.log(`🎮 Game ${gameNumber} created:`);
        console.log(`   Active bets transferred: ${transferredBets}`);
        console.log(`   Total active bets: ${currentGame.activeBets.size}`);
        console.log(`   Active bet wallets:`, Array.from(currentGame.activeBets.keys()));

        const config = getCurrentGameConfig();
        const modeText = config._BOOTSTRAP_MODE ? `${config._BOOTSTRAP_LEVEL} bootstrap` : 'normal';
        console.log(`🎮 Trader Game ${gameNumber} started (${modeText}) - House: ${houseBalance.toFixed(3)} SOL`);

        io.emit('gameStarted', {
            gameId: currentGame.id,
            gameNumber,
            startTime: currentGame.startTime,
            serverTime: Date.now(),
            seed: currentGame.seed,
            maxMultiplier: crashPoint,
            preGameBets: existingTotalBets,
            preGamePlayers: existingTotalPlayers,
            boostedPlayerCount: currentGame.boostedPlayerCount, // 🎭 ADD THIS LINE
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
            activeBetsTransferred: transferredBets, // 🔧 NEW: Let frontend know how many bets transferred
            tradingState: {
                trend: tradingState.trend,
                momentum: tradingState.momentum
            }
        });

        runGameLoop(duration);

    } catch (error) {
        console.error('Error starting new game:', error);
        globalGameCounter--;
        if (globalGameCounter < 1) {
            globalGameCounter = 100;
        }
        setTimeout(() => {
            gameStartLock = false;
            startWaitingPeriod();
        }, 10000);
    } finally {
        gameStartLock = false;
    }
}

// GAME COUNTER FIX: Enhanced crashGame with persistent cycling counter
async function crashGame(): Promise<void> {
    if (!currentGame) {
        console.log('⚠️ No current game to crash');
        return;
    }

    const config = getCurrentGameConfig();
    const crashTime = Date.now();
    currentGame.status = 'crashed';
    const crashMultiplier = currentGame.currentMultiplier;

    console.log(`💥 Game ${currentGame.gameNumber} crashed at ${crashMultiplier}x`);

    let totalPayouts = 0;
    let totalLostBets = 0;
    
    // 🔧 FIX: Process ALL bets and clear active bet state
    for (const [walletAddress, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            // Player lost - house keeps the money
            totalLostBets += bet.betAmount;
            console.log(`📉 Bet lost: ${bet.betAmount} SOL from ${walletAddress} (User: ${bet.userId})`);
            
            // 🔧 CRITICAL: Clear active bet state in database
            try {
                await supabaseService
                    .from('player_bets')
                    .update({
                        profit_loss: -bet.betAmount,
                        status: 'lost',
                        crash_multiplier: crashMultiplier,
                        resolved_at: new Date().toISOString()
                    })
                    .eq('game_id', currentGame.id)
                    .eq('wallet_address', walletAddress);
                    
                console.log(`✅ Marked bet as lost in database for ${walletAddress}`);
            } catch (error) {
                console.error(`❌ Failed to update lost bet for ${walletAddress}:`, error);
            }
        } else {
            totalPayouts += bet.cashoutAmount || 0;
            console.log(`💸 Bet won: ${bet.cashoutAmount} SOL to ${walletAddress}`);
        }
    }
    
    // 🔧 FIX: Clear ALL active bets from memory
    console.log(`🧹 Clearing ${currentGame.activeBets.size} active bets from memory`);
    currentGame.activeBets.clear();
    
    const gameProfit = currentGame.totalBets - totalPayouts;
    
    console.log(`💰 Game ${currentGame.gameNumber} summary:`);
    console.log(`   Total bets: ${currentGame.totalBets.toFixed(3)} SOL`);
    console.log(`   Total payouts: ${totalPayouts.toFixed(3)} SOL`);
    console.log(`   Lost bets (house profit): ${totalLostBets.toFixed(3)} SOL`);
    console.log(`   Net house profit: ${gameProfit.toFixed(3)} SOL`);

    // Update house balance and emit events
    await updateHouseBalance();
    
    // Emit crash event with cleared state
    io.emit('gameCrashed', {
        gameId: currentGame.id,
        gameNumber: currentGame.gameNumber,
        crashMultiplier,
        serverTime: crashTime,
        timestamp: crashTime,
        finalMultiplier: crashMultiplier,
        totalBets: currentGame.totalBets,
        totalPlayers: currentGame.totalPlayers,
        totalPayouts,
        totalLostBets,
        houseProfit: gameProfit,
        houseBalance: houseBalance,
        activeBetsCleared: true, // 🔧 NEW: Confirm active bets cleared
        tradingState: {
            trend: tradingState.trend,
            rugPullTriggered: true
        }
    });

    // 🔧 FIX: Emit active bet clearing to frontend
    io.emit('activeBetsCleared', {
        gameId: currentGame.id,
        gameNumber: currentGame.gameNumber,
        timestamp: crashTime,
        message: 'All active bets have been resolved'
    });

    // Save game to history and clear current game
    // Save game to history and clear current game
gameHistory.push({ ...currentGame });
if (gameHistory.length > 100) {
    gameHistory = gameHistory.slice(-100);
}

// 🎭 Simulate liquidity drain after crash
triggerArtificialUpdate('crash');
console.log(`💥 Post-crash liquidity reset: ${artificialLiquidity.toFixed(3)} SOL artificial remaining`);

console.log(`✅ Game ${currentGame.gameNumber} completed and cleaned up`);
currentGame = null;
    
    // Start waiting period for next game
    setTimeout(() => {
        startWaitingPeriod();
    }, 1000);
}

// Enhanced transaction monitoring
async function monitorTransactionStatus(signature: string): Promise<{
    confirmed: boolean;
    finalBalance?: number;
    error?: string;
}> {
    try {
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
            const status = await solanaConnection.getSignatureStatus(signature);
            
            if (status.value?.confirmationStatus === 'confirmed' || 
                status.value?.confirmationStatus === 'finalized') {
                
                if (status.value.err) {
                    return {
                        confirmed: false,
                        error: `Transaction failed: ${JSON.stringify(status.value.err)}`
                    };
                }
                
                const newBalance = await updateHouseBalance();
                
                return {
                    confirmed: true,
                    finalBalance: newBalance
                };
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Timeout case - all attempts exhausted
        return {
            confirmed: false,
            error: 'Transaction confirmation timeout'
        };
        
    } catch (error) {
        return {
            confirmed: false,
            error: error instanceof Error ? error.message : 'Monitoring failed'
        };
    }
}

// Socket.io event handlers
io.use((socket, next) => {
    if (isShuttingDown) {
        socket.emit('serverMaintenance', {
            message: 'Server is under maintenance. Please reconnect in a few minutes.',
            estimatedDowntime: '2-5 minutes'
        });
        socket.disconnect(true);
        return;
    }
    next();
});
io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    if (currentGame) {
        const currentServerTime = Date.now();
        
        socket.emit('gameState', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            status: currentGame.status,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            boostedPlayerCount: currentGame.boostedPlayerCount, 
            boostedTotalBets: currentGame.boostedTotalBets,
            startTime: currentGame.startTime,
            maxMultiplier: currentGame.maxMultiplier,
            serverTime: currentServerTime,
            chartData: currentGame.chartData.slice(-60),
            seed: currentGame.seed,
            countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined,
            canBet: currentGame.status === 'waiting' || currentGame.status === 'active',
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
            // ADDED: Include active bets for this user to check
            activeBets: Array.from(currentGame.activeBets.entries()).map(([walletAddr, bet]) => ({
                walletAddress: walletAddr,
                userId: bet.userId,
                betAmount: bet.betAmount,
                entryMultiplier: bet.entryMultiplier,
                cashedOut: bet.cashedOut,
                isValid: bet.isValid,
                betCollected: bet.betCollected
            })),
            tradingState: {
                trend: tradingState.trend,
                momentum: tradingState.momentum,
                rugPullRisk: tradingState.rugPullProbability
            }
        });
    }

    socket.emit('gameHistory', gameHistory.slice(-10));

    socket.on('placeBet', async (data) => {
        const { walletAddress, betAmount, userId, signedTransaction } = data;
        
        try {
            console.log(`🎯 Processing bet request from ${walletAddress}: ${betAmount} SOL`);
            
            const result = await placeBet(walletAddress, betAmount, userId, signedTransaction);
            
            if (!result.success && result.unsignedTransaction) {
                socket.emit('betResult', { 
                    success: false,
                    reason: result.reason,
                    walletAddress, 
                    betAmount,
                    unsignedTransaction: result.unsignedTransaction,
                    instructions: {
                        message: 'Please sign this transaction with your wallet',
                        steps: [
                            '1. Your wallet will open automatically',
                            '2. Review the transaction details carefully',
                            '3. Confirm the transaction if everything looks correct',
                            '4. The bet will be placed once confirmed on blockchain'
                        ]
                    },
                    gameState: currentGame ? {
                        totalBets: currentGame.totalBets,
                        totalPlayers: currentGame.totalPlayers,
                        status: currentGame.status,
                        countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
                    } : null
                });
                return;
            }
            
            socket.emit('betResult', { 
                success: result.success,
                reason: result.reason,
                walletAddress, 
                betAmount,
                entryMultiplier: result.entryMultiplier,
                gameState: currentGame ? {
                    totalBets: currentGame.totalBets,
                    totalPlayers: currentGame.totalPlayers,
                    status: currentGame.status,
                    houseBalance: currentGame.houseBalance,
                    maxPayoutCapacity: currentGame.maxPayoutCapacity,
                    countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
                } : null
            });
            
        } catch (error) {
            console.error('❌ Socket bet processing error:', error);
            socket.emit('betResult', {
                success: false,
                reason: 'Server error processing bet request',
                walletAddress,
                betAmount
            });
        }
    });

    // ===== PRIVY WALLET REGISTRATION HANDLER =====
    socket.on('registerPrivyWallet', async (data) => {
        const { userId, privyWalletAddress, privyWalletId } = data;
        
        try {
            console.log(`🔗 Processing Privy wallet registration for ${userId}`);
            
            const result = await registerPrivyWallet(userId, privyWalletAddress, privyWalletId);
            
            socket.emit('privyWalletRegisterResult', {
                success: result.success,
                error: result.error,
                isNewUser: result.isNewUser, // ADD THIS LINE
                userId,
                privyWalletAddress,
                wallet: result.success ? privyIntegrationManager.privyWallets.get(userId) : null,
                message: result.success ? 
                    'Privy wallet registered successfully!' : 
                    `Registration failed: ${result.error}`,
                timestamp: Date.now()
            });
            
            // Broadcast wallet registration to admin/monitoring clients
            if (result.success) {
                io.emit('privyWalletRegistered', {
                    userId,
                    privyWalletAddress,
                    isNewUser: result.isNewUser, // ADD THIS LINE
                    totalPrivyWallets: privyIntegrationManager.totalPrivyWallets,
                    timestamp: Date.now()
                });
            };
            
            // Broadcast wallet registration to admin/monitoring clients
            if (result.success) {
                io.emit('privyWalletRegistered', {
                    userId,
                    privyWalletAddress,
                    totalPrivyWallets: privyIntegrationManager.totalPrivyWallets,
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            console.error('❌ Socket Privy wallet registration error:', error);
            socket.emit('privyWalletRegisterResult', {
                success: false,
                error: 'Server error during Privy wallet registration',
                userId,
                privyWalletAddress
            });
        }
    });

    // ===== CUSTODIAL BET HANDLER =====
    socket.on('custodialBet', async (data) => {
        const { userId, betAmount } = data;
        
        try {
            console.log(`🎯 Processing custodial bet from ${userId}: ${betAmount} SOL`);
            
            const result = await placeBetFromCustodialBalance(userId, betAmount);
            
            socket.emit('custodialBetResult', {
                success: result.success,
                reason: result.reason,
                userId,
                betAmount,
                entryMultiplier: result.entryMultiplier,
                custodialBalance: result.custodialBalance,
                timestamp: Date.now(),
                gameState: currentGame ? {
                    gameId: currentGame.id,
                    gameNumber: currentGame.gameNumber,
                    status: currentGame.status,
                    multiplier: currentGame.currentMultiplier,
                    totalBets: currentGame.totalBets,
                    totalPlayers: currentGame.totalPlayers,
                    countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
                } : null
            });
            
            // Broadcast bet placement to all clients
            if (result.success && currentGame) {
                io.emit('custodialBetPlaced', {
                    gameId: currentGame.id,
                    userId,
                    betAmount,
                    entryMultiplier: result.entryMultiplier,
                    totalBets: currentGame.totalBets,
                    totalPlayers: currentGame.totalPlayers,
                    gameStatus: currentGame.status,
                    betType: 'custodial',
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            console.error('❌ Socket custodial bet processing error:', error);
            socket.emit('custodialBetResult', {
                success: false,
                reason: 'Server error processing bet request',
                userId,
                betAmount
            });
        }
    });

// 🔧 FIXED: Complete socket handlers with proper error handling

// Custodial Bet Handler
socket.on('custodialBet', async (data) => {
    const { userId, betAmount } = data;
    
    try {
        console.log(`🎯 Processing custodial bet from ${userId}: ${betAmount} SOL`);
        
        // 🔧 CRITICAL: Input validation
        if (!userId || typeof userId !== 'string') {
            socket.emit('custodialBetResult', {
                success: false,
                reason: 'Invalid user ID provided',
                userId,
                betAmount,
                timestamp: Date.now()
            });
            return;
        }
        
        if (!betAmount || typeof betAmount !== 'number' || betAmount <= 0) {
            socket.emit('custodialBetResult', {
                success: false,
                reason: 'Invalid bet amount provided',
                userId,
                betAmount,
                timestamp: Date.now()
            });
            return;
        }
        
        // Call the custodial bet function
        const result = await placeBetFromCustodialBalance(userId, betAmount);
        
        console.log(`📊 Custodial bet result for ${userId}:`, result);
        
        // 🔧 CRITICAL: Always emit complete response
        socket.emit('custodialBetResult', {
            success: result.success,
            reason: result.reason,
            entryMultiplier: result.entryMultiplier,
            custodialBalance: result.custodialBalance,
            userId,
            betAmount,
            timestamp: Date.now(),
            gameState: currentGame ? {
                gameId: currentGame.id,
                gameNumber: currentGame.gameNumber,
                status: currentGame.status,
                multiplier: currentGame.currentMultiplier,
                totalBets: currentGame.totalBets,
                totalPlayers: currentGame.totalPlayers,
                countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
            } : null
        });
        
        // Broadcast bet placement to all clients if successful
        if (result.success && currentGame) {
            io.emit('custodialBetPlaced', {
                gameId: currentGame.id,
                userId,
                betAmount,
                entryMultiplier: result.entryMultiplier,
                totalBets: currentGame.totalBets,
                totalPlayers: currentGame.totalPlayers,
                gameStatus: currentGame.status,
                betType: 'custodial',
                timestamp: Date.now()
            });
        }
        
    } catch (error) {
        console.error('❌ Socket custodial bet processing error:', error);
        
        // 🔧 CRITICAL: Always emit response, even on error
        socket.emit('custodialBetResult', {
            success: false,
            reason: error instanceof Error ? error.message : 'Server error processing bet request',
            userId,
            betAmount,
            timestamp: Date.now()
        });
    }
});

// 🔧 FIXED: Custodial Cashout Handler (your current code was missing catch block)
socket.on('custodialCashOut', async (data) => {
    const { userId, walletAddress } = data;
    
    try {
        console.log(`💸 Processing custodial cashout request from ${userId}`);
        
        // 🔧 CRITICAL: Input validation
        if (!userId || typeof userId !== 'string') {
            socket.emit('custodialCashOutResult', {
                success: false,
                reason: 'Invalid user ID provided',
                userId,
                walletAddress,
                timestamp: Date.now()
            });
            return;
        }
        
        if (!walletAddress || typeof walletAddress !== 'string') {
            socket.emit('custodialCashOutResult', {
                success: false,
                reason: 'Invalid wallet address provided',
                userId,
                walletAddress,
                timestamp: Date.now()
            });
            return;
        }
        
        // Call the custodial cashout function
        const result = await cashOutToCustodialBalance(userId, walletAddress);
        
        console.log(`📊 Custodial cashout result for ${userId}:`, result);
        
        // 🔧 CRITICAL: Always emit complete response
        socket.emit('custodialCashOutResult', {
            success: result.success,
            reason: result.reason,
            payout: result.payout,
            custodialBalance: result.custodialBalance,
            userId,
            walletAddress,
            timestamp: Date.now()
        });
        
        // Broadcast cashout to all clients if successful
        if (result.success && result.payout) {
            io.emit('custodialCashout', {
                gameId: currentGame?.id,
                userId,
                walletAddress,
                entryMultiplier: 0, // You might want to get this from the active bet
                cashoutMultiplier: currentGame?.currentMultiplier || 0,
                growthRatio: 0, // Calculate if needed
                amount: result.payout,
                profit: result.payout, // Adjust based on your calculation
                isLoss: false,
                custodialBalance: result.custodialBalance,
                timestamp: Date.now()
            });
        }
        
    } catch (error) {
        console.error('❌ Socket custodial cashout processing error:', error);
        
        // 🔧 CRITICAL: Always emit response, even on error
        socket.emit('custodialCashOutResult', {
            success: false,
            reason: error instanceof Error ? error.message : 'Server error processing cashout request',
            userId,
            walletAddress,
            timestamp: Date.now()
        });
    }
});

// 🔧 OPTIONAL: Add debugging socket handlers
socket.on('debugCustodialBet', async (data) => {
    const { userId, betAmount = 0.005 } = data;
    
    try {
        console.log(`🧪 DEBUG: Testing custodial bet for ${userId} with ${betAmount} SOL`);
        
        // Check user exists
        const { data: userData, error: userError } = await supabaseService
            .from('users_unified')
            .select('id, username, custodial_balance, external_wallet_address')
            .eq('id', userId)
            .single();
        
        if (userError || !userData) {
            socket.emit('debugCustodialBetResult', {
                success: false,
                step: 'user_lookup',
                error: userError?.message || 'User not found',
                userId
            });
            return;
        }
        
        // Check game state
        const gameAvailable = currentGame && (currentGame.status === 'active' || currentGame.status === 'waiting');
        
        // Test the function without actually placing bet
        socket.emit('debugCustodialBetResult', {
            success: true,
            debug: {
                userFound: true,
                userName: userData.username,
                custodialBalance: parseFloat(userData.custodial_balance) || 0,
                hasEnoughBalance: (parseFloat(userData.custodial_balance) || 0) >= betAmount,
                gameAvailable,
                gameStatus: currentGame?.status,
                gameId: currentGame?.id,
                countdown: currentGame?.status === 'waiting' ? countdownTimeRemaining : null,
                minBet: getCurrentGameConfig().MIN_BET,
                maxBet: getCurrentGameConfig().MAX_BET
            },
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Debug custodial bet error:', error);
        socket.emit('debugCustodialBetResult', {
            success: false,
            step: 'debug_error',
            error: error instanceof Error ? error.message : 'Unknown debug error',
            userId
        });
    }
});

// 🔧 OPTIONAL: Ping handler for testing connectivity
socket.on('ping', (data) => {
    console.log(`🏓 Ping received from ${socket.id}:`, data);
    socket.emit('pong', {
        ...data,
        serverTime: Date.now(),
        socketId: socket.id
    });
});
    
    socket.on('cashOut', async (data) => {
        const { walletAddress } = data;
        const result = await cashOut(walletAddress);
        
        socket.emit('cashOutResult', { 
            success: result.success,
            reason: result.reason,
            payout: result.payout,
            walletAddress 
        });
    });

    socket.on('checkTransactionStatus', async (data) => {
        const { signature } = data;
        
        try {
            const status = await monitorTransactionStatus(signature);
            socket.emit('transactionStatus', {
                signature,
                ...status
            });
        } catch (error) {
            socket.emit('transactionStatus', {
                signature,
                confirmed: false,
                error: 'Failed to check transaction status'
            });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`👋 Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on('authenticateUser', async (data) => {
        const { walletAddress, privyUserId, privyWalletAddress } = data;
        
        try {
            console.log(`🔐 Processing user authentication for wallet ${walletAddress}`);
            
            // Get or create user by their main wallet address
            const userResult = await getOrCreateUser(walletAddress);
            
            // If they also have a Privy wallet, register it
            if (privyWalletAddress) {
                console.log(`🔗 Also registering Privy wallet: ${privyWalletAddress}`);
                
                const privyResult = await registerPrivyWallet(
                    userResult.userId, 
                    privyWalletAddress, 
                    privyUserId
                );
                
                if (!privyResult.success) {
                    console.warn(`⚠️ Privy wallet registration failed: ${privyResult.error}`);
                }
            }
            
            // Check for any pending deposits for this wallet
            await resolvePendingDepositsForUser(walletAddress);
            
            socket.emit('authenticationResult', {
                success: true,
                userId: userResult.userId,
                isNewUser: userResult.isNewUser,
                userProfile: userResult.userProfile,
                privyWalletRegistered: !!privyWalletAddress,
                message: userResult.isNewUser ? 
                    'Welcome! Your account has been created.' : 
                    'Welcome back!',
                timestamp: Date.now()
            });
            
            console.log(`✅ User authentication complete: ${userResult.userId} (${userResult.isNewUser ? 'NEW' : 'EXISTING'})`);
            
        } catch (error) {
            console.error('❌ User authentication error:', error);
            socket.emit('authenticationResult', {
                success: false,
                error: 'Authentication failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
});


// Periodic updates
setInterval(() => {
    if (currentGame && currentGame.status === 'active') {
        const config = getCurrentGameConfig();
        
        io.emit('serverSync', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            serverTime: Date.now(),
            status: currentGame.status,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            boostedPlayerCount: currentGame.boostedPlayerCount, // 🎭 ADD THIS LINE
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
            tradingState: {
                trend: tradingState.trend,
                rugPullRisk: tradingState.rugPullProbability
            },
            // Enhanced with hybrid system data
            hybridStats: {
                totalCustodialBalance: hybridSystemStats.totalCustodialBalance,
                activeGamingUsers: hybridSystemStats.activeGamingUsers,
                totalUsers: hybridSystemStats.totalUsers
            },
            gameConfig: {
                custodialBettingEnabled: true,
                instantCashoutEnabled: true,
                minBetAmount: config.MIN_BET,
                maxBetAmount: config.MAX_BET,
                houseEdge: config.HOUSE_EDGE,
                bootstrapMode: config._BOOTSTRAP_MODE,
                bootstrapLevel: config._BOOTSTRAP_LEVEL
            }
        });
        
        // Also emit custodial balance updates for active users
        io.emit('hybridSystemSync', {
            stats: hybridSystemStats,
            timestamp: Date.now(),
            activeGame: {
                gameId: currentGame.id,
                status: currentGame.status,
                multiplier: currentGame.currentMultiplier
            }
        });
    }
}, 5000);

// Enhanced house balance update (PRIVATE - no user broadcasts)
setInterval(async () => {
    const oldBalance = houseBalance;
    await updateHouseBalance();
    
    if (currentGame) {
        currentGame.houseBalance = houseBalance;
        currentGame.maxPayoutCapacity = calculateMaxPayoutCapacity();
    }
    
    // Update hybrid system stats
    updateHybridSystemStats();
    
    // 🔒 PRIVATE: Only log significant changes to server console
    if (Math.abs(houseBalance - oldBalance) > 0.01) {
        console.log(`🏛️ House balance updated: ${oldBalance.toFixed(3)} → ${houseBalance.toFixed(3)} SOL (${(houseBalance - oldBalance >= 0 ? '+' : '')}${(houseBalance - oldBalance).toFixed(3)})`);
        
        // 🔒 ADMIN ONLY: Send sensitive data only to admin room
        io.to('admin_monitoring').emit('adminHouseBalanceUpdate', {
            oldBalance,
            newBalance: houseBalance,
            change: houseBalance - oldBalance,
            maxPayoutCapacity: calculateMaxPayoutCapacity(),
            timestamp: Date.now(),
            source: 'periodic_update'
        });
        
        // Only emit non-sensitive capacity info to users
        io.emit('gameCapacityUpdate', {
            maxPayoutCapacity: calculateMaxPayoutCapacity(),
            canAcceptLargeBets: houseBalance > 50, // Boolean indicator only
            timestamp: Date.now()
        });
    }
}, 30000);

// Enhanced Privy wallet monitoring (every 2 minutes)
setInterval(async () => {
    try {
        console.log('🔄 Updating Privy wallet balances...');
        
        let balanceChanges = 0;
        const oldStats = { ...privyIntegrationManager };
        
        // Update all Privy wallet balances
        for (const [userId] of privyIntegrationManager.privyWallets) {
            const oldWallet = privyIntegrationManager.privyWallets.get(userId);
            const oldBalance = oldWallet?.balance || 0;
            
            const newBalance = await updatePrivyWalletBalance(userId);
            
            // Check for significant balance changes
            if (Math.abs(newBalance - oldBalance) > 0.01) {
                balanceChanges++;
                console.log(`💰 Balance change: User ${userId} - ${oldBalance.toFixed(3)} → ${newBalance.toFixed(3)} SOL`);
                
                // Broadcast balance update for significant changes
                io.emit('privyBalanceUpdate', {
                    userId,
                    oldBalance,
                    newBalance,
                    change: newBalance - oldBalance,
                    timestamp: Date.now()
                });
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Update hybrid system stats
        updateHybridSystemStats();
        
        // Broadcast stats update if there were changes
        if (balanceChanges > 0 || Math.abs(privyIntegrationManager.totalPrivyBalance - oldStats.totalPrivyBalance) > 0.1) {
            io.emit('privyIntegrationStatsUpdate', {
                stats: {
                    totalPrivyWallets: privyIntegrationManager.totalPrivyWallets,
                    connectedPrivyWallets: privyIntegrationManager.connectedPrivyWallets,
                    totalPrivyBalance: privyIntegrationManager.totalPrivyBalance,
                    balanceChanges
                },
                hybridStats: hybridSystemStats,
                timestamp: Date.now()
            });
        }
        
        console.log(`✅ Privy balance update complete: ${balanceChanges} changes detected`);
        
    } catch (error) {
        console.error('❌ Privy wallet monitoring error:', error);
    }
}, 120000); // Every 2 minutes

// TRANSACTION MONITORING - Add this to your startup sequence
setInterval(async () => {
    await monitorAndUpdateDatabase();
}, 30000); // Monitor every 30 seconds

// Check for pending deposits every 2 minutes
setInterval(async () => {
    await resolvePendingDeposits();
}, 120000);

// REST API endpoints
app.get('/api/health', async (req, res): Promise<void> => {
    await updateHouseBalance();
    const config = getCurrentGameConfig();
    const stats = calculateRollingStats();
    
    void res.json({ 
        status: 'healthy', 
        timestamp: Date.now(),
        serverTime: new Date().toISOString(),
        houseBalance: houseBalance,
        maxPayoutCapacity: calculateMaxPayoutCapacity(),
        multiplierControl: {
            recentGamesCount: multiplierControl.recentGames.length,
            consecutiveHighCount: multiplierControl.consecutiveHighCount,
            rollingHouseProfitRatio: stats.houseProfitRatio,
            cooldownActive: multiplierControl.cooldownActive,
            cooldownUntil: multiplierControl.cooldownUntil,
            lastHighMultiplier: multiplierControl.lastHighMultiplier
        },
        currentGame: currentGame ? {
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            status: currentGame.status,
            startTime: currentGame.startTime,
            totalPlayers: currentGame.totalPlayers,
            boostedPlayerCount: currentGame.boostedPlayerCount, // 🎭 ADD THIS LINE
            liquidityBreakdown: {
                realBets: currentGame.totalBets,
                artificialLiquidity: artificialLiquidity,
                baseGameLiquidity: baseGameLiquidity,
                liquidityGrowth: artificialLiquidity - baseGameLiquidity,
                growthRate: currentLiquidityProfile.growthRate
            },
    artificialPlayerCount: artificialPlayerCount, // 🎭 ADD THIS LINE
            totalBets: currentGame.totalBets,
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
            countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined,
            tradingState: {
                trend: tradingState.trend,
                rugPullRisk: tradingState.rugPullProbability
            }
        } : null,
        mode: currentGame?.id.startsWith('memory-') ? 'memory' : 'database',
        uptime: process.uptime(),
        walletIntegration: 'direct_blockchain',
        nodeEnv: NODE_ENV,
        _bootstrap: config._BOOTSTRAP_MODE ? {
            active: true,
            level: config._BOOTSTRAP_LEVEL,
            gamesPlayed: bootstrapState.currentSessionGames,
            sessionProfit: bootstrapState.currentSessionProfit,
            lifetimeProfit: bootstrapState.lifetimeProfitGenerated,
            targetBalance: BOOTSTRAP_CONFIG.EXIT_BOOTSTRAP_THRESHOLD,
            currentBalance: houseBalance,
            progress: (houseBalance / BOOTSTRAP_CONFIG.EXIT_BOOTSTRAP_THRESHOLD) * 100,
            timeElapsed: Date.now() - (bootstrapState.currentSessionStart || BOOTSTRAP_CONFIG.INITIAL_START_TIME),
            settings: {
                houseEdge: config.HOUSE_EDGE,
                maxPayout: config.MAX_SINGLE_PAYOUT,
                maxBet: config.MAX_BET,
                maxMultiplier: config.MAX_MULTIPLIER
            }
        } : { active: false }
    });
});

// Add this API endpoint to check FOMO status
app.get('/api/bootstrap/fomo-status', (req, res): void => {
    const config = getCurrentGameConfig();
    const recentFomo = BOOTSTRAP_FOMO_SYSTEM.recentFomoHistory.slice(-10);
    
    res.json({
        system: 'bootstrap_fomo',
        enabled: BOOTSTRAP_FOMO_SYSTEM.enabled,
        bootstrapMode: config._BOOTSTRAP_MODE,
        bootstrapLevel: config._BOOTSTRAP_LEVEL,
        currentState: {
            emptyStreak: BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak,
            fomoStreak: BOOTSTRAP_FOMO_SYSTEM.currentFomoStreak,
            gameIsEmpty: isGameEffectivelyEmpty(),
            realBets: currentGame?.totalBets || 0,
            emptyThreshold: BOOTSTRAP_FOMO_SYSTEM.noPlayersThreshold
        },
        configuration: {
            fomoChance: BOOTSTRAP_FOMO_SYSTEM.fomoChance,
            multiplierRange: BOOTSTRAP_FOMO_SYSTEM.fomoMultiplierRange,
            consecutiveLimit: BOOTSTRAP_FOMO_SYSTEM.consecutiveFomoLimit,
            breakChance: BOOTSTRAP_FOMO_SYSTEM.fomoBreakChance
        },
        recentFomoEvents: recentFomo.map(event => ({
            gameNumber: event.gameNumber,
            multiplier: event.multiplier,
            minutesAgo: (Date.now() - event.timestamp) / 60000,
            wasEmpty: event.wasEmpty
        })),
        nextFomoEligible: BOOTSTRAP_FOMO_SYSTEM.currentEmptyStreak >= BOOTSTRAP_FOMO_SYSTEM.minEmptyGamesBeforeFomo,
        timestamp: Date.now()
    });
});

// Add this to your game server
// Add this to your game server - FIXED Transfer Endpoint
// Replace your existing '/api/transfer/privy-to-custodial' endpoint with this

app.post('/api/transfer/privy-to-custodial', async (req, res): Promise<void> => {
    try {
        const { userId, amount, signedTransaction, walletAddress } = req.body;
        
        // 🔥 ENHANCED: Better validation and logging
        console.log(`💳 TRANSFER API: Request received`, {
            userId: userId || 'MISSING',
            amount: amount || 'MISSING',
            walletAddress: walletAddress || 'MISSING',
            hasSignedTx: !!signedTransaction,
            bodyKeys: Object.keys(req.body)
        });

        // 🔥 CRITICAL: Validate userId first
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            console.error(`❌ TRANSFER API: Missing or invalid userId in request body:`, {
                userId,
                type: typeof userId,
                receivedBody: req.body
            });
            res.status(400).json({
                success: false,
                error: 'Missing required field: userId',
                received: Object.keys(req.body),
                debug: { userId, type: typeof userId }
            });
            return;
        }

        if (!amount || isNaN(parseFloat(amount))) {
            console.error(`❌ TRANSFER API: Invalid amount: ${amount}`);
            res.status(400).json({
                success: false,
                error: 'Missing or invalid amount',
                received: { amount }
            });
            return;
        }

        if (!walletAddress) {
            console.error(`❌ TRANSFER API: Missing walletAddress`);
            res.status(400).json({
                success: false,
                error: 'Missing required field: walletAddress'
            });
            return;
        }

        const transferAmount = parseFloat(amount);

        if (transferAmount <= 0 || transferAmount > 10) {
            res.status(400).json({
                success: false,
                error: 'Invalid amount. Must be between 0 and 10 SOL'
            });
            return;
        }

        // 🔥 ENHANCED: Check if user exists in unified table
        console.log(`🔍 TRANSFER API: Checking if user ${userId} exists...`);
        
        const { data: userData, error: userError } = await supabaseService
            .from('users_unified')
            .select('id, username, custodial_balance, external_wallet_address')
            .eq('id', userId)
            .single();

        if (userError || !userData) {
            console.error(`❌ TRANSFER API: User ${userId} not found in database:`, userError);
            res.status(404).json({
                success: false,
                error: 'User not found. Please authenticate first.',
                userId: userId,
                debug: { userError: userError?.message }
            });
            return;
        }

        console.log(`✅ TRANSFER API: User found - ${userData.username} (${userData.id})`);
        console.log(`💰 TRANSFER API: Current custodial balance: ${userData.custodial_balance} SOL`);

        // Step 1: Return unsigned transaction if no signed transaction provided
        if (!signedTransaction) {
            console.log(`📝 TRANSFER API: Creating unsigned transaction for ${transferAmount} SOL`);
            
            try {
                const userPublicKey = new PublicKey(walletAddress);
                const transaction = await createTransaction(userPublicKey, housePublicKey, transferAmount);
                
                const { blockhash } = await solanaConnection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = userPublicKey;
                
                // Add memo for tracking
                const memo = `transfer-${userId}-${Date.now()}`;
                transaction.add(
                    new TransactionInstruction({
                        keys: [],
                        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
                        data: Buffer.from(memo, 'utf8')
                    })
                );
                
                const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
                const base64Transaction = serializedTransaction.toString('base64');
                
                console.log(`✅ TRANSFER API: Unsigned transaction created for ${userId}`);
                
                res.json({
                    success: false, // False because not completed yet
                    unsignedTransaction: base64Transaction,
                    transferId: `transfer-${userId}-${Date.now()}`,
                    message: 'Transaction created - please sign and resubmit',
                    userId: userId // Include userId in response for debugging
                });
                return;
                
            } catch (error) {
                console.error('❌ TRANSFER API: Failed to create unsigned transaction:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to create transaction',
                    userId: userId
                });
                return;
            }
        }

        // Step 2: Process signed transaction
        console.log(`🔗 TRANSFER API: Processing signed transaction for ${userId}`);
        
        try {
            const transactionBuffer = Buffer.from(signedTransaction, 'base64');
            
            // Submit to blockchain
            const signature = await solanaConnection.sendRawTransaction(
                transactionBuffer,
                { skipPreflight: false, preflightCommitment: 'confirmed' }
            );
            
            console.log(`📡 TRANSFER API: Transaction submitted: ${signature}`);
            
            // Wait for confirmation with timeout
            const confirmation = await Promise.race([
                solanaConnection.confirmTransaction(signature, 'confirmed'),
                new Promise<any>((_, reject) => 
                    setTimeout(() => reject(new Error('Transaction timeout')), 30000)
                )
            ]);
            
            if (confirmation && confirmation.value && confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }
            
            console.log(`✅ TRANSFER API: Transaction confirmed: ${signature}`);
            
            // 🔥 ENHANCED: Update user balance using the corrected RPC
            console.log(`💰 TRANSFER API: Updating balance for user ${userId}...`);
            
            const { data: balanceResult, error: balanceError } = await supabaseService
                .rpc('update_unified_user_balance', {
                    p_user_id: userId,
                    p_custodial_change: transferAmount,
                    p_privy_change: 0,
                    p_embedded_change: 0,
                    p_transaction_type: 'privy_to_custodial_transfer',
                    p_transaction_id: signature,
                    p_game_id: currentGame?.id || null,
                    p_is_deposit: false,
                    p_deposit_amount: 0
                });

            if (balanceError) {
                console.error(`❌ TRANSFER API: Balance update failed for ${userId}:`, balanceError);
                res.status(500).json({
                    success: false,
                    error: 'Transaction completed but balance update failed',
                    transactionId: signature,
                    userId: userId,
                    criticalError: true,
                    debug: { balanceError: balanceError.message }
                });
                return;
            }

            if (!balanceResult || balanceResult.length === 0) {
                console.error(`❌ TRANSFER API: No balance result returned from RPC for ${userId}`);
                res.status(500).json({
                    success: false,
                    error: 'Balance update returned no results',
                    transactionId: signature,
                    userId: userId
                });
                return;
            }

            const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);
            const newTotalBalance = parseFloat(balanceResult[0].new_total_balance || balanceResult[0].new_custodial_balance);
            
            console.log(`💰 TRANSFER API: Balance updated successfully for ${userId}:`);
            console.log(`   Old custodial balance: ${userData.custodial_balance} SOL`);
            console.log(`   New custodial balance: ${newCustodialBalance.toFixed(6)} SOL`);
            console.log(`   Transfer amount: ${transferAmount} SOL`);
            console.log(`   Transaction: ${signature}`);

            // Update house balance
            await updateHouseBalance();

            // 🔥 ENHANCED: Emit multiple socket events for better frontend updates
            console.log(`📡 TRANSFER API: Broadcasting balance updates for ${userId}...`);

            // Main custodial balance update event
            io.emit('custodialBalanceUpdate', {
                userId: userId,
                custodialBalance: newCustodialBalance,
                totalBalance: newTotalBalance,
                change: transferAmount,
                transactionType: 'privy_to_custodial_transfer',
                transactionId: signature,
                updateType: 'transfer_completed',
                timestamp: Date.now(),
                source: 'transfer_api'
            });

            // User-specific balance update
            io.emit('userBalanceUpdate', {
                userId: userId,
                walletAddress: walletAddress,
                balanceType: 'custodial',
                oldBalance: parseFloat(userData.custodial_balance) || 0,
                newBalance: newCustodialBalance,
                change: transferAmount,
                transactionType: 'transfer',
                transactionSignature: signature,
                timestamp: Date.now(),
                source: 'privy_transfer_api'
            });

            // Transfer completion event
            io.emit('transferCompleted', {
                userId: userId,
                transferType: 'privy_to_custodial',
                amount: transferAmount,
                transactionId: signature,
                newCustodialBalance: newCustodialBalance,
                timestamp: Date.now()
            });

            console.log(`✅ TRANSFER API: All socket events emitted for ${userId}`);

            res.json({
                success: true,
                transactionId: signature,
                transferDetails: {
                    amount: transferAmount,
                    newBalance: newCustodialBalance,
                    newTotalBalance: newTotalBalance,
                    fromWallet: walletAddress,
                    toAccount: 'custodial_balance',
                    userId: userId
                },
                message: 'Transfer completed successfully'
            });

        } catch (error) {
            console.error(`❌ TRANSFER API: Transfer processing error for ${userId}:`, error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Transfer failed',
                userId: userId
            });
        }

    } catch (error) {
        console.error('❌ TRANSFER API: Unexpected error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ===== HYBRID SYSTEM API =====
app.get('/api/hybrid/status', (req, res): void => {
    updateHybridSystemStats();
    
    void res.json({
        system: 'hybrid',
        timestamp: Date.now(),
        stats: hybridSystemStats,
        config: {
            maxCustodialBalance: 10.0,
            recommendedGamingBalance: 2.0,
            autoTransferThreshold: 5.0
        },
        health: {
            databaseConnected: true,
            walletsLoaded: hybridUserWallets.size,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        }
    });
});
// Add to your server for debugging
app.get('/api/debug/transfer-test/:userId', async (req, res): Promise<void> => {
    try {
        const { userId } = req.params;
        
        // Check user in unified table
        const { data: userData, error: userError } = await supabaseService
            .from('users_unified')
            .select('*')
            .eq('id', userId)
            .single();
        
        res.json({
            userFound: !userError,
            userData: userData ? {
                id: userData.id,
                custodial_balance: userData.custodial_balance,
                privy_balance: userData.privy_balance,
                total_balance: userData.custodial_balance + userData.privy_balance + userData.embedded_balance
            } : null,
            error: userError?.message,
            serverInfo: {
                houseWallet: HOUSE_WALLET_ADDRESS,
                houseBalance: houseBalance,
                gameActive: !!currentGame
            }
        });
    } catch (error) {
        res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        });
    }
});
app.get('/api/custodial/balance/:userId', async (req, res): Promise<void> => {
    try {
        const { userId } = req.params;
        
        // Fetch from unified table
        const { data: userData, error } = await supabaseService
            .from('users_unified') // ✅ Changed from user_hybrid_wallets
            .select('*')
            .eq('id', userId) // ✅ Changed from user_id
            .single();
        
        if (error || !userData) {
            res.status(404).json({
                error: 'User not found',
                userId,
                hint: 'User needs to be created first'
            });
            return;
        }
        
        res.json({
            userId,
            walletAddress: userData.external_wallet_address || userData.wallet_address,
            custodialBalance: parseFloat(userData.custodial_balance) || 0,
            privyBalance: parseFloat(userData.privy_balance) || 0,
            embeddedBalance: parseFloat(userData.embedded_balance) || 0,
            totalDeposited: parseFloat(userData.total_deposited) || 0,
            lastDeposit: userData.last_custodial_deposit,
            canBet: (parseFloat(userData.custodial_balance) || 0) >= 0.001,
            canCashOut: (parseFloat(userData.custodial_balance) || 0) > 0,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('Error in /api/custodial/balance:', error);
        res.status(500).json({
            error: 'Failed to get custodial balance',
            userId: req.params.userId
        });
    }
});

// Manual trigger endpoint for testing
app.post('/api/admin/trigger-monitor', async (req, res): Promise<void> => {
    try {
        console.log('🔧 Manual monitor trigger requested...');
        
        // Run the transaction monitor immediately
        await monitorAndUpdateDatabase();
        
        // Also check for pending deposits
        await resolvePendingDeposits();
        
        res.json({
            success: true,
            message: 'Transaction monitor executed manually',
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Manual trigger error:', error);
        res.status(500).json({
            error: 'Failed to execute manual monitor',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// 🔒 ADMIN ONLY: Private house balance endpoint (requires admin key)
app.get('/api/admin/house-balance', async (req, res): Promise<void> => {
    try {
        const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
        
        if (adminKey !== process.env.ADMIN_SECRET_KEY) {
            res.status(401).json({
                error: 'Unauthorized - Invalid admin key'
            });
            return;
        }
        
        await updateHouseBalance();
        
        res.json({
            houseBalance: houseBalance,
            maxPayoutCapacity: calculateMaxPayoutCapacity(),
            lastUpdated: lastHouseBalanceUpdate,
            timestamp: Date.now(),
            status: 'healthy'
        });
        
    } catch (error) {
        console.error('❌ Admin house balance error:', error);
        res.status(500).json({
            error: 'Failed to get house balance',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// FIXED: Error handling middleware with explicit return
app.use((req, res, next) => {
    if (isShuttingDown) {
        res.status(503).json({
            error: 'Server is shutting down for maintenance',
            message: 'Please try again in a few minutes',
            estimatedDowntime: '2-5 minutes'
        });
        return;
    }
    next();
});
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction): void => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: NODE_ENV === 'production' ? 'Internal server error' : error.message 
    });
    return;
});

// Graceful shutdown
// Enhanced graceful shutdown handler - Add this to your server code

let isShuttingDown = false;
let shutdownInProgress = false;

async function gracefulShutdown(signal: string): Promise<void> {
    if (shutdownInProgress) {
        console.log('⚠️ Shutdown already in progress...');
        return;
    }
    
    shutdownInProgress = true;
    console.log(`🛑 ${signal} received - Starting graceful shutdown...`);
    
    try {
        // 1. STOP ACCEPTING NEW CONNECTIONS
        console.log('📡 Stopping new connections...');
        isShuttingDown = true;
        
        // Stop accepting new bets
        io.emit('serverShutdown', {
            message: 'Server is shutting down for updates. Please wait before placing new bets.',
            estimatedDowntime: '2-5 minutes',
            timestamp: Date.now()
        });
        
        // 2. SAVE ACTIVE GAME STATE
        if (currentGame) {
            console.log(`🎮 Saving active game ${currentGame.gameNumber} state...`);
            await saveActiveGameState();
        }
        
        // 3. RESOLVE ALL PENDING TRANSACTIONS
        console.log('💰 Resolving pending transactions...');
        await resolvePendingTransactions();
        
        // 4. SYNC ALL USER BALANCES
        console.log('🔄 Syncing all user balances...');
        await syncAllUserBalances();
        
        // 5. SAVE CRITICAL SYSTEM STATE
        console.log('💾 Saving system state...');
        await saveSystemState();
        
        // 6. FINAL TRANSACTION MONITORING SWEEP
        console.log('🔍 Final transaction monitoring sweep...');
        await monitorAndUpdateDatabase();
        await resolvePendingDeposits();
        
        console.log('✅ Graceful shutdown complete');
        
    } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
    }
    
    // Close server
    server.close(() => {
        console.log('🚪 Server closed successfully');
        process.exit(0);
    });
    
    // Force exit after 30 seconds
    setTimeout(() => {
        console.log('⏰ Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
}

// Enhanced save active game state function
async function saveActiveGameState(): Promise<void> {
    // Add early return if no current game
    if (!currentGame) {
        console.log('ℹ️ No current game to save');
        return;
    }
    
    // Create a local constant to help TypeScript understand it's not null
    const gameToSave = currentGame;
    
    try {
        console.log(`💾 Saving active game ${gameToSave.gameNumber} with ${gameToSave.activeBets.size} active bets...`);
        
        // Save game state to database
        const gameStateData = {
            game_id: gameToSave.id,
            game_number: gameToSave.gameNumber,
            current_multiplier: gameToSave.currentMultiplier,
            max_multiplier: gameToSave.maxMultiplier,
            status: gameToSave.status,
            total_bets: gameToSave.totalBets,
            total_players: gameToSave.totalPlayers,
            start_time: new Date(gameToSave.startTime).toISOString(),
            seed: gameToSave.seed,
            house_balance: gameToSave.houseBalance,
            shutdown_saved: true,
            saved_at: new Date().toISOString()
        };
        
        await supabaseService
            .from('game_state_snapshots')
            .upsert(gameStateData);
        
        // Save all active bets - using local constant
        if (gameToSave.activeBets && gameToSave.activeBets.size > 0) {
            const activeBetsData = Array.from(gameToSave.activeBets.entries()).map(([walletAddress, bet]) => ({
                game_id: gameToSave.id,
                wallet_address: walletAddress,
                user_id: bet.userId,
                bet_amount: bet.betAmount,
                entry_multiplier: bet.entryMultiplier,
                placed_at: new Date(bet.placedAt).toISOString(),
                is_valid: bet.isValid,
                bet_collected: bet.betCollected,
                cashed_out: bet.cashedOut,
                cashout_multiplier: bet.cashoutMultiplier,
                cashout_amount: bet.cashoutAmount,
                transaction_id: bet.transactionId,
                shutdown_saved: true
            }));
            
            await supabaseService
                .from('active_bets_snapshots')
                .upsert(activeBetsData);
                
            console.log(`✅ Saved ${activeBetsData.length} active bets to database`);
        } else {
            console.log('ℹ️ No active bets to save');
        }
        
        // Save artificial liquidity state - using local constant
        await supabaseService
            .from('system_state')
            .upsert({
                id: 'artificial_liquidity',
                data: {
                    artificialLiquidity,
                    baseGameLiquidity,
                    artificialPlayerCount,
                    currentLiquidityProfile,
                    gameCounter: globalGameCounter,
                    savedAt: Date.now()
                },
                updated_at: new Date().toISOString()
            });
        
    } catch (error) {
        console.error('❌ Failed to save active game state:', error);
        throw error;
    }
}

// Resolve all pending transactions
async function resolvePendingTransactions(): Promise<void> {
    try {
        console.log('🔄 Checking for pending transactions...');
        
        // Check all active transfers
        for (const [transferId, transfer] of activeTransfers) {
            if (transfer.status === 'pending' || transfer.status === 'processing') {
                console.log(`⏳ Resolving pending transfer: ${transferId}`);
                
                if (transfer.transactionId) {
                    // Check transaction status
                    const status = await monitorTransactionStatus(transfer.transactionId);
                    
                    if (status.confirmed) {
                        transfer.status = 'completed';
                        transfer.completedAt = Date.now();
                        await saveTransferToDatabase(transfer);
                        console.log(`✅ Transfer ${transferId} confirmed`);
                    } else {
                        console.warn(`⚠️ Transfer ${transferId} not confirmed: ${status.error}`);
                    }
                }
            }
        }
        
        // Final transaction monitoring sweep
        await monitorAndUpdateDatabase();
        
    } catch (error) {
        console.error('❌ Error resolving pending transactions:', error);
    }
}

// Sync all user balances
async function syncAllUserBalances(): Promise<void> {
    try {
        console.log('🔄 Syncing all user balances...');
        let syncedCount = 0;
        
        // Sync all hybrid wallet users
        for (const [userId, wallet] of hybridUserWallets) {
            try {
                // Get fresh balance from database
                const { data: freshBalance } = await supabaseService
                .from('users_unified')
                    .select('custodial_balance, privy_balance, total_balance')
                    .eq('id', userId)
                    .single();
                
                if (freshBalance) {
                    // Update in-memory state with database state
                    wallet.custodialBalance = parseFloat(freshBalance.custodial_balance) || 0;
                    wallet.embeddedBalance = parseFloat(freshBalance.privy_balance) || 0;
                    syncedCount++;
                }
                
            } catch (error) {
                console.warn(`⚠️ Failed to sync balance for user ${userId}:`, error);
            }
        }
        
        // Sync Privy wallet balances
        for (const [userId] of privyIntegrationManager.privyWallets) {
            try {
                await updatePrivyWalletBalance(userId);
            } catch (error) {
                console.warn(`⚠️ Failed to sync Privy balance for user ${userId}:`, error);
            }
        }
        
        console.log(`✅ Synced ${syncedCount} user balances`);
        
    } catch (error) {
        console.error('❌ Error syncing user balances:', error);
    }
}

// Save critical system state
async function saveSystemState(): Promise<void> {
    try {
        console.log('💾 Saving critical system state...');
        
        const systemState = {
            houseBalance,
            lastHouseBalanceUpdate,
            globalGameCounter,
            bootstrapState,
            multiplierControl: {
                recentGames: multiplierControl.recentGames,
                consecutiveHighCount: multiplierControl.consecutiveHighCount,
                cooldownUntil: multiplierControl.cooldownUntil
            },
            hybridSystemStats,
            privyIntegrationStats: {
                totalPrivyWallets: privyIntegrationManager.totalPrivyWallets,
                connectedPrivyWallets: privyIntegrationManager.connectedPrivyWallets,
                totalPrivyBalance: privyIntegrationManager.totalPrivyBalance
            },
            tradingState,
            shutdownTimestamp: Date.now()
        };
        
        await supabaseService
            .from('system_state')
            .upsert({
                id: 'server_shutdown_state',
                data: systemState,
                updated_at: new Date().toISOString()
            });
        
        console.log('✅ System state saved successfully');
        
    } catch (error) {
        console.error('❌ Failed to save system state:', error);
    }
}

// Startup Recovery Handler - Add this to your server initialization

async function recoverFromShutdown(): Promise<void> {
    try {
        console.log('🔄 Checking for shutdown recovery data...');
        
        // 1. RECOVER SYSTEM STATE
        await recoverSystemState();
        
        // 2. RECOVER ACTIVE GAME
        await recoverActiveGame();
        
        // 3. VERIFY USER BALANCES
        await verifyUserBalances();
        
        // 4. CLEAN UP RECOVERY DATA
        await cleanupRecoveryData();
        
        console.log('✅ Shutdown recovery complete');
        
    } catch (error) {
        console.error('❌ Error during shutdown recovery:', error);
        // Continue with normal startup even if recovery fails
    }
}

async function recoverSystemState(): Promise<void> {
    try {
        console.log('🔄 Recovering system state...');
        
        const { data: systemStateData } = await supabaseService
            .from('system_state')
            .select('*')
            .eq('id', 'server_shutdown_state')
            .single();
        
        if (systemStateData && systemStateData.data) {
            const state = systemStateData.data;
            
            // Recover critical counters
            if (state.globalGameCounter) {
                globalGameCounter = state.globalGameCounter;
                console.log(`✅ Recovered game counter: ${globalGameCounter}`);
            }
            
            // Recover bootstrap state
            if (state.bootstrapState) {
                bootstrapState = { ...bootstrapState, ...state.bootstrapState };
                console.log(`✅ Recovered bootstrap state`);
            }
            
            // Recover multiplier control
            if (state.multiplierControl) {
                multiplierControl.recentGames = state.multiplierControl.recentGames || [];
                multiplierControl.consecutiveHighCount = state.multiplierControl.consecutiveHighCount || 0;
                multiplierControl.cooldownUntil = state.multiplierControl.cooldownUntil || 0;
                console.log(`✅ Recovered multiplier control with ${multiplierControl.recentGames.length} recent games`);
            }
            
            // Recover trading state
            if (state.tradingState) {
                tradingState = { ...tradingState, ...state.tradingState };
                console.log(`✅ Recovered trading state: ${tradingState.trend}`);
            }
            
            // Recover artificial liquidity state
            const { data: liquidityState } = await supabaseService
                .from('system_state')
                .select('*')
                .eq('id', 'artificial_liquidity')
                .single();
            
            if (liquidityState && liquidityState.data) {
                const liquidity = liquidityState.data;
                artificialLiquidity = liquidity.artificialLiquidity || 2.0;
                baseGameLiquidity = liquidity.baseGameLiquidity || 2.0;
                artificialPlayerCount = liquidity.artificialPlayerCount || 15;
                currentLiquidityProfile = liquidity.currentLiquidityProfile || generateGameLiquidityProfile();
                console.log(`✅ Recovered artificial liquidity: ${artificialLiquidity.toFixed(3)} SOL`);
            }
        }
        
    } catch (error) {
        console.warn('⚠️ No system state to recover or recovery failed:', error);
    }
}

async function recoverActiveGame(): Promise<void> {
    try {
        console.log('🎮 Checking for active game to recover...');
        
        // Check for saved game state
        const { data: gameSnapshot } = await supabaseService
            .from('game_state_snapshots')
            .select('*')
            .eq('shutdown_saved', true)
            .order('saved_at', { ascending: false })
            .limit(1)
            .single();
        
        if (!gameSnapshot) {
            console.log('ℹ️ No active game to recover');
            return;
        }
        
        console.log(`🔄 Recovering game ${gameSnapshot.game_number}...`);
        
        // Check if the game was active and should continue
        const timeSinceShutdown = Date.now() - new Date(gameSnapshot.saved_at).getTime();
        
        if (timeSinceShutdown > 300000) { // 5 minutes
            console.log(`⏰ Game ${gameSnapshot.game_number} too old (${Math.round(timeSinceShutdown/1000)}s), treating as crashed`);
            await handleAbandonedGame(gameSnapshot);
            return;
        }
        
        // Recover active bets
        const { data: activeBetsSnapshot } = await supabaseService
            .from('active_bets_snapshots')
            .select('*')
            .eq('game_id', gameSnapshot.game_id)
            .eq('shutdown_saved', true);
        
        // Determine recovery strategy based on game status
        if (gameSnapshot.status === 'active') {
            await recoverActiveGameInProgress(gameSnapshot, activeBetsSnapshot || []);
        } else if (gameSnapshot.status === 'waiting') {
            await recoverWaitingGame(gameSnapshot, activeBetsSnapshot || []);
        }
        
    } catch (error) {
        console.error('❌ Error recovering active game:', error);
    }
}

async function recoverActiveGameInProgress(gameSnapshot: any, activeBets: any[]): Promise<void> {
    try {
        console.log(`🎮 Recovering active game ${gameSnapshot.game_number} with ${activeBets.length} active bets...`);
        
        // IMPORTANT DECISION: For user safety, crash any active game from before shutdown
        // This ensures no bets are left hanging and all users get clear resolution
        
        console.log(`💥 Auto-crashing game ${gameSnapshot.game_number} due to server restart (user protection)`);
        
        // Process all active bets as losses (house keeps the money)
        let totalLostBets = 0;
        
        for (const bet of activeBets) {
            if (!bet.cashed_out) {
                totalLostBets += parseFloat(bet.bet_amount);
                
                // Mark bet as lost in database
                await supabaseService
                    .from('player_bets')
                    .update({
                        profit_loss: -parseFloat(bet.bet_amount),
                        status: 'lost_server_restart',
                        crash_multiplier: gameSnapshot.current_multiplier,
                        resolved_at: new Date().toISOString(),
                        resolution_reason: 'Server restart - game auto-crashed for user protection'
                    })
                    .eq('game_id', gameSnapshot.game_id)
                    .eq('wallet_address', bet.wallet_address);
                
                console.log(`📉 Bet lost (server restart): ${bet.bet_amount} SOL from ${bet.wallet_address}`);
            }
        }
        
        // Update game record
        await supabaseService
            .from('games')
            .update({
                status: 'crashed',
                crash_multiplier: gameSnapshot.current_multiplier,
                ended_at: new Date().toISOString(),
                resolution_reason: 'Server restart auto-crash',
                total_lost_bets: totalLostBets
            })
            .eq('id', gameSnapshot.game_id);
        
        console.log(`✅ Game ${gameSnapshot.game_number} auto-crashed: ${totalLostBets.toFixed(3)} SOL lost bets resolved`);
        
        // Broadcast notification to all users when they reconnect
        setTimeout(() => {
            io.emit('gameRecoveryNotification', {
                type: 'auto_crash',
                gameNumber: gameSnapshot.game_number,
                crashMultiplier: gameSnapshot.current_multiplier,
                message: `Game ${gameSnapshot.game_number} was auto-crashed due to server restart. All active bets have been resolved.`,
                totalLostBets,
                timestamp: Date.now()
            });
        }, 5000);
        
    } catch (error) {
        console.error(`❌ Error recovering active game ${gameSnapshot.game_number}:`, error);
    }
}

async function recoverWaitingGame(gameSnapshot: any, activeBets: any[]): Promise<void> {
    try {
        console.log(`⏰ Recovering waiting game ${gameSnapshot.game_number}...`);
        
        // If there were bets placed during waiting period, transfer them to next game
        if (activeBets.length > 0) {
            console.log(`🔄 ${activeBets.length} bets will be transferred to next game`);
            
            // These bets will be automatically picked up by the next game
            // No special action needed as the bet transfer logic handles this
        }
        
        console.log(`✅ Waiting game recovery complete`);
        
    } catch (error) {
        console.error(`❌ Error recovering waiting game:`, error);
    }
}

async function handleAbandonedGame(gameSnapshot: any): Promise<void> {
    try {
        console.log(`🗑️ Handling abandoned game ${gameSnapshot.game_number}...`);
        
        // Mark as crashed and resolve all bets
        await supabaseService
            .from('games')
            .update({
                status: 'crashed',
                crash_multiplier: gameSnapshot.current_multiplier || 1.0,
                ended_at: new Date().toISOString(),
                resolution_reason: 'Abandoned due to long server downtime'
            })
            .eq('id', gameSnapshot.game_id);
        
        // Resolve any remaining active bets
        await supabaseService
            .from('player_bets')
            .update({
                status: 'lost_abandoned',
                resolved_at: new Date().toISOString(),
                resolution_reason: 'Game abandoned due to server downtime'
            })
            .eq('game_id', gameSnapshot.game_id)
            .eq('status', 'active');
        
        console.log(`✅ Abandoned game ${gameSnapshot.game_number} resolved`);
        
    } catch (error) {
        console.error(`❌ Error handling abandoned game:`, error);
    }
}

async function verifyUserBalances(): Promise<void> {
    try {
        console.log('🔍 Verifying user balance integrity...');
        
        let verifiedCount = 0;
        let errorCount = 0;
        
        // Check custodial balances against database
        for (const [userId, wallet] of hybridUserWallets) {
            try {
                const { data: dbBalance } = await supabaseService
                .from('users_unified')
                    .select('custodial_balance, privy_balance')
                    .eq('id', userId)
                    .single();
                
                if (dbBalance) {
                    const dbCustodialBalance = parseFloat(dbBalance.custodial_balance) || 0;
                    const memoryBalance = wallet.custodialBalance;
                    
                    if (Math.abs(dbCustodialBalance - memoryBalance) > 0.001) {
                        console.warn(`⚠️ Balance mismatch for ${userId}: DB=${dbCustodialBalance}, Memory=${memoryBalance}`);
                        // Use database as source of truth
                        wallet.custodialBalance = dbCustodialBalance;
                    }
                    
                    verifiedCount++;
                }
                
            } catch (error) {
                console.error(`❌ Error verifying balance for ${userId}:`, error);
                errorCount++;
            }
        }
        
        console.log(`✅ Balance verification complete: ${verifiedCount} verified, ${errorCount} errors`);
        
    } catch (error) {
        console.error('❌ Error during balance verification:', error);
    }
}

async function cleanupRecoveryData(): Promise<void> {
    try {
        console.log('🧹 Cleaning up recovery data...');
        
        // Clean up game snapshots older than 1 hour
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        
        await supabaseService
            .from('game_state_snapshots')
            .delete()
            .lt('saved_at', oneHourAgo);
        
        await supabaseService
            .from('active_bets_snapshots')
            .delete()
            .lt('saved_at', oneHourAgo);
        
        // Remove the shutdown state marker
        await supabaseService
            .from('system_state')
            .delete()
            .eq('id', 'server_shutdown_state');
        
        console.log('✅ Recovery data cleanup complete');
        
    } catch (error) {
        console.warn('⚠️ Error cleaning up recovery data:', error);
    }
}

// Add this to your enhanced server startup sequence
// Replace the existing startup sequence with this:

server.listen(PORT, async () => {
    console.log('🚀 Starting enhanced game server with recovery...');
    
    try {
        // Initialize basic systems first
        await initializeHybridSystem();
        await initializePrivyIntegration();
        await initializeGameCounter();
        await initializeAnalyticsSystem();
        
        // RECOVERY PHASE
        await recoverFromShutdown();
        
        // Continue with normal startup
        await updateHouseBalance();
        const config = getCurrentGameConfig();
        
        console.log(`🎮 Enhanced hybrid game server running on port ${PORT}`);
        console.log(`🏛️ House wallet: ${housePublicKey.toString()}`);
        console.log(`💰 House balance: ${houseBalance.toFixed(3)} SOL`);
        console.log(`🔄 Hybrid system: ${hybridSystemStats.totalUsers} users loaded`);
        
        // Start monitoring and game loop
        monitorAndUpdateDatabase();
        resolvePendingDeposits();
        
        // Start fresh waiting period
        setTimeout(() => {
            console.log('⏰ Starting fresh game after recovery...');
            startWaitingPeriod();
        }, 3000);
        
        console.log('✅ Server startup with recovery complete');
        
    } catch (error) {
        console.error('❌ Server initialization failed:', error);
        process.exit(1);
    }
});

// Replace existing signal handlers with this:
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Add middleware to reject new operations during shutdown
app.use((req, res, next) => {
    if (isShuttingDown) {
        res.status(503).json({
            error: 'Server is shutting down for maintenance',
            message: 'Please try again in a few minutes',
            estimatedDowntime: '2-5 minutes'
        });
        return;
    }
    next();
});

// Enhanced socket middleware for shutdown
io.use((socket, next) => {
    if (isShuttingDown) {
        socket.emit('serverMaintenance', {
            message: 'Server is under maintenance. Please reconnect in a few minutes.',
            estimatedDowntime: '2-5 minutes'
        });
        socket.disconnect(true);
        return;
    }
    next();
});

// Resolve all pending deposits
app.post('/api/admin/resolve-all-pending', async (req, res): Promise<void> => {
    try {
        console.log('🚨 MANUAL: Resolving all pending deposits...');
        
        const { data: pendingDeposits, error } = await supabaseService
            .from('pending_deposits')
            .select('*')
            .eq('status', 'pending');

        if (error || !pendingDeposits || pendingDeposits.length === 0) {
            res.json({ 
                success: true, 
                message: 'No pending deposits found',
                resolved: 0 
            });
            return;
        }

        console.log(`📋 Found ${pendingDeposits.length} pending deposits to resolve`);

        let resolvedCount = 0;
        let failedCount = 0;
        const results = [];

        for (const deposit of pendingDeposits) {
            try {
                console.log(`🔄 Processing pending deposit: ${deposit.amount} SOL from ${deposit.wallet_address}`);
                
                // Try to find existing user first
                let userResult = await findUserByWalletAddress(deposit.wallet_address);
                
                if (!userResult) {
                    // Create new user
                    console.log(`🆕 Creating new user for wallet: ${deposit.wallet_address}`);
                    const newUserResult = await getOrCreateUser(deposit.wallet_address);
                    userResult = {
                        userId: newUserResult.userId,
                        userProfile: newUserResult.userProfile
                    };
                }
                
                if (userResult) {
                    const userId = userResult.userId;
                    const depositAmount = parseFloat(deposit.amount);
                    
                    // Update balance using RPC
                    const { data: balanceResult, error: balanceError } = await supabaseService
                        
                        .rpc('update_unified_user_balance', {  // ✅ Change function name
                            p_user_id: userId,
                            p_custodial_change: depositAmount,
                            p_privy_change: 0,
                            p_embedded_change: 0,
                            p_transaction_type: 'manual_pending_resolved',
                            p_transaction_id: 'manual_pending_resolved',
                            p_game_id: currentGame?.id,
                            p_is_deposit: true,  // or true for deposits
                            p_deposit_amount: depositAmount   // or actual deposit amount
                        });
                    if (!balanceError && balanceResult) {
                        const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);
                        
                        // Mark as resolved
                        await supabaseService
                            .from('pending_deposits')
                            .update({ 
                                status: 'resolved',
                                resolved_at: new Date().toISOString(),
                                resolved_user_id: userId,
                                resolution_method: 'manual_admin_resolve'
                            })
                            .eq('id', deposit.id);

                        // Broadcast update
                        io.emit('custodialBalanceUpdate', {
                            userId,
                            custodialBalance: newCustodialBalance,
                            depositAmount: depositAmount,
                            transactionSignature: deposit.transaction_signature,
                            timestamp: Date.now(),
                            source: 'manual_pending_resolved',
                            walletAddress: deposit.wallet_address,
                            updateType: 'manual_deposit_resolved'
                        });

                        results.push({
                            depositId: deposit.id,
                            userId,
                            walletAddress: deposit.wallet_address,
                            amount: depositAmount,
                            newBalance: newCustodialBalance,
                            status: 'resolved'
                        });

                        resolvedCount++;
                        console.log(`✅ Resolved: ${depositAmount} SOL for user ${userId}`);
                    } else {
                        results.push({
                            depositId: deposit.id,
                            walletAddress: deposit.wallet_address,
                            amount: depositAmount,
                            status: 'failed',
                            error: balanceError?.message || 'Balance update failed'
                        });
                        failedCount++;
                    }
                }
                
            } catch (error) {
                console.error(`❌ Error processing deposit ${deposit.id}:`, error);
                failedCount++;
            }
        }

        res.json({
            success: true,
            message: `Processed ${pendingDeposits.length} pending deposits`,
            resolved: resolvedCount,
            failed: failedCount,
            results: results
        });

    } catch (error) {
        console.error('❌ Manual resolve error:', error);
        res.status(500).json({
            error: 'Failed to resolve pending deposits',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Check pending deposits
app.get('/api/admin/pending-deposits', async (req, res): Promise<void> => {
    try {
        const { data: pendingDeposits, error } = await supabaseService
            .from('pending_deposits')
            .select('*')
            .order('detected_at', { ascending: false });

        if (error) {
            throw error;
        }

        const totalPending = pendingDeposits?.filter(d => d.status === 'pending').length || 0;
        const totalResolved = pendingDeposits?.filter(d => d.status === 'resolved').length || 0;
        const totalAmount = pendingDeposits?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

        res.json({
            success: true,
            summary: {
                totalPending,
                totalResolved,
                totalDeposits: pendingDeposits?.length || 0,
                totalAmount: totalAmount.toFixed(6)
            },
            deposits: pendingDeposits || []
        });

    } catch (error) {
        console.error('❌ Pending deposits check error:', error);
        res.status(500).json({
            error: 'Failed to check pending deposits',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// FIXED: Enhanced server startup sequence

// FIXED: Add process handlers to ensure clean shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    clearGameCountdown();
    server.close(() => {
        console.log('✅ Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    clearGameCountdown();
    server.close(() => {
        console.log('✅ Process terminated');
    });
});

// FIXED: Add unhandled error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process for unhandled rejections in production
    if (NODE_ENV !== 'production') {
        process.exit(1);
    }
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    clearGameCountdown();
    process.exit(1);
});

// FIXED: Add periodic health check for game loop
setInterval(() => {
    const now = Date.now();
    
    // Check if we have a game or countdown running
    if (!currentGame && !gameCountdown && !gameStartLock) {
        console.warn('⚠️ No active game or countdown detected, restarting waiting period...');
        startWaitingPeriod();
    }
    
    // Check for stuck countdown
    if (gameCountdown && countdownTimeRemaining > 0) {
        console.log(`⏰ Health check - Countdown: ${countdownTimeRemaining}s remaining`);
    }
    
    // Check for stuck games
    if (currentGame && currentGame.status === 'active') {
        const gameAge = now - currentGame.startTime;
        if (gameAge > 300000) { // 5 minutes
            console.warn(`⚠️ Game ${currentGame.gameNumber} running for ${Math.round(gameAge/1000)}s, may be stuck`);
        }
    }
    // 🎭 Update artificial player count every 12-15 seconds
// 🎭 Enhanced artificial system updates
setInterval(() => {
    const now = Date.now();
    
    // Update liquidity continuously during active games
    if (currentGame && currentGame.status === 'active') {
        updateGameLiquidity();
    }
    
    // Update player counts every 15-20 seconds
    const timeSinceLastUpdate = now - lastArtificialUpdate;
    const updateInterval = 15000 + Math.random() * 5000; // 15-20 seconds
    
    if (timeSinceLastUpdate >= updateInterval) {
        updateArtificialCounts();
        
        // Broadcast enhanced update
        if (currentGame) {
            io.emit('artificialBoostUpdate', {
                gameId: currentGame.id,
                gamePhase: currentGame.status,
                currentMultiplier: currentGame.currentMultiplier,
                totalPlayers: currentGame.totalPlayers,
                totalBets: currentGame.totalBets,
                boostedPlayerCount: currentGame.boostedPlayerCount,
                boostedTotalBets: currentGame.boostedTotalBets,
                liquidityProfile: {
                    base: baseGameLiquidity,
                    current: artificialLiquidity,
                    growth: artificialLiquidity - baseGameLiquidity,
                    growthRate: currentLiquidityProfile.growthRate
                },
                timestamp: Date.now()
            });
        }
    }
}, 2000); // Check every 2 seconds for smoother liquidity updates
}, 30000); // Check every 30 seconds