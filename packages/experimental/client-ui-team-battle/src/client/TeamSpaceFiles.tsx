/** Shared-file browser, persisted uploads, safe previews, and explicit Codex delivery. */

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  TeamBattleFileContent,
  TeamBattleFileId,
  TeamBattleFileView,
  TeamBattleFolderId,
  TeamBattleFolderView,
  TeamBattleSpaceView,
  TeamBattleView,
} from '@deepseek-ai/dsh-experimental-team-battle/client'
import {
  IconBrowseOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconCloseOutlineRegular,
  IconDownloadOutlineRegular,
  IconEllipsisOutlineRegular,
  IconFolderCloseRegular,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { failureText, type TeamBattleInjected } from './actions.ts'
import type { LiveProjectionState } from './useLiveProjection.ts'
import type { TeamBattleLiveState } from './useTeamBattleLive.ts'
import { NS } from './locales.ts'
import css from './TeamSpaceView.module.css'
import documentIcon from '../assets/file-document.png'
import imageIcon from '../assets/file-image.png'
import codeIcon from '../assets/file-code.png'
import folderIcon from '../assets/file-folder.png'
import previewIcon from '../assets/action-preview.png'
import sendIcon from '../assets/action-send.png'

type SpaceItem = { readonly kind: 'file'; readonly item: TeamBattleFileView } | { readonly kind: 'folder'; readonly item: TeamBattleFolderView }
type Translate = PropsLocale<typeof NS>['t']
type ItemAction = { readonly entry: SpaceItem; readonly action: 'rename' | 'delete' }
interface FileBrowserProps extends PropsLocale<typeof NS> {
  readonly requestedFile: Pick<TeamBattleFileView, 'id' | 'parentId'> | null
  readonly allowCodexDelivery: boolean
  readonly actions: TeamBattleInjected
  readonly project: TeamBattleView
  readonly live: LiveProjectionState<TeamBattleSpaceView>
  readonly projectLive: TeamBattleLiveState
  readonly publishing: boolean
  readonly setPublishing: (value: boolean) => void
  readonly creatingFolder: boolean
  readonly setCreatingFolder: (value: boolean) => void
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}

function formatBytes(value: number, t: Translate): string {
  return value < 1_048_576
    ? t('files.kilobytes', { value: Math.ceil(value / 1024) })
    : t('files.megabytes', { value: Math.round(value / 1_048_576 * 10) / 10 })
}

function decodeBytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}

function safeImage(content: TeamBattleFileContent): string | undefined {
  return /^(?:image\/(?:png|jpeg|gif|webp|avif|bmp))$/u.test(content.file.mediaType)
    ? `data:${content.file.mediaType};base64,${content.contentBase64}`
    : undefined
}

function Preview({ content, t }: { readonly content: TeamBattleFileContent; readonly t: Translate }) {
  const image = safeImage(content)
  if (image !== undefined) return <img className={css.previewImage} src={image} alt={content.file.name} />
  if (content.file.mediaType.startsWith('text/') || content.file.mediaType === 'application/json') return <pre className={css.textPreview}>{new TextDecoder().decode(decodeBytes(content.contentBase64))}</pre>
  return <div className={css.unsupported}><IconBrowseOutlineRegular size={38} /><p>{t('files.noPreview')}</p></div>
}

