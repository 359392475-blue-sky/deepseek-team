#!/usr/bin/env node
/** Exercise the packaged, unchanged dsh CLI in two real processes around one durable Team project. */

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'

const runtime = resolve(process.argv[2] ?? '')
const home = await mkdtemp(join(tmpdir(), 'dsh-team-artifact-smoke-'))
const profile = join(home, 'profiles/team-server')
const ownerToken = randomBytes(32).toString('base64url')
const deploymentToken = randomBytes(32).toString('base64url')
const colleagueToken = randomBytes(32).toString('base64url')
let child

async function start() {
  child = spawn(process.execPath, [join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'team-server'], {
    cwd: runtime,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DSH_HOME: home, TEAM_BATTLE_SERVER_ACCESS_TOKEN: deploymentToken, DSH_TELEMETRY: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  return await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => { reject(new Error(`Packaged CLI did not become ready: ${output.slice(-3000)}`)) }, 20_000)
    const inspect = (chunk) => {
      output += chunk.toString()
      const found = /Team collaboration listener:.*?(http:\/\/127\.0\.0\.1:\d+)/.exec(output)
      if (found !== null) {
        clearTimeout(timeout)
        resolveReady(found[1])
      }
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', (error) => { clearTimeout(timeout); reject(error) })
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Packaged CLI exited ${String(code)}: ${output.slice(-3000)}`)) })
  })
}

async function stop() {
  if (child === undefined || child.exitCode !== null) return
  const ended = once(child, 'exit')
  child.kill('SIGTERM')
  const [code] = await ended
  assert.equal(code, 0)
  child = undefined
}

async function post(origin, path, body, token) {
  return await fetch(`${origin}/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  })
}

try {
  await cp(join(runtime, 'profile'), profile, { recursive: true })
  const path = join(profile, 'cordis.patch.yml')
  await writeFile(path, (await readFile(path, 'utf8')).replace('port: 18864', 'port: 0'))
  const origin = await start()
  const landing = await fetch(`${origin}/`)
  assert.equal(landing.status, 200)
  assert.match(landing.headers.get('content-type'), /^text\/html/)
  assert.match(await landing.text(), /通过邀请链接加入/)
  assert.equal((await fetch(`${origin}/api/sessions/list`)).status, 404)
  assert.equal((await post(origin, 'create', {}, 'invalid')).status, 401)
  const response = await post(origin, 'create', {
    name: 'Artifact smoke project', goal: 'Persist shared state', memberName: 'Owner', memberRole: 'Product', ownerMemberToken: ownerToken,
  }, deploymentToken)
  assert.equal(response.status, 200)
  const created = await response.json()
  assert.equal(created.name, 'Artifact smoke project')
  const inviteResponse = await post(origin, 'call', {
    teamId: created.id, method: 'createInvite', input: { memberName: 'Engineer', memberRole: 'Engineering', origin },
  }, ownerToken)
  assert.equal(inviteResponse.status, 200)
  const invitation = await inviteResponse.json()
  const fragment = new URLSearchParams(new URL(invitation.inviteCode).hash.slice(1))
  const joinBody = { teamId: fragment.get('team'), inviteToken: fragment.get('token'), memberToken: colleagueToken }
  const joinedResponse = await post(origin, 'join', joinBody, colleagueToken)
  assert.equal(joinedResponse.status, 200)
  const colleague = await joinedResponse.json()
  assert.notEqual(colleague.localMemberId, created.localMemberId)
  assert.equal(colleague.localMemberId, invitation.memberId)
  assert.equal((await post(origin, 'join', { ...joinBody, memberToken: randomBytes(32).toString('base64url') }, colleagueToken)).status, 403)
  const shared = await post(origin, 'call', {
    teamId: created.id, method: 'publishContext', input: { summary: 'Product handoff for colleague', nextSteps: ['Build the agreed game'] },
  }, ownerToken)
  assert.equal(shared.status, 200)
  await stop()
  const restarted = await start()
  const summary = await post(restarted, 'call', { teamId: created.id, method: 'summary', input: {} }, ownerToken)
  assert.equal(summary.status, 200)
  assert.equal((await summary.json()).id, created.id)
  const colleagueSummary = await post(restarted, 'call', { teamId: created.id, method: 'summary', input: {} }, colleagueToken)
  assert.equal(colleagueSummary.status, 200)
  assert.equal((await colleagueSummary.json()).localMemberId, colleague.localMemberId)
  const colleagueView = await post(restarted, 'call', { teamId: created.id, method: 'view', input: {} }, colleagueToken)
  assert.equal(colleagueView.status, 200)
  assert.match(JSON.stringify(await colleagueView.json()), /Product handoff for colleague/)
  assert.equal((await post(restarted, 'call', { teamId: created.id, method: 'createInvite', input: { memberName: 'Other', memberRole: 'Test', origin: restarted } }, colleagueToken)).status, 403)
  assert.equal((await fetch(`${restarted}/`)).status, 200)
  assert.equal((await post(restarted, 'call', { teamId: created.id, method: 'sessions.list', input: {} }, ownerToken)).status, 403)
  await stop()
  console.log(JSON.stringify({ runtime, cli: 'dsh --profile team-server', invitationLanding: true, independentMemberJoin: true, sharedContextReadback: true, restartPersistence: true, privateApiUnavailable: true }))
} finally {
  await stop()
  await rm(home, { recursive: true, force: true })
}
