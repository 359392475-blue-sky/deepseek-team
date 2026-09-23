/** Real Loader assembly of the shared-server profile with independent persistent storage. */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import { load } from 'js-yaml'
import z from '@deepseek-ai/schemastery'
import { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { boot } from '@deepseek-ai/dsh-app-boot'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import Registry from '@deepseek-ai/dsh-typert-registry'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import TeamBattle from '@deepseek-ai/dsh-experimental-team-battle'
import * as Connector from '../src/index.ts'

it.each([true, false])('loads isolated collaboration with startup hosting %s', async (hosting) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-team-server-'))
  let ctx: Awaited<ReturnType<typeof boot>> | undefined
  const builtins = {
    '@deepseek-ai/dsh-credentials-local': Credentials,
    '@deepseek-ai/dsh-storage': Storage,
    '@deepseek-ai/dsh-storage-json': StorageJson,
    '@deepseek-ai/dsh-storage-domain': StorageDomain,
    '@deepseek-ai/dsh-typert-registry': Registry,
    '@deepseek-ai/dsh-host-webserver': WebServer,
    '@deepseek-ai/dsh-experimental-team-battle': TeamBattle,
    '@deepseek-ai/dsh-experimental-team-battle-connector-http': Connector,
  }
  try {
    const source = await readFile(new URL('../deploy/profile/cordis.patch.yml', import.meta.url), 'utf8')
    let template = source.replaceAll("!!js dshHomePath('storages')", JSON.stringify(join(home, 'storages')))
      .replace('watch: false', `watch: false\n        path: ${JSON.stringify(join(home, '.credentials.yaml'))}`)
      .replace('port: 18864', 'port: 0')
    if (!hosting) template = template.replace(/        hostedServer:\n(?:          [^\n]*\n)+/, '')
    for (const name of Object.keys(builtins)) template = template.replace(`name: '${name}'`, `name: 'cordis:${name}'`)
    await writeFile(join(home, 'cordis.yml'), '[]\n')
    await writeFile(join(home, '.credentials.yaml'), 'TEAM_BATTLE_SERVER_ACCESS_TOKEN: deployment-test-token\n', { mode: 0o600 })
    const patches = load(template, { schema: entryListSchema }) as PatchOptions[]
    const start = () => boot('team-server-test', join(home, 'cordis.yml'), patches, (root) => {
      Object.assign(root.loader.builtins, builtins)
    })
    ctx = await start()
    expect(ctx.get('agents')).toBeUndefined()
    expect(ctx.get('sessionController')).toBeUndefined()
    expect(ctx.get('directoryPicker')).toBeUndefined()
    expect(ctx.get('connection')).toBeUndefined()
    if (!hosting) {
      expect(await ctx.teamBattle.networkStatus()).toEqual({ running: false, origins: [] })
      expect(await ctx.teamBattle.startHosting({ host: '127.0.0.1', port: 0 })).toMatchObject({ running: true })
      expect(await ctx.teamBattle.stopHosting()).toEqual({ running: false, origins: [] })
      return
    }
    const firstOrigin = (await ctx.teamBattle.networkStatus()).origins[0]
    expect(firstOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const memberToken = randomBytes(32).toString('base64url')
    const creation = await fetch(`${firstOrigin}/create`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer deployment-test-token' },
      body: JSON.stringify({ name: 'Persistent shared project', goal: 'Ship together', memberName: 'Owner', memberRole: 'Product', ownerMemberToken: memberToken }),
    })
    expect(creation.status).toBe(200)
    const created: unknown = await creation.json()
    expect(created).toMatchObject({ name: 'Persistent shared project' })
    if (typeof created !== 'object' || created === null || !('id' in created) || typeof created.id !== 'string') throw new Error('missing project id')
    const projectId = created.id
    await ctx.fiber.dispose()
    ctx = await start()
    const origin = (await ctx.teamBattle.networkStatus()).origins[0]
    const response = await fetch(`${origin}/call`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ teamId: projectId, method: 'summary', input: {} }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: projectId, name: 'Persistent shared project' })
    expect((await fetch(`${origin}/api/sessions/list`)).status).toBe(404)
  } finally {
    await ctx?.fiber.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

it('rejects incomplete explicit hosting configuration', () => {
  const config = { path: '/legacy-codex', secretEnv: 'TEAM_TOKEN', maxBodyBytes: 1024 }
  expect(() => z.resolve({ ...config, hostedServer: {} }, Connector.Config, {})).toThrow()
  expect(() => z.resolve({ ...config, hostedServer: { host: '127.0.0.1', port: 0 } }, Connector.Config, {})).toThrow()
})
