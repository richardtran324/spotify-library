#!/usr/bin/env node
// Runs every suite in tests/suites/*/test.js and prints one summary.
// Usage: node tests/run.js [suite names...] [--src path/to/index.html] [--verbose] [--jobs N]
// A suite passes when it prints at least one PASS line, no FAIL or ERROR line, and exits 0.
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;

var args = process.argv.slice(2);
var verbose = false, src = null, jobs = Math.max(2, Math.min(os.cpus().length, 8)), only = [];
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--verbose' || args[i] === '-v') verbose = true;
  else if (args[i] === '--src') { if (!args[i + 1]) { console.error('--src needs a path'); process.exit(2); } src = path.resolve(args[++i]); }
  else if (args[i] === '--jobs') jobs = Math.max(1, parseInt(args[++i], 10) || 1);
  else only.push(args[i]);
}
var root = path.resolve(__dirname, '..');
src = src || path.join(root, 'index.html');
var suitesDir = path.join(__dirname, 'suites');
var TIMEOUT_MS = 10 * 60 * 1000;

var suites = fs.readdirSync(suitesDir).filter(function (n) {
  return fs.existsSync(path.join(suitesDir, n, 'test.js')) && (!only.length || only.indexOf(n) >= 0);
}).sort();
if (!suites.length) { console.error('No suites found' + (only.length ? ' named ' + only.join(', ') : '') + '.'); process.exit(2); }
var unknown = only.filter(function (n) { return suites.indexOf(n) < 0; });
if (unknown.length) { console.error('Unknown suite: ' + unknown.join(', ')); process.exit(2); }

function runOne(name) {
  return new Promise(function (resolve) {
    var dir = path.join(suitesDir, name);
    var started = Date.now();
    var out = '';
    var child = spawn(process.execPath, ['test.js', src], { cwd: dir, env: Object.assign({}, process.env, { SRC: src }) });
    var timer = setTimeout(function () { out += '\nERROR suite timed out after ' + (TIMEOUT_MS / 1000) + ' s'; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.stdout.on('data', function (d) { out += d; });
    child.stderr.on('data', function (d) { out += d; });
    child.on('close', function (code) {
      clearTimeout(timer);
      var lines = out.split('\n');
      var pass = lines.filter(function (l) { return /^PASS\b/.test(l); }).length;
      var failLines = lines.filter(function (l) { return /^(FAIL|ERROR)\b/.test(l); });
      var fail = failLines.length;
      if (!fail && code !== 0) { fail = 1; failLines = ['ERROR exited with code ' + code + ': ' + lines.filter(Boolean).slice(-3).join(' / ')]; }
      if (!fail && !pass) { fail = 1; failLines = ['ERROR no PASS lines printed']; }
      resolve({ name: name, pass: pass, fail: fail, failLines: failLines, ms: Date.now() - started, out: out });
    });
  });
}

var queue = suites.slice(), results = [], running = 0;
function next(done) {
  while (running < jobs && queue.length) {
    var name = queue.shift(); running++;
    runOne(name).then(function (r) {
      results.push(r); running--;
      process.stdout.write((r.fail ? 'FAIL ' : 'ok   ') + r.name + ' (' + r.pass + '/' + (r.pass + r.fail) + ')\n');
      next(done);
    });
  }
  if (!queue.length && !running) done();
}

console.log('Testing ' + path.relative(process.cwd(), src) + ' with ' + suites.length + ' suites, ' + jobs + ' at a time\n');
var t0 = Date.now();
next(function () {
  results.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  var w = Math.max.apply(null, results.map(function (r) { return r.name.length; }).concat([5]));
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  console.log('\n' + pad('Suite', w) + '  Passed  Failed   Time');
  var tp = 0, tf = 0;
  results.forEach(function (r) {
    tp += r.pass; tf += r.fail;
    console.log(pad(r.name, w) + '  ' + pad(r.pass, 6) + '  ' + pad(r.fail, 6) + '  ' + (r.ms / 1000).toFixed(1) + 's');
  });
  console.log(pad('Total', w) + '  ' + pad(tp, 6) + '  ' + pad(tf, 6) + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  results.forEach(function (r) {
    if (verbose) { console.log('\n--- ' + r.name + '\n' + r.out.trim()); return; }
    if (r.fail) { console.log('\n--- ' + r.name + ' failures'); r.failLines.slice(0, 20).forEach(function (l) { console.log(l.slice(0, 400)); }); if (r.failLines.length > 20) console.log('... ' + (r.failLines.length - 20) + ' more'); }
  });
  var bad = results.filter(function (r) { return r.fail; }).length;
  console.log('\n' + (bad ? bad + ' of ' + results.length + ' suites failed.' : 'All ' + results.length + ' suites passed (' + tp + ' checks).'));
  process.exit(bad ? 1 : 0);
});
