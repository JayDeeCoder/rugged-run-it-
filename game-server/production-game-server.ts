// production-game-server.ts - Complete Trader-Style Implementation
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as crypto from 'crypto';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
const PORT = process.env.PORT || 3001;
const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS || '';

// Initialize services
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseService = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY!);
const solanaConnection = new Connection(SOLANA_RPC_URL);
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3001",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve Next.js static files
app.use(express.static(".next/static"));
app.use(express.static("public"));

// Types
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
}

interface ChartPoint {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
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
}

interface TradingState {
    trend: 'up' | 'down' | 'sideways';
    momentum: number;           // -1 to 1
    volatility: number;         // Current volatility level
    lastDirection: number;      // Last price direction
    consecutiveRises: number;   // Track consecutive rises
    rugPullPending: boolean;    // Whether rug pull is imminent
    rugPullProbability: number; // Current rug pull chance
    totalBetsSinceStart: number; // Total bets placed
    highBetCount: number;       // Number of high bets
}

interface LeaderboardEntry {
    userId: string;
    walletAddress: string;
    username: string;
    totalProfit: number;
    profitPercentage: number;
    gamesPlayed: number;
    bestMultiplier: number;
    winRate: number;
    rank?: number;
}

interface BetWithUser {
    wallet_address: string;
    user_id: string;
    bet_amount: number;
    profit_loss: number | null;
    cashout_multiplier: number | null;
    users: {
        username: string;
        avatar: string;
        level: number;
        badge: string;
    } | null;
}

interface PlaceBetData {
    walletAddress: string;
    betAmount: number;
    userId?: string;
}

interface CashOutData {
    walletAddress: string;
}

// Enhanced betting validation configuration
const BET_VALIDATION = {
    MIN_HOLD_TIME: 2000,           // Minimum 2 seconds before cashout
    MAX_PAYOUT_MULTIPLIER: 100.0,  // Maximum payout cap (only if house gets 40%)
    LATE_BET_PENALTY: 0.0,         // No penalty - users risk rug pull instead
    HOUSE_EDGE: 0.40               // 40% house edge
};

// Enhanced game configuration with trader logic
const GAME_CONFIG = {
    MIN_GAME_DURATION: 5000, // 5 seconds
    MAX_GAME_DURATION: 180000, // 3 minutes
    HOUSE_EDGE: 0.40, // 40% house edge
    UPDATE_INTERVAL: 100, // 100ms updates
    MIN_BET: 0.001,
    MAX_BET: 10.0,
    MAX_MULTIPLIER: 100.0,
    // Trader-style configuration
    HIGH_BET_THRESHOLD: 5.0,      // 5+ SOL bets trigger rug risk
    INSTANT_RUG_THRESHOLD: 10.0,  // 10 SOL instant rug pull
    VOLATILITY_BASE: 0.02,        // Base price volatility
    TREND_CHANGE_CHANCE: 0.15,    // 15% chance to reverse trend per update
    RUG_PULL_CHANCE_BASE: 0.001,  // Base rug pull chance per update
    MAX_RISE_WITHOUT_DIP: 2.5     // Max rise before forced dip
};

// Game state
let currentGame: GameState | null = null;
let gameHistory: GameState[] = [];
let gameStartLock = false;

// Enhanced countdown management
let gameCountdown: NodeJS.Timeout | null = null;
let countdownTimeRemaining = 0;

// Trading state for realistic price action
let tradingState: TradingState = {
    trend: 'up',
    momentum: 0.3,
    volatility: GAME_CONFIG.VOLATILITY_BASE,
    lastDirection: 1,
    consecutiveRises: 0,
    rugPullPending: false,
    rugPullProbability: GAME_CONFIG.RUG_PULL_CHANCE_BASE,
    totalBetsSinceStart: 0,
    highBetCount: 0
};

// Utility functions
function generateProvablyFairSeed(): string {
    return crypto.randomBytes(32).toString('hex');
}

