var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// lib/session.js
var SESSION_DAYS = 30;
var COOKIE_NAME = "po_session";
var enc = new TextEncoder();
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(b64url, "b64url");
function unb64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - s.length % 4);
  const raw = atob(s.replaceAll("-", "+").replaceAll("_", "/") + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
__name(unb64url, "unb64url");
async function hmac(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}
__name(hmac, "hmac");
async function createSession({ sub, name }, secret, now = Date.now()) {
  const payload = b64url(enc.encode(JSON.stringify({
    sub,
    name,
    exp: now + SESSION_DAYS * 24 * 3600 * 1e3
  })));
  return `${payload}.${b64url(await hmac(payload, secret))}`;
}
__name(createSession, "createSession");
async function verifySession(token, secret, now = Date.now()) {
  try {
    const [payload, sig] = String(token ?? "").split(".");
    if (!payload || !sig) return null;
    const expected = b64url(await hmac(payload, secret));
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const s = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    if (typeof s.sub !== "string" || typeof s.exp !== "number" || s.exp <= now) return null;
    return { sub: s.sub, name: typeof s.name === "string" ? s.name : "" };
  } catch {
    return null;
  }
}
__name(verifySession, "verifySession");
function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 3600}`;
}
__name(sessionCookie, "sessionCookie");
function clearedCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
__name(clearedCookie, "clearedCookie");
function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}
__name(readCookie, "readCookie");

// ../js/engine.js
var INTENSITIES = ["easy", "medium", "hard"];
var MEAL_KEYS = ["electrolytes", "breakfast", "lunch", "dinner", "snacks"];
function num(v) {
  return typeof v === "number" && Number.isFinite(v);
}
__name(num, "num");
function numOrNull(v) {
  return v === null || num(v);
}
__name(numOrNull, "numOrNull");
var SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
function validId(v) {
  return typeof v === "string" && SAFE_ID.test(v);
}
__name(validId, "validId");
function validEntries(entries) {
  return Array.isArray(entries) && entries.every((e) => e && validId(e.foodId) && num(e.qty) && e.qty >= 1);
}
__name(validEntries, "validEntries");
function validDay(day) {
  if (!day || !INTENSITIES.includes(day.intensity)) return false;
  if (day.meals !== void 0) {
    const m = day.meals;
    if (!m || typeof m !== "object") return false;
    if (!MEAL_KEYS.every((k) => k in m)) return false;
    if (!["electrolytes", "breakfast", "lunch", "dinner"].every((k) => validEntries(m[k]))) return false;
    if (!Array.isArray(m.snacks) || !m.snacks.every((s) => s && validEntries(s.items))) return false;
  }
  if (day.packed !== void 0) {
    if (!day.packed || typeof day.packed !== "object") return false;
    if (!Object.entries(day.packed).every(([k, v]) => validId(k) && num(v))) return false;
  }
  return true;
}
__name(validDay, "validDay");
function validateImport(data) {
  if (!data || typeof data !== "object") return { ok: false, error: "Not a PackOut backup file." };
  if (data.schemaVersion !== 1) return { ok: false, error: `Unsupported schema version: ${data.schemaVersion}.` };
  if (!Array.isArray(data.trips) || !Array.isArray(data.library)) {
    return { ok: false, error: "Backup is missing trips or library." };
  }
  const tripIds = /* @__PURE__ */ new Set();
  for (const t of data.trips) {
    if (!t || !validId(t.id) || tripIds.has(t.id)) return { ok: false, error: "Trip ids must be unique, plain identifiers." };
    tripIds.add(t.id);
    if (!t.name || !Array.isArray(t.days) || t.days.length === 0 || !num(t.weightLbs) || t.weightLbs <= 0 || !t.startDate) {
      return { ok: false, error: `Trip "${t.name ?? "?"}" is malformed.` };
    }
    if (t.mealStyle !== void 0) {
      const ok = t.mealStyle && typeof t.mealStyle === "object" && Object.entries(t.mealStyle).every(([k, v]) => ["breakfast", "lunch", "dinner"].includes(k) && (v === "mobile" || v === "sitdown"));
      if (!ok) return { ok: false, error: `Trip "${t.name}" has an invalid meal style.` };
    }
    for (const [i, day] of t.days.entries()) {
      if (!validDay(day)) return { ok: false, error: `Trip "${t.name}", day ${i + 1} is malformed.` };
    }
  }
  const foodIds = /* @__PURE__ */ new Set();
  for (const f of data.library) {
    if (!f || !validId(f.id) || foodIds.has(f.id)) return { ok: false, error: "Food ids must be unique, plain identifiers." };
    foodIds.add(f.id);
    if (!f.name?.trim?.() || !num(f.kcal) || f.kcal <= 0) return { ok: false, error: `Food "${f.name ?? "?"}" is malformed.` };
    if (![f.carbsG, f.fatG, f.proteinG, f.weightOz].every(numOrNull)) {
      return { ok: false, error: `Food "${f.name}" has non-numeric macros.` };
    }
    if (f.prep !== void 0 && f.prep !== "ready" && f.prep !== "cook") {
      return { ok: false, error: `Food "${f.name}" has an invalid prep value.` };
    }
  }
  return { ok: true };
}
__name(validateImport, "validateImport");

// lib/handlers.js
var TOKENINFO = "https://oauth2.googleapis.com/tokeninfo?id_token=";
var MAX_STATE_BYTES = 4 * 1024 * 1024;
var json = /* @__PURE__ */ __name((body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }), "json");
async function session(request, env, now) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  return verifySession(token, env.SESSION_SECRET, now);
}
__name(session, "session");
async function handleAuth({ request, env, fetcher = fetch, now = Date.now() }) {
  let credential;
  try {
    ({ credential } = await request.json());
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  if (typeof credential !== "string" || !credential) return json({ error: "Bad request." }, 400);
  const res = await fetcher(TOKENINFO + encodeURIComponent(credential));
  if (!res.ok) return json({ error: "Sign-in rejected." }, 401);
  const info = await res.json();
  if (info.aud !== env.GOOGLE_CLIENT_ID) return json({ error: "Sign-in rejected." }, 401);
  if (info.email_verified !== "true") return json({ error: "Sign-in rejected." }, 401);
  if (!info.sub || Number(info.exp) * 1e3 <= now) return json({ error: "Sign-in rejected." }, 401);
  const profile = { sub: info.sub, name: info.name ?? info.email ?? "" };
  const token = await createSession(profile, env.SESSION_SECRET, now);
  return json({ sub: profile.sub, name: profile.name }, 200, { "set-cookie": sessionCookie(token) });
}
__name(handleAuth, "handleAuth");
async function handleMe({ request, env, now = Date.now() }) {
  const s = await session(request, env, now);
  return s ? json(s) : json({ error: "Signed out." }, 401);
}
__name(handleMe, "handleMe");
async function handleLogout() {
  return json({ ok: true }, 200, { "set-cookie": clearedCookie() });
}
__name(handleLogout, "handleLogout");
async function handleStateGet({ request, env, now = Date.now() }) {
  const s = await session(request, env, now);
  if (!s) return json({ error: "Signed out." }, 401);
  const stored = await env.PACKOUT_KV.get(`state:${s.sub}`, "json");
  return json(stored ?? { state: null, updatedAt: 0 });
}
__name(handleStateGet, "handleStateGet");
async function handleStatePut({ request, env, now = Date.now() }) {
  const s = await session(request, env, now);
  if (!s) return json({ error: "Signed out." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const { state, updatedAt } = body ?? {};
  if (!state || typeof updatedAt !== "number") return json({ error: "Bad request." }, 400);
  const v = validateImport(state);
  if (!v.ok) return json({ error: v.error }, 422);
  const serialized = JSON.stringify({ state, updatedAt });
  if (serialized.length > MAX_STATE_BYTES) return json({ error: "State too large." }, 413);
  const existing = await env.PACKOUT_KV.get(`state:${s.sub}`, "json");
  if (existing && existing.updatedAt > updatedAt) {
    return json({ error: "Server copy is newer.", updatedAt: existing.updatedAt }, 409);
  }
  await env.PACKOUT_KV.put(`state:${s.sub}`, serialized);
  return json({ ok: true, updatedAt });
}
__name(handleStatePut, "handleStatePut");

// api/auth.js
var onRequestPost = /* @__PURE__ */ __name((ctx) => handleAuth(ctx), "onRequestPost");

// api/logout.js
var onRequestPost2 = /* @__PURE__ */ __name(() => handleLogout(), "onRequestPost");

// api/me.js
var onRequestGet = /* @__PURE__ */ __name((ctx) => handleMe(ctx), "onRequestGet");

// api/state.js
var onRequestGet2 = /* @__PURE__ */ __name((ctx) => handleStateGet(ctx), "onRequestGet");
var onRequestPut = /* @__PURE__ */ __name((ctx) => handleStatePut(ctx), "onRequestPut");

// ../.wrangler/tmp/pages-VQCw3V/functionsRoutes-0.10872646641873751.mjs
var routes = [
  {
    routePath: "/api/auth",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/logout",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/me",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/state",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/state",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  }
];

// ../../../../.npm/_npx/095711ed2bffd7f3/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../.npm/_npx/095711ed2bffd7f3/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
