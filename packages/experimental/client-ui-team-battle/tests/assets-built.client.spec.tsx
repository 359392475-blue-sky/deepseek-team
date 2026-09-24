// @vitest-environment jsdom
/** Built Client proof that every visual asset survives the one-file plugin route. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { TeamBattleView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import { TeamBattleMemberId, TeamBattleProjectId, TeamBattleWeaponId } from '@deepseek-ai/dsh-experimental-team-battle/src/types.ts'

const PLUGIN_ID = '@deepseek-ai/dsh-experimental-client-ui-team-battle'
const SESSION = 'built-flight' as SessionId

interface Handoff {
  id: string
  factory: (require: (specifier: string) => unknown) => { apply: (ctx: Context) => Promise<() => Promise<void>> }
}

type PluginWindow = Window & typeof globalThis & {
  __ModuleLoader__?: { load: (handoff: Handoff) => void }
}

function builtBundle(): string | undefined {
  try {
    return readFileSync(resolve('packages/experimental/client-ui-team-battle/lib/client.js'), 'utf8')
  } catch {
    return undefined
  }
}

const view: TeamBattleView = {
  simulationEnabled: false,
  revision: 1,
  localMemberId: TeamBattleMemberId('product'),
  project: { id: TeamBattleProjectId('project-1'), name: 'Built asset proof', goal: 'Load images' },
  members: [
    { id: TeamBattleMemberId('product'), name: 'Blue', role: 'Product', status: 'online', color: '#2464df' },
    { id: TeamBattleMemberId('engineering'), name: 'Engineering', role: 'Engineering', status: 'online', color: '#1c9b70' },
    { id: TeamBattleMemberId('quality'), name: 'Quality', role: 'QA', status: 'idle', color: '#c97a2a' },
  ],
  tasks: [], contexts: [], artifacts: [], activity: [],
  weaponGrants: [{ id: TeamBattleWeaponId('weapon-1'), eventId: 'query-1', memberId: TeamBattleMemberId('product'), kind: 'query', shieldDamage: 3, createdAt: Date.now() }],
  progress: { acceptedWeight: 0, totalWeight: 1, percent: 0, coreHp: 100, coreMaxHp: 100 },
  combatShield: { hp: 100, maxHp: 100 },
}

afterEach(() => {
  cleanup()
  delete (window as PluginWindow).__ModuleLoader__
  for (const style of document.querySelectorAll(`style[data-plugin=${JSON.stringify(PLUGIN_ID)}]`)) style.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Team Battle built Client assets', () => {
  const code = builtBundle()

  it.skipIf(code === undefined)('contains only in-bundle data URLs for PNG and WebP assets', () => {
    expect(code).toContain('data:image/png;base64,')
    expect(code).toContain('data:image/webp;base64,')
    expect(code).not.toContain('../assets/')
    expect(code).not.toMatch(/["']\/plugins\/[^"']+\.(?:png|webp)["']/u)
  })

  it.skipIf(code === undefined)('renders built DOM image and paper URLs without a second HTTP asset route', async () => {
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => { this.onload?.() }) }
    })
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const context: Partial<CanvasRenderingContext2D> = {
      save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 400, top: 0, left: 0, right: 360, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })

    let handoff: Handoff | undefined
    ;(window as PluginWindow).__ModuleLoader__ = { load: (value) => { handoff = value } }
    // The built bundle is the deliberate fixture under test.
    // oxlint-disable-next-line typescript/no-implied-eval, typescript/no-unsafe-call
    new Function(code!)()
    expect(handoff?.id).toBe(PLUGIN_ID)
    const runtime = handoff!.factory((specifier) => {
      if (specifier === 'react') return React
      if (specifier === 'react/jsx-runtime') return jsxRuntime
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected require: ${specifier}`)
    })

    const ctx = new Context()
    class RemoteService extends Service {
      constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
      $mount(): Promise<() => Promise<void>> { return Promise.resolve(() => Promise.resolve()) }
    }
    new RemoteService(ctx)
    const success = () => Promise.resolve({ ok: true as const, value: view })
    ctx.provide('remote.teamBattle', { view: success, createTask: success, updateTask: success, publishContext: success, publishArtifact: success, reviewArtifact: success, consumeWeapon: success, heartbeat: success })
    ctx.provide('layout', { selectPanel: vi.fn() })
    ctx.provide('uiWorkspace', { openWorkspace: vi.fn() })
    ctx.provide('workspaces', { create: vi.fn() })
    ctx.provide('locale', new LocaleRuntime(ctx))
    await ctx.plugin(SlotRegistry).await()
    const root = ctx.slots.register({ name: 'root', children: { 'conversation.view': { kind: 'list', scope: 'session' }, 'conversation.chat.sidecar': { kind: 'single', scope: 'session' } } } as never, () => null)
    const dispose = await runtime.apply(ctx)
    const entry = ctx.slots.entries('conversation.chat.sidecar')[0]!
    const actions = entry.inject!()
    render(React.createElement(entry.component as never, { sessionId: SESSION, t: ctx.locale.bind('team-battle'), ...actions } as never))

    fireEvent.click(screen.getByRole('button', { name: 'Expand game' }))
    await screen.findByText('Built asset proof')
    const imageSources = [...document.querySelectorAll<HTMLImageElement>('[data-flight-game-panel] img')].map(image => image.src)
    expect(imageSources.length).toBeGreaterThan(0)
    expect(imageSources.every(source => source.startsWith('data:image/png;base64,'))).toBe(true)
    expect(document.querySelector<HTMLElement>('[data-flight-game-panel]')?.style.getPropertyValue('--flight-paper')).toContain('data:image/webp;base64,')

    await dispose()
    root()
  })
})
