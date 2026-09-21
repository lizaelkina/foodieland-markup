import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {projectRoot} from '../gulp-tasks/index.mjs';

export async function createPage(name, rootDir = projectRoot) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name || '') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) throw new Error('Expected one safe kebab-case page name');
  if (name === 'index') throw new Error('index.html is built from src/views/index.pug');
  const parent = path.resolve(rootDir, 'src/views/pages');
  await fs.mkdir(parent, {recursive: true});
  const target = path.join(parent, `${name}.pug`);
  const title = name.replaceAll('-', ' ').replace(/^./, letter => letter.toUpperCase());
  const handle = await fs.open(target, 'wx');
  try {
    await handle.writeFile(`extends ../layouts/default\n\nblock variables\n  - const page = {id: '${name}', title: '${title}'}\n\nblock content\n`);
  } finally {
    await handle.close();
  }
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw new Error('Expected exactly one page name');
    const target = await createPage(name);
    process.stdout.write(`Created ${path.relative(projectRoot, target)}; add {id: '${name}', title, href: '${name}.html'} to src/views/data/site.pug to show it in navigation (hideIn: ['header', 'menu', 'footer'] hides it there).\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
