import { Project, ProjectOptions } from 'ts-morph';
// import { formatPath } from './utils/file';
import { getPkgsUsedInfoTree } from './utils/genPkgUsedInfoTree';

interface AnalyzePkgUsedInfoInEveryPageParams extends Pick<ProjectOptions, 'tsConfigFilePath'> {
    /** 要分析的包名称 */
    packageNames: string[];
    /** 要分析的每个页面的入口文件 */
    pages: string[];
}

/**
 * 分析每个页面中使用的包的信息。
 *
 * @param {AnalyzePkgUsedInfoInEveryPageParams} params - 函数的参数。
 * @param {string} params.tsConfigFilePath - TypeScript配置文件的路径。
 * @param {string[]} params.packageNames - 要分析的包的名称。
 * @param {string} params.pages - 要分析的每个页面的入口文件。
 * @return {void} 该函数不返回值。
 */
export function analyzePkgUsedInfoInEveryPage({ tsConfigFilePath, packageNames, pages }: AnalyzePkgUsedInfoInEveryPageParams) {
    const project = new Project({
        tsConfigFilePath,
    });
    const sourceFiles = project.getSourceFiles();
    const thePkgUsedInfoTree = getPkgsUsedInfoTree(packageNames, sourceFiles);

    console.log(`引用了${packageNames.join('、')}的文件信息：`, JSON.stringify(thePkgUsedInfoTree, null, 2));
}
