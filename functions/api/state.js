import { handleStateGet, handleStatePut } from '../lib/handlers.js'
export const onRequestGet = ctx => handleStateGet(ctx)
export const onRequestPut = ctx => handleStatePut(ctx)
