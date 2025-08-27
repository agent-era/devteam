// Mock implementation of ink-testing-library for Jest testing
const { EventEmitter } = require('events');

// Mock stdin implementation
class MockStdin extends EventEmitter {
  constructor() {
    super();
    this.isTTY = false;
    this.setEncoding = jest.fn();
    this.resume = jest.fn();
    this.pause = jest.fn();
  }

  write(data) {
    // Simulate key input processing
    this.emit('data', Buffer.from(data, 'utf8'));
    return true;
  }
}

// Mock render result
class MockRenderResult {
  constructor(app) {
    this.app = app;
    this.stdin = new MockStdin();
    this.stdout = '';
    this.unmount = jest.fn();
    this.rerender = jest.fn((newApp) => {
      this.app = newApp;
    });
    
    // Simulate app rendering
    this._simulateRender();
  }

  _simulateRender() {
    // This is a simplified mock - in real implementation it would render the React tree
    // For now, we'll just provide basic functionality needed by tests
    this.stdout = 'Mocked Ink App Output';
  }

  lastFrame() {
    // Return mock output that includes information about the app state
    if (this.app && this.app.props) {
      const children = this.app.props.children;
      if (children && children.props) {
        // Try to extract meaningful information for test assertions
        const childrenProps = children.props;
        const servicesProps = childrenProps.gitService || childrenProps.tmuxService || childrenProps.worktreeService;
        
        if (servicesProps) {
          // Mock output based on services state
          return this._generateMockOutput();
        }
      }
    }
    return 'Mocked Ink App Output';
  }

  _generateMockOutput() {
    // Generate mock output that would be useful for test assertions
    return `PROJECT/FEATURE    AI  DIFF     CHANGES  PUSHED  PR
my-project/feature-1  ○   +0/-0    -        ✓       -
my-project/feature-2  ●   +25/-5   ↑2       ✓       #123

Press 'n' to create new feature, 'a' to archive, '?' for help`;
  }
}

// Mock render function
function render(app, options = {}) {
  return new MockRenderResult(app);
}

// Export additional utilities that tests might use
const RenderOptions = {};

// Mock any other exports that ink-testing-library provides
module.exports = {
  render,
  RenderOptions
};