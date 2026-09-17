// Makes `node --test` understand the `@/` alias from jsconfig.json.
//
// WHY: the test runner has no bundler, so an import of '@/lib/fuel' fails
// outright — which in nawasoft-pwa forced every tested module to be alias-free
// and quietly spread that constraint through the codebase. A few lines here
// removes the constraint instead of designing around it (§9).

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

// Next resolves '@/lib/periods' to lib/periods.js. Node will not, so the
// extensions the app writes its imports without are tried here in the same
// order a bundler would.
const CANDIDATES = ['', '.js', '.mjs', '.jsx', '/index.js'];

function resolveAlias(specifier) {
  const base = path.join(projectRoot, specifier.slice(2));
  for (const suffix of CANDIDATES) {
    const candidate = base + suffix;
    if (suffix !== '' && existsSync(candidate)) return candidate;
    if (suffix === '' && existsSync(candidate) && path.extname(candidate)) return candidate;
  }
  // Nothing matched: hand the original path back so the failure names the
  // file the author actually wrote, not a guessed variant of it.
  return base;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(pathToFileURL(resolveAlias(specifier)).href, context);
  }
  return nextResolve(specifier, context);
}
