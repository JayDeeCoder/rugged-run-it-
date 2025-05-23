// production-game-server.ts - Updated with synchronization fixes
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
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
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
    cashedOut?: boolean;
    cashoutMultiplier?: number;
    cashoutAmount?: number;
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

// Game state
let currentGame: GameState | null = null;
let gameHistory: GameState[] = [];
let gameStartLock = false; // FIX: Prevent multiple games from starting

// Game configuration
const GAME_CONFIG = {
    MIN_GAME_DURATION: 5000, // 5 seconds
    MAX_GAME_DURATION: 180000, // 3 minutes
    HOUSE_EDGE: 0.20, // 20%
    UPDATE_INTERVAL: 100, // 100ms updates
    MIN_BET: 0.001,
    MAX_BET: 10.0,
    MAX_MULTIPLIER: 100.0
};

// Utility functions
function generateProvablyFairSeed(): string {
    return crypto.randomBytes(32).toString('hex');
}

function calculateCrashPoint(seed: string, gameNumber: number): number {
    // Provably fair crash point calculation
    const hash = crypto.createHash('sha256').update(seed + gameNumber).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const crashPoint = Math.max(1.0, (hashInt / 0xFFFFFFFF) * GAME_CONFIG.MAX_MULTIPLIER);
    return Math.floor(crashPoint * 100) / 100; // Round to 2 decimal places
}

function generateGameDuration(crashPoint: number): number {
    const baseTime = GAME_CONFIG.MIN_GAME_DURATION;
    const maxTime = GAME_CONFIG.MAX_GAME_DURATION;
    const factor = Math.min(crashPoint / 10, 1); // Normalize crash point
    return baseTime + (maxTime - baseTime) * factor;
}

// FIX: Enhanced game loop with better synchronization
async function runGameLoop(duration: number): Promise<void> {
    if (!currentGame) return;

    const startTime = Date.now();
    const endTime = startTime + duration;
    let lastUpdate = startTime;
    let lastChartUpdate = startTime;

    console.log(`Starting game loop for Game ${currentGame.gameNumber} - Duration: ${duration}ms`);

    const gameLoop = setInterval(() => {
        if (!currentGame || currentGame.status !== 'active') {
            clearInterval(gameLoop);
            return;
        }

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1); // Ensure progress never exceeds 1

        if (progress >= 1 || now >= endTime) {
            // Game crashed
            crashGame();
            clearInterval(gameLoop);
            return;
        }

        // FIX: More consistent multiplier calculation with Math.round
        const multiplier = 1.0 + (currentGame.maxMultiplier - 1.0) * Math.pow(progress, 0.5);
        currentGame.currentMultiplier = Math.round(multiplier * 100) / 100;

        // FIX: Enhanced broadcast with game number validation and server time
        io.emit('multiplierUpdate', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber, // Add for client validation
            multiplier: currentGame.currentMultiplier,
            timestamp: now,
            serverTime: now, // Add server timestamp for sync
            progress: progress // Add progress for client validation
        });

        // Generate chart data every second
        if (now - lastChartUpdate >= 1000) {
            const chartPoint: ChartPoint = {
                timestamp: now,
                open: currentGame.chartData.length > 0 ? currentGame.chartData[currentGame.chartData.length - 1].close : 1.0,
                high: currentGame.currentMultiplier * (1 + Math.random() * 0.01),
                low: currentGame.currentMultiplier * (1 - Math.random() * 0.01),
                close: currentGame.currentMultiplier,
                volume: currentGame.totalBets
            };

            currentGame.chartData.push(chartPoint);
            lastChartUpdate = now;

            // Save chart data to database (optional, don't crash if it fails)
            saveChartData(chartPoint).catch(err => console.warn('Chart data save failed:', err.message));
        }

    }, GAME_CONFIG.UPDATE_INTERVAL);
}

