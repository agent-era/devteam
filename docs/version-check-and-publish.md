# Version Update Banner and Publishing Guide

This app shows a brief update notice when a newer version is available on npm, including a short “what’s new” message for quick context.

## How It Works

- Source package: The app checks npm for `@agent-era/devteam` (see `src/constants.ts: PACKAGE_NAME`).
- When it runs: On startup and every 24 hours (see `VERSION_CHECK_INTERVAL`).
- Current version: Read from the app’s `package.json` at runtime.
- Latest version: From `https://registry.npmjs.org/@agent-era/devteam` (`dist-tags.latest`).
- What’s new message: The first bullet/line under the newest section in `CHANGELOG.md` fetched from unpkg: `https://unpkg.com/@agent-era/devteam@<latest>/CHANGELOG.md`. No fallbacks are used.


## Authoring “What’s New”

For a clear, one-line summary:
- Maintain `CHANGELOG.md` using “Keep a Changelog” style with a heading per release.
- Put a concise first bullet under each release heading. Aim for ~90 characters.
- Example:

```
## 0.2.0 - 2025-09-07
- Add version update banner; fetches notes from CHANGELOG via unpkg

## 0.1.1 - 2025-08-31
- Improve memory warning thresholds on Linux
```

Ensure `CHANGELOG.md` is included in the published package (do not exclude it via `.npmignore`, or explicitly list it under `files` in `package.json`).

If `CHANGELOG.md` is not present, the app falls back to the npm package description.

## Publishing So Clients See Updates

The update banner looks for the latest version of `@agent-era/devteam` on npm. To publish a new version:

1. Update `CHANGELOG.md` with a new release section and a concise first bullet.
2. Bump the version in `package.json`:
   - `npm version <patch|minor|major>`
3. Publish the package under the public scope:
   - `npm publish --access public`

Notes:
- The publishing branch (see `feature/npm-publish` in git history) sets up a scoped package, README, and publish config. If you’re publishing from this repo, align `package.json` fields with that branch (name, files, bin, prepublish) when preparing a release to `@agent-era/devteam`.
- Verify that `CHANGELOG.md` is included in the package tarball (`npm pack`), so the app can fetch it from unpkg.

## Verifying The Release

- Check npm dist-tag:
  - `curl -s https://registry.npmjs.org/@agent-era%2Fdevteam | jq '."dist-tags".latest'`
- Check changelog availability over unpkg:
  - `curl -I https://unpkg.com/@agent-era/devteam@<latest>/CHANGELOG.md`
- Run the app and confirm the banner shows: `⬆ Update available: vX → vY — <what’s new>`

## Customizing (optional)

- Change the checked package name or check cadence in code if needed.