function calculateCrashPoint(seed: string, gameNumber: number): number {
    const hash = crypto.createHash('sha256').update(seed + gameNumber).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const crashPoint = Math.max(1.0, (hashInt / 0xFFFFFFFF) * GAME_CONFIG.MAX_MULTIPLIER);
    return Math.floor(crashPoint * 100) / 100;
}

function generateGameDuration(crashPoint: number): number {
    const baseTime = GAME_CONFIG.MIN_GAME_DURATION;
    const maxTime = GAME_CONFIG.MAX_GAME_DURATION;
    const factor = Math.min(crashPoint / 10, 1);
    return baseTime + (maxTime - baseTime) * factor;
}

// Reset trading state for new games
function resetTradingState(): void {
    tradingState = {
        trend: Math.random() < 0.6 ? 'up' : 'sideways', // Start mostly bullish
        momentum: Math.random() * 0.5 + 0.2, // Positive momentum to start
        volatility: GAME_CONFIG.VOLATILITY_BASE,
        lastDirection: 1,
        consecutiveRises: 0,
        rugPullPending: false,
        rugPullProbability: GAME_CONFIG.RUG_PULL_CHANCE_BASE,
        totalBetsSinceStart: 0,
        highBetCount: 0
    };
    console.log(`🎮 Trading state reset - Starting trend: ${tradingState.trend}`);
}

// Calculate maximum safe multiplier based on house edge
function calculateMaxSafeMultiplier(): number {
    if (!currentGame) return 100;
    
    const totalBets = currentGame.totalBets;
    const houseTake = totalBets * GAME_CONFIG.HOUSE_EDGE; // 40% for house
    const availableForPayouts = totalBets - houseTake;
    
    if (totalBets === 0 || availableForPayouts <= 0) return 100;
    
    // Find the maximum multiplier where house still gets 40%
    let maxSafeMultiplier = 100;
    
    // Calculate potential payouts for each bet
    let totalPotentialPayout = 0;
    for (const [_, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            totalPotentialPayout += bet.betAmount * maxSafeMultiplier;
        }
    }
    
    // Reduce max multiplier if it would exceed house edge
    while (totalPotentialPayout > availableForPayouts && maxSafeMultiplier > 1.1) {
        maxSafeMultiplier -= 0.1;
        totalPotentialPayout = 0;
        for (const [_, bet] of currentGame.activeBets) {
            if (!bet.cashedOut) {
                totalPotentialPayout += bet.betAmount * maxSafeMultiplier;
            }
        }
    }
    
    return Math.max(1.1, maxSafeMultiplier);
}

// Dynamic trend changes
function changeTrend(): void {
    // Bias towards opposite of current trend for realistic reversals
    if (tradingState.trend === 'up') {
        tradingState.trend = Math.random() < 0.7 ? 'down' : 'sideways';
    } else if (tradingState.trend === 'down') {
        tradingState.trend = Math.random() < 0.6 ? 'up' : 'sideways';
    } else {
        tradingState.trend = Math.random() < 0.5 ? 'up' : 'down';
    }
    
    // Adjust momentum and volatility
    tradingState.momentum = (Math.random() - 0.5) * 2; // -1 to 1
    tradingState.volatility = GAME_CONFIG.VOLATILITY_BASE * (1 + Math.random());
    
    console.log(`📊 Trend changed to: ${tradingState.trend}, momentum: ${tradingState.momentum.toFixed(2)}`);
}

