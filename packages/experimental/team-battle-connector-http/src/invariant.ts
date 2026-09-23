/** Package-owned invariant companion for Team Battle HTTP ingress. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-team-battle-connector-http'

/** Cordis companion plugin name. */
export const name = 'team-battle-connector-http-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/**
 * No runtime invariant: authentication and strict event parsing occur inside
 * each HTTP operation; WebServer owns route registration and disposal.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's explained empty invariant.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the invariant registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
