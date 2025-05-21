import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { Menu, X, User, LogOut, Settings } from 'lucide-react';

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  
  // Use Privy hooks for authentication instead of wallet adapter
  const { authenticated, user, login, logout, ready } = usePrivy();
  
  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };
  
  // Toggle user dropdown
  const toggleUserDropdown = () => {
    setIsUserDropdownOpen(!isUserDropdownOpen);
  };
  
  return (
    <nav className="bg-[#0d0d0f] border-b border-gray-800 py-4 px-6">
      <div className="container mx-auto flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image 
            src="/images/logo.png" 
            alt="Logo" 
            width={40} 
            height={40} 
            className="mr-2"
          />
          <span className="text-white text-xl font-bold">RUGGED.FUN</span>
        </Link>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-6">
          <Link href="/dashboard" className="text-gray-300 hover:text-white">
            Dashboard
          </Link>
          <Link href="/trade" className="text-gray-300 hover:text-white">
            Trade
          </Link>
          <Link href="/leaderboard" className="text-gray-300 hover:text-white">
            Leaderboard
          </Link>
          
          {/* REMOVED: Wallet Adapter Button */}
          {/* Replace with Privy authentication */}
          {!ready ? (
            <div className="animate-pulse bg-gray-700 rounded-md h-10 w-24"></div>
          ) : authenticated ? (
            <div className="relative">
              <button 
                onClick={toggleUserDropdown}
                className="flex items-center bg-gray-800 hover:bg-gray-700 text-white rounded-md px-4 py-2"
              >
                <User size={18} className="mr-2" />
                <span className="max-w-[100px] truncate">
                  {user?.email?.address || "Account"}
                </span>
              </button>
              
              {/* User dropdown menu */}
              {isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg z-10">
                  <div className="py-1">
                    <Link 
                      href="/profile"
                      className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      onClick={() => setIsUserDropdownOpen(false)}
                    >
                      <div className="flex items-center">
                        <User size={16} className="mr-2" />
                        Profile
                      </div>
                    </Link>
                    <Link 
                      href="/settings"
                      className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      onClick={() => setIsUserDropdownOpen(false)}
                    >
                      <div className="flex items-center">
                        <Settings size={16} className="mr-2" />
                        Settings
                      </div>
                    </Link>
                    <button 
                      onClick={() => {
                        logout();
                        setIsUserDropdownOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
                    >
                      <div className="flex items-center">
                        <LogOut size={16} className="mr-2" />
                        Logout
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={() => login()}
              className="bg-green-600 hover:bg-green-700 text-white rounded-md px-4 py-2"
            >
              Login
            </button>
          )}
        </div>
        
        {/* Mobile menu button */}
        <button 
          className="md:hidden text-gray-300 hover:text-white"
          onClick={toggleMobileMenu}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      
      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden mt-4 px-6 pb-4">
          <div className="flex flex-col space-y-3">
            <Link 
              href="/dashboard" 
              className="text-gray-300 hover:text-white py-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link 
              href="/trade" 
              className="text-gray-300 hover:text-white py-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Trade
            </Link>
            <Link 
              href="/leaderboard" 
              className="text-gray-300 hover:text-white py-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Leaderboard
            </Link>
            
            {/* REMOVED: Mobile Wallet Adapter Button */}
            {/* Replace with Privy authentication */}
            {!ready ? (
              <div className="animate-pulse bg-gray-700 rounded-md h-10 w-full"></div>
            ) : authenticated ? (
              <div className="border-t border-gray-800 pt-3 mt-2">
                <div className="text-sm text-gray-400 mb-2">Logged in as:</div>
                <div className="text-white mb-2">
                  {user?.email?.address || "User"}
                </div>
                <div className="flex space-x-2">
                  <Link 
                    href="/profile"
                    className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-white rounded-md px-4 py-2 text-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <button 
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1 bg-red-900 hover:bg-red-800 text-white rounded-md px-4 py-2 text-sm"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => login()}
                className="w-full bg-green-600 hover:bg-green-700 text-white rounded-md px-4 py-2 mt-2"
              >
                Login
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;