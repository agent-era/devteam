import React, {createContext, useContext, useState, ReactNode} from 'react';
import {AppState} from '../models.js';

const h = React.createElement;

interface AppStateContextType {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  updateState: (partial: Partial<AppState>) => void;
}

const AppStateContext = createContext<AppStateContextType | null>(null);

interface AppStateProviderProps {
  children: ReactNode;
  initialState?: Partial<AppState>;
}

export function AppStateProvider({children, initialState}: AppStateProviderProps) {
  const [state, setState] = useState(() => new AppState(initialState));

  const updateState = (partial: Partial<AppState>) => {
    setState(prev => new AppState({...prev, ...partial}));
  };

  const contextValue: AppStateContextType = {
    state,
    setState,
    updateState
  };

  return h(AppStateContext.Provider, {value: contextValue}, children);
}

export function useAppState(): AppStateContextType {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}