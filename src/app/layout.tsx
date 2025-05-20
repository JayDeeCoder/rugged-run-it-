// src/app/layout.tsx
"use client";

import { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientLayout from './client-layout';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0B0E16] dynapuff-font text-white min-h-screen`}>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}