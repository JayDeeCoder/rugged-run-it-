// src/hooks/useAuthenticatedFetch.ts
import { usePrivy } from '@privy-io/react-auth';

export const useAuthenticatedFetch = () => {
  const { getAccessToken } = usePrivy();
  
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const token = await getAccessToken();
    
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
    
    return fetch(url, {
      ...options,
      headers,
    });
  };
  
  return { fetchWithAuth };
};