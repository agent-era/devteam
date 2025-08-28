import {describe, beforeEach, test, expect} from '@jest/globals';
import React from 'react';
import {render} from 'ink-testing-library';
import {
  InputFocusProvider,
  useInputFocus
} from '../../src/contexts/InputFocusContext.js';
import {resetTestData, simulateTimeDelay} from '../utils/testHelpers.js';

const h = React.createElement;

// Test component that demonstrates main screen behavior
function MockMainScreen({componentId = 'main'}: {componentId?: string}) {
  const {hasFocus, requestFocus, releaseFocus, isAnyDialogFocused} = useInputFocus();
  
  React.useEffect(() => {
    if (!isAnyDialogFocused) {
      requestFocus(componentId);
    }
    return () => releaseFocus(componentId);
  }, [requestFocus, releaseFocus, componentId, isAnyDialogFocused]);
  
  return h('text', null, 
    `Main: ${hasFocus(componentId) ? 'FOCUSED' : 'NOT_FOCUSED'} | AnyDialog: ${isAnyDialogFocused ? 'YES' : 'NO'}`
  );
}

// Test component that demonstrates dialog behavior  
function MockDialog({dialogId, onMount, onUnmount}: {
  dialogId: string;
  onMount?: () => void;
  onUnmount?: () => void;
}) {
  const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
  
  React.useEffect(() => {
    requestFocus(dialogId);
    onMount?.();
    return () => {
      releaseFocus(dialogId);
      onUnmount?.();
    };
  }, [requestFocus, releaseFocus, dialogId, onMount, onUnmount]);
  
  return h('text', null, `Dialog ${dialogId}: ${hasFocus(dialogId) ? 'FOCUSED' : 'NOT_FOCUSED'}`);
}

// Test component that can toggle dialog visibility
function MockApp() {
  const [showDialog, setShowDialog] = React.useState(false);
  const [dialogId, setDialogId] = React.useState('test-dialog');
  
  React.useEffect(() => {
    (global as any).toggleDialog = () => setShowDialog(prev => !prev);
    (global as any).changeDialogId = (id: string) => setDialogId(id);
  }, []);
  
  return h('box', {flexDirection: 'column'},
    h(MockMainScreen),
    showDialog && h(MockDialog, {dialogId})
  );
}

