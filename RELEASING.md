# Releasing

How to cut a new release of `@agent-era/devteam` to npm.

## Prerequisites

- npm login as a publisher on the `@agent-era` scope:
  ```bash
  npm whoami          # should print your npm user
  npm login           # if not logged in
  ```
- 2FA authenticator handy (publish requires `--otp=<code>`).
- Clean working tree on the `release` branch, up to date with `main`.

## Release checklist

1. **Pick the version bump**
   - `patch` — bug fixes only
   - `minor` — new features, no breaking changes
   - `major` — breaking changes

2. **Update `CHANGELOG.md`**
   - Add a new section at the top (above previous releases):
     ```
     ## X.Y.Z - YYYY-MM-DD
     - One concise bullet (~90 chars) — this appears in the in-app update banner
     ```
   - First bullet is fetched from unpkg by `VersionCheckService` and shown as
     "what's new". Keep it short and user-facing.
   - Optional: add grouped sub-sections (`**New features**`, `**Fixes**`, etc.)
     below the first bullet for detail.

3. **Bump `package.json`** (do NOT tag yet — PR first):
   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   ```

4. **Clean install + audit**
   ```bash
   rm -rf node_modules package-lock.json dist dist-tests
   npm install
   ```
   Resolve any `npm audit` warnings before continuing.

5. **Build, typecheck, test**
   ```bash
   npm run build
   npx tsc -p tsconfig.test.json
   npm test
   ```
   All 480+ tests should pass. `dist/bin/devteam.js` must end up executable
   (the `build` script runs `chmod +x` on it).

6. **Dry-run the pack**
   ```bash
   npm pack --dry-run 2>&1 | grep -E "CHANGELOG|bin/devteam"
   ```
   Expect:
   - `CHANGELOG.md` listed
   - `dist/bin/devteam.js` listed (verify exec bit via `npm pack && tar -tzvf *.tgz | grep bin/devteam` — should be `-rwxr-xr-x`)

7. **Commit, push, open PR**
   ```bash
   git checkout -b release/vX.Y.Z
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "release: vX.Y.Z"
   git push -u origin release/vX.Y.Z
   gh pr create --title "release: vX.Y.Z" --body "See CHANGELOG.md"
   ```
   Merge after CI passes.

8. **Publish** (from the merged `main` or `release` branch)
   ```bash
   npm publish --access public --otp=<code>
   ```

9. **Tag and push**
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

10. **Verify**
    ```bash
    curl -s https://registry.npmjs.org/@agent-era%2Fdevteam | jq -r '."dist-tags".latest'
    curl -sI https://unpkg.com/@agent-era/devteam@X.Y.Z/CHANGELOG.md | head -1
    npm i -g @agent-era/devteam
    devteam --help
    ```
    Running `devteam` from any directory should show the correct version in the
    update banner on next check.

## Gotchas (learned the hard way)

- **`CHANGELOG.md` must be in `package.json` `files`** — otherwise it's not in
  the tarball, the app can't fetch it from unpkg, and the update banner has no
  "what's new" message.
- **`dist/bin/devteam.js` needs the exec bit set in the tarball.** npm 9+ does
  not chmod bin scripts during install. The `build` script runs
  `chmod +x dist/bin/devteam.js` after `tsc`. If you change the build, keep
  this step.
- **Current-version detection uses `process.argv[1]`** (the entry bin script),
  then walks up 6 levels looking for `package.json` where `name` matches
  `@agent-era/devteam`. Do not rely on `import.meta.url` — ts-jest compiles to
  CJS and cannot parse it; `Function('return import.meta.url')()` also fails
  at runtime because the created function is not a module.
- **CWD-based version detection is a fallback only.** Running `devteam` from
  a directory that has its own `package.json` (e.g. another project) must
  still report the installed package's version, not the CWD package's.
- **Version bump lives in the PR, publish runs after merge.** Tagging before
  merge is fine; publishing before merge means `main` can drift from what was
  shipped to npm.
