# Tests

Simulated browser tests for `index.html`. Each suite loads the page in [jsdom](https://github.com/jsdom/jsdom) with a fake Spotify API (mocked `fetch`) and a fake `localStorage`, then drives it and checks what it shows, stores and sends. Nothing talks to Spotify and no secrets are needed.

## Run them

```
cd tests
npm ci
npm test
```

`npm test` runs every suite in parallel and prints one table with passed and failed checks per suite. It exits with code 1 if any check fails.

Other ways to run:

```
node run.js find-in-list share-link      # only these suites
node run.js --verbose                     # print every check, not just failures
node run.js --src ../some/other/index.html  # test another copy of the page
```

GitHub runs `npm test` on every pull request (`.github/workflows/tests.yml`).

## Layout

- `lib/harness.js` loads the page with test-only changes: it exposes chosen internals on `window.__t` and records toasts. The page file itself is never changed.
- `suites/<name>/harness.js` lists the internals that suite needs.
- `suites/<name>/test.js` is the suite. It prints one `PASS` or `FAIL` line per check and a summary, and exits 1 on any failure.

## Adding a suite

Copy a small suite such as `suites/episode-notes`, change the names in its `harness.js`, and write checks. Every exposed name must exist in `index.html`, or the page will not start in the test.
