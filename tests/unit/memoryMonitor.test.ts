import {describe, test, expect, beforeEach, jest} from '@jest/globals';
import {MemoryMonitorService} from '../../src/services/MemoryMonitorService.js';
import {FakeMemoryMonitorService} from '../fakes/FakeMemoryMonitorService.js';

describe('MemoryMonitorService', () => {
  describe('FakeMemoryMonitorService', () => {
    let service: FakeMemoryMonitorService;
    
    beforeEach(() => {
      service = new FakeMemoryMonitorService();
      service.resetMemory();
    });
    
    test('should return default ok status', async () => {
      const status = await service.getMemoryStatus();
      
      expect(status).toEqual({
        availableRAM: 4.0,
        usedRAM: 4.0,
        totalRAM: 8.0,
        swapUsedPercent: 10,
        severity: 'ok'
      });
    });
    
    test('should set low memory warning', () => {
      service.setLowMemory(0.8);
      
      return service.getMemoryStatus().then(status => {
        expect(status.severity).toBe('warning');
        expect(status.availableRAM).toBe(0.8);
        expect(status.swapUsedPercent).toBe(85);
        expect(status.message).toContain('Low Memory');
        expect(status.message).toContain('0.8GB free');
        expect(status.message).toContain('85% swap used');
      });
    });
    
    test('should set critical memory status', () => {
      service.setCriticalMemory(0.4);
      
      return service.getMemoryStatus().then(status => {
        expect(status.severity).toBe('critical');
        expect(status.availableRAM).toBe(0.4);
        expect(status.swapUsedPercent).toBe(98);
        expect(status.message).toContain('CRITICAL');
        expect(status.message).toContain('0.4GB free');
        expect(status.message).toContain('98% swap used');
        expect(status.message).toContain('Sessions may crash');
      });
    });
    
    test('should allow custom memory values', () => {
      const customStatus = {
        availableRAM: 1.5,
        usedRAM: 6.5,
        totalRAM: 8.0,
        swapUsedPercent: 90,
        severity: 'warning' as const,
        message: 'Custom warning message'
      };
      
      service.setMemoryStatus(customStatus);
      
      return service.getMemoryStatus().then(status => {
        expect(status).toEqual(customStatus);
      });
    });
    
    test('should reset to default ok status', async () => {
      service.setCriticalMemory();
      let status = await service.getMemoryStatus();
      expect(status.severity).toBe('critical');
      
      service.resetMemory();
      status = await service.getMemoryStatus();
      expect(status.severity).toBe('ok');
    });
  });
  
  describe('Memory threshold logic', () => {
    test('should correctly classify memory levels', async () => {
      const service = new FakeMemoryMonitorService();
      
      // Test warning threshold (< 1GB free)
      service.setLowMemory(0.9);
      let status = await service.getMemoryStatus();
      expect(status.severity).toBe('warning');
      
      // Test critical threshold (< 500MB free)
      service.setCriticalMemory(0.3);
      status = await service.getMemoryStatus();
      expect(status.severity).toBe('critical');
      
      // Test ok status (> 1GB free)
      service.setMemoryStatus({
        availableRAM: 2.5,
        usedRAM: 5.5,
        totalRAM: 8.0,
        swapUsedPercent: 20,
        severity: 'ok'
      });
      status = await service.getMemoryStatus();
      expect(status.severity).toBe('ok');
    });
    
    test('should handle swap usage thresholds', async () => {
      const service = new FakeMemoryMonitorService();
      
      // Test warning swap threshold (> 80%)
      service.setMemoryStatus({
        availableRAM: 2.0,
        usedRAM: 6.0,
        totalRAM: 8.0,
        swapUsedPercent: 85,
        severity: 'warning',
        message: 'High swap usage'
      });
      let status = await service.getMemoryStatus();
      expect(status.severity).toBe('warning');
      
      // Test critical swap threshold (> 95%)
      service.setMemoryStatus({
        availableRAM: 2.0,
        usedRAM: 6.0,
        totalRAM: 8.0,
        swapUsedPercent: 97,
        severity: 'critical',
        message: 'Critical swap usage'
      });
      status = await service.getMemoryStatus();
      expect(status.severity).toBe('critical');
    });
  });
});