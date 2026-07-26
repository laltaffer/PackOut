import { handleScrape } from '../lib/handlers.js'
export const onRequestPost = ctx => handleScrape(ctx)
