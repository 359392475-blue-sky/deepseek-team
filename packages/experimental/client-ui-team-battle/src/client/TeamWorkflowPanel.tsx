/** Task, meeting-note, and review controls for the live Team Space. */

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type {
  TeamBattleActivityType,
  TeamBattleArtifactReviewStatus,
  TeamBattleArtifactView,
  TeamBattleFileView,
  TeamBattleTaskStatus,
  TeamBattleTaskView,
  TeamBattleMemberId,
} from '@deepseek-ai/dsh-experimental-team-battle/client'
import {
  IconCheckOutlineRegular,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconTrashOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TeamBattleInjected } from './actions.ts'
import { NS, type TeamBattleKey } from './locales.ts'
import type { TeamBattleLiveState } from './useTeamBattleLive.ts'
import css from './TeamSpaceView.module.css'

type TaskTransition = 'claim' | 'release' | 'submit' | 'reopen' | 'delete'

interface TaskDraft {
  title: string
  description: string
  weight: string
}

interface ContextDraft {
  summary: string
  decisions: string
  blockers: string
  nextSteps: string
  sourceRefs: string
}

interface ArtifactDraft {
  taskId: string
  name: string
  mediaType: string
  uri: string
  sha256: string
  bytes: string
}

const EMPTY_TASK: TaskDraft = { title: '', description: '', weight: '1' }
const EMPTY_CONTEXT: ContextDraft = {
  summary: '', decisions: '', blockers: '', nextSteps: '', sourceRefs: '',
}
const EMPTY_ARTIFACT: ArtifactDraft = {
  taskId: '', name: '', mediaType: 'text/markdown', uri: '', sha256: '', bytes: '0',
}

