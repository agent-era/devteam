import fs from 'node:fs';
import {logError, logDebug} from '../shared/utils/logger.js';

export type MemorySeverity = 'ok' | 'warning' | 'critical';

export interface MemoryStatus {
  availableRAM: number; // in GB
  usedRAM: number; // in GB
  totalRAM: number; // in GB
  swapUsedPercent: number; // 0-100
  severity: MemorySeverity;
  message?: string;
}

export class MemoryMonitorService {
  // Thresholds:
  // - Warning when free RAM < 1 GB or swap usage > 75%
  // - Critical when free RAM < 0.5 GB or swap usage > 90%
  private static readonly WARNING_RAM_THRESHOLD_GB = 1.0;
  private static readonly CRITICAL_RAM_THRESHOLD_GB = 0.5;
  private static readonly WARNING_SWAP_THRESHOLD = 75; // percent used
  private static readonly CRITICAL_SWAP_THRESHOLD = 90; // percent used

  async getMemoryStatus(): Promise<MemoryStatus> {
    try {
      if (process.platform === 'linux') {
        return await this.getLinuxMemoryStatus();
      } else {
        // Non-Linux platforms: no-op (do not warn)
        // Intentionally avoid platform-specific implementations here.
        return {
          availableRAM: 0,
          usedRAM: 0,
          totalRAM: 0,
          swapUsedPercent: 0,
          severity: 'ok'
        };
      }
    } catch (error) {
      logError('Failed to get memory status', error);
      // Return safe defaults if monitoring fails
      return {
        availableRAM: 2.0,
        usedRAM: 0,
        totalRAM: 8.0,
        swapUsedPercent: 0,
        severity: 'ok'
      };
    }
  }

  private async getLinuxMemoryStatus(): Promise<MemoryStatus> {
    const memInfo = await fs.promises.readFile('/proc/meminfo', 'utf-8');
    const lines = memInfo.split('\n');
    
    const getValue = (key: string): number => {
      const line = lines.find(l => l.startsWith(key));
      if (!line) return 0;
      const match = line.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Parse memory values (in kB)
    const memTotal = getValue('MemTotal');
    const memAvailable = getValue('MemAvailable');
    const swapTotal = getValue('SwapTotal');
    const swapFree = getValue('SwapFree');
    
    // Convert to GB
    const totalRAM = memTotal / 1024 / 1024;
    const availableRAM = memAvailable / 1024 / 1024;
    const usedRAM = totalRAM - availableRAM;
    
    // Calculate swap usage percentage
    const swapUsed = swapTotal - swapFree;
    const swapUsedPercent = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;

    const status: MemoryStatus = {
      availableRAM: Math.round(availableRAM * 100) / 100,
      usedRAM: Math.round(usedRAM * 100) / 100,
      totalRAM: Math.round(totalRAM * 100) / 100,
      swapUsedPercent: Math.round(swapUsedPercent * 10) / 10,
      severity: 'ok'
    };

    // Determine severity and message
    logDebug('Memory thresholds check', {
      availableRAM,
      swapUsedPercent,
      warningRAMThreshold: MemoryMonitorService.WARNING_RAM_THRESHOLD_GB,
      criticalRAMThreshold: MemoryMonitorService.CRITICAL_RAM_THRESHOLD_GB,
      warningSwapThreshold: MemoryMonitorService.WARNING_SWAP_THRESHOLD,
      criticalSwapThreshold: MemoryMonitorService.CRITICAL_SWAP_THRESHOLD
    });

    if (availableRAM < MemoryMonitorService.CRITICAL_RAM_THRESHOLD_GB || 
        swapUsedPercent > MemoryMonitorService.CRITICAL_SWAP_THRESHOLD) {
      status.severity = 'critical';
      status.message = `CRITICAL: ${status.availableRAM}GB free, ${status.swapUsedPercent}% swap used - Sessions may be unstable`;
      logDebug('Memory status: CRITICAL', status);
    } else if (availableRAM < MemoryMonitorService.WARNING_RAM_THRESHOLD_GB || 
               swapUsedPercent > MemoryMonitorService.WARNING_SWAP_THRESHOLD) {
      status.severity = 'warning';
      status.message = `Low Memory: ${status.availableRAM}GB free, ${status.swapUsedPercent}% swap used`;
      logDebug('Memory status: WARNING', status);
    } else {
      logDebug('Memory status: OK', status);
    }

    logDebug('Memory status', status);
    return status;
  }
}
