# Sheet Cell Editor

A single-page, no-backend Google Sheets cell editor. See README.md for
what it does and how the app itself works.

## Architecture

- The **deployed app** (`index.html`, `css/`, `js/`) is plain static
  files with no build step - ES modules loaded directly by the browser,
  served as-is via GitHub Pages. Keep it that way; don't introduce a
  bundler/transpiler for the app itself.
- `js/main.js` is the DOM-wired entry point/controller: grabs elements,
  wires event listeners, orchestrates loads/saves. It is intentionally
  *not* unit-testable in isolation.
- Genuinely pure logic (no DOM, no network) lives in small standalone
  modules that `main.js` imports: `settings.js`, `metadata.js`,
  `sheetsApi.js`, `auth.js`, `lastPosition.js`, `utils.js`. When adding
  new logic, prefer putting anything pure/testable in one of these (or
  a new module like them) rather than inline in `main.js`.
- `package.json`, `node_modules/`, and the test tooling below are
  **dev-only** - they exist for testing and are never shipped to the
  deployed site.

## Testing policy

**New features and bug fixes must come with tests.** This project has
both layers set up; use whichever fits the change:

- **Unit tests (Vitest, `tests/unit/`)** for anything in the pure
  modules listed above - parsing, formatting, matching, storage
  round-trips, edge cases. Fast, no browser needed. Run:
  ```
  npm test          # single run
  npm run test:watch
  ```
- **E2E tests (Playwright, `tests/e2e/`)** for anything that needs a
  real DOM/browser or spans multiple pieces of `main.js`'s
  orchestration - sign-in flow, save/load error handling, race
  conditions between overlapping async operations, UI state that
  depends on timing. Uses `tests/e2e/fixtures/mockGoogle.js`, which
  mocks both Google Identity Services and the Sheets API so tests never
  touch a real Google account or network - extend that fixture rather
  than hand-rolling new mocks per test. Run:
  ```
  npm run test:e2e
  npm run test:e2e:ui   # interactive/debug mode
  ```
- `npm run test:all` runs both. CI (`.github/workflows/test.yml`) runs
  both on every push/PR to `main` - keep it green.

When you fix a bug, especially a race condition or timing-dependent
one, add a regression test that would have caught it (see
`tests/e2e/field-navigation-race.spec.js` and
`tests/e2e/cell-load-error.spec.js` for examples of tests written
specifically to pin down bugs found in production use). Prefer
deterministic control over timing (manually resolving mocked
responses in a chosen order, as in the race test) over relying on real
delays/`setTimeout` races, which are flaky.

## Before committing a change to `js/*.js` or `index.html`

1. Run `npm test` and `npm run test:e2e` - both must pass.
2. If you touched app behavior, verify it once in a real browser too
   (the project has a habit of spinning up `node tests/e2e/static-server.mjs`
   or a quick Python/Node static server and driving it via the
   claude-in-chrome tools) - tests catch regressions, but a live check
   catches things tests don't cover.
