// Fixed useGameSocket hook with proper TypeScript types

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

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
}

export function useGameSocket(walletAddress: string, userId?: string) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [currentGame, setCurrentGame] = useState<GameState | null>(null);
    const [gameHistory, setGameHistory] = useState<GameState[]>([]);
    
    // FIX: Add initial value for useRef
    const [serverTimeOffset, setServerTimeOffset] = useState(0);
    const gameStateRef = useRef<GameState | null>(null); // Fixed: added initial value
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Fixed: added initial value

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

    // Enhanced connection with automatic reconnection
    useEffect(() => {
        const serverUrl = 'wss://bdce-3-16-49-236.ngrok-free.app';
        console.log('🔍 Using hardcoded URL:', serverUrl);
        
        // 🔍 DEBUG: Let's see what's happening
        console.log('🔍 Environment variable:', process.env.NEXT_PUBLIC_GAME_SERVER_URL);
        console.log('🔍 Server URL being used:', serverUrl);
        console.log('🔍 All env vars:', Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC')));
        
        const newSocket = io(serverUrl, {
            transports: ['websocket'],
            timeout: 10000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        // Enhanced connection handler
        newSocket.on('connect', () => {
            console.log('Connected to game server');
            setIsConnected(true);
            
            // Request immediate game sync
            newSocket.emit('requestGameSync');
        });

        // FIX: Handle game state with proper type checking
        newSocket.on('gameState', (gameState: any) => {
            console.log('Received game state:', gameState);
            
            if (gameState.serverTime) {
                syncServerTime(gameState.serverTime);
            }
            
            // FIX: Ensure all required fields are present
            const newGameState: GameState = {
                id: gameState.gameId || gameState.id || '',
                gameNumber: gameState.gameNumber || 0,
                multiplier: gameState.multiplier || 1.0,
                status: gameState.status || 'waiting',
                totalBets: gameState.totalBets || 0,
                totalPlayers: gameState.totalPlayers || 0,
                startTime: gameState.startTime || Date.now(),
                maxMultiplier: gameState.maxMultiplier,
                serverTime: gameState.serverTime
            };
            
            setCurrentGame(newGameState);
            gameStateRef.current = newGameState;
        });

        // FIX: Enhanced multiplier update with proper type validation
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

        // FIX: Handle game started with proper types
        newSocket.on('gameStarted', (data: any) => {
            console.log('New game started:', data);
            
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            const newGameState: GameState = {
                id: data.gameId || '',
                gameNumber: data.gameNumber || 0,
                multiplier: 1.0,
                status: 'active',
                totalBets: 0,
                totalPlayers: 0,
                startTime: data.startTime || Date.now(),
                maxMultiplier: data.maxMultiplier,
                serverTime: data.serverTime
            };
            
            setCurrentGame(newGameState);
            gameStateRef.current = newGameState;
        });

        // FIX: Handle game crashed with proper type validation
        newSocket.on('gameCrashed', (data: any) => {
            console.log('Game crashed:', data);
            
            if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
                const crashedGame: GameState = {
                    ...gameStateRef.current,
                    status: 'crashed',
                    multiplier: data.crashMultiplier || data.finalMultiplier || gameStateRef.current.multiplier
                };
                
                setCurrentGame(crashedGame);
                gameStateRef.current = null; // Clear current game
                
                // FIX: Add to history with proper type
                setGameHistory(prev => [...prev.slice(-49), crashedGame]);
            }
        });

        // FIX: Handle periodic server sync with type validation
        newSocket.on('serverSync', (data: any) => {
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            // Only update if we have the same game
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
                // We're out of sync, request full game state
                console.log('Game out of sync, requesting fresh state...');
                newSocket.emit('requestGameSync');
            }
        });

        // FIX: Handle explicit game sync responses
        newSocket.on('gameSync', (data: any) => {
            console.log('Received game sync:', data);
            
            if (data.serverTime) {
                syncServerTime(data.serverTime);
            }
            
            if (data.status === 'active') {
                const syncedGame: GameState = {
                    id: data.gameId || '',
                    gameNumber: data.gameNumber || 0,
                    multiplier: data.multiplier || 1.0,
                    status: data.status,
                    totalBets: 0,
                    totalPlayers: 0,
                    startTime: 0,
                    serverTime: data.serverTime
                };
                
                setCurrentGame(syncedGame);
                gameStateRef.current = syncedGame;
            }
        });

        // Handle game history
        newSocket.on('gameHistory', (history: any[]) => {
            // FIX: Map history to proper GameState objects
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

        // FIX: Handle bet updates with proper type validation
        newSocket.on('betPlaced', (data: any) => {
            if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
                const updatedGame: GameState = {
                    ...gameStateRef.current,
                    totalBets: data.totalBets || gameStateRef.current.totalBets,
                    totalPlayers: data.totalPlayers || gameStateRef.current.totalPlayers
                };
                setCurrentGame(updatedGame);
                gameStateRef.current = updatedGame;
            }
        });

        newSocket.on('disconnect', () => {
            console.log('Disconnected from game server');
            setIsConnected(false);
        });

        newSocket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setIsConnected(false);
        });

        setSocket(newSocket);

        // Set up periodic sync check
        const syncInterval = setInterval(() => {
            if (newSocket.connected && gameStateRef.current) {
                newSocket.emit('requestGameSync');
            }
        }, 30000); // Every 30 seconds

        return () => {
            clearInterval(syncInterval);
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
            newSocket.close();
        };
    }, [walletAddress, syncServerTime]);

    // Enhanced place bet with validation
    const placeBet = useCallback(async (walletAddress: string, amount: number, userId?: string): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!socket || !isConnected || !currentGame || currentGame.status !== 'active') {
                resolve(false);
                return;
            }

            const timeout = setTimeout(() => {
                resolve(false);
            }, 10000); // 10 second timeout

            socket.emit('placeBet', { walletAddress, betAmount: amount, userId });
            
            socket.once('betResult', (data: any) => {
                clearTimeout(timeout);
                resolve(data.success);
                
                // Update local state if bet was successful
                if (data.success && data.gameState && gameStateRef.current) {
                    const updatedGame: GameState = {
                        ...gameStateRef.current,
                        totalBets: data.gameState.totalBets || gameStateRef.current.totalBets,
                        totalPlayers: data.gameState.totalPlayers || gameStateRef.current.totalPlayers
                    };
                    setCurrentGame(updatedGame);
                    gameStateRef.current = updatedGame;
                }
            });
        });
    }, [socket, isConnected, currentGame]);

    // Enhanced cash out
    const cashOut = useCallback(async (walletAddress: string): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!socket || !isConnected || !currentGame || currentGame.status !== 'active') {
                resolve(false);
                return;
            }

            const timeout = setTimeout(() => {
                resolve(false);
            }, 10000);

            socket.emit('cashOut', { walletAddress });
            
            socket.once('cashOutResult', (data: any) => {
                clearTimeout(timeout);
                resolve(data.success);
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
        getServerTime
    };
}