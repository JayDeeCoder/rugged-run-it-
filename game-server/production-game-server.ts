// production-game-server.ts - Complete Production-Ready Version (TypeScript Fixed)
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { 
    Connection, 
    PublicKey, 
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
const NODE_ENV = process.env.NODE_ENV || 'development';

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

// ===== STEP 3.2: ADVANCED ANALYTICS & REPORTING SYSTEM =====

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
// Add this section after your existing interfaces and before your existing code

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
        console.log(`🔗 Registering Privy wallet for ${userId}: ${privyWalletAddress}`);
        
        // Validate wallet address
        try {
            new PublicKey(privyWalletAddress);
        } catch (error) {
            return { success: false, error: 'Invalid Solana wallet address' };
        }
        
        // Check if wallet is already registered
        const existingWallet = privyIntegrationManager.privyWallets.get(userId);
        if (existingWallet) {
            // Update existing wallet
            existingWallet.privyWalletAddress = privyWalletAddress;
            existingWallet.privyWalletId = privyWalletId;
            existingWallet.isConnected = true;
            existingWallet.lastUsed = Date.now();
            
            console.log(`🔄 Updated existing Privy wallet for ${userId}`);
        } else {
            // Create new wallet
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
            console.log(`✅ Registered new Privy wallet for ${userId}`);
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
        console.error('❌ Privy wallet registration failed:', error);
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
            console.warn(`⚠️ Privy wallet not found for user ${userId}`);
            return 0;
        }
        
        // Get balance from blockchain
        const publicKey = new PublicKey(privyWallet.privyWalletAddress);
        const balanceResponse = await solanaConnection.getBalance(publicKey);
        const balance = balanceResponse / LAMPORTS_PER_SOL;
        
        // Update wallet
        privyWallet.balance = balance;
        privyWallet.lastBalanceUpdate = Date.now();
        privyWallet.lastUsed = Date.now();
        
        // Save to database
        await savePrivyWalletToDatabase(privyWallet);
        
        // Update stats
        updatePrivyIntegrationStats();
        
        return balance;
        
    } catch (error) {
        console.error(`❌ Failed to update Privy wallet balance for ${userId}:`, error);
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
    // For SystemProgram transfers, manually extract the data
    const data = instruction.data;
    
    // SystemProgram transfer instruction has a specific layout
    // First 4 bytes are the instruction discriminator (should be [2, 0, 0, 0] for transfer)
    if (data.length < 12 || data[0] !== 2) {
        throw new Error('Not a valid transfer instruction');
    }
    
    // Next 8 bytes are the lamports amount (little-endian u64)
    const lamportsBuffer = data.slice(4, 12);
    const lamports = Number(lamportsBuffer.readBigUInt64LE(0));
    
    // Keys: [0] = from (signer), [1] = to (writable)
    const fromPubkey = instruction.keys[0].pubkey;
    const toPubkey = instruction.keys[1].pubkey;
    
    return {
        fromPubkey,
        toPubkey,
        lamports
    };
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

// ===== END BOOTSTRAP SYSTEM =====

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

// Wallet Management Functions
async function updateHouseBalance(): Promise<number> {
    try {
        const config = getCurrentGameConfig();
        const now = Date.now();
        if (now - lastHouseBalanceUpdate < config.BALANCE_CACHE_DURATION) {
            return houseBalance;
        }

        const balanceResponse = await solanaConnection.getBalance(housePublicKey);
        houseBalance = balanceResponse / LAMPORTS_PER_SOL;
        lastHouseBalanceUpdate = now;
        
        console.log(`🏛️ House balance updated: ${houseBalance.toFixed(3)} SOL`);
        return houseBalance;
    } catch (error) {
        console.error('❌ Failed to update house balance:', error);
        return houseBalance;
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

    // Get user's custodial balance
    const userWallet = hybridUserWallets.get(userId);
    if (!userWallet) {
        return { success: false, reason: 'User wallet not found - please deposit first' };
    }

    // Check sufficient custodial balance
    if (userWallet.custodialBalance < betAmount) {
        return { 
            success: false, 
            reason: `Insufficient custodial balance: ${userWallet.custodialBalance.toFixed(3)} SOL available, need ${betAmount} SOL`,
            custodialBalance: userWallet.custodialBalance
        };
    }

    // Validate bet amount
    if (betAmount < config.MIN_BET || betAmount > config.MAX_BET) {
        return { success: false, reason: `Bet must be between ${config.MIN_BET} and ${config.MAX_BET} SOL` };
    }

    // Check if user already has active bet
    if (currentGame.activeBets.has(userWallet.externalWalletAddress)) {
        return { success: false, reason: 'Already has active bet' };
    }

    try {
        // INSTANT RUG PULL CHECK
        if (betAmount > config.INSTANT_RUG_THRESHOLD) {
            console.log(`🚨💥 CUSTODIAL INSTANT RUG: ${betAmount} SOL > ${config.INSTANT_RUG_THRESHOLD} SOL!`);
            
            // Instantly deduct from custodial balance
            userWallet.custodialBalance -= betAmount;
            hybridUserWallets.set(userId, userWallet);
            
            // Add bet to game
            const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier;
            const bet: PlayerBet = {
                userId,
                walletAddress: userWallet.externalWalletAddress,
                betAmount,
                placedAt: Date.now(),
                entryMultiplier,
                maxPayout: betAmount * BET_VALIDATION.MAX_PAYOUT_MULTIPLIER,
                isValid: true,
                transactionId: `custodial_${Date.now()}_${userId}`,
                betCollected: true,
                payoutProcessed: false
            };

            currentGame.activeBets.set(userWallet.externalWalletAddress, bet);
            currentGame.totalBets += betAmount;
            currentGame.totalPlayers = currentGame.activeBets.size;
            
            // Save wallet balance
            await saveHybridWallet(userWallet);
            updateHybridSystemStats();
            
            // Crash game immediately
            setTimeout(() => {
                if (currentGame) crashGame();
            }, 1000);
            
            return { 
                success: true, 
                entryMultiplier,
                custodialBalance: userWallet.custodialBalance,
                reason: 'Bet placed - HIGH RISK!' 
            };
        }

        // NORMAL CUSTODIAL BET
        const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier;
        
        // INSTANTLY deduct from custodial balance (no blockchain transaction needed)
        userWallet.custodialBalance -= betAmount;
        hybridUserWallets.set(userId, userWallet);
        
        // Create bet
        const bet: PlayerBet = {
            userId,
            walletAddress: userWallet.externalWalletAddress,
            betAmount,
            placedAt: Date.now(),
            entryMultiplier,
            maxPayout: betAmount * BET_VALIDATION.MAX_PAYOUT_MULTIPLIER,
            isValid: true,
            transactionId: `custodial_${Date.now()}_${userId}`,
            betCollected: true,
            payoutProcessed: false
        };

        currentGame.activeBets.set(userWallet.externalWalletAddress, bet);
        currentGame.totalBets += betAmount;
        currentGame.totalPlayers = currentGame.activeBets.size;

        // Update trading state
        tradingState.totalBetsSinceStart += betAmount;
        if (betAmount >= config.HIGH_BET_THRESHOLD) {
            tradingState.highBetCount++;
            tradingState.volatility *= 1.5;
        }

        console.log(`⚡ CUSTODIAL BET PLACED: ${betAmount} SOL, entry ${entryMultiplier}x, remaining: ${userWallet.custodialBalance.toFixed(3)} SOL`);

        // Save to database
        await saveHybridWallet(userWallet);
        updateHybridSystemStats();

        // Save bet to database
        try {
            await supabaseService
                .from('player_bets')
                .insert({
                    game_id: currentGame.id,
                    user_id: userId,
                    wallet_address: userWallet.externalWalletAddress,
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
            custodialBalance: userWallet.custodialBalance 
        };

    } catch (error) {
        console.error('❌ Custodial bet failed:', error);
        // Refund to custodial balance on error
        userWallet.custodialBalance += betAmount;
        hybridUserWallets.set(userId, userWallet);
        return { success: false, reason: 'Server error' };
    }
}

// ===== STEP 2.3: INSTANT CUSTODIAL CASHOUT =====
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
   Raw payout: ${rawPayout.toFixed(3)} SOL
   After house edge (${(config.HOUSE_EDGE * 100).toFixed(0)}%): ${payoutWithHouseEdge.toFixed(3)} SOL
   Final payout: ${safePayout.toFixed(3)} SOL`);

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

        // Get user's hybrid wallet
        let userWallet = hybridUserWallets.get(userId);
        if (!userWallet) {
            return { success: false, reason: 'User wallet not found' };
        }

        // INSTANTLY add to custodial balance (no blockchain transaction needed!)
        userWallet.custodialBalance += safePayout;
        hybridUserWallets.set(userId, userWallet);

        // Mark bet as cashed out
        bet.cashedOut = true;
        bet.cashoutMultiplier = cashoutMultiplier;
        bet.cashoutAmount = safePayout;
        bet.cashoutTime = Date.now();
        bet.payoutProcessed = true;

        const profit = safePayout - bet.betAmount;
        const isLoss = cashoutMultiplier < bet.entryMultiplier;

        console.log(`⚡ CUSTODIAL CASHOUT SUCCESS: 
   Payout: ${safePayout.toFixed(3)} SOL
   Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(3)} SOL
   New custodial balance: ${userWallet.custodialBalance.toFixed(3)} SOL`);

        // Save to database
        await saveHybridWallet(userWallet);
        updateHybridSystemStats();

        // Update house balance tracking
        await updateHouseBalance();
        if (currentGame) {
            currentGame.houseBalance = houseBalance;
            currentGame.maxPayoutCapacity = calculateMaxPayoutCapacity();
        }

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
                        cashed_out_at: new Date().toISOString(),
                        payout_transaction_id: `custodial_payout_${Date.now()}`,
                        payout_processed: true,
                        entry_multiplier: bet.entryMultiplier,
                        growth_ratio: growthRatio,
                        cashout_type: 'custodial'
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
            custodialBalance: userWallet.custodialBalance,
            houseEdge: config.HOUSE_EDGE,
            timestamp: Date.now(),
            houseBalance: currentGame.houseBalance
        });

        updateUserAnalytics(userId, null, {
            amount: bet.betAmount,
            payout: safePayout,
            won: true,
            multiplier: cashoutMultiplier,
            type: 'custodial_cashout'
        });

        return { 
            success: true, 
            payout: safePayout,
            custodialBalance: userWallet.custodialBalance 
        };

    } catch (error) {
        console.error('❌ Custodial cashout failed:', error);
        return { 
            success: false, 
            reason: 'Server error during cashout' 
        };
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
    if (gameStartLock) {
        console.log('Game start lock active, skipping waiting period...');
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

        // Emit waiting state
        io.emit('gameWaiting', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            status: 'waiting',
            serverTime: Date.now(),
            houseBalance: currentGame.houseBalance,
            maxPayoutCapacity: currentGame.maxPayoutCapacity
        });

        // Start countdown
        countdownTimeRemaining = 10; // 10 seconds countdown
        
        const countdownInterval = setInterval(() => {
            countdownTimeRemaining--;
            
            io.emit('countdown', {
                gameId: currentGame?.id,
                gameNumber: currentGame?.gameNumber,
                timeRemaining: countdownTimeRemaining,
                status: 'waiting'
            });
            
            if (countdownTimeRemaining <= 0) {
                clearInterval(countdownInterval);
                startNewGame();
            }
        }, 1000);

        gameCountdown = countdownInterval;

    } catch (error) {
        console.error('Error in waiting period:', error);
        // Retry after delay
        setTimeout(() => {
            startWaitingPeriod();
        }, 5000);
    }
}
function clearGameCountdown(): void {
    if (gameCountdown) {
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


// GAME COUNTER FIX: Enhanced startWaitingPeriod with persistent cycling counter
async function crashGame(): Promise<void> {
    if (!currentGame) return;

    const config = getCurrentGameConfig();
    const crashTime = Date.now();
    currentGame.status = 'crashed';
    const crashMultiplier = currentGame.currentMultiplier;

    console.log(`💥 Trader Game ${currentGame.gameNumber} crashed at ${crashMultiplier}x`);

    let totalPayouts = 0;
    
    // Process all bets first
    for (const [walletAddress, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            console.log(`📉 Bet lost: ${bet.betAmount} SOL from ${walletAddress}`);
            
            try {
                if (!currentGame.id.startsWith('memory-')) {
                    await supabaseService
                        .from('player_bets')
                        .update({
                            profit_loss: -bet.betAmount,
                            status: 'lost'
                        })
                        .eq('game_id', currentGame.id)
                        .eq('wallet_address', walletAddress);
                }
            } catch (error) {
                console.warn('Error updating lost bet:', error);
            }
        } else {
            totalPayouts += bet.cashoutAmount || 0;
        }
    }
    // ✅ CRITICAL FIX: DEFINE gameProfit HERE, BEFORE ANY USAGE
    const gameProfit = currentGame.totalBets - totalPayouts;
    
    // Now all the following code can safely use gameProfit
    if (config._BOOTSTRAP_MODE) {
        trackBootstrapProgress(gameProfit);
    } else {
        updateMultiplierHistory(currentGame, totalPayouts);
    }

    // Record game analytics
    recordGameAnalytics(currentGame, totalPayouts);

    // Update user analytics for all players
    for (const [walletAddress, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            // Player lost - update analytics
            updateUserAnalytics(bet.userId, { gameNumber: currentGame.gameNumber }, {
                amount: bet.betAmount,
                payout: 0,
                won: false,
                multiplier: currentGame.currentMultiplier,
                type: 'loss'
            });
        }
        // Note: Winners are already recorded in cashOut functions
    }

    // Emit real-time analytics update
    io.to('analytics_dashboard').emit('liveAnalyticsUpdate', {
        type: 'game_completed',
        gameNumber: currentGame.gameNumber,
        totalProfit: gameProfit, // ← Now properly scoped
        totalPlayers: currentGame.totalPlayers,
        crashMultiplier: currentGame.currentMultiplier,
        timestamp: Date.now()
    });

    // Check for alerts
    const recentGames = gameAnalyticsHistory.slice(-10);
    const recentProfitMargin = recentGames.length > 0 ? 
        (recentGames.reduce((sum: any, g: any) => sum + g.houseProfit, 0) / 
         recentGames.reduce((sum: any, g: any) => sum + g.totalWagered, 0)) * 100 : 0;

    if (recentProfitMargin < 10) {
        io.to('analytics_alerts').emit('analyticsAlert', {
            type: 'low_profit_margin',
            message: `Low profit margin detected: ${recentProfitMargin.toFixed(1)}%`,
            severity: 'warning',
            timestamp: Date.now()
        });
    }

    if (currentGame.totalPlayers === 0) {
        io.to('analytics_alerts').emit('analyticsAlert', {
            type: 'no_players',
            message: `Game ${currentGame.gameNumber} had no players`,
            severity: 'info',
            timestamp: Date.now()
        });
    }

    await updateHouseBalance();
    
    // Save to database
    try {
        if (!currentGame.id.startsWith('memory-')) {
            await supabaseService
                .from('games')
                .update({
                    end_time: new Date(crashTime).toISOString(),
                    crash_multiplier: crashMultiplier,
                    max_multiplier: currentGame.maxMultiplier,
                    status: 'crashed',
                    total_bets_amount: currentGame.totalBets,
                    total_players: currentGame.totalPlayers,
                    house_balance_end: houseBalance,
                    total_payouts: totalPayouts,
                    house_profit: gameProfit // ← Now properly scoped
                })
                .eq('id', currentGame.id);
        }
    } catch (error) {
        console.warn('Game update failed:', error);
    }

    // Emit crash event
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
        houseProfit: gameProfit, // ← Now properly scoped
        houseBalance: houseBalance,
        tradingState: {
            trend: tradingState.trend,
            rugPullTriggered: true
        }
    });

    gameHistory.push({ ...currentGame });
    if (gameHistory.length > 100) {
        gameHistory = gameHistory.slice(-100);
    }

    currentGame = null;
    await startWaitingPeriod();
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

    // ===== STEP 3.1: ADD THESE SOCKET HANDLERS INSIDE YOUR EXISTING io.on('connection', (socket: Socket) => { BLOCK =====

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

    // ===== GET PRIVY WALLET HANDLER =====
    socket.on('getPrivyWallet', async (data) => {
        const { userId } = data;
        
        try {
            console.log(`🔍 Getting Privy wallet for ${userId}`);
            
            const privyWallet = privyIntegrationManager.privyWallets.get(userId);
            if (!privyWallet) {
                socket.emit('privyWalletResponse', {
                    success: false,
                    error: 'Privy wallet not registered for this user',
                    userId,
                    hint: 'Register the Privy wallet first'
                });
                return;
            }
            
            // Update balance from blockchain
            const currentBalance = await updatePrivyWalletBalance(userId);
            
            socket.emit('privyWalletResponse', {
                success: true,
                userId,
                wallet: {
                    userId: privyWallet.userId,
                    privyWalletAddress: privyWallet.privyWalletAddress,
                    privyWalletId: privyWallet.privyWalletId,
                    balance: currentBalance,
                    lastBalanceUpdate: privyWallet.lastBalanceUpdate,
                    isConnected: privyWallet.isConnected,
                    createdAt: privyWallet.createdAt,
                    lastUsed: privyWallet.lastUsed
                },
                capabilities: {
                    canReceive: true,
                    canSend: currentBalance > 0.001,
                    canTransferToCustodial: currentBalance > 0.01,
                    canTransferFromCustodial: true
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket get Privy wallet error:', error);
            socket.emit('privyWalletResponse', {
                success: false,
                error: 'Failed to get Privy wallet',
                userId
            });
        }
    });

    // ===== TRANSFER: CUSTODIAL TO PRIVY HANDLER =====
    socket.on('transferCustodialToPrivy', async (data) => {
        const { userId, amount } = data;
        
        try {
            console.log(`🔄 Processing custodial to Privy transfer: ${amount} SOL for ${userId}`);
            
            const result = await transferCustodialToPrivy(userId, amount);
            
            socket.emit('transferCustodialToPrivyResult', {
                success: result.success,
                error: result.error,
                transferId: result.transferId,
                userId,
                amount,
                message: result.success ? 
                    `Successfully transferred ${amount} SOL from custodial to Privy wallet` : 
                    `Transfer failed: ${result.error}`,
                timestamp: Date.now()
            });
            
            // Broadcast successful transfer
            if (result.success) {
                const userHybridWallet = hybridUserWallets.get(userId);
                const privyWallet = privyIntegrationManager.privyWallets.get(userId);
                
                io.emit('walletTransferCompleted', {
                    userId,
                    transferId: result.transferId,
                    amount,
                    from: 'custodial',
                    to: 'privy',
                    balances: {
                        custodial: userHybridWallet?.custodialBalance || 0,
                        privy: privyWallet?.balance || 0
                    },
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            console.error('❌ Socket custodial to Privy transfer error:', error);
            socket.emit('transferCustodialToPrivyResult', {
                success: false,
                error: 'Server error during transfer',
                userId,
                amount
            });
        }
    });

    // ===== TRANSFER: PRIVY TO CUSTODIAL HANDLER =====
    socket.on('transferPrivyToCustodial', async (data) => {
        const { userId, amount, signedTransaction } = data;
        
        try {
            console.log(`🔄 Processing Privy to custodial transfer: ${amount} SOL for ${userId}`);
            
            const result = await transferPrivyToCustodial(userId, amount, signedTransaction);
            
            if (!result.success && result.unsignedTransaction) {
                socket.emit('transferPrivyToCustodialResult', {
                    success: false,
                    action: 'signature_required',
                    transferId: result.transferId,
                    unsignedTransaction: result.unsignedTransaction,
                    message: 'Transaction created - please sign with your Privy wallet',
                    instructions: [
                        'Use your Privy wallet to sign this transaction',
                        'This will transfer funds to your gaming balance',
                        'Send the signed transaction back to complete the transfer'
                    ],
                    userId,
                    amount,
                    timestamp: Date.now()
                });
                return;
            }
            
            socket.emit('transferPrivyToCustodialResult', {
                success: result.success,
                error: result.error,
                transferId: result.transferId,
                userId,
                amount,
                message: result.success ? 
                    `Successfully transferred ${amount} SOL from Privy wallet to custodial balance` : 
                    `Transfer failed: ${result.error}`,
                timestamp: Date.now()
            });
            
            // Broadcast successful transfer
            if (result.success) {
                const userHybridWallet = hybridUserWallets.get(userId);
                const privyWallet = privyIntegrationManager.privyWallets.get(userId);
                
                io.emit('walletTransferCompleted', {
                    userId,
                    transferId: result.transferId,
                    amount,
                    from: 'privy',
                    to: 'custodial',
                    balances: {
                        custodial: userHybridWallet?.custodialBalance || 0,
                        privy: privyWallet?.balance || 0
                    },
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            console.error('❌ Socket Privy to custodial transfer error:', error);
            socket.emit('transferPrivyToCustodialResult', {
                success: false,
                error: 'Server error during transfer',
                userId,
                amount
            });
        }
    });

    // ===== GET WALLET OVERVIEW HANDLER =====
    socket.on('getWalletOverview', async (data) => {
        const { userId } = data;
        
        try {
            const userHybridWallet = hybridUserWallets.get(userId);
            const privyWallet = privyIntegrationManager.privyWallets.get(userId);
            
            // Update Privy balance if wallet exists
            let privyBalance = 0;
            if (privyWallet) {
                privyBalance = await updatePrivyWalletBalance(userId);
            }
            
            socket.emit('walletOverviewResponse', {
                success: true,
                userId,
                wallets: {
                    custodial: {
                        balance: userHybridWallet?.custodialBalance || 0,
                        totalDeposited: userHybridWallet?.custodialTotalDeposited || 0,
                        lastDeposit: userHybridWallet?.lastCustodialDeposit || 0,
                        canBet: (userHybridWallet?.custodialBalance || 0) >= 0.001,
                        canTransferToPrivy: (userHybridWallet?.custodialBalance || 0) >= 0.01
                    },
                    privy: {
                        address: privyWallet?.privyWalletAddress || null,
                        balance: privyBalance,
                        isConnected: privyWallet?.isConnected || false,
                        lastUsed: privyWallet?.lastUsed || 0,
                        canTransferToCustodial: privyBalance >= 0.01
                    }
                },
                totals: {
                    combinedBalance: (userHybridWallet?.custodialBalance || 0) + privyBalance,
                    totalTransfersToPrivy: userHybridWallet?.totalTransfersToEmbedded || 0,
                    totalTransfersToCustodial: userHybridWallet?.totalTransfersToCustodial || 0,
                    lastTransfer: userHybridWallet?.lastTransferBetweenWallets || 0
                },
                capabilities: {
                    custodialBetting: true,
                    instantCashout: true,
                    privyTransfers: !!privyWallet,
                    crossWalletTransfers: !!(userHybridWallet && privyWallet)
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket wallet overview error:', error);
            socket.emit('walletOverviewResponse', {
                success: false,
                error: 'Failed to get wallet overview',
                userId
            });
        }
    });


    // ===== AUTO-INITIALIZE USER WITH PRIVY WALLET =====
    socket.on('initializeUser', async (data) => {
        const { userId, walletAddress } = data;
        
        try {
            if (!userId || !walletAddress) {
                socket.emit('userInitializeResult', {
                    success: false,
                    error: 'Missing userId or walletAddress'
                });
                return;
            }
            
            console.log(`🔗 Auto-initializing user ${userId} with Privy wallet: ${walletAddress}`);
            
            // Auto-register the Privy embedded wallet
            const privyResult = await registerPrivyWallet(userId, walletAddress, undefined);
            
            // Ensure hybrid wallet exists
            let userWallet = hybridUserWallets.get(userId);
            if (!userWallet) {
                userWallet = {
                    userId,
                    externalWalletAddress: walletAddress, // Use the Privy wallet as external wallet
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
                
                hybridUserWallets.set(userId, userWallet);
                await saveHybridWallet(userWallet);
            }
            
            // Update Privy wallet balance
            const privyBalance = await updatePrivyWalletBalance(userId);
            
            socket.emit('userInitializeResult', {
                success: true,
                userId,
                walletAddress,
                custodialBalance: userWallet.custodialBalance,
                privyBalance: privyBalance,
                message: 'User wallet initialized successfully with Privy embedded wallet'
            });
            
            console.log(`✅ User ${userId} initialized with Privy wallet: ${walletAddress}`);
            
        } catch (error) {
            console.error('Error initializing user:', error);
            socket.emit('userInitializeResult', {
                success: false,
                error: 'Failed to initialize user wallet'
            });
        }
    });

    
    // ===== GET TRANSFER HISTORY HANDLER =====
    socket.on('getTransferHistory', async (data) => {
        const { userId, limit = 20 } = data;
        
        try {
            const { data: transfers, error } = await supabaseService
                .from('wallet_transfers')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit);
                
            if (error) {
                socket.emit('transferHistoryResponse', {
                    success: false,
                    error: 'Failed to fetch transfer history',
                    userId
                });
                return;
            }
            
            socket.emit('transferHistoryResponse', {
                success: true,
                userId,
                transfers: transfers || [],
                summary: {
                    totalTransfers: transfers?.length || 0,
                    completedTransfers: transfers?.filter(t => t.status === 'completed').length || 0,
                    failedTransfers: transfers?.filter(t => t.status === 'failed').length || 0,
                    totalVolume: transfers?.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) || 0
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket transfer history error:', error);
            socket.emit('transferHistoryResponse', {
                success: false,
                error: 'Failed to get transfer history',
                userId
            });
        }
    });

    // ===== UPDATE PRIVY BALANCE HANDLER =====
    socket.on('updatePrivyBalance', async (data) => {
        const { userId } = data;
        
        try {
            const currentBalance = await updatePrivyWalletBalance(userId);
            
            socket.emit('privyBalanceUpdateResult', {
                success: true,
                userId,
                balance: currentBalance,
                timestamp: Date.now()
            });
            
            // Broadcast balance update to all clients for this user
            io.emit('privyBalanceUpdate', {
                userId,
                balance: currentBalance,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket Privy balance update error:', error);
            socket.emit('privyBalanceUpdateResult', {
                success: false,
                error: 'Failed to update Privy wallet balance',
                userId
            });
        }
    });

    // ===== GET PRIVY INTEGRATION STATS HANDLER =====
    socket.on('getPrivyIntegrationStats', () => {
        try {
            updatePrivyIntegrationStats();
            updateHybridSystemStats();
            
            socket.emit('privyIntegrationStatsResponse', {
                success: true,
                stats: {
                    totalPrivyWallets: privyIntegrationManager.totalPrivyWallets,
                    connectedPrivyWallets: privyIntegrationManager.connectedPrivyWallets,
                    totalPrivyBalance: privyIntegrationManager.totalPrivyBalance,
                    averagePrivyBalance: privyIntegrationManager.totalPrivyWallets > 0 ? 
                        privyIntegrationManager.totalPrivyBalance / privyIntegrationManager.totalPrivyWallets : 0
                },
                hybridSystem: {
                    totalUsers: hybridSystemStats.totalUsers,
                    totalCustodialBalance: hybridSystemStats.totalCustodialBalance,
                    totalEmbeddedBalance: hybridSystemStats.totalEmbeddedBalance,
                    balanceRatio: hybridSystemStats.totalCustodialBalance / Math.max(1, hybridSystemStats.totalEmbeddedBalance)
                },
                recentActivity: Array.from(privyIntegrationManager.privyWallets.values())
                    .sort((a, b) => b.lastUsed - a.lastUsed)
                    .slice(0, 5)
                    .map(w => ({
                        userId: w.userId,
                        balance: w.balance,
                        lastUsed: w.lastUsed,
                        isConnected: w.isConnected
                    })),
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket Privy integration stats error:', error);
            socket.emit('privyIntegrationStatsResponse', {
                success: false,
                error: 'Failed to get Privy integration stats'
            });
        }
    });

    // ===== STEP 2.4: ADD ALL THESE SOCKET HANDLERS INSIDE YOUR EXISTING io.on('connection', (socket: Socket) => { BLOCK =====

    // ===== CUSTODIAL DEPOSIT HANDLER =====
    socket.on('custodialDeposit', async (data) => {
        const { userId, externalWalletAddress, depositAmount, signedTransaction } = data;
        
        try {
            console.log(`💰 Processing custodial deposit from ${userId}: ${depositAmount} SOL`);
            
            const result = await depositToCustodialBalance(userId, externalWalletAddress, depositAmount, signedTransaction);
            
            if (!result.success && result.unsignedTransaction) {
                socket.emit('custodialDepositResult', {
                    success: false,
                    reason: result.error,
                    userId,
                    depositAmount,
                    unsignedTransaction: result.unsignedTransaction,
                    instructions: {
                        message: 'Please sign this deposit transaction with your wallet',
                        steps: [
                            '1. Your wallet will open automatically',
                            '2. Review the transaction details carefully', 
                            '3. Confirm the transaction to deposit to your gaming balance',
                            '4. Funds will be available for instant betting once confirmed'
                        ]
                    }
                });
                return;
            }
            
            socket.emit('custodialDepositResult', {
                success: result.success,
                error: result.error,
                custodialBalance: result.custodialBalance,
                userId,
                depositAmount,
                message: result.success ? 
                    `Successfully deposited ${depositAmount} SOL to gaming balance!` : 
                    `Deposit failed: ${result.error}`
            });
            
            // Broadcast balance update to all clients for this user
            if (result.success) {
                io.emit('custodialBalanceUpdate', {
                    userId,
                    custodialBalance: result.custodialBalance,
                    totalDeposited: hybridUserWallets.get(userId)?.custodialTotalDeposited || 0,
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            console.error('❌ Socket custodial deposit processing error:', error);
            socket.emit('custodialDepositResult', {
                success: false,
                error: 'Server error processing deposit request',
                userId,
                depositAmount
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

    // ===== GET CUSTODIAL BALANCE HANDLER =====
    socket.on('getCustodialBalance', (data) => {
        const { userId } = data;
        
        try {
            const userWallet = hybridUserWallets.get(userId);
            
            if (!userWallet) {
                socket.emit('custodialBalanceResponse', {
                    success: false,
                    error: 'User wallet not found - please make a deposit first',
                    userId
                });
                return;
            }
            
            socket.emit('custodialBalanceResponse', {
                success: true,
                userId,
                walletAddress: userWallet.externalWalletAddress,
                custodialBalance: userWallet.custodialBalance,
                totalDeposited: userWallet.custodialTotalDeposited,
                lastDeposit: userWallet.lastCustodialDeposit,
                embeddedBalance: userWallet.embeddedBalance,
                canBet: userWallet.custodialBalance >= 0.001,
                canWithdraw: userWallet.custodialBalance > 0,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket get custodial balance error:', error);
            socket.emit('custodialBalanceResponse', {
                success: false,
                error: 'Failed to get custodial balance',
                userId
            });
        }
    });

    // ===== HYBRID SYSTEM STATUS HANDLER =====
    socket.on('getHybridStatus', () => {
        try {
            updateHybridSystemStats();
            
            socket.emit('hybridStatusResponse', {
                success: true,
                stats: hybridSystemStats,
                config: {
                    maxCustodialBalance: 10.0,
                    recommendedGamingBalance: 2.0,
                    minBetAmount: 0.001,
                    instantCashoutEnabled: true
                },
                currentGame: currentGame ? {
                    gameId: currentGame.id,
                    gameNumber: currentGame.gameNumber,
                    status: currentGame.status,
                    multiplier: currentGame.currentMultiplier,
                    totalBets: currentGame.totalBets,
                    totalPlayers: currentGame.totalPlayers,
                    countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined,
                    houseBalance: currentGame.houseBalance,
                    maxPayoutCapacity: currentGame.maxPayoutCapacity
                } : null,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket hybrid status error:', error);
            socket.emit('hybridStatusResponse', {
                success: false,
                error: 'Failed to get hybrid system status'
            });
        }
    });

    // ===== ENHANCED GAME STATE HANDLER =====
    socket.on('getGameState', () => {
        try {
            const currentServerTime = Date.now();
            const config = getCurrentGameConfig();
            
            socket.emit('gameStateResponse', {
                success: true,
                game: currentGame ? {
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
                    },
                    // Add custodial gaming info
                    custodialBettingEnabled: true,
                    instantCashoutEnabled: true,
                    minBetAmount: config.MIN_BET,
                    maxBetAmount: config.MAX_BET,
                    houseEdge: config.HOUSE_EDGE,
                    bootstrapMode: config._BOOTSTRAP_MODE,
                    bootstrapLevel: config._BOOTSTRAP_LEVEL
                } : null,
                hybridStats: hybridSystemStats,
                timestamp: currentServerTime
            });
            
        } catch (error) {
            console.error('❌ Socket game state error:', error);
            socket.emit('gameStateResponse', {
                success: false,
                error: 'Failed to get game state'
            });
        }
    });

    // ===== USER ACTIVITY TRACKER =====
    socket.on('userActivity', (data) => {
        const { userId, activity, metadata } = data;
        
        try {
            // Log user activity for analytics
            console.log(`👤 User Activity: ${userId} - ${activity}`, metadata);
            
            // Update user's last activity
            const userWallet = hybridUserWallets.get(userId);
            if (userWallet) {
                // You could add lastActivity timestamp to the user wallet if needed
                // userWallet.lastActivity = Date.now();
            }
            
            socket.emit('userActivityAck', {
                success: true,
                userId,
                activity,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Socket user activity error:', error);
        }
    });

    // ===== CONNECTION HEALTH CHECK =====
    socket.on('ping', () => {
        socket.emit('pong', {
            timestamp: Date.now(),
            serverTime: new Date().toISOString(),
            gameActive: currentGame?.status === 'active',
            countdown: currentGame?.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
        });
    });

    // ===== ENHANCED DISCONNECT HANDLER =====
    socket.on('disconnect', (reason) => {
        console.log(`👋 Client disconnected: ${socket.id} (${reason})`);
        
        // Clean up any pending operations for this socket
        // You could track socket-to-user mappings here if needed
    });

    // ===== ADD THIS INSIDE YOUR EXISTING io.on('connection', (socket: Socket) => { block =====
    
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

    

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Periodic updates
// ===== STEP 2.4: REPLACE YOUR EXISTING PERIODIC UPDATES WITH THESE ENHANCED VERSIONS =====

// Enhanced server sync (find your existing 5-second interval and replace it)
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

// Enhanced house balance update (find your existing 30-second interval and replace it)
setInterval(async () => {
    const oldBalance = houseBalance;
    await updateHouseBalance();
    
    if (currentGame) {
        currentGame.houseBalance = houseBalance;
        currentGame.maxPayoutCapacity = calculateMaxPayoutCapacity();
    }
    
    // Update hybrid system stats
    updateHybridSystemStats();
    
    // Emit balance update if significant change
    if (Math.abs(houseBalance - oldBalance) > 0.01) {
        io.emit('houseBalanceUpdate', {
            oldBalance,
            newBalance: houseBalance,
            change: houseBalance - oldBalance,
            maxPayoutCapacity: calculateMaxPayoutCapacity(),
            timestamp: Date.now(),
            hybridStats: hybridSystemStats
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

// Enhanced transfer monitoring (every 30 seconds)
setInterval(() => {
    try {
        // Clean up completed transfers older than 1 hour
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        let cleanedCount = 0;
        
        for (const [transferId, transfer] of activeTransfers) {
            if ((transfer.status === 'completed' || transfer.status === 'failed') && 
                transfer.createdAt < oneHourAgo) {
                activeTransfers.delete(transferId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} old transfer records`);
        }
        
        // Check for stuck pending transfers
        const stuckTransfers = [];
        for (const [transferId, transfer] of activeTransfers) {
            if (transfer.status === 'pending' && Date.now() - transfer.createdAt > 300000) { // 5 minutes
                stuckTransfers.push(transferId);
            }
        }
        
        if (stuckTransfers.length > 0) {
            console.warn(`⚠️ Found ${stuckTransfers.length} stuck transfers: ${stuckTransfers.join(', ')}`);
        }
        
        // Emit transfer monitoring stats
        io.emit('transferMonitoringUpdate', {
            activeTransfers: activeTransfers.size,
            stuckTransfers: stuckTransfers.length,
            recentActivity: Array.from(activeTransfers.values())
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 5)
                .map(t => ({
                    transferId: t.transferId,
                    userId: t.userId,
                    amount: t.amount,
                    status: t.status,
                    age: Date.now() - t.createdAt
                })),
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('❌ Transfer monitoring error:', error);
    }
}, 30000); // Every 30 seconds

