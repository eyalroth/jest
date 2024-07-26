/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// TODO document here + official docs

const NO_SHRED_AFTER_TEARDOWN = Symbol.for('$$jest-no-shred');

export function shred(value: unknown): void {
  if (isShreddable(value)) {
    const protectedProperties = Reflect.get(value, NO_SHRED_AFTER_TEARDOWN);
    if (!Array.isArray(protectedProperties) || protectedProperties.length > 0) {
      for (const key of Reflect.ownKeys(value)) {
        if (!protectedProperties?.includes(key)) {
          Reflect.deleteProperty(value, key);
        }
      }
    }
  }
}

export function setNotShreddable<T extends object>(
  value: T,
  properties: Array<keyof T> = [],
): boolean {
  if (isShreddable(value)) {
    return Reflect.set(value, NO_SHRED_AFTER_TEARDOWN, properties);
  }
  return false;
}

export function isShreddable(value: unknown): value is object {
  return value !== null && ['object', 'function'].includes(typeof value);
}
