import fs from 'fs';
import path from 'path';
import { formatPath } from './file';
import { PackageUsedInfoTreeNode } from './genPkgUsedInfoTree';

type CountInfoLog = Record<string, number>;

/** 计算每个importVarName的使用总次数 */
export function computeImportVarsUsedCountOfLeafs(
  tree: PackageUsedInfoTreeNode[],
) {
  let log: CountInfoLog = {};

  for (const node of tree) {
    let prevLog: CountInfoLog = {};

    if (node.references?.length) {
      prevLog = computeImportVarsUsedCountOfLeafs(node.references);
    }

    if (node.exportsWhoUseThisPkg) {
      for (const item of node.exportsWhoUseThisPkg) {
        for (const el of item.importVarNames) {
          log[el.name] =
            (log[el.name] || 0) +
            (prevLog[item.exportVarName] || 1) * el.usedCount;
        }
      }
    }
  }

  return log;
}

/** 通过路径，计算每个importVarName的使用总次数 */
export function computeImportVarsUsedCountByPaths(
  tree: PackageUsedInfoTreeNode[],
) {
  let log: CountInfoLog = {};

  for (const node of tree) {
    let prevLog: CountInfoLog = {};

    if (node.exportsWhoUseThisPkg) {
      for (const item of node.exportsWhoUseThisPkg) {
        for (const el of item.importVarNames) {
          log[el.name] =
            (log[el.name] || 0) +
            (prevLog[item.exportVarName] || 1) * el.usedCount;
        }
      }
    }

    prevLog = log;
  }

  return log;
}

function getUsedInfoTreePathOfTarget(
  tree: PackageUsedInfoTreeNode[],
  isTarget: (cur: PackageUsedInfoTreeNode) => boolean,
) {
  const path: PackageUsedInfoTreeNode[] = [];

  for (const node of tree) {
    path.push(node);

    if (isTarget(node)) {
      return path;
    }

    if (node.references?.length) {
      path.push(...getUsedInfoTreePathOfTarget(node.references, isTarget));
    } else {
      path.pop();
    }
  }

  return path;
}

export function computeImportVarsUsedCountOfPages(
  tree: PackageUsedInfoTreeNode[],
  // 将会以pageDir为根目录，计算每个pageDir下的每个一级目录中importVarName的使用总次数
  pageDir: string,
) {
  const result: Record<string, CountInfoLog> = {};
  const dirname = path.resolve(__dirname, pageDir);
  const pagedirs = fs
    .readdirSync(dirname)
    .map((p) => formatPath(`${dirname}/${p}`));

  pagedirs.forEach((p) => {
    const treePath = getUsedInfoTreePathOfTarget(tree, (node) => {
      return node.key === `${p}/index.tsx` || node.key === `${p}/index.ts`;
    });

    const log = computeImportVarsUsedCountByPaths(treePath);

    result[p] = log;
  });

  return result;
}
