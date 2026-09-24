/** Server-space creation, invitation exchange, and explicit sharing guidance. */

import { useState, type FormEvent } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
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

function invitationErrorDetails(error: string, invitation: string, redacted: string): string {
  const code = invitation.trim()
  if (code === '') return error
  let detail = error.replaceAll(code, redacted)
  let url: URL
  try { url = new URL(code) }
  catch (cause) { void cause; return detail }
  for (const params of [url.searchParams, new URLSearchParams(url.hash.slice(1))]) {
    const token = params.get('token')
    if (token) detail = detail.replaceAll(token, redacted)
  }
  return detail
}

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
        const detail = page === 'create' && result.error.code === 'team-battle/server-auth-required'
          ? t('journey.createUnauthorized')
          : failureText(result.error)
        setError(page === 'join' ? invitationErrorDetails(detail, code, t('journey.inviteRedacted')) : detail)
        return
      }
      await refresh()
      success?.(result.value)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      setError(page === 'join' ? invitationErrorDetails(detail, code, t('journey.inviteRedacted')) : detail)
    }
    finally { setBusy(false) }
  }
  const create = (event: FormEvent): void => {
    event.preventDefault()
    void run(() => journey.createTeam({ name: name.trim(), goal: goal.trim(), memberName: memberName.trim(), memberRole: t(`journey.${role}`) }), (team) => {
      select(team); setPage('invite')
    })
  }
  const join = (event: FormEvent): void => {
    event.preventDefault()
    void run(() => journey.joinRemote({ inviteCode: code.trim() }), (team) => { setCode(''); select(team); close() })
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
  return <Modal open onClose={() => { if (!busy) close() }} title={t(`journey.${page}`)} closeLabel={t('files.close')} className={css.dialog ?? ''}>
    {error !== null && <div className={css.error}>{page === 'join'
      ? <><p role="alert">{t('journey.joinFailed')}</p><details><summary>{t('journey.errorDetails')}</summary><p>{error}</p></details></>
      : <p role="alert">{error}</p>}</div>}
    {page === 'create' && <form className={css.form} onSubmit={create}>
      <p>{t('journey.createHint')}</p>
      <label>{t('journey.name')}<Input aria-label={t('journey.name')} required value={name} onChange={(event) => { setName(event.target.value) }} /></label>
      <label>{t('journey.goal')}<textarea aria-label={t('journey.goal')} required value={goal} onChange={(event) => { setGoal(event.target.value) }} /></label>
      <div className={css.columns}><label>{t('journey.memberName')}<Input aria-label={t('journey.memberName')} required value={memberName} onChange={(event) => { setMemberName(event.target.value) }} /></label><label>{t('journey.role')}<select aria-label={t('journey.role')} value={role} onChange={(event) => { const found = ROLES.find(value => value === event.target.value); if (found !== undefined) setRole(found) }}>{ROLES.map(value => <option key={value} value={value}>{t(`journey.${value}`)}</option>)}</select></label></div>
      <p className={css.note}>{t('journey.createPrivacy')}</p>
      <Button variant="primary" disabled={busy} type="submit">{busy ? t('journey.working') : t('journey.createSubmit')}</Button>
    </form>}
    {page === 'join' && <form className={css.form} onSubmit={join}>
      <p>{t('journey.joinHint')}</p>
      <label>{t('journey.inviteCode')}<Input aria-label={t('journey.inviteCode')} required type="url" autoComplete="off" spellCheck={false} value={code} onChange={(event) => { setCode(event.target.value) }} /></label>
      <p className={css.note}>{t('journey.localAIHint')}</p>
      <Button type="submit" variant="primary" disabled={busy || code.trim() === ''}>{busy ? t('journey.working') : t('journey.joinSubmit')}</Button>
    </form>}
    {page === 'overview' && <section className={css.overview}>
      {teams.map(team => <Button variant="outline" key={team.id} type="button" disabled={busy} aria-pressed={team.id === selected?.id} className={css.space} onClick={() => { select(team); close() }}><strong>{team.name}</strong><span>{t(team.mode === 'legacy' ? 'journey.legacy' : team.mode === 'joined' ? 'journey.serverSpace' : 'journey.localSpace')}</span><small>{team.storageLocation}</small></Button>)}
      {teams.length === 0 && <p>{t('journey.empty')}</p>}
      <p className={css.note}>{t('journey.localAIHint')}</p><Button variant="outline" type="button" onClick={() => { close(); onConversation() }}>{t('journey.localAI')}</Button>
    </section>}
    {page === 'invite' && <section className={css.overview}>
      <h3>{selected?.name}</h3>
      {!owner ? <p>{t('journey.ownerOnly')}</p> : <>
        <form className={css.form} onSubmit={invite}><p>{t('journey.inviteHint')}</p><div className={css.columns}><label>{t('journey.inviteeName')}<Input aria-label={t('journey.inviteeName')} required value={inviteName} onChange={(event) => { setInviteName(event.target.value) }} /></label><label>{t('journey.inviteeRole')}<select aria-label={t('journey.inviteeRole')} value={inviteRole} onChange={(event) => { const found = ROLES.find(value => value === event.target.value); if (found !== undefined) setInviteRole(found) }}>{ROLES.map(value => <option key={value} value={value}>{t(`journey.${value}`)}</option>)}</select></label></div><Button type="submit" variant="primary" disabled={busy}>{t('journey.generateInvite')}</Button></form>
        {createdInvite !== null && <div className={css.invitation}><label>{t('journey.inviteCode')}<textarea aria-label={t('journey.inviteCode')} readOnly spellCheck={false} value={createdInvite.inviteCode} /></label><p>{t('journey.expires', { time: new Date(createdInvite.expiresAt).toLocaleString() })}</p><Button variant="outline" type="button" onClick={() => { void copy() }}>{t(copied ? 'journey.copied' : 'journey.copyInvite')}</Button></div>}
        <div className={css.accessList}>{selected.invites.map(item => <div key={item.id}><span>{item.memberName} · {item.memberRole}<small>{t(`journey.${item.status}`)}</small></span>{item.status === 'pending' && <Button variant="outline" type="button" disabled={busy} onClick={() => { void run(() => journey.revokeInvite({ teamId: selected.id, inviteId: item.id }), () => { if (createdInvite?.id === item.id) setCreatedInvite(null) }) }}>{t('journey.revokeInvite')}</Button>}</div>)}</div>
        <div className={css.accessList}>{selected.memberAccess.filter(item => item.memberId !== selected.ownerMemberId).map(item => <div key={item.memberId}><span>{members.find(member => member.id === item.memberId)?.name ?? item.memberId}<small>{t(`journey.${item.status}`)}</small></span>{item.status === 'active' && <Button variant="outline" type="button" disabled={busy} onClick={() => { setRemoving(item.memberId) }}>{t('journey.removeMember')}</Button>}</div>)}</div>
        {removing !== null && <div className={css.note}><p>{t('journey.removeConfirm', { name: members.find(member => member.id === removing)?.name ?? removing })}</p><Button variant="outline" type="button" disabled={busy} onClick={() => { void run(() => journey.revokeMember({ teamId: selected.id, memberId: removing }), () => { setRemoving(null) }) }}>{t('journey.confirmRemove')}</Button><Button variant="outline" type="button" disabled={busy} onClick={() => { setRemoving(null) }}>{t('common.cancel')}</Button></div>}
      </>}
    </section>}
    {page === 'privacy' && <><SharingRules t={t} />{selected !== undefined && <p className={css.storage}>{t('journey.storage')}<strong>{selected.storageLocation}</strong></p>}<p className={css.note}>{t('journey.localAIHint')}</p></>}
  </Modal>
}
