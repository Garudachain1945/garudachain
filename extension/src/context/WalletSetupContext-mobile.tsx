import React, { createContext, useContext, useState } from "react";

interface WalletSetupState {
  mnemonic: string;
  password: string;
  setMnemonic: (m: string) => void;
  setPassword: (p: string) => void;
  clear: () => void;
}

const WalletSetupContext = createContext<WalletSetupState>({
  mnemonic: "",
  password: "",
  setMnemonic: () => {},
  setPassword: () => {},
  clear: () => {},
});

export function WalletSetupProvider({ children }: { children: React.ReactNode }) {
  const [mnemonic, setMnemonic] = useState("");
  const [password, setPassword] = useState("");

  const clear = () => {
    setMnemonic("");
    setPassword("");
  };

  return (
    <WalletSetupContext.Provider value={{ mnemonic, password, setMnemonic, setPassword, clear }}>
      {children}
    </WalletSetupContext.Provider>
  );
}

export function useWalletSetup() {
  return useContext(WalletSetupContext);
}
