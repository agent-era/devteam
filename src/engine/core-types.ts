export interface CoreBase<TState> {
  get(): Readonly<TState>;
  subscribe(fn: (state: Readonly<TState>) => void): () => void;
  start(): void;
  stop(): void;
}
