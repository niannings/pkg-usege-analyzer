import { Identifier, Node, Project, ProjectOptions, SourceFile, ts } from 'ts-morph';
import path from 'path';

interface AnalyzePkgUsedInfoInEveryPageParams extends Pick<ProjectOptions, 'tsConfigFilePath'> {
    packageNames: string[];
    pageDir: string;
}

interface ExportsWhoUseThisVars {
    __node?: Node<ts.Node>;
    exportVarName: string;
    importVarNames: string[];
}

interface PackageUsedInfoTreeNode {
    /** 引用了包A的文件路径 */
    key: string;
    importPackageName?: string;
    namedImports?: string[];
    defaultImport?: string;
    /** 使用了从包A导入的变量的导出 */
    exportsWhoUseThisVars?: ExportsWhoUseThisVars[];
    /** 引用了路径为key的文件 */
    references?: PackageUsedInfoTreeNode[];
}

type PackageUsedInfoTree = PackageUsedInfoTreeNode[];

const formatPath = (p: string) => path.relative(__dirname, p);

function findExportVars(node: Node<ts.Node>, exportsWhoUseThisVars?: Record<string, ExportsWhoUseThisVars>, importVarName?: string) {
    const kindName = node.getKindName();

    if (/^(type|import)/i.test(kindName)) {
        return;
    }

    if (/export/i.test(kindName)) {
        return node;
    }

    if (/(variable|class|function)Declaration/i.test(kindName)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (/^export /i.test(node?.getText())) {
            // if (importVarName === 'Avatar') {
            //     console.log(node.getText(), kindName, '_____________--------+++++');
            // }

            return node;
        }

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return Object.values(getExportsWhoUseThisVars([node as Identifier], node.getSourceFile(), exportsWhoUseThisVars, importVarName))[0]?.__node;
    }

    const parent = node.getParent();

    if (parent) {
        return findExportVars(parent, exportsWhoUseThisVars, importVarName);
    }

    return;
}

function getExportsWhoUseThisVars(vars: Identifier[], sourceFile: SourceFile, exportsWhoUseThisVars: Record<string, ExportsWhoUseThisVars> = {}, _importVarName?: string) {
    const souceFilePath = formatPath(sourceFile.getFilePath());

    for (const item of vars) {
        let importVarName = _importVarName;
        const references = item.findReferencesAsNodes().filter(ref => {
            const p = formatPath(ref.getSourceFile().getFilePath());

            return p === souceFilePath;
        });

        if (!importVarName) {
            importVarName = item.getText();
        }

        // if (item.getText() === 'Dropdown') {
        //     console.log(123)
        // }

        for (const ref of references) {
            const exportDeclaration = findExportVars(ref, exportsWhoUseThisVars, importVarName);

            // console.log(importVarName, exportDeclaration?.getChildrenOfKind(ts.SyntaxKind.Identifier)[0].getText(), '_____________--------+++++')

            //     if (importVarName === 'Avatar') {
            //     console.log('_____________--------+++++');
            // }

            if (exportDeclaration) {
                const exportVarName = exportDeclaration.getChildrenOfKind(ts.SyntaxKind.Identifier)[0].getText();

                // console.log(exportVarName, importVarName, '_____________--------+++++')

                if (!exportsWhoUseThisVars[exportVarName]) {
                    exportsWhoUseThisVars[exportVarName] = ({
                        exportVarName,
                        importVarNames: []
                    });
                }

                if (!exportsWhoUseThisVars[exportVarName].importVarNames.includes(importVarName)) {
                    exportsWhoUseThisVars[exportVarName].importVarNames.push(importVarName);
                }
            }
        }
    }

    return exportsWhoUseThisVars;
}

/**
 * Generates a map of package use information based on the provided source files and package name.
 *
 * @param {Object} options - The options object.
 * @param {SourceFile[]} options.sourceFiles - An array of source files.
 * @param {string} options.packageName - The name of the package.
 * @return {PackageUseInfoMap} The map of package use information.
 */
function getPackageUsedInfoTree({ sourceFiles, packageName }: { sourceFiles: SourceFile[], packageName: string }): PackageUsedInfoTreeNode {
    const thePackageUsedInfoTree: PackageUsedInfoTree = [];

    // 依次遍历每个sourceFile，并梳理出它们import了 packageName 的信息，同时保存在thePackageUsedInfoTreeNode中
    for (const sourceFile of sourceFiles) {
        for (const importDeclaration of sourceFile.getImportDeclarations()) {
            let importPackageName = importDeclaration.getModuleSpecifierValue();

            if (importPackageName !== packageName) {
                const importSourceFile = importDeclaration.getModuleSpecifierSourceFile();

                if (importSourceFile) {
                    importPackageName = formatPath(importSourceFile.getFilePath());
                }
            }

            if (importPackageName === packageName) {
                const namedImports = importDeclaration.getNamedImports();
                const defaultImport = importDeclaration.getDefaultImport();

                thePackageUsedInfoTree.push({
                    importPackageName: packageName,
                    key: formatPath(sourceFile.getFilePath()),
                    namedImports: namedImports.map(namedImport => namedImport.getName()),
                    defaultImport: defaultImport?.getText(),
                    exportsWhoUseThisVars: Object.values(getExportsWhoUseThisVars(namedImports.map(namedImport => namedImport.getNameNode()).concat(defaultImport || []), sourceFile)).map(item => ({
                        ...item,
                        __node: undefined
                    })),
                })
            }
        }
    }

    return {
        key: packageName,
        references: thePackageUsedInfoTree,
    };
}

/**
 * 简介：分析每个页面引用[packageName]的情况（包括直接引用和间接引用）
 * 步骤：
 * 1. 依次遍历每个sourceFile
 * 2. 梳理出它们import了 packageName 的信息
 * 3. 保存在thePackageUseInfoMap中
 * 4. 遍历pageDir下所有的tsx?文件，同时找出引用了[keyof thePackageUseInfoMap]的文件，保存在thePageUseInfoMap的references中
 */
export function analyzePkgUsedInfoInEveryPage({ tsConfigFilePath, packageNames, pageDir: _pageDir }: AnalyzePkgUsedInfoInEveryPageParams) {
    const project = new Project({
        tsConfigFilePath,
    });
    const sourceFiles = project.getSourceFiles();
    const thePackageUsedInfoTree = packageNames.map(packageName => getPackageUsedInfoTree({ sourceFiles, packageName }));
    const pageDir = formatPath(_pageDir);

    //  遍历pageDir下所有的tsx?文件，同时找出引用了[keyof thePackageUsedInfoTreeNode]的文件，保存在对应的thePackageUsedInfoTreeNode的references中
    const pageSourceFiles = sourceFiles.filter(souceFile => formatPath(souceFile.getFilePath()).startsWith(pageDir));

    if (!pageSourceFiles) {
        return;
    }

    for (const usedInfoNode of thePackageUsedInfoTree) {
        const references = usedInfoNode.references;

        if (!references) {
            continue;
        }

        for (const reference of references) {
            reference.references = getPackageUsedInfoTree({ sourceFiles: pageSourceFiles, packageName: reference.key }).references;
        }
    }

    console.log(`引用了${packageNames.join('、')}的文件信息：`, JSON.stringify(thePackageUsedInfoTree, null, 2));
}
