/* Every hosted library must read without errors, and every routine in it must be playable. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { loadCore, ROOT, read, plain } = require('./helpers');
const c = loadCore(['parseRoutine', 'resolveExercises', 'buildPlan']);

const dir = path.join(ROOT, 'routines');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
  test('routines/' + f, () => {
    const sections = read('routines/' + f).split(/^[-—–]{3,}\s*$/m).slice(1);
    assert.ok(sections.length > 0, 'no routines found');
    const titles = new Set();
    sections.forEach((s, i) => {
      const title = ((/^\s*title\s*:\s*(.*)$/mi.exec(s) || [])[1] || '').trim();
      assert.ok(title, 'routine ' + (i + 1) + ' has no title');
      assert.ok(!titles.has(title), 'duplicate title: ' + title);
      titles.add(title);
      const p = c.parseRoutine(s);
      assert.deepEqual(plain(p.errors), [], title);
      assert.ok(p.exercises.length > 0, title + ' has no exercises');
      const ex = c.resolveExercises(p.exercises, { unit: 'pass', v: 1 }, { bpm: 60, subdiv: 4 });
      const pl = c.buildPlan(ex, { gapBeats: 0, clickMode: 'strokes', dyn: null });
      assert.ok(pl.slots.length > 0, title + ' plays no strokes');
    });
  });
}