// Trader-style multiplier calculation
function calculateTraderMultiplier(elapsed: number, duration: number): number {
    if (!currentGame) return 1.0;

    const currentMultiplier = currentGame.currentMultiplier;
    const progress = elapsed / duration;
    
    // Base price change
    let priceChange = 0;
    
    // Trend-based movement
    switch (tradingState.trend) {
        case 'up':
            priceChange = 0.001 + (Math.random() * 0.003) * tradingState.momentum;
            break;
        case 'down':
            priceChange = -0.002 - (Math.random() * 0.004) * Math.abs(tradingState.momentum);
            break;
        case 'sideways':
            priceChange = (Math.random() - 0.5) * 0.001;
            break;
    }
    
    // Add volatility
    priceChange += (Math.random() - 0.5) * tradingState.volatility;
    
    // Apply momentum
    priceChange *= (1 + tradingState.momentum * 0.5);
    
    // Check for trend changes
    if (Math.random() < GAME_CONFIG.TREND_CHANGE_CHANCE) {
        changeTrend();
    }
    
    // Force dips after consecutive rises
    if (tradingState.consecutiveRises >= GAME_CONFIG.MAX_RISE_WITHOUT_DIP) {
        priceChange = -0.005 - (Math.random() * 0.01); // Force significant dip
        tradingState.consecutiveRises = 0;
        tradingState.trend = 'down';
        console.log('📉 Forced dip after consecutive rises');
    }
    
    // Track direction
    if (priceChange > 0) {
        tradingState.consecutiveRises++;
        tradingState.lastDirection = 1;
    } else {
        tradingState.consecutiveRises = 0;
        tradingState.lastDirection = -1;
    }
    
    // Calculate new multiplier
    const newMultiplier = Math.max(0.1, currentMultiplier * (1 + priceChange));
    
    // Ensure multiplier doesn't exceed safe payout levels
    const maxSafeMultiplier = calculateMaxSafeMultiplier();
    
    return Math.min(newMultiplier, maxSafeMultiplier);
}

// Check for instant rug pull conditions
function shouldInstantRugPull(): boolean {
    if (!currentGame) return false;
    
    // Check for 10+ SOL bets (instant rug)
    for (const [_, bet] of currentGame.activeBets) {
        if (!bet.cashedOut && bet.betAmount >= GAME_CONFIG.INSTANT_RUG_THRESHOLD) {
            return true;
        }
    }
    
    // Check for multiple high bets totaling danger
    const highBets = Array.from(currentGame.activeBets.values())
        .filter(bet => !bet.cashedOut && bet.betAmount >= GAME_CONFIG.HIGH_BET_THRESHOLD);
    
    const totalHighBets = highBets.reduce((sum, bet) => sum + bet.betAmount, 0);
    
    // Instant rug if high bets total > 15 SOL
    if (totalHighBets >= 15) {
        return true;
    }
    
    return false;
}

// Check for probability-based rug pull
function shouldRugPull(): boolean {
    if (!currentGame) return false;
    
    // Base rug pull chance
    let rugChance = tradingState.rugPullProbability;
    
    // Increase chance based on high bets
    const highBets = Array.from(currentGame.activeBets.values())
        .filter(bet => !bet.cashedOut && bet.betAmount >= GAME_CONFIG.HIGH_BET_THRESHOLD);
    
    rugChance += highBets.length * 0.002; // +0.2% per high bet
    
    // Increase chance based on current multiplier
    if (currentGame.currentMultiplier > 5) {
        rugChance += (currentGame.currentMultiplier - 5) * 0.001;
    }
    
    // Increase chance based on total pot size
    if (currentGame.totalBets > 20) {
        rugChance += (currentGame.totalBets - 20) * 0.0005;
    }
    
    // Maximum rug chance
    rugChance = Math.min(0.05, rugChance); // Max 5% per update
    
    // Update trading state
    tradingState.rugPullProbability = rugChance;
    
    return Math.random() < rugChance;
}