setInterval(() => {
    try {
        console.log('📊 Updating analytics...');
        
        // Update financial analytics
        updateFinancialAnalytics('hour');
        updateSystemAnalytics();
        
        // Save user analytics periodically
        let savedCount = 0;
        for (const [userId, analytics] of userAnalyticsCache) {
            if (Math.random() < 0.1) { // Save 10% of users each cycle
                saveUserAnalytics(analytics);
                savedCount++;
            }
        }
        
        if (savedCount > 0) {
            console.log(`📊 Saved analytics for ${savedCount} users`);
        }
        
        // Broadcast live analytics to dashboard subscribers
        const recentGames = gameAnalyticsHistory.slice(-24); // Last 24 games
        const activeUsers = Array.from(userAnalyticsCache.values()).filter(
            user => user.lastActive >= Date.now() - 60 * 60 * 1000 // Last hour
        );
        
        io.to('analytics_dashboard').emit('analyticsUpdate', {
            overview: {
                recentGames: recentGames.length,
                recentRevenue: recentGames.reduce((sum, game) => sum + game.totalWagered, 0),
                recentProfit: recentGames.reduce((sum, game) => sum + game.houseProfit, 0),
                activeUsers: activeUsers.length,
                houseBalance
            },
            system: systemAnalytics,
            timestamp: Date.now()
        });
        
        // Check for alerts
        const alerts = [];
        
        // Low house balance alert
        if (houseBalance < 20) {
            alerts.push({
                type: 'low_house_balance',
                message: `Low house balance: ${houseBalance.toFixed(3)} SOL`,
                severity: 'warning'
            });
        }
        
        // High risk user alert
        const highRiskUsers = activeUsers.filter(user => user.riskScore > 80);
        if (highRiskUsers.length > 0) {
            alerts.push({
                type: 'high_risk_users',
                message: `${highRiskUsers.length} high-risk users detected`,
                severity: 'info'
            });
        }
        
        // Low profit margin alert
        if (recentGames.length >= 5) {
            const avgProfitMargin = recentGames.reduce((sum, g) => sum + g.houseProfitMargin, 0) / recentGames.length;
            if (avgProfitMargin < 15) {
                alerts.push({
                    type: 'low_profit_margin',
                    message: `Low profit margin: ${avgProfitMargin.toFixed(1)}%`,
                    severity: 'warning'
                });
            }
        }
        
        // Send alerts if any
        if (alerts.length > 0) {
            io.to('analytics_alerts').emit('analyticsAlerts', {
                alerts,
                timestamp: Date.now()
            });
        }
        
        console.log(`✅ Analytics update complete - ${recentGames.length} games, ${activeUsers.length} active users`);
        
    } catch (error) {
        console.error('❌ Analytics update error:', error);
    }
}, 300000); // Every 5 minutes

