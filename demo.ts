import { analyzePkgUsedInfoInEveryPage } from ".";

analyzePkgUsedInfoInEveryPage({
    tsConfigFilePath: '../../tsconfig.json',
    packageNames: ['antd'],
    pageDir: '../../src/pages',
});