// Enhanced game loop with trader-style price action
async function runGameLoop(duration: number): Promise<void> {
    if (!currentGame) return;

    const startTime = Date.now();
    const endTime = startTime + duration;
    let lastUpdate = startTime;
    let lastChartUpdate = startTime;

    console.log(`Starting trader-style game loop for Game ${currentGame.gameNumber} - Duration: ${duration}ms`);

    const gameLoop = setInterval(() => {
        if (!currentGame || currentGame.status !== 'active') {
            clearInterval(gameLoop);
            return;
        }

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Check for instant rug pull conditions
        if (shouldInstantRugPull()) {
            console.log('💥 INSTANT RUG PULL TRIGGERED - High bet detected!');
            crashGame();
            clearInterval(gameLoop);
            return;
        }

        // Check for probability-based rug pull
        if (shouldRugPull()) {
            console.log('💥 RUG PULL TRIGGERED - Probability based!');
            crashGame();
            clearInterval(gameLoop);
            return;
        }

        if (progress >= 1 || now >= endTime) {
            // Natural game end
            crashGame();
            clearInterval(gameLoop);
            return;
        }

        // Calculate trader-style multiplier
        const newMultiplier = calculateTraderMultiplier(elapsed, duration);
        currentGame.currentMultiplier = Math.round(newMultiplier * 100) / 100;

        // Enhanced broadcast
        io.emit('multiplierUpdate', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            timestamp: now,
            serverTime: now,
            progress: progress,
            trend: tradingState.trend,
            rugPullRisk: tradingState.rugPullProbability
        });

        // Generate chart data every second
        if (now - lastChartUpdate >= 1000) {
            const chartPoint: ChartPoint = {
                timestamp: now,
                open: currentGame.chartData.length > 0 ? currentGame.chartData[currentGame.chartData.length - 1].close : 1.0,
                high: currentGame.currentMultiplier * (1 + Math.random() * tradingState.volatility),
                low: currentGame.currentMultiplier * (1 - Math.random() * tradingState.volatility),
                close: currentGame.currentMultiplier,
                volume: currentGame.totalBets
            };

            currentGame.chartData.push(chartPoint);
            lastChartUpdate = now;

            saveChartData(chartPoint).catch((err: any) => console.warn('Chart data save failed:', err.message));
        }

    }, GAME_CONFIG.UPDATE_INTERVAL);
}

// Enhanced startNewGame with bet transfer from waiting period
async function startNewGame(): Promise<void> {
    // Reset trading state for new game
    resetTradingState();
    
    // Get existing bets from waiting period
    const existingBets = currentGame?.activeBets || new Map();
    const existingTotalBets = currentGame?.totalBets || 0;
    const existingTotalPlayers = currentGame?.totalPlayers || 0;

    if (gameStartLock) {
        console.log('Game start already in progress, skipping...');
        return;
    }

    gameStartLock = true;

    try {
        try {
            const { data: existingGame } = await supabaseService
                .from('games')
                .select('*')
                .eq('status', 'active')
                .single();

            if (existingGame) {
                console.log('Found existing active game, not starting new one');
                gameStartLock = false;
                return;
            }
        } catch (error) {
            // No existing game found, proceed
        }

        const seed = generateProvablyFairSeed();
        const gameNumber = gameHistory.length + 1;
        const crashPoint = calculateCrashPoint(seed, gameNumber);
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
                    pre_game_players: existingTotalPlayers
                })
                .select()
                .single();

            if (error) {
                console.warn('Database write failed, using memory mode:', error.message);
            } else {
                gameId = gameData.id;
                console.log('Game saved to database successfully');
            }
        } catch (dbError) {
            console.warn('Database connection failed, running in memory mode:', dbError);
        }

        currentGame = {
            id: gameId,
            gameNumber,
            startTime: Date.now(),
            currentMultiplier: 1.0,
            maxMultiplier: crashPoint,
            status: 'active',
            totalBets: existingTotalBets,
            totalPlayers: existingTotalPlayers,
            crashMultiplier: crashPoint,
            seed,
            chartData: [],
            activeBets: existingBets
        };

        console.log(`🎮 Trader Game ${gameNumber} started with ${existingTotalPlayers} pre-game bets (${existingTotalBets.toFixed(3)} SOL) - Crash point: ${crashPoint}x`);

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
            tradingState: {
                trend: tradingState.trend,
                momentum: tradingState.momentum
            }
        });

        runGameLoop(duration);

    } catch (error) {
        console.error('Error starting new game:', error);
        setTimeout(() => {
            gameStartLock = false;
            startWaitingPeriod();
        }, 10000);
    } finally {
        gameStartLock = false;
    }
}

