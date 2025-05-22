// src/components/layout/MobileLayoutWrapper.tsx
'use client';

import { FC, ReactNode, useEffect, useState } from 'react';
import useWindowSize from '../../hooks/useWindowSize';

interface MobileLayoutWrapperProps {
  children: ReactNode;
  className?: string;
}

const MobileLayoutWrapper: FC<MobileLayoutWrapperProps> = ({ children, className = '' }) => {
  const { width } = useWindowSize();
  const [debugMode, setDebugMode] = useState(false);
  
  // Screen size detection
  const isExtraSmall = width ? width < 375 : false;
  const isSmall = width ? width < 640 : false;
  const isMobile = width ? width < 768 : false;
  
  // Debug mode toggle (only in development)
  useEffect(() => {
    const handleDebugToggle = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        setDebugMode(prev => !prev);
      }
    };
    
    if (process.env.NODE_ENV === 'development') {
      window.addEventListener('keydown', handleDebugToggle);
      return () => window.removeEventListener('keydown', handleDebugToggle);
    }
  }, []);
  
  // Dynamic classes based on screen size
  const wrapperClasses = [
    // Base classes
    'w-full min-w-0 overflow-x-hidden',
    
    // Screen-specific classes
    isExtraSmall && 'max-w-[375px]',
    isSmall && !isExtraSmall && 'max-w-[640px]',
    isMobile && !isSmall && 'max-w-[768px]',
    
    // Debug mode
    debugMode && 'outline outline-2 outline-red-500',
    
    // Custom classes
    className
  ].filter(Boolean).join(' ');
  
  return (
    <div className={wrapperClasses}>
      {/* Debug info - only in development */}
      {debugMode && process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 right-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs z-50">
          <div>Width: {width}px</div>
          <div>Type: {isExtraSmall ? 'XS' : isSmall ? 'SM' : isMobile ? 'MD' : 'LG'}</div>
          <div>Viewport: {typeof window !== 'undefined' ? window.innerWidth : 'N/A'}px</div>
        </div>
      )}
      
      {children}
    </div>
  );
};

export default MobileLayoutWrapper;