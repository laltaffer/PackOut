import { onRequestPost as __api_auth_js_onRequestPost } from "/Users/laltaffer-mbprotouchid/SecondBrain/Projects/32_PackOut/functions/api/auth.js"
import { onRequestPost as __api_logout_js_onRequestPost } from "/Users/laltaffer-mbprotouchid/SecondBrain/Projects/32_PackOut/functions/api/logout.js"
import { onRequestGet as __api_me_js_onRequestGet } from "/Users/laltaffer-mbprotouchid/SecondBrain/Projects/32_PackOut/functions/api/me.js"
import { onRequestGet as __api_state_js_onRequestGet } from "/Users/laltaffer-mbprotouchid/SecondBrain/Projects/32_PackOut/functions/api/state.js"
import { onRequestPut as __api_state_js_onRequestPut } from "/Users/laltaffer-mbprotouchid/SecondBrain/Projects/32_PackOut/functions/api/state.js"

export const routes = [
    {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_js_onRequestPost],
    },
  {
      routePath: "/api/logout",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_logout_js_onRequestPost],
    },
  {
      routePath: "/api/me",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_me_js_onRequestGet],
    },
  {
      routePath: "/api/state",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_state_js_onRequestGet],
    },
  {
      routePath: "/api/state",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_state_js_onRequestPut],
    },
  ]