import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import {once} from 'node:events';
import {projectRoot, createBuild} from '../gulp-tasks/index.mjs';
import {chromium} from 'playwright';
import * as sass from 'sass';
import {files, inside} from '../gulp-tasks/io.mjs';

export async function fixture(t, {real = false, label = 'fixture-'} = {}) {
  const cache = path.join(projectRoot, '.cache/tests');
  await fs.mkdir(cache, {recursive: true});
  const rootDir = await fs.mkdtemp(path.join(cache, label));
  const put = async (name, data) => {
    const target = path.join(rootDir, name);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, data);
  };
  t.after(async () => {
    if (inside(cache, rootDir)) await fs.rm(rootDir, {recursive: true, force: true, maxRetries: 3});
  });
  await fs.copyFile(path.join(projectRoot, '.browserslistrc'), path.join(rootDir, '.browserslistrc'));
  if (real) await fs.cp(path.join(projectRoot, 'src'), path.join(rootDir, 'src'), {recursive: true});
  else {
    await put('src/views/index.pug', 'doctype html\nhtml\n  head\n    != faviconHtml\n    link(rel="stylesheet" href="styles/main.css")\n  body\n    p(title="example.js") fixture\n    script(type="application/json") {"file":"data.json"}\n    script(src="js/main.js")\n');
    await put('src/styles/main.scss', '.fixture { color: red; }\n');
    await put('src/js/index.js', 'import {value} from "./sync.js"; window.syncValue = value; window.loadChunk = () => import("./lazy.js").then(module => module.value);\n');
    await put('src/js/sync.js', 'export const value = 7;\n');
    await put('src/js/lazy.js', 'export const value = 42;\n');
    await put('src/.htaccess', '# fixture\n');
  }
  return {rootDir, outputDir: path.join(rootDir, 'dist'), put, tasks: createBuild({rootDir})};
}

export async function serve(directory, prefix = '/') {
  const mime = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(prefix)) throw new Error('Wrong prefix');
      const target = path.resolve(directory, pathname.slice(prefix.length) || 'index.html');
      if (!inside(directory, target)) throw new Error('Outside root');
      let buffer;
      // Like GitHub Pages: a missing path under the site gets 404.html with the 404 status.
      try {
        buffer = await fs.readFile(target);
      } catch {
        const page = await fs.readFile(path.join(directory, '404.html'));
        response.writeHead(404, {'Content-Type': 'text/html'});
        return response.end(page);
      }
      response.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream'});
      response.end(buffer);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}${prefix}`, close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    })
  };
}

export function nextBuild(session, name, event = 'built') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}: ${name}`));
    }, 20000);
    const listener = result => {
      if ((typeof result === 'string' ? result : result.name) === name) {
        cleanup();
        resolve(result);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      session.events.off(event, listener);
    };
    session.events.on(event, listener);
  });
}

export async function launchChromium() {
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(`Chromium is required: run yarn test:setup. ${error.message}`, {cause: error});
  }
}

// Top-level built pages; a page with <base> works only under its own path (404.html on GitHub Pages).
export async function realPages(outputDir) {
  const names = (await files(outputDir)).filter(name => !name.includes('/') && name.endsWith('.html'));
  return Promise.all(names.map(async name => {
    const html = await fs.readFile(path.join(outputDir, name), 'utf8');
    return {name, html, base: html.match(/<base\s+href="(\/[^"]*\/)"/)?.[1] ?? null};
  }));
}

// Whole-word class check in built HTML: js-menu must not match js-menu-open.
export function hasClass(html, name) {
  return new RegExp(`class="(?:[^"]*\\s)?${name}(?:\\s[^"]*)?"`).test(html);
}

// Widths probed to find where a component turns on and off at the project's own breakpoints.
export const PROBE_WIDTHS = [320, 375, 480, 600, 640, 768, 1024, 1280, 1440, 1920];

// $breakpoints compiled by Sass: any formatting of the map works.
export function readBreakpoints(rootDir) {
  const {css} = sass.compileString('@use "variables" as v; a { @each $name, $value in v.$breakpoints { --#{$name}: #{$value}; } }', {
    loadPaths: [path.join(rootDir, 'src/styles/helpers')]
  });
  return new Map([...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => {
    if (!/^\d+(\.\d+)?px$/.test(value.trim())) throw new Error(`$breakpoints: ${name} is ${value.trim()}, expected px`);
    return [name, parseFloat(value)];
  }));
}

// Slider checks run on a phone, a laptop and a wide screen, and on both sides of every breakpoint.
export function sliderWidths(breakpoints) {
  return [...new Set([320, 375, 1280, 1920, ...[...breakpoints.values()].flatMap(width => [width, width + 1])])].sort((a, b) => a - b);
}
