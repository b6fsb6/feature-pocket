# stick-timing-trainer
Drum Practice Pad Timing Trainer

## Tests

`npm install`, `npx playwright install chromium`, then `npm test`. The core and library checks need only Node and run in a second; the browser tests take about a minute. GitHub Actions runs all of them on every push (`.github/workflows/deploy.yml`). On `main`, if they pass, the same workflow publishes `index.html` and `routines/` to GitHub Pages; if they fail, nothing is published and the live site stays as it was. Pages is set to the "GitHub Actions" source. The tests read `index.html` and `routines/*.txt` as they are, and use no book content.
