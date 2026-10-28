/* End-to-end checks in a real browser. The app is served from memory with a small hook added, so a test can
   feed it hits at exact times instead of playing. Nothing is changed on disk. */
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { ROOT, html } = require('./helpers');

const page = html.replace('let heardTimer=0;', 'window.__T={hit:handleHit,run:()=>run,S:()=>S};let heardTimer=0;');
assert.ok(page !== html, 'the test hook did not attach: has handleHit moved?');

let server, base, browser;
test.before(async () => {
  server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/' || u === '/index.html') { res.setHeader('content-type', 'text/html'); return res.end(page); }
    const f = path.join(ROOT, u);
    if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) return res.end(fs.readFileSync(f));
    res.statusCode = 404; res.end();
  });
  await new Promise(r => server.listen(0, r));
  base = 'http://localhost:' + server.address().port + '/';
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
});
test.after(async () => { await browser.close(); server.close(); });

/* A fresh browser profile, with settings put in storage before the app starts. */
async function open(settings, size) {
  const ctx = await browser.newContext({ viewport: size || { width: 390, height: 900 } });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  await p.addInitScript(s => {
    if (s && !localStorage.getItem('stick-timing-trainer.v1')) localStorage.setItem('stick-timing-trainer.v1', JSON.stringify({ settings: s, cal: null }));
  }, settings);
  await p.goto(base);
  await p.waitForTimeout(300);
  return p;
}

test('the page starts with no errors and the right title', async () => {
  const p = await open({});
  assert.equal(await p.title(), 'Pocket - your pad practice coach');
  assert.deepEqual(p.errors, []);
  assert.match(await p.textContent('.app'), /Set up/);
  assert.equal(await p.isDisabled('#startBtn'), true);   /* Start waits for mic, Mic check and latency */
});

test('Help opens and the Try it buttons load their exercise', async () => {
  const p = await open({ seeded: true });
  await p.click('#helpBtn').catch(async () => { await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Help').click()); });
  await p.waitForTimeout(300);
  const tries = await p.evaluate(() => document.querySelectorAll('[data-try]').length);
  assert.ok(tries >= 5, 'Try it buttons found: ' + tries);
  assert.deepEqual(p.errors, []);
});

/* Plays a routine by calling the hit handler with times relative to the run. */
async function playScenario(text, bpm, spec) {
  const p = await open({ input: 'kb', bpm, routineText: text, seeded: true });
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /^Start/.test(b.textContent.trim()) && b.offsetParent).click());
  await p.waitForFunction(() => window.__T.run() && window.__T.run().plan, null, { timeout: 8000 });
  await p.evaluate(spec => {
    const T = window.__T, r = T.run(), pl = r.plan;
    pl.slots.forEach((s, i) => {
      const note = pl.segs[s.seg].notes[s.pos], hand = note.slice(-1), other = hand === 'R' ? 'L' : 'R';
      const hit = (t, h) => T.hit({ t: r.t0 + t, kb: true, f: null, det: { hand: h, conf: 1 } });
      if (s.gr) (spec.pre || []).forEach(d => hit(s.t - d, other));
      if (spec.stray === i && !s.gr) hit(s.t - 0.04, other);
      hit(s.t + 0.005, hand);
    });
  }, spec);
  await p.waitForFunction(() => window.__T.run().ended, null, { timeout: 40000 });
  const r = await p.evaluate(() => { const r = window.__T.run(); return { slots: r.slots, miss: r.miss, within: r.within, extras: r.extras }; });
  assert.deepEqual(p.errors, []);
  return r;
}

test('flam grace notes are not extras, and the main stroke is scored', async () => {
  const r = await playScenario('8 fR fL R L x2', 120, { pre: [0.03] });
  assert.deepEqual(r, { slots: 8, miss: 0, within: 8, extras: 0 });
});

test('drag grace notes at a fast tempo are not extras', async () => {
  const r = await playScenario('16 dR dL R L x2', 120, { pre: [0.1, 0.05] });
  assert.deepEqual(r, { slots: 8, miss: 0, within: 8, extras: 0 });
});

test('a stray hit before a plain stroke is still an extra', async () => {
  const r = await playScenario('8 R L R L x2', 120, { stray: 2 });
  assert.equal(r.extras, 1);
  assert.equal(r.miss, 0);
});

test('saved titles survive a reload, including long single exercises', async () => {
  const p = await open({ seeded: true });
  await p.click('#tabLibrary');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Import').click());
  await p.setInputFiles('#routineFile', path.join(ROOT, 'routines/rudiments.txt'));
  await p.waitForTimeout(600);
  await p.reload();
  await p.waitForTimeout(400);
  await p.click('#tabLibrary');
  await p.waitForTimeout(300);
  const untitled = await p.evaluate(() => [...document.querySelectorAll('#libPage > .hrow .hn')].map(e => e.textContent));
  assert.deepEqual(untitled, [], 'routines that lost their title: ' + untitled.join(' | '));
});

test('builder: flam holds until a stroke, greys the other keys, and writes fR', async () => {
  const p = await open({ seeded: true, routineText: '8 RL' });
  await p.click('#editPlay');
  await p.waitForTimeout(300);
  const off = () => p.evaluate(() => [...document.querySelectorAll('.bkey')].filter(k => k.disabled).map(k => k.dataset.k));
  assert.deepEqual(await off(), []);
  await p.click('.bkey[data-k="flam"]');
  assert.deepEqual((await off()).sort(), ['_', 'back', 'clear', 'group', 'swap']);
  await p.click('.bkey[data-k="drag"]');
  assert.equal(await p.getAttribute('.bkey[data-k=drag]', 'aria-pressed'), 'true');
  await p.click('.bkey[data-k="drag"]');
  assert.deepEqual(await off(), []);
  await p.click('.bkey[data-k="flam"]');
  await p.click('.bkey[data-k="R"]');
  assert.equal(await p.inputValue('#routineText'), '8 RLfR');
  assert.deepEqual(await off(), []);
  assert.deepEqual(p.errors, []);
});

test('editor: Discard puts a saved routine back', async () => {
  const p = await open({ seeded: true, routineText: 'title: Mine\n8 RLRL RLRL' });
  await p.click('#editPlay');
  await p.click('#saveBtn');
  await p.click('.bkey[data-k="flam"]');
  await p.click('.bkey[data-k="R"]');
  assert.equal(await p.textContent('#edState'), 'Unsaved');
  await p.click('#edDiscard');
  assert.equal(await p.textContent('#edDiscard'), 'Discard?');
  await p.click('#edDiscard');
  assert.equal(await p.inputValue('#routineText'), 'title: Mine\n8 RLRL RLRL');
  assert.equal(await p.textContent('#edState'), 'Saved');
});

test('destructive buttons ask twice', async () => {
  const p = await open({ seeded: true });
  await p.click('#tabSettings').catch(() => {});
  const label = await p.evaluate(() => {
    const b = document.getElementById('recClear');
    b.click();
    return b.textContent + '|' + b.classList.contains('arm');
  });
  assert.equal(label, 'Clear all?|true');
});
