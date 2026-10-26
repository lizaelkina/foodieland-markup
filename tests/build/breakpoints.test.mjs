import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {projectRoot} from '../../gulp-tasks/index.mjs';
import {files} from '../../gulp-tasks/io.mjs';
import {readBreakpoints} from '../helpers.mjs';

const MODULE = 'src/js/breakpoints/breakpoints.js';

const failOn = (problems, title) => {
  if (problems.length) assert.fail(`${title}:\n${problems.join('\n')}`);
};

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Returns the result, or the error message when the call throws.
const attempt = (fn, name) => {
  try {
    return fn(name);
  } catch (error) {
    return `throws "${error.message}"`;
  }
};

// The name with the same width, or the nearest one: a hint for a wrong data-swiper-media value.
function hint(value, breakpoints) {
  const width = parseFloat(value.match(/(\d+(?:\.\d+)?)px/)?.[1]);
  if (Number.isNaN(width)) return `use down(name) with one of: ${[...breakpoints.keys()].join(', ')}`;
  const [name, nearest] = [...breakpoints].sort((a, b) => Math.abs(a[1] - width) - Math.abs(b[1] - width))[0];
  return `use down('${name}') = (max-width: ${nearest}px)`;
}

// $breakpoints (CSS), BREAKPOINTS (JS) and data-swiper-media (Pug) must hold the same widths:
// otherwise slider options and layout part on the widths in between.
test('breakpoints in SCSS, JS and data-swiper-media match', async t => {
  const modulePath = path.join(projectRoot, MODULE);
  try {
    await fs.access(modulePath);
  } catch {
    return t.skip(`${MODULE} not found`);
  }
  const scss = readBreakpoints(projectRoot);
  // The module has no imports: loading its source as data: avoids Node's warning about
  // an ES module in a package without "type": "module".
  const js = await import(`data:text/javascript,${encodeURIComponent(await fs.readFile(modulePath, 'utf8'))}`);
  const names = [...scss.keys()];
  const sources = (await files(path.join(projectRoot, 'src'))).map(name => `src/${name}`);
  const read = name => fs.readFile(path.join(projectRoot, name), 'utf8');

  await t.test('$breakpoints and BREAKPOINTS have the same names and values', () => {
    failOn([...new Set([...names, ...Object.keys(js.BREAKPOINTS)])]
      .filter(name => scss.get(name) !== js.BREAKPOINTS[name])
      .map(name => `${name}: $breakpoints ${scss.get(name) ?? 'missing'}, BREAKPOINTS ${js.BREAKPOINTS[name] ?? 'missing'}`),
    `${MODULE} differs from $breakpoints`);
  });

  await t.test('down() and swiperAbove() follow $breakpoints', () => {
    failOn(names.flatMap(name => {
      const width = scss.get(name);
      const down = attempt(js.down, name);
      const above = attempt(js.swiperAbove, name);
      return [
        ...(down === `(max-width: ${width}px)` ? [] : [`down('${name}') = ${down}, expected (max-width: ${width}px)`]),
        ...(above === width + 1 ? [] : [`swiperAbove('${name}') = ${above}, expected ${width + 1}`])
      ];
    }), 'breakpoint helpers');
  });

  await t.test('an unknown name throws', () => {
    assert.throws(() => js.down('no-such-breakpoint'));
    assert.throws(() => js.swiperAbove('no-such-breakpoint'));
  });

  await t.test('every data-swiper-media is down(name)', async () => {
    const allowed = new Set(names.map(name => `(max-width: ${scss.get(name)}px)`));
    const problems = [];
    for (const name of sources.filter(file => file.endsWith('.pug'))) {
      (await read(name)).split('\n').forEach((line, index) => {
        for (const [, , value] of line.matchAll(/data-swiper-media\s*=\s*(['"])(.*?)\1/g)) {
          if (!allowed.has(value)) problems.push(`${name}:${index + 1}: data-swiper-media="${value}" is not down(name); ${hint(value, scss)}`);
        }
      });
    }
    failOn(problems, 'data-swiper-media values outside $breakpoints');
  });

  // Not a failure: literals still work, but drift away from the map unnoticed.
  for (const name of sources.filter(file => file.endsWith('.js') && file !== MODULE)) {
    const code = await read(name);
    for (const match of code.matchAll(/\(max-width:\s*\d+(?:\.\d+)?px\)/g)) {
      t.diagnostic(`${name}:${lineOf(code, match.index)}: ${match[0]} literal, use down(name)`);
    }
    for (const block of code.matchAll(/breakpoints\s*:\s*\{/g)) {
      let depth = 0;
      let end = block.index + block[0].length - 1;
      for (; end < code.length; end++) {
        if (code[end] === '{') depth++;
        if (code[end] === '}' && --depth === 0) break;
      }
      const body = code.slice(block.index, end);
      for (const key of body.matchAll(/(?:^|[{,])\s*\[?\s*['"]?(\d+)['"]?\s*\]?\s*:/g)) {
        t.diagnostic(`${name}:${lineOf(code, block.index + key.index)}: Swiper breakpoint key ${key[1]}, use [swiperAbove(name)]`);
      }
    }
  }
});
