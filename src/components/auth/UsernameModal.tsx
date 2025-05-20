// src/components/auth/UsernameModal.tsx
import { FC, useState, useRef } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';

interface UsernameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string) => void;
  currentUsername: string;
}

const UsernameModal: FC<UsernameModalProps> = ({ isOpen, onClose, onSubmit, currentUsername }) => {
  const [username, setUsername] = useState(currentUsername);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Fix: Properly type the ref to satisfy useOutsideClick's requirements
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Fix: Type assertion to make TypeScript happy
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen) onClose();
  });
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    
    if (username.trim().length > 20) {
      setError('Username must be less than 20 characters');
      return;
    }
    
    // Check for valid characters
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      onSubmit(username);
      onClose();
    } catch (err) {
      console.error('Error setting username:', err);
      setError('Failed to set username. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4"
      >
        <h2 className="text-xl font-bold text-white mb-4">Set Your Username</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-md px-4 py-2 focus:outline-none focus:ring focus:ring-green-500"
              placeholder="Enter a username"
              required
            />
            {error && (
              <p className="text-red-500 text-sm mt-1">{error}</p>
            )}
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors ${
                isSubmitting ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? 'Saving...' : 'Save Username'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UsernameModal;