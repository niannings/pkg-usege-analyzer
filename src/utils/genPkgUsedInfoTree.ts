import { Identifier, Node, SourceFile, ts } from 'ts-morph';
import { formatPath } from './file';

interface ExportsWhoUseThisPkgImportVarInfo {
  name: string;
  usedCount: number;
}

interface ExportsWhoUseThisPkg {
  __node?: Node<ts.Node>;
  exportVarName: string;
  importVarNames: ExportsWhoUseThisPkgImportVarInfo[];
}

export interface PackageUsedInfoTreeNode {
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

interface FindExportVarsParams {
  /** 要搜索导出变量的节点。 */
  node: Node<ts.Node>;
  /** 可选。使用此包的导出记录。 */
  exportsWhoUseThisPkg?: GetExportsWhoUseThisPkgParams['exportsWhoUseThisPkg'];
  /** 可选。导入变量的名称。 */
  importVarName?: string;
  usedByJsxElement?: boolean;
  _entryVarNode?: Node<ts.Node>;
}

interface FindExportVarsReturn {
  node?: Node<ts.Node>;
  usedByJsxElement: boolean;
}

function findExportVars({
  node,
  exportsWhoUseThisPkg,
  importVarName,
  /** 情况复杂（例如Modal.show这种不太好判断），绝大部分情况是调用过的，一次这里暂不考虑是否被真实调用，只要导出了就认为是调用了 */
  usedByJsxElement = true,
  _entryVarNode,
}: FindExportVarsParams): FindExportVarsReturn | undefined {
  const kindName = node.getKindName();
  let _usedByJsxElement = usedByJsxElement;

  if (/^(type|import|interface)/i.test(kindName)) {
    return;
  }

  // if (
  //   node.isKind(ts.SyntaxKind.JsxElement) ||
  //   node.isKind(ts.SyntaxKind.JsxSelfClosingElement)
  // ) {
  //   _usedByJsxElement = true;
  // }

  // 排除闭合标签
  if (node.isKind(ts.SyntaxKind.JsxClosingElement)) {
    return {
      usedByJsxElement: false,
    };
  }

  if (/export/i.test(kindName)) {
    return {
      node,
      usedByJsxElement: _usedByJsxElement,
    };
  }

  if (/(variable|class|function)Declaration/i.test(kindName)) {
    if (/^export /i.test(node?.getText())) {
      return {
        node,
        usedByJsxElement: _usedByJsxElement,
      };
    }

    return {
      node: Object.values(
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        getExportsWhoUseThisPkg({
          vars: [node as Identifier],
          sourceFile: node.getSourceFile(),
          exportsWhoUseThisPkg,
          _importVarName: importVarName,
          _from: 'findExportVars',
          _entryVarNode,
        }),
      )[0]?.__node,
      usedByJsxElement: _usedByJsxElement,
    };
  }

  const parent = node.getParent();

  if (parent) {
    // 只要call了就认为是调用过了
    // if (parent.isKind(ts.SyntaxKind.CallExpression)) {
    //   _usedByJsxElement = true;
    // }

    return findExportVars({
      node: parent,
      exportsWhoUseThisPkg,
      importVarName,
      usedByJsxElement: _usedByJsxElement,
      _entryVarNode,
    });
  }

  return {
    usedByJsxElement: _usedByJsxElement,
  };
}

interface GetExportsWhoUseThisPkgParams {
  /** 标识符数组。 */
  vars: Identifier[];
  /** 源文件。 */
  sourceFile: SourceFile;
  /** 使用此包的导出项。 */
  exportsWhoUseThisPkg?: Record<
    string,
    Omit<ExportsWhoUseThisPkg, 'importVarNames'> & {
      importVarNames: Map<string, ExportsWhoUseThisPkgImportVarInfo>;
    }
  >;
  /** 导入变量名。 */
  _importVarName?: string;
  /** 调用来源 */
  _from?: 'findExportVars';
  _entryVarNode?: Node<ts.Node>;
}

/**
 * 获取使用此包的导出项。
 */
function getExportsWhoUseThisPkg({
  vars,
  sourceFile,
  exportsWhoUseThisPkg = {},
  _importVarName,
  _from,
  _entryVarNode,
}: GetExportsWhoUseThisPkgParams) {
  const souceFilePath = formatPath(sourceFile.getFilePath());
  let entryVarNode = _entryVarNode;

  for (const item of vars) {
    if (!_from) {
      entryVarNode = item;
    }

    let importVarName = _importVarName;
    // 找到所有的引用，并且过滤掉不属于本文件的（因为那些是从其他文件引入），以及自身
    const references = item.findReferencesAsNodes().filter((ref) => {
      if (ref === item) {
        return false;
      }

      return formatPath(ref.getSourceFile().getFilePath()) === souceFilePath;
    });

    if (!importVarName) {
      importVarName = item.getText();
    }

    for (const ref of references) {
      if (!_from || _from === 'findExportVars') {
        const exportDeclaration = findExportVars({
          node: ref,
          exportsWhoUseThisPkg,
          importVarName,
          _entryVarNode: entryVarNode,
        });

        if (exportDeclaration) {
          const exportVarName = exportDeclaration?.node
            ?.getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
            ?.getText();

          if (!exportVarName) {
            continue;
          }

          if (!exportsWhoUseThisPkg[exportVarName]) {
            exportsWhoUseThisPkg[exportVarName] = {
              exportVarName,
              importVarNames: new Map(),
            };
          }

          const importVarNamesInfo =
            exportsWhoUseThisPkg[exportVarName].importVarNames.get(
              importVarName,
            );

          if (!importVarNamesInfo) {
            exportsWhoUseThisPkg[exportVarName].importVarNames.set(
              importVarName,
              {
                name: importVarName,
                usedCount: exportDeclaration.usedByJsxElement ? 1 : 0,
              },
            );
          } else if (exportDeclaration.usedByJsxElement) {
            importVarNamesInfo.usedCount++;
          }
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
export function getPkgUsedInfoTree(
  packageName: string,
  sourceFiles: SourceFile[],
  includeImportVarNames?: string[],
): PackageUsedInfoTreeNode {
  const thePackageUsedInfoTree: PackageUsedInfoTree = [];

  // 依次遍历每个sourceFile，并梳理出它们import了 packageName 的信息，同时保存在thePackageUsedInfoTreeNode中
  for (const sourceFile of sourceFiles) {
    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      let importPackageName = importDeclaration.getModuleSpecifierValue();

      if (importPackageName !== packageName) {
        const importSourceFile =
          importDeclaration.getModuleSpecifierSourceFile();

        if (importSourceFile) {
          importPackageName = formatPath(importSourceFile.getFilePath());
        }
      }

      if (importPackageName === packageName) {
        let namedImports = importDeclaration.getNamedImports();
        const defaultImport = importDeclaration.getDefaultImport();

        if (includeImportVarNames?.length) {
          namedImports = namedImports.filter((namedImport) =>
            includeImportVarNames.includes(namedImport.getName()),
          );

          if (
            !namedImports.length &&
            !includeImportVarNames.includes(defaultImport?.getText() || '')
          ) {
            continue;
          }
        }

        thePackageUsedInfoTree.push({
          importPackageName: packageName,
          key: formatPath(sourceFile.getFilePath()),
          namedImports: namedImports.map((namedImport) =>
            namedImport.getName(),
          ),
          defaultImport: defaultImport?.getText(),
          exportsWhoUseThisPkg: Object.values(
            getExportsWhoUseThisPkg({
              vars: namedImports
                .map((namedImport) => namedImport.getNameNode())
                .concat(defaultImport || []),
              sourceFile,
            }),
          ).map((item) => ({
            ...item,
            importVarNames: Array.from(item.importVarNames.values()),
            __node: undefined,
          })),
        });
      }
    }
  }

  return {
    key: packageName,
    references: thePackageUsedInfoTree,
  };
}

function getPkgUsedInfoTrees(
  pkgUsedInfoTree: PackageUsedInfoTreeNode[],
  sourceFiles: SourceFile[],
) {
  for (const usedInfoNode of pkgUsedInfoTree) {
    const references = usedInfoNode.references;

    if (references?.length) {
      usedInfoNode.references = getPkgUsedInfoTrees(references, sourceFiles);

      for (const reference of references) {
        reference.references = getPkgUsedInfoTree(
          reference.key,
          sourceFiles,
        ).references;
      }
    }
  }

  return pkgUsedInfoTree;
}

export function getPkgsUsedInfoTree(
  packageNames: string[],
  sourceFiles: SourceFile[],
  includeImportVarNames?: string[],
) {
  const thePackageUsedInfoTree = packageNames.map((packageName) =>
    getPkgUsedInfoTree(packageName, sourceFiles, includeImportVarNames),
  );

  return getPkgUsedInfoTrees(thePackageUsedInfoTree, sourceFiles);
}