// Enhanced crashGame with waiting period transition
async function crashGame(): Promise<void> {
    if (!currentGame) return;

    const crashTime = Date.now();
    currentGame.status = 'crashed';
    const crashMultiplier = currentGame.currentMultiplier;

    console.log(`💥 Trader Game ${currentGame.gameNumber} crashed at ${crashMultiplier}x at ${new Date(crashTime).toISOString()}`);

    // Process all active bets
    for (const [walletAddress, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            await processBetLoss(bet).catch((err: any) => console.warn('Bet loss processing failed:', err.message));
        }
    }

    // Update game in database
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
                    total_players: currentGame.totalPlayers
                })
                .eq('id', currentGame.id);
        }
    } catch (error) {
        console.warn('Game update failed:', error);
    }

    io.emit('gameCrashed', {
        gameId: currentGame.id,
        gameNumber: currentGame.gameNumber,
        crashMultiplier,
        serverTime: crashTime,
        timestamp: crashTime,
        finalMultiplier: crashMultiplier,
        totalBets: currentGame.totalBets,
        totalPlayers: currentGame.totalPlayers,
        tradingState: {
            trend: tradingState.trend,
            rugPullTriggered: true
        }
    });

    gameHistory.push({ ...currentGame });
    if (gameHistory.length > 100) {
        gameHistory = gameHistory.slice(-100);
    }

    updateLeaderboard().catch((err: any) => console.warn('Leaderboard update failed:', err.message));

    currentGame = null;
    await startWaitingPeriod();
}

// Enhanced waiting period with countdown and pre-game betting
async function startWaitingPeriod(): Promise<void> {
    console.log('Starting 10-second waiting period with pre-game betting...');
    
    if (gameCountdown) {
        clearInterval(gameCountdown);
    }

    const waitingGameNumber = gameHistory.length + 1;
    currentGame = {
        id: `waiting-${waitingGameNumber}`,
        gameNumber: waitingGameNumber,
        startTime: Date.now() + 10000,
        currentMultiplier: 1.0,
        maxMultiplier: 0,
        status: 'waiting',
        totalBets: 0,
        totalPlayers: 0,
        chartData: [],
        activeBets: new Map(),
        seed: generateProvablyFairSeed()
    };

    countdownTimeRemaining = 10;

    io.emit('gameWaiting', {
        gameId: currentGame.id,
        gameNumber: currentGame.gameNumber,
        message: 'Next trader game starting soon - Place your bets!',
        countdown: countdownTimeRemaining * 1000,
        serverTime: Date.now(),
        canBet: true
    });

    io.emit('gameState', {
        gameId: currentGame.id,
        gameNumber: currentGame.gameNumber,
        multiplier: 1.0,
        status: 'waiting',
        totalBets: 0,
        totalPlayers: 0,
        startTime: currentGame.startTime,
        serverTime: Date.now(),
        countdown: countdownTimeRemaining * 1000,
        canBet: true
    });

    gameCountdown = setInterval(() => {
        countdownTimeRemaining -= 1;

        io.emit('countdownUpdate', {
            gameId: currentGame?.id,
            countdown: countdownTimeRemaining * 1000,
            timeRemaining: countdownTimeRemaining,
            serverTime: Date.now(),
            canBet: countdownTimeRemaining > 2
        });

        if (currentGame) {
            io.emit('waitingGameUpdate', {
                gameId: currentGame.id,
                totalBets: currentGame.totalBets,
                totalPlayers: currentGame.totalPlayers,
                countdown: countdownTimeRemaining * 1000
            });
        }

        if (countdownTimeRemaining <= 0) {
            clearInterval(gameCountdown!);
            gameCountdown = null;
            console.log('Countdown finished, starting trader game...');
            startNewGame();
        }
    }, 1000);
}

