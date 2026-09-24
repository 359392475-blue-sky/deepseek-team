// @vitest-environment jsdom
/** Workspace association controls member visibility before and after a first message. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TeamBattleView, TeamBattleTeamSummary, TeamBattleProjectId, TeamBattleMemberId } from '@deepseek-ai/dsh-experimental-team-battle/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { TeamConversationMembers, TeamHomeActions, TeamProjectSidebar } from '../src/client/TeamNavigation.tsx'
import { RootTeamSpace, createTeamSpaceNavigation } from '../src/client/RootTeamSpace.tsx'
import { en as teamEn } from '../src/client/locales.ts'
import { navEn } from '../src/client/navigation-locales.ts'
import type { TeamBattleInjected, TeamCollaborationInjected, TeamJourneyInjected } from '../src/client/actions.ts'

afterEach(cleanup)
const sessionId = 'blank-project-session' as SessionId
const workspaceId = 'local-project' as WorkspaceId
const memberId = 'blue' as TeamBattleMemberId
const revokedId = 'revoked' as TeamBattleMemberId
const team: TeamBattleTeamSummary = {
  id: 'real-team' as TeamBattleProjectId, name: 'Hardware study', goal: 'Review needs', mode: 'joined',
  localMemberId: memberId, ownerMemberId: memberId, storageLocation: 'Shared server', invites: [],
  memberAccess: [{ memberId, status: 'active' }, { memberId: revokedId, status: 'revoked' }],
}
const view: TeamBattleView = {
  revision: 1, localMemberId: memberId, simulationEnabled: false,
  project: { id: team.id, name: team.name, goal: team.goal },
  members: [
    { id: memberId, name: 'Blue', role: 'Product', status: 'online' },
    { id: revokedId, name: 'Revoked colleague', role: 'QA', status: 'offline' },
  ],
  tasks: [], contexts: [], artifacts: [], activity: [], weaponGrants: [],
  progress: { acceptedWeight: 0, totalWeight: 0, percent: 0, coreHp: 100, coreMaxHp: 100 },
  combatShield: { hp: 100, maxHp: 100 },
}

function teamJourney(overrides: Partial<TeamJourneyInjected> = {}): TeamJourneyInjected {
  return {
    summary: vi.fn(), teams: vi.fn(), createTeam: vi.fn(), joinRemote: vi.fn(), createInvite: vi.fn(),
    revokeInvite: vi.fn(), revokeMember: vi.fn(), ...overrides,
  }
}

it('shows active members in a linked blank session and removes them when a private workspace is selected', async () => {
  let linked = true
  const collaboration: TeamCollaborationInjected = {
    workspaceLinks: vi.fn(async () => ({ ok: true as const, value: [{ teamId: team.id, workspaceId }] })),
    bindWorkspace: vi.fn(), openWorkspace: vi.fn(), createWorkspace: vi.fn(),
  }
  const summary = vi.fn(async () => ({ ok: true as const, value: team }))
  const journey = teamJourney({ summary })
  const load = vi.fn(async () => ({ ok: true as const, value: view }))
  const props = {
    sessionId, collaboration, journey, load, t: makeTranslate(navEn, commonEn),
    useWorkspaces: <T,>(selector: (snapshot: WorkspaceSnapshot) => T): T => selector({
      items: [{ workspaceId: linked ? workspaceId : 'private-workspace' as WorkspaceId, title: 'Project', path: '/local/project', sessionIds: [sessionId], createdAt: '', updatedAt: '' }],
      archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    }),
  } as Parameters<typeof TeamConversationMembers>[0]
  const rendered = render(<TeamConversationMembers {...props} />)
  expect(await screen.findByText('Blue')).toBeTruthy()
  expect(screen.getByText('Hardware study')).toBeTruthy()
  expect(screen.queryByText('Revoked colleague')).toBeNull()
  linked = false
  rendered.rerender(<TeamConversationMembers {...props} />)
  expect(screen.queryByText('Blue')).toBeNull()
  await waitFor(() => { expect(collaboration.workspaceLinks).toHaveBeenCalledTimes(2) })
  expect(load).toHaveBeenCalledOnce()
})

it('opens create and join from the home page without sending a private message', () => {
  const selectPanel = vi.fn()
  const navigation = createTeamSpaceNavigation(false, selectPanel)
  render(<TeamHomeActions navigation={navigation} t={makeTranslate(navEn, commonEn)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Create team project' }))
  expect(navigation.getSelection().page).toBe('create')
  fireEvent.click(screen.getByRole('button', { name: 'Join by invitation link' }))
  expect(navigation.getSelection().page).toBe('join')
  expect(selectPanel).toHaveBeenLastCalledWith(true)
})

it('keeps the invitation step mounted when creation selects its new team', () => {
  const navigation = createTeamSpaceNavigation(false)
  navigation.open('create')
  const revision = navigation.getSelection().revision
  navigation.consumePage(revision)
  navigation.select(team)
  expect(navigation.getSelection().revision).toBe(revision)
  expect(navigation.getSelection().teamId).toBe(team.id)
  expect(navigation.getSelection().page).toBeUndefined()
  navigation.reflect(true)
  navigation.close()
  expect(navigation.getSnapshot()).toBe(false)
})


it('asks for a local folder before opening an unlinked project conversation', async () => {
  const collaboration: TeamCollaborationInjected = {
    workspaceLinks: vi.fn(async () => ({ ok: true as const, value: [] })),
    bindWorkspace: vi.fn<TeamCollaborationInjected['bindWorkspace']>(async input => ({ ok: true, value: [input] })),
    openWorkspace: vi.fn(), createWorkspace: vi.fn(),
  }
  const journey = teamJourney({ teams: async () => ({ ok: true, value: { teams: [team], hosting: { running: false, origins: [] } } }) })
  const props = {
    collaboration, journey, wide: true, navigation: createTeamSpaceNavigation(false), t: makeTranslate(navEn, commonEn),
    useWorkspaces: <T,>(selector: (snapshot: WorkspaceSnapshot) => T): T => selector({
      items: [{ workspaceId, title: 'Local hardware folder', path: '/local/project', sessionIds: [], createdAt: '', updatedAt: '' }],
      archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    }),
  } as Parameters<typeof TeamProjectSidebar>[0]
  render(<TeamProjectSidebar {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open project conversation · Hardware study' }))
  const dialog = await screen.findByRole('dialog', { name: 'Choose a local project folder' })
  expect(dialog).toBeTruthy()
  expect(collaboration.bindWorkspace).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Local hardware folder' }))
  await waitFor(() => { expect(collaboration.openWorkspace).toHaveBeenCalledWith(workspaceId) })
  expect(collaboration.bindWorkspace).toHaveBeenCalledWith({ teamId: team.id, workspaceId })
  expect(screen.queryByRole('dialog')).toBeNull()
})


it.each(['create', 'join'] as const)('keeps %s closed after leaving and returning to the team panel', async (page) => {
  const navigation = createTeamSpaceNavigation(false)
  navigation.select(team)
  navigation.open(page)
  const actions: TeamBattleInjected = {
    load: async () => ({ ok: true, value: view }),
    space: async () => ({ ok: true, value: { revision: 1, folders: [], files: [], deliveries: [], limits: {
      maxFileBytes: 100, maxTotalFileBytes: 1000, maxItems: 10, maxDeliveries: 10,
    } } }),
    createFolder: vi.fn(), publishFile: vi.fn(), updateSpaceItem: vi.fn(), readFile: vi.fn(), sendFile: vi.fn(),
    submitFile: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), publishContext: vi.fn(), publishArtifact: vi.fn(),
    reviewArtifact: vi.fn(), consumeWeapon: vi.fn(), heartbeat: vi.fn(),
  }
  const journey = teamJourney({
    teams: async () => ({ ok: true, value: { teams: [team], hosting: { running: false, origins: [] } } }),
    summary: async () => ({ ok: true, value: team }),
  })
  const props = { ...actions, journey, navigation, t: makeTranslate(teamEn, commonEn) } as Parameters<typeof RootTeamSpace>[0]
  const first = render(<RootTeamSpace {...props} />)
  expect(await screen.findByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  first.unmount()
  navigation.close()
  navigation.reflect(true)
  render(<RootTeamSpace {...props} />)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(navigation.getSelection().teamId).toBe(team.id)
})
