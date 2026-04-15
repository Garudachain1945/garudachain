import { useState, useEffect } from "react";

export function useWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem("garuda_wallet_connected");
    if (saved === "true") {
      setIsConnected(true);
      setAddress("0x71C...976F");
      setBalance(15000000);
    }
  }, []);

  const connect = () => {
    setIsConnected(true);
    setAddress("0x71C...976F");
    setBalance(15000000);
    localStorage.setItem("garuda_wallet_connected", "true");
  };

  const disconnect = () => {
    setIsConnected(false);
    setAddress(null);
    setBalance(0);
    localStorage.setItem("garuda_wallet_connected", "false");
  };

  return { isConnected, address, balance, connect, disconnect };
}
