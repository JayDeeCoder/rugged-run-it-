// src/app/api/privy/balance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { privyWalletAPI } from '../../../../services/privyWalletAPI';
import { isValidSolanaAddress } from '../../../../utils/walletUtils';
import logger from '../../../../utils/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;
    
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing userId' },
        { status: 400 }
      );
    }
    
    const summary = await privyWalletAPI.getWalletSummary(userId);
    
    return NextResponse.json({
      success: true,
      balance: summary.currentBalance,
      wallet: summary.wallet,
      dailyLimits: summary.dailyLimits
    });
    
  } catch (error) {
    console.error('Error getting Privy balance:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get balance',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Privy wallet balance endpoint',
    methods: ['POST'],
    requiredFields: ['userId'],
    response: {
      success: true,
      balance: 'number',
      wallet: 'PrivyWalletData | null',
      dailyLimits: 'DailyLimitCheck'
    }
  });
}