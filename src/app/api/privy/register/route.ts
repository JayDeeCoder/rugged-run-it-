// src/app/api/privy/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { privyWalletAPI } from '../../../../services/privyWalletAPI';
import { isValidSolanaAddress } from '../../../../utils/walletUtils';
import logger from '../../../../utils/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, walletAddress } = body;
    
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing userId' },
        { status: 400 }
      );
    }
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing walletAddress' },
        { status: 400 }
      );
    }
    
    if (!isValidSolanaAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid Solana wallet address' },
        { status: 400 }
      );
    }
    
    const wallet = await privyWalletAPI.registerPrivyWallet(userId, walletAddress);
    
    if (!wallet) {
      return NextResponse.json(
        { error: 'Failed to register Privy wallet' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Privy wallet registered successfully',
      wallet: wallet
    });
    
  } catch (error) {
    console.error('Error registering Privy wallet:', error);
    return NextResponse.json(
      { 
        error: 'Failed to register wallet',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Privy wallet registration endpoint',
    methods: ['POST'],
    requiredFields: ['userId', 'walletAddress'],
    response: {
      success: true,
      message: 'string',
      wallet: 'PrivyWalletData'
    }
  });
}