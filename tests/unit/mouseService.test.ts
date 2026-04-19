import {parseMouseEvents} from '../../src/services/MouseService.js';

describe('parseMouseEvents', () => {
  it('parses left button press', () => {
    const events = parseMouseEvents('\x1b[<0;10;5M');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({button: 'left', type: 'press', x: 10, y: 5});
  });

  it('parses left button release', () => {
    const events = parseMouseEvents('\x1b[<0;10;5m');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({button: 'left', type: 'release', x: 10, y: 5});
  });

  it('parses right button press', () => {
    const events = parseMouseEvents('\x1b[<2;1;1M');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({button: 'right', type: 'press'});
  });

  it('parses middle button press', () => {
    const events = parseMouseEvents('\x1b[<1;1;1M');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({button: 'middle', type: 'press'});
  });

  it('parses scroll up', () => {
    const events = parseMouseEvents('\x1b[<64;5;10M');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({button: 'scroll-up', type: 'press', x: 5, y: 10});
  });

  it('parses scroll down', () => {
    const events = parseMouseEvents('\x1b[<65;5;10M');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({button: 'scroll-down', type: 'press'});
  });

  it('parses shift modifier', () => {
    const events = parseMouseEvents('\x1b[<4;1;1M');
    expect(events[0]).toMatchObject({button: 'left', shift: true, alt: false, ctrl: false});
  });

  it('parses alt modifier', () => {
    const events = parseMouseEvents('\x1b[<8;1;1M');
    expect(events[0]).toMatchObject({button: 'left', shift: false, alt: true, ctrl: false});
  });

  it('parses ctrl modifier', () => {
    const events = parseMouseEvents('\x1b[<16;1;1M');
    expect(events[0]).toMatchObject({button: 'left', shift: false, alt: false, ctrl: true});
  });

  it('parses multiple events in one buffer', () => {
    const events = parseMouseEvents('\x1b[<0;1;1M\x1b[<64;5;10M\x1b[<0;1;1m');
    expect(events).toHaveLength(3);
    expect(events[0].button).toBe('left');
    expect(events[1].button).toBe('scroll-up');
    expect(events[2].type).toBe('release');
  });

  it('returns empty array for non-mouse input', () => {
    expect(parseMouseEvents('hello')).toHaveLength(0);
    expect(parseMouseEvents('\x1b[A')).toHaveLength(0); // up arrow
    expect(parseMouseEvents('\r')).toHaveLength(0);
  });

  it('ignores mixed keyboard+mouse data, extracts only mouse events', () => {
    const events = parseMouseEvents('j\x1b[<0;3;7Mk');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({button: 'left', x: 3, y: 7});
  });

  it('handles large coordinates', () => {
    const events = parseMouseEvents('\x1b[<0;220;50M');
    expect(events[0]).toMatchObject({x: 220, y: 50});
  });
});