// Enhanced placeBet with dynamic rug pull triggers
async function placeBet(walletAddress: string, betAmount: number, userId?: string): Promise<{ success: boolean; reason?: string; entryMultiplier?: number }> {
    // Allow betting during any game phase (waiting or active)
    if (!currentGame || (currentGame.status !== 'active' && currentGame.status !== 'waiting')) {
        return { success: false, reason: 'Game not available' };
    }

    if (currentGame.status === 'waiting' && countdownTimeRemaining <= 2) {
        return { success: false, reason: 'Too late to Buy - game starting soon' };
    }

    if (betAmount < GAME_CONFIG.MIN_BET || betAmount > GAME_CONFIG.MAX_BET) {
        return { success: false, reason: 'Invalid bet amount' };
    }

    if (currentGame.activeBets.has(walletAddress)) {
        return { success: false, reason: 'Already has active bet' };
    }

    // Set entry multiplier (1.0 for waiting, current for active)
    const entryMultiplier = currentGame.status === 'waiting' ? 1.0 : currentGame.currentMultiplier;
    
    // NO MAX_ENTRY_MULTIPLIER restriction - users can bet anytime but risk rug pull

    try {
        const bet: PlayerBet = {
            userId: userId || '',
            walletAddress,
            betAmount,
            placedAt: Date.now(),
            entryMultiplier,
            maxPayout: betAmount * BET_VALIDATION.MAX_PAYOUT_MULTIPLIER,
            isValid: true
        };

        currentGame.activeBets.set(walletAddress, bet);
        currentGame.totalBets += betAmount;
        currentGame.totalPlayers = currentGame.activeBets.size;

        // Update trading state based on bet
        tradingState.totalBetsSinceStart += betAmount;
        
        if (betAmount >= GAME_CONFIG.HIGH_BET_THRESHOLD) {
            tradingState.highBetCount++;
            console.log(`🚨 HIGH BET DETECTED: ${betAmount} SOL - Rug risk increased!`);
            
            // Increase volatility and rug pull chance
            tradingState.volatility *= 1.5;
            tradingState.rugPullProbability = Math.min(0.02, tradingState.rugPullProbability * 2);
        }

        const statusText = currentGame.status === 'waiting' ? 'pre-game' : 'in-game';
        console.log(`${statusText} bet placed: ${betAmount} SOL by ${walletAddress} at ${entryMultiplier.toFixed(2)}x`);

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
                        bet_type: currentGame.status
                    });
            }
        } catch (dbError) {
            console.warn('Bet save failed:', dbError);
        }

        io.emit('betPlaced', {
            gameId: currentGame.id,
            walletAddress,
            betAmount,
            entryMultiplier,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            gameStatus: currentGame.status,
            rugRisk: betAmount >= GAME_CONFIG.HIGH_BET_THRESHOLD ? 'HIGH' : 'LOW',
            countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
        });

        return { success: true, entryMultiplier };

    } catch (error) {
        console.error('Error placing bet:', error);
        return { success: false, reason: 'Server error' };
    }
}

