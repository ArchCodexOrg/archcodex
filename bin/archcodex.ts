#!/usr/bin/env node
/**
 * @arch archcodex.util
 */
import { createCli } from '../src/cli/index.js';

const cli = createCli();
cli.parse(process.argv);
