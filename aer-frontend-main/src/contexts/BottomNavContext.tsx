import { createContext, useContext, useState, type ReactNode } from "react";

interface BottomNavContextValue {
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const BottomNavContext = createContext<BottomNavContextValue>({
  visible: true,
  setVisible: () => {},
});

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  return (
    <BottomNavContext.Provider value={{ visible, setVisible }}>
      {children}
    </BottomNavContext.Provider>
  );
}

export function useBottomNav() {
  return useContext(BottomNavContext);
}
