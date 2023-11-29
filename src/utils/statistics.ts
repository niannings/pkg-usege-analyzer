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
  paths: PackageUsedInfoTreeNode[],
) {
  const stack = [...paths];
  const log: CountInfoLog = {};

  while (stack.length) {
    const node = stack.pop();

    if (node.exportsWhoUseThisPkg) {
      for (const item of node.exportsWhoUseThisPkg) {
        for (const el of item.importVarNames) {
          console.log(el.name);
          log[el.name] = (log[item.exportVarName] || 1) * el.usedCount;
        }
      }
    }
  }

  return log;
}

function getUsedInfoTreePathOfTarget(
  tree: PackageUsedInfoTreeNode[],
  isTarget: (cur: PackageUsedInfoTreeNode) => boolean,
) {
  const stack = [...tree];
  const paths: PackageUsedInfoTreeNode[][] = [];
  let childLens = 0;
  let i = 0;

  while (stack.length) {
    const node = stack.pop();

    childLens = childLens <= 0 ? 0 : childLens - 1;

    if (!paths[i]) {
      paths[i] = [];
    }

    paths[i].push(node);

    if (isTarget(node)) {
      i++;
    } else if (node.references?.length) {
      childLens += node.references.length;
      stack.push(...node.references);
    } else {
      paths[i].pop();

      if (childLens === 0) {
        paths.pop();
      }
    }
  }

  const last = paths[paths.length - 1];

  return last && isTarget(last[last.length - 1]) ? paths : paths.slice(0, -1);
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
    const treePaths = getUsedInfoTreePathOfTarget(tree, (node) => {
      return node.key === `${p}/index.tsx` || node.key === `${p}/index.ts`;
    });

    result[p] = treePaths.reduce<CountInfoLog>((acc, treePath) => {
      const log = computeImportVarsUsedCountByPaths(treePath);

      for (const k of Object.keys(log)) {
        acc[k] = (acc[k] || 0) + log[k];
      }

      return acc;
    }, {});
  });

  return result;
}
