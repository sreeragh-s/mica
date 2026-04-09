/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

export default function normalizeClassNames(
  ...classNames: Array<typeof undefined | boolean | null | string>
): string[] {
  const rval: string[] = []
  for (const className of classNames) {
    if (className && typeof className === "string") {
      for (const match of Array.from(className.matchAll(/\S+/g))) {
        const s = match[0]
        rval.push(s)
      }
    }
  }
  return rval
}
