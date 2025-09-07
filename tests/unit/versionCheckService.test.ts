import {VersionCheckService} from '../../src/services/VersionCheckService.js';

describe('VersionCheckService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch as any;

  beforeEach(() => {
    process.env = {...originalEnv};
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns update with whatsNew from CHANGELOG first bullet', async () => {
    delete (process.env as any).npm_package_version;
    process.env.DEVTEAM_VERSION = '0.1.0';

    const changelog = [
      '## 0.2.0 - 2025-09-08',
      '- Add version update banner; fetches notes from CHANGELOG via unpkg',
      '- Another line',
      '',
    ].join('\n');

    global.fetch = jest.fn(async (url: any) => {
      const href = String(url);
      if (href.includes('registry.npmjs.org')) {
        return {
          ok: true,
          json: async () => ({
            'dist-tags': {latest: '0.2.0'}
          })
        } as any;
      }
      if (href.includes('unpkg.com')) {
        return {
          ok: true,
          text: async () => changelog
        } as any;
      }
      throw new Error('unexpected url ' + href);
    }) as any;

    const svc = new VersionCheckService('@agent-era/devteam');
    const info = await svc.check();
    expect(info).toBeTruthy();
    expect(info!.hasUpdate).toBe(true);
    expect(info!.current).toBe('0.1.0');
    expect(info!.latest).toBe('0.2.0');
    expect(info!.whatsNew).toMatch(/version update banner/);
  });

  test('no whatsNew when CHANGELOG missing, still marks update', async () => {
    delete (process.env as any).npm_package_version;
    process.env.DEVTEAM_VERSION = '1.0.0';

    global.fetch = jest.fn(async (url: any) => {
      const href = String(url);
      if (href.includes('registry.npmjs.org')) {
        return {
          ok: true,
          json: async () => ({ 'dist-tags': {latest: '1.1.0'} })
        } as any;
      }
      if (href.includes('unpkg.com')) {
        return { ok: false } as any; // simulate missing changelog
      }
      throw new Error('unexpected url ' + href);
    }) as any;

    const svc = new VersionCheckService('@agent-era/devteam');
    const info = await svc.check();
    expect(info).toBeTruthy();
    expect(info!.hasUpdate).toBe(true);
    expect(info!.whatsNew).toBeUndefined();
  });

  test('no update when versions are equal', async () => {
    delete (process.env as any).npm_package_version;
    process.env.DEVTEAM_VERSION = '2.0.0';

    global.fetch = jest.fn(async (url: any) => {
      const href = String(url);
      if (href.includes('registry.npmjs.org')) {
        return {
          ok: true,
          json: async () => ({ 'dist-tags': {latest: '2.0.0'} })
        } as any;
      }
      if (href.includes('unpkg.com')) {
        return { ok: true, text: async () => '## 2.0.0\n- Entry' } as any;
      }
      throw new Error('unexpected url ' + href);
    }) as any;

    const svc = new VersionCheckService('@agent-era/devteam');
    const info = await svc.check();
    expect(info).toBeTruthy();
    expect(info!.hasUpdate).toBe(false);
    expect(info!.latest).toBe('2.0.0');
  });
});
