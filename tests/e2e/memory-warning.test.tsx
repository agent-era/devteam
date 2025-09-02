import {describe, test, expect, beforeEach} from '@jest/globals';
import {renderTestApp} from '../utils/renderApp.js';
import {FakeGitService} from '../fakes/FakeGitService.js';
import {FakeTmuxService} from '../fakes/FakeTmuxService.js';
import {FakeMemoryMonitorService} from '../fakes/FakeMemoryMonitorService.js';
import {setupTestProject, setupTestWorktree, memoryStore, simulateTimeDelay} from '../utils/testHelpers.js';

describe('Memory Warning Display', () => {
  let gitService: FakeGitService;
  let tmuxService: FakeTmuxService;
  let memoryService: FakeMemoryMonitorService;

  beforeEach(() => {
    memoryStore.reset();
    gitService = new FakeGitService();
    tmuxService = new FakeTmuxService();
    memoryService = new FakeMemoryMonitorService();
    
    // Set up a basic project and worktree for testing
    setupTestProject('test-project');
    setupTestWorktree('test-project', 'test-feature');
  });

  test('should not display warning when memory is ok', async () => {
    // Memory service starts with ok status by default
    const {lastFrame} = renderTestApp({
      gitService,
      tmuxService,
      memoryMonitorService: memoryService
    });

    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer) // Allow for initial render
    const output = lastFrame();
    
    // Should not contain warning symbols or messages
    expect(output).not.toContain('⚠');
    expect(output).not.toContain('⛔');
    expect(output).not.toContain('Low Memory');
    expect(output).not.toContain('CRITICAL');
  });

  test('should display warning banner when memory is low', async () => {
    memoryService.setLowMemory(0.8);
    
    const {lastFrame} = renderTestApp({
      gitService,
      tmuxService,
      memoryMonitorService: memoryService
    });

    // Allow time for memory status refresh
    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
    const output = lastFrame();
    
    // Should display warning banner
    expect(output).toContain('⚠');
    expect(output).toContain('Low Memory: 0.8GB free, 85% swap used');
  });

  test('should display critical warning when memory is critically low', async () => {
    memoryService.setCriticalMemory(0.3);
    
    const {lastFrame} = renderTestApp({
      gitService,
      tmuxService,
      memoryMonitorService: memoryService
    });

    // Allow time for memory status refresh
    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
    const output = lastFrame();
    
    // Should display critical warning banner
    expect(output).toContain('⛔');
    expect(output).toContain('CRITICAL: 0.3GB free, 98% swap used - Sessions may crash!');
  });

  test('should update warning when memory status changes', async () => {
    const {lastFrame} = renderTestApp({
      gitService,
      tmuxService,
      memoryMonitorService: memoryService
    });

    // Start with ok status
    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
    let output = lastFrame();
    expect(output).not.toContain('⚠');
    
    // Change to warning status
    memoryService.setLowMemory(0.9);
    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
    output = lastFrame();
    expect(output).toContain('⚠');
    expect(output).toContain('Low Memory');
    
    // Change to critical status
    memoryService.setCriticalMemory(0.4);
    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
    output = lastFrame();
    expect(output).toContain('⛔');
    expect(output).toContain('CRITICAL');
    
    // Back to ok status
    memoryService.resetMemory();
    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
    output = lastFrame();
    expect(output).not.toContain('⚠');
    expect(output).not.toContain('⛔');
  });

  test('should show warning in various memory conditions', async () => {
    const testCases = [
      {
        name: 'high swap usage',
        status: {
          availableRAM: 2.0,
          usedRAM: 6.0,
          totalRAM: 8.0,
          swapUsedPercent: 90,
          severity: 'warning' as const,
          message: 'High swap usage: 90% swap used'
        },
        expectedSymbol: '⚠',
        expectedText: 'High swap usage'
      },
      {
        name: 'critical swap usage',
        status: {
          availableRAM: 1.5,
          usedRAM: 6.5,
          totalRAM: 8.0,
          swapUsedPercent: 99,
          severity: 'critical' as const,
          message: 'CRITICAL: 99% swap used - System may become unresponsive!'
        },
        expectedSymbol: '⛔',
        expectedText: 'CRITICAL: 99% swap used'
      }
    ];

    for (const testCase of testCases) {
      memoryService.setMemoryStatus(testCase.status);
      
      const {lastFrame} = renderTestApp({
        gitService,
        tmuxService,
        memoryMonitorService: memoryService
      });

      await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
      const output = lastFrame();
      
      expect(output).toContain(testCase.expectedSymbol);
      expect(output).toContain(testCase.expectedText);
    }
  });

  test('should not interfere with other UI elements', async () => {
    memoryService.setLowMemory(0.7);
    
    const {lastFrame} = renderTestApp({
      gitService,
      tmuxService,
      memoryMonitorService: memoryService
    });

    await simulateTimeDelay(6000); // Wait for memory refresh interval (5s + buffer)
    const output = lastFrame();
    
    // Should still show main UI elements along with warning
    expect(output).toContain('⚠'); // Memory warning
    expect(output).toContain('Enter attach, n new'); // Main header
    expect(output).toContain('test-project'); // Project name
    expect(output).toContain('test-feature'); // Feature name
  });
});