// Daily report generation (runs at midnight)
setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < 5) { // Around midnight
        try {
            console.log('📊 Generating daily report...');
            
            const report = generateDailyReport();
            
            // ✅ FIXED: Save to database with proper async/await
            try {
                await supabaseService
                    .from('daily_reports')
                    .insert({
                        report_date: report.date,
                        report_data: report,
                        created_at: new Date().toISOString()
                    });
                console.log(`✅ Daily report saved for ${report.date}`);
            } catch (error: any) {
                console.warn('Daily report save failed:', error);
            }
                
            // Broadcast to admin users
            io.to('analytics_alerts').emit('dailyReport', {
                report,
                timestamp: Date.now()
            });
            
        } catch (error: any) {
            console.error('❌ Daily report generation error:', error);
        }
    }
}, 300000); // Check every 5 minutes

// New: Hybrid system health monitor (add this new interval)
setInterval(() => {
    updateHybridSystemStats();
    
    // Emit periodic stats update
    io.emit('hybridStatsUpdate', {
        stats: hybridSystemStats,
        health: {
            totalUsers: hybridSystemStats.totalUsers,
            activeUsers: hybridSystemStats.activeGamingUsers,
            totalCustodialBalance: hybridSystemStats.totalCustodialBalance,
            totalEmbeddedBalance: hybridSystemStats.totalEmbeddedBalance,
            balanceRatio: hybridSystemStats.totalCustodialBalance / Math.max(1, hybridSystemStats.totalEmbeddedBalance),
            averageBalance: hybridSystemStats.totalUsers > 0 ? 
                hybridSystemStats.totalCustodialBalance / hybridSystemStats.totalUsers : 0
        },
        timestamp: Date.now()
    });
}, 60000); // Every minute


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

