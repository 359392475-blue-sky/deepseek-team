// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TeamBattleSpaceView, TeamBattleTeamSummary, TeamBattleView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import { TeamBattleActivityId, TeamBattleArtifactId, TeamBattleContextId, TeamBattleFileId, TeamBattleFolderId, TeamBattleMemberId, TeamBattleProjectId, TeamBattleTaskId } from '@deepseek-ai/dsh-experimental-team-battle/src/types.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TeamBattleInjected, TeamJourneyInjected } from '../src/client/actions.ts'
import { en, zh } from '../src/client/locales.ts'
import { TeamDirectory } from '../src/client/TeamDirectory.tsx'
import { useLiveProjection } from '../src/client/useLiveProjection.ts'
import { TeamSpaceScreen, TeamSpaceView, type TeamSpaceViewProps } from '../src/client/TeamSpaceView.tsx'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear() })

const SESSION = 'team-space-session' as SessionId
const now = Date.now()
const view: TeamBattleView = {
  revision: 9,
  localMemberId: TeamBattleMemberId('product'),
  simulationEnabled: false,
  project: { id: TeamBattleProjectId('project-1'), name: 'DeepSeek Harness Team', goal: 'Ship a real collaboration space' },
  members: [
    { id: TeamBattleMemberId('product'), name: 'Blue', role: 'Product', status: 'online', color: '#1357c5', lastSeenAt: now },
    { id: TeamBattleMemberId('engineering'), name: 'Engineering', role: 'Engineering', status: 'idle', lastSeenAt: now },
    { id: TeamBattleMemberId('quality'), name: 'Quality', role: 'QA', status: 'offline' },
    { id: TeamBattleMemberId('design'), name: 'Design', role: 'UI', status: 'online', lastSeenAt: now },
  ],
  tasks: [
    { id: TeamBattleTaskId('task-open'), revision: 1, title: 'Open task', description: 'Needs an owner', weight: 3, status: 'open', createdByMemberId: TeamBattleMemberId('product'), createdAt: now, updatedAt: now },
    { id: TeamBattleTaskId('task-local'), revision: 3, title: 'Local work', description: 'Owned here', weight: 2, status: 'in_progress', ownerMemberId: TeamBattleMemberId('product'), createdByMemberId: TeamBattleMemberId('product'), createdAt: now, updatedAt: now },
    { id: TeamBattleTaskId('task-other'), revision: 2, title: 'Other work', description: 'Owned elsewhere', weight: 4, status: 'in_progress', ownerMemberId: TeamBattleMemberId('engineering'), createdByMemberId: TeamBattleMemberId('engineering'), createdAt: now, updatedAt: now },
    { id: TeamBattleTaskId('task-review'), revision: 2, title: 'Review task', description: 'Waiting for review', weight: 5, status: 'submitted', ownerMemberId: TeamBattleMemberId('product'), createdByMemberId: TeamBattleMemberId('product'), createdAt: now, updatedAt: now },
    { id: TeamBattleTaskId('task-done'), revision: 4, title: 'Completed task', description: 'Accepted work', weight: 8, status: 'completed', ownerMemberId: TeamBattleMemberId('product'), createdByMemberId: TeamBattleMemberId('product'), createdAt: now, updatedAt: now },
  ],
  contexts: [{ id: TeamBattleContextId('context-1'), summary: 'Use one project aggregate', decisions: ['Use CAS'], blockers: [], nextSteps: ['Ship UI'], sourceRefs: ['AGENT-NOTE'], createdByMemberId: TeamBattleMemberId('product'), createdAt: now }],
  artifacts: [{ id: TeamBattleArtifactId('artifact-1'), revision: 1, taskId: TeamBattleTaskId('task-review'), name: 'demo.md', mediaType: 'text/markdown', uri: 'https://example.test/demo.md', sha256: 'a'.repeat(64), bytes: 120, createdByMemberId: TeamBattleMemberId('engineering'), createdAt: now, review: { status: 'pending' } }],
  activity: [{ id: TeamBattleActivityId('activity-1'), type: 'task_created', memberId: TeamBattleMemberId('product'), createdAt: now }],
  weaponGrants: [],
  progress: { acceptedWeight: 8, totalWeight: 16, percent: 50, coreHp: 50, coreMaxHp: 100 },
  combatShield: { hp: 73, maxHp: 100 },
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
const space: TeamBattleSpaceView = {
  revision: 2,
  folders: [{ id: TeamBattleFolderId('folder-1'), name: 'Product', revision: 1, createdByMemberId: TeamBattleMemberId('product'), createdAt: now, updatedAt: now }],
  files: [{ id: TeamBattleFileId('file-1'), name: 'flight.png', revision: 1, mediaType: 'image/png', bytes: 68, sha256: 'b'.repeat(64), versionLabel: 'v1.2', source: 'Design Codex', note: 'Approved flight deck', createdByMemberId: TeamBattleMemberId('design'), createdAt: now, updatedAt: now }],
  deliveries: [],
  limits: { maxFileBytes: 2_097_152, maxTotalFileBytes: 33_554_432, maxItems: 512, maxDeliveries: 512 },
}

function actions(overrides: Partial<TeamBattleInjected> = {}): TeamBattleInjected {
  const success = () => Promise.resolve({ ok: true as const, value: view })
  return {
    space: () => Promise.resolve({ ok: true, value: space }),
    createFolder: () => Promise.resolve({ ok: true, value: space }),
    publishFile: () => Promise.resolve({ ok: true, value: space }),
    updateSpaceItem: () => Promise.resolve({ ok: true, value: space }),
    readFile: () => Promise.resolve({ ok: true, value: { file: space.files[0]!, contentBase64: PNG } }),
    sendFile: () => Promise.resolve({ ok: true, value: space }),
    submitFile: success,
    load: success,
    createTask: success,
    updateTask: success,
    publishContext: success,
    publishArtifact: success,
    reviewArtifact: success,
    consumeWeapon: success,
    heartbeat: success,
    ...overrides,
  }
}

const legacyTeam: TeamBattleTeamSummary = {
  id: 'legacy-team' as TeamBattleTeamSummary['id'], name: view.project.name, goal: view.project.goal,
  mode: 'legacy', localMemberId: view.localMemberId, ownerMemberId: view.members[1]!.id,
  storageLocation: 'Local Team Battle storage', invites: [], memberAccess: [],
}
function journeyActions(overrides: Partial<TeamJourneyInjected> = {}): TeamJourneyInjected {
  return {
    teams: () => Promise.resolve({ ok: true, value: { teams: [legacyTeam], hosting: { running: false, origins: [] } } }),
    summary: () => Promise.resolve({ ok: true, value: legacyTeam }),
    createTeam: () => Promise.resolve({ ok: true, value: legacyTeam }),
    joinRemote: () => Promise.resolve({ ok: true, value: legacyTeam }),
    createInvite: () => Promise.reject(new Error('No invitation fixture configured')),
    revokeInvite: () => Promise.resolve({ ok: true, value: legacyTeam }),
    revokeMember: () => Promise.resolve({ ok: true, value: legacyTeam }),
    ...overrides,
  }
}
function props(injected: TeamBattleInjected): TeamSpaceViewProps {
  return {
    sessionId: SESSION,
    journey: journeyActions(),
    t: makeTranslate(en, commonEn),
    viewRequest: null,
    openView: () => {},
    completeViewRequest: () => {},
    ...injected,
  } as TeamSpaceViewProps
}

describe('TeamSpaceView', () => {
  it('shows all four members and keeps real progress separate from the leisure shield', async () => {
    render(<TeamSpaceView {...props(actions())} />)
    expect(await screen.findByText('DeepSeek Harness Team')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish to Team Space' })).toBeTruthy()
    expect(screen.getByText('3 members online')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.queryByText('50/100')).toBeNull()
    expect(screen.queryByText('73/100')).toBeNull()
    expect(screen.getByRole('region', { name: 'My team' })?.querySelectorAll('article')).toHaveLength(4)
    expect(within(screen.getByRole('region', { name: 'My team' })).getByText('Blue').closest('article')?.hasAttribute('data-local')).toBe(true)
    expect(screen.queryByText('/ 128')).toBeNull()
    expect(screen.queryByLabelText('Acting member')).toBeNull()
  })

  it('shows only task transitions accepted by the authoritative lifecycle', async () => {
    render(<TeamSpaceView {...props(actions())} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    const open = within(screen.getByText('Open task').closest('article')!)
    expect(open.getByRole('button', { name: 'Claim' })).toBeTruthy()
    expect(open.getByRole('button', { name: /Edit/u })).toBeTruthy()
    expect(open.getByRole('button', { name: /Delete/u })).toBeTruthy()
    expect(open.queryByRole('button', { name: 'Submit' })).toBeNull()

    const local = within(screen.getByText('Local work').closest('article')!)
    expect(local.getByRole('button', { name: 'Release' })).toBeTruthy()
    expect(local.getByRole('button', { name: /Submit/u })).toBeTruthy()
    expect(local.getByRole('button', { name: /Edit/u })).toBeTruthy()
    expect(local.getByRole('button', { name: /Delete/u })).toBeTruthy()

    const other = within(screen.getByText('Other work').closest('article')!)
    expect(other.getByRole('button', { name: 'Copy task for my AI' })).toBeTruthy()
    expect(other.queryByRole('button', { name: 'Hand off task' })).toBeNull()

    const submitted = within(screen.getByText('Review task').closest('article')!)
    expect(submitted.getByRole('button', { name: 'Reopen' })).toBeTruthy()
    expect(submitted.queryByRole('button', { name: /Edit/u })).toBeNull()
    expect(submitted.queryByRole('button', { name: /Delete/u })).toBeNull()

    const completed = within(screen.getByText('Completed task').closest('article')!)
    expect(completed.queryAllByRole('button')).toHaveLength(0)
  })

  it('guides a returned task to publish a new file instead of submitting its rejected history', async () => {
    const returned: TeamBattleView = {
      ...view,
      artifacts: [{
        ...view.artifacts[0]!, taskId: view.tasks[1]!.id,
        createdByMemberId: view.localMemberId,
        review: { status: 'rejected', note: 'Address the missing empty state' },
      }],
    }
    const updateTask = vi.fn(actions().updateTask)
    render(<TeamSpaceView {...props(actions({
      load: () => Promise.resolve({ ok: true, value: returned }), updateTask,
    }))} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    const card = within(screen.getByText('Local work').closest('article')!)
    expect(card.getByText('Publish a file and submit it to this task before another member can review it.')).toBeTruthy()
    expect(card.queryByRole('button', { name: 'Delete' })).toBeNull()
    fireEvent.click(card.getByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByRole('dialog', { name: 'Publish to Team Space' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Files' }).getAttribute('aria-current')).toBe('page')
    expect(updateTask).not.toHaveBeenCalled()
  })

  it.each(['en', 'zh'] as const)('copies the task with published decisions, files, and revision feedback (%s)', async (locale) => {
    const dictionary = locale === 'zh' ? zh : en
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const returned: TeamBattleView = {
      ...view,
      contexts: [
        { ...view.contexts[0]!, id: 'later-context' as TeamBattleView['contexts'][number]['id'], summary: 'Current acceptance criteria', decisions: ['Support keyboard and touch'], blockers: ['Pause is missing'], nextSteps: ['Fix the pause button'], sourceRefs: ['requirements.md'], createdAt: now + 1 },
        view.contexts[0]!,
      ],
      artifacts: [{ ...view.artifacts[0]!, taskId: view.tasks[1]!.id, review: { status: 'rejected', note: 'Pause before restarting' } }],
    }
    const versionFolder = { ...space.folders[0]!, id: 'folder-version' as typeof space.folders[0]['id'], name: 'v2.0', parentId: space.folders[0]!.id }
    const versionedSpace: TeamBattleSpaceView = {
      ...space, folders: [...space.folders, versionFolder],
      files: [...space.files, {
        ...space.files[0]!, id: 'file-revision' as typeof space.files[0]['id'],
        parentId: versionFolder.id, versionLabel: 'v2.0', note: 'Revised controls',
      }],
    }
    const fixture = props(actions({
      load: () => Promise.resolve({ ok: true, value: returned }),
      space: () => Promise.resolve({ ok: true, value: versionedSpace }),
    }))
    render(<TeamSpaceView {...fixture} t={makeTranslate(dictionary, commonEn)} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: dictionary['tabs.tasks'] }))
    fireEvent.click(within(screen.getByText('Local work').closest('article')!).getByRole('button', { name: dictionary['journey.copyTask'] }))
    await screen.findByText(dictionary['journey.copyTaskHint'])
    const copied = writeText.mock.calls[0]?.[0] as string
    expect(copied).toContain('Ship a real collaboration space')
    expect(copied).toContain('Local work')
    expect(copied).toContain('Use CAS')
    expect(copied.indexOf('Use one project aggregate')).toBeLessThan(copied.indexOf('Current acceptance criteria'))
    expect(copied).toContain('Support keyboard and touch')
    expect(copied).toContain('Pause is missing')
    expect(copied).toContain('Fix the pause button')
    expect(copied).toContain('requirements.md')
    expect(copied).toContain('/flight.png (v1.2;')
    expect(copied).toContain('/Product/v2.0/flight.png (v2.0;')
    expect(copied).toContain('file-1')
    expect(copied).toContain('file-revision')
    expect(copied).toContain('Pause before restarting')
    expect(copied).not.toContain('Other work')
    expect(copied).toMatchSnapshot()
  })

  it('lets a colleague copy all shared work before selecting a task and recover from clipboard denial', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied')) } })
    const publishContext = vi.fn(actions().publishContext)
    render(<TeamSpaceView {...props(actions({ publishContext }))} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Meeting notes' }))
    fireEvent.change(screen.getByPlaceholderText('Summary'), { target: { value: 'Private unpublished draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy shared context for my AI' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Copy failed')
    const fallback = screen.getByLabelText<HTMLTextAreaElement>('Shared context for manual copying')
    expect(fallback.readOnly).toBe(true)
    expect(fallback.value).toContain('Open task')
    expect(fallback.value).toContain('Other work')
    expect(fallback.value).toContain('Completed task')
    expect(fallback.value).toContain('Use one project aggregate')
    expect(fallback.value).not.toContain('Private unpublished draft')
    fireEvent.focus(fallback)
    expect(fallback.selectionEnd).toBe(fallback.value.length)
    expect(publishContext).not.toHaveBeenCalled()
  })

  it('confirms a shared-context copy without requiring a clipboard fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<TeamSpaceView {...props(actions())} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Meeting notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy shared context for my AI' }))
    expect((await screen.findByRole('status')).textContent).toContain('Shared context copied')
    expect(screen.queryByLabelText('Shared context for manual copying')).toBeNull()
  })

  it('waits for the shared file list before offering a complete context copy', async () => {
    let finishSpace: (value: Awaited<ReturnType<TeamBattleInjected['space']>>) => void = () => {}
    const readSpace: TeamBattleInjected['space'] = () => new Promise((resolve) => { finishSpace = resolve })
    render(<TeamSpaceView {...props(actions({ space: readSpace }))} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Meeting notes' }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Copy shared context for my AI' }).disabled).toBe(true)
    await act(async () => { finishSpace({ ok: true, value: space }) })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Copy shared context for my AI' }).disabled).toBe(false)
  })

  it('renders live Remote transport failures instead of leaving rejected polling promises unhandled', async () => {
    render(<TeamSpaceView {...props(actions({
      load: () => Promise.reject(new Error('view transport failed')),
    }))} />)
    expect(await screen.findByText('view transport failed')).toBeTruthy()
  })

  it('absorbs pending view and heartbeat disconnects after unmount', async () => {
    let rejectLoad: (reason?: unknown) => void = () => {}
    let rejectHeartbeat: (reason?: unknown) => void = () => {}
    const load = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectLoad = reject }))
    const heartbeat = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectHeartbeat = reject }))
    const rendered = render(<TeamSpaceView {...props(actions({ load, heartbeat }))} />)
    await waitFor(() => {
      expect(load).toHaveBeenCalledOnce()
      expect(heartbeat).toHaveBeenCalledOnce()
    })
    rendered.unmount()
    rejectLoad(new Event('disconnect'))
    rejectHeartbeat(new Event('disconnect'))
    await Promise.resolve()
    await Promise.resolve()
  })

  it('routes task create, claim, edit-state delete, Context, artifact, and review through Remote actions', async () => {
    const createTask = vi.fn(actions().createTask)
    const updateTask = vi.fn(actions().updateTask)
    const publishContext = vi.fn(actions().publishContext)
    const publishArtifact = vi.fn(actions().publishArtifact)
    const reviewArtifact = vi.fn(actions().reviewArtifact)
    render(<TeamSpaceView {...props(actions({ createTask, updateTask, publishContext, publishArtifact, reviewArtifact }))} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))

    fireEvent.click(screen.getByRole('button', { name: /New task/u }))
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'New shared task' } })
    fireEvent.change(screen.getByPlaceholderText('Task description'), { target: { value: 'Coordinate implementation' } })
    const weight = screen.getByLabelText('Progress weight')
    expect(weight.getAttribute('max')).toBeNull()
    fireEvent.change(weight, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => { expect(createTask).toHaveBeenCalledWith({ title: 'New shared task', description: 'Coordinate implementation', weight: 7 }) })

    const openTask = screen.getByText('Open task').closest('article')!
    fireEvent.click(within(openTask).getByRole('button', { name: 'Claim' }))
    await waitFor(() => { expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-open', expectedRevision: 1, action: 'claim' })) })
    fireEvent.click(within(openTask).getByRole('button', { name: 'Delete' }))
    await waitFor(() => { expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-open', action: 'delete' })) })

    fireEvent.click(screen.getByRole('button', { name: 'Meeting notes' }))
    fireEvent.change(screen.getByPlaceholderText('Summary'), { target: { value: 'Published decision' } })
    fireEvent.change(screen.getByPlaceholderText(/Decisions/u), { target: { value: 'Use Remote\nKeep CAS' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => { expect(publishContext).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Published decision', decisions: ['Use Remote', 'Keep CAS'] })) })

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    const externalLink = screen.getByText('Submit external artifact link')
    const disclosure = externalLink.closest('details')!
    expect(disclosure.open).toBe(false)
    const reviewCard = screen.getByText('demo.md').closest('article')!
    expect(within(reviewCard).getByText('Review task')).toBeTruthy()
    expect(within(reviewCard).queryByText('Version')).toBeNull()
    expect(reviewCard.textContent).not.toContain(' · v1 · ')
    expect(reviewCard.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(externalLink)
    const artifactTask = within(disclosure).getByRole('combobox') as HTMLSelectElement
    expect(Array.from(artifactTask.options, option => option.value)).toEqual(['', 'task-local', 'task-review'])
    fireEvent.change(artifactTask, { target: { value: 'task-review' } })
    fireEvent.change(screen.getByPlaceholderText('Artifact name'), { target: { value: 'flight.md' } })
    fireEvent.change(screen.getByPlaceholderText('Artifact URI'), { target: { value: 'https://example.test/flight.md' } })
    fireEvent.change(screen.getByPlaceholderText('SHA-256'), { target: { value: 'b'.repeat(64) } })
    fireEvent.change(screen.getByPlaceholderText('Bytes'), { target: { value: '2048' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => { expect(publishArtifact).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-review', name: 'flight.md', bytes: 2048 })) })
    fireEvent.change(screen.getByPlaceholderText('Review note'), { target: { value: 'Verified' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => { expect(reviewArtifact).toHaveBeenCalledWith({ artifactId: 'artifact-1', expectedRevision: 1, decision: 'accepted', note: 'Verified' }) })
  })
})

describe('Team Space files', () => {
  it('publishes actual selected bytes with version and upload source', async () => {
    const otherFile = { ...space.files[0]!, id: 'file-other' as typeof space.files[0]['id'], name: 'someone-else.png' }
    const ownFile = { ...space.files[0]!, id: 'file-own' as typeof space.files[0]['id'], name: 'notes.txt', mediaType: 'text/plain' }
    const publishFile = vi.fn(() => Promise.resolve({
      ok: true as const, value: { ...space, files: [...space.files, otherFile, ownFile] },
    }))
    const readFile = vi.fn(actions().readFile)
    render(<TeamSpaceView {...props(actions({ publishFile, readFile }))} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Team Space' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Publish to Team Space' }))
    fireEvent.change(dialog.getByLabelText('Choose file'), { target: { files: [new File(['real bytes'], 'notes.txt', { type: 'text/plain' })] } })
    fireEvent.change(dialog.getByLabelText('Version label'), { target: { value: 'v2.1' } })
    fireEvent.change(dialog.getByLabelText('Note'), { target: { value: 'Reviewed by product' } })
    fireEvent.submit(dialog.getByRole('button', { name: 'Publish' }).closest('form')!)
    await waitFor(() => { expect(publishFile).toHaveBeenCalledWith({ name: 'notes.txt', mediaType: 'text/plain', contentBase64: btoa('real bytes'), versionLabel: 'v2.1', note: 'Reviewed by product', source: 'Browser upload' }) })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(screen.getByRole('complementary', { name: 'notes.txt' })).toBeTruthy()
    await waitFor(() => { expect(readFile).toHaveBeenLastCalledWith({ fileId: 'file-own' }) })
  })

  it.each(['flight.png', 'Product'])('rejects a sibling name before reading or uploading bytes (%s)', async (name) => {
    const publishFile = vi.fn(actions().publishFile)
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    try {
      render(<TeamSpaceView {...props(actions({ publishFile }))} />)
      await screen.findByText('DeepSeek Harness Team')
      fireEvent.click(screen.getByRole('button', { name: 'Publish to Team Space' }))
      const dialog = within(screen.getByRole('dialog'))
      const chosen = new File(['new contents'], name, { type: 'text/plain' })
      const input = dialog.getByLabelText<HTMLInputElement>('Choose file')
      fireEvent.change(input, { target: { files: [chosen] } })
      fireEvent.change(dialog.getByLabelText('Version label'), { target: { value: 'v2.0' } })
      fireEvent.submit(dialog.getByRole('button', { name: 'Publish' }).closest('form')!)
      expect(dialog.getByRole('alert').textContent).toBe(en['files.nameConflict'])
      expect(dialog.getByLabelText<HTMLInputElement>('Name').value).toBe(name)
      expect(dialog.getByLabelText<HTMLInputElement>('Version label').value).toBe('v2.0')
      expect(input.files?.[0]).toBe(chosen)
      expect(read).not.toHaveBeenCalled()
      expect(publishFile).not.toHaveBeenCalled()
    } finally { read.mockRestore() }
  })

  it.each(['en', 'zh'] as const)('keeps a conflicting publication ready for a renamed retry (%s)', async (locale) => {
    const dictionary = locale === 'zh' ? zh : en
    const published = { ...space.files[0]!, id: 'file-retry' as typeof space.files[0]['id'], name: 'notes-v2.txt', mediaType: 'text/plain' }
    const publishFile = vi.fn<TeamBattleInjected['publishFile']>()
      .mockResolvedValueOnce({ ok: false, error: new RemoteError('team-battle/name-conflict', 'A sibling already has this name', { httpStatus: 409 }) })
      .mockResolvedValueOnce({ ok: true, value: { ...space, files: [...space.files, published] } })
    render(<TeamSpaceView {...props(actions({ publishFile }))} t={makeTranslate(dictionary, commonEn)} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: dictionary['files.publish'] }))
    const dialog = within(screen.getByRole('dialog'))
    const input = dialog.getByLabelText<HTMLInputElement>(dictionary['files.chooseFile'])
    const chosen = new File(['revised requirements'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [chosen] } })
    fireEvent.change(dialog.getByLabelText(dictionary['files.versionLabel']), { target: { value: 'v2.0' } })
    fireEvent.change(dialog.getByLabelText(dictionary['files.note']), { target: { value: 'Revised after review' } })
    fireEvent.change(dialog.getByLabelText(dictionary['files.source']), { target: { value: 'My DeepSeek' } })
    fireEvent.submit(dialog.getByRole('button', { name: dictionary['common.save'] }).closest('form')!)
    expect((await dialog.findByRole('alert')).textContent).toBe(dictionary['files.nameConflict'])
    expect({ versionHint: dialog.getByText(dictionary['files.versionHint']).textContent, failure: dialog.getByRole('alert').textContent }).toMatchSnapshot()
    expect(dialog.getByLabelText<HTMLInputElement>(dictionary['files.name']).value).toBe('notes.txt')
    expect(dialog.getByLabelText<HTMLInputElement>(dictionary['files.versionLabel']).value).toBe('v2.0')
    expect(dialog.getByLabelText<HTMLTextAreaElement>(dictionary['files.note']).value).toBe('Revised after review')
    expect(dialog.getByLabelText<HTMLInputElement>(dictionary['files.source']).value).toBe('My DeepSeek')
    expect(input.files?.[0]).toBe(chosen)
    expect(screen.queryByText(/A sibling already has this name/u)).toBeNull()
    fireEvent.change(dialog.getByLabelText(dictionary['files.name']), { target: { value: 'notes-v2.txt' } })
    fireEvent.submit(dialog.getByRole('button', { name: dictionary['common.save'] }).closest('form')!)
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(publishFile).toHaveBeenCalledTimes(2)
    expect(publishFile).toHaveBeenLastCalledWith({ name: 'notes-v2.txt', mediaType: 'text/plain', contentBase64: btoa('revised requirements'), versionLabel: 'v2.0', note: 'Revised after review', source: 'My DeepSeek' })
    expect(screen.getByRole('button', { name: 'flight.png' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'notes-v2.txt' })).toBeTruthy()
  })

  it('allows the same file name in a different version folder', async () => {
    const publishFile = vi.fn(actions().publishFile)
    render(<TeamSpaceView {...props(actions({ publishFile }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Product' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish to Team Space' })[0]!)
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Choose file'), { target: { files: [new File(['revision'], 'flight.png', { type: 'image/png' })] } })
    fireEvent.change(dialog.getByLabelText('Version label'), { target: { value: 'v2.0' } })
    fireEvent.submit(dialog.getByRole('button', { name: 'Publish' }).closest('form')!)
    await waitFor(() => { expect(publishFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'flight.png', parentId: 'folder-1', versionLabel: 'v2.0' })) })
  })

  it('enforces the server upload ceiling before reading or uploading file bytes', async () => {
    const publishFile = vi.fn(actions().publishFile)
    const tinySpace = { ...space, limits: { ...space.limits, maxFileBytes: 2 } }
    render(<TeamSpaceView {...props(actions({ publishFile, space: () => Promise.resolve({ ok: true, value: tinySpace }) }))} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Team Space' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Choose file'), { target: { files: [new File(['too large'], 'notes.txt', { type: 'text/plain' })] } })
    fireEvent.submit(dialog.getByRole('button', { name: 'Publish' }).closest('form')!)
    expect((await dialog.findByRole('alert')).textContent).toContain('exceeds the upload limit')
    expect(publishFile).not.toHaveBeenCalled()
  })

  it('opens folders, creates within the current folder, and returns through breadcrumbs', async () => {
    const createFolder = vi.fn(actions().createFolder)
    render(<TeamSpaceView {...props(actions({ createFolder }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Product' }))
    expect(screen.getByText('No files here yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Folder name'), { target: { value: 'Decisions' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Publish' }))
    await waitFor(() => { expect(createFolder).toHaveBeenCalledWith({ name: 'Decisions', parentId: 'folder-1' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Team Space' }))
    expect(await screen.findByRole('button', { name: 'flight.png' })).toBeTruthy()
  })

  it('renames with the item revision and displays a real stale-write failure', async () => {
    const updateSpaceItem = vi.fn(() => Promise.resolve({ ok: false as const, error: new RemoteError('gateway/bad-request', 'File changed on another client', {}) }))
    render(<TeamSpaceView {...props(actions({ updateSpaceItem }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for flight.png' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Rename' }))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'release.png' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save name' }))
    await waitFor(() => { expect(updateSpaceItem).toHaveBeenCalledWith({ kind: 'file', id: 'file-1', expectedRevision: 1, action: 'rename', name: 'release.png' }) })
    expect((await dialog.findByRole('alert')).textContent).toContain('File changed on another client (gateway/bad-request)')
    expect(screen.getByRole('button', { name: 'flight.png' })).toBeTruthy()
  })

  it('previews raster bytes and reports queued delivery without claiming Codex receipt', async () => {
    const queued: TeamBattleSpaceView = {
      ...space,
      deliveries: [{
        id: 'delivery-1' as TeamBattleSpaceView['deliveries'][number]['id'],
        fileId: space.files[0]!.id,
        fileRevision: 1,
        memberId: view.localMemberId,
        createdAt: now,
        status: 'queued',
      }],
    }
    const sendFile = vi.fn(() => Promise.resolve({ ok: true as const, value: queued }))
    render(<TeamSpaceView {...props(actions({ sendFile }))} />)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Preview' }).hasAttribute('disabled')).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(within(screen.getByRole('dialog', { name: 'flight.png' })).getByRole('img', { name: 'flight.png' }).getAttribute('src')).toBe(`data:image/png;base64,${PNG}`)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send to my Codex' }))
    await waitFor(() => { expect(sendFile).toHaveBeenCalledWith({ fileId: 'file-1', expectedRevision: 1 }) })
    expect((await screen.findByRole('status')).textContent).toContain('Queued, waiting for Codex')
    expect(screen.queryByText('Receiver confirmed receipt')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send to my Codex' }).hasAttribute('disabled')).toBe(true)
  })

  it('renders HTML as text and never creates an executable preview document', async () => {
    const html = '<script>window.compromised = true</script><h1>Hello</h1>'
    const file = { ...space.files[0]!, name: 'page.html', mediaType: 'text/html' }
    render(<TeamSpaceView {...props(actions({
      space: () => Promise.resolve({ ok: true, value: { ...space, files: [file] } }),
      readFile: () => Promise.resolve({ ok: true, value: { file, contentBase64: btoa(html) } }),
    }))} />)
    expect(await screen.findByText(html)).toBeTruthy()
    expect(document.querySelector('iframe, object, embed')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
  })

  it('submits a file through the task revision and opens it from review in its parent folder', async () => {
    const nestedFile = { ...space.files[0]!, parentId: space.folders[0]!.id, versionLabel: 'v1.1' }
    const artifact = {
      ...view.artifacts[0]!, id: 'artifact-file' as typeof view.artifacts[0]['id'], revision: 7,
      taskId: view.tasks[1]!.id, name: nestedFile.name, uri: `team-battle-file:${nestedFile.id}`,
    }
    const unsafeArtifact = {
      ...view.artifacts[0]!, id: 'artifact-unsafe' as typeof view.artifacts[0]['id'], uri: 'javascript:alert(1)',
    }
    let currentSpace: TeamBattleSpaceView = { ...space, files: [nestedFile] }
    const submitFile = vi.fn(() => {
      currentSpace = { ...space, files: [{ ...nestedFile, artifactId: artifact.id, taskId: artifact.taskId }] }
      return Promise.resolve({ ok: true as const, value: { ...view, artifacts: [...view.artifacts, artifact, unsafeArtifact] } })
    })
    render(<TeamSpaceView {...props(actions({
      submitFile,
      space: () => Promise.resolve({ ok: true, value: currentSpace }),
    }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Product' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit to task' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Submit to task' }))
    fireEvent.change(dialog.getByLabelText('Choose a task'), { target: { value: 'task-local' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Submit to task' }))
    await waitFor(() => { expect(submitFile).toHaveBeenCalledWith({ fileId: 'file-1', taskId: 'task-local', expectedTaskRevision: 3 }) })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: 'Team Space' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull()
    expect(screen.getAllByRole('link').every(link => link.getAttribute('href')?.startsWith('https://'))).toBe(true)
    const viewInFiles = screen.getByRole('button', { name: 'View in Files' })
    const fileReview = within(viewInFiles.closest('article')!)
    expect(fileReview.getByText('Local work')).toBeTruthy()
    expect(fileReview.getByText('v1.1')).toBeTruthy()
    expect(viewInFiles.closest('article')!.textContent).not.toContain('v7')
    fireEvent.click(viewInFiles)
    expect(screen.getByRole('button', { name: 'Files' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Product' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'flight.png' }).closest('tr')?.hasAttribute('data-selected')).toBe(true)
    expect(screen.getByRole('complementary', { name: 'flight.png' })).toBeTruthy()
  })
})

describe('Team Space request ordering', () => {
  it('keeps one slow read across polling ticks and commits its eventual response', async () => {
    vi.useFakeTimers()
    type Value = { revision: number }
    let resolveRead: (value: { ok: true; value: Value }) => void = () => {}
    const load = vi.fn(() => new Promise<{ ok: true; value: Value }>((resolve) => { resolveRead = resolve }))
    const hook = renderHook(() => useLiveProjection(load, 'member-1'))
    expect(load).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(7_500) })
    expect(load).toHaveBeenCalledOnce()
    expect(hook.result.current.loading).toBe(true)
    await act(async () => { resolveRead({ ok: true, value: { revision: 4 } }); await Promise.resolve() })
    expect(hook.result.current.view).toEqual({ revision: 4 })
    expect(hook.result.current.loading).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500) })
    expect(load).toHaveBeenCalledTimes(2)
    hook.unmount()
  })

  it('suppresses old reads and polling while a write is in flight', async () => {
    type Value = { revision: number }
    let resolveRead: (value: { ok: true; value: Value }) => void = () => {}
    let resolveWrite: (value: { ok: true; value: Value }) => void = () => {}
    const load = vi.fn(() => new Promise<{ ok: true; value: Value }>((resolve) => { resolveRead = resolve }))
    const write = vi.fn(() => new Promise<{ ok: true; value: Value }>((resolve) => { resolveWrite = resolve }))
    const hook = renderHook(() => useLiveProjection(load, 'member-1'))
    await waitFor(() => { expect(load).toHaveBeenCalledOnce() })
    let mutation: Promise<Value | undefined> | undefined
    act(() => { mutation = hook.result.current.mutate(write) })
    expect(hook.result.current.pending).toBe(true)
    await act(async () => { expect(await hook.result.current.refresh()).toBe(false) })
    expect(load).toHaveBeenCalledOnce()
    await act(async () => { resolveWrite({ ok: true, value: { revision: 2 } }); await mutation })
    expect(hook.result.current.view).toEqual({ revision: 2 })
    await act(async () => { resolveRead({ ok: true, value: { revision: 1 } }); await Promise.resolve() })
    expect(hook.result.current.view).toEqual({ revision: 2 })
    expect(hook.result.current.pending).toBe(false)
  })

  it('keeps task form edits while visiting files and meeting notes', async () => {
    render(<TeamSpaceView {...props(actions())} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Work in progress draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Meeting notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByPlaceholderText<HTMLInputElement>('Task title').value).toBe('Work in progress draft')
  })

  it('removes a file only after confirmed deletion succeeds', async () => {
    const updateSpaceItem = vi.fn(() => Promise.resolve({ ok: true as const, value: { ...space, files: [] } }))
    render(<TeamSpaceView {...props(actions({ updateSpaceItem }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for flight.png' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Delete flight.png' }))
    expect(screen.getByRole('button', { name: 'flight.png' })).toBeTruthy()
    expect(updateSpaceItem).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await waitFor(() => { expect(updateSpaceItem).toHaveBeenCalledWith({ kind: 'file', id: 'file-1', expectedRevision: 1, action: 'delete' }) })
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'flight.png' })).toBeNull() })
  })
})


describe('Team Space simulation identity', () => {
  it('keeps two page identities independent and carries the chosen actor through reads and task actions', async () => {
    const engineering = view.members[1]!.id
    const simulation = { ...view, simulationEnabled: true }
    const load = vi.fn<TeamBattleInjected['load']>(input => Promise.resolve({ ok: true, value: { ...simulation, localMemberId: input?.actingMemberId ?? view.localMemberId } }))
    const readSpace = vi.fn(actions().space)
    const readFile = vi.fn(actions().readFile)
    const heartbeat = vi.fn(actions().heartbeat)
    const updateTask = vi.fn<TeamBattleInjected['updateTask']>(input => Promise.resolve({ ok: true, value: { ...simulation, localMemberId: input.actingMemberId ?? view.localMemberId } }))
    const injected = actions({ load, space: readSpace, readFile, heartbeat, updateTask })
    const first = render(<TeamSpaceView {...props(injected)} />)
    const second = render(<TeamSpaceView {...props(injected)} />)
    const a = within(first.container)
    const b = within(second.container)
    const selector = await a.findByLabelText('Acting member')
    await b.findByLabelText('Acting member')
    fireEvent.change(selector, { target: { value: engineering } })
    await waitFor(() => { expect(a.getByLabelText<HTMLSelectElement>('Acting member').value).toBe(engineering) })
    expect(b.getByLabelText<HTMLSelectElement>('Acting member').value).toBe('product')
    expect(load).toHaveBeenCalledWith({ actingMemberId: engineering })
    expect(readSpace).toHaveBeenCalledWith({ actingMemberId: engineering })
    expect(readFile).toHaveBeenCalledWith({ fileId: 'file-1', actingMemberId: engineering })
    expect(heartbeat).toHaveBeenCalledWith({ status: 'online', actingMemberId: engineering })
    fireEvent.click(a.getByRole('button', { name: 'Tasks' }))
    fireEvent.click(within(a.getByText('Open task').closest('article')!).getByRole('button', { name: 'Claim' }))
    await waitFor(() => { expect(updateTask).toHaveBeenCalledWith({ taskId: 'task-open', expectedRevision: 1, action: 'claim', actingMemberId: engineering }) })
    fireEvent.click(a.getByRole('button', { name: 'Review' }))
    expect(a.getByText('Another member must review this artifact.')).toBeTruthy()
    expect(a.queryByRole('button', { name: 'Accept' })).toBeNull()
    fireEvent.click(b.getByRole('button', { name: 'Review' }))
    expect(b.getByRole('button', { name: 'Accept' })).toBeTruthy()
  })
})


describe('server space journey', () => {
  it.each(['en', 'zh'] as const)('creates a project through the configured Host and retains a failed draft (%s)', async (locale) => {
    const dictionary = locale === 'zh' ? zh : en
    const createTeam = vi.fn<TeamJourneyInjected['createTeam']>()
      .mockResolvedValueOnce({ ok: false, error: new RemoteError('team-battle/server-auth-required', 'Creation denied', { httpStatus: 401 }) })
      .mockResolvedValueOnce({ ok: true, value: legacyTeam })
    const select = vi.fn()
    const setPage = vi.fn()
    render(<TeamDirectory page="create" setPage={setPage} close={() => {}} journey={journeyActions({ createTeam })}
      teams={[legacyTeam]} selected={legacyTeam} members={view.members} select={select}
      refresh={() => Promise.resolve()} onConversation={() => {}} t={makeTranslate(dictionary, commonEn)} />)
    const fields = {
      'journey.name': '测试',
      'journey.goal': '竞品调研',
      'journey.memberName': '项目负责人',
    } as const
    for (const [key, value] of Object.entries(fields)) {
      fireEvent.change(screen.getByLabelText(dictionary[key as keyof typeof fields]), { target: { value } })
    }
    fireEvent.change(screen.getByLabelText(dictionary['journey.role']), { target: { value: 'quality' } })
    const dialog = screen.getByRole('dialog', { name: dictionary['journey.create'] })
    expect(within(dialog).queryByRole('navigation')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: dictionary['journey.overview'] })).toBeNull()
    expect(screen.queryByLabelText(dictionary['journey.server'])).toBeNull()
    expect(screen.queryByLabelText(dictionary['journey.serverCode'])).toBeNull()
    expect(within(dialog).getByRole('button', { name: dictionary['files.close'] }).querySelector('svg')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: dictionary['journey.createSubmit'] }))
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain(locale === 'zh' ? '团队服务暂时无法创建项目' : 'The team service cannot create a project')
    expect(error.textContent).not.toContain('team-battle/server-auth-required')
    expect(error.textContent).not.toContain('Creation denied')
    for (const [key, value] of Object.entries(fields)) {
      expect(screen.getByLabelText<HTMLInputElement>(dictionary[key as keyof typeof fields]).value).toBe(value)
    }
    expect(screen.getByLabelText<HTMLSelectElement>(dictionary['journey.role']).value).toBe('quality')
    fireEvent.click(screen.getByRole('button', { name: dictionary['journey.createSubmit'] }))
    await waitFor(() => { expect(select).toHaveBeenCalledWith(legacyTeam) })
    expect(createTeam).toHaveBeenLastCalledWith({
      name: fields['journey.name'], goal: fields['journey.goal'],
      memberName: fields['journey.memberName'], memberRole: dictionary['journey.quality'],
    })
    expect(setPage).toHaveBeenCalledWith('invite')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('copies a one-person invitation link and accepts it in the focused join form', async () => {
    const team: TeamBattleTeamSummary = {
      ...legacyTeam, id: 'shared-team' as TeamBattleTeamSummary['id'], mode: 'joined',
      ownerMemberId: view.localMemberId, hostUrl: 'https://example.test/team',
    }
    const link = 'https://example.test/team/#team=shared-team&token=fixture-invite'
    const createInvite = vi.fn<TeamJourneyInjected['createInvite']>().mockResolvedValue({ ok: true, value: {
      id: 'invite-fixture', teamId: team.id, token: 'fixture-invite',
      memberId: view.members[1]!.id, memberName: 'Lin', memberRole: 'Engineering', status: 'pending',
      inviteCode: link, expiresAt: 1_800_000_000_000,
    } })
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const close = vi.fn()
    const select = vi.fn()
    const joinRemote = vi.fn<TeamJourneyInjected['joinRemote']>().mockResolvedValue({ ok: true, value: team })
    const journey = journeyActions({ createInvite, joinRemote })
    const shared = { setPage: vi.fn(), close, journey, teams: [team], selected: team, members: view.members, select,
      refresh: () => Promise.resolve(), onConversation: () => {}, t: makeTranslate(en, commonEn) }
    const rendered = render(<TeamDirectory {...shared} page="invite" />)
    fireEvent.change(screen.getByLabelText('Colleague name'), { target: { value: 'Lin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate invitation link' }))
    expect((await screen.findByLabelText<HTMLTextAreaElement>('Invitation link')).value).toBe(link)
    fireEvent.click(screen.getByRole('button', { name: 'Copy invitation link' }))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith(link) })
    expect(createInvite).toHaveBeenCalledWith({ teamId: team.id, memberName: 'Lin', memberRole: 'Engineering', origin: team.hostUrl })
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    rendered.rerender(<TeamDirectory {...shared} page="join" />)
    expect(screen.getByRole('dialog', { name: 'Join with an invitation' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Invitation link'), { target: { value: link } })
    fireEvent.click(screen.getByRole('button', { name: 'Join this project' }))
    await waitFor(() => { expect(joinRemote).toHaveBeenCalledWith({ inviteCode: link }) })
    await waitFor(() => { expect(close).toHaveBeenCalledOnce() })
    expect(select).toHaveBeenCalledWith(team)
  })

  it.each(['en', 'zh'] as const)('explains invitation recovery, retains the link, and hides credentials in details (%s)', async (locale) => {
    const dictionary = locale === 'zh' ? zh : en
    const link = 'https://example.test/team/#team=shared-team&token=private-test-token'
    const joinRemote = vi.fn<TeamJourneyInjected['joinRemote']>().mockResolvedValue({
      ok: false, error: new RemoteError('gateway/internal', `HTTP 403: revoked ${link}; token private-test-token`, {}),
    })
    render(<TeamDirectory page="join" setPage={() => {}} close={() => {}} journey={journeyActions({ joinRemote })}
      teams={[legacyTeam]} selected={legacyTeam} members={view.members} select={() => {}}
      refresh={() => Promise.resolve()} onConversation={() => {}} t={makeTranslate(dictionary, commonEn)} />)
    fireEvent.change(screen.getByLabelText(dictionary['journey.inviteCode']), { target: { value: link } })
    fireEvent.click(screen.getByRole('button', { name: dictionary['journey.joinSubmit'] }))
    expect((await screen.findByRole('alert')).textContent).toBe(dictionary['journey.joinFailed'])
    expect(screen.getByRole('alert').textContent).toContain(locale === 'zh' ? '被撤销' : 'revoked')
    expect(screen.getByRole('alert').textContent).not.toContain('gateway/internal')
    expect(screen.getByLabelText<HTMLInputElement>(dictionary['journey.inviteCode']).value).toBe(link)
    const details = screen.getByText(dictionary['journey.errorDetails']).closest('details')!
    expect(details.open).toBe(false)
    expect(details.textContent).toContain('HTTP 403')
    expect(details.textContent).toContain(dictionary['journey.inviteRedacted'])
    expect(details.textContent).not.toContain('private-test-token')
    fireEvent.change(screen.getByLabelText(dictionary['journey.inviteCode']), { target: { value: '' } })
    expect(details.textContent).not.toContain('private-test-token')
  })

  it('opens the shell-selected project and shows only active collaborators without a second sidebar', async () => {
    const team: TeamBattleTeamSummary = {
      ...legacyTeam, id: 'shell-selected' as TeamBattleTeamSummary['id'], name: 'Shared hardware research', mode: 'joined',
      memberAccess: [{ memberId: view.localMemberId, status: 'active' }, { memberId: view.members[1]!.id, status: 'revoked' }],
    }
    const load = vi.fn(actions().load)
    render(<TeamSpaceScreen {...actions({ load })} identity="shell-entry" selectedTeamId={team.id} initialPage="create"
      journey={journeyActions({
        teams: () => Promise.resolve({ ok: true, value: { teams: [legacyTeam, team], hosting: { running: false, origins: [] } } }),
        summary: () => Promise.resolve({ ok: true, value: team }),
      })} onConversation={() => {}} t={makeTranslate(en, commonEn)} />)
    expect(screen.getByRole('dialog', { name: 'Start a team project' })).toBeTruthy()
    await waitFor(() => { expect(load).toHaveBeenCalledWith({ teamId: team.id }) })
    const roster = await screen.findByRole('region', { name: 'My team' })
    expect(within(roster).getByText('Blue')).toBeTruthy()
    expect(within(roster).queryByText('Engineering')).toBeNull()
    expect(roster.querySelectorAll('article')).toHaveLength(1)
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'My team' })).toBeNull()
  })

  it('keeps revoked members hidden while the selected project summary is pending or unavailable', async () => {
    const team: TeamBattleTeamSummary = {
      ...legacyTeam, id: 'delayed-summary' as TeamBattleTeamSummary['id'], name: 'Shared project', mode: 'joined',
      memberAccess: [{ memberId: view.localMemberId, status: 'active' }, { memberId: view.members[1]!.id, status: 'revoked' }],
    }
    let failSummary: (value: Awaited<ReturnType<TeamJourneyInjected['summary']>>) => void = () => {}
    const summary = vi.fn<TeamJourneyInjected['summary']>(() => new Promise((resolve) => { failSummary = resolve }))
    render(<TeamSpaceScreen {...actions()} identity="delayed-summary" selectedTeamId={team.id}
      journey={journeyActions({
        teams: () => Promise.resolve({ ok: true, value: { teams: [team], hosting: { running: false, origins: [] } } }),
        summary,
      })} onConversation={() => {}} t={makeTranslate(en, commonEn)} />)
    await waitFor(() => { expect(summary).toHaveBeenCalledWith({ teamId: team.id }) })
    const roster = screen.getByRole('region', { name: 'My team' })
    expect(within(roster).getByText('Blue')).toBeTruthy()
    expect(within(roster).queryByText('Engineering')).toBeNull()
    expect(roster.querySelectorAll('article')).toHaveLength(1)
    await act(async () => { failSummary({ ok: false, error: new RemoteError('gateway/internal', 'Summary unavailable', {}) }) })
    expect((await screen.findByRole('alert')).textContent).toContain('Summary unavailable')
    expect(within(roster).getByText('Blue')).toBeTruthy()
    expect(within(roster).queryByText('Engineering')).toBeNull()
    expect(roster.querySelectorAll('article')).toHaveLength(1)
  })

  it('removes stale working controls after access is revoked and keeps invitation recovery available', async () => {
    const member = view.members[1]!.id
    const remoteView: TeamBattleView = { ...view, localMemberId: member }
    const team: TeamBattleTeamSummary = {
      ...legacyTeam, id: 'revocable-team' as TeamBattleTeamSummary['id'], mode: 'joined',
      localMemberId: member, ownerMemberId: view.localMemberId,
      storageLocation: 'https://example.test/team', hostUrl: 'https://example.test/team',
      memberAccess: view.members.map(item => ({ memberId: item.id, status: 'active' })),
    }
    let revoked = false
    const denied = new RemoteError('gateway/bad-request', 'TEAM_BATTLE_ACCESS_DENIED: membership revoked', {})
    const load = vi.fn<TeamBattleInjected['load']>(() => Promise.resolve(revoked
      ? { ok: false, error: denied }
      : { ok: true, value: remoteView }))
    const joinRemote = vi.fn<TeamJourneyInjected['joinRemote']>(() => {
      revoked = false
      return Promise.resolve({ ok: true, value: team })
    })
    render(<TeamSpaceView {...props(actions({ load }))} journey={journeyActions({
      teams: () => Promise.resolve({ ok: true, value: { teams: [team], hosting: { running: false, origins: [] } } }),
      summary: () => Promise.resolve(revoked ? { ok: false, error: denied } : { ok: true, value: team }),
      joinRemote,
    })} />)
    await waitFor(() => { expect(load).toHaveBeenCalledWith({ teamId: team.id }) })
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(await screen.findByText('Other work')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    expect(screen.getByPlaceholderText('Task title')).toBeTruthy()
    revoked = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect((await screen.findByRole('alert')).textContent).toContain('This device’s membership expired or was removed.')
    expect(screen.queryByPlaceholderText('Task title')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull()
    expect(screen.queryByText('Other work')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Join with an invitation' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Join with an invitation' }))
    fireEvent.change(dialog.getByLabelText('Invitation link'), { target: { value: 'https://example.test/invite#team=test&token=replacement' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Join this project' }))
    await waitFor(() => { expect(joinRemote).toHaveBeenCalledWith({ inviteCode: 'https://example.test/invite#team=test&token=replacement' }) })
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(screen.getByRole('button', { name: 'Publish to Team Space' }).hasAttribute('disabled')).toBe(false)
    expect(await screen.findByRole('button', { name: 'flight.png' })).toBeTruthy()
  })

  it('uses the selected server identity for handoff and hides the local connector queue', async () => {
    const team: TeamBattleTeamSummary = { ...legacyTeam, id: 'server-team' as TeamBattleTeamSummary['id'], mode: 'joined', ownerMemberId: view.localMemberId, storageLocation: 'https://example.test/team', hostUrl: 'https://example.test/team', memberAccess: view.members.map(member => ({ memberId: member.id, status: 'active' })) }
    const updateTask = vi.fn(actions().updateTask)
    const load = vi.fn(actions().load)
    const fixture = props(actions({ updateTask, load }))
    render(<TeamSpaceView {...fixture} journey={journeyActions({
      teams: () => Promise.resolve({ ok: true, value: { teams: [team], hosting: { running: false, origins: [] } } }),
      summary: () => Promise.resolve({ ok: true, value: team }),
    })} />)
    await waitFor(() => { expect(load).toHaveBeenCalledWith({ teamId: team.id }) })
    expect(screen.queryByRole('button', { name: 'Send to my Codex' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    const card = within(screen.getByText('Local work').closest('article')!)
    fireEvent.click(card.getByRole('button', { name: 'Hand off task' }))
    fireEvent.change(card.getByLabelText('Next assignee'), { target: { value: 'engineering' } })
    fireEvent.change(card.getByLabelText('Handoff note'), { target: { value: 'Implement the approved empty state' } })
    fireEvent.click(card.getByRole('button', { name: 'Confirm handoff' }))
    await waitFor(() => { expect(updateTask).toHaveBeenCalledWith({ teamId: team.id, taskId: 'task-local', expectedRevision: 3, action: 'handoff', targetMemberId: 'engineering', note: 'Implement the approved empty state' }) })
    expect(screen.queryByLabelText('Acting member')).toBeNull()
  })

  it('explains publication and private content before a user uploads bytes', async () => {
    render(<TeamSpaceView {...props(actions())} />)
    await screen.findByText('DeepSeek Harness Team')
    fireEvent.click(screen.getByRole('button', { name: 'What is shared?' }))
    const dialog = within(screen.getByRole('dialog', { name: 'What is shared?' }))
    expect(dialog.getByText('Visible to the team after publication')).toBeTruthy()
    expect(dialog.getByText('Never automatically uploaded to the team server')).toBeTruthy()
    expect(dialog.getByText(/Full AI conversations/u)).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Team Space' }))
    expect(screen.getByText('Publish to “DeepSeek Harness Team”')).toBeTruthy()
    expect(screen.getByText(/Review the complete file first/u)).toBeTruthy()
  })
})
