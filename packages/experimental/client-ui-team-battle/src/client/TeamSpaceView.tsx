/** Team Space shell with a live roster, shared files, and project workflows. */

import { useCallback, useMemo, useState } from 'react'
import type { TeamBattleFileView, TeamBattleMemberId, TeamBattleMemberView, TeamBattleTeamSummary, TeamBattleDirectoryView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import {
  Button,
  IconShieldOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconFolderCloseRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TeamBattleInjected, TeamJourneyInjected } from './actions.ts'
import { scopeTeamBattleActions } from './scopeTeamBattleActions.ts'
import { NS } from './locales.ts'
import { useTeamBattleLive } from './useTeamBattleLive.ts'
import { useTeamSpaceLive } from './useTeamSpaceLive.ts'
import { TeamSpaceFiles } from './TeamSpaceFiles.tsx'
import { useLiveProjection, type LiveProjectionState } from './useLiveProjection.ts'
import { TeamDirectory, type TeamDirectoryPage } from './TeamDirectory.tsx'
import { TeamWorkflowPanel } from './TeamWorkflowPanel.tsx'
import css from './TeamSpaceView.module.css'

type Tab = 'files' | 'context' | 'tasks' | 'artifacts'

/** Full props of the registered conversation Team Space view. */
export type TeamSpaceViewProps = PropsRuntime<'conversation.view'> & TeamBattleInjected & PropsLocale<typeof NS> & { readonly journey: TeamJourneyInjected }

/** Team page entry independent of a selected conversation. */
export type TeamSpaceScreenProps = TeamBattleInjected & PropsLocale<typeof NS> & {
  readonly journey: TeamJourneyInjected
  readonly identity: string
  readonly onConversation: () => void
  readonly initialPage?: TeamDirectoryPage | undefined
  readonly selectedTeamId?: TeamBattleTeamSummary['id'] | undefined
  readonly onSelectTeam?: (team: TeamBattleTeamSummary) => void
}

function Avatar({ member }: { readonly member: TeamBattleMemberView }) {
  return <span className={css.avatar}>{member.name.slice(0, 1)}</span>
}

/**
 * Render the Team Space from the conversation view registration.
 * @param props - Session runtime, locale, and injected Remote actions.
 * @returns team page whose conversation navigation returns to the current chat.
 */
export function TeamSpaceView({ sessionId, openView, t, ...actions }: TeamSpaceViewProps) {
  return <TeamSpaceScreen identity={sessionId} onConversation={() => { openView('chat', '') }} t={t} {...actions} />
}

/**
 * Render the selected project inside the application shell.
 * @param props - selected project, initial dialog, conversation navigation, locale, and Remote actions.
 * @returns live team roster, file workspace, and workflow tabs.
 */
export function TeamSpaceScreen({
  identity, onConversation, journey, initialPage, selectedTeamId, onSelectTeam, t, ...actions
}: TeamSpaceScreenProps) {
  const directory = useLiveProjection(journey.teams, `${identity}:directory`)
  const [selection, setSelection] = useState(() => {
    try { return localStorage.getItem('team-battle:selected-space') }
    catch (error) { void error; return null }
  })
  const [actor, setActor] = useState<TeamBattleMemberId>()
  const [page, setPage] = useState<TeamDirectoryPage | null>(initialPage ?? null)
  const teams = directory.view?.teams ?? []
  const selected = teams.find(team => team.id === (selectedTeamId ?? selection)) ?? teams.find(team => team.mode !== 'legacy') ?? teams[0]
  const teamId = selected?.mode === 'legacy' ? undefined : selected?.id
  const simulationActor = teamId === undefined ? actor : undefined
  const scoped = useMemo(() => scopeTeamBattleActions(actions, simulationActor, teamId), [
    simulationActor, teamId, actions.load, actions.space, actions.createTask, actions.updateTask,
    actions.publishContext, actions.publishArtifact, actions.reviewArtifact,
    actions.consumeWeapon, actions.heartbeat, actions.createFolder, actions.publishFile,
    actions.updateSpaceItem, actions.readFile, actions.sendFile, actions.submitFile,
  ])
  const select = (team: TeamBattleTeamSummary): void => {
    setSelection(team.id); setActor(undefined); onSelectTeam?.(team)
    try { localStorage.setItem('team-battle:selected-space', team.id) }
    catch (error) { void error /* Browser storage is optional for selecting a space. */ }
  }
  const memberIdentity = teamId === undefined ? simulationActor ?? 'configured' : selected?.localMemberId ?? 'configured'
  const actorIdentity = `${identity}:${teamId ?? 'legacy'}:${memberIdentity}`
  return <TeamSpaceContent
    key={actorIdentity} {...scoped} identity={actorIdentity} journey={journey}
    onConversation={onConversation} t={t} onActorChange={setActor}
    directory={directory} selected={selected} select={select} page={page} setPage={setPage}
  />
}

interface SpaceDirectoryState {
  readonly directory: LiveProjectionState<TeamBattleDirectoryView>
  readonly selected: TeamBattleTeamSummary | undefined
  readonly select: (team: TeamBattleTeamSummary) => void
  readonly page: TeamDirectoryPage | null
  readonly setPage: (page: TeamDirectoryPage | null) => void
}

function TeamSpaceContent({
  identity, onConversation, onActorChange, journey, directory, selected, select, page, setPage, t, ...actions
}: TeamSpaceScreenProps & SpaceDirectoryState & {
  readonly onActorChange: (member: TeamBattleMemberId) => void
}) {
  const live = useTeamBattleLive(actions, identity)
  const space = useTeamSpaceLive(actions, identity, t)
  const [tab, setTab] = useState<Tab>('files')
  const [requestedFile, setRequestedFile] = useState<Pick<TeamBattleFileView, 'id' | 'parentId'> | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const selectedId = selected?.id
  const selectedMode = selected?.mode
  const loadSummary = useCallback(async () => selectedId === undefined || selectedMode === 'legacy'
    ? { ok: true as const, value: null }
    : await journey.summary({ teamId: selectedId }), [journey.summary, selectedId, selectedMode])
  const summary = useLiveProjection<TeamBattleTeamSummary | null>(loadSummary, `${identity}:summary`)
  const current = summary.view ?? selected
  const refreshDirectory = async (): Promise<void> => {
    await directory.mutate(journey.teams)
    await summary.mutate(loadSummary)
    await live.refresh()
  }
  const error = live.error ?? space.error ?? summary.error ?? directory.error
  const accessDenied = error?.includes('TEAM_BATTLE_ACCESS_DENIED') === true
  const view = accessDenied ? null : live.view
  const roster = view?.members.filter(member => current?.mode === 'legacy'
    || current?.memberAccess.some(access => access.memberId === member.id && access.status === 'active') === true) ?? []
  const online = roster.filter(member => member.status !== 'offline').length

  return (
    <main className={css.root} data-team-space-view="">
      <section className={css.workspace}>
        <header className={css.header}>
          <div className={css.heading}>
            <div className={css.projectHeading}><h1>{current?.name ?? t('view.team')}</h1><p>{current?.goal ?? t('space.confirmedOnly')}</p></div>
            <section className={css.collaborators} aria-label={t('members.title')}>
              <div className={css.memberList}>{roster.map(member => <article key={member.id} className={css.member} data-local={member.id === view?.localMemberId ? '' : undefined} title={`${member.name} · ${member.role} · ${t(`member.${member.status}`)}`}><Avatar member={member} /><span>{member.name}</span><i data-status={member.status} /></article>)}</div>
              {view !== null && <small>{t('members.connected', { count: online })}</small>}
            </section>
          </div>
          <div className={css.projectActions}>
            <Button variant="outline" size="sm" onClick={() => { void directory.refresh(); setPage('invite') }}>{t('journey.invite')}</Button>
            <Button variant="ghost" size="sm" data-team-conversation-entry="" onClick={onConversation}>{t('journey.localAI')}</Button>
          </div>
          <div className={css.toolbar}>
            <nav className={css.tabs} aria-label={t('view.team')}>
              {(['files', 'context', 'tasks', 'artifacts'] as const).map(value => <button key={value} type="button" aria-current={tab === value ? 'page' : undefined} onClick={() => { setTab(value) }}>{t(`tabs.${value}`)}</button>)}
            </nav>
            <div className={css.toolbarActions}>
              {tab === 'files' && <><button type="button" className={css.folderButton} disabled={accessDenied || space.view === null || space.pending} aria-label={t('files.newFolder')} title={t('files.newFolder')} onClick={() => { setCreatingFolder(true) }}><IconFolderCloseRegular size={23} /><IconPlusOutlineRegular size={12} /></button><button type="button" className={css.primaryButton} disabled={accessDenied || space.view === null || space.pending} onClick={() => { setPublishing(true) }}>{t('files.publish')}</button></>}
              {tab !== 'files' && <button type="button" className={css.iconButton} aria-label={t('common.refresh')} onClick={() => { void live.refresh() }}><IconRefreshOutlineRegular /></button>}
            </div>
          </div>
        </header>
        {selected?.mode === 'legacy' && <div className={css.startHint}><span>{t('journey.localHint')}</span><button type="button" onClick={() => { setPage('create') }}>{t('journey.create')}</button></div>}
        {view !== null && <details className={css.quickStart}><summary>{t('journey.quickStart')}</summary><ol>{(['quickStartRead', 'quickStartWork', 'quickStartShare'] as const).map(step => <li key={step}>{t(`journey.${step}`)}</li>)}</ol></details>}
        {view?.simulationEnabled === true && <section className={css.simulation} aria-label={t('simulation.title')}>
          <strong>{t('simulation.title')}</strong>
          <label>{t('simulation.member')}<select value={view.localMemberId} disabled={live.pending || space.pending} onChange={(event) => {
            const member = view.members.find(candidate => candidate.id === event.target.value)
            if (member !== undefined) onActorChange(member.id)
          }}>{view.members.map(member => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>
          <p>{t('simulation.hint')}</p>
        </section>}
        {error !== null && <div className={css.error} role="alert">{error.includes('TEAM_BATTLE_ACCESS_DENIED') ? t('journey.accessDenied') : error}<button type="button" onClick={() => { void live.refresh(); void space.refresh(); void directory.refresh() }}>{t('common.retry')}</button></div>}
        {view === null ? <div className={css.centerState}>{accessDenied
          ? <div className={css.accessRecovery}><p>{t('journey.accessDenied')}</p><button type="button" onClick={() => { setPage('join') }}>{t('journey.join')}</button></div>
          : live.loading ? t('common.loading') : t('common.error')}</div> : <>
          <div className={css.fileWorkspace} hidden={tab !== 'files'}><TeamSpaceFiles requestedFile={requestedFile} allowCodexDelivery={selected?.mode === 'legacy'} actions={actions} project={view} live={space} projectLive={live} t={t} publishing={publishing} setPublishing={setPublishing} creatingFolder={creatingFolder} setCreatingFolder={setCreatingFolder} /></div>
          <div className={css.workflowWorkspace} hidden={tab === 'files'}><TeamWorkflowPanel {...actions} onPublish={() => { setTab('files'); setPublishing(true) }} ownerMemberId={current?.ownerMemberId} availableMemberIds={current?.mode === 'legacy' ? undefined : current?.memberAccess.filter(item => item.status === 'active').map(item => item.memberId)} tab={tab === 'files' ? 'tasks' : tab} live={live} files={space.view?.files ?? []} folders={space.view?.folders ?? []} filesReady={space.view !== null && space.error === null} openFile={(file) => { setRequestedFile({ id: file.id, ...(file.parentId === undefined ? {} : { parentId: file.parentId }) }); setTab('files') }} t={t} /></div>
        </>}
        <footer className={css.privacy}><IconShieldOutlineRegular size={16} />{t('space.private')}<button type="button" onClick={() => { setPage('privacy') }}>{t('journey.privacy')}</button></footer>
      </section>
      {page !== null && <TeamDirectory
        page={page} setPage={setPage} close={() => { setPage(null) }} journey={journey}
        teams={directory.view?.teams ?? []} selected={current} members={view?.members ?? []}
        select={select} refresh={refreshDirectory} onConversation={onConversation} t={t} />}
    </main>
  )
}