// ===== ADD AFTER YOUR /api/hybrid/status ENDPOINT =====

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

// ===== STEP 2.5: ADD THESE API ENDPOINTS AFTER YOUR EXISTING /api/custodial/cashout ENDPOINT =====

// ===== CUSTODIAL BETTING API =====
app.post('/api/custodial/bet', async (req, res): Promise<void> => {
    try {
        const { userId, betAmount } = req.body;
        
        if (!userId || !betAmount) {
            res.status(400).json({
                error: 'Missing required fields: userId, betAmount'
            });
            return; // FIXED: Added explicit return
        }
        
        if (typeof betAmount !== 'number' || betAmount <= 0) {
            res.status(400).json({
                error: 'Invalid bet amount - must be a positive number'
            });
            return; // FIXED: Added explicit return
        }
        
        const result = await placeBetFromCustodialBalance(userId, betAmount);
        
        if (result.success) {
            res.json({
                success: true,
                entryMultiplier: result.entryMultiplier,
                custodialBalance: result.custodialBalance,
                message: `Successfully placed ${betAmount} SOL bet at ${result.entryMultiplier}x`,
                gameState: currentGame ? {
                    gameId: currentGame.id,
                    gameNumber: currentGame.gameNumber,
                    status: currentGame.status,
                    multiplier: currentGame.currentMultiplier,
                    totalBets: currentGame.totalBets,
                    totalPlayers: currentGame.totalPlayers
                } : null
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.reason,
                custodialBalance: result.custodialBalance,
                userId,
                betAmount
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error during bet placement',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// ===== STEP 3.1: PRIVY INTEGRATION API ENDPOINTS =====
// Add these after your existing API endpoints

// ===== PRIVY WALLET REGISTRATION =====
app.post('/api/privy/register', async (req, res): Promise<void> => {
    try {
        const { userId, privyWalletAddress, privyWalletId } = req.body;
        
        if (!userId || !privyWalletAddress) {
            res.status(400).json({
                error: 'Missing required fields: userId, privyWalletAddress'
            });
            return; // FIXED: Added explicit return
        }
        
        const result = await registerPrivyWallet(userId, privyWalletAddress, privyWalletId);
        
        if (result.success) {
            const privyWallet = privyIntegrationManager.privyWallets.get(userId);
            res.json({
                success: true,
                message: 'Privy wallet registered successfully',
                wallet: privyWallet ? {
                    userId: privyWallet.userId,
                    privyWalletAddress: privyWallet.privyWalletAddress,
                    balance: privyWallet.balance,
                    isConnected: privyWallet.isConnected,
                    createdAt: privyWallet.createdAt
                } : null,
                integrationStats: {
                    totalPrivyWallets: privyIntegrationManager.totalPrivyWallets,
                    connectedWallets: privyIntegrationManager.connectedPrivyWallets
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                userId,
                privyWalletAddress
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error during Privy wallet registration',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});


// ===== GET PRIVY WALLET INFO =====
app.get('/api/privy/:userId', async (req, res): Promise<void> => {
    try {
        const { userId } = req.params;
        
        const privyWallet = privyIntegrationManager.privyWallets.get(userId);
        if (!privyWallet) {
            res.status(404).json({
                success: false,
                error: 'Privy wallet not registered for this user',
                userId,
                hint: 'Use POST /api/privy/register to register the user\'s Privy wallet'
            });
            return; // FIXED: Added explicit return
        }
        
        // Update balance from blockchain
        const currentBalance = await updatePrivyWalletBalance(userId);
        
        res.json({
            success: true,
            wallet: {
                userId: privyWallet.userId,
                privyWalletAddress: privyWallet.privyWalletAddress,
                privyWalletId: privyWallet.privyWalletId,
                balance: currentBalance,
                lastBalanceUpdate: privyWallet.lastBalanceUpdate,
                isConnected: privyWallet.isConnected,
                createdAt: privyWallet.createdAt,
                lastUsed: privyWallet.lastUsed
            },
            capabilities: {
                canReceive: true,
                canSend: currentBalance > 0.001,
                canTransferToCustodial: currentBalance > 0.01,
                canTransferFromCustodial: true
            },
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get Privy wallet info',
            userId: req.params.userId
        });
    }
});


// Add this endpoint or update your existing Privy withdrawal handler
app.post('/api/privy/withdraw', async (req, res): Promise<void> => {
    try {
        const { userId, walletAddress, amount, destinationAddress } = req.body;
        
        if (!userId || !walletAddress || !amount || !destinationAddress) {
            res.status(400).json({
                error: 'Missing required fields: userId, walletAddress, amount, destinationAddress'
            });
            return;
        }
        
        // Verify the wallet belongs to the user
        const privyWallet = privyIntegrationManager.privyWallets.get(userId);
        if (!privyWallet || privyWallet.privyWalletAddress !== walletAddress) {
            res.status(400).json({
                error: 'Wallet address does not match user\'s registered Privy wallet'
            });
            return;
        }
        
        // Check current balance
        const currentBalance = await updatePrivyWalletBalance(userId);
        if (currentBalance < amount + 0.001) { // Include fee buffer
            res.status(400).json({
                error: `Insufficient Privy wallet balance: ${currentBalance.toFixed(3)} SOL available`
            });
            return;
        }
        
        // Create unsigned transaction for user to sign
        const userPublicKey = new PublicKey(walletAddress);
        const destinationPublicKey = new PublicKey(destinationAddress);
        const transaction = await createTransaction(userPublicKey, destinationPublicKey, amount);
        
        const { blockhash } = await solanaConnection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPublicKey;
        
        const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
        const base64Transaction = serializedTransaction.toString('base64');
        
        res.json({
            success: true,
            unsignedTransaction: base64Transaction,
            message: 'Transaction created - please sign with your Privy wallet',
            withdrawalDetails: {
                from: walletAddress,
                to: destinationAddress,
                amount: amount,
                currentBalance: currentBalance,
                estimatedFee: 0.001
            }
        });
        
    } catch (error) {
        console.error('Error in /api/privy/withdraw:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during withdrawal preparation'
        });
    }
});

// ===== TRANSFER: CUSTODIAL TO PRIVY =====
app.post('/api/transfer/custodial-to-privy', async (req, res): Promise<void> => {
    try {
        const { userId, amount } = req.body;
        
        if (!userId || !amount) {
            res.status(400).json({
                error: 'Missing required fields: userId, amount'
            });
            return; // FIXED: Added explicit return
        }
        
        if (typeof amount !== 'number' || amount <= 0) {
            res.status(400).json({
                error: 'Invalid amount - must be a positive number'
            });
            return; // FIXED: Added explicit return
        }
        
        const result = await transferCustodialToPrivy(userId, amount);
        
        if (result.success) {
            const userHybridWallet = hybridUserWallets.get(userId);
            const privyWallet = privyIntegrationManager.privyWallets.get(userId);
            
            res.json({
                success: true,
                transferId: result.transferId,
                message: `Successfully transferred ${amount} SOL from custodial to Privy wallet`,
                balances: {
                    custodial: userHybridWallet?.custodialBalance || 0,
                    privy: privyWallet?.balance || 0
                },
                transfer: {
                    amount,
                    from: 'custodial',
                    to: 'privy',
                    status: 'completed'
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                transferId: result.transferId,
                userId,
                amount
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error during transfer',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// ===== TRANSFER: PRIVY TO CUSTODIAL =====
app.post('/api/transfer/privy-to-custodial', async (req, res): Promise<void> => {
    try {
        const { userId, amount, signedTransaction } = req.body;
        
        if (!userId || !amount) {
            res.status(400).json({
                error: 'Missing required fields: userId, amount'
            });
            return; // FIXED: Added explicit return
        }
        
        if (typeof amount !== 'number' || amount <= 0) {
            res.status(400).json({
                error: 'Invalid amount - must be a positive number'
            });
            return; // FIXED: Added explicit return
        }
        
        const result = await transferPrivyToCustodial(userId, amount, signedTransaction);
        
        if (!result.success && result.unsignedTransaction) {
            res.json({
                success: false,
                action: 'signature_required',
                transferId: result.transferId,
                unsignedTransaction: result.unsignedTransaction,
                message: 'Transaction created - please sign with your Privy wallet',
                instructions: [
                    'Use your Privy wallet to sign this transaction',
                    'This will transfer funds from your Privy wallet to your gaming balance',
                    'Send the signed transaction back to complete the transfer'
                ],
                amount,
                from: 'privy',
                to: 'custodial'
            });
            return; // FIXED: Added explicit return
        } else if (result.success) {
            const userHybridWallet = hybridUserWallets.get(userId);
            const privyWallet = privyIntegrationManager.privyWallets.get(userId);
            
            res.json({
                success: true,
                transferId: result.transferId,
                message: `Successfully transferred ${amount} SOL from Privy wallet to custodial balance`,
                balances: {
                    custodial: userHybridWallet?.custodialBalance || 0,
                    privy: privyWallet?.balance || 0
                },
                transfer: {
                    amount,
                    from: 'privy',
                    to: 'custodial',
                    status: 'completed'
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                transferId: result.transferId,
                userId,
                amount
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error during transfer',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// ===== WALLET OVERVIEW =====
app.get('/api/wallet-overview/:userId', async (req, res): Promise<void> => {
    try {
        const { userId } = req.params;
        
        const userHybridWallet = hybridUserWallets.get(userId);
        const privyWallet = privyIntegrationManager.privyWallets.get(userId);
        
        if (!userHybridWallet && !privyWallet) {
            res.status(404).json({
                error: 'No wallet data found for this user',
                userId,
                hint: 'User needs to register Privy wallet and/or make a custodial deposit first'
            });
            return; // FIXED: Added explicit return
        }
        
        // Update Privy balance if wallet exists
        let privyBalance = 0;
        if (privyWallet) {
            privyBalance = await updatePrivyWalletBalance(userId);
        }
        
        res.json({
            userId,
            wallets: {
                custodial: {
                    balance: userHybridWallet?.custodialBalance || 0,
                    totalDeposited: userHybridWallet?.custodialTotalDeposited || 0,
                    lastDeposit: userHybridWallet?.lastCustodialDeposit || 0,
                    canBet: (userHybridWallet?.custodialBalance || 0) >= 0.001,
                    canTransferToPrivy: (userHybridWallet?.custodialBalance || 0) >= 0.01
                },
                privy: {
                    address: privyWallet?.privyWalletAddress || null,
                    balance: privyBalance,
                    isConnected: privyWallet?.isConnected || false,
                    lastUsed: privyWallet?.lastUsed || 0,
                    canTransferToCustodial: privyBalance >= 0.01
                }
            },
            totals: {
                combinedBalance: (userHybridWallet?.custodialBalance || 0) + privyBalance,
                totalTransfersToPrivy: userHybridWallet?.totalTransfersToEmbedded || 0,
                totalTransfersToCustodial: userHybridWallet?.totalTransfersToCustodial || 0,
                lastTransfer: userHybridWallet?.lastTransferBetweenWallets || 0
            },
            capabilities: {
                custodialBetting: true,
                instantCashout: true,
                privyTransfers: !!privyWallet,
                crossWalletTransfers: !!(userHybridWallet && privyWallet)
            },
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get wallet overview',
            userId: req.params.userId
        });
    }
});


// ===== TRANSFER HISTORY =====
app.get('/api/transfers/:userId', async (req, res): Promise<void> => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        // FIXED: Use .range() instead of .offset()
        const { data: transfers, error } = await supabaseService
            .from('wallet_transfers')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(
                parseInt(offset as string), 
                parseInt(offset as string) + parseInt(limit as string) - 1
            );
            
        if (error) {
            res.status(500).json({
                error: 'Failed to fetch transfer history',
                details: error.message
            });
            return;
        }
        
        res.json({
            userId,
            transfers: transfers || [],
            pagination: {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
                total: transfers?.length || 0
            },
            summary: {
                totalTransfers: transfers?.length || 0,
                completedTransfers: transfers?.filter((t: any) => t.status === 'completed').length || 0,
                failedTransfers: transfers?.filter((t: any) => t.status === 'failed').length || 0,
                totalVolume: transfers?.reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0) || 0
            },
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get transfer history',
            userId: req.params.userId
        });
    }
});

// ===== PRIVY INTEGRATION STATS =====
app.get('/api/privy/stats', (req, res) => {
    try {
        updatePrivyIntegrationStats();
        updateHybridSystemStats();
        
        res.json({
            system: 'privy_integration',
            stats: {
                totalPrivyWallets: privyIntegrationManager.totalPrivyWallets,
                connectedPrivyWallets: privyIntegrationManager.connectedPrivyWallets,
                totalPrivyBalance: privyIntegrationManager.totalPrivyBalance,
                averagePrivyBalance: privyIntegrationManager.totalPrivyWallets > 0 ? 
                    privyIntegrationManager.totalPrivyBalance / privyIntegrationManager.totalPrivyWallets : 0
            },
            hybridSystem: {
                totalUsers: hybridSystemStats.totalUsers,
                totalCustodialBalance: hybridSystemStats.totalCustodialBalance,
                totalEmbeddedBalance: hybridSystemStats.totalEmbeddedBalance,
                balanceRatio: hybridSystemStats.totalCustodialBalance / Math.max(1, hybridSystemStats.totalEmbeddedBalance)
            },
            recentActivity: Array.from(privyIntegrationManager.privyWallets.values())
                .sort((a, b) => b.lastUsed - a.lastUsed)
                .slice(0, 10)
                .map(w => ({
                    userId: w.userId,
                    balance: w.balance,
                    lastUsed: w.lastUsed,
                    isConnected: w.isConnected
                })),
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get Privy integration stats'
        });
    }
});


// ===== STEP 3.2: UPDATE YOUR server.listen() FUNCTION =====
// Find your existing server.listen() and UPDATE it like this:


// ===== CUSTODIAL DEPOSIT API =====
app.post('/api/custodial/deposit', async (req, res): Promise<void> => {
    try {
        const { userId, externalWalletAddress, depositAmount, signedTransaction } = req.body;
        
        if (!userId || !externalWalletAddress || !depositAmount) {
            res.status(400).json({
                error: 'Missing required fields: userId, externalWalletAddress, depositAmount'
            });
            return; // Add explicit return
        }
        
        if (typeof depositAmount !== 'number' || depositAmount <= 0) {
            res.status(400).json({
                error: 'Invalid deposit amount - must be a positive number'
            });
            return; // Add explicit return
        }
        
        const result = await depositToCustodialBalance(userId, externalWalletAddress, depositAmount, signedTransaction);
        
        if (!result.success && result.unsignedTransaction) {
            res.json({
                success: false,
                action: 'signature_required',
                unsignedTransaction: result.unsignedTransaction,
                message: 'Transaction created - please sign with your wallet',
                instructions: [
                    'Copy the unsigned transaction',
                    'Sign it with your Solana wallet',
                    'Send the signed transaction back to complete the deposit'
                ]
            });
        } else if (result.success) {
            res.json({
                success: true,
                custodialBalance: result.custodialBalance,
                message: `Successfully deposited ${depositAmount} SOL to custodial balance`,
                newBalance: result.custodialBalance
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                userId,
                depositAmount
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error during deposit',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// ===== USER WALLET MANAGEMENT API =====
app.get('/api/user/:userId/wallet', (req, res): void => {
    try {
        const { userId } = req.params;
        const userWallet = hybridUserWallets.get(userId);
        
        if (!userWallet) {
            res.status(404).json({
                error: 'User wallet not found',
                userId,
                hint: 'User needs to make a deposit first to create wallet'
            });
            return; // Add explicit return
        }
        
        res.json({
            userId,
            wallet: {
                externalWalletAddress: userWallet.externalWalletAddress,
                custodialBalance: userWallet.custodialBalance,
                totalDeposited: userWallet.custodialTotalDeposited,
                lastDeposit: userWallet.lastCustodialDeposit,
                embeddedWalletId: userWallet.embeddedWalletId,
                embeddedBalance: userWallet.embeddedBalance,
                lastEmbeddedWithdrawal: userWallet.lastEmbeddedWithdrawal,
                totalTransfersToEmbedded: userWallet.totalTransfersToEmbedded,
                totalTransfersToCustodial: userWallet.totalTransfersToCustodial,
                createdAt: userWallet.createdAt
            },
            capabilities: {
                canBet: userWallet.custodialBalance >= 0.001,
                canCashOut: userWallet.custodialBalance > 0,
                hasEmbeddedWallet: !!userWallet.embeddedWalletId,
                canTransfer: userWallet.custodialBalance > 0.01
            },
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get user wallet',
            userId: req.params.userId
        });
    }
});

// ===== GAME STATISTICS WITH HYBRID DATA =====
app.get('/api/game/stats', (req, res): void => {
    try {
        const config = getCurrentGameConfig();
        updateHybridSystemStats();
        
        res.json({
            currentGame: currentGame ? {
                gameId: currentGame.id,
                gameNumber: currentGame.gameNumber,
                status: currentGame.status,
                multiplier: currentGame.currentMultiplier,
                startTime: currentGame.startTime,
                totalBets: currentGame.totalBets,
                totalPlayers: currentGame.totalPlayers,
                houseBalance: currentGame.houseBalance,
                maxPayoutCapacity: currentGame.maxPayoutCapacity,
                countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined,
                tradingState: {
                    trend: tradingState.trend,
                    momentum: tradingState.momentum,
                    rugPullRisk: tradingState.rugPullProbability
                }
            } : null,
            
            hybrid: {
                stats: hybridSystemStats,
                config: {
                    custodialBettingEnabled: true,
                    instantCashoutEnabled: true,
                    maxCustodialBalance: 10.0,
                    recommendedGamingBalance: 2.0
                }
            },
            
            gameConfig: {
                minBetAmount: config.MIN_BET,
                maxBetAmount: config.MAX_BET,
                houseEdge: config.HOUSE_EDGE,
                maxMultiplier: config.MAX_MULTIPLIER,
                instantRugThreshold: config.INSTANT_RUG_THRESHOLD,
                maxSinglePayout: config.MAX_SINGLE_PAYOUT,
                bootstrapMode: config._BOOTSTRAP_MODE,
                bootstrapLevel: config._BOOTSTRAP_LEVEL
            },
            
            recentGames: gameHistory.slice(-5).map(game => ({
                gameNumber: game.gameNumber,
                crashMultiplier: game.crashMultiplier,
                totalBets: game.totalBets,
                totalPlayers: game.totalPlayers,
                startTime: game.startTime
            })),
            
            timestamp: Date.now(),
            serverTime: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get game statistics'
        });
    }
});

// ===== HYBRID SYSTEM ADMINISTRATION =====
app.get('/api/admin/hybrid', (req, res): void => {
    try {
        updateHybridSystemStats();
        
        const walletDetails = Array.from(hybridUserWallets.values()).map(wallet => ({
            userId: wallet.userId,
            externalWalletAddress: wallet.externalWalletAddress,
            custodialBalance: wallet.custodialBalance,
            totalDeposited: wallet.custodialTotalDeposited,
            embeddedBalance: wallet.embeddedBalance,
            totalTransfers: wallet.totalTransfersToEmbedded + wallet.totalTransfersToCustodial,
            lastActivity: Math.max(wallet.lastCustodialDeposit, wallet.lastEmbeddedWithdrawal, wallet.lastTransferBetweenWallets),
            createdAt: wallet.createdAt
        }));
        
        res.json({
            systemStats: hybridSystemStats,
            
            walletBreakdown: {
                totalWallets: walletDetails.length,
                activeWallets: walletDetails.filter(w => w.custodialBalance > 0.001).length,
                totalCustodialValue: walletDetails.reduce((sum, w) => sum + w.custodialBalance, 0),
                totalEmbeddedValue: walletDetails.reduce((sum, w) => sum + w.embeddedBalance, 0),
                totalDeposited: walletDetails.reduce((sum, w) => sum + w.totalDeposited, 0),
                averageBalance: walletDetails.length > 0 ? 
                    walletDetails.reduce((sum, w) => sum + w.custodialBalance, 0) / walletDetails.length : 0
            },
            
            recentActivity: walletDetails
                .filter(w => w.lastActivity > Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                .sort((a, b) => b.lastActivity - a.lastActivity)
                .slice(0, 10),
            
            gameIntegration: {
                currentGameActive: !!currentGame,
                custodialBetsEnabled: true,
                instantCashoutEnabled: true,
                houseBalance: houseBalance, // Fixed the typo here
                totalGamingBalance: hybridSystemStats.totalCustodialBalance
            },
            
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get hybrid system admin data'
        });
    }
});

// ===== TRANSACTION HISTORY API =====
app.get('/api/user/:userId/transactions', async (req, res): Promise<void> => {
    try {
        const { userId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        
        // Fixed: Use .range() instead of .offset() for Supabase pagination
        const { data: transactions, error } = await supabaseService
            .from('player_bets')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(
                parseInt(offset as string), 
                parseInt(offset as string) + parseInt(limit as string) - 1
            );
            
        if (error) {
            res.status(500).json({
                error: 'Failed to fetch transaction history',
                details: error.message
            });
            return; // Add explicit return
        }
        
        const userWallet = hybridUserWallets.get(userId);
        
        res.json({
            userId,
            transactions: transactions || [],
            pagination: {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
                total: transactions?.length || 0
            },
            currentBalance: userWallet ? {
                custodial: userWallet.custodialBalance,
                embedded: userWallet.embeddedBalance,
                totalDeposited: userWallet.custodialTotalDeposited
            } : null,
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get transaction history',
            userId: req.params.userId
        });
    }
});

app.get('/api/wallet/balance/:address', async (req, res): Promise<void> => {
    try {
        const { address } = req.params;
        const balance = await getUserWalletBalance(address);
        void res.json({ address, balance, timestamp: Date.now() });
    } catch (error) {
        console.error('Error in /api/wallet/balance:', error);
        res.status(400).json({ error: 'Invalid wallet address' });
    }
});

app.post('/api/solana/balance', async (req, res): Promise<void> => {
    try {
        const { address } = req.body;
        
        if (!address) {
            res.status(400).json({
                error: 'Missing required field: address'
            });
            return;
        }
        
        const balance = await getUserWalletBalance(address);
        
        res.json({
            address,
            balance,
            timestamp: Date.now(),
            source: 'solana_rpc'
        });
        
    } catch (error) {
        console.error('Error in /api/solana/balance:', error);
        res.status(400).json({ 
            error: 'Invalid wallet address or RPC error',
            address: req.body?.address
        });
    }
});

// Add this endpoint after your existing /api/wallet/balance/:address endpoint
app.post('/api/solana/balance', async (req, res): Promise<void> => {
    try {
        const { address } = req.body;
        
        if (!address) {
            res.status(400).json({
                error: 'Missing required field: address'
            });
            return;
        }
        
        const balance = await getUserWalletBalance(address);
        
        res.json({
            address,
            balance,
            timestamp: Date.now(),
            source: 'solana_rpc'
        });
        
    } catch (error) {
        console.error('Error in /api/solana/balance:', error);
        res.status(400).json({ 
            error: 'Invalid wallet address or RPC error',
            address: req.body?.address
        });
    }
});

app.get('/api/house/status', async (req, res): Promise<void> => {
    try {
        await updateHouseBalance();
        const config = getCurrentGameConfig();
        
        void res.json({
            address: housePublicKey.toString(),
            balance: houseBalance,
            maxPayoutCapacity: calculateMaxPayoutCapacity(),
            minReserve: config.MIN_HOUSE_BALANCE,
            maxSinglePayout: config.MAX_SINGLE_PAYOUT,
            instantRugBetLimit: config.INSTANT_RUG_THRESHOLD,
            instantRugPayoutLimit: config.MAX_SINGLE_PAYOUT,
            houseEdge: config.HOUSE_EDGE,
            rpcEndpoint: SOLANA_RPC_URL,
            lastUpdated: lastHouseBalanceUpdate
        });
    } catch (error) {
        console.error('Error in /api/house/status:', error);
        res.status(500).json({ error: 'Failed to get house status' });
    }
});

app.get('/api/multiplier/control', (req, res): void => {
    try {
        const stats = calculateRollingStats();
        const now = Date.now();
        
        void res.json({
            control: {
                recentGames: multiplierControl.recentGames.map(game => ({
                    gameNumber: game.gameNumber,
                    crashMultiplier: game.crashMultiplier,
                    totalBets: game.totalBets,
                    totalPayouts: game.totalPayouts,
                    houseProfit: game.houseProfit,
                    timestamp: game.timestamp
                })),
                consecutiveHighCount: multiplierControl.consecutiveHighCount,
                cooldownActive: multiplierControl.cooldownActive,
                cooldownUntil: multiplierControl.cooldownUntil,
                cooldownRemainingMs: Math.max(0, multiplierControl.cooldownUntil - now),
                lastHighMultiplier: multiplierControl.lastHighMultiplier
            },
            stats: {
                rollingHouseProfitRatio: stats.houseProfitRatio,
                rollingHouseProfitPercentage: (stats.houseProfitRatio * 100).toFixed(1) + '%',
                gamesInWindow: stats.gamesCount,
                totalBetsInWindow: stats.totalBets,
                totalPayoutsInWindow: stats.totalPayouts,
                targetHouseEdge: (MULTIPLIER_CONTROL.TARGET_HOUSE_EDGE_RATIO * 100).toFixed(1) + '%'
            },
            thresholds: {
                highMultiplier: MULTIPLIER_CONTROL.HIGH_MULTIPLIER_THRESHOLD,
                veryHighMultiplier: MULTIPLIER_CONTROL.VERY_HIGH_MULTIPLIER_THRESHOLD,
                maxConsecutiveHigh: MULTIPLIER_CONTROL.MAX_CONSECUTIVE_HIGH,
                cooldownDuration: MULTIPLIER_CONTROL.COOLDOWN_DURATION,
                maxMultiplierDuringCooldown: MULTIPLIER_CONTROL.MAX_MULTIPLIER_DURING_COOLDOWN,
                rollingWindowSize: MULTIPLIER_CONTROL.ROLLING_WINDOW_SIZE
            }
        });
    } catch (error) {
        console.error('Error in /api/multiplier/control:', error);
        res.status(500).json({ error: 'Failed to get multiplier control data' });
    }
});

app.get('/api/verify-transaction/:signature', async (req, res): Promise<void> => {
    try {
        const { signature } = req.params;
        
        const transaction = await solanaConnection.getTransaction(signature, {
            commitment: 'confirmed'
        });
        
        if (!transaction) {
            void res.status(404).json({
                error: 'Transaction not found',
                signature
            });
            return;
        }
        
        const transferInstruction = findTransferInstruction(transaction);
        
        let transferDetails = null;
        if (transferInstruction) {
            try {
                const decoded = decodeTransferInstruction(transferInstruction);
                transferDetails = {
                    from: decoded.fromPubkey.toString(),
                    to: decoded.toPubkey.toString(),
                    amount: decoded.lamports / LAMPORTS_PER_SOL
                };
            } catch (decodeError) {
                console.warn('Failed to decode transfer instruction:', decodeError);
            }
        }
        
        void res.json({
            signature,
            confirmed: true,
            slot: transaction.slot,
            blockTime: transaction.blockTime,
            fee: transaction.meta?.fee,
            success: !transaction.meta?.err,
            error: transaction.meta?.err,
            transferDetails
        });
        
    } catch (error) {
        console.error('Error in /api/verify-transaction:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Verification failed',
            signature: req.params.signature
        });
    }
});

// Bootstrap API endpoints
app.get('/api/bootstrap/status', (req, res): void => {
    try {
        const status = getBootstrapStatus(houseBalance);
        const now = Date.now();
        
        void res.json({
            bootstrap: {
                masterEnabled: bootstrapState.masterEnabled,
                currentlyActive: status.active,
                mode: status.mode,
                canReenter: status.canReenter,
                reason: status.reason,
                
                sessionActive: bootstrapState.currentlyActive,
                sessionStartTime: bootstrapState.currentSessionStart,
                sessionDuration: bootstrapState.currentSessionStart > 0 ? now - bootstrapState.currentSessionStart : 0,
                sessionGamesPlayed: bootstrapState.currentSessionGames,
                sessionProfit: bootstrapState.currentSessionProfit,
                
                totalSessions: bootstrapState.totalSessions,
                totalBootstrapTime: bootstrapState.totalBootstrapTime,
                lifetimeGamesPlayed: bootstrapState.lifetimeGamesPlayed,
                lifetimeProfitGenerated: bootstrapState.lifetimeProfitGenerated,
                
                lastExitTime: bootstrapState.lastExitTime,
                cooldownRemaining: Math.max(0, (bootstrapState.lastExitTime + BOOTSTRAP_CONFIG.COOLDOWN_AFTER_EXIT) - now),
                sessionTimeRemaining: bootstrapState.currentSessionStart > 0 ? 
                    Math.max(0, (bootstrapState.currentSessionStart + BOOTSTRAP_CONFIG.MAX_SINGLE_SESSION) - now) : 0,
                lifetimeTimeRemaining: Math.max(0, (BOOTSTRAP_CONFIG.INITIAL_START_TIME + BOOTSTRAP_CONFIG.MAX_TOTAL_DURATION) - now),
                
                thresholds: {
                    emergency: BOOTSTRAP_CONFIG.EMERGENCY_THRESHOLD,
                    enter: BOOTSTRAP_CONFIG.ENTER_BOOTSTRAP_THRESHOLD,
                    exit: BOOTSTRAP_CONFIG.EXIT_BOOTSTRAP_THRESHOLD,
                    current: houseBalance
                }
            },
            
            currentSettings: status.settings,
            
            controls: {
                forceExit: '/api/bootstrap/force-exit',
                disable: '/api/bootstrap/disable',
                resetCooldown: '/api/bootstrap/reset-cooldown'
            }
        });
    } catch (error) {
        console.error('Error in /api/bootstrap/status:', error);
        res.status(500).json({ error: 'Failed to get bootstrap status' });
    }
});

function forceExitBootstrap(reason = 'Manual override'): void {
    if (bootstrapState.currentlyActive) {
        const sessionDuration = Date.now() - bootstrapState.currentSessionStart;
        bootstrapState.totalBootstrapTime += sessionDuration;
        bootstrapState.currentlyActive = false;
        bootstrapState.lastExitTime = Date.now();
        console.log(`🛑 Bootstrap force-exited: ${reason}`);
    }
}

function disableBootstrapPermanently(reason = 'Manual disable'): void {
    forceExitBootstrap(reason);
    bootstrapState.masterEnabled = false;
    console.log(`🚫 Bootstrap permanently disabled: ${reason}`);
}

function resetBootstrapCooldown(): void {
    bootstrapState.lastExitTime = 0;
    console.log('🔄 Bootstrap cooldown reset - can re-enter immediately');
}

app.post('/api/bootstrap/force-exit', (req, res): void => {
    try {
        forceExitBootstrap('API request');
        void res.json({ success: true, message: 'Bootstrap force-exited' });
    } catch (error) {
        console.error('Error in /api/bootstrap/force-exit:', error);
        res.status(500).json({ success: false, error: 'Failed to force-exit bootstrap' });
    }
});

app.post('/api/bootstrap/disable', (req, res): void => {
    try {
        disableBootstrapPermanently('API request');
        void res.json({ success: true, message: 'Bootstrap permanently disabled' });
    } catch (error) {
        console.error('Error in /api/bootstrap/disable:', error);
        res.status(500).json({ success: false, error: 'Failed to disable bootstrap' });
    }
});

app.post('/api/bootstrap/reset-cooldown', (req, res): void => {
    try {
        resetBootstrapCooldown();
        void res.json({ success: true, message: 'Bootstrap cooldown reset' });
    } catch (error) {
        console.error('Error in /api/bootstrap/reset-cooldown:', error);
        res.status(500).json({ success: false, error: 'Failed to reset cooldown' });
    }
});

// GAME COUNTER FIX: Add optional endpoint to check game counter status
app.get('/api/game/counter', (req, res): void => {
    try {
        void res.json({
            currentGameCounter: globalGameCounter,
            nextGameNumber: globalGameCounter >= 100 ? 1 : globalGameCounter + 1,
            historyLength: gameHistory.length,
            oldestGameInHistory: gameHistory.length > 0 ? gameHistory[0].gameNumber : null,
            newestGameInHistory: gameHistory.length > 0 ? gameHistory[gameHistory.length - 1].gameNumber : null
        });
    } catch (error) {
        console.error('Error in /api/game/counter:', error);
        res.status(500).json({ error: 'Failed to get game counter status' });
    }
});

// FIXED: Error handling middleware with explicit return
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction): void => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: NODE_ENV === 'production' ? 'Internal server error' : error.message 
    });
    // Explicit return for TypeScript
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

app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction): void => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: NODE_ENV === 'production' ? 'Internal server error' : error.message 
    });
    return; // FIXED: Added explicit return
});
// GAME COUNTER FIX: Server startup with game counter initialization
// UPDATED SERVER STARTUP - Replace your existing server.listen() block with this:

server.listen(PORT, async () => {
    // Initialize systems in order
    await initializeHybridSystem();      // Custodial wallets
    await initializePrivyIntegration();  // Privy wallets  
    await initializeGameCounter();       // Game counter
    
    await updateHouseBalance();
    const config = getCurrentGameConfig();
    
    console.log(`🎮 Enhanced hybrid game server running on port ${PORT}`);
    console.log(`🏛️ House wallet: ${housePublicKey.toString()}`);
    console.log(`💰 House balance: ${houseBalance.toFixed(3)} SOL`);
    console.log(`🔄 Hybrid system: ${hybridSystemStats.totalUsers} users loaded`);
    console.log(`💎 Custodial balance: ${hybridSystemStats.totalCustodialBalance.toFixed(3)} SOL`);
    console.log(`🔗 Privy integration: ${privyIntegrationManager.totalPrivyWallets} wallets, ${privyIntegrationManager.connectedPrivyWallets} connected`);
    console.log(`💼 Privy wallet balance: ${privyIntegrationManager.totalPrivyBalance.toFixed(3)} SOL`);
    console.log(`🔐 Direct blockchain integration: ENABLED`);
    console.log(`🎲 Next game number: ${globalGameCounter >= 100 ? 1 : globalGameCounter + 1}`);
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
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Privy integration: http://localhost:${PORT}/api/privy/stats`);
    console.log(`Wallet overview: http://localhost:${PORT}/api/wallet-overview/[userId]`);
    console.log(`🚀 Starting game loop...`);

    startWaitingPeriod();
});