function useFileContent(file: TeamBattleFileView | undefined, readFile: TeamBattleInjected['readFile']) {
  const [content, setContent] = useState<TeamBattleFileContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const id = file?.id
  const revision = file?.revision
  useEffect(() => {
    let active = true
    setContent(null)
    setError(null)
    if (id === undefined) return () => { active = false }
    const read = async (): Promise<void> => {
      try {
        const result = await readFile({ fileId: id })
        if (!active) return
        if (result.ok) setContent(result.value)
        else setError(failureText(result.error))
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void read()
    return () => { active = false }
  }, [id, revision, readFile, retry])
  return { content, error, refresh: () => { setRetry(current => current + 1) } }
}

function readUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => { reject(new Error(reader.error?.message ?? 'FileReader could not read this file')) }
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

function download(content: TeamBattleFileContent): void {
  const url = URL.createObjectURL(new Blob([decodeBytes(content.contentBase64)], { type: 'application/octet-stream' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = content.file.name
  anchor.click()
  window.setTimeout(() => { URL.revokeObjectURL(url) }, 0)
}

function UploadDialog({ open, close, parentId, actions, live, selected, projectName, t }: {
  readonly projectName: string
  readonly open: boolean
  readonly close: () => void
  readonly parentId: TeamBattleFolderId | undefined
  readonly actions: TeamBattleInjected
  readonly live: LiveProjectionState<TeamBattleSpaceView>
  readonly selected: (fileId: TeamBattleFileId) => void
  readonly t: Translate
}) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [versionLabel, setVersionLabel] = useState('v1.0')
  const [note, setNote] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const busy = live.pending || reading
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (file === null || live.view === null || busy) return
    if (file.size > live.view.limits.maxFileBytes) { setError(t('files.tooLarge', { size: formatBytes(live.view.limits.maxFileBytes, t) })); return }
    setReading(true)
    setError(null)
    try {
      const contentBase64 = await readUpload(file)
      const result = await live.mutate(() => actions.publishFile({
        name: name.trim(), mediaType: file.type || 'application/octet-stream', contentBase64,
        versionLabel: versionLabel.trim(), note: note.trim(), source: source.trim() || t('files.browserSource'),
        ...(parentId === undefined ? {} : { parentId }),
      }))
      if (result !== undefined) {
        const added = result.files.find(item => item.name === name.trim() && item.parentId === parentId)
        if (added !== undefined) selected(added.id)
        close()
        setFile(null); setName(''); setNote(''); setSource(''); setVersionLabel('v1.0')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('files.readFailed'))
    } finally { setReading(false) }
  }
  return <Modal open={open} onClose={() => { if (!busy) close() }} title={t('files.publish')} closeLabel={t('files.close')} className={css.modal ?? ''}>
    <form className={css.form} onSubmit={(event) => { void submit(event) }}>
      <strong>{t('journey.publishDestination', { name: projectName })}</strong><p className={css.formHint}>{t('journey.publishNotice')}</p>
      <label>{t('files.chooseFile')}<input key={open ? 'open' : 'closed'} type="file" required disabled={busy} onChange={(event) => { const chosen = event.target.files?.[0] ?? null; setFile(chosen); setName(chosen?.name ?? ''); setError(null) }} /></label>
      <p className={css.formHint}>{t('files.uploadHint', { size: formatBytes(live.view?.limits.maxFileBytes ?? 0, t) })}</p>
      <label>{t('files.name')}<input required value={name} onChange={(event) => { setName(event.target.value) }} /></label>
      <label>{t('files.versionLabel')}<input required value={versionLabel} onChange={(event) => { setVersionLabel(event.target.value) }} /></label>
      <label>{t('files.source')}<input value={source} placeholder={t('files.sourcePlaceholder')} onChange={(event) => { setSource(event.target.value) }} /></label>
      <label>{t('files.note')}<textarea value={note} onChange={(event) => { setNote(event.target.value) }} /></label>
      {(error ?? live.error) !== null && <p className={css.formError} role="alert">{error ?? live.error}</p>}
      <div className={css.formActions}><button type="button" disabled={busy} onClick={close}>{t('common.cancel')}</button><button type="submit" disabled={busy || file === null || name.trim() === '' || versionLabel.trim() === ''}>{busy ? t('files.uploading') : t('common.save')}</button></div>
    </form>
  </Modal>
}

/**
 * Render hierarchical shared files and their explicit publication and delivery actions.
 * @param props - current project, file projection, Remote calls, and header dialog state.
 * @returns sortable files, provenance detail, and upload, preview, and edit dialogs.
 */
export function TeamSpaceFiles({
  allowCodexDelivery, actions, project, live, projectLive, t, publishing, setPublishing, creatingFolder, setCreatingFolder, requestedFile,
}: FileBrowserProps) {
  const [parentId, setParentId] = useState<TeamBattleFolderId | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<TeamBattleFileId | null | undefined>(undefined)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [sort, setSort] = useState<{ field: 'name' | 'updatedAt'; ascending: boolean }>({ field: 'updatedAt', ascending: false })
  const [menu, setMenu] = useState<string | null>(null)
  const [itemAction, setItemAction] = useState<ItemAction | null>(null)
  const [itemName, setItemName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [taskId, setTaskId] = useState('')
  useEffect(() => {
    if (requestedFile === null) return
    setParentId(requestedFile.parentId)
    setSelectedId(requestedFile.id)
    setChecked(new Set())
    setMenu(null)
    setPreviewOpen(false)
    setSubmitOpen(false)
  }, [requestedFile])
  const space = live.view
  const members = useMemo(() => new Map<string, string>(project.members.map(member => [member.id, member.name])), [project.members])
  const memberName = (id: string): string => members.get(id) ?? id
  const folders = space?.folders ?? []
  const files = space?.files ?? []
  const entries: SpaceItem[] = [
    ...folders.filter(item => item.parentId === parentId).map(item => ({ kind: 'folder' as const, item })),
    ...files.filter(item => item.parentId === parentId).map(item => ({ kind: 'file' as const, item })),
  ].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    const order = sort.field === 'name' ? a.item.name.localeCompare(b.item.name) : a.item.updatedAt - b.item.updatedAt
    return sort.ascending ? order : -order
  })
  const visibleFile = entries.find(entry => entry.kind === 'file' && entry.item.mediaType.startsWith('image/')) ?? entries.find(entry => entry.kind === 'file')
  const selected = selectedId === undefined ? (visibleFile?.kind === 'file' ? visibleFile.item : undefined) : files.find(file => file.id === selectedId)
  const content = useFileContent(selected, actions.readFile)
  const breadcrumbs: TeamBattleFolderView[] = []
  let current = folders.find(folder => folder.id === parentId)
  while (current !== undefined) { breadcrumbs.unshift(current); current = folders.find(folder => folder.id === current?.parentId) }
  const delivery = space?.deliveries.filter(item => item.fileId === selected?.id && item.memberId === project.localMemberId).at(-1)
  const tasks = project.tasks.filter(task => task.ownerMemberId === project.localMemberId && (task.status === 'in_progress' || task.status === 'submitted'))
  const pending = live.pending || projectLive.pending
  const navigate = (id: TeamBattleFolderId | undefined): void => {
    setParentId(id)
    setSelectedId(undefined)
    setChecked(new Set())
    setMenu(null)
  }
  const toggleSort = (field: 'name' | 'updatedAt'): void => { setSort(previous => ({ field, ascending: previous.field === field ? !previous.ascending : true })) }
  const openAction = (entry: SpaceItem, action: 'rename' | 'delete'): void => { setMenu(null); setItemAction({ entry, action }); setItemName(entry.item.name) }
  const changeItem = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (itemAction === null) return
    const { entry, action } = itemAction
    const result = await live.mutate(() => actions.updateSpaceItem({ kind: entry.kind, id: entry.item.id, expectedRevision: entry.item.revision, action, ...(action === 'rename' ? { name: itemName.trim() } : {}) }))
    if (result !== undefined) { setItemAction(null); if (action === 'delete') setChecked((previous) => { const next = new Set(previous); next.delete(entry.item.id); return next }) }
  }
  const createFolder = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const result = await live.mutate(() => actions.createFolder({
      name: folderName.trim(), ...(parentId === undefined ? {} : { parentId }),
    }))
    if (result !== undefined) { setCreatingFolder(false); setFolderName('') }
  }
  const submitFile = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const task = tasks.find(item => item.id === taskId)
    if (selected === undefined || task === undefined) return
    const result = await projectLive.mutate(() => actions.submitFile({
      fileId: selected.id, taskId: task.id, expectedTaskRevision: task.revision,
    }))
    if (result !== undefined) { setSubmitOpen(false); setTaskId(''); await live.refresh() }
  }

  return <>
    <div className={css.fileMain}>
      <div className={css.breadcrumb} aria-label={t('view.team')}><button type="button" onClick={() => { navigate(undefined) }}>{t('view.team')}</button>{breadcrumbs.map(folder => <span key={folder.id}> / <button type="button" onClick={() => { navigate(folder.id) }}>{folder.name}</button></span>)}</div>
      {checked.size > 0 && <div className={css.selectionBar}><span>{t('files.selected', { count: checked.size })}</span><button type="button" onClick={() => { setChecked(new Set()) }}>{t('files.clearSelection')}</button></div>}
      {space === null ? <div className={css.centerState}>{live.loading ? t('common.loading') : t('common.error')}</div> : <>
        <table className={css.fileTable}>
          <colgroup>
            <col className={css.checkColumn} /><col /><col className={css.publisherColumn} />
            <col className={css.timeColumn} /><col className={css.statusColumn} /><col className={css.menuColumn} />
          </colgroup>
          <thead><tr><th><input type="checkbox" aria-label={t('files.selectAll')} checked={entries.length > 0 && entries.every(entry => checked.has(entry.item.id))} onChange={(event) => { setChecked(event.target.checked ? new Set(entries.map(entry => entry.item.id)) : new Set()) }} /></th><th aria-sort={sort.field === 'name' ? (sort.ascending ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => { toggleSort('name') }}>{t('files.name')} {sort.field === 'name' && sort.ascending ? <IconChevronUpOutlineRegular size={12} /> : <IconChevronDownOutlineRegular size={12} />}</button></th><th>{t('files.publisher')}</th><th aria-sort={sort.field === 'updatedAt' ? (sort.ascending ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => { toggleSort('updatedAt') }}>{t('files.updatedAt')} {sort.field === 'updatedAt' && sort.ascending ? <IconChevronUpOutlineRegular size={12} /> : <IconChevronDownOutlineRegular size={12} />}</button></th><th>{t('files.status')}</th><th /></tr></thead>
          <tbody>{entries.map((entry) => {
            const { item, kind } = entry
            const review = kind === 'file' ? entry.item.review?.status : undefined
            return <tr key={item.id} data-selected={kind === 'file' && selected?.id === item.id ? '' : undefined}>
              <td><input type="checkbox" aria-label={t('files.select', { name: item.name })} checked={checked.has(item.id)} onChange={(event) => { setChecked((previous) => { const next = new Set(previous); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next }); if (kind === 'file') setSelectedId(entry.item.id) }} /></td>
              <td><button className={css.fileName} type="button" onClick={() => { if (kind === 'folder') navigate(entry.item.id); else setSelectedId(entry.item.id) }}>{kind === 'folder' ? <img className={css.fileIcon} src={folderIcon} alt="" /> : <img className={css.fileIcon} src={entry.item.mediaType.startsWith('image/') ? imageIcon : /(?:json|javascript|typescript|html)/u.test(entry.item.mediaType) ? codeIcon : documentIcon} alt="" />}<span>{item.name}</span></button></td>
              <td>{memberName(item.createdByMemberId)}</td>
              <td><time dateTime={new Date(item.updatedAt).toISOString()}>{formatTime(item.updatedAt)}</time></td>
              <td>{kind === 'folder' ? <span className={css.dash}>–</span> : <span className={css.fileStatus}><i data-status={review === 'pending' ? 'idle' : review === 'rejected' ? 'failed' : 'online'} />{memberName(item.createdByMemberId)} {review === undefined ? t('files.published') : t(`artifact.${review}`)}</span>}</td>
              <td><div className={css.rowMenu} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null) }}><button className={css.iconButton} type="button" aria-label={t('files.more', { name: item.name })} aria-expanded={menu === item.id} onClick={() => { setMenu(menu === item.id ? null : item.id) }}><IconEllipsisOutlineRegular size={21} /></button>{menu === item.id && <div className={css.menu} role="menu"><button type="button" role="menuitem" onClick={() => { openAction(entry, 'rename') }}>{t('files.rename')}</button><button type="button" role="menuitem" className={css.danger} onClick={() => { openAction(entry, 'delete') }}>{t('files.delete')}</button></div>}</div></td>
            </tr>
          })}</tbody>
        </table>
        {entries.length === 0 && <div className={css.emptyFiles}><IconFolderCloseRegular size={42} /><h2>{t('files.empty')}</h2><p>{t('files.emptyHint')}</p><button type="button" className={css.primaryButton} onClick={() => { setPublishing(true) }}>{t('files.publish')}</button></div>}
      </>}
    </div>
    {selected !== undefined && <aside className={css.details} aria-label={selected.name} data-auto-selected={selectedId === undefined ? '' : undefined}>
      <div className={css.detailHeading}><strong>{selected.name}</strong><button type="button" className={css.iconButton} aria-label={t('files.close')} onClick={() => { setSelectedId(null) }}><IconCloseOutlineRegular /></button></div>
      <div className={css.thumbnail}>{content.content !== null ? <Preview content={content.content} t={t} /> : content.error !== null ? <div className={css.previewError}><span role="alert">{content.error}</span><button type="button" onClick={content.refresh}>{t('files.retryPreview')}</button></div> : <span>{t('common.loading')}</span>}</div>
      <dl className={css.fileMetadata}><div><dt>{t('files.version')}</dt><dd>{selected.versionLabel}</dd></div><div><dt>{t('files.publisher')}</dt><dd>{memberName(selected.createdByMemberId)}</dd></div><div><dt>{t('files.publishedAt')}</dt><dd>{formatTime(selected.createdAt)}</dd></div><div><dt>{t('files.source')}</dt><dd>{selected.source}</dd></div></dl>
      <div className={css.fileNote}><span>{t('files.note')}</span><p>{selected.note || t('files.noNote')}</p></div>
      <div className={css.detailActions}><button type="button" disabled={content.content === null} onClick={() => { setPreviewOpen(true) }}><img className={css.actionIcon} src={previewIcon} alt="" />{t('files.preview')}</button>{allowCodexDelivery && <button type="button" disabled={pending || delivery?.status === 'queued'} onClick={() => { void live.mutate(() => actions.sendFile({ fileId: selected.id, expectedRevision: selected.revision })) }}><img className={css.actionIcon} src={sendIcon} alt="" />{t('files.send')}</button>}</div>
      <p className={css.deliveryStatus}>{t(allowCodexDelivery ? 'files.queueHint' : 'journey.localAIHint')}</p>
      {delivery !== undefined && <p className={css.deliveryStatus} role="status" data-status={delivery.status}>{t(`files.${delivery.status}`)}{delivery.note === undefined ? '' : ` · ${delivery.note}`}</p>}
      <div className={css.secondaryActions}><button type="button" disabled={content.content === null} onClick={() => { if (content.content !== null) download(content.content) }}><IconDownloadOutlineRegular />{t('files.download')}</button>{selected.taskId === undefined && <button type="button" disabled={pending} onClick={() => { setSubmitOpen(true) }}>{t('files.submit')}</button>}</div>
      <p className={css.fileSize}>{formatBytes(selected.bytes, t)}</p>
    </aside>}
    <UploadDialog
      open={publishing} close={() => { setPublishing(false) }} parentId={parentId}
      actions={actions} live={live} selected={setSelectedId} projectName={project.project.name} t={t}
    />
    <Modal open={creatingFolder} onClose={() => { if (!pending) setCreatingFolder(false) }} title={t('files.newFolder')} closeLabel={t('files.close')} className={css.modal ?? ''}><form className={css.form} onSubmit={(event) => { void createFolder(event) }}><label>{t('files.folderName')}<input autoFocus required value={folderName} onChange={(event) => { setFolderName(event.target.value) }} /></label>{live.error !== null && <p className={css.formError} role="alert">{live.error}</p>}<div className={css.formActions}><button type="button" onClick={() => { setCreatingFolder(false) }}>{t('common.cancel')}</button><button type="submit" disabled={pending || folderName.trim() === ''}>{t('common.save')}</button></div></form></Modal>
    <Modal open={itemAction !== null} onClose={() => { if (!pending) setItemAction(null) }} title={itemAction?.action === 'delete' ? t('files.deleteItem', { name: itemAction.entry.item.name }) : t('files.rename')} closeLabel={t('files.close')} className={css.modal ?? ''}><form className={css.form} onSubmit={(event) => { void changeItem(event) }}>{itemAction?.action === 'rename' ? <label>{t('files.name')}<input autoFocus required value={itemName} onChange={(event) => { setItemName(event.target.value) }} /></label> : <p>{t('files.deleteConfirm')}</p>}{live.error !== null && <p className={css.formError} role="alert">{live.error}</p>}<div className={css.formActions}><button type="button" onClick={() => { setItemAction(null) }}>{t('common.cancel')}</button><button type="submit" disabled={pending || (itemAction?.action === 'rename' && itemName.trim() === '')}>{itemAction?.action === 'delete' ? t('files.delete') : t('files.saveName')}</button></div></form></Modal>
    <Modal open={previewOpen && content.content !== null} onClose={() => { setPreviewOpen(false) }} title={selected?.name ?? t('files.preview')} closeLabel={t('files.close')} className={css.previewModal ?? ''}>{content.content !== null && <Preview content={content.content} t={t} />}</Modal>
    <Modal open={submitOpen && selected !== undefined} onClose={() => { if (!pending) setSubmitOpen(false) }} title={t('files.submit')} closeLabel={t('files.close')} className={css.modal ?? ''}><form className={css.form} onSubmit={(event) => { void submitFile(event) }}><p>{t('files.submitHint')}</p>{tasks.length === 0 ? <p>{t('files.noTask')}</p> : <label>{t('files.task')}<select required value={taskId} onChange={(event) => { setTaskId(event.target.value) }}><option value="">{t('files.task')}</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>}{projectLive.error !== null && <p role="alert" className={css.formError}>{projectLive.error}</p>}<div className={css.formActions}><button type="button" onClick={() => { setSubmitOpen(false) }}>{t('common.cancel')}</button><button type="submit" disabled={pending || taskId === ''}>{t('files.submit')}</button></div></form></Modal>
  </>
}
