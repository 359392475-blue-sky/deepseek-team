// Keyless assembled-browser coverage for the private Team Battle Web profiles
// over real Host storage and generated Typert Remote calls.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria,
  compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/team-battle-panel', import.meta.url))
const TEAM_SPACE_EXPECTED = join(SNAPSHOT_DIR, 'team-space.expected.md')
const FILE_ACTIONS_EXPECTED = join(SNAPSHOT_DIR, 'file-actions.expected.md')
const SHARED_WORKFLOW_EXPECTED = join(SNAPSHOT_DIR, 'shared-workflow.expected.md')
const CREATE_AUTH_EXPECTED = join(SNAPSHOT_DIR, 'create-authorization.expected.md')
const OVERLAY = fileURLToPath(new URL('./team-battle-panel.overlay.yml', import.meta.url))
const HOST_PATCH = fileURLToPath(new URL('../../../packages/experimental/team-battle-profile/cordis.patch.yml', import.meta.url))
const WEB_PATCH = fileURLToPath(new URL('../../../packages/experimental/team-battle-web-profile/cordis.patch.yml', import.meta.url))
const INSTALL_ANCHORS = [
  fileURLToPath(new URL('../../../packages/experimental/team-battle-profile/package.json', import.meta.url)),
  fileURLToPath(new URL('../../../packages/experimental/team-battle-web-profile/package.json', import.meta.url)),
]
const MODE = webSnapshotMode()
const CONNECTOR_SECRET_ENV = 'TEAM_BATTLE_CODEX_TOKEN'
const QUERY_TEXT = 'PRIVATE_QUERY_CONTENT_MUST_NOT_REACH_TEAM_BATTLE'
const TASK_TITLE = 'Ship the assembled Team Battle slice'
const TASK_DESCRIPTION = 'Exercise the durable weighted-task workflow through the browser.'
const TASK_WEIGHT = 7
const CONTEXT_SUMMARY = 'The assembled Host and Web layers are the accepted integration surface.'
const ARTIFACT_NAME = 'team-battle-browser-proof.md'
const ARTIFACT_URI = 'https://example.invalid/team-battle-browser-proof.md'
const ARTIFACT_SHA256 = 'a'.repeat(64)

function profileEntries(path: string): unknown[] {
  const parsed = yaml.load(readFileSync(path, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new Error(`profile layer at ${path} must be a list`)
  return parsed
}

async function fraction(region: Locator, label: string): Promise<readonly [number, number]> {
  const value = await region.getByText(label, { exact: true }).locator('..').locator('b, strong').first().textContent()
  const match = value?.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`${label} did not expose a current/max value: ${String(value)}`)
  }
  return [Number(match[1]), Number(match[2])]
}

async function percentage(region: Locator): Promise<number> {
  const value = await region.getByText('Real progress', { exact: true }).locator('..').locator('strong').first().textContent()
  const match = value?.match(/^(\d+)%$/)
  if (match?.[1] === undefined) throw new Error(`Real progress did not expose a percentage: ${String(value)}`)
  return Number(match[1])
}

async function weaponCount(game: Locator): Promise<number> {
  const value = await game.getByText('Special weapons', { exact: true }).locator('..').locator('b').textContent()
  const count = Number(value)
  if (!Number.isSafeInteger(count)) throw new Error(`Special weapons did not expose an integer: ${String(value)}`)
  return count
}

async function selectView(page: Page, name: 'Chat' | 'Team Space'): Promise<void> {
  const team = page.locator('[data-team-space-view]')
  if (name === 'Chat') {
    if (await team.isVisible()) await team.getByRole('button', { name: 'Conversation', exact: true }).click()
  } else if (!(await team.isVisible())) {
    await page.locator('[data-team-space-entry]').click()
  }
}

describe('Team Battle panel overlay', () => {
  it('matches the shipped Host and Web profile layers', () => {
    const shipped = [
      ...profileEntries(HOST_PATCH),
      ...profileEntries(WEB_PATCH),
    ]
    const expected = JSON.stringify(shipped).replace('"localMemberId":"product"', '"localMemberId":"product","allowSimulation":true')
    expect(JSON.stringify(profileEntries(OVERLAY))).toBe(expected)
  })
})

