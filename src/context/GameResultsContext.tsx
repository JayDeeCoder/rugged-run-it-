// src/context/GameResultsContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { GameResult } from '../types/trade';

interface GameResultsContextType {
  gameResults: GameResult[];
  addGameResult: (result: GameResult) => void;
  clearGameResults: () => void;
  getRecentResults: (count: number) => GameResult[];
  getStatistics: () => {
    totalGames: number;
    averageMultiplier: number;
    highestMultiplier: number;
    successRate: number;
  };
}

const GameResultsContext = createContext<GameResultsContextType | undefined>(undefined);

export const GameResultsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [gameResults, setGameResults] = useState<GameResult[]>([]);

  // Load game results from localStorage on mount
  useEffect(() => {
    const savedResults = localStorage.getItem('gameResults');
    if (savedResults) {
      try {
        const parsedResults = JSON.parse(savedResults);
        if (Array.isArray(parsedResults)) {
          // Ensure all results have required properties
          const validResults = parsedResults.filter(result => 
            result && 
            typeof result.value === 'number' && 
            typeof result.label === 'string' && 
            typeof result.timestamp === 'number'
          );
          setGameResults(validResults);
        }
      } catch (error) {
        console.error('Failed to parse saved game results:', error);
        // Clear corrupted data
        localStorage.removeItem('gameResults');
      }
    }
  }, []);

  // Save game results to localStorage whenever they change
  useEffect(() => {
    if (gameResults.length > 0) {
      try {
        // Keep only the last 100 results to prevent localStorage bloat
        const resultsToSave = gameResults.slice(-100);
        localStorage.setItem('gameResults', JSON.stringify(resultsToSave));
      } catch (error) {
        console.error('Failed to save game results:', error);
      }
    }
  }, [gameResults]);

  const addGameResult = useCallback((result: GameResult) => {
    // Validate the result before adding
    if (!result || typeof result.value !== 'number' || !result.label || !result.timestamp) {
      console.error('Invalid game result:', result);
      return;
    }

    setGameResults(prev => {
      // Add new result at the beginning and keep last 100
      const newResults = [result, ...prev].slice(0, 100);
      return newResults;
    });
  }, []);

  const clearGameResults = useCallback(() => {
    setGameResults([]);
    localStorage.removeItem('gameResults');
  }, []);

  const getRecentResults = useCallback((count: number): GameResult[] => {
    return gameResults.slice(0, Math.max(0, count));
  }, [gameResults]);

  const getStatistics = useCallback(() => {
    if (gameResults.length === 0) {
      return {
        totalGames: 0,
        averageMultiplier: 0,
        highestMultiplier: 0,
        successRate: 0
      };
    }

    const totalGames = gameResults.length;
    const totalMultiplier = gameResults.reduce((sum, result) => sum + result.value, 0);
    const averageMultiplier = totalMultiplier / totalGames;
    const highestMultiplier = Math.max(...gameResults.map(result => result.value));
    const successfulGames = gameResults.filter(result => result.value >= 1.0).length;
    const successRate = (successfulGames / totalGames) * 100;

    return {
      totalGames,
      averageMultiplier: parseFloat(averageMultiplier.toFixed(2)),
      highestMultiplier: parseFloat(high