// src/components/layout/Layout.tsx - Fixed version with proper z-index stacking
import { FC, ReactNode } from 'react';
import Navbar from './Navbar';

interface LayoutProps {
  children: ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen bg-[#0d0d0f] text-white relative">
      {/* Navbar with high z-index to ensure dropdowns appear above content */}
      <div className="relative z-50">
        <Navbar />
      </div>
      
      {/* Main content area with lower z-index */}
      <div className="flex flex-1 overflow-hidden relative z-10">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;