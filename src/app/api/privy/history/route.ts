// app/api/privy/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { privyWalletAPI } from '../../../../services/privyWalletAPI';
import { isValidSolanaAddress } from '../../../../utils/walletUtils';
import logger from '../../../../utils/logger';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, limit = 50 } = body;
    
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing userId' },
        { status: 400 }
      );
    }
    
    const history = await privyWalletAPI.getTransactionHistory(userId, limit);
    
    return NextResponse.json({
      success: true,
      transactions: history,
      count: history.length
    });
    
  } catch (error) {
    console.error('Error getting transaction history:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get transaction history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Privy wallet transaction history endpoint',
    methods: ['POST'],
    requiredFields: ['userId'],
    optionalFields: ['limit'],
    response: {
      success: true,
      transactions: 'TransactionRecord[]',
      count: 'number'
    }
  });
}