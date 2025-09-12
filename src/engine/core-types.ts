export interface CoreBase<TState> {
  get(): Readonly<TState>;
  subscribe(fn: (state: Readonly<TState>) => void): () => void;
  start(): void;
  stop(): void;
}

export interface PRFacade {
  get(path: string): any;
  refresh(path: string): Promise<void>;
  forceRefreshVisible(paths: string[]): Promise<void>;
}

export type Unsubscribe = () => void;