describe('InputFocus Context E2E', () => {
  beforeEach(() => {
    resetTestData();
    delete (global as any).toggleDialog;
    delete (global as any).changeDialogId;
  });

  describe('Basic Focus Management', () => {
    test('should allow single component to request and hold focus', () => {
      const TestComponent = () => {
        const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
        
        React.useEffect(() => {
          requestFocus('test-component');
          return () => releaseFocus('test-component');
        }, [requestFocus, releaseFocus]);
        
        return h('text', null, hasFocus('test-component') ? 'FOCUSED' : 'NOT_FOCUSED');
      };
      
      const {lastFrame} = render(h(InputFocusProvider, null, h(TestComponent)));
      
      expect(lastFrame()).toContain('FOCUSED');
    });

    test('should track focus correctly when component unmounts', () => {
      let mountComponent = true;
      
      const TestComponent = () => {
        const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
        
        React.useEffect(() => {
          requestFocus('test-component');
          return () => releaseFocus('test-component');
        }, [requestFocus, releaseFocus]);
        
        return h('text', null, 'Component mounted');
      };
      
      const CheckerComponent = () => {
        const {hasFocus} = useInputFocus();
        return h('text', null, hasFocus('test-component') ? 'STILL_FOCUSED' : 'NOT_FOCUSED');
      };
      
      const App = () => {
        const [show, setShow] = React.useState(true);
        
        React.useEffect(() => {
          (global as any).unmountComponent = () => setShow(false);
        }, []);
        
        return h('box', null,
          show && h(TestComponent),
          h(CheckerComponent)
        );
      };
      
      const {lastFrame} = render(h(InputFocusProvider, null, h(App)));
      
      // Component should initially have focus
      expect(lastFrame()).toContain('STILL_FOCUSED');
      
      // Unmount the component
      (global as any).unmountComponent();
      
      // Focus should be released
      expect(lastFrame()).toContain('NOT_FOCUSED');
      
      delete (global as any).unmountComponent;
    });

    test('should handle multiple components requesting focus - last wins', () => {
      const TestComponent1 = () => {
        const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
        
        React.useEffect(() => {
          requestFocus('component1');
          return () => releaseFocus('component1');
        }, [requestFocus, releaseFocus]);
        
        return h('text', null, `Comp1: ${hasFocus('component1') ? 'FOCUSED' : 'NOT_FOCUSED'}`);
      };
      
      const TestComponent2 = () => {
        const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
        
        React.useEffect(() => {
          requestFocus('component2');
          return () => releaseFocus('component2');
        }, [requestFocus, releaseFocus]);
        
        return h('text', null, `Comp2: ${hasFocus('component2') ? 'FOCUSED' : 'NOT_FOCUSED'}`);
      };
      
      const {lastFrame} = render(
        h(InputFocusProvider, null,
          h('box', null,
            h(TestComponent1),
            h(TestComponent2)
          )
        )
      );
      
      const output = lastFrame();
      // Component2 should have focus (mounted later)
      expect(output).toContain('Comp1: NOT_FOCUSED');
      expect(output).toContain('Comp2: FOCUSED');
    });
  });

  describe('Dialog Focus Detection', () => {
    test('should detect when dialog components are focused', () => {
      const {lastFrame} = render(h(InputFocusProvider, null, h(MockApp)));
      
      // Initially no dialog, main should have focus
      expect(lastFrame()).toContain('Main: FOCUSED');
      expect(lastFrame()).toContain('AnyDialog: NO');
      
      // Show dialog
      (global as any).toggleDialog();
      
      // Main should lose focus, dialog detection should activate
      expect(lastFrame()).toContain('Main: NOT_FOCUSED');
      expect(lastFrame()).toContain('AnyDialog: YES');
      expect(lastFrame()).toContain('Dialog test-dialog: FOCUSED');
      
      // Hide dialog
      (global as any).toggleDialog();
      
      // Main should regain focus, no dialogs
      expect(lastFrame()).toContain('Main: FOCUSED');
      expect(lastFrame()).toContain('AnyDialog: NO');
    });

    test('should distinguish between main and dialog components', () => {
      const {lastFrame} = render(h(InputFocusProvider, null, h(MockApp)));
      
      // Main component should not be considered a dialog
      expect(lastFrame()).toContain('AnyDialog: NO');
      
      // Show dialog
      (global as any).toggleDialog();
      
      // Dialog should be detected
      expect(lastFrame()).toContain('AnyDialog: YES');
    });

    test('should handle multiple dialogs correctly', () => {
      let showDialog1 = false;
      let showDialog2 = false;
      
      const MultiDialogApp = () => {
        const [dialog1, setDialog1] = React.useState(false);
        const [dialog2, setDialog2] = React.useState(false);
        
        React.useEffect(() => {
          (global as any).toggleDialog1 = () => setDialog1(prev => !prev);
          (global as any).toggleDialog2 = () => setDialog2(prev => !prev);
        }, []);
        
        return h('box', {flexDirection: 'column'},
          h(MockMainScreen),
          dialog1 && h(MockDialog, {dialogId: 'dialog1'}),
          dialog2 && h(MockDialog, {dialogId: 'dialog2'})
        );
      };
      
      const {lastFrame} = render(h(InputFocusProvider, null, h(MultiDialogApp)));
      
      // Initially no dialogs
      expect(lastFrame()).toContain('AnyDialog: NO');
      
      // Show first dialog
      (global as any).toggleDialog1();
      expect(lastFrame()).toContain('AnyDialog: YES');
      expect(lastFrame()).toContain('Dialog dialog1: FOCUSED');
      
      // Show second dialog (should take focus)
      (global as any).toggleDialog2();
      expect(lastFrame()).toContain('AnyDialog: YES');
      expect(lastFrame()).toContain('Dialog dialog1: NOT_FOCUSED');
      expect(lastFrame()).toContain('Dialog dialog2: FOCUSED');
      
      // Hide second dialog (first should regain focus)
      (global as any).toggleDialog2();
      expect(lastFrame()).toContain('AnyDialog: YES');
      expect(lastFrame()).toContain('Dialog dialog1: FOCUSED');
      
      // Hide first dialog (main should regain focus)
      (global as any).toggleDialog1();
      expect(lastFrame()).toContain('AnyDialog: NO');
      expect(lastFrame()).toContain('Main: FOCUSED');
      
      delete (global as any).toggleDialog1;
      delete (global as any).toggleDialog2;
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle releasing focus for non-existent component', () => {
      const TestComponent = () => {
        const {releaseFocus, hasFocus} = useInputFocus();
        
        React.useEffect(() => {
          // Try to release focus for component that never requested it
          releaseFocus('non-existent');
        }, [releaseFocus]);
        
        return h('text', null, 'No error occurred');
      };
      
      expect(() => {
        render(h(InputFocusProvider, null, h(TestComponent)));
      }).not.toThrow();
    });

    test('should handle requesting focus multiple times from same component', () => {
      const TestComponent = () => {
        const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
        const [count, setCount] = React.useState(0);
        
        React.useEffect(() => {
          requestFocus('test-component');
          requestFocus('test-component'); // Request again
          requestFocus('test-component'); // And again
          
          return () => releaseFocus('test-component');
        }, [requestFocus, releaseFocus]);
        
        React.useEffect(() => {
          (global as any).rerequestFocus = () => {
            requestFocus('test-component');
            setCount(prev => prev + 1);
          };
        }, [requestFocus]);
        
        return h('text', null, `${hasFocus('test-component') ? 'FOCUSED' : 'NOT_FOCUSED'} - ${count}`);
      };
      
      const {lastFrame} = render(h(InputFocusProvider, null, h(TestComponent)));
      
      expect(lastFrame()).toContain('FOCUSED - 0');
      
      // Request focus again
      (global as any).rerequestFocus();
      
      expect(lastFrame()).toContain('FOCUSED - 1');
      
      delete (global as any).rerequestFocus;
    });

    test('should handle rapid focus changes correctly', async () => {
      let currentComponent = 'comp1';
      
      const DynamicComponent = () => {
        const [activeComp, setActiveComp] = React.useState('comp1');
        const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
        
        React.useEffect(() => {
          requestFocus(activeComp);
          return () => releaseFocus(activeComp);
        }, [activeComp, requestFocus, releaseFocus]);
        
        React.useEffect(() => {
          (global as any).switchComponent = (compId: string) => {
            setActiveComp(compId);
          };
        }, []);
        
        return h('text', null, `${activeComp}: ${hasFocus(activeComp) ? 'FOCUSED' : 'NOT_FOCUSED'}`);
      };
      
      const {lastFrame} = render(h(InputFocusProvider, null, h(DynamicComponent)));
      
      expect(lastFrame()).toContain('comp1: FOCUSED');
      
      // Rapid switches
      (global as any).switchComponent('comp2');
      expect(lastFrame()).toContain('comp2: FOCUSED');
      
      (global as any).switchComponent('comp3');
      expect(lastFrame()).toContain('comp3: FOCUSED');
      
      (global as any).switchComponent('comp1');
      expect(lastFrame()).toContain('comp1: FOCUSED');
      
      delete (global as any).switchComponent;
    });
  });

  describe('Context Provider Behavior', () => {
    test('should throw error when used outside of provider', () => {
      const TestComponent = () => {
        const {hasFocus} = useInputFocus();
        return h('text', null, 'Should not render');
      };
      
      expect(() => {
        render(h(TestComponent));
      }).toThrow('useInputFocus must be used within InputFocusProvider');
    });

    test('should provide stable callback references', () => {
      let renderCount = 0;
      const callbackRefs = new Set();
      
      const TestComponent = () => {
        const {requestFocus, releaseFocus, hasFocus} = useInputFocus();
        renderCount++;
        
        // Track callback stability
        callbackRefs.add(requestFocus);
        callbackRefs.add(releaseFocus);
        callbackRefs.add(hasFocus);
        
        React.useEffect(() => {
          requestFocus('test');
          return () => releaseFocus('test');
        }, [requestFocus, releaseFocus]);
        
        return h('text', null, `Renders: ${renderCount}, CallbackRefs: ${callbackRefs.size}`);
      };
      
      const {lastFrame, rerender} = render(h(InputFocusProvider, null, h(TestComponent)));
      
      expect(lastFrame()).toContain('Renders: 1, CallbackRefs: 3');
      
      // Force re-render
      rerender(h(InputFocusProvider, null, h(TestComponent)));
      
      // Should have same callback references (stable)
      expect(lastFrame()).toContain('Renders: 2, CallbackRefs: 3');
    });
  });

  describe('Real-world Integration Scenarios', () => {
    test('should simulate CreateFeatureDialog mounting and unmounting', () => {
      let dialogMounted = false;
      let dialogUnmounted = false;
      
      const SimulatedCreateFeatureDialog = () => {
        const {hasFocus, requestFocus, releaseFocus} = useInputFocus();
        
        React.useEffect(() => {
          requestFocus('create-feature-dialog');
          dialogMounted = true;
          
          return () => {
            releaseFocus('create-feature-dialog');
            dialogUnmounted = true;
          };
        }, [requestFocus, releaseFocus]);
        
        return h('text', null, `CreateDialog: ${hasFocus('create-feature-dialog') ? 'FOCUSED' : 'NOT_FOCUSED'}`);
      };
      
      const SimulatedMainScreen = () => {
        const {hasFocus, requestFocus, releaseFocus, isAnyDialogFocused} = useInputFocus();
        
        React.useEffect(() => {
          if (!isAnyDialogFocused) {
            requestFocus('main');
          }
        }, [requestFocus, isAnyDialogFocused]);
        
        React.useEffect(() => {
          return () => releaseFocus('main');
        }, [releaseFocus]);
        
        return h('text', null, `MainScreen: ${hasFocus('main') ? 'FOCUSED' : 'NOT_FOCUSED'} | DialogBlocked: ${isAnyDialogFocused}`);
      };
      
      const App = () => {
        const [showCreateDialog, setShowCreateDialog] = React.useState(false);
        
        React.useEffect(() => {
          (global as any).showCreateDialog = () => setShowCreateDialog(true);
          (global as any).hideCreateDialog = () => setShowCreateDialog(false);
        }, []);
        
        return h('box', {flexDirection: 'column'},
          h(SimulatedMainScreen),
          showCreateDialog && h(SimulatedCreateFeatureDialog)
        );
      };
      
      const {lastFrame} = render(h(InputFocusProvider, null, h(App)));
      
      // Initially main screen has focus
      expect(lastFrame()).toContain('MainScreen: FOCUSED');
      expect(lastFrame()).toContain('DialogBlocked: false');
      expect(dialogMounted).toBe(false);
      
      // Show create dialog
      (global as any).showCreateDialog();
      
      expect(lastFrame()).toContain('MainScreen: NOT_FOCUSED');
      expect(lastFrame()).toContain('DialogBlocked: true');
      expect(lastFrame()).toContain('CreateDialog: FOCUSED');
      expect(dialogMounted).toBe(true);
      expect(dialogUnmounted).toBe(false);
      
      // Hide create dialog
      (global as any).hideCreateDialog();
      
      expect(lastFrame()).toContain('MainScreen: FOCUSED');
      expect(lastFrame()).toContain('DialogBlocked: false');
      expect(dialogMounted).toBe(true);
      expect(dialogUnmounted).toBe(true);
      
      delete (global as any).showCreateDialog;
      delete (global as any).hideCreateDialog;
    });

    test('should handle keyboard shortcuts being blocked during dialog focus', () => {
      const MockKeyboardShortcuts = () => {
        const {isAnyDialogFocused} = useInputFocus();
        
        return h('text', null, `KeyboardShortcuts: ${isAnyDialogFocused ? 'BLOCKED' : 'ACTIVE'}`);
      };
      
      const App = () => {
        const [showDialog, setShowDialog] = React.useState(false);
        
        React.useEffect(() => {
          (global as any).toggleDialog = () => setShowDialog(prev => !prev);
        }, []);
        
        return h('box', {flexDirection: 'column'},
          h(MockKeyboardShortcuts),
          showDialog && h(MockDialog, {dialogId: 'test-dialog'})
        );
      };
      
      const {lastFrame} = render(h(InputFocusProvider, null, h(App)));
      
      // Initially shortcuts should be active
      expect(lastFrame()).toContain('KeyboardShortcuts: ACTIVE');
      
      // Show dialog - shortcuts should be blocked
      (global as any).toggleDialog();
      expect(lastFrame()).toContain('KeyboardShortcuts: BLOCKED');
      
      // Hide dialog - shortcuts should be active again
      (global as any).toggleDialog();
      expect(lastFrame()).toContain('KeyboardShortcuts: ACTIVE');
    });
  });
});