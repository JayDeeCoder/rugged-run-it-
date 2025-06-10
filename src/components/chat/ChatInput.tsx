// src/components/chat/ChatInput.tsx
import { FC, FormEvent, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { useContext } from 'react';
import { UserContext } from '../../context/UserContext';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

const ChatInput: FC<ChatInputProps> = ({ onSendMessage }) => {
  const [message, setMessage] = useState('');
  const { isConnected } = useChat();
  const { isLoggedIn } = useContext(UserContext);
  
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if (message.trim() && isLoggedIn && isConnected) {
      onSendMessage(message);
      setMessage('');
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="flex justify-between p-2">
      <div className="flex jsutify-between items-center bg-gray-800 rounded-md py-1 max-w-3/4 flex-1">
        {/* Input field */}
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            !isLoggedIn ? "Login to chat" : 
            !isConnected ? "Connecting..." : 
            "Type your message"
          }
          className="flex-1 bg-transparent px-2 max-w-7/8 text-white text-sm placeholder-gray-400 focus:outline-none"
          disabled={!isLoggedIn || !isConnected}
        />

        {/* Emoji icon */}
        <button
          type="button"
          className="text-yellow-400 hover:scale-105 transition-all mx-2"
          title="Emoji"
          disabled={!isLoggedIn || !isConnected}
        >
          <span className="drop-shadow-[0_0_4px_#facc15]">😎</span>
        </button>
      </div>

      {/* Send button */}
      <button
        type="submit"
        className={`ml-2 px-4 py-2 rounded-md font-semibold ${
          isLoggedIn && isConnected && message.trim() 
            ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer' 
            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
        }`}
        disabled={!isLoggedIn || !isConnected || !message.trim()}
      >
        Send
      </button>
    </form>
  );
};

export default ChatInput;