/** Server-space creation, invitation exchange, and explicit sharing guidance. */

import { useState, type FormEvent } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  CreatedTeamInvite, TeamBattleMemberId, TeamBattleTeamSummary, TeamBattleView,
} from '@deepseek-ai/dsh-experimental-team-battle/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { failureText, type TeamJourneyInjected } from './actions.ts'
import { NS } from './locales.ts'
import css from './TeamDirectory.module.css'

/** Visible sections of the space management dialog. */
export type TeamDirectoryPage = 'overview' | 'create' | 'join' | 'invite' | 'privacy'
type Translate = PropsLocale<typeof NS>['t']
const ROLES = ['product', 'design', 'engineering', 'quality'] as const

/**
 * Explain the content selected for sharing and the personal content that stays private.
 * @param props - translated copy.
 * @returns the product's publication rules.
 */
export function SharingRules({ t }: { readonly t: Translate }) {
  return <div className={css.rules}>
    <section><h3>{t('journey.sharedTitle')}</h3><p>{t('journey.sharedBody')}</p></section>
    <section><h3>{t('journey.privateTitle')}</h3><p>{t('journey.privateBody')}</p></section>
  </div>
}

interface DirectoryProps extends PropsLocale<typeof NS> {
  readonly page: TeamDirectoryPage
  readonly setPage: (page: TeamDirectoryPage) => void
  readonly close: () => void
  readonly journey: TeamJourneyInjected
  readonly teams: readonly TeamBattleTeamSummary[]
  readonly selected: TeamBattleTeamSummary | undefined
  readonly members: TeamBattleView['members']
  readonly select: (team: TeamBattleTeamSummary) => void
  readonly refresh: () => Promise<void>
  readonly onConversation: () => void
}

/**
 * Manage spaces through the local Host's authenticated server proxy.
 * @param props - current directory, selected space, actions, and navigation.
 * @returns creation, joining, membership, and sharing controls.
 */
