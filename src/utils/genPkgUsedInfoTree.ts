import { Identifier, Node, SourceFile, ts } from 'ts-morph';
import { formatPath } from './file';

interface ExportsWhoUseThisPkg {
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
    exportsWhoUseThisPkg?: ExportsWhoUseThisPkg[];
    /** 引用了路径为key的文件 */
    references?: PackageUsedInfoTreeNode[];
}

type PackageUsedInfoTree = PackageUsedInfoTreeNode[];

/**
 * 在给定的节点中查找导出变量。
 *
 * @param {Node<ts.Node>} node - 要搜索导出变量的节点。
 * @param {Record<string, ExportsWhoUseThisPkg>} exportsWhoUseThisPkg - 可选。使用此包的导出记录。
 * @param {string} importVarName - 可选。导入变量的名称。
 * @return {Node<ts.Node> | undefined} - 如果找到导出变量，则为导出变量节点，否则为undefined。
 */
function findExportVars(node: Node<ts.Node>, exportsWhoUseThisPkg?: Record<string, ExportsWhoUseThisPkg>, importVarName?: string) {
    const kindName = node.getKindName();

    if (/^(type|import)/i.test(kindName)) {
        return;
    }

    if (/export/i.test(kindName)) {
        return node;
    }

    if (/(variable|class|function)Declaration/i.test(kindName)) {
        if (/^export /i.test(node?.getText())) {
            return node;
        }

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return Object.values(getExportsWhoUseThisPkg([node as Identifier], node.getSourceFile(), exportsWhoUseThisPkg, importVarName))[0]?.__node;
    }

    const parent = node.getParent();

    if (parent) {
        return findExportVars(parent, exportsWhoUseThisPkg, importVarName);
    }

    return;
}

/**
 * 获取使用此包的导出项。
 *
 * @param {Identifier[]} vars - 标识符数组。
 * @param {SourceFile} sourceFile - 源文件。
 * @param {Record<string, ExportsWhoUseThisPkg>} exportsWhoUseThisPkg - 使用此包的导出项。
 * @param {string} [_importVarName] - 导入变量名。
 * @return {Record<string, ExportsWhoUseThisPkg>} 使用此包的导出项。
 */
function getExportsWhoUseThisPkg(vars: Identifier[], sourceFile: SourceFile, exportsWhoUseThisPkg: Record<string, ExportsWhoUseThisPkg> = {}, _importVarName?: string) {
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

        for (const ref of references) {
            const exportDeclaration = findExportVars(ref, exportsWhoUseThisPkg, importVarName);

            if (exportDeclaration) {
                const exportVarName = exportDeclaration.getChildrenOfKind(ts.SyntaxKind.Identifier)[0]?.getText();

                if (!exportVarName) {
                    continue;
                }

                if (!exportsWhoUseThisPkg[exportVarName]) {
                    exportsWhoUseThisPkg[exportVarName] = ({
                        exportVarName,
                        importVarNames: []
                    });
                }

                if (!exportsWhoUseThisPkg[exportVarName].importVarNames.includes(importVarName)) {
                    exportsWhoUseThisPkg[exportVarName].importVarNames.push(importVarName);
                }
            }
        }
    }

    return exportsWhoUseThisPkg;
}

/**
 * 根据给定的源文件和包名生成包使用信息的树。
 *
 * @param {string} packageName - 包名。
 * @param {SourceFile[]} sourceFiles - 源文件数组。
 * @return {PackageUsedInfoTreeNode} 生成的包使用信息树。
 */
export function getPkgUsedInfoTree(packageName: string, sourceFiles: SourceFile[], includeImportVarNames?: string[]): PackageUsedInfoTreeNode {
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
                let namedImports = importDeclaration.getNamedImports();
                const defaultImport = importDeclaration.getDefaultImport();

                if (includeImportVarNames?.length) {
                    namedImports = namedImports.filter(namedImport => includeImportVarNames.includes(namedImport.getName()));

                    if (!namedImports.length && !includeImportVarNames.includes(defaultImport?.getText() || '')) {
                        continue;
                    }
                }

                thePackageUsedInfoTree.push({
                    importPackageName: packageName,
                    key: formatPath(sourceFile.getFilePath()),
                    namedImports: namedImports.map(namedImport => namedImport.getName()),
                    defaultImport: defaultImport?.getText(),
                    exportsWhoUseThisPkg: Object.values(getExportsWhoUseThisPkg(namedImports.map(namedImport => namedImport.getNameNode()).concat(defaultImport || []), sourceFile)).map(item => ({
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

function getPkgUsedInfoTrees(pkgUsedInfoTree: PackageUsedInfoTreeNode[], sourceFiles: SourceFile[]) {
    for (const usedInfoNode of pkgUsedInfoTree) {
        const references = usedInfoNode.references;

        if (references?.length) {
            usedInfoNode.references = getPkgUsedInfoTrees(references, sourceFiles);

            for (const reference of references) {
                reference.references = getPkgUsedInfoTree(reference.key, sourceFiles).references;
            }
        }
    }

    return pkgUsedInfoTree;
}

export function getPkgsUsedInfoTree(packageNames: string[], sourceFiles: SourceFile[], includeImportVarNames?: string[]) {
    const thePackageUsedInfoTree = packageNames.map(packageName => getPkgUsedInfoTree(packageName, sourceFiles, includeImportVarNames));

    return getPkgUsedInfoTrees(thePackageUsedInfoTree, sourceFiles);
}
