import path from 'path';
import mock from './mock.json';
import { computeImportVarsUsedCountOfPages } from './utils/statistics';

// const log = computeImportVarsUsedCountOfLeafs(
//   analyzePkgUsedInfoInEveryPage({
//     tsConfigFilePath: '../../tsconfig.json',
//     packageNames: ['antd'],
//   }),
// );

// console.log(log);

console.log(
  computeImportVarsUsedCountOfPages(
    mock,
    path.resolve(__dirname, '../../../src/pages'),
  ),
);

// const log = computeImportVarsUsedCountOfLeafs();