type WorkflowProps = TeamBattleInjected & PropsLocale<typeof NS> & {
  readonly ownerMemberId: TeamBattleMemberId | undefined
  readonly availableMemberIds: readonly TeamBattleMemberId[] | undefined
  readonly onPublish: () => void
  readonly tab: 'tasks' | 'context' | 'artifacts'
  readonly live: TeamBattleLiveState
  readonly files: readonly TeamBattleFileView[]
  readonly openFile: (file: TeamBattleFileView) => void
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Team Battle value: ${String(value)}`)
}

function lines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean)
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(value)
}

function taskStatusKey(status: TeamBattleTaskStatus): TeamBattleKey {
  switch (status) {
    case 'open': return 'task.open'
    case 'in_progress': return 'task.in_progress'
    case 'submitted': return 'task.submitted'
    case 'completed': return 'task.completed'
    default: return assertNever(status)
  }
}

function reviewStatusKey(status: TeamBattleArtifactReviewStatus): TeamBattleKey {
  switch (status) {
    case 'pending': return 'artifact.pending'
    case 'accepted': return 'artifact.accepted'
    case 'rejected': return 'artifact.rejected'
    default: return assertNever(status)
  }
}

function activityLabel(type: TeamBattleActivityType): TeamBattleKey {
  switch (type) {
    case 'task_created': return 'activity.taskCreated'
    case 'task_updated': return 'activity.taskUpdated'
    case 'context_published': return 'activity.contextPublished'
    case 'artifact_published': return 'activity.artifactPublished'
    case 'artifact_reviewed': return 'activity.artifactReviewed'
    case 'weapon_granted': return 'activity.weaponGranted'
    case 'weapon_consumed': return 'activity.weaponConsumed'
    case 'member_heartbeat': return 'activity.heartbeat'
    default: return assertNever(type)
  }
}

function TaskEditor({
  draft, setDraft, submit, cancel, pending, t,
}: {
  draft: TaskDraft
  setDraft: (next: TaskDraft) => void
  submit: () => void
  cancel: () => void
  pending: boolean
  t: WorkflowProps['t']
}) {
  const set = (key: keyof TaskDraft, value: string): void => { setDraft({ ...draft, [key]: value }) }
  return (
    <form className={css.form} onSubmit={(event: FormEvent) => { event.preventDefault(); submit() }}>
      <input required value={draft.title} placeholder={t('tasks.title')} onChange={(event) => { set('title', event.target.value) }} />
      <textarea required value={draft.description} placeholder={t('tasks.description')} onChange={(event) => { set('description', event.target.value) }} />
      <label>{t('tasks.weight')}<input required min="1" type="number" value={draft.weight} onChange={(event) => { set('weight', event.target.value) }} /></label>
      <div className={css.formActions}>
        <button type="submit" disabled={pending || draft.title.trim() === '' || draft.description.trim() === ''}>{t('common.save')}</button>
        <button type="button" onClick={cancel}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}

function TaskControls({
  task, localMemberId, hasArtifacts, hasPendingArtifact, pending, transition, edit, publish, t,
}: {
  task: TeamBattleTaskView
  localMemberId: string
  hasArtifacts: boolean
  hasPendingArtifact: boolean
  pending: boolean
  transition: (action: TaskTransition) => void
  edit: () => void
  publish: () => void
  t: WorkflowProps['t']
}) {
  const unowned = task.ownerMemberId === undefined
  const localOwned = task.ownerMemberId === localMemberId
  const inProgressByLocal = task.status === 'in_progress' && localOwned
  const canEdit = (task.status === 'open' && unowned) || inProgressByLocal
  const canDelete = task.status !== 'completed' && (unowned || localOwned) && !hasArtifacts
  return (
    <div className={css.cardActions}>
      {task.status === 'open' && unowned && <button type="button" disabled={pending} onClick={() => { transition('claim') }}>{t('tasks.claim')}</button>}
      {inProgressByLocal && <button type="button" disabled={pending} onClick={() => { transition('release') }}>{t('tasks.release')}</button>}
      {inProgressByLocal && <button type="button" disabled={pending} onClick={() => { if (hasPendingArtifact) transition('submit'); else publish() }}>{t('tasks.submit')}</button>}
      {task.status === 'submitted' && localOwned && <button type="button" disabled={pending} onClick={() => { transition('reopen') }}>{t('tasks.reopen')}</button>}
      {canEdit && <button type="button" disabled={pending} onClick={edit}><IconEditOutlineRegular size={13} /> {t('tasks.edit')}</button>}
      {canDelete && <button type="button" className={css.danger} disabled={pending} onClick={() => { transition('delete') }}><IconTrashOutlineRegular size={13} /> {t('tasks.delete')}</button>}
    </div>
  )
}

function externalArtifactUrl(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
}

function ArtifactCard({
  artifact, memberName, review, note, setNote, pending, t, file, openFile, localMemberId, taskTitle,
}: {
  artifact: TeamBattleArtifactView
  localMemberId: string
  taskTitle: string
  file: TeamBattleFileView | undefined
  openFile: (file: TeamBattleFileView) => void
  memberName: string
  review: (decision: 'accepted' | 'rejected') => void
  note: string
  setNote: (value: string) => void
  pending: boolean
  t: WorkflowProps['t']
}) {
  return (
    <article className={css.card}>
      <div className={css.cardTitle}>
        <strong>{artifact.name}</strong>
        <span className={`${css.review} ${css[`review_${artifact.review.status}`]}`}>{t(reviewStatusKey(artifact.review.status))}</span>
      </div>
      <p className={css.artifactTask}><span>{t('artifacts.task')}</span><strong>{taskTitle}</strong></p>
      {file !== undefined
        ? <div className={css.cardActions}><button type="button" onClick={() => { openFile(file) }}>{t('artifacts.viewFile')}</button></div>
        : externalArtifactUrl(artifact.uri) !== undefined
          ? <a className={css.uri} href={externalArtifactUrl(artifact.uri)} target="_blank" rel="noreferrer">{artifact.uri}</a>
          : <p className={css.artifactAddress}>{artifact.uri}</p>}
      <dl className={css.provenance}>
        <div><dt>{t('artifacts.mediaType')}</dt><dd>{artifact.mediaType}</dd></div>
        <div><dt>{t('artifacts.sha256')}</dt><dd>{artifact.sha256}</dd></div>
        <div><dt>{t('artifacts.bytes')}</dt><dd>{artifact.bytes.toLocaleString()}</dd></div>
        {file !== undefined && <div><dt>{t('files.version')}</dt><dd>{file.versionLabel}</dd></div>}
        <div><dt>{t('context.provenance')}</dt><dd>{memberName} · {formatTime(artifact.createdAt)}</dd></div>
      </dl>
      {artifact.review.note !== undefined && <p className={css.reviewNote}>{artifact.review.note}</p>}
      {artifact.review.status === 'pending' && artifact.createdByMemberId === localMemberId && <p className={css.reviewNote}>{t('artifacts.independentReview')}</p>}
      {artifact.review.status === 'pending' && artifact.createdByMemberId !== localMemberId && (
        <div className={css.reviewActions}>
          <input value={note} placeholder={t('artifacts.reviewNote')} onChange={(event) => { setNote(event.target.value) }} />
          <button type="button" disabled={pending} onClick={() => { review('accepted') }}><IconCheckOutlineRegular /> {t('artifacts.accept')}</button>
          <button type="button" disabled={pending} onClick={() => { review('rejected') }}>{t('artifacts.changes')}</button>
        </div>
      )}
    </article>
  )
}

/**
 * Render workflow operations against the current authoritative project projection.
 * @param props - selected tab, shared live state, locale, and Remote actions.
 * @returns editable tasks, meeting notes, or artifact review controls.
 */
export function TeamWorkflowPanel({
  tab, live, t, files, openFile, onPublish, ownerMemberId, availableMemberIds, ...actions
}: WorkflowProps) {
  const [handoffTask, setHandoffTask] = useState<string | null>(null)
  const [handoffTarget, setHandoffTarget] = useState('')
  const [handoffNote, setHandoffNote] = useState('')
  const [copiedTask, setCopiedTask] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(EMPTY_TASK)
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [contextDraft, setContextDraft] = useState<ContextDraft>(EMPTY_CONTEXT)
  const [artifactDraft, setArtifactDraft] = useState<ArtifactDraft>(EMPTY_ARTIFACT)
  const [reviewNotes, setReviewNotes] = useState<Readonly<Record<string, string>>>({})
  const view = live.view
  const members = useMemo(() => new Map<string, string>(view?.members.map(member => [member.id, member.name]) ?? []), [view])

  const submitTask = async (): Promise<void> => {
    const created = await live.mutate(() => actions.createTask({
      title: taskDraft.title.trim(),
      description: taskDraft.description.trim(),
      weight: Number(taskDraft.weight),
    }))
    if (created !== undefined) {
      setTaskDraft(EMPTY_TASK)
      setCreatingTask(false)
    }
  }

  const submitTaskEdit = async (task: TeamBattleTaskView): Promise<void> => {
    const updated = await live.mutate(() => actions.updateTask({
      taskId: task.id,
      expectedRevision: task.revision,
      action: 'edit',
      title: taskDraft.title.trim(),
      description: taskDraft.description.trim(),
      weight: Number(taskDraft.weight),
    }))
    if (updated !== undefined) setEditingTask(null)
  }

  const transition = (task: TeamBattleTaskView, action: TaskTransition): void => {
    void live.mutate(() => actions.updateTask({
      taskId: task.id,
      expectedRevision: task.revision,
      action,
    }))
  }

  const publishContext = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const published = await live.mutate(() => actions.publishContext({
      summary: contextDraft.summary.trim(),
      decisions: lines(contextDraft.decisions),
      blockers: lines(contextDraft.blockers),
      nextSteps: lines(contextDraft.nextSteps),
      sourceRefs: lines(contextDraft.sourceRefs),
    }))
    if (published !== undefined) setContextDraft(EMPTY_CONTEXT)
  }

  const publishArtifact = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (artifactDraft.taskId === '') return
    const published = await live.mutate(() => actions.publishArtifact({
      taskId: artifactDraft.taskId as TeamBattleArtifactView['taskId'],
      name: artifactDraft.name.trim(),
      mediaType: artifactDraft.mediaType.trim(),
      uri: artifactDraft.uri.trim(),
      sha256: artifactDraft.sha256.trim(),
      bytes: Number(artifactDraft.bytes),
    }))
    if (published !== undefined) setArtifactDraft(EMPTY_ARTIFACT)
  }

  const handoff = async (task: TeamBattleTaskView): Promise<void> => {
    const target = view?.members.find(member => member.id === handoffTarget)
    if (target === undefined) return
    const updated = await live.mutate(() => actions.updateTask({ taskId: task.id, expectedRevision: task.revision, action: 'handoff', targetMemberId: target.id, ...(handoffNote.trim() === '' ? {} : { note: handoffNote.trim() }) }))
    if (updated !== undefined) { setHandoffTask(null); setHandoffTarget(''); setHandoffNote('') }
  }
  const copyTask = async (task: TeamBattleTaskView): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${view?.project.name ?? ''}\n\n${task.title}\n${task.description}`)
      setCopiedTask(task.id); setCopyError(null)
    } catch (error) { void error; setCopyError(t('journey.copyFailed')) }
  }
  if (view === null) return null

  const memberName = (id: string): string => members.get(id) ?? id
  const artifactTasks = view.tasks.filter(task => (
    task.ownerMemberId === view.localMemberId
    && (task.status === 'in_progress' || task.status === 'submitted')
  ))

  return (
    <div className={css.workflow}>
      {tab === 'tasks' && (
        <section>
          <div className={css.metrics}>
            <div><span>{t('project.progress')}</span><strong>{view.progress.percent}%</strong><meter min="0" max="100" value={view.progress.percent} /></div>

          </div>
          <section className={css.taskFlow} aria-label={t('journey.flow')}><strong>{t('journey.flow')}</strong><ol>{(['flowOpen', 'flowWork', 'flowReview', 'flowDone'] as const).map(step => <li key={step}>{t(`journey.${step}`)}</li>)}</ol></section>
          {copyError !== null && <p role="alert" className={css.formError}>{copyError}</p>}
          <div className={css.canvasHeading}>
            <div><span className={css.eyebrow}>{t('tabs.tasks')}</span><h2>{view.tasks.length}</h2></div>
            <button type="button" onClick={() => {
              setCreatingTask(true)
              setEditingTask(null)
              setTaskDraft(EMPTY_TASK)
            }}><IconPlusOutlineRegular size={14} /> {t('tasks.new')}</button>
          </div>
          {creatingTask && (
            <TaskEditor
              draft={taskDraft}
              setDraft={setTaskDraft}
              pending={live.pending}
              submit={() => { void submitTask() }}
              cancel={() => { setCreatingTask(false) }}
              t={t}
            />
          )}
          <div className={css.cardList}>
            {view.tasks.map(task => editingTask === task.id
              ? (
                <TaskEditor
                  key={task.id}
                  draft={taskDraft}
                  setDraft={setTaskDraft}
                  pending={live.pending}
                  submit={() => { void submitTaskEdit(task) }}
                  cancel={() => { setEditingTask(null) }}
                  t={t}
                />
              )
              : (
                <article key={task.id} className={css.task}>
                  <div className={css.cardTitle}>
                    <strong>{task.title}</strong>
                    <span className={css.status}>{t(taskStatusKey(task.status))}</span>
                  </div>
                  <p>{task.description}</p>
                  <div className={css.taskMeta}><span>{t('tasks.owner')}: {task.ownerMemberId === undefined ? t('tasks.unclaimed') : memberName(task.ownerMemberId)}</span><span>{t('tasks.weight')}: {task.weight}</span><span>{t('common.versionLabel', { revision: task.revision })}</span></div>
                  <TaskControls
                    task={task}
                    localMemberId={view.localMemberId}
                    hasArtifacts={view.artifacts.some(artifact => artifact.taskId === task.id)}
                    hasPendingArtifact={view.artifacts.some(artifact => artifact.taskId === task.id && artifact.review.status === 'pending')}
                    pending={live.pending}
                    publish={onPublish}
                    transition={(action) => { transition(task, action) }}
                    edit={() => {
                      setEditingTask(task.id)
                      setCreatingTask(false)
                      setTaskDraft({ title: task.title, description: task.description, weight: String(task.weight) })
                    }}
                    t={t}
                  />
                  {task.status !== 'completed' && <div className={css.cardActions}>
                    <button type="button" onClick={() => { void copyTask(task) }}>{t('journey.copyTask')}</button>
                    {(task.status === 'open' || task.status === 'in_progress') && (task.ownerMemberId === view.localMemberId || ownerMemberId === view.localMemberId) && <button type="button" disabled={live.pending} onClick={() => { setHandoffTask(task.id); setHandoffTarget(''); setHandoffNote('') }}>{t('journey.handoff')}</button>}
                  </div>}
                  {copiedTask === task.id && <p role="status" className={css.formHint}>{t('journey.copyTaskHint')}</p>}
                  {task.ownerMemberId === view.localMemberId && task.status === 'in_progress' && !view.artifacts.some(artifact => artifact.taskId === task.id && artifact.review.status === 'pending') && <p className={css.formHint}>{t('journey.publishFirst')}</p>}
                  {handoffTask === task.id && <form className={css.form}
                    onSubmit={(event) => { event.preventDefault(); void handoff(task) }}>
                    <label>{t('journey.handoffTarget')}<select aria-label={t('journey.handoffTarget')} required value={handoffTarget} onChange={(event) => { setHandoffTarget(event.target.value) }}><option value="">{t('journey.handoffTarget')}</option>{view.members.filter(member => member.id !== task.ownerMemberId && (availableMemberIds === undefined || availableMemberIds.includes(member.id))).map(member => <option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}</select></label>
                    <label>{t('journey.handoffNote')}<textarea value={handoffNote} onChange={(event) => { setHandoffNote(event.target.value) }} /></label>
                    <div className={css.formActions}><button type="submit" disabled={live.pending || handoffTarget === ''}>{t('journey.handoffSubmit')}</button><button type="button" onClick={() => { setHandoffTask(null) }}>{t('common.cancel')}</button></div>
                  </form>}
                </article>
              ))}
            {view.tasks.length === 0 && !creatingTask && <p className={css.empty}>{t('common.empty')}</p>}
          </div>
        </section>
      )}
      {tab === 'context' && (
        <section>
          <div className={css.canvasHeading}><div><span className={css.eyebrow}>{t('tabs.context')}</span><h2>{t('context.new')}</h2></div></div>
          <p className={css.formHint}>{t('journey.publishDestination', { name: view.project.name })} · {t('journey.publishNotice')}</p>
          <form className={css.form} onSubmit={(event) => { void publishContext(event) }}>
            <textarea required value={contextDraft.summary} placeholder={t('context.summary')} onChange={(event) => { setContextDraft({ ...contextDraft, summary: event.target.value }) }} />
            <div className={css.formGrid}>
              {(['decisions', 'blockers', 'nextSteps', 'sourceRefs'] as const).map(field => <textarea key={field} value={contextDraft[field]} placeholder={t(field === 'sourceRefs' ? 'context.sources' : `context.${field}`)} onChange={(event) => { setContextDraft({ ...contextDraft, [field]: event.target.value }) }} />)}
            </div>
            <div className={css.formActions}><button type="submit" disabled={live.pending || contextDraft.summary.trim() === ''}>{t('common.save')}</button></div>
          </form>
          <div className={css.cardList}>{view.contexts.map(context => <article key={context.id} className={css.card}><div className={css.cardTitle}><strong>{context.summary}</strong><time>{formatTime(context.createdAt)}</time></div>{(['decisions', 'blockers', 'nextSteps'] as const).map(field => context[field].length > 0 && <div key={field}><h3>{t(`context.${field}`)}</h3><ul>{context[field].map(item => <li key={item}>{item}</li>)}</ul></div>)}<div className={css.taskMeta}><span>{t('context.provenance')}: {memberName(context.createdByMemberId)}</span>{context.sourceRefs.map(source => <span key={source}>{source}</span>)}</div></article>)}</div>
        </section>
      )}
      {tab === 'artifacts' && (
        <section>
          <div className={css.canvasHeading}><div><span className={css.eyebrow}>{t('tabs.artifacts')}</span><h2>{t('artifacts.reviewList')}</h2></div></div>
          <div className={css.cardList}>{view.artifacts.map(artifact => <ArtifactCard key={artifact.id} artifact={artifact} taskTitle={view.tasks.find(task => task.id === artifact.taskId)?.title ?? artifact.taskId} localMemberId={view.localMemberId} file={files.find(file => file.artifactId === artifact.id)} openFile={openFile} memberName={memberName(artifact.createdByMemberId)} note={reviewNotes[artifact.id] ?? ''} setNote={(note) => { setReviewNotes(current => ({ ...current, [artifact.id]: note })) }} pending={live.pending} t={t} review={(decision) => { const note = reviewNotes[artifact.id]?.trim(); void live.mutate(() => actions.reviewArtifact({ artifactId: artifact.id, expectedRevision: artifact.revision, decision, ...(note === undefined || note === '' ? {} : { note }) })) }} />)}</div>
          <details className={css.externalArtifact}>
            <summary>{t('artifacts.externalLink')}</summary>
            <form className={css.form} onSubmit={(event) => { void publishArtifact(event) }}>
              <select required value={artifactDraft.taskId} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setArtifactDraft({ ...artifactDraft, taskId: event.target.value }) }}><option value="">{t('artifacts.task')}</option>{artifactTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
              <div className={css.formGrid}>{(['name', 'mediaType', 'uri', 'sha256', 'bytes'] as const).map(field => <input key={field} required value={artifactDraft[field]} type={field === 'bytes' ? 'number' : field === 'uri' ? 'url' : 'text'} placeholder={t(`artifacts.${field}`)} onChange={(event) => { setArtifactDraft({ ...artifactDraft, [field]: event.target.value }) }} />)}</div>
              <div className={css.formActions}><button type="submit" disabled={live.pending || artifactDraft.taskId === ''}>{t('common.save')}</button></div>
            </form>
          </details>
        </section>
      )}
      <details className={css.activityHistory}>
        <summary>{t('tabs.activity')}</summary>
        <ActivityList activity={view.activity.slice().reverse()} memberName={memberName} t={t} />
      </details>
    </div>
  )
}

function ActivityList({ activity, memberName, t }: {
  activity: readonly { id: string; type: TeamBattleActivityType; memberId: string; createdAt: number; eventId?: string }[]
  memberName: (id: string) => string
  t: WorkflowProps['t']
}) {
  if (activity.length === 0) return <p className={css.empty}>{t('common.empty')}</p>
  return (
    <ol className={css.activityList}>
      {activity.map(item => (
        <li key={item.id}>
          <span className={css.activityDot} />
          <div>
            <strong>{t(activityLabel(item.type))}</strong>
            <span>{memberName(item.memberId)} · {formatTime(item.createdAt)}</span>
            {item.eventId !== undefined && <code>{item.eventId}</code>}
          </div>
        </li>
      ))}
    </ol>
  )
}
