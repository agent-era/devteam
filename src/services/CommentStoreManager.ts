import {CommentStore} from '../models.js';

export class CommentStoreManager {
  private stores: Map<string, CommentStore> = new Map();
  
  getStore(worktreePath: string): CommentStore {
    if (!this.stores.has(worktreePath)) {
      this.stores.set(worktreePath, new CommentStore());
    }
    return this.stores.get(worktreePath)!;
  }
  
  clearStore(worktreePath: string): void {
    const store = this.stores.get(worktreePath);
    if (store) {
      store.clear();
    }
  }
  
  removeStore(worktreePath: string): void {
    this.stores.delete(worktreePath);
  }
  
  getTotalComments(): number {
    let total = 0;
    for (const store of this.stores.values()) {
      total += store.count;
    }
    return total;
  }
}

// Singleton instance
export const commentStoreManager = new CommentStoreManager();