// Enhanced cashOut with 40% house edge
async function cashOut(walletAddress: string): Promise<{ success: boolean; payout?: number; reason?: string }> {
    if (!currentGame || currentGame.status !== 'active') {
        return { success: false, reason: 'Game not active' };
    }

    const bet = currentGame.activeBets.get(walletAddress);
    if (!bet || bet.cashedOut || !bet.isValid) {
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
        const cashoutMultiplier = currentGame.currentMultiplier;
        const effectiveMultiplier = Math.max(cashoutMultiplier, bet.entryMultiplier);
        const rawPayout = bet.betAmount * effectiveMultiplier;
        
        // Apply 40% house edge
        const finalPayout = rawPayout * (1 - BET_VALIDATION.HOUSE_EDGE);
        const profit = finalPayout - bet.betAmount;

        bet.cashedOut = true;
        bet.cashoutMultiplier = effectiveMultiplier;
        bet.cashoutAmount = finalPayout;
        bet.cashoutTime = Date.now();

        console.log(`💰 Cashout: ${walletAddress} - Entry: ${bet.entryMultiplier.toFixed(2)}x, Exit: ${cashoutMultiplier.toFixed(2)}x, Effective: ${effectiveMultiplier.toFixed(2)}x, Payout: ${finalPayout.toFixed(3)} SOL (40% house edge applied)`);

        try {
            if (!currentGame.id.startsWith('memory-')) {
                await supabaseService
                    .from('player_bets')
                    .update({
                        cashout_multiplier: effectiveMultiplier,
                        cashout_amount: finalPayout,
                        profit_loss: profit,
                        status: 'cashed_out',
                        cashed_out_at: new Date().toISOString()
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
            effectiveMultiplier,
            amount: finalPayout,
            profit,
            houseEdge: BET_VALIDATION.HOUSE_EDGE
        });

        return { success: true, payout: finalPayout };

    } catch (error) {
        console.error('Error cashing out:', error);
        return { success: false, reason: 'Server error' };
    }
}

async function processBetLoss(bet: PlayerBet): Promise<void> {
    try {
        if (!currentGame?.id.startsWith('memory-')) {
            await supabaseService
                .from('player_bets')
                .update({
                    profit_loss: -bet.betAmount,
                    status: 'lost'
                })
                .eq('game_id', currentGame?.id)
                .eq('wallet_address', bet.walletAddress);
        }
    } catch (error) {
        console.warn('Error processing bet loss:', error);
    }
}

async function saveChartData(chartPoint: ChartPoint): Promise<void> {
    if (!currentGame || currentGame.id.startsWith('memory-')) return;

    try {
        await supabaseService
            .from('chart_data')
            .insert({
                game_id: currentGame.id,
                timestamp: new Date(chartPoint.timestamp).toISOString(),
                open_price: chartPoint.open,
                high_price: chartPoint.high,
                low_price: chartPoint.low,
                close_price: chartPoint.close,
                volume: chartPoint.volume
            });
    } catch (error) {
        console.warn('Error saving chart data:', error);
    }
}

async function updateLeaderboard(): Promise<void> {
    try {
        const today = new Date().toISOString().split('T')[0];

        const { data: dailyStats } = await supabaseService
            .from('player_bets')
            .select(`
                wallet_address,
                user_id,
                bet_amount,
                profit_loss,
                cashout_multiplier,
                users!inner (username, avatar, level, badge)
            `)
            .gte('created_at', today)
            .not('profit_loss', 'is', null) as { data: BetWithUser[] | null };

        if (dailyStats) {
            const leaderboardMap = new Map<string, LeaderboardEntry>();

            for (const bet of dailyStats) {
                const key = bet.wallet_address;
                const userData = bet.users;

                const existing = leaderboardMap.get(key) || {
                    userId: bet.user_id,
                    walletAddress: bet.wallet_address,
                    username: userData?.username || 'Anonymous',
                    totalProfit: 0,
                    profitPercentage: 0,
                    gamesPlayed: 0,
                    bestMultiplier: 0,
                    winRate: 0
                };

                existing.totalProfit += bet.profit_loss || 0;
                existing.gamesPlayed += 1;
                existing.bestMultiplier = Math.max(existing.bestMultiplier, bet.cashout_multiplier || 0);

                leaderboardMap.set(key, existing);
            }

            const leaderboard = Array.from(leaderboardMap.values())
                .sort((a, b) => b.totalProfit - a.totalProfit)
                .map((entry, index) => ({ ...entry, rank: index + 1 }));

            for (const entry of leaderboard) {
                await supabaseService
                    .from('leaderboard')
                    .upsert({
                        user_id: entry.userId,
                        wallet_address: entry.walletAddress,
                        username: entry.username,
                        period: 'daily',
                        period_start: today,
                        period_end: today,
                        total_profit: entry.totalProfit,
                        games_played: entry.gamesPlayed,
                        best_multiplier: entry.bestMultiplier,
                        rank: entry.rank
                    });
            }

            io.emit('leaderboardUpdate', leaderboard.slice(0, 50));
        }

    } catch (error) {
        console.warn('Error updating leaderboard:', error);
    }
}

// Enhanced Socket.io event handlers
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
            tradingState: {
                trend: tradingState.trend,
                momentum: tradingState.momentum,
                rugPullRisk: tradingState.rugPullProbability
            }
        });

        if (currentGame.status === 'active') {
            socket.emit('multiplierUpdate', {
                gameId: currentGame.id,
                gameNumber: currentGame.gameNumber,
                multiplier: currentGame.currentMultiplier,
                timestamp: currentServerTime,
                serverTime: currentServerTime,
                progress: (currentServerTime - currentGame.startTime) / generateGameDuration(currentGame.maxMultiplier),
                trend: tradingState.trend,
                rugPullRisk: tradingState.rugPullProbability
            });
        }
    }

    socket.emit('gameHistory', gameHistory.slice(-10));

    socket.on('requestGameSync', () => {
        if (currentGame) {
            socket.emit('gameSync', {
                gameId: currentGame.id,
                gameNumber: currentGame.gameNumber,
                multiplier: currentGame.currentMultiplier,
                serverTime: Date.now(),
                status: currentGame.status,
                countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined,
                canBet: currentGame.status === 'waiting' || currentGame.status === 'active',
                tradingState: {
                    trend: tradingState.trend,
                    rugPullRisk: tradingState.rugPullProbability
                }
            });
        }
    });

    socket.on('placeBet', async (data: PlaceBetData) => {
        const { walletAddress, betAmount, userId } = data;
        const result = await placeBet(walletAddress, betAmount, userId);
        
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
                countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined
            } : null
        });
    });
    
    socket.on('cashOut', async (data: CashOutData) => {
        const { walletAddress } = data;
        const result = await cashOut(walletAddress);
        
        socket.emit('cashOutResult', { 
            success: result.success,
            reason: result.reason,
            payout: result.payout,
            walletAddress 
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Periodic sync broadcast
setInterval(() => {
    if (currentGame && currentGame.status === 'active') {
        io.emit('serverSync', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            serverTime: Date.now(),
            status: currentGame.status,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            tradingState: {
                trend: tradingState.trend,
                rugPullRisk: tradingState.rugPullProbability
            }
        });
    }
}, 5000);

// REST API endpoints
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: Date.now(),
        serverTime: new Date().toISOString(),
        currentGame: currentGame ? {
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            status: currentGame.status,
            startTime: currentGame.startTime,
            totalPlayers: currentGame.totalPlayers,
            countdown: currentGame.status === 'waiting' ? countdownTimeRemaining * 1000 : undefined,
            tradingState: {
                trend: tradingState.trend,
                rugPullRisk: tradingState.rugPullProbability
            }
        } : null,
        mode: currentGame?.id.startsWith('memory-') ? 'memory' : 'database',
        uptime: process.uptime()
    });
});

