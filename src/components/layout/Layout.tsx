// src/components/layout/Layout.tsx - Fixed layout with sticky navbar and proper scrolling
import { FC, ReactNode } from 'react';
import Navbar from './Navbar';

interface LayoutProps {
  children: ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }) => {
  return (
    <div className="h-screen bg-[#0d0d0f] text-white overflow-hidden">
      {/* Fixed Navbar - always stays at top */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0d0d0f] border-b border-gray-800">
        <Navbar />
      </div>
      
      {/* Main content area - accounts for navbar height and handles scrolling */}
      <div className="pt-16 h-full flex">
        <main className="flex-1 h-full overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;