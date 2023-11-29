import fs from 'fs';
import path from 'path';
import {
  computeImportVarsUsedCountOfLeafs,
  computeImportVarsUsedCountOfPages,
} from './utils/statistics';

// const log = analyzePkgUsedInfoInEveryPage({
//   tsConfigFilePath: '../../tsconfig.json',
//   packageNames: ['antd'],
// });

const log = require('./log.json');

fs.writeFileSync(
  path.join(__dirname, 'log.json'),
  JSON.stringify(log, null, 2),
);

const usage = computeImportVarsUsedCountOfLeafs(log[0].references);

fs.writeFileSync(
  path.join(__dirname, 'usage.json'),
  JSON.stringify(usage, null, 2),
);

const usageOfPages = computeImportVarsUsedCountOfPages(
  log[0].references,
  path.resolve(__dirname, '../../../src/pages'),
);

fs.writeFileSync(
  path.join(__dirname, 'usageOfPages.json'),
  JSON.stringify(usageOfPages, null, 2),
);
