// GET / is the static app; POST / is Google Identity Services signing in via
// redirect mode. Only POST is claimed here, so the HTML asset still serves
// itself.
import { handleAuthRedirect } from './lib/handlers.js'
export const onRequestPost = ctx => handleAuthRedirect(ctx)
