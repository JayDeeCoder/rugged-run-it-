// Enhanced useGameSocket hook with pre-game betting and countdown support

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Enhanced GameState interface
interface GameState {
    id: string;
    gameNumber: number;
    multiplier: number;
    status: 'waiting' | 'active' | 'crashed';
    totalBets: number;
    totalPlayers: number;
    startTime: number;
    maxMultiplier?: number;
    serverTime?: number;
    countdown?: number;        // NEW: Countdown in milliseconds for waiting period
    canBet?: boolean;         // NEW: Whether betting is currently allowed
    preGameBets?: number;     // NEW: Pre-game bet totals
    preGamePlayers?: number;  // NEW: Pre-game player count
}

// NEW: Enhanced bet result interface
interface BetResult {
    success: boolean;
    reason?: string;
    walletAddress: string;
    betAmount: number;
    entryMultiplier?: number;
    gameState?: {
        totalBets: number;
        totalPlayers: number;
        status: 'waiting' | 'active' | 'crashed';
        countdown?: number;
    };
}

// NEW: Enhanced cashout result interface
interface CashOutResult {
    success: boolean;
    reason?: string;
    payout?: number;
    walletAddress: string;
}

export function useGameSocket(walletAddress: string, userId?: string) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [currentGame, setCurrentGame] = useState<GameState | null>(null);
    const [gameHistory, setGameHistory] = useState<GameState[]>([]);
    
    // NEW: Countdown and waiting period state
    const [countdown, setCountdown] = useState<number>(0);
    const [isWaitingPeriod, setIsWaitingPeriod] = useState<boolean>(false);
    const [canBet, setCanBet] = useState<boolean>(false);
    
    // Existing sync state
    const [serverTimeOffset, setServerTimeOffset] = useState(0);
    const gameStateRef = useRef<GameState | null>(null);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<number>(0); // NEW: Track countdown for validation

    // Calculate server time offset for synchronization
    const syncServerTime = useCallback((serverTime: number) => {
        const clientTime = Date.now();
        const newOffset = serverTime - clientTime;
        setServerTimeOffset(newOffset);
    }, []);

    // Get synchronized server time
    const getServerTime = useCallback(() => {
        return Date.now() + serverTimeOffset;
    }, [serverTimeOffset]);

    // NEW: Update countdown and betting availability
    const updateCountdownState = useCallback((countdownMs: number, gameStatus: string) => {
        setCountdown(countdownMs);
        countdownRef.current = countdownMs;
        setIsWaitingPeriod(gameStatus === 'waiting');
        
        // Allow betting during waiting period (but not in last 2 seconds) or during active game
        const canBetNow = (gameStatus === 'waiting' && countdownMs > 2000) || gameStatus === 'active';
        setCanBet(canBetNow);
    }, []);

    // Enhanced connection with automatic reconnection
    useEffect(() => {
        const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'wss://cb85-3-16-49-236.ngrok-free.app';
        console.log('🔍 Connecting to enhanced game server:', serverUrl);
        
        const newSocket = io(serverUrl, {
            transports: ['websocket'],
            timeout: 10000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        // Enhanced connection handler
        newSocket.on('connect', () => {
            console.log('Connected to enhanced game server');
            setIsConnected(true);
            newSocket.emit('requestGameSync');
        });

        // Enhanced game state handler with countdown support
        newSocket.on('gameState', (gameState: any) => {
            console.log('Received enhanced game state:', gameState);
            
            if (gameState.serverTime) {
                syncServerTime(gameState.serverTime);
            }
            
            const newGameState: GameState = {
                id: gameState.gameId || gameState.id || '',
                gameNumber: gameState.gameNumber || 0,
                multiplier: gameState.multiplier || 1.0,
                status: gameState.status || 'waiting',
                totalBets: gameState.totalBets || 0,
                totalPlayers: gameState.totalPlayers || 0,
                startTime: gameState.startTime || Date.now(),
                maxMultiplier: gameState.maxMultiplier,
                serverTime: gameState.serverTime,
                countdown: gameState.countdown,
                canBet: gameState.canBet,
                preGameBets: gameState.preGameBets,
                preGamePlayers: gameState.preGamePlayers
            };
            
            // Update countdown state
            if (gameState.countdown !== undefined) {
                updateCountdownState(gameState.countdown, gameState.status);
            }
            
            setCurrentGame(newGameState);
            gameStateRef.current = newGameState;
        });

        // NEW: Handle waiting period start
        newSocket.on('gameWaiting', (data: any) => {
            console.log('Game waiting period started:', data);
            
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            updateCountdownState(data.countdown || 10000, 'waiting');
            
            // Update game state for waiting period
            if (gameStateRef.current) {
                const waitingGame: GameState = {
                    ...gameStateRef.current,
                    id: data.gameId || gameStateRef.current.id,
                    gameNumber: data.gameNumber || gameStateRef.current.gameNumber,
                    status: 'waiting',
                    multiplier: 1.0,
                    countdown: data.countdown,
                    canBet: data.canBet,
                    serverTime: data.serverTime
                };
                
                setCurrentGame(waitingGame);
                gameStateRef.current = waitingGame;
            }
        });

        // NEW: Handle countdown updates
        newSocket.on('countdownUpdate', (data: any) => {
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            updateCountdownState(data.countdown, 'waiting');
            
            // Update current game with countdown
            if (gameStateRef.current && gameStateRef.current.status === 'waiting') {
                const updatedGame: GameState = {
                    ...gameStateRef.current,
                    countdown: data.countdown,
                    canBet: data.canBet,
                    serverTime: data.serverTime
                };
                
                setCurrentGame(updatedGame);
                gameStateRef.current = updatedGame;
            }
        });

        // NEW: Handle waiting period bet updates
        newSocket.on('waitingGameUpdate', (data: any) => {
            if (gameStateRef.current && gameStateRef.current.status === 'waiting') {
                const updatedGame: GameState = {
                    ...gameStateRef.current,
                    totalBets: data.totalBets || gameStateRef.current.totalBets,
                    totalPlayers: data.totalPlayers || gameStateRef.current.totalPlayers,
                    countdown: data.countdown || gameStateRef.current.countdown
                };
                
                setCurrentGame(updatedGame);
                gameStateRef.current = updatedGame;
            }
        });

        // Enhanced multiplier update handler
        newSocket.on('multiplierUpdate', (data: any) => {
            if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
                if (data.serverTime) {
                    syncServerTime(data.serverTime);
                }
                
                const updatedGame: GameState = {
                    ...gameStateRef.current,
                    multiplier: data.multiplier || gameStateRef.current.multiplier,
                    serverTime: data.serverTime
                };
                
                setCurrentGame(updatedGame);
                gameStateRef.current = updatedGame;
            } else {
                console.warn('Received multiplier update for different game, requesting sync...');
                newSocket.emit('requestGameSync');
            }
        });

        // Enhanced game started handler
        newSocket.on('gameStarted', (data: any) => {
            console.log('Enhanced game started with pre-game bets:', data);
            
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            // Reset countdown state when game starts
            setCountdown(0);
            setIsWaitingPeriod(false);
            setCanBet(true);
            
            const newGameState: GameState = {
                id: data.gameId || '',
                gameNumber: data.gameNumber || 0,
                multiplier: 1.0,
                status: 'active',
                totalBets: data.totalBets || data.preGameBets || 0,
                totalPlayers: data.totalPlayers || data.preGamePlayers || 0,
                startTime: data.startTime || Date.now(),
                maxMultiplier: data.maxMultiplier,
                serverTime: data.serverTime,
                preGameBets: data.preGameBets,
                preGamePlayers: data.preGamePlayers,
                canBet: true
            };
            
            setCurrentGame(newGameState);
            gameStateRef.current = newGameState;
        });

        // Enhanced game crashed handler
        newSocket.on('gameCrashed', (data: any) => {
            console.log('Game crashed:', data);
            
            // Reset countdown and betting state
            setCountdown(0);
            setIsWaitingPeriod(false);
            setCanBet(false);
            
            if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
                const crashedGame: GameState = {
                    ...gameStateRef.current,
                    status: 'crashed',
                    multiplier: data.crashMultiplier || data.finalMultiplier || gameStateRef.current.multiplier,
                    canBet: false
                };
                
                setCurrentGame(crashedGame);
                gameStateRef.current = null; // Clear current game
                
                setGameHistory(prev => [...prev.slice(-49), crashedGame]);
            }
        });

        // Enhanced server sync handler
        newSocket.on('serverSync', (data: any) => {
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
                const syncedGame: GameState = {
                    ...gameStateRef.current,
                    multiplier: data.multiplier || gameStateRef.current.multiplier,
                    totalBets: data.totalBets || gameStateRef.current.totalBets,
                    totalPlayers: data.totalPlayers || gameStateRef.current.totalPlayers,
                    serverTime: data.serverTime
                };
                
                setCurrentGame(syncedGame);
                gameStateRef.current = syncedGame;
            } else if (data.gameNumber) {
                console.log('Game out of sync, requesting fresh state...');
                newSocket.emit('requestGameSync');
            }
        });

        // Handle game sync responses
        newSocket.on('gameSync', (data: any) => {
            console.log('Received game sync:', data);
            
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            if (data.status) {
                const syncedGame: GameState = {
                    id: data.gameId || '',
                    gameNumber: data.gameNumber || 0,
                    multiplier: data.multiplier || 1.0,
                    status: data.status,
                    totalBets: data.totalBets || 0,
                    totalPlayers: data.totalPlayers || 0,
                    startTime: data.startTime || 0,
                    serverTime: data.serverTime,
                    countdown: data.countdown,
                    canBet: data.canBet
                };
                
                // Update countdown state if in waiting period
                if (data.status === 'waiting' && data.countdown !== undefined) {
                    updateCountdownState(data.countdown, 'waiting');
                }
                
                setCurrentGame(syncedGame);
                gameStateRef.current = syncedGame;
            }
        });

        // Handle game history
        newSocket.on('gameHistory', (history: any[]) => {
            const mappedHistory: GameState[] = history.map(game => ({
                id: game.id || '',
                gameNumber: game.gameNumber || 0,
                multiplier: game.currentMultiplier || game.multiplier || 1.0,
                status: game.status || 'crashed',
                totalBets: game.totalBets || 0,
                totalPlayers: game.totalPlayers || 0,
                startTime: game.startTime || 0,
                maxMultiplier: game.maxMultiplier,
                serverTime: game.serverTime
            }));
            setGameHistory(mappedHistory);
        });

        // Enhanced bet placed handler
        newSocket.on('betPlaced', (data: any) => {
            if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
                const updatedGame: GameState = {
                    ...gameStateRef.current,
                    totalBets: data.totalBets || gameStateRef.current.totalBets,
                    totalPlayers: data.totalPlayers || gameStateRef.current.totalPlayers,
                    countdown: data.countdown || gameStateRef.current.countdown
                };
                setCurrentGame(updatedGame);
                gameStateRef.current = updatedGame;
            }
        });

        // Error handlers
        newSocket.on('disconnect', () => {
            console.log('Disconnected from game server');
            setIsConnected(false);
            setCanBet(false);
        });

        newSocket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setIsConnected(false);
            setCanBet(false);
        });

        setSocket(newSocket);

        // Periodic sync check
        const syncInterval = setInterval(() => {
            if (newSocket.connected && gameStateRef.current) {
                newSocket.emit('requestGameSync');
            }
        }, 30000);

        return () => {
            clearInterval(syncInterval);
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
            newSocket.close();
        };
    }, [walletAddress, syncServerTime, updateCountdownState]);

    // Enhanced place bet with pre-game betting support
    const placeBet = useCallback(async (walletAddress: string, amount: number, userId?: string): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!socket || !isConnected || !currentGame) {
                console.log('Cannot place bet: no socket, connection, or game');
                resolve(false);
                return;
            }

            // NEW: Allow betting during waiting period and active games
            if (currentGame.status !== 'active' && currentGame.status !== 'waiting') {
                console.log('Cannot place bet: game status is', currentGame.status);
                resolve(false);
                return;
            }

            // NEW: Check if betting is allowed (not in last 2 seconds of countdown)
            if (!canBet) {
                console.log('Cannot place bet: betting not allowed (too close to game start)');
                resolve(false);
                return;
            }

            const timeout = setTimeout(() => {
                console.log('Bet timeout after 10 seconds');
                resolve(false);
            }, 10000);

            socket.emit('placeBet', { walletAddress, betAmount: amount, userId });
            
            socket.once('betResult', (data: BetResult) => {
                clearTimeout(timeout);
                console.log('Bet result:', data);
                resolve(data.success);
                
                // Update local state if bet was successful
                if (data.success && data.gameState && gameStateRef.current) {
                    const updatedGame: GameState = {
                        ...gameStateRef.current,
                        totalBets: data.gameState.totalBets || gameStateRef.current.totalBets,
                        totalPlayers: data.gameState.totalPlayers || gameStateRef.current.totalPlayers,
                        countdown: data.gameState.countdown || gameStateRef.current.countdown
                    };
                    setCurrentGame(updatedGame);
                    gameStateRef.current = updatedGame;
                }
            });
        });
    }, [socket, isConnected, currentGame, canBet]);

    // Enhanced cash out with detailed result
    const cashOut = useCallback(async (walletAddress: string): Promise<{ success: boolean; payout?: number; reason?: string }> => {
        return new Promise((resolve) => {
            if (!socket || !isConnected || !currentGame || currentGame.status !== 'active') {
                resolve({ success: false, reason: 'Game not active or not connected' });
                return;
            }

            const timeout = setTimeout(() => {
                resolve({ success: false, reason: 'Timeout' });
            }, 10000);

            socket.emit('cashOut', { walletAddress });
            
            socket.once('cashOutResult', (data: CashOutResult) => {
                clearTimeout(timeout);
                console.log('Cashout result:', data);
                resolve({
                    success: data.success,
                    payout: data.payout,
                    reason: data.reason
                });
            });
        });
    }, [socket, isConnected, currentGame]);

    return {
        currentGame,
        gameHistory,
        isConnected,
        placeBet,
        cashOut,
        serverTimeOffset,
        getServerTime,
        // NEW: Countdown and waiting period state
        countdown,
        isWaitingPeriod,
        canBet
    };
}