import React, {createContext, useContext, useState, useCallback} from 'react';


interface InputFocusContextType {
  hasFocus: (componentId: string) => boolean;
  requestFocus: (componentId: string) => void;
  releaseFocus: (componentId: string) => void;
  isAnyDialogFocused: boolean;
}

const InputFocusContext = createContext<InputFocusContextType | null>(null);

export function useInputFocus() {
  const context = useContext(InputFocusContext);
  if (!context) {
    throw new Error('useInputFocus must be used within InputFocusProvider');
  }
  return context;
}

export function InputFocusProvider({children}: {children: React.ReactNode}) {
  const [focusedComponent, setFocusedComponent] = useState<string | null>(null);

  const hasFocus = useCallback((componentId: string) => {
    return focusedComponent === componentId;
  }, [focusedComponent]);

  const requestFocus = useCallback((componentId: string) => {
    setFocusedComponent(componentId);
  }, []);

  const releaseFocus = useCallback((componentId: string) => {
    setFocusedComponent(prev => prev === componentId ? null : prev);
  }, []);

  const isAnyDialogFocused = focusedComponent !== null && focusedComponent !== 'main';

  const value: InputFocusContextType = {
    hasFocus,
    requestFocus,
    releaseFocus,
    isAnyDialogFocused
  };

  return (
    <InputFocusContext.Provider value={value}>
      {children}
    </InputFocusContext.Provider>
  );
}