export function TeamDirectory({
  page, setPage, close, journey, teams, selected, members, select, refresh, onConversation, t,
}: DirectoryProps) {
  const [serverUrl, setServerUrl] = useState('https://lowpower.me/team-battle')
  const [serverCode, setServerCode] = useState('')
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [memberName, setMemberName] = useState('')
  const [role, setRole] = useState<(typeof ROLES)[number]>('product')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>('engineering')
  const [code, setCode] = useState('')
  const [createdInvite, setCreatedInvite] = useState<CreatedTeamInvite | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<TeamBattleMemberId | null>(null)
  const owner = selected !== undefined && selected.mode !== 'legacy' && selected.localMemberId === selected.ownerMemberId

  const run = async <T,>(operation: () => Promise<RemoteResult<T>>, success?: (value: T) => void): Promise<void> => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const result = await operation()
      if (!result.ok) {
        setError(page === 'create' && result.error.code === 'team-battle/server-auth-required'
          ? t('journey.createUnauthorized')
          : failureText(result.error))
        return
      }
      await refresh()
      success?.(result.value)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const create = (event: FormEvent): void => {
    event.preventDefault()
    void run(() => journey.createTeam({ serverUrl: serverUrl.trim(), serverAccessToken: serverCode.trim(), name: name.trim(), goal: goal.trim(), memberName: memberName.trim(), memberRole: t(`journey.${role}`) }), (team) => {
      setServerCode(''); select(team); setPage('invite')
    })
  }
  const join = (event: FormEvent): void => {
    event.preventDefault()
    void run(() => journey.joinRemote({ inviteCode: code.trim() }), (team) => { setCode(''); select(team); setPage('overview') })
  }
  const invite = (event: FormEvent): void => {
    event.preventDefault()
    if (selected === undefined) return
    void run(() => journey.createInvite({ teamId: selected.id, memberName: inviteName.trim(), memberRole: t(`journey.${inviteRole}`), ...(selected.hostUrl === undefined ? {} : { origin: selected.hostUrl }) }), (value) => {
      setCreatedInvite(value); setCopied(false); setInviteName('')
    })
  }
  const copy = async (): Promise<void> => {
    if (createdInvite === null) return
    try { await navigator.clipboard.writeText(createdInvite.inviteCode); setCopied(true) }
    catch (error) { void error; setError(t('journey.copyFailed')) }
  }
  const changePage = (next: TeamDirectoryPage): void => { setError(null); setPage(next) }
  return <Modal open onClose={() => { if (!busy) close() }} title={t('journey.manage')} closeLabel={t('files.close')} className={css.dialog ?? ''}>
    <nav className={css.tabs} aria-label={t('journey.manage')}>
      {(['overview', 'create', 'join', 'invite', 'privacy'] as const).map(value => <button type="button" key={value} disabled={busy} aria-current={page === value ? 'page' : undefined} onClick={() => { changePage(value) }}>{t(`journey.${value}`)}</button>)}
    </nav>
    {error !== null && <p className={css.error} role="alert">{page === 'join' && <>{t('journey.joinFailed')}<br /></>}{error}</p>}
    {page === 'create' && <form className={css.form} onSubmit={create}>
      <p>{t('journey.serverHint')}</p>
      <label>{t('journey.server')}<input aria-label={t('journey.server')} required type="url" value={serverUrl} onChange={(event) => { setServerUrl(event.target.value) }} /></label>
      <label>{t('journey.serverCode')}<input aria-label={t('journey.serverCode')} required type="password" autoComplete="off" value={serverCode} onChange={(event) => { setServerCode(event.target.value) }} /></label>
      <small>{t('journey.serverCodeHint')}</small>
      <label>{t('journey.name')}<input aria-label={t('journey.name')} required value={name} onChange={(event) => { setName(event.target.value) }} /></label>
      <label>{t('journey.goal')}<textarea aria-label={t('journey.goal')} required value={goal} onChange={(event) => { setGoal(event.target.value) }} /></label>
      <div className={css.columns}><label>{t('journey.memberName')}<input aria-label={t('journey.memberName')} required value={memberName} onChange={(event) => { setMemberName(event.target.value) }} /></label><label>{t('journey.role')}<select aria-label={t('journey.role')} value={role} onChange={(event) => { const found = ROLES.find(value => value === event.target.value); if (found !== undefined) setRole(found) }}>{ROLES.map(value => <option key={value} value={value}>{t(`journey.${value}`)}</option>)}</select></label></div>
      <p className={css.note}>{t('journey.publishNotice')}</p>
      <button className={css.primary} disabled={busy} type="submit">{busy ? t('journey.working') : t('journey.createSubmit')}</button>
    </form>}
    {page === 'join' && <form className={css.form} onSubmit={join}>
      <p>{t('journey.joinHint')}</p>
      <label>{t('journey.inviteCode')}<textarea aria-label={t('journey.inviteCode')} required spellCheck={false} value={code} onChange={(event) => { setCode(event.target.value) }} /></label>
      <p className={css.note}>{t('journey.localAIHint')}</p>
      <button type="submit" className={css.primary} disabled={busy || code.trim() === ''}>{busy ? t('journey.working') : t('journey.joinSubmit')}</button>
    </form>}
    {page === 'overview' && <section className={css.overview}>
      {teams.map(team => <button key={team.id} type="button" disabled={busy} aria-pressed={team.id === selected?.id} className={css.space} onClick={() => { select(team); close() }}><strong>{team.name}</strong><span>{t(team.mode === 'legacy' ? 'journey.legacy' : team.mode === 'joined' ? 'journey.serverSpace' : 'journey.localSpace')}</span><small>{team.storageLocation}</small></button>)}
      {teams.length === 0 && <p>{t('journey.empty')}</p>}
      <p className={css.note}>{t('journey.localAIHint')}</p><button type="button" onClick={() => { close(); onConversation() }}>{t('journey.localAI')}</button>
    </section>}
    {page === 'invite' && <section className={css.overview}>
      <h3>{selected?.name}</h3>
      {!owner ? <p>{t('journey.ownerOnly')}</p> : <>
        <form className={css.form} onSubmit={invite}><p>{t('journey.inviteHint')}</p><div className={css.columns}><label>{t('journey.inviteeName')}<input aria-label={t('journey.inviteeName')} required value={inviteName} onChange={(event) => { setInviteName(event.target.value) }} /></label><label>{t('journey.inviteeRole')}<select aria-label={t('journey.inviteeRole')} value={inviteRole} onChange={(event) => { const found = ROLES.find(value => value === event.target.value); if (found !== undefined) setInviteRole(found) }}>{ROLES.map(value => <option key={value} value={value}>{t(`journey.${value}`)}</option>)}</select></label></div><button type="submit" className={css.primary} disabled={busy}>{t('journey.generateInvite')}</button></form>
        {createdInvite !== null && <div className={css.invitation}><label>{t('journey.inviteCode')}<textarea aria-label={t('journey.inviteCode')} readOnly spellCheck={false} value={createdInvite.inviteCode} /></label><p>{t('journey.expires', { time: new Date(createdInvite.expiresAt).toLocaleString() })}</p><button type="button" onClick={() => { void copy() }}>{t(copied ? 'journey.copied' : 'journey.copyInvite')}</button></div>}
        <div className={css.accessList}>{selected.invites.map(item => <div key={item.id}><span>{item.memberName} · {item.memberRole}<small>{t(`journey.${item.status}`)}</small></span>{item.status === 'pending' && <button type="button" disabled={busy} onClick={() => { void run(() => journey.revokeInvite({ teamId: selected.id, inviteId: item.id }), () => { if (createdInvite?.id === item.id) setCreatedInvite(null) }) }}>{t('journey.revokeInvite')}</button>}</div>)}</div>
        <div className={css.accessList}>{selected.memberAccess.filter(item => item.memberId !== selected.ownerMemberId).map(item => <div key={item.memberId}><span>{members.find(member => member.id === item.memberId)?.name ?? item.memberId}<small>{t(`journey.${item.status}`)}</small></span>{item.status === 'active' && <button type="button" disabled={busy} onClick={() => { setRemoving(item.memberId) }}>{t('journey.removeMember')}</button>}</div>)}</div>
        {removing !== null && <div className={css.note}><p>{t('journey.removeConfirm', { name: members.find(member => member.id === removing)?.name ?? removing })}</p><button type="button" disabled={busy} onClick={() => { void run(() => journey.revokeMember({ teamId: selected.id, memberId: removing }), () => { setRemoving(null) }) }}>{t('journey.confirmRemove')}</button><button type="button" disabled={busy} onClick={() => { setRemoving(null) }}>{t('common.cancel')}</button></div>}
      </>}
    </section>}
    {page === 'privacy' && <><SharingRules t={t} />{selected !== undefined && <p className={css.storage}>{t('journey.storage')}<strong>{selected.storageLocation}</strong></p>}<p className={css.note}>{t('journey.localAIHint')}</p></>}
  </Modal>
}
