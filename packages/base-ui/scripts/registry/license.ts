/**
 * The package's `LICENSE` and the two header lines that travel with every copied file. The year and
 * the holder are read from `LICENSE`, never typed here, so the header follows the file it names.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { RegistryBuildError } from './errors.ts'

export interface License {
  readonly holder: string
  readonly text: string
  readonly year: string
}

export const LICENSE_FILE = 'NAVECSS-LICENSE'

const COPYRIGHT = /^Copyright \(c\) (\d{4}) (.+)$/m

export const readLicense = (root: string): License => {
  const text = readFileSync(path.join(root, 'LICENSE'), 'utf8')
  const match = COPYRIGHT.exec(text)
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new RegistryBuildError('no line matching "Copyright (c) <year> <holder>"', {
      file: 'LICENSE',
    })
  }
  return { holder: match[2].trim(), text, year: match[1] }
}

const LINE_1 = 'SPDX-License-Identifier: MIT'

const lineTwo = ({ holder, year }: License): string =>
  `Copyright (c) ${year} ${holder}. From NaveCSS (https://github.com/navecss/navecss), under the MIT License; the full text is in ${LICENSE_FILE}.`

export const typescriptHeader = (license: License): string =>
  `// ${LINE_1}\n// ${lineTwo(license)}\n`

export const cssHeader = (license: License): string =>
  `/* ${LINE_1} */\n/* ${lineTwo(license)} */\n`