describe('web e2e: Team Battle panel', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let previousConnectorSecret: string | undefined

  beforeAll(async () => {
    previousConnectorSecret = process.env[CONNECTOR_SECRET_ENV]
    process.env[CONNECTOR_SECRET_ENV] = 'test-team-token'
    scaffold = await launchWebScaffold({ directoryPicker: 'profile', extraOverlayPath: OVERLAY, extraInstallAnchors: INSTALL_ANCHORS })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)

    const agent = scaffold.ctx.agents.list()[0]
    if (agent === undefined) throw new Error('connected Team Battle workspace did not create an Agent')
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: QUERY_TEXT }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    agent.session.append('step/start', { turn: 1, step: 1 })
    agent.session.append('assistant/message', {
      stream: [],
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'Team Battle ready.' }],
        source: { kind: 'model', provider: 'fixture', model: 'fixture' },
      }),
    }, { surfaceOp: 'append' })
    agent.session.append('step/end', { turn: 1, step: 1 })
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await scaffold.ctx.sessions.flush(agent.session)
    await page.getByText('Team Battle ready.').waitFor({ timeout: 10_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    if (previousConnectorSecret === undefined) delete process.env.TEAM_BATTLE_CODEX_TOKEN
    else process.env[CONNECTOR_SECRET_ENV] = previousConnectorSecret
  })

  it('persists the Query weapon and accepted weighted workflow while keeping leisure shield independent', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-team-battle-panel'))

    const game = page.locator('[data-flight-game-panel]')
    await game.getByRole('heading', { name: 'Collaboration Flight' }).waitFor({ timeout: 15_000 })
    await game.getByRole('button', { name: 'Expand game', exact: true }).click()
    await expect.poll(async () => await weaponCount(game), { timeout: 15_000 }).toBe(1)
    expect(await game.textContent()).not.toContain(QUERY_TEXT)

    await selectView(page, 'Team Space')
    const team = page.locator('[data-team-space-view]')
    await expect.poll(async () => await team.getByRole('combobox', { name: 'Choose Team Space', exact: true }).inputValue()).toBe('lowpower-team-battle')
    await team.getByRole('button', { name: 'Tasks', exact: true }).click()

    await team.getByRole('button', { name: 'New task', exact: true }).click()
    const taskForm = team.getByPlaceholder('Task title').locator('..')
    await taskForm.getByPlaceholder('Task title').fill(TASK_TITLE)
    await taskForm.getByPlaceholder('Task description').fill(TASK_DESCRIPTION)
    await taskForm.getByRole('spinbutton', { name: 'Progress weight' }).fill(String(TASK_WEIGHT))
    await taskForm.getByRole('button', { name: 'Publish', exact: true }).click()

    const taskCard = team.locator('article').filter({ hasText: TASK_TITLE })
    await taskCard.getByText('Open', { exact: true }).waitFor({ timeout: 10_000 })
    await taskCard.getByRole('button', { name: 'Claim', exact: true }).click()
    await taskCard.getByRole('button', { name: 'Release', exact: true }).waitFor({ timeout: 10_000 })
    expect((await scaffold.ctx.teamBattle.view()).progress).toMatchObject({ coreHp: TASK_WEIGHT, coreMaxHp: TASK_WEIGHT })
    await expect.poll(async () => await percentage(team)).toBe(0)

    await selectView(page, 'Chat')
    await game.getByRole('heading', { name: 'Collaboration Flight' }).waitFor({ timeout: 10_000 })
    await expect.poll(async () => await fraction(game, 'Core HP'), { timeout: 10_000 }).toEqual([TASK_WEIGHT, TASK_WEIGHT])
    const shieldBefore = await fraction(game, 'Leisure shield')
    await game.getByRole('button', { name: 'Fire special weapon', exact: true }).click()
    await expect.poll(async () => await weaponCount(game), { timeout: 10_000 }).toBe(0)
    await expect.poll(async () => await fraction(game, 'Leisure shield')).toEqual([shieldBefore[0] - 3, shieldBefore[1]])
    expect(await fraction(game, 'Core HP')).toEqual([TASK_WEIGHT, TASK_WEIGHT])

    await selectView(page, 'Team Space')
    await team.getByRole('button', { name: 'Meeting notes', exact: true }).click()
    const contextForm = team.getByPlaceholder('Summary').locator('..')
    await contextForm.getByPlaceholder('Summary').fill(CONTEXT_SUMMARY)
    await contextForm.getByPlaceholder('Decisions (one per line)').fill('Use the shipped Host and Web profile layers.')
    await contextForm.getByPlaceholder('Source references (one per line)').fill('apps/web/tests/team-battle-panel.e2e.ts')
    await contextForm.getByRole('button', { name: 'Publish', exact: true }).click()
    await team.getByText(CONTEXT_SUMMARY, { exact: true }).waitFor({ timeout: 10_000 })

    await team.getByRole('button', { name: 'Review', exact: true }).click()
    await team.getByText('Submit external artifact link', { exact: true }).click()
    const artifactForm = team.getByPlaceholder('Artifact name').locator('..').locator('..')
    await artifactForm.getByRole('combobox').selectOption({ label: TASK_TITLE })
    await artifactForm.getByPlaceholder('Artifact name').fill(ARTIFACT_NAME)
    await artifactForm.getByPlaceholder('Media type').fill('text/markdown')
    await artifactForm.getByPlaceholder('Artifact URI').fill(ARTIFACT_URI)
    await artifactForm.getByPlaceholder('SHA-256').fill(ARTIFACT_SHA256)
    await artifactForm.getByPlaceholder('Bytes').fill('4096')
    await artifactForm.getByRole('button', { name: 'Publish', exact: true }).click()

    const artifactCard = team.locator('article').filter({ hasText: ARTIFACT_NAME })
    await artifactCard.getByText('Pending review', { exact: true }).waitFor({ timeout: 10_000 })
    await team.getByRole('combobox', { name: 'Acting member', exact: true }).selectOption('quality')
    await team.getByRole('button', { name: 'Review', exact: true }).click()
    await artifactCard.getByPlaceholder('Review note').fill('Accepted by the assembled browser workflow.')
    await artifactCard.getByRole('button', { name: 'Accept', exact: true }).click()
    await artifactCard.getByText('Accepted', { exact: true }).waitFor({ timeout: 10_000 })

    await team.getByRole('button', { name: 'Tasks', exact: true }).click()
    expect((await scaffold.ctx.teamBattle.view()).progress).toMatchObject({ coreHp: 0, coreMaxHp: TASK_WEIGHT })
    await expect.poll(async () => await percentage(team)).toBe(100)
    expect((await scaffold.ctx.teamBattle.view()).combatShield).toEqual({ hp: shieldBefore[0] - 3, maxHp: shieldBefore[1] })
    expect(tripwire.pageErrors).toEqual([])

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await selectView(page, 'Chat')
    await game.getByRole('button', { name: 'Expand game', exact: true }).click()
    await game.getByRole('heading', { name: 'Collaboration Flight' }).waitFor({ timeout: 10_000 })
    await expect.poll(async () => await weaponCount(game), { timeout: 10_000 }).toBe(0)
    expect(await fraction(game, 'Core HP')).toEqual([0, TASK_WEIGHT])
    expect(await fraction(game, 'Leisure shield')).toEqual([shieldBefore[0] - 3, shieldBefore[1]])

    await selectView(page, 'Team Space')
    await team.getByRole('button', { name: 'Tasks', exact: true }).click()
    await team.getByText(TASK_TITLE, { exact: true }).waitFor({ timeout: 15_000 })
    expect((await scaffold.ctx.teamBattle.view()).progress).toMatchObject({ coreHp: 0, coreMaxHp: TASK_WEIGHT })
    expect(await percentage(team)).toBe(100)
    expect((await scaffold.ctx.teamBattle.view()).combatShield).toEqual({ hp: shieldBefore[0] - 3, maxHp: shieldBefore[1] })

    await team.getByRole('button', { name: 'Meeting notes', exact: true }).click()
    await team.getByText(CONTEXT_SUMMARY, { exact: true }).waitFor({ timeout: 10_000 })
    await team.getByRole('button', { name: 'Review', exact: true }).click()
    await team.getByText(ARTIFACT_NAME, { exact: true }).waitFor({ timeout: 10_000 })
    await team.getByText('Accepted', { exact: true }).waitFor({ timeout: 10_000 })
    await team.getByRole('button', { name: 'Tasks', exact: true }).click()
    await taskCard.getByText('Completed', { exact: true }).waitFor({ timeout: 10_000 })

    const snapshot = await captureStableAria(
      page,
      '[data-team-space-view] [class*="workspace"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(TEAM_SPACE_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)

  it('opens without a private session and persists uploaded files with acknowledged connector delivery', async () => {
    const filesPage = await newEnglishPage(browser)
    onTestFailed(() => saveFailureShot(filesPage, 'web-e2e-team-space-files'))
    const url = new URL(scaffold.authenticatedUrl)
    url.hash = 'team'
    await filesPage.goto(url.href, { waitUntil: 'load' })
    await selectView(filesPage, 'Team Space')
    expect(await filesPage.locator('[data-team-space-entry]').evaluate(element => element.closest('[inert]') !== null)).toBe(true)
    const files = filesPage.locator('[data-team-space-view]')
    await files.getByRole('button', { name: 'New folder', exact: true }).waitFor({ timeout: 15_000 })
    await files.getByRole('button', { name: 'Tasks', exact: true }).click()
    await files.getByRole('button', { name: 'New task', exact: true }).click()
    const fileTaskForm = files.getByPlaceholder('Task title').locator('..')
    await fileTaskForm.getByPlaceholder('Task title').fill('Review uploaded bytes')
    await fileTaskForm.getByPlaceholder('Task description').fill('Inspect retained bytes and require independent review.')
    await fileTaskForm.getByRole('spinbutton', { name: 'Progress weight' }).fill('2')
    await fileTaskForm.getByRole('button', { name: 'Publish', exact: true }).click()
    await files.locator('article').filter({ hasText: 'Review uploaded bytes' }).getByText('Open', { exact: true }).waitFor()
    await files.getByRole('combobox', { name: 'Acting member', exact: true }).selectOption('engineering')
    await files.getByRole('button', { name: 'Tasks', exact: true }).click()
    const fileTaskCard = files.locator('article').filter({ hasText: 'Review uploaded bytes' })
    await fileTaskCard.getByRole('button', { name: 'Claim', exact: true }).click()
    await fileTaskCard.getByRole('button', { name: 'Release', exact: true }).waitFor()
    expect(await page.getByRole('combobox', { name: 'Acting member', exact: true }).inputValue()).toBe('product')
    const task = (await scaffold.ctx.teamBattle.view()).tasks.find(value => value.title === 'Review uploaded bytes')
    if (task === undefined) throw new Error('file-review fixture task missing')
    expect(task).toMatchObject({ createdByMemberId: 'product', ownerMemberId: 'engineering' })
    await files.getByRole('button', { name: 'Files', exact: true }).click()
    await files.getByRole('button', { name: 'New folder', exact: true }).click()
    const folderDialog = filesPage.getByRole('dialog', { name: 'New folder' })
    await folderDialog.getByLabel('Folder name', { exact: true }).fill('Browser acceptance')
    await folderDialog.getByRole('button', { name: 'Publish', exact: true }).click()
    await files.getByRole('button', { name: 'Browser acceptance', exact: true }).click()

    await files.getByRole('button', { name: 'Publish to Team Space', exact: true }).first().click()
    const publishDialog = filesPage.getByRole('dialog', { name: 'Publish to Team Space' })
    const bytes = readFileSync(fileURLToPath(new URL('../../../packages/experimental/client-ui-team-battle/src/assets/player-fighter.png', import.meta.url)))
    await publishDialog.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'browser-proof.png', mimeType: 'image/png', buffer: bytes })
    await publishDialog.getByLabel('Note', { exact: true }).fill('Explicitly published browser acceptance file.')
    await publishDialog.getByRole('button', { name: 'Publish', exact: true }).click()
    await files.getByRole('button', { name: 'browser-proof.png', exact: true }).click()
    await files.getByRole('button', { name: 'Preview', exact: true }).click()
    const preview = filesPage.getByRole('dialog')
    await preview.getByRole('img', { name: 'browser-proof.png', exact: true }).waitFor()
    await preview.getByRole('button', { name: 'Close', exact: true }).click()

    const published = (await scaffold.ctx.teamBattle.space()).files.find(file => file.name === 'browser-proof.png')
    if (published === undefined) throw new Error('uploaded file missing from Host projection')
    expect(published.createdByMemberId).toBe('engineering')
    expect(Buffer.from((await scaffold.ctx.teamBattle.readFile({ fileId: published.id })).contentBase64, 'base64')).toEqual(bytes)
    const folder = (await scaffold.ctx.teamBattle.space()).folders.find(value => value.name === 'Browser acceptance')
    if (folder === undefined) throw new Error('created folder missing from Host projection')
    await expect(scaffold.ctx.teamBattle.updateSpaceItem({ kind: 'folder', id: folder.id, expectedRevision: folder.revision, action: 'delete' })).rejects.toThrow()

    await files.getByRole('button', { name: 'More actions for browser-proof.png', exact: true }).click()
    await files.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    const rename = filesPage.getByRole('dialog', { name: 'Rename' })
    await rename.getByLabel('Name', { exact: true }).fill('published-proof.png')
    await rename.getByRole('button', { name: 'Save name', exact: true }).click()
    await files.getByRole('button', { name: 'published-proof.png', exact: true }).waitFor()
    await files.getByRole('button', { name: 'Send to my Codex', exact: true }).click()
    await files.getByText('Queued, waiting for Codex', { exact: true }).waitFor()
    const delivery = (await scaffold.ctx.teamBattle.space()).deliveries.find(value => value.fileId === published.id)
    expect(delivery).toMatchObject({ status: 'queued', memberId: 'engineering' })

    const connector = new URL('/team-battle/codex/deliveries', scaffold.authenticatedUrl).href
    const headers = { authorization: 'Bearer test-team-token' }
    const pulled = await filesPage.request.post(`${connector}/pull`, { headers, data: { memberId: 'engineering' } })
    expect(pulled.status()).toBe(200)
    expect(await pulled.json()).toMatchObject({
      delivery: { id: delivery?.id, status: 'queued', memberId: 'engineering' },
      content: { contentBase64: bytes.toString('base64') },
    })
    expect((await scaffold.ctx.teamBattle.space()).deliveries.find(value => value.id === delivery?.id)?.status).toBe('queued')
    const acknowledged = await filesPage.request.post(`${connector}/ack`, { headers, data: { memberId: 'engineering', deliveryId: delivery?.id, outcome: 'delivered', note: 'Test receiver inspected exact bytes' } })
    expect(acknowledged.status()).toBe(200)
    await files.getByRole('status').filter({ hasText: 'Receiver confirmed receipt' }).waitFor({ timeout: 10_000 })

    await files.getByRole('button', { name: 'Submit to task', exact: true }).click()
    const submitDialog = filesPage.getByRole('dialog', { name: 'Submit to task' })
    await submitDialog.getByRole('combobox').selectOption({ label: 'Review uploaded bytes' })
    await submitDialog.getByRole('button', { name: 'Submit to task', exact: true }).click()
    await files.getByRole('button', { name: 'Review', exact: true }).click()
    const uploadedArtifact = files.locator('article').filter({ hasText: 'published-proof.png' })
    await uploadedArtifact.getByRole('button', { name: 'View in Files', exact: true }).click()
    await files.getByRole('button', { name: 'published-proof.png', exact: true }).waitFor()
    await files.getByRole('button', { name: 'Review', exact: true }).click()
    await uploadedArtifact.getByText('Another member must review this artifact.', { exact: true }).waitFor()
    expect(await uploadedArtifact.getByRole('button', { name: 'Accept', exact: true }).count()).toBe(0)
    const submitted = (await scaffold.ctx.teamBattle.view()).artifacts.find(value => value.uri === `team-battle-file:${published.id}`)
    if (submitted === undefined) throw new Error('submitted uploaded file lacks its durable artifact')
    const refused = await scaffold.hostFetch('/api/teamBattle/reviewArtifact', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId: 'self-review-refusal', method: 'teamBattle/reviewArtifact',
        payload: { args: { request: {
          actingMemberId: 'engineering', artifactId: submitted.id, expectedRevision: submitted.revision, decision: 'accepted',
        } } },
      }),
    })
    expect(refused.ok).toBe(true)
    expect(await refused.json()).toMatchObject({ result: { ok: false, error: {
      message: 'artifact authors cannot review their own work; choose another member',
    } } })
    expect((await scaffold.ctx.teamBattle.view()).artifacts.find(value => value.id === submitted.id)?.review.status).toBe('pending')
    await files.getByRole('combobox', { name: 'Acting member', exact: true }).selectOption('quality')
    await files.getByRole('button', { name: 'Review', exact: true }).click()
    await uploadedArtifact.getByPlaceholder('Review note').fill('Attach the verification notes as a corrected file.')
    await uploadedArtifact.getByRole('button', { name: 'Request changes', exact: true }).click()
    await uploadedArtifact.getByText('Changes requested', { exact: true }).waitFor()
    expect((await scaffold.ctx.teamBattle.view()).tasks.find(value => value.id === task.id)?.status).toBe('in_progress')
    await files.getByRole('combobox', { name: 'Acting member', exact: true }).selectOption('engineering')
    await files.getByRole('button', { name: 'Files', exact: true }).click()
    await files.getByRole('button', { name: 'Browser acceptance', exact: true }).click()
    await files.getByRole('button', { name: 'Publish to Team Space', exact: true }).first().click()
    const correction = filesPage.getByRole('dialog', { name: 'Publish to Team Space' })
    const correctedBytes = Buffer.from('# Verification notes\nThe published image matches the accepted dimensions.\n')
    await correction.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'verification-v2.md', mimeType: 'text/markdown', buffer: correctedBytes,
    })
    await correction.getByRole('button', { name: 'Publish', exact: true }).click()
    await files.getByRole('button', { name: 'verification-v2.md', exact: true }).click()
    await files.getByRole('button', { name: 'Submit to task', exact: true }).click()
    await submitDialog.getByRole('combobox').selectOption({ label: 'Review uploaded bytes' })
    await submitDialog.getByRole('button', { name: 'Submit to task', exact: true }).click()
    await files.getByRole('combobox', { name: 'Acting member', exact: true }).selectOption('product')
    await files.getByRole('button', { name: 'Review', exact: true }).click()
    const correctedArtifact = files.locator('article').filter({ hasText: 'verification-v2.md' })
    await correctedArtifact.getByRole('button', { name: 'Accept', exact: true }).click()
    await correctedArtifact.getByText('Accepted', { exact: true }).waitFor()
    const finished = await scaffold.ctx.teamBattle.view()
    expect(finished.tasks.find(value => value.id === task.id)?.status).toBe('completed')
    expect(finished.artifacts.find(value => value.id === submitted.id)?.review).toMatchObject({ status: 'rejected', reviewedByMemberId: 'quality' })
    expect(finished.artifacts.find(value => value.name === 'verification-v2.md')?.review).toMatchObject({ status: 'accepted', reviewedByMemberId: 'product' })
    const correctedFile = (await scaffold.ctx.teamBattle.space()).files.find(value => value.name === 'verification-v2.md')
    if (correctedFile === undefined) throw new Error('corrected upload missing')
    expect(Buffer.from((await scaffold.ctx.teamBattle.readFile({ fileId: correctedFile.id })).contentBase64, 'base64')).toEqual(correctedBytes)
    await files.getByRole('combobox', { name: 'Acting member', exact: true }).selectOption('engineering')
    await files.getByRole('button', { name: 'Review', exact: true }).click()
    await uploadedArtifact.getByRole('button', { name: 'View in Files', exact: true }).click()
    const actionSnapshots = await Promise.all([
      captureStableAria(filesPage, '[data-team-space-view] [class*="detailActions"]', scaffold.workspaceCwd),
      captureStableAria(filesPage, '[data-team-space-view] [class*="secondaryActions"]', scaffold.workspaceCwd),
      captureStableAria(filesPage, '[data-team-space-view] [role="status"]', scaffold.workspaceCwd),
    ])
    await compareOrRefreshGolden(FILE_ACTIONS_EXPECTED, actionSnapshots.join('\n'), MODE)

    await filesPage.reload({ waitUntil: 'load' })
    await files.getByRole('combobox', { name: 'Acting member', exact: true }).selectOption('engineering')
    await files.getByRole('button', { name: 'Browser acceptance', exact: true }).click()
    await files.getByRole('button', { name: 'published-proof.png', exact: true }).click()
    await files.getByRole('status').filter({ hasText: 'Receiver confirmed receipt' }).waitFor({ timeout: 10_000 })
    expect(await files.textContent()).not.toContain(QUERY_TEXT)
    await filesPage.close()
  })

})

