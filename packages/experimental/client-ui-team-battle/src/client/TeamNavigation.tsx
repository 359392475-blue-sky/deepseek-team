/** Team discovery and explicit local-workspace collaboration in the shared shell. */
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { TeamBattleMemberView, TeamBattleTeamSummary } from '@deepseek-ai/dsh-experimental-team-battle/client'
import type { PropsLocale, PropsRuntime, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { IconAgentPresetOutlineRegular, IconFolderCloseRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TeamBattleInjected, TeamCollaborationInjected, TeamJourneyInjected } from './actions.ts'
import { failureText } from './actions.ts'
import type { TeamSpaceNavigation } from './RootTeamSpace.tsx'
import { NAV_NS } from './navigation-locales.ts'
import { useLiveProjection } from './useLiveProjection.ts'
import css from './RootTeamSpace.module.css'

type NavigationProps = PropsLocale<typeof NAV_NS> & { readonly navigation: TeamSpaceNavigation }

/**
 * Show the installed deployment label without changing the official profile.
 * @param props - team navigation translations.
 * @returns localized Team Edition badge copy.
 */
export function TeamEditionBadge({ t }: PropsLocale<typeof NAV_NS>) { return <>{t('badge')}</> }

/**
 * Make project creation and invitation joining available from New Session.
 * @param props - root panel navigation and translated actions.
 * @returns two team entry actions beside the home composer.
 */
export function TeamHomeActions({ navigation, t }: NavigationProps) {
  return <div className={css.homeActions}>
    <button type="button" onClick={() => { navigation.open('create') }}>{t('create')}</button>
    <button type="button" onClick={() => { navigation.open('join') }}>{t('join')}</button>
  </div>
}

type TeamProjectSidebarProps = PropsRuntime<'sidebar.sections'> & PropsRenderFactories & NavigationProps & {
  readonly journey: TeamJourneyInjected
  readonly collaboration: TeamCollaborationInjected
}

/**
 * List this device's teams above personal workspaces and open their linked conversations.
 * @param props - authoritative directory, local workspace actions, and shell geometry.
 * @returns shared-shell project rows and an explicit local folder selection dialog.
 */
export function TeamProjectSidebar({
  journey, collaboration, navigation, wide, useWorkspaces, renderFactorySlot, t,
}: TeamProjectSidebarProps) {
  const directory = useLiveProjection(journey.teams, 'sidebar:teams')
  const selected = useSyncExternalStore(navigation.subscribe, navigation.getSelection)
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const [binding, setBinding] = useState<TeamBattleTeamSummary | null>(null)
  const [pending, setPending] = useState(false)
  const [directoryPicking, setDirectoryPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const teams = directory.view?.teams.filter(team => team.mode !== 'legacy') ?? []
  const bind = async (team: TeamBattleTeamSummary, workspaceId: WorkspaceId): Promise<void> => {
    const result = await collaboration.bindWorkspace({ teamId: team.id, workspaceId })
    if (!result.ok) throw new Error(failureText(result.error))
    await collaboration.openWorkspace(workspaceId)
    setBinding(null)
  }
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    if (pending) return
    setPending(true); setError(null)
    try { await operation() }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false) }
  }
  const openConversation = async (team: TeamBattleTeamSummary): Promise<void> => {
    const result = await collaboration.workspaceLinks()
    if (!result.ok) throw new Error(failureText(result.error))
    const linked = result.value.find(link => link.teamId === team.id
      && workspaces.some(workspace => workspace.workspaceId === link.workspaceId))
    if (linked === undefined) setBinding(team)
    else await collaboration.openWorkspace(linked.workspaceId)
  }
  if (!wide) return null
  return <section className={css.projects} aria-label={t('section')} data-team-sidebar="">
    <div className={css.sectionHeading}><span>{t('section')}</span><button type="button" data-team-create-entry="" aria-label={t('create')} title={t('create')} onClick={() => { navigation.open('create') }}>+</button></div>
    {directory.loading && <p className={css.muted}>{t('loading')}</p>}
    {teams.map(team => <div className={css.projectRow} key={team.id}>
      <button type="button" data-team-space-id={team.id} aria-current={selected.teamId === team.id ? 'page' : undefined} onClick={() => { navigation.select(team, true); navigation.open() }} title={team.name}>
        <IconFolderCloseRegular size={16} /><span>{team.name}</span>
      </button>
      <button type="button" data-team-project-chat={team.id} className={css.chatButton} aria-label={`${t('chat')} · ${team.name}`} title={t('chat')} disabled={pending} onClick={() => { void perform(async () => { await openConversation(team) }) }}><IconAgentPresetOutlineRegular size={16} /></button>
    </div>)}
    {!directory.loading && teams.length === 0 && <p className={css.muted}>{t('empty')}</p>}
    <button type="button" data-team-join-entry="" className={css.joinAction} onClick={() => { navigation.open('join') }}>{t('join')}</button>
    {(directory.error ?? error) !== null && <div role="alert" className={css.error}>{directory.error ?? error}<button type="button" onClick={() => { void directory.refresh() }}>{t('retry')}</button></div>}
    {binding !== null && !directoryPicking && <Modal open title={t('bind.title')} description={t('bind.description')} closeLabel={t('bind.cancel')}
      onClose={() => { if (!pending) { setBinding(null); setError(null) } }} className={css.bindingDialog ?? ''}>
      <p>{binding.name}</p>
      <div className={css.workspaceList}>{workspaces.map(workspace => <button key={workspace.workspaceId} type="button" aria-label={workspace.title} disabled={pending} onClick={() => { void perform(async () => { await bind(binding, workspace.workspaceId) }) }}><IconFolderCloseRegular size={16} /><span>{workspace.title}<small>{workspace.path}</small></span></button>)}</div>
      {error !== null && <p role="alert" className={css.error}>{error}</p>}
      <div className={css.dialogActions}><button type="button" disabled={pending} onClick={() => { setBinding(null); setError(null) }}>{t('bind.cancel')}</button><button type="button" disabled={pending} onClick={() => { setDirectoryPicking(true) }}>{t('bind.choose')}</button></div>
    </Modal>}
    {directoryPicking && binding !== null && renderFactorySlot('workspace.directoryFlow', {
      open: true, busy: pending,
      onPicked: (path) => {
        void perform(async () => {
          const workspaceId = await collaboration.createWorkspace(path)
          await bind(binding, workspaceId)
        }).finally(() => { setDirectoryPicking(false) })
      },
      onCancel: () => { if (!pending) setDirectoryPicking(false) },
      onError: (message) => { setError(message); setDirectoryPicking(false) },
    })}
  </section>
}

