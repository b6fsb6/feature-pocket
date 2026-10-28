/* Loads the app's two scripts straight out of index.html, so the tests always run against what ships. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function script(id) {
  const m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(html);
  if (!m) throw new Error('no <script id="' + id + '"> in index.html');
  return m[1];
}

/* The core script is pure logic with no DOM access. names are the functions and classes to hand back. */
function loadCore(names) {
  const ctx = { console, Math };
  vm.createContext(ctx);
  vm.runInContext(script('core') + '\n;' + names.map(n => 'this.' + n + '=' + n + ';').join(''), ctx);
  return ctx;
}

/* Values made inside the vm have their own Array, so tests compare plain copies. */
const plain = x => JSON.parse(JSON.stringify(x));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
module.exports = { ROOT, html, script, loadCore, read, plain };
