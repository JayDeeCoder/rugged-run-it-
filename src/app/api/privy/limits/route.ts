// src/app/api/privy/limits/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { privyWalletAPI } from '../../../../services/privyWalletAPI';
import { isValidSolanaAddress } from '../../../../utils/walletUtils';
import logger from '../../../../utils/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, amount = 0 } = body;
    
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing userId' },
        { status: 400 }
      );
    }
    
    const dailyLimits = await privyWalletAPI.checkDailyWithdrawalLimit(userId, amount);
    
    return NextResponse.json({
      success: true,
      dailyLimits: {
        used: dailyLimits.used,
        remaining: dailyLimits.remaining,
        limit: 20.0,
        allowed: dailyLimits.allowed
      }
    });
    
  } catch (error) {
    console.error('Error checking daily limits:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check daily limits',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Privy wallet daily limits endpoint',
    methods: ['POST'],
    requiredFields: ['userId'],
    optionalFields: ['amount'],
    response: {
      success: true,
      dailyLimits: {
        used: 'number',
        remaining: 'number', 
        limit: 'number',
        allowed: 'boolean'
      }
    }
  });
}