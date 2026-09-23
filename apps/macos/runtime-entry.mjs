import { initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'

const TEAM_BATTLE_PROFILE = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-experimental-team-battle-profile',
  '@deepseek-ai/dsh-experimental-team-battle-web-profile',
]

const profileIndex = process.argv.indexOf('--profile')
if (process.argv[profileIndex + 1] === 'team-battle') {
  initProfile(resolveProfileDir('team-battle'), TEAM_BATTLE_PROFILE)
}

const { runCli } = await import('../node_modules/@deepseek-ai/dsh/lib/bin.js')
await runCli()
