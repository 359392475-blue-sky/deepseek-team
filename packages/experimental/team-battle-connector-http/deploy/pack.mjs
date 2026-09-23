#!/usr/bin/env node
/** Package the built dsh CLI and Team profile dependencies without installing or building on the server. */

import { cp, mkdir, readFile, readdir, realpath, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { load } from 'js-yaml'

const deploy = dirname(fileURLToPath(import.meta.url))
const repo = resolve(deploy, '../../../..')
const output = process.argv[2] === undefined ? undefined : resolve(process.argv[2])
const target = process.argv[3] ?? 'linux-x64-gnu'
if (output === undefined || !['linux-x64-gnu', 'darwin-arm64'].includes(target)) {
  throw new Error('Usage: node deploy/pack.mjs <new-output-directory> [linux-x64-gnu|darwin-arm64]')
}
if (existsSync(output)) throw new Error('Output directory must not already exist')

const workspace = new Map()
for (const root of ['packages', 'vendor', 'apps']) {
  for (const entry of await readdir(join(repo, root), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(repo, root, entry.name)
    const candidates = root === 'packages'
      ? (await readdir(path, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => join(path, item.name))
      : [path]
    for (const directory of candidates) {
      const manifest = join(directory, 'package.json')
      if (!existsSync(manifest)) continue
      const parsed = JSON.parse(await readFile(manifest, 'utf8'))
      if (typeof parsed.name === 'string') workspace.set(parsed.name, directory)
    }
  }
}

async function packageDirectory(name, from) {
  if (workspace.has(name)) return workspace.get(name)
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return await realpath(candidate)
    if (dirname(directory) === directory) break
  }
  throw new Error(`Missing build dependency ${name}`)
}

const cache = await mkdtemp(join(tmpdir(), 'dsh-team-pack-'))
const lockfile = load(await readFile(join(repo, 'pnpm-lock.yaml'), 'utf8'))
const packages = new Map()
const profileManifest = JSON.parse(await readFile(join(deploy, 'profile/package.json'), 'utf8'))
const queue = [...Object.keys(profileManifest.dependencies), '@deepseek-ai/dsh']
const cliRuntimeDependencies = [
  '@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh-home-paths', '@deepseek-ai/dsh-cmdline',
  '@deepseek-ai/dsh-http-proxy', '@deepseek-ai/dsh-launch-environment', '@deepseek-ai/dsh-plugin-manager', 'commander',
  ...Object.keys(profileManifest.dependencies),
]

async function nativePackage(name, version) {
  try {
    return await packageDirectory(name, repo)
  } catch {
    // A cross-platform build host does not normally install the target's optional prebuild.
  }
  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`)
  if (!response.ok) throw new Error(`Cannot resolve target prebuild ${name}`)
  const metadata = await response.json()
  if (metadata.name !== name || metadata.version !== version || typeof metadata.dist?.integrity !== 'string') {
    throw new Error('Target prebuild metadata is invalid')
  }
  const lockedIntegrity = lockfile.packages?.[`${name}@${version}`]?.resolution?.integrity
  if (metadata.dist.integrity !== lockedIntegrity) throw new Error('Target prebuild does not match the workspace lockfile')
  const url = new URL(metadata.dist.tarball)
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org') throw new Error('Unexpected prebuild download host')
  const archive = await fetch(url, { redirect: 'error' })
  if (!archive.ok) throw new Error('Target prebuild download failed')
  const bytes = Buffer.from(await archive.arrayBuffer())
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (integrity !== metadata.dist.integrity) throw new Error('Target prebuild integrity mismatch')
  const folder = join(cache, name)
  await mkdir(folder)
  const tarball = join(folder, 'package.tgz')
  await writeFile(tarball, bytes)
  execFileSync('tar', ['-xzf', tarball, '-C', folder])
  return join(folder, 'package')
}

try {
  for (const name of queue) {
    if (packages.has(name)) continue
    const directory = await packageDirectory(name, repo)
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    const dependencies = name === '@deepseek-ai/dsh'
      ? Object.fromEntries(cliRuntimeDependencies.map(key => [key, manifest.dependencies[key] ?? profileManifest.dependencies[key]]))
      : { ...manifest.dependencies, ...Object.fromEntries(Object.entries(manifest.peerDependencies ?? {}).filter(([key]) => !manifest.peerDependenciesMeta?.[key]?.optional)) }
    packages.set(name, { directory, manifest, dependencies })
    for (const dependency of Object.keys(dependencies)) {
      const dependencyDirectory = await packageDirectory(dependency, directory)
      if (!workspace.has(dependency)) workspace.set(dependency, dependencyDirectory)
      queue.push(dependency)
    }
    if (name === 'node-addon-require-builtin') {
      const prebuild = `${name}-${target}`
      const version = manifest.optionalDependencies[prebuild]
      const nativeDirectory = await nativePackage(prebuild, version)
      const nativeManifest = JSON.parse(await readFile(join(nativeDirectory, 'package.json'), 'utf8'))
      packages.set(prebuild, { directory: nativeDirectory, manifest: nativeManifest, dependencies: {} })
    }
  }
  await mkdir(join(output, 'node_modules'), { recursive: true })
  const shipped = []
  for (const [name, entry] of packages) {
    const destination = join(output, 'node_modules', name)
    await mkdir(destination, { recursive: true })
    const repositoryPackage = relative(repo, entry.directory).split('/')[0] !== '..' && !entry.directory.includes('/node_modules/')
    for (const item of await readdir(entry.directory, { withFileTypes: true })) {
      if (['node_modules', '.git', 'test', 'tests', '__tests__'].includes(item.name)) continue
      if (repositoryPackage && !['lib', 'package.json', 'LICENSE'].includes(item.name)) continue
      await cp(join(entry.directory, item.name), join(destination, item.name), {
        recursive: true, dereference: true,
        filter: source => !/\.(?:map|tsbuildinfo)$/.test(source) && !source.endsWith('.d.ts'),
      })
    }
    if (repositoryPackage && !existsSync(join(destination, 'lib'))) throw new Error(`Build ${name} before packaging`)
    const manifest = { ...entry.manifest, dependencies: entry.dependencies }
    delete manifest.devDependencies
    delete manifest.peerDependencies
    delete manifest.peerDependenciesMeta
    if (name === 'node-addon-require-builtin') manifest.optionalDependencies = { [`${name}-${target}`]: entry.manifest.optionalDependencies[`${name}-${target}`] }
    await writeFile(join(destination, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    shipped.push({ name, version: manifest.version })
  }
  await cp(join(deploy, 'profile'), join(output, 'profile'), { recursive: true })
  await cp(join(deploy, 'smoke.mjs'), join(output, 'smoke.mjs'))
  await writeFile(join(output, 'package.json'), JSON.stringify({ name: 'dsh-team-server-runtime', private: true, type: 'module' }) + '\n')
  const cli = join(output, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(cli)) throw new Error('Built dsh CLI entry is missing')
  const files = []
  async function inventory(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isDirectory()) await inventory(path)
      else {
        const content = await readFile(path)
        files.push({ path: relative(output, path), bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') })
      }
    }
  }
  await inventory(output)
  await writeFile(join(output, 'MANIFEST.json'), JSON.stringify({ target, packages: shipped, files }, null, 2) + '\n')
  console.log(JSON.stringify({ output, target, packages: shipped.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), cli: relative(output, cli) }))
} finally {
  await rm(cache, { recursive: true, force: true })
}
