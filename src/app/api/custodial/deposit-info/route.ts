// app/api/custodial/deposit-info/route.ts - FIXED with better environment variable handling
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🏦 Getting deposit information for custodial mode...');
    
    // FIXED: Better environment variable detection with detailed logging
    const possibleHouseWallets = [
      process.env.HOUSE_WALLET_ADDRESS,
      process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS,
      process.env.REACT_APP_HOUSE_WALLET_ADDRESS,
      // Add fallback if all else fails
      '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56' // Your existing fallback
    ];
    
    console.log('🔍 Environment variable check:', {
      HOUSE_WALLET_ADDRESS: !!process.env.HOUSE_WALLET_ADDRESS,
      NEXT_PUBLIC_HOUSE_WALLET_ADDRESS: !!process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS,
      REACT_APP_HOUSE_WALLET_ADDRESS: !!process.env.REACT_APP_HOUSE_WALLET_ADDRESS,
      NODE_ENV: process.env.NODE_ENV,
      allEnvKeys: Object.keys(process.env).filter(key => key.includes('HOUSE')),
    });
    
    const HOUSE_WALLET_ADDRESS = possibleHouseWallets.find(addr => addr && addr.length > 0);
    
    if (!HOUSE_WALLET_ADDRESS) {
      console.error('❌ No house wallet address found in any environment variable');
      console.error('Available env variables:', Object.keys(process.env).filter(key => key.includes('WALLET') || key.includes('HOUSE')));
      
      return NextResponse.json(
        { 
          error: 'House wallet not configured',
          details: 'No valid house wallet address found in environment variables',
          debug: {
            checkedVariables: ['HOUSE_WALLET_ADDRESS', 'NEXT_PUBLIC_HOUSE_WALLET_ADDRESS', 'REACT_APP_HOUSE_WALLET_ADDRESS'],
            foundVariables: Object.keys(process.env).filter(key => key.includes('HOUSE') || key.includes('WALLET'))
          }
        },
        { status: 500 }
      );
    }

    console.log(`✅ Using house wallet: ${HOUSE_WALLET_ADDRESS.slice(0, 8)}...${HOUSE_WALLET_ADDRESS.slice(-8)}`);

    const body = await request.json();
    const { userId, amount } = body;

    console.log('📋 Deposit request from user:', { userId, requestedAmount: amount });

    return NextResponse.json({
      success: true,
      message: 'Send SOL to this address to deposit into your game balance',
      depositInfo: {
        depositAddress: HOUSE_WALLET_ADDRESS,
        requestedAmount: amount || 'Any amount',
        minDeposit: 0.001, // FIXED: Changed from 0.002 to match your game config
        maxDeposit: 100,
        network: 'Solana Mainnet',
        mode: 'custodial'
      },
      instructions: [
        '1. Copy the deposit address below',
        '2. Open your Solana wallet (Phantom, Solflare, Backpack, etc.)',
        '3. Send SOL to the deposit address',
        '4. Your game balance will be credited automatically',
        '5. Minimum deposit: 0.001 SOL'
      ],
      important: [
        '⚠️ Send ONLY SOL to this address',
        '⚠️ Do NOT send other tokens (USDC, tokens, NFTs)',
        '⚠️ Make sure you are on Solana Mainnet',
        '⚠️ Double-check the address before sending'
      ],
      timing: {
        estimatedCreditTime: '1-3 minutes after blockchain confirmation',
        blockchainConfirmations: '1-2 confirmations required',
        supportContact: 'Contact support if deposit is not credited within 10 minutes'
      },
      depositAddress: HOUSE_WALLET_ADDRESS, // Make it easy to copy
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${HOUSE_WALLET_ADDRESS}`,
      explorerUrl: `https://solscan.io/account/${HOUSE_WALLET_ADDRESS}`,
      environmentSource: possibleHouseWallets.findIndex(addr => addr === HOUSE_WALLET_ADDRESS), // Debug info
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Deposit info generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate deposit information',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    // Same improved environment variable handling
    const possibleHouseWallets = [
      process.env.HOUSE_WALLET_ADDRESS,
      process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS,
      process.env.REACT_APP_HOUSE_WALLET_ADDRESS,
      '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56'
    ];
    
    const HOUSE_WALLET_ADDRESS = possibleHouseWallets.find(addr => addr && addr.length > 0);
    
    console.log('📋 GET deposit info request:', { 
      userId, 
      hasHouseWallet: !!HOUSE_WALLET_ADDRESS,
      sourceIndex: possibleHouseWallets.findIndex(addr => addr === HOUSE_WALLET_ADDRESS)
    });
    
    return NextResponse.json({
      message: 'Custodial deposit information endpoint',
      available: !!HOUSE_WALLET_ADDRESS,
      depositAddress: HOUSE_WALLET_ADDRESS || 'Not configured',
      mode: 'custodial',
      network: 'Solana Mainnet',
      limits: {
        minDeposit: 0.001,
        maxDeposit: 100,
        note: 'No daily deposit limits in custodial mode'
      },
      instructions: 'Send SOL to the deposit address to credit your game balance',
      features: [
        'Automatic balance crediting',
        'QR code generation for easy deposits',
        'Blockchain explorer integration',
        'Real-time deposit tracking'
      ],
      debug: {
        environmentVariables: Object.keys(process.env).filter(key => key.includes('HOUSE') || key.includes('WALLET')),
        foundHouseWallet: !!HOUSE_WALLET_ADDRESS,
        walletPreview: HOUSE_WALLET_ADDRESS ? `${HOUSE_WALLET_ADDRESS.slice(0, 8)}...${HOUSE_WALLET_ADDRESS.slice(-8)}` : 'None'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ GET deposit info error:', error);
    return NextResponse.json(
      { error: 'Failed to get deposit information' },
      { status: 500 }
    );
  }
}