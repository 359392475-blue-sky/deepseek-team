/** The Team Battle Web bundle must carry connector and browser layers. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('Team Battle Web profile bundle', () => {
  it('declares a private parseable connector and UI layer', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: unknown
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBe(true)
    expect(manifest.publishConfig).toBeUndefined()

    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as { id?: string; disabled?: boolean; insert?: { id?: string; name?: string }[] }[]
    expect(parsed.find(patch => patch.id === 'ui-trajectory')).toEqual({ id: 'ui-trajectory', disabled: true })
    expect(parsed.find(patch => patch.id === 'directory-picker')).toEqual({ id: 'directory-picker', disabled: true })
    expect(parsed.flatMap(patch => patch.insert ?? []).map(entry => entry.id)).toEqual([
      'directory-picker-browse',
      'ui-directory-picker-browse',
      'team-battle-connector-http',
      'ui-team-battle',
    ])
  })
})
