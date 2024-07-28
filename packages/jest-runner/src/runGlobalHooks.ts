/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {performance} from 'perf_hooks';
import * as util from 'util';
import {createScriptTransformer} from '@jest/transform';
import type {Config} from '@jest/types';
import prettyFormat from 'pretty-format';

// TODO document workerId = null
export default async function runGlobalHooks({
  projectConfig,
  globalConfig,
  moduleName,
  runInBand,
}: {
  projectConfig: Config.ProjectConfig;
  globalConfig: Config.GlobalConfig;
  moduleName: 'globalSetup' | 'globalTeardown';
  runInBand: boolean;
}): Promise<void> {
  performance.mark(`jest/${moduleName}:start`);

  const projectModulePath = projectConfig[moduleName];
  const globalModulePath = globalConfig[moduleName];

  await runHook({
    projectConfig,
    globalConfig,
    moduleName,
    runInBand,
    modulePath: projectModulePath,
    globalHooksPerWorker: projectConfig?.globalHooksPerWorker,
  });

  if (projectModulePath !== globalModulePath) {
    await runHook({
      projectConfig,
      globalConfig,
      moduleName,
      runInBand,
      modulePath: globalModulePath,
      globalHooksPerWorker: globalConfig?.globalHooksPerWorker,
    });
  }

  performance.mark(`jest/${moduleName}:end`);
}

async function runHook({
  projectConfig,
  globalConfig,
  moduleName,
  runInBand,
  modulePath,
  globalHooksPerWorker,
}: {
  projectConfig: Config.ProjectConfig;
  globalConfig: Config.GlobalConfig;
  moduleName: 'globalSetup' | 'globalTeardown';
  runInBand: boolean;
  modulePath?: string;
  globalHooksPerWorker?: boolean;
}): Promise<void> {
  if (!modulePath) {
    return;
  }

  if (
    !shouldRun({
      globalHooksPerWorker,
      moduleName,
      runInBand,
      modulePath,
    })
  ) {
    return;
  }

  const transformer = await createScriptTransformer(projectConfig);

  try {
    await transformer.requireAndTranspileModule(
      modulePath,
      async globalModule => {
        if (typeof globalModule !== 'function') {
          throw new TypeError(
            `${moduleName} file must export a function at ${modulePath}`,
          );
        }

        await globalModule(globalConfig, projectConfig);
      },
    );
  } catch (error) {
    if (
      util.types.isNativeError(error) &&
      (Object.getOwnPropertyDescriptor(error, 'message')?.writable ||
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(error), 'message')
          ?.writable)
    ) {
      error.message = `Jest: Got error running ${moduleName} - ${modulePath}, reason: ${error.message}`;

      throw error;
    }

    throw new Error(
      `Jest: Got error running ${moduleName} - ${modulePath}, reason: ${prettyFormat(
        error,
        {maxDepth: 3},
      )}`,
    );
  }
}

// TODO rename
// TODO is this shared between worker threads?
const memory = {
  globalSetup: new Set<string>(),
  globalTeardown: new Set<string>(),
};

function shouldRun({
  moduleName,
  runInBand,
  globalHooksPerWorker,
  modulePath,
}: {
  moduleName: 'globalSetup' | 'globalTeardown';
  runInBand: boolean;
  globalHooksPerWorker?: boolean;
  modulePath: string;
}): boolean {
  const runningInWorker = !runInBand && process.env.JEST_WORKER_ID !== undefined;
  const shouldRunPerWorker = globalHooksPerWorker ?? false;

  const shouldRun = (() => {
    if (runningInWorker) {
      if (!shouldRunPerWorker) {
        return false;
      }
      return !memory[moduleName].has(modulePath);
    } else {
      return runInBand || !shouldRunPerWorker;
    }
  })();

  if (shouldRun) {
    memory[moduleName].add(modulePath);
  }

  return shouldRun;
}
