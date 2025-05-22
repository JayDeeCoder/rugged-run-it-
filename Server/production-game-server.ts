// production-game-server.ts
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
const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS!;

// Initialize services
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

// Socket event interfaces
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

// Game configuration
const GAME_CONFIG = {
    MIN_GAME_DURATION: 5000, // 5 seconds
    MAX_GAME_DURATION: 180000, // 3 minutes
    HOUSE_EDGE: 0.05, // 5%
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

// Game logic
async function startNewGame(): Promise<void> {
    try {
        const seed = generateProvablyFairSeed();
        const gameNumber = gameHistory.length + 1;
        const crashPoint = calculateCrashPoint(seed, gameNumber);
        const duration = generateGameDuration(crashPoint);

        // Save game to database
        const { data: gameData, error } = await supabase
            .from('games')
            .insert({
                game_number: gameNumber,
                crash_multiplier: crashPoint,
                seed: seed,
                status: 'active'
            })
            .select()
            .single();

        if (error) throw error;

        currentGame = {
            id: gameData.id,
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

        console.log(`Game ${gameNumber} started - Crash point: ${crashPoint}x`);
        
        // Broadcast game start
        io.emit('gameStarted', {
            gameId: currentGame.id,
            gameNumber,
            startTime: currentGame.startTime
        });

        // Start game loop
        runGameLoop(duration);

    } catch (error) {
        console.error('Error starting new game:', error);
    }
}

async function runGameLoop(duration: number): Promise<void> {
    if (!currentGame) return;

    const startTime = Date.now();
    const endTime = startTime + duration;
    let lastUpdate = startTime;

    const gameLoop = setInterval(() => {
        if (!currentGame || currentGame.status !== 'active') {
            clearInterval(gameLoop);
            return;
        }

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = elapsed / duration;

        if (now >= endTime || progress >= 1) {
            // Game crashed
            crashGame();
            clearInterval(gameLoop);
            return;
        }

        // Calculate current multiplier based on progress
        const multiplier = 1.0 + (currentGame.maxMultiplier - 1.0) * Math.pow(progress, 0.5);
        currentGame.currentMultiplier = Math.floor(multiplier * 100) / 100;

        // Generate chart data every second
        if (now - lastUpdate >= 1000) {
            const chartPoint: ChartPoint = {
                timestamp: now,
                open: currentGame.chartData.length > 0 ? currentGame.chartData[currentGame.chartData.length - 1].close : 1.0,
                high: currentGame.currentMultiplier * (1 + Math.random() * 0.01),
                low: currentGame.currentMultiplier * (1 - Math.random() * 0.01),
                close: currentGame.currentMultiplier,
                volume: currentGame.totalBets
            };
            
            currentGame.chartData.push(chartPoint);
            lastUpdate = now;

            // Save chart data to database
            saveChartData(chartPoint);
        }

        // Broadcast multiplier update
        io.emit('multiplierUpdate', {
            gameId: currentGame.id,
            multiplier: currentGame.currentMultiplier,
            timestamp: now
        });

    }, GAME_CONFIG.UPDATE_INTERVAL);
}

async function crashGame(): Promise<void> {
    if (!currentGame) return;

    currentGame.status = 'crashed';
    const crashMultiplier = currentGame.currentMultiplier;

    console.log(`Game ${currentGame.gameNumber} crashed at ${crashMultiplier}x`);

    // Process all active bets
    for (const [walletAddress, bet] of currentGame.activeBets) {
        if (!bet.cashedOut) {
            // Player lost
            await processBetLoss(bet);
        }
    }

    // Update game in database
    await supabase
        .from('games')
        .update({
            end_time: new Date().toISOString(),
            crash_multiplier: crashMultiplier,
            max_multiplier: currentGame.maxMultiplier,
            status: 'crashed',
            total_bets_amount: currentGame.totalBets,
            total_players: currentGame.totalPlayers
        })
        .eq('id', currentGame.id);

    // Broadcast crash
    io.emit('gameCrashed', {
        gameId: currentGame.id,
        crashMultiplier,
        timestamp: Date.now()
    });

    // Add to history
    gameHistory.push({ ...currentGame });
    if (gameHistory.length > 100) {
        gameHistory = gameHistory.slice(-100); // Keep last 100 games
    }

    // Update leaderboard
    await updateLeaderboard();

    currentGame = null;

    // Start next game after 5 seconds
    setTimeout(startNewGame, 5000);
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
        // Verify transaction on Solana (in production)
        // const verified = await verifyTransaction(transactionHash, walletAddress, betAmount);
        // if (!verified) return false;

        const bet: PlayerBet = {
            userId: userId || '',
            walletAddress,
            betAmount,
            placedAt: Date.now()
        };

        currentGame.activeBets.set(walletAddress, bet);
        currentGame.totalBets += betAmount;
        currentGame.totalPlayers += 1;

        // Save bet to database
        await supabase
            .from('player_bets')
            .insert({
                game_id: currentGame.id,
                user_id: userId,
                wallet_address: walletAddress,
                bet_amount: betAmount,
                status: 'active'
            });

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

        // Update bet in database
        await supabase
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

        // In production: Send SOL to player wallet
        // await sendSolToPlayer(walletAddress, playerAmount);

        // Broadcast cashout
        io.emit('playerCashedOut', {
            gameId: currentGame.id,
            walletAddress,
            multiplier: cashoutMultiplier,
            amount: playerAmount,
            profit: profit
        });

        return true;

    } catch (error) {
        console.error('Error cashing out:', error);
        return false;
    }
}

async function processBetLoss(bet: PlayerBet): Promise<void> {
    try {
        await supabase
            .from('player_bets')
            .update({
                profit_loss: -bet.betAmount,
                status: 'lost'
            })
            .eq('game_id', currentGame?.id)
            .eq('wallet_address', bet.walletAddress);
    } catch (error) {
        console.error('Error processing bet loss:', error);
    }
}

async function saveChartData(chartPoint: ChartPoint): Promise<void> {
    if (!currentGame) return;

    try {
        await supabase
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
        console.error('Error saving chart data:', error);
    }
}

async function updateLeaderboard(): Promise<void> {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Calculate daily leaderboard
        const { data: dailyStats } = await supabase
            .from('player_bets')
            .select(`
                wallet_address,
                user_id,
                bet_amount,
                profit_loss,
                cashout_multiplier,
                users:user_id (username, avatar, level, badge)
            `)
            .gte('created_at', today)
            .not('profit_loss', 'is', null);

        if (dailyStats) {
            const leaderboardMap = new Map<string, LeaderboardEntry>();

            for (const bet of dailyStats) {
                const key = bet.wallet_address;
                const existing = leaderboardMap.get(key) || {
                    userId: bet.user_id,
                    walletAddress: bet.wallet_address,
                    username: bet.users?.username || 'Anonymous',
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

            // Convert to array and sort by profit percentage
            const leaderboard = Array.from(leaderboardMap.values())
                .sort((a, b) => b.totalProfit - a.totalProfit)
                .map((entry, index) => ({ ...entry, rank: index + 1 }));

            // Save to database
            for (const entry of leaderboard) {
                await supabase
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

            // Broadcast updated leaderboard
            io.emit('leaderboardUpdate', leaderboard.slice(0, 50)); // Top 50
        }

    } catch (error) {
        console.error('Error updating leaderboard:', error);
    }
}

// Socket.io event handlers
io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Send current game state
    if (currentGame) {
        socket.emit('gameState', {
            gameId: currentGame.id,
            gameNumber: currentGame.gameNumber,
            multiplier: currentGame.currentMultiplier,
            status: currentGame.status,
            totalBets: currentGame.totalBets,
            totalPlayers: currentGame.totalPlayers,
            startTime: currentGame.startTime
        });
    }

    // Send recent games
    socket.emit('gameHistory', gameHistory.slice(-10));

    socket.on('placeBet', async (data: PlaceBetData) => {
        const { walletAddress, betAmount, userId } = data;
        const success = await placeBet(walletAddress, betAmount, userId);
        socket.emit('betResult', { success, walletAddress, betAmount });
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

// REST API endpoints
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
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
        const { data, error } = await supabase
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
        const { data, error } = await supabase
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

// Start server
server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
    startNewGame(); // Start first game
});

export { io, supabase, currentGame };