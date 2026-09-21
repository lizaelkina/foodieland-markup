import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Writable} from 'node:stream';
import gulp from 'gulp';
import pug from 'gulp-pug';
import {favicons} from 'favicons';
import sharp from 'sharp';
import {copyEntries, files, unique, replaceDirectory, writeEntries} from './io.mjs';
import {responsiveWidths} from './resources.mjs';

// Appends content hashes to the shared bundles so browsers and CDNs drop stale copies after a deploy.
export async function revisionAssets(outputDir) {
  const versions = new Map();
  for (const asset of ['styles/main.css', 'js/main.js']) {
    try {
      versions.set(asset, createHash('sha256').update(await fs.readFile(path.join(outputDir, asset))).digest('hex').slice(0, 8));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const pattern = /(\s(?:href|src)=")(styles\/main\.css|js\/main\.js)(")/g;
  for (const name of (await fs.readdir(outputDir)).filter(name => /\.html$/i.test(name))) {
    const target = path.join(outputDir, name);
    const html = await fs.readFile(target, 'utf8');
    const result = html.replace(pattern, (match, before, asset, after) => versions.has(asset) ? `${before}${asset}?v=${versions.get(asset)}${after}` : match);
    if (result !== html) await fs.writeFile(target, result);
  }
}

export function createViews({rootDir, outputDir, mode}) {
  let cached;

  async function iconData() {
    const inputs = await copyEntries(path.join(rootDir, 'src/img/favicon'));
    if (!inputs.length) return {images: [], html: []};
    if (inputs.length !== 1 || !/\.(png|jpe?g|gif|tiff)$/i.test(inputs[0][0])) throw new Error('Expected one PNG/JPEG/GIF/TIFF favicon source');
    const buffer = inputs[0][1];
    const key = createHash('sha256').update(buffer).digest('hex');
    if (cached?.key === key) return cached.result;
    const result = await favicons(buffer, {
      path: 'img/favicons',
      background: '#ffffff',
      icons: {
        favicons: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png'],
        appleIcon: ['apple-touch-icon-180x180.png'],
        android: false, appleStartup: false, windows: false, yandex: false
      }
    });
    // The generator roots URLs and adds Apple web-app metadata; publish icon links only.
    result.html = result.html.filter(tag => tag.startsWith('<link '))
      .map(tag => tag.replace('href="/img/favicons/', 'href="img/favicons/'));
    cached = {key, result};
    return result;
  }

  // +img sets width/height from these sizes, so the page does not jump while pictures load.
  const sizeCache = new Map();

  async function imageSizes() {
    const source = path.join(rootDir, 'src/img');
    const names = (await files(source)).filter(name => /\.(png|jpe?g|gif|webp|tiff)$/i.test(name) && !/^(favicon|svg)\//i.test(name));
    const sizes = {};
    for (const name of names) {
      const file = path.join(source, name);
      const {mtimeMs, size} = await fs.stat(file);
      let entry = sizeCache.get(file);
      if (entry?.mtimeMs !== mtimeMs || entry.size !== size) {
        const {width, height, orientation} = await sharp(file).metadata();
        // The WebP copies are auto-oriented, so a 90° EXIF rotation swaps the sides.
        entry = {mtimeMs, size, dimensions: orientation >= 5 ? {width: height, height: width} : {width, height}};
        sizeCache.set(file, entry);
      }
      const raster = /\.(png|jpe?g|tiff)$/i.test(name);
      sizes[name.replace(/\.[^.]+$/, '')] = {
        ...entry.dimensions,
        widths: raster ? responsiveWidths.filter(width => width < entry.dimensions.width) : []
      };
    }
    return sizes;
  }

  return async function views() {
    const icons = await iconData();
    const source = path.join(rootDir, 'src/views');
    const pages = (await files(path.join(source, 'pages'))).filter(name => !name.includes('/') && name.endsWith('.pug'));
    unique(['index.pug', ...pages].map(name => [name.replace(/\.pug$/, '.html'), null]));
    const inputs = [path.join(source, 'index.pug'), ...pages.map(name => path.join(source, 'pages', name))];
    const entries = [];
    await pipeline(
      gulp.src(inputs, {base: source}),
      // Mixins come before `doctype html` in the layout, so without this Pug outputs <img/>.
      pug({
        pretty: true,
        doctype: 'html',
        locals: {faviconHtml: icons.html.join('\n'), imageSizes: await imageSizes(), production: mode === 'production'}
      }),
      new Writable({
        objectMode: true, write(file, _encoding, callback) {
          entries.push([path.basename(file.path), file.contents]);
          callback();
        }
      })
    );
    unique(entries);
    await replaceDirectory(path.join(outputDir, 'img/favicons'), icons.images.map(item => [item.name, item.contents]));
    await fs.mkdir(outputDir, {recursive: true});
    const existing = await fs.readdir(outputDir);
    for (const name of existing.filter(name => /\.html$/i.test(name))) await fs.rm(path.join(outputDir, name));
    await writeEntries(outputDir, entries);
  };
}
