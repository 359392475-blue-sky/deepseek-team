/** Team Space shell with a live roster, shared files, and project workflows. */

import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import type { TeamBattleFileView, TeamBattleMemberId, TeamBattleMemberView, TeamBattleTeamSummary, TeamBattleDirectoryView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import {
  FishLogo,
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
import engineeringAvatar from '../assets/member-engineering.png'
import productAvatar from '../assets/member-product.png'
import qualityAvatar from '../assets/member-quality.png'
import agentAvatar from '../assets/member-agent.png'
import lockUrl from '../assets/lock.png'
import teamIcon from '../assets/nav-team.png'
import conversationIcon from '../assets/nav-conversation.png'
import css from './TeamSpaceView.module.css'

type Tab = 'files' | 'context' | 'tasks' | 'artifacts'

/** Full props of the registered conversation Team Space view. */
export type TeamSpaceViewProps = PropsRuntime<'conversation.view'> & TeamBattleInjected & PropsLocale<typeof NS> & { readonly journey: TeamJourneyInjected }

/** Team page entry independent of a selected conversation. */
export type TeamSpaceScreenProps = TeamBattleInjected & PropsLocale<typeof NS> & {
  readonly journey: TeamJourneyInjected
  readonly identity: string
  readonly onConversation: () => void
}

function memberAvatar(member: TeamBattleMemberView): string | undefined {
  switch (member.id as string) {
    case 'engineering': return engineeringAvatar
    case 'product': return productAvatar
    case 'design': return productAvatar
    case 'quality': return qualityAvatar
    default: return undefined
  }
}

function Avatar({ member }: { readonly member: TeamBattleMemberView }) {
  const image = memberAvatar(member)
  return image === undefined
    ? <span className={css.avatar} style={{ '--member-accent': member.color ?? '#4677bc' } as CSSProperties}>{member.name.slice(0, 1)}</span>
    : <img className={css.avatar} src={image} alt="" />
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
 * Render the screenshot-based team page against authoritative Remote data.
 * @param props - stable identity, conversation navigation, locale, and Remote actions.
 * @returns live team roster, file workspace, and workflow tabs.
 */
export function TeamSpaceScreen({ identity, onConversation, journey, t, ...actions }: TeamSpaceScreenProps) {
  const directory = useLiveProjection(journey.teams, `${identity}:directory`)
  const [selection, setSelection] = useState(() => {
    try { return localStorage.getItem('team-battle:selected-space') }
    catch (error) { void error; return null }
  })
  const [actor, setActor] = useState<TeamBattleMemberId>()
  const [page, setPage] = useState<TeamDirectoryPage | null>(null)
  const teams = directory.view?.teams ?? []
  const selected = teams.find(team => team.id === selection) ?? teams.find(team => team.mode !== 'legacy') ?? teams[0]
  const teamId = selected?.mode === 'legacy' ? undefined : selected?.id
  const simulationActor = teamId === undefined ? actor : undefined
  const scoped = useMemo(() => scopeTeamBattleActions(actions, simulationActor, teamId), [
    simulationActor, teamId, actions.load, actions.space, actions.createTask, actions.updateTask,
    actions.publishContext, actions.publishArtifact, actions.reviewArtifact,
    actions.consumeWeapon, actions.heartbeat, actions.createFolder, actions.publishFile,
    actions.updateSpaceItem, actions.readFile, actions.sendFile, actions.submitFile,
  ])
  const select = (team: TeamBattleTeamSummary): void => {
    setSelection(team.id); setActor(undefined)
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
  const space = useTeamSpaceLive(actions, identity)
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
  const roster = view?.members.filter(member => current?.mode === 'legacy' || summary.view === null
    || current?.memberAccess.some(access => access.memberId === member.id && access.status === 'active') === true) ?? []
  const online = roster.filter(member => member.status !== 'offline').length
  const localMember = view?.members.find(member => member.id === view.localMemberId)

  return (
    <main className={css.root} data-team-space-view="">
      <nav className={css.rail} aria-label={t('nav.main')}>
        <span aria-label={t('brand.deepseek')} className={css.brand}><FishLogo size={48} /></span>
        <div className={css.railLinks}>
          <button type="button" onClick={onConversation}><img className={css.railIcon} src={conversationIcon} alt="" /><span>{t('nav.conversation')}</span></button>
          <button type="button" aria-current="page" onClick={() => { setTab('files') }}><img className={css.railIcon} src={teamIcon} alt="" /><span>{t('nav.team')}</span><i /></button>
        </div>
        {localMember !== undefined && <div className={css.currentMember} title={localMember.name}><Avatar member={localMember} /></div>}
      </nav>
      <aside className={css.members} aria-label={t('members.title')}>
        <h2>{t('members.title')}</h2>
        <select className={css.projectPicker} aria-label={t('journey.select')} value={selected?.id ?? ''} onChange={(event) => {
          const team = directory.view?.teams.find(item => item.id === event.target.value)
          if (team !== undefined) select(team)
        }}>{(directory.view?.teams ?? []).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
        <div className={css.spaceActions}><button type="button" onClick={() => { setPage('create') }}>{t('journey.create')}</button><button type="button" onClick={() => { setPage('join') }}>{t('journey.join')}</button></div>
        {selected !== undefined && <p className={css.spaceLocation}>{t('journey.storage')}<span>{selected.storageLocation}</span></p>}
        <button type="button" className={css.inviteButton} onClick={() => { void directory.refresh(); setPage('invite') }}>{t('journey.invite')}</button>
        <div className={css.memberList}>
          {roster.map(member => (
            <article key={member.id} className={css.member} data-local={member.id === view?.localMemberId ? '' : undefined}>
              <Avatar member={member} />
              <div className={css.memberInfo}>
                <div><strong>{member.name}</strong><span> · {member.role}</span></div>
                <small><i data-status={member.status} />{t(`member.${member.status}`)}</small>
              </div>
              <img className={css.memberAgent} src={agentAvatar} alt="" />
            </article>
          ))}
        </div>
        {view !== null && <p className={css.connected}><i data-status={online > 0 ? 'online' : 'offline'} />{t('members.connected', { count: online })}</p>}
      </aside>
      <section className={css.workspace}>
        <header className={css.header}>
          <div className={css.heading}><h1>{t('view.team')}</h1><img className={css.lock} src={lockUrl} alt="" /><p>{t('space.confirmedOnly')}</p><button type="button" className={css.manageButton} onClick={() => { void directory.refresh(); setPage('overview') }}>{t('journey.manage')}</button></div>
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
          <div className={css.workflowWorkspace} hidden={tab === 'files'}><TeamWorkflowPanel {...actions} onPublish={() => { setTab('files'); setPublishing(true) }} ownerMemberId={current?.ownerMemberId} availableMemberIds={current?.mode === 'legacy' ? undefined : current?.memberAccess.filter(item => item.status === 'active').map(item => item.memberId)} tab={tab === 'files' ? 'tasks' : tab} live={live} files={space.view?.files ?? []} openFile={(file) => { setRequestedFile({ id: file.id, ...(file.parentId === undefined ? {} : { parentId: file.parentId }) }); setTab('files') }} t={t} /></div>
        </>}
        <footer className={css.privacy}><img className={css.lock} src={lockUrl} alt="" />{t('space.private')}<button type="button" onClick={() => { setPage('privacy') }}>{t('journey.privacy')}</button></footer>
      </section>
      {page !== null && <TeamDirectory
        page={page} setPage={setPage} close={() => { setPage(null) }} journey={journey}
        teams={directory.view?.teams ?? []} selected={current} members={view?.members ?? []}
        select={select} refresh={refreshDirectory} onConversation={onConversation} t={t} />}
    </main>
  )
}
