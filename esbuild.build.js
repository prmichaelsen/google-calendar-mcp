import * as esbuild from 'esbuild';
import { readdir } from 'fs/promises';
import { join } from 'path';

// Find all entry points in src/
async function findEntryPoints(dir, base = 'src') {
  const entries = [];
  const files = await readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = join(dir, file.name);
    if (file.isDirectory()) {
      entries.push(...await findEntryPoints(fullPath, base));
    } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
      entries.push(fullPath);
    }
  }
  
  return entries;
}

const entryPoints = await findEntryPoints('src');

await esbuild.build({
  entryPoints,
  bundle: false, // Don't bundle - preserve module structure
  outdir: 'build',
  outbase: 'src',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true
  // Note: external is not needed when bundle: false
  // Dependencies are not bundled anyway
});

console.log('Build complete!');
