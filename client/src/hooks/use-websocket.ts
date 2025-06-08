import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: string;
  data?: any;
  count?: number;
  timestamp?: string;
  message?: string;
  contractAddress?: string;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: any) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = () => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          // Don't throw unhandled rejections
          return;
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        // Prevent unhandled promise rejections
        setIsConnected(false);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  };

  const sendMessage = (message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connectionStatus
  };
}

// Hook for specific data types
export function useWebSocketData<T>(messageType: string, initialData: T) {
  const { lastMessage } = useWebSocket();
  const [data, setData] = useState<T>(initialData);

  useEffect(() => {
    if (lastMessage?.type === messageType) {
      setData(lastMessage.data || initialData);
    }
  }, [lastMessage, messageType, initialData]);

  return data;
}

// Hook for real-time opportunities
export function useWebSocketOpportunities() {
  const { lastMessage, isConnected } = useWebSocket();
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [newOpportunityCount, setNewOpportunityCount] = useState(0);

  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'new_opportunity':
        if (lastMessage.data) {
          setOpportunities(prev => [lastMessage.data, ...prev.slice(0, 49)]); // Keep last 50
          setNewOpportunityCount(prev => prev + 1);
        }
        break;
      case 'opportunities_updated':
        // Trigger a refresh of opportunities list
        setNewOpportunityCount(0);
        break;
    }
  }, [lastMessage]);

  return {
    opportunities,
    newOpportunityCount,
    isConnected,
    lastMessage,
    clearNewCount: () => setNewOpportunityCount(0)
  };
}