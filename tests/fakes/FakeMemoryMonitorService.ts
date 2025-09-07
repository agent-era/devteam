import {MemoryMonitorService, MemoryStatus} from '../../src/services/MemoryMonitorService.js';
import {memoryStore} from './stores.js';

export class FakeMemoryMonitorService extends MemoryMonitorService {
  async getMemoryStatus(): Promise<MemoryStatus> {
    const stored = memoryStore.memoryStatus;
    if (stored) {
      return stored;
    }
    
    // Return default ok status if none stored
    return {
      availableRAM: 4.0,
      usedRAM: 4.0,
      totalRAM: 8.0,
      swapUsedPercent: 10,
      severity: 'ok'
    };
  }
  
  // Test helper methods
  setMemoryStatus(status: MemoryStatus) {
    memoryStore.memoryStatus = status;
  }
  
  setLowMemory(availableRAM: number = 0.8) {
    this.setMemoryStatus({
      availableRAM,
      usedRAM: 7.2,
      totalRAM: 8.0,
      swapUsedPercent: 85,
      severity: 'warning',
      message: `Low Memory: ${availableRAM}GB free, 85% swap used`
    });
  }
  
  setCriticalMemory(availableRAM: number = 0.4) {
    this.setMemoryStatus({
      availableRAM,
      usedRAM: 7.6,
      totalRAM: 8.0,
      swapUsedPercent: 98,
      severity: 'critical',
      message: `CRITICAL: ${availableRAM}GB free, 98% swap used - Sessions may crash!`
    });
  }
  
  resetMemory() {
    memoryStore.memoryStatus = null;
  }
}