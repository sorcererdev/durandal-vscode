import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionLog, logDir, logLine, stamp } from '../../src/actionLog';

test('logDir: DURANDAL_LOG_DIR, else the XDG cache, else ~/.cache; durandal under a cache', () => {
  assert.equal(logDir({ DURANDAL_LOG_DIR: '/tmp/x' }, '/home/u'), '/tmp/x');
  assert.equal(logDir({ XDG_CACHE_HOME: '/c' }, '/home/u'), '/c/durandal');
  assert.equal(logDir({}, '/home/u'), '/home/u/.cache/durandal');
  assert.equal(logDir({ DURANDAL_LOG_DIR: '', XDG_CACHE_HOME: '' }, '/home/u'), '/home/u/.cache/durandal');
});

test('logLine: the event, its fields, then t in UTC to the second', () => {
  const now = new Date(Date.UTC(2026, 10, 6, 21, 5, 9, 123));
  assert.equal(stamp(now), '2026-11-06T21:05:09Z');
  assert.equal(logLine({ event: 'picked', file: 'src/a.py', generator: 'p/command' }, now),
    '{"event":"picked","file":"src/a.py","generator":"p/command","t":"2026-11-06T21:05:09Z"}\n');
  assert.equal(logLine({ event: 'applied', generator: 'g', files: 2 }, now),
    '{"event":"applied","generator":"g","files":2,"t":"2026-11-06T21:05:09Z"}\n');
});

test('ActionLog appends one line per event and makes the directory', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'durandal-log-')), 'a', 'b');
  const log = new ActionLog({ dir: () => dir, enabled: () => true, warn: m => assert.fail(m) });
  log.write({ event: 'hinted', generator: 'g' });
  log.write({ event: 'generate-applied', generator: 'g' });
  const lines = readFileSync(join(dir, 'actions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as { event: string; t: string });
  assert.deepEqual(lines.map(l => l.event), ['hinted', 'generate-applied']);
  assert.match(lines[0].t, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

test('ActionLog off writes nothing', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'durandal-log-')), 'off');
  new ActionLog({ dir: () => dir, enabled: () => false, warn: m => assert.fail(m) }).write({ event: 'hinted', generator: 'g' });
  assert.ok(!existsSync(dir));
});

test('ActionLog is best effort: an unwritable directory warns once and never throws', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'durandal-log-')), 'a-file');
  writeFileSync(file, '');
  const warned: string[] = [];
  const log = new ActionLog({ dir: () => join(file, 'sub'), enabled: () => true, warn: m => warned.push(m) });
  log.write({ event: 'hinted', generator: 'g' });
  log.write({ event: 'hinted', generator: 'h' });
  assert.equal(warned.length, 1);
  assert.match(warned[0], /^the action log could not be written \(.*sub\): /);
});
