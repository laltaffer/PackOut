import { handleAuth } from '../lib/handlers.js'
export const onRequestPost = ctx => handleAuth(ctx)