app.get('/api/game/current', (req, res) => {
    res.json(currentGame);
});

app.get('/api/game/history', (req, res) => {
    res.json(gameHistory.slice(-50));
});

app.get('/api/leaderboard/:period', async (req, res) => {
    try {
        const { period } = req.params;
        const { data, error } = await supabaseService
            .from('current_leaderboard')
            .select('*')
            .eq('period', period)
            .order('rank', { ascending: true })
            .limit(100);

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

app.get('/api/chart/:gameId', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { data, error } = await supabaseService
            .from('chart_data')
            .select('*')
            .eq('game_id', gameId)
            .order('timestamp', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io/")) {
        return next();
    }
    res.setHeader("Content-Type", "text/html");
    res.send("<!DOCTYPE html><html><head><title>Rugged Run It - Trader Style</title></head><body><h1>🎮 Rugged Run It - Trader Style</h1><p>Trader-style game server is running successfully!</p><a href=\"/api/health\">API Health Check</a></body></html>");
});

// Start server with waiting period
server.listen(PORT, () => {
    console.log(`🎮 Trader-style game server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`🚨 High bet threshold: ${GAME_CONFIG.HIGH_BET_THRESHOLD} SOL`);
    console.log(`💥 Instant rug threshold: ${GAME_CONFIG.INSTANT_RUG_THRESHOLD} SOL`);
    console.log(`🏛️ House edge: ${GAME_CONFIG.HOUSE_EDGE * 100}%`);
    startWaitingPeriod();
});