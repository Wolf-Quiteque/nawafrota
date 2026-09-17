// Entry point for `node --import`. Registers the alias resolver (see
// alias-loader.mjs) before any test module is loaded.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./alias-loader.mjs', pathToFileURL(`${import.meta.dirname}/`));