// FIX: Enhanced startNewGame with game start locks
async function startNewGame(): Promise<void> {
    // FIX: Prevent multiple games from starting simultaneously
    if (gameStartLock) {
        console.log('Game start already in progress, skipping...');
        return;
    }

    gameStartLock = true;

    try {
        // FIX: Check if there's already an active game in database
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

        // Save game to database with error handling
        let gameId = `memory-${gameNumber}`;
        try {
            const { data: gameData, error } = await supabaseService
                .from('games')
                .insert({
                    game_number: gameNumber,
                    seed: seed,
                    crash_multiplier: crashPoint,
                    status: 'active',
                    start_time: new Date().toISOString()
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
            totalBets: 0,
            totalPlayers: 0,
            crashMultiplier: crashPoint,
            seed,
            chartData: [],
            activeBets: new Map()
        };

        console.log(`Game ${gameNumber} started - Crash point: ${crashPoint}x at ${new Date().toISOString()}`);

        // FIX: Enhanced broadcast with comprehensive game start data
        io.emit('gameStarted', {
            gameId: currentGame.id,
            gameNumber,
            startTime: currentGame.startTime,
            serverTime: Date.now(), // Add server time for sync
            seed: currentGame.seed,
            maxMultiplier: crashPoint
        });

        // Start game loop
        runGameLoop(duration);

    } catch (error) {
        console.error('Error starting new game:', error);
        // Retry after 10 seconds instead of crashing the server
        setTimeout(() => {
            gameStartLock = false;
            startNewGame();
        }, 10000);
    } finally {
        gameStartLock = false;
    }
}

// FIX: Enhanced crashGame with better state management
async function crashGame(): Promise<void> {
    if (!currentGame) return;

    const crashTime = Date.now();
    currentGame.status = 'crashed';
    const crashMultiplier = currentGame.currentMultiplier;

    console.log(`Game ${currentGame.gameNumber} crashed at ${crashMultiplier}x at ${new Date(crashTime).toISOString()}`);

    // Process all active bets
    for (const [walletAddress, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            // Player lost
            await processBetLoss(bet).catch(err => console.warn('Bet loss processing failed:', err.message));
        }
    }

    // Update game in database (optional)
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

    // FIX: Enhanced crash broadcast with all necessary data
    io.emit('gameCrashed', {
        gameId: currentGame.id,
        gameNumber: currentGame.gameNumber,
        crashMultiplier,
        serverTime: crashTime,
        timestamp: crashTime,
        finalMultiplier: crashMultiplier,
        totalBets: currentGame.totalBets,
        totalPlayers: currentGame.totalPlayers
    });

    // Add to history
    gameHistory.push({ ...currentGame });
    if (gameHistory.length > 100) {
        gameHistory = gameHistory.slice(-100); // Keep last 100 games
    }

    // Update leaderboard (optional)
    updateLeaderboard().catch(err => console.warn('Leaderboard update failed:', err.message));

    currentGame = null;

    // FIX: Add waiting period broadcast
    io.emit('gameWaiting', {
        message: 'Next game starting in 5 seconds...',
        countdown: 5000,
        serverTime: Date.now()
    });

    // Start next game after 5 seconds
    setTimeout(() => {
        startNewGame();
    }, 5000);
}

async function placeBet(walletAddress: string, betAmount: number, userId?: string): Promise<boolean> {
    if (!currentGame || currentGame.status !== 'active') {
        return false;
    }

    if (betAmount < GAME_CONFIG.MIN_BET || betAmount > GAME_CONFIG.MAX_BET) {
        return false;
    }

    if (currentGame.activeBets.has(walletAddress)) {
        return false; // Already has active bet
    }

    try {
        const bet: PlayerBet = {
            userId: userId || '',
            walletAddress,
            betAmount,
            placedAt: Date.now()
        };

        currentGame.activeBets.set(walletAddress, bet);
        currentGame.totalBets += betAmount;
        currentGame.totalPlayers += 1;

        // Save bet to database (optional)
        try {
            if (!currentGame.id.startsWith('memory-')) {
                await supabaseService
                    .from('player_bets')
                    .insert({
                        game_id: currentGame.id,
                        user_id: userId,
                        wallet_address: walletAddress,
                        bet_amount: betAmount,
                        status: 'active'
                    });
            }
        } catch (dbError) {
            console.warn('Bet save failed:', dbError);
        }

        // Broadcast bet placed
        io.emit('betPlaced', {
            gameId: currentGame.id,
            walletAddress,
            betAmount,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers
        });

        return true;

    } catch (error) {
        console.error('Error placing bet:', error);
        return false;
    }
}

async function cashOut(walletAddress: string): Promise<boolean> {
    if (!currentGame || currentGame.status !== 'active') {
        return false;
    }

    const bet = currentGame.activeBets.get(walletAddress);
    if (!bet || bet.cashedOut) {
        return false;
    }

    try {
        const cashoutMultiplier = currentGame.currentMultiplier;
        const cashoutAmount = bet.betAmount * cashoutMultiplier;
        const profit = cashoutAmount - bet.betAmount;
        const houseAmount = profit * GAME_CONFIG.HOUSE_EDGE;
        const playerAmount = cashoutAmount - houseAmount;

        bet.cashedOut = true;
        bet.cashoutMultiplier = cashoutMultiplier;
        bet.cashoutAmount = playerAmount;

        // Update bet in database (optional)
        try {
            if (!currentGame.id.startsWith('memory-')) {
                await supabaseService
                    .from('player_bets')
                    .update({
                        cashout_multiplier: cashoutMultiplier,
                        cashout_amount: playerAmount,
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

        // Broadcast cashout
        io.emit('playerCashedOut', {
            gameId: currentGame.id,
            walletAddress,
            multiplier: cashoutMultiplier,
            amount: playerAmount
        });

        return true;

    } catch (error) {
        console.error('Error cashing out:', error);
        return false;
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

// FIX: Enhanced Socket.io event handlers with complete synchronization
io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // FIX: Send complete current game state immediately on connection
    if (currentGame && currentGame.status === 'active') {
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
            serverTime: currentServerTime, // Current server time for sync
            chartData: currentGame.chartData.slice(-60), // Last 60 data points
            seed: currentGame.seed // For client verification
        });

        // FIX: Send immediate multiplier update for new clients
        socket.emit('multiplierUpdate', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            timestamp: currentServerTime,
            serverTime: currentServerTime,
            progress: (currentServerTime - currentGame.startTime) / generateGameDuration(currentGame.maxMultiplier)
        });
    }

    // Send game history
    socket.emit('gameHistory', gameHistory.slice(-10));

    // FIX: Add game sync validation
    socket.on('requestGameSync', () => {
        if (currentGame) {
            socket.emit('gameSync', {
                gameId: currentGame.id,
                gameNumber: currentGame.gameNumber,
                multiplier: currentGame.currentMultiplier,
                serverTime: Date.now(),
                status: currentGame.status
            });
        }
    });

    socket.on('placeBet', async (data: PlaceBetData) => {
        const { walletAddress, betAmount, userId } = data;
        const success = await placeBet(walletAddress, betAmount, userId);
        
        // FIX: Send updated game state after bet placement
        socket.emit('betResult', { 
            success, 
            walletAddress, 
            betAmount,
            gameState: currentGame ? {
                totalBets: currentGame.totalBets,
                totalPlayers: currentGame.totalPlayers
            } : null
        });
    });

    socket.on('cashOut', async (data: CashOutData) => {
        const { walletAddress } = data;
        const success = await cashOut(walletAddress);
        socket.emit('cashOutResult', { success, walletAddress });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// FIX: Add periodic sync broadcast to catch any drift
setInterval(() => {
    if (currentGame && currentGame.status === 'active') {
        io.emit('serverSync', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            serverTime: Date.now(),
            status: currentGame.status,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers
        });
    }
}, 5000); // Every 5 seconds

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
            totalPlayers: currentGame.totalPlayers
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

// Serve simple HTML for frontend routes
app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io/")) {
        return next();
    }
    res.setHeader("Content-Type", "text/html");
    res.send("<!DOCTYPE html><html><head><title>Rugged Run It</title></head><body><h1>🎮 Rugged Run It</h1><p>Game server is running successfully!</p><a href=\"/api/health\">API Health Check</a></body></html>");
});

// Start server
server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    startNewGame(); // Start first game
});

export { io, supabase, currentGame };