const SHARED_SERVER_OVERLAY = fileURLToPath(new URL('./team-battle-shared-server.overlay.yml', import.meta.url))
const SHARED_PROJECT_NAME = 'Shared browser delivery project'
const SHARED_TASK_TITLE = 'Ship a reviewed collaboration file'
const SHARED_FILE_NAME = 'shared-delivery.md'
const CREATION_TOKEN_ENV = 'TEAM_BATTLE_E2E_CREATION_TOKEN'
const CREATION_TOKEN = 'keyless-browser-server-creation'

async function openTeamManager(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Spaces and members', exact: true })
  if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Spaces and members', exact: true }).click()
  await dialog.waitFor()
  return dialog
}

async function openTeamPage(page: Page, scaffold: WebScaffold): Promise<Locator> {
  const url = new URL(scaffold.authenticatedUrl)
  url.hash = 'team'
  await page.goto(url.href, { waitUntil: 'load' })
  await page.locator('[data-team-space-view]').waitFor({ timeout: 30_000 })
  return page.locator('[data-team-space-view]')
}

describe('web e2e: shared Team Space across isolated Hosts', () => {
  const worlds: WebScaffold[] = []
  let server: WebScaffold
  let owner: WebScaffold
  let colleague: WebScaffold
  let browser: Browser
  let ownerPage: Page
  let colleaguePage: Page
  let serverOrigin: string
  let originalCreationToken: string | undefined
  let ownerConsole: ReturnType<typeof watchConsole>
  let colleagueConsole: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    originalCreationToken = process.env[CREATION_TOKEN_ENV]
    process.env[CREATION_TOKEN_ENV] = CREATION_TOKEN
    const launch = async (serverMode: boolean): Promise<WebScaffold> => {
      const world = await launchWebScaffold({
        directoryPicker: 'profile',
        extraOverlayPath: serverMode ? [HOST_PATCH, WEB_PATCH, SHARED_SERVER_OVERLAY] : [HOST_PATCH, WEB_PATCH],
        extraInstallAnchors: INSTALL_ANCHORS,
      })
      worlds.push(world)
      return world
    }
    server = await launch(true)
    const origin = (await server.ctx.teamBattle.teams()).hosting.origins[0]
    if (origin === undefined) throw new Error('dedicated Team server did not advertise its allocated listener')
    serverOrigin = origin
    owner = await launch(false)
    colleague = await launch(false)
    expect(new Set(worlds.map(world => world.workspaceCwd)).size).toBe(3)
    expect(new Set(worlds.map(world => world.harnessHome)).size).toBe(3)
    writeFileSync(join(owner.workspaceCwd, 'private-owner-draft.md'), QUERY_TEXT)
    writeFileSync(join(colleague.workspaceCwd, 'private-colleague-draft.md'), QUERY_TEXT)
    browser = await chromium.launch()
    ownerPage = await newEnglishPage(browser)
    colleaguePage = await newEnglishPage(browser)
    ownerConsole = watchConsole(ownerPage)
    colleagueConsole = watchConsole(colleaguePage)
    await openTeamPage(ownerPage, owner)
    await openTeamPage(colleaguePage, colleague)
  })

  afterAll(async () => {
    const failures: unknown[] = []
    try { await browser?.close() } catch (error) { failures.push(error) }
    // Each scaffold owns process environment restoration; close in reverse acquisition order.
    for (const world of worlds.reverse()) {
      try { await world.close() } catch (error) { failures.push(error) }
    }
    if (originalCreationToken === undefined) delete process.env.TEAM_BATTLE_E2E_CREATION_TOKEN
    else process.env[CREATION_TOKEN_ENV] = originalCreationToken
    if (failures.length > 0) throw new AggregateError(failures, 'shared Team browser fixtures did not close cleanly')
  })

  it('creates a server project, joins from another Host, hands off work, reviews bytes, and revokes access', async () => {
    onTestFailed(async () => {
      await saveFailureShot(ownerPage, 'web-e2e-team-shared-owner')
      await saveFailureShot(colleaguePage, 'web-e2e-team-shared-colleague')
    })
    const ownerTeam = ownerPage.locator('[data-team-space-view]')
    const colleagueTeam = colleaguePage.locator('[data-team-space-view]')
    const manager = await openTeamManager(ownerPage)
    await manager.getByRole('button', { name: 'Start a project', exact: true }).click()
    await manager.getByLabel('Shared server address', { exact: true }).fill(serverOrigin)
    const creationCode = manager.getByLabel(/^Server creation /)
    await creationCode.fill('incorrect-creation-code')
    await manager.getByLabel('Project name', { exact: true }).fill(SHARED_PROJECT_NAME)
    await manager.getByLabel('Project goal and deliverables', { exact: true }).fill('Two independent computers collaborate through retained published bytes.')
    await manager.getByLabel('My name', { exact: true }).fill('Morgan')
    await manager.getByRole('combobox', { name: /^My role\b/ }).selectOption({ label: 'Product' })
    await manager.getByRole('button', { name: 'Create shared space', exact: true }).click()
    await manager.getByRole('alert').waitFor()
    expect(await manager.getByRole('alert').textContent()).toContain('The server did not accept the creation authorization code.')
    expect(await manager.getByRole('alert').textContent()).not.toContain('gateway/internal')
    await compareOrRefreshGolden(CREATE_AUTH_EXPECTED, await captureStableAria(ownerPage, '[role="alert"]', owner.workspaceCwd), MODE)
    expect(await manager.getByLabel('Project name', { exact: true }).inputValue()).toBe(SHARED_PROJECT_NAME)
    expect(await manager.getByLabel('Project goal and deliverables', { exact: true }).inputValue()).toBe('Two independent computers collaborate through retained published bytes.')
    expect(await manager.getByLabel('My name', { exact: true }).inputValue()).toBe('Morgan')
    expect((await owner.ctx.teamBattle.teams()).teams.some(team => team.name === SHARED_PROJECT_NAME)).toBe(false)
    expect((await server.ctx.teamBattle.teams()).teams.some(team => team.name === SHARED_PROJECT_NAME)).toBe(false)
    await creationCode.fill(CREATION_TOKEN)
    await manager.getByRole('button', { name: 'Create shared space', exact: true }).click()
    await manager.getByRole('heading', { name: SHARED_PROJECT_NAME, exact: true }).waitFor()
    const ownSpace = (await owner.ctx.teamBattle.teams()).teams.find(team => team.name === SHARED_PROJECT_NAME)
    if (ownSpace === undefined) throw new Error('creator Host did not retain its joined server space')
    const teamId = ownSpace.id
    expect(ownSpace.mode).toBe('joined')
    expect((await server.ctx.teamBattle.teams()).teams.find(team => team.id === teamId)?.mode).toBe('hosted')
    expect(await ownerTeam.getByRole('combobox', { name: 'Acting member', exact: true }).count()).toBe(0)

    await openTeamManager(ownerPage)
    await manager.getByRole('button', { name: 'Invite a colleague', exact: true }).click()
    await manager.getByLabel('Colleague name', { exact: true }).fill('Dale')
    await manager.getByRole('combobox', { name: /^Colleague role\b/ }).selectOption({ label: 'Engineering' })
    await manager.getByRole('button', { name: 'Generate invitation', exact: true }).click()
    const inviteCode = await manager.getByRole('textbox', { name: /^Invitation\b/ }).inputValue()
    expect(inviteCode.length).toBeGreaterThan(0)

    const colleagueManager = await openTeamManager(colleaguePage)
    await colleagueManager.getByRole('button', { name: 'Join with an invitation', exact: true }).click()
    await colleagueManager.getByRole('textbox', { name: /^Invitation\b/ }).fill(inviteCode)
    await colleagueManager.getByRole('button', { name: 'Join this project', exact: true }).click()
    await expect.poll(async () => await colleagueTeam.getByRole('combobox', { name: 'Choose Team Space', exact: true }).inputValue()).toBe(teamId)
    const joinedSpace = (await colleague.ctx.teamBattle.teams()).teams.find(team => team.id === teamId)
    if (joinedSpace === undefined) throw new Error('second Host did not retain the invitation membership')
    expect(joinedSpace.mode).toBe('joined')
    expect(joinedSpace.localMemberId).not.toBe(ownSpace.localMemberId)
    expect((await colleague.ctx.teamBattle.view({ teamId })).simulationEnabled).toBe(false)
    expect(await colleagueTeam.getByRole('combobox', { name: 'Acting member', exact: true }).count()).toBe(0)
    await ownerPage.keyboard.press('Escape')
    await colleaguePage.keyboard.press('Escape')

    await ownerTeam.getByRole('button', { name: 'Tasks', exact: true }).click()
    await ownerTeam.getByRole('button', { name: 'New task', exact: true }).click()
    const taskForm = ownerTeam.getByPlaceholder('Task title').locator('..')
    await taskForm.getByPlaceholder('Task title').fill(SHARED_TASK_TITLE)
    await taskForm.getByPlaceholder('Task description').fill('Publish the selected Markdown file and request independent review.')
    await taskForm.getByRole('spinbutton', { name: 'Progress weight' }).fill('3')
    await taskForm.getByRole('button', { name: 'Publish', exact: true }).click()
    const taskCard = ownerTeam.locator('article').filter({ hasText: SHARED_TASK_TITLE })
    await taskCard.getByRole('button', { name: 'Claim', exact: true }).click()
    const handOff = async (card: Locator, nextMember: string, note: string): Promise<void> => {
      await card.getByRole('button', { name: 'Hand off task', exact: true }).click()
      const form = card.locator('form')
      await form.getByRole('combobox', { name: /^Next assignee\b/ }).selectOption(nextMember)
      await form.getByLabel('Handoff note', { exact: true }).fill(note)
      await form.getByRole('button', { name: 'Confirm handoff', exact: true }).click()
    }
    await handOff(taskCard, joinedSpace.localMemberId, 'Dale owns implementation; Morgan will verify the published bytes.')
    await colleagueTeam.getByRole('button', { name: 'Tasks', exact: true }).click()
    const colleagueTask = colleagueTeam.locator('article').filter({ hasText: SHARED_TASK_TITLE })
    await colleagueTask.getByRole('button', { name: 'Release', exact: true }).waitFor({ timeout: 10_000 })
    const assigned = (await colleague.ctx.teamBattle.view({ teamId })).tasks.find(task => task.title === SHARED_TASK_TITLE)
    if (assigned === undefined) throw new Error('remote handoff task missing')
    expect(assigned.ownerMemberId).toBe(joinedSpace.localMemberId)

    await handOff(colleagueTask, ownSpace.localMemberId, 'Morgan will confirm the acceptance criteria before implementation.')
    await taskCard.getByRole('button', { name: 'Release', exact: true }).waitFor({ timeout: 10_000 })
    const returnedTask = (await owner.ctx.teamBattle.view({ teamId })).tasks.find(task => task.id === assigned.id)
    expect(returnedTask?.ownerMemberId).toBe(ownSpace.localMemberId)
    await handOff(taskCard, joinedSpace.localMemberId, 'Criteria confirmed; Dale resumes implementation.')
    await colleagueTask.getByRole('button', { name: 'Release', exact: true }).waitFor({ timeout: 10_000 })
    const resumedTask = (await colleague.ctx.teamBattle.view({ teamId })).tasks.find(task => task.id === assigned.id)
    expect(resumedTask?.ownerMemberId).toBe(joinedSpace.localMemberId)

    await colleagueTeam.getByRole('button', { name: 'Files', exact: true }).click()
    await colleagueTeam.getByRole('button', { name: 'Publish to Team Space', exact: true }).first().click()
    const publish = colleaguePage.getByRole('dialog', { name: 'Publish to Team Space', exact: true })
    const content = Buffer.from('# Shared delivery\nOnly this explicitly selected file is published.\n')
    await publish.getByLabel('Choose file', { exact: true }).setInputFiles({ name: SHARED_FILE_NAME, mimeType: 'text/markdown', buffer: content })
    await publish.getByLabel('Version label', { exact: true }).fill('v1.1')
    await publish.getByRole('button', { name: 'Publish', exact: true }).click()
    await colleagueTeam.getByRole('button', { name: SHARED_FILE_NAME, exact: true }).click()
    await colleagueTeam.getByRole('button', { name: 'Submit to task', exact: true }).click()
    const submit = colleaguePage.getByRole('dialog', { name: 'Submit to task', exact: true })
    await submit.getByRole('combobox').selectOption({ label: SHARED_TASK_TITLE })
    await submit.getByRole('button', { name: 'Submit to task', exact: true }).click()
    await ownerTeam.getByRole('button', { name: 'Review', exact: true }).click()
    const artifact = ownerTeam.locator('article').filter({ hasText: SHARED_FILE_NAME })
    await artifact.getByText(SHARED_TASK_TITLE, { exact: true }).waitFor({ timeout: 10_000 })
    await artifact.getByText('v1.1', { exact: true }).waitFor()
    const published = (await server.ctx.teamBattle.space({ teamId })).files.find(file => file.name === SHARED_FILE_NAME)
    if (published === undefined) throw new Error('shared server did not retain the published file')
    expect(published.createdByMemberId).toBe(joinedSpace.localMemberId)
    expect((await server.ctx.teamBattle.space({ teamId })).files.map(file => file.name)).toEqual([SHARED_FILE_NAME])
    expect(JSON.stringify(await server.ctx.teamBattle.view({ teamId }))).not.toContain(QUERY_TEXT)
    expect(Buffer.from((await owner.ctx.teamBattle.readFile({ teamId, fileId: published.id })).contentBase64, 'base64')).toEqual(content)
    await artifact.getByPlaceholder('Review note').fill('The independent Host retrieved and verified the exact uploaded bytes.')
    await artifact.getByRole('button', { name: 'Accept', exact: true }).click()
    await artifact.getByText('Accepted', { exact: true }).waitFor()
    await expect.poll(async () => (await colleague.ctx.teamBattle.view({ teamId })).tasks.find(task => task.id === assigned.id)?.status).toBe('completed')
    expect((await colleague.ctx.teamBattle.view({ teamId })).progress.percent).toBe(100)

    await openTeamManager(ownerPage)
    await manager.getByRole('button', { name: 'Invite a colleague', exact: true }).click()
    await manager.getByRole('button', { name: 'Remove member', exact: true }).click()
    await ownerPage.getByRole('button', { name: 'Confirm removal', exact: true }).click()
    await expect.poll(async () => (await owner.ctx.teamBattle.summary({ teamId })).memberAccess.find(member => member.memberId === joinedSpace.localMemberId)?.status).toBe('revoked')
    await expect(colleague.ctx.teamBattle.view({ teamId })).rejects.toThrow()
    await expect(colleague.ctx.teamBattle.readFile({ teamId, fileId: published.id })).rejects.toThrow()
    const retainedFile = (await owner.ctx.teamBattle.space({ teamId })).files.find(file => file.id === published.id)
    expect(retainedFile?.createdByMemberId).toBe(joinedSpace.localMemberId)
    expect((await owner.ctx.teamBattle.view({ teamId })).tasks.find(task => task.id === assigned.id)?.status).toBe('completed')
    await manager.getByRole('button', { name: 'Close', exact: true }).click()
    await ownerTeam.getByRole('button', { name: 'Tasks', exact: true }).click()
    await taskCard.getByText('Completed', { exact: true }).waitFor()
    const snapshot = await captureStableAria(ownerPage, `[data-team-space-view] article:has-text("${SHARED_TASK_TITLE}")`, owner.workspaceCwd)
    await compareOrRefreshGolden(SHARED_WORKFLOW_EXPECTED, snapshot, MODE)
    expect(ownerConsole.pageErrors).toEqual([])
    expect(colleagueConsole.pageErrors).toEqual([])
  })
})

describe('Team Battle browser fixtures', () => {
  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['team-space.expected.md', 'file-actions.expected.md', 'shared-workflow.expected.md', 'create-authorization.expected.md'])
  })
})
