/** Package-owned invariant companion for the static Team Battle Web profile. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-team-battle-web-profile'

/** Cordis companion plugin name. */
export const name = 'team-battle-web-profile-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: the bundle carries only static Web composition;
// runtime relationships belong to the inserted connector and Client packages.
const install: InvariantInstaller = () => {}

/**
 * Register the package's empty static-bundle companion.
 * @param ctx - Cordis Context carrying the invariant registry.
 * @returns the registration disposer after setup.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
