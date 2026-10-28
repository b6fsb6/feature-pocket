# stick-timing-trainer
Drum Practice Pad Timing Trainer

## Tests

`npm install`, `npx playwright install chromium`, then `npm test`. The core and library checks need only Node and run in a second; the browser tests take about a minute. GitHub Actions runs all of them on every push (`.github/workflows/test.yml`). The tests read `index.html` and `routines/*.txt` as they are, and use no book content.