type TeamConversationMembersProps = PropsRuntime<'conversation.session.header.collaboration'> & PropsLocale<typeof NAV_NS> & {
  readonly collaboration: TeamCollaborationInjected
  readonly journey: TeamJourneyInjected
  readonly load: TeamBattleInjected['load']
}

/**
 * Resolve members only through this Session's explicit local Workspace association.
 * @param props - Session identity, local associations, and authenticated team projections.
 * @returns real project members or no team chrome for a private, unlinked Session.
 */
export function TeamConversationMembers({ sessionId, useWorkspaces, collaboration, journey, load, t }: TeamConversationMembersProps) {
  const workspaceId = useWorkspaces(snapshot => snapshot.items.find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId)
  const read = useCallback(async () => {
    if (workspaceId === undefined) return { ok: true as const, value: null }
    const links = await collaboration.workspaceLinks()
    if (!links.ok) return links
    const linked = links.value.find(link => link.workspaceId === workspaceId)
    if (linked === undefined) return { ok: true as const, value: null }
    const summary = await journey.summary({ teamId: linked.teamId })
    if (!summary.ok) return summary
    const view = await load({ teamId: linked.teamId })
    if (!view.ok) return view
    return { ok: true as const, value: { workspaceId, name: summary.value.name, members: view.value.members.filter(member => summary.value.memberAccess.some(access => access.memberId === member.id && access.status === 'active')) } }
  }, [workspaceId, collaboration, journey, load])
  const live = useLiveProjection<{ workspaceId: WorkspaceId; name: string; members: readonly TeamBattleMemberView[] } | null>(read, `${sessionId}:${workspaceId ?? ''}:members`)
  if (live.view === null || live.error !== null || live.view.workspaceId !== workspaceId) return null
  return <div className={css.collaborators} aria-label={t('members')} data-team-collaborators="" title={`${live.view.name} · ${live.view.members.map(member => `${member.name} · ${member.role}`).join('、')}`}>
    <IconAgentPresetOutlineRegular size={16} /><span className={css.collaboratorProject}>{live.view.name}</span>
    {live.view.members.map(member => <span key={member.id} className={css.memberBadge} title={`${member.name} · ${member.role}`}>{member.name}</span>)}
  </div>
}
