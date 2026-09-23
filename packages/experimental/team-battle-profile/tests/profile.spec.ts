/** The Team Battle bundle must carry one parseable project-domain layer. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('Team Battle profile bundle', () => {
  it('declares a private parseable layer with four configurable members', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: unknown
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBe(true)
    expect(manifest.publishConfig).toBeUndefined()
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')

    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as { insert?: { id?: string; name?: string; config?: Record<string, unknown> }[] }[]
    const row = parsed.flatMap(patch => patch.insert ?? []).find(entry => entry.id === 'team-battle')
    expect(row?.name).toBe('@deepseek-ai/dsh-experimental-team-battle')
    expect(row?.config?.members).toHaveLength(4)
    expect(row?.config?.maxWeaponGrants).toBe(row?.config?.maxProcessedEventIds)
    expect(row?.config?.memberOfflineAfterMs).toBe(60_000)
  })
})
