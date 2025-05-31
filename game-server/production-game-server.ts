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
    crashMultiplier?: number;
    seed: string;
    chartData: ChartPoint[];
    activeBets: Map<string, PlayerBet>;
    houseBalance: number;
    maxPayoutCapacity: number;
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
): Promise<{ success: boolean; error?: string }> {
    try {
        console.log(`🔗 Registering embedded wallet for ${userId}: ${privyWalletAddress}`);
        
        // Validate wallet address
        try {
            new PublicKey(privyWalletAddress);
        } catch (error) {
            return { success: false, error: 'Invalid Solana wallet address' };
        }
        
        // Check if wallet is already registered
        const existingWallet = privyIntegrationManager.privyWallets.get(userId);
        if (existingWallet) {
            // Update existing wallet - this handles address changes
            const oldAddress = existingWallet.privyWalletAddress;
            existingWallet.privyWalletAddress = privyWalletAddress;
            existingWallet.privyWalletId = privyWalletId;
            existingWallet.isConnected = true;
            existingWallet.lastUsed = Date.now();
            
            if (oldAddress !== privyWalletAddress) {
                console.log(`🔄 Updated embedded wallet address for ${userId}: ${oldAddress} → ${privyWalletAddress}`);
                // Reset balance to trigger fresh fetch
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
        
        return { success: true };
        
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
        houseEdge: 0.70,
        maxPayout: 0.5,
        maxBet: 1.0,
        rugPullMultiplier: 3.0,
        maxMultiplier: 2.0,
        instantRugThreshold: 0.5
    },
    
    CRITICAL_SETTINGS: {
        houseEdge: 0.60,
        maxPayout: 1.5,
        maxBet: 2.5,
        rugPullMultiplier: 2.5,
        maxMultiplier: 5.0,
        instantRugThreshold: 1.5
    },
    
    BOOTSTRAP_SETTINGS: {
        houseEdge: 0.50,
        maxPayout: 2.5,
        maxBet: 4.0,
        rugPullMultiplier: 2.0,
        maxMultiplier: 8.0,
        instantRugThreshold: 3.0
    },
    
    NORMAL_SETTINGS: {
        houseEdge: 0.40,
        maxPayout: 5.0,
        maxBet: 10.0,
        rugPullMultiplier: 1.0,
        maxMultiplier: 100.0,
        instantRugThreshold: 10.0
    }
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
            MIN_BET: 0.001,
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
            HOUSE_EDGE: 0.40,
            UPDATE_INTERVAL: 100,
            MIN_BET: 0.001,
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
    HOUSE_EDGE: 0.40
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
async function monitorAndUpdateDatabase(): Promise<void> {
    try {
        console.log('🔍 Monitoring house wallet transactions and updating database...');
        
        // Get recent confirmed transactions for house wallet
        const signatures = await solanaConnection.getSignaturesForAddress(
            housePublicKey,
            {
                limit: 20,
            }
        );

        let balanceChanged = false; // Track if we need to update house balance

        for (const sigInfo of signatures) {
            // Skip if already processed
            if (processedSignatures.has(sigInfo.signature)) {
                continue;
            }

            // Skip failed transactions
            if (sigInfo.err) {
                console.log(`⚠️ Skipping failed transaction: ${sigInfo.signature}`);
                processedSignatures.add(sigInfo.signature);
                continue;
            }

            try {
                // Get full transaction details
                const transaction = await solanaConnection.getTransaction(sigInfo.signature, {
                    commitment: 'confirmed'
                });

                if (!transaction) {
                    console.log(`⚠️ Could not fetch transaction: ${sigInfo.signature}`);
                    continue;
                }

                // Find transfer instruction to house wallet
                const transferInstruction = findTransferInstruction(transaction);

                // Method 1: Try balance change analysis first (works with Privy)
                let decoded: { fromPubkey: PublicKey; toPubkey: PublicKey; lamports: number } | null = null;

                try {
                    console.log('🔍 Attempting balance change analysis...');
                    
                    const preBalances = transaction.meta?.preBalances || [];
                    const postBalances = transaction.meta?.postBalances || [];
                    const accountKeys = transaction.transaction.message.accountKeys;
                    
                    const houseWalletIndex = accountKeys.findIndex(key => key.equals(housePublicKey));
                    
                    if (houseWalletIndex !== -1) {
                        const preBalance = preBalances[houseWalletIndex] || 0;
                        const postBalance = postBalances[houseWalletIndex] || 0;
                        const balanceChange = postBalance - preBalance;
                        
                        console.log('🏠 House wallet balance change:', {
                            preBalance, postBalance, change: balanceChange
                        });
                        
                        if (balanceChange > 0) {
                            // Find the sender (account that lost balance)
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
                                        console.log('✅ Successfully decoded using balance analysis:', {
                                            from: decoded.fromPubkey.toString(),
                                            amount: balanceChange / LAMPORTS_PER_SOL
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch (balanceError) {
                    console.log('⚠️ Balance analysis failed:', balanceError);
                }

                // Method 2: Fallback to instruction decoding
                if (!decoded && transferInstruction) {
                    try {
                        console.log('🔍 Falling back to instruction decoding...');
                        decoded = decodeTransferInstruction(transferInstruction);
                        console.log('✅ Successfully decoded using instruction method');
                    } catch (instructionError) {
                        console.log('❌ Instruction decoding also failed:', instructionError);
                    }
                }

                // Process the deposit if we successfully decoded it
                if (decoded) {
                    // Check if this is a transfer TO the house wallet (incoming deposit)
                    if (decoded.toPubkey.equals(housePublicKey)) {
                        const fromAddress = decoded.fromPubkey.toString();
                        const amount = decoded.lamports / LAMPORTS_PER_SOL;
                        
                        console.log(`💰 Detected incoming deposit: ${amount} SOL from ${fromAddress}`);
                        
                        // 🔧 CRITICAL FIX: Set flag to update house balance
                        balanceChanged = true;
                        
                        // Try to find user by wallet address in database
                        const { data: existingWallet, error: walletError } = await supabaseService
                            .from('user_hybrid_wallets')
                            .select('*')
                            .eq('external_wallet_address', fromAddress)
                            .single();

                        if (!walletError && existingWallet) {
                            // User found - update their balance
                            const userId = existingWallet.user_id;
                            
                            console.log(`👤 Found user ${userId} - processing deposit: ${amount} SOL`);
                            
                            try {
                                // ✅ Use enhanced balance update system
                                const { data: balanceResult, error: balanceError } = await supabaseService
                                    .rpc('update_user_balance', {
                                        p_user_id: userId,
                                        p_custodial_change: amount,
                                        p_privy_change: 0,
                                        p_transaction_type: 'external_deposit',
                                        p_is_deposit: true,
                                        p_deposit_amount: amount
                                    });

                                if (balanceError) {
                                    console.error(`❌ Failed to update balance for user ${userId}:`, balanceError);
                                    throw balanceError;
                                }

                                const newCustodialBalance = parseFloat(balanceResult[0].new_custodial_balance);
                                const newTotalBalance = parseFloat(balanceResult[0].new_total_balance);
                                const newTotalDeposited = parseFloat(balanceResult[0].new_total_deposited);
                                
                                console.log(`✅ Balance updated: ${userId} - Custodial: ${newCustodialBalance.toFixed(3)} SOL, Total: ${newTotalBalance.toFixed(3)} SOL`);

                                // Update in-memory state if user is loaded
                                const memoryWallet = hybridUserWallets.get(userId);
                                if (memoryWallet) {
                                    memoryWallet.custodialBalance = newCustodialBalance;
                                    memoryWallet.custodialTotalDeposited = newTotalDeposited;
                                    memoryWallet.lastCustodialDeposit = Date.now();
                                }

                                // 🔧 CRITICAL FIX: Emit real-time update to frontend
                                if (typeof io !== 'undefined') {
                                    console.log(`📡 Broadcasting balance update for ${userId}: ${newCustodialBalance.toFixed(3)} SOL`);
                                    
                                    // Emit to specific user and all clients
                                    io.emit('custodialBalanceUpdate', {
                                        userId,
                                        custodialBalance: newCustodialBalance,
                                        totalBalance: newTotalBalance,
                                        totalDeposited: newTotalDeposited,
                                        depositAmount: amount,
                                        transactionSignature: sigInfo.signature,
                                        timestamp: Date.now(),
                                        source: 'external_deposit'
                                    });

                                    // Also emit generic balance update
                                    io.emit('balanceUpdate', {
                                        userId,
                                        type: 'custodial',
                                        balance: newCustodialBalance,
                                        change: amount,
                                        source: 'deposit',
                                        timestamp: Date.now()
                                    });
                                }

                                console.log(`✅ Successfully processed ${amount} SOL deposit for ${userId}. New balance: ${newCustodialBalance.toFixed(3)} SOL`);

                            } catch (processingError) {
                                console.error(`❌ Critical error processing deposit for ${userId}:`, processingError);
                                
                                // Store as pending deposit for manual review
                                try {
                                    await supabaseService
                                        .from('pending_deposits')
                                        .insert({
                                            wallet_address: fromAddress,
                                            amount: amount,
                                            transaction_signature: sigInfo.signature,
                                            detected_at: new Date().toISOString(),
                                            status: 'failed_processing',
                                            error_message: processingError instanceof Error ? processingError.message : 'Unknown error'
                                        });
                                    
                                    console.log(`📝 Stored failed deposit as pending for manual review: ${amount} SOL from ${fromAddress}`);
                                } catch (pendingError) {
                                    console.error('Failed to store pending deposit:', pendingError);
                                }
                            }
                        } else {
                            // User not found - store as pending deposit
                            console.log(`⚠️ No user found for wallet ${fromAddress}, storing as pending deposit`);
                            
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
                }

                // Mark transaction as processed
                processedSignatures.add(sigInfo.signature);
                
            } catch (error) {
                console.error(`❌ Error processing transaction ${sigInfo.signature}:`, error);
                processedSignatures.add(sigInfo.signature); // Mark as processed to avoid retrying
            }
        }

        // 🔧 CRITICAL FIX: Update house balance if any changes were detected
        if (balanceChanged) {
            console.log('💰 Deposits detected, updating house balance...');
            const oldBalance = houseBalance;
            await updateHouseBalance();
            const change = houseBalance - oldBalance;
            
            console.log(`🏛️ House balance updated: ${oldBalance.toFixed(3)} → ${houseBalance.toFixed(3)} SOL (${change >= 0 ? '+' : ''}${change.toFixed(3)})`);
            
            // 🔒 ADMIN ONLY: Send sensitive house balance data only to admin room
            io.to('admin_monitoring').emit('adminHouseBalanceUpdate', {
                oldBalance,
                newBalance: houseBalance,
                change,
                maxPayoutCapacity: calculateMaxPayoutCapacity(),
                timestamp: Date.now(),
                source: 'deposit_processing'
            });
            
            // Update current game state if active (but don't expose house balance to users)
            if (currentGame) {
                currentGame.houseBalance = houseBalance;
                currentGame.maxPayoutCapacity = calculateMaxPayoutCapacity();
                
                // Only emit non-sensitive game capacity info to users
                io.emit('gameCapacityUpdate', {
                    maxPayoutCapacity: calculateMaxPayoutCapacity(),
                    canAcceptLargeBets: houseBalance > 50, // Boolean indicator only
                    timestamp: Date.now()
                });
            }
        }

        // Clean up old processed signatures (keep memory usage down)
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
                .from('user_hybrid_wallets')
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
                    .from('user_hybrid_wallets')
                    .update({
                        custodial_balance: newBalance,
                        custodial_total_deposited: newTotalDeposited,
                        last_custodial_deposit: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', userId);

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
async function initializeHybridSystem(): Promise<void> {
    try {
        console.log('🔄 Initializing hybrid wallet system...');
        
        const { data: hybridWallets, error } = await supabaseService
            .from('user_hybrid_wallets')
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
            .from('user_hybrid_wallets')
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
        console.log(`🔄 Syncing balance from database for user ${userId}...`);
        
        const { data: freshWalletData, error } = await supabaseService
            .from('user_hybrid_wallets')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !freshWalletData) {
            console.warn(`❌ Failed to sync balance for user ${userId}:`, error);
            return 0;
        }

        // Update in-memory wallet with fresh data
        let userWallet = hybridUserWallets.get(userId);
        if (!userWallet) {
            // Create new wallet if it doesn't exist in memory
            userWallet = {
                userId,
                externalWalletAddress: freshWalletData.external_wallet_address,
                custodialBalance: parseFloat(freshWalletData.custodial_balance) || 0,
                custodialTotalDeposited: parseFloat(freshWalletData.custodial_total_deposited) || 0,
                lastCustodialDeposit: freshWalletData.last_custodial_deposit ? new Date(freshWalletData.last_custodial_deposit).getTime() : 0,
                embeddedWalletId: freshWalletData.embedded_wallet_id,
                embeddedBalance: parseFloat(freshWalletData.embedded_balance) || 0,
                lastEmbeddedWithdrawal: freshWalletData.last_embedded_withdrawal ? new Date(freshWalletData.last_embedded_withdrawal).getTime() : 0,
                lastTransferBetweenWallets: freshWalletData.last_transfer_between_wallets ? new Date(freshWalletData.last_transfer_between_wallets).getTime() : 0,
                totalTransfersToEmbedded: parseFloat(freshWalletData.total_transfers_to_embedded) || 0,
                totalTransfersToCustodial: parseFloat(freshWalletData.total_transfers_to_custodial) || 0,
                createdAt: new Date(freshWalletData.created_at).getTime()
            };
        } else {
            // Update existing wallet with fresh data
            userWallet.custodialBalance = parseFloat(freshWalletData.custodial_balance) || 0;
            userWallet.custodialTotalDeposited = parseFloat(freshWalletData.custodial_total_deposited) || 0;
            userWallet.embeddedBalance = parseFloat(freshWalletData.embedded_balance) || 0;
            userWallet.totalTransfersToEmbedded = parseFloat(freshWalletData.total_transfers_to_embedded) || 0;
            userWallet.totalTransfersToCustodial = parseFloat(freshWalletData.total_transfers_to_custodial) || 0;
        }

        hybridUserWallets.set(userId, userWallet);
        console.log(`✅ Balance synced for ${userId}: ${userWallet.custodialBalance.toFixed(3)} SOL`);
        
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
            .from('user_profiles')
            .select('user_id, username, custodial_balance, privy_balance, total_balance, external_wallet_address, level')
            .eq('user_id', userId)
            .single();

        if (error || !profileData) {
            console.error(`❌ User profile not found for ${userId}:`, error);
            return { success: false, reason: 'User profile not found - please register first' };
        }

        userProfile = {
            userId: profileData.user_id,
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
    if (currentGame.activeBets.has(userProfile.externalWalletAddress)) {
        return { success: false, reason: 'Already has active bet' };
    }

    try {
        // INSTANT RUG PULL CHECK
        if (betAmount > config.INSTANT_RUG_THRESHOLD) {
            console.log(`🚨💥 CUSTODIAL INSTANT RUG: ${betAmount} SOL > ${config.INSTANT_RUG_THRESHOLD} SOL!`);
            
            // 🔧 NEW: Use atomic balance update function
            const { data: balanceResult, error: balanceError } = await supabaseService
                .rpc('update_user_balance', {
                    p_user_id: userId,
                    p_custodial_change: -betAmount,
                    p_privy_change: 0,
                    p_transaction_type: 'instant_rug_bet'
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
            currentGame.totalPlayers = currentGame.activeBets.size;
            
            // Update game stats in unified table
            await supabaseService.rpc('update_user_game_stats', {
                p_user_id: userId,
                p_bet_amount: betAmount,
                p_won: false, // Will lose due to instant rug
                p_payout: 0,
                p_multiplier: 0
            });
            
            // Crash game immediately
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
            .rpc('update_user_balance', {
                p_user_id: userId,
                p_custodial_change: -betAmount,
                p_privy_change: 0,
                p_transaction_type: 'custodial_bet'
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
        currentGame.totalPlayers = currentGame.activeBets.size;

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

        return { 
            success: true, 
            entryMultiplier,
            custodialBalance: newCustodialBalance 
        };

    } catch (error) {
        console.error('❌ Custodial bet failed:', error);
        
        // 🔧 NEW: Refund using atomic balance update
        try {
            await supabaseService.rpc('update_user_balance', {
                p_user_id: userId,
                p_custodial_change: betAmount, // Refund
                p_privy_change: 0,
                p_transaction_type: 'bet_refund'
            });
            console.log(`💰 Refunded ${betAmount} SOL to user ${userId} due to error`);
        } catch (refundError) {
            console.error(`❌ Failed to refund ${userId}:`, refundError);
        }
        
        return { success: false, reason: 'Server error' };
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
            
            // Mark bet as cashed out with 0 payout
            bet.cashedOut = true;
            bet.cashoutMultiplier = cashoutMultiplier;
            bet.cashoutAmount = 0;
            bet.cashoutTime = Date.now();
            bet.payoutProcessed = true;
            
            // Crash the game
            setTimeout(() => {
                if (currentGame) crashGame();
            }, 500);
            
            return { success: false, reason: 'Payout limit exceeded - game crashed' };
        }

        // 🔧 NEW: Use atomic balance update for payout
        const { data: balanceResult, error: balanceError } = await supabaseService
            .rpc('update_user_balance', {
                p_user_id: userId,
                p_custodial_change: safePayout,
                p_privy_change: 0,
                p_transaction_type: 'custodial_cashout'
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
            .from('user_hybrid_wallets')
            .select('custodial_balance')
            .eq('user_id', userId)
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
function calculateControlledCrashPoint(seed: string, gameNumber: number): number {
    const config = getCurrentGameConfig();
    const hash = crypto.createHash('sha256').update(seed + gameNumber).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    
    let baseCrashPoint = Math.max(1.0, (hashInt / 0xFFFFFFFF) * config.MAX_MULTIPLIER);
    
    if (config._BOOTSTRAP_MODE) {
        if (config._BOOTSTRAP_LEVEL === 'emergency' && Math.random() < 0.5) {
            baseCrashPoint = Math.min(baseCrashPoint, 1.5);
        } else if (config._BOOTSTRAP_LEVEL === 'critical' && Math.random() < 0.35) {
            baseCrashPoint = Math.min(baseCrashPoint, 2.5);
        } else if (config._BOOTSTRAP_LEVEL === 'bootstrap' && Math.random() < 0.25) {
            baseCrashPoint = Math.min(baseCrashPoint, 4.0);
        }
        
        baseCrashPoint = Math.min(baseCrashPoint, config.MAX_MULTIPLIER);
        
        if (baseCrashPoint <= 2.0) {
            console.log(`🔽 ${config._BOOTSTRAP_LEVEL} bootstrap low crash: ${baseCrashPoint.toFixed(2)}x (Game ${gameNumber})`);
        }
    } else {
        baseCrashPoint = applyMultiplierControl(baseCrashPoint, gameNumber);
    }
    
    return Math.floor(baseCrashPoint * 100) / 100;
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
            bet.cashoutAmount = 0;
            bet.cashoutTime = Date.now();
            bet.payoutProcessed = false;
            
            setTimeout(() => {
                if (currentGame) crashGame();
            }, 500);
            
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

// Enhanced game loop
async function runGameLoop(duration: number): Promise<void> {
    if (!currentGame) return;

    const startTime = Date.now();
    const endTime = startTime + duration;
    let lastChartUpdate = startTime;
    let lastLogTime = startTime;

    console.log(`🎮 Starting AGGRESSIVE trader game loop for Game ${currentGame.gameNumber} - Duration: ${duration}ms`);
    console.log(`🎯 Initial state: Trend=${tradingState.trend}, Momentum=${tradingState.momentum.toFixed(2)}, Volatility=${(tradingState.volatility*100).toFixed(1)}%`);

    const gameLoop = setInterval(() => {
        if (!currentGame || currentGame.status !== 'active') {
            clearInterval(gameLoop);
            return;
        }

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

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

        if (progress >= 1 || now >= endTime) {
            console.log('⏰ Game duration reached, crashing naturally');
            crashGame();
            clearInterval(gameLoop);
            return;
        }

        const oldMultiplier = currentGame.currentMultiplier;
        const newMultiplier = calculateTraderMultiplier(elapsed, duration);
        currentGame.currentMultiplier = Math.round(newMultiplier * 100) / 100;

        if (now - lastLogTime >= 2000) {
            const change = ((currentGame.currentMultiplier - oldMultiplier) / oldMultiplier) * 100;
            console.log(`📊 Trading: ${oldMultiplier.toFixed(3)}x → ${currentGame.currentMultiplier.toFixed(3)}x (${change >= 0 ? '+' : ''}${change.toFixed(2)}%) | ${tradingState.trend} trend | ${tradingState.consecutiveRises} rises`);
            lastLogTime = now;
        }

        io.emit('multiplierUpdate', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            timestamp: now,
            serverTime: now,
            progress: progress,
            trend: tradingState.trend,
            rugPullRisk: tradingState.rugPullProbability,
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity
        });

        if (now - lastChartUpdate >= 1000) {
            const chartPoint = {
                timestamp: now,
                open: currentGame.chartData.length > 0 ? currentGame.chartData[currentGame.chartData.length - 1].close : 1.0,
                high: currentGame.currentMultiplier * (1 + Math.random() * tradingState.volatility),
                low: currentGame.currentMultiplier * (1 - Math.random() * tradingState.volatility),
                close: currentGame.currentMultiplier,
                volume: currentGame.totalBets
            };

            currentGame.chartData.push(chartPoint);
            lastChartUpdate = now;
        }

    }, getCurrentGameConfig().UPDATE_INTERVAL);
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
        
        currentGame = {
            id: waitingGameId,
            gameNumber: globalGameCounter + 1, // Next game number
            startTime: Date.now(),
            currentMultiplier: 1.0,
            maxMultiplier: 0,
            status: 'waiting',
            totalBets: 0,
            totalPlayers: 0,
            seed: '',
            chartData: [],
            activeBets: new Map(),
            houseBalance: houseBalance,
            maxPayoutCapacity: calculateMaxPayoutCapacity()
        };

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
async function startNewGame(): Promise<void> {
    resetTradingState();
    
    const existingBets = currentGame?.activeBets || new Map();
    const existingTotalBets = currentGame?.totalBets || 0;
    const existingTotalPlayers = currentGame?.totalPlayers || 0;

    if (gameStartLock) {
        console.log('Game start already in progress, skipping...');
        return;
    }

    gameStartLock = true;

    try {
        await updateHouseBalance();
        
        const seed = generateProvablyFairSeed();
        
        // ✅ FIX: Use persistent cycling counter (1-100) instead of history length
        globalGameCounter++;
        if (globalGameCounter > 100) {
            globalGameCounter = 1; // Reset to 1 after reaching 100
        }
        const gameNumber = globalGameCounter;
        
        const crashPoint = calculateControlledCrashPoint(seed, gameNumber);
        const duration = generateGameDuration(crashPoint);

        let gameId = `memory-${gameNumber}`;
        try {
            const { data: gameData, error } = await supabaseService
                .from('games')
                .insert({
                    game_number: gameNumber, // This will cycle 1-100 continuously
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
        } catch (dbError) {
            console.warn(`⚠️ Database save failed for game ${gameNumber}, running in memory mode:`, dbError);
        }

        currentGame = {
            id: gameId,
            gameNumber, // Now cycles 1-100 continuously
            startTime: Date.now(),
            currentMultiplier: 1.0,
            maxMultiplier: crashPoint,
            status: 'active',
            totalBets: existingTotalBets,
            totalPlayers: existingTotalPlayers,
            crashMultiplier: crashPoint,
            seed,
            chartData: [],
            activeBets: existingBets,
            houseBalance: houseBalance,
            maxPayoutCapacity: calculateMaxPayoutCapacity()
        };

        const config = getCurrentGameConfig();
        const modeText = config._BOOTSTRAP_MODE ? `${config._BOOTSTRAP_LEVEL} bootstrap` : 'normal';
        console.log(`🎮 Trader Game ${gameNumber} started (${modeText}) - House: ${houseBalance.toFixed(3)} SOL, Max Payout: ${currentGame.maxPayoutCapacity.toFixed(3)} SOL`);

        io.emit('gameStarted', {
            gameId: currentGame.id,
            gameNumber,
            startTime: currentGame.startTime,
            serverTime: Date.now(),
            seed: currentGame.seed,
            maxMultiplier: crashPoint,
            preGameBets: existingTotalBets,
            preGamePlayers: existingTotalPlayers,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
            tradingState: {
                trend: tradingState.trend,
                momentum: tradingState.momentum
            }
        });

        runGameLoop(duration);

    } catch (error) {
        console.error('Error starting new game:', error);
        // ❌ IMPORTANT: Decrement counter if game creation failed
        globalGameCounter--;
        if (globalGameCounter < 1) {
            globalGameCounter = 100; // Wrap back to 100 if we go below 1
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
    gameHistory.push({ ...currentGame });
    if (gameHistory.length > 100) {
        gameHistory = gameHistory.slice(-100);
    }

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
            startTime: currentGame.startTime,
            maxMultiplier: currentGame.maxMultiplier,
            serverTime: currentServerTime,
            chartData: currentGame.chartData.slice(-60),
            seed: currentGame.seed,
            countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined,
            canBet: currentGame.status === 'waiting' || currentGame.status === 'active',
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity,
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

    socket.on('custodialCashOut', async (data) => {
        const { userId, walletAddress } = data;
        
        try {
            console.log(`💸 Processing custodial cashout request from ${userId}`);
            
            const result = await cashOutToCustodialBalance(userId, walletAddress);
            
            socket.emit('custodialCashOutResult', { 
                success: result.success,
                reason: result.reason,
                payout: result.payout,
                custodialBalance: result.custodialBalance,
                userId,
                walletAddress,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket custodial cashout processing error:', error);
            socket.emit('custodialCashOutResult', {
                success: false,
                reason: 'Server error processing cashout request',
                userId,
                walletAddress
            });
        }
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

app.get('/api/custodial/balance/:userId', (req, res): void => {
    try {
        const { userId } = req.params;
        const userWallet = hybridUserWallets.get(userId);
        
        if (!userWallet) {
            void res.status(404).json({
                error: 'User wallet not found',
                userId,
                hint: 'User needs to make a deposit first'
            });
            return;
        }
        
        void res.json({
            userId,
            walletAddress: userWallet.externalWalletAddress,
            custodialBalance: userWallet.custodialBalance,
            totalDeposited: userWallet.custodialTotalDeposited,
            lastDeposit: userWallet.lastCustodialDeposit,
            embeddedBalance: userWallet.embeddedBalance,
            canBet: userWallet.custodialBalance >= 0.001,
            canCashOut: userWallet.custodialBalance > 0,
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
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction): void => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: NODE_ENV === 'production' ? 'Internal server error' : error.message 
    });
    return;
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

// FIXED: Enhanced server startup sequence
server.listen(PORT, async () => {
    console.log('🚀 Starting game server initialization...');
    
    try {
        // Initialize systems in order
        await initializeHybridSystem();      // Custodial wallets
        await initializePrivyIntegration();  // Privy wallets  
        await initializeGameCounter();       // Game counter
        await initializeAnalyticsSystem();   // Analytics system
        
        await updateHouseBalance();
        const config = getCurrentGameConfig();
        
        console.log(`🎮 Enhanced hybrid game server running on port ${PORT}`);
        console.log(`🏛️ House wallet: ${housePublicKey.toString()}`);
        console.log(`💰 House balance: ${houseBalance.toFixed(3)} SOL`);
        console.log(`🔄 Hybrid system: ${hybridSystemStats.totalUsers} users loaded`);
        console.log(`💎 Custodial balance: ${hybridSystemStats.totalCustodialBalance.toFixed(3)} SOL`);
        console.log(`🔗 Privy integration: ${privyIntegrationManager.totalPrivyWallets} wallets, ${privyIntegrationManager.connectedPrivyWallets} connected`);
        console.log(`💼 Embedded wallet balance: ${privyIntegrationManager.totalPrivyBalance.toFixed(3)} SOL`);
        console.log(`🔐 Direct blockchain integration: ENABLED`);
        console.log(`🎲 Game counter: ${globalGameCounter} (cycles 1-100)`);
        console.log(`🌍 Environment: ${NODE_ENV}`);
        
        if (config._BOOTSTRAP_MODE) {
            console.log(`🚀 BOOTSTRAP MODE ACTIVE: ${config._BOOTSTRAP_LEVEL.toUpperCase()}`);
            console.log(`   House edge: ${(config.HOUSE_EDGE * 100).toFixed(0)}%`);
            console.log(`   Max payout: ${config.MAX_SINGLE_PAYOUT} SOL`);
            console.log(`   Max bet: ${config.MAX_BET} SOL`);
            console.log(`   Target balance: ${BOOTSTRAP_CONFIG.EXIT_BOOTSTRAP_THRESHOLD} SOL`);
            console.log(`   Progress: ${((houseBalance / BOOTSTRAP_CONFIG.EXIT_BOOTSTRAP_THRESHOLD) * 100).toFixed(1)}%`);
        } else {
            console.log(`✅ NORMAL MODE ACTIVE`);
            console.log(`   House edge: ${(config.HOUSE_EDGE * 100).toFixed(0)}%`);
            console.log(`   Max payout: ${config.MAX_SINGLE_PAYOUT} SOL`);
            console.log(`   Max bet: ${config.MAX_BET} SOL`);
        }
        
        console.log(`📡 Solana RPC: ${SOLANA_RPC_URL}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔧 Transaction monitor: http://localhost:${PORT}/api/admin/trigger-monitor`);
        
        // FIXED: Clear any existing game state and start fresh
        gameStartLock = false;
        currentGame = null;
        clearGameCountdown();
        
        console.log(`🚀 Starting game loop with countdown...`);
        
        // Start transaction monitoring
        console.log('🔍 Starting enhanced database-driven transaction monitoring...');
        
        // Run initial scan
        monitorAndUpdateDatabase();
        
        // Check for pending deposits immediately
        resolvePendingDeposits();
        
        console.log('✅ Enhanced transaction monitoring active - will update database with real-time balance updates');
        
        // FIXED: Start the waiting period with a small delay to ensure everything is ready
        setTimeout(() => {
            console.log('⏰ Initiating first waiting period...');
            startWaitingPeriod();
        }, 2000); // 2 second delay to ensure all systems are ready
        
    } catch (error) {
        console.error('❌ Server initialization failed:', error);
        process.exit(1);
    }
});

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
    
}, 30000); // Check every 30 seconds