import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TeamBattleView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import type {} from '@deepseek-ai/dsh-experimental-team-battle/remote'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { FlightGamePanel } from '../src/client/FlightGamePanel.tsx'
import { inject, mountTeamBattleUi } from '../src/client/mount.ts'
import { TeamSpaceView } from '../src/client/TeamSpaceView.tsx'
import { RootTeamSpace, TeamSpaceEntry } from '../src/client/RootTeamSpace.tsx'
import { apply as nodeApply } from '../src/index.ts'

const REMOTE: TypertRemoteContribution = {
  package: '@deepseek-ai/dsh-experimental-team-battle',
  descriptors: [],
}

const view = {
  revision: 1,
  localMemberId: 'product',
  project: { name: 'Team Battle', goal: 'Ship together' },
  members: [],
  tasks: [],
  contexts: [],
  artifacts: [],
  activity: [],
  weaponGrants: [],
  progress: { acceptedWeight: 0, totalWeight: 0, percent: 0, coreHp: 100, coreMaxHp: 100 },
  combatShield: { hp: 100, maxHp: 100 },
} as unknown as TeamBattleView

async function bench(failRegistration = false) {
  const ctx = new Context()
  const calls: { method: string; args: readonly unknown[] }[] = []
  class RemoteService extends Service {
    readonly disposeMount = vi.fn(() => Promise.resolve())
    readonly mount = vi.fn((_contribution: unknown) => Promise.resolve(this.disposeMount))

    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }

    $mount(contribution: unknown): Promise<() => Promise<void>> { return this.mount(contribution) }
  }
  const remote = new RemoteService(ctx)
  const answer = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return Promise.resolve({ ok: true as const, value: view })
  }
  ctx.provide('remote.teamBattle', {
    view: answer('view'),
    createTask: answer('createTask'),
    updateTask: answer('updateTask'),
    publishContext: answer('publishContext'),
    publishArtifact: answer('publishArtifact'),
    reviewArtifact: answer('reviewArtifact'),
    consumeWeapon: answer('consumeWeapon'),
    heartbeat: answer('heartbeat'),
    space: answer('space'),
    createFolder: answer('createFolder'),
    publishFile: answer('publishFile'),
    updateSpaceItem: answer('updateSpaceItem'),
    readFile: answer('readFile'),
    sendFile: answer('sendFile'),
    submitFile: answer('submitFile'),
  })
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  const root = ctx.slots.register({
    name: 'root',
    children: {
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.chat.sidecar': { kind: 'single', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  if (failRegistration) vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot failure') })
  const activation = mountTeamBattleUi(ctx, REMOTE)
  const dispose = failRegistration ? undefined : await activation
  return { ctx, calls, remote, root, activation, dispose }
}

describe('Team Battle browser plugin', () => {
  it('keeps its Host entry inert', async () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('mounts the generated Remote and registers disposable Team and flight surfaces', async () => {
    const b = await bench()
    expect(inject).toEqual(['remote', 'slots', 'locale'])
    const team = b.ctx.slots.entries('conversation.view').find(entry => entry.component === TeamSpaceView)
    const game = b.ctx.slots.entries('conversation.chat.sidecar').find(entry => entry.component === FlightGamePanel)
    expect(team).toMatchObject({ options: { id: 'team', order: 20 }, locale: 'team-battle' })
    expect(team?.options.label instanceof Function ? team.options.label() : team?.options.label).toBe('Team Space')
    expect(game).toMatchObject({ locale: 'team-battle' })
    expect(b.ctx.slots.entries('shell.overlay').find(entry => entry.component === RootTeamSpace)).toBeDefined()
    expect(b.ctx.slots.entries('sidebar.footer.action').find(entry => entry.component === TeamSpaceEntry)).toBeDefined()
    expect(b.remote.mount).toHaveBeenCalledWith(REMOTE)

    const actions = (team!.inject as unknown as () => Record<string, (...args: unknown[]) => Promise<unknown>>)()
    await actions.load!()
    await actions.createTask!({ title: 'Ship', description: 'Together', weight: 5 })
    await actions.consumeWeapon!({ weaponId: 'weapon-1' })
    await actions.space!()
    await actions.sendFile!({ fileId: 'file-1', expectedRevision: 1 })
    expect(b.calls.map(call => call.method)).toEqual(['view', 'createTask', 'consumeWeapon', 'space', 'sendFile'])

    await b.dispose!()
    expect(b.ctx.slots.entries('conversation.view').find(entry => entry.component === TeamSpaceView)).toBeUndefined()
    expect(b.ctx.slots.entries('shell.overlay').find(entry => entry.component === RootTeamSpace)).toBeUndefined()
    expect(b.ctx.slots.entries('sidebar.footer.action').find(entry => entry.component === TeamSpaceEntry)).toBeUndefined()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
    b.root()
  })

  it('unmounts the Remote when a later Client registration fails', async () => {
    const b = await bench(true)
    await expect(b.activation).rejects.toThrow('slot failure')
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
    b.root()
  })
})
