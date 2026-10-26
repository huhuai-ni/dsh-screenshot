/**
 * dsh-screenshot —— 全局快捷键截屏
 * ============================================================================
 * 后端：起一个常驻的 PowerShell 进程注册全局热键，按下就截图
 * 前端：设置 → 插件 → 截屏（改快捷键、改模式、立即截图、看最近截图）
 *
 * 配置：~/.dsh/screenshot/config.json  { hotkey, mode, outDir }
 * ============================================================================
 */
import { spawn, execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const name = 'screenshot'
export const inject = ['tools', 'webServer']

const HERE = dirname(fileURLToPath(import.meta.url))
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DIR = join(DSH_HOME, 'screenshot')
const CONF = join(DIR, 'config.json')
const LOG = join(DIR, 'hotkey.log')
const SCRIPT_HOTKEY = join(HERE, 'scripts', 'hotkey.ps1')
const SCRIPT_CAPTURE = join(HERE, 'scripts', 'capture.ps1')

const DEFAULTS = {
  hotkey: 'Ctrl+Alt+S',
  mode: 'region',
  outDir: join(homedir(), 'Pictures', 'dsh-shot'),
}

function readConf() {
  try { return { ...DEFAULTS, ...JSON.parse(readFileSync(CONF, 'utf8')) } } catch { return { ...DEFAULTS } }
}
function writeConf(o) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(CONF, JSON.stringify(o, null, 2), 'utf8')
}

let child = null
let currentKey = ''

function stopHotkey() {
  if (child) {
    try { child.kill() } catch { /* ignore */ }
    child = null
  }
}

function startHotkey(cfg) {
  stopHotkey()
  if (!existsSync(SCRIPT_HOTKEY)) return { ok: false, error: '热键脚本不存在：' + SCRIPT_HOTKEY }
  try {
    mkdirSync(DIR, { recursive: true })
    child = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', SCRIPT_HOTKEY,
      '-Hotkey', cfg.hotkey,
      '-Mode', cfg.mode,
      '-OutDir', cfg.outDir,
      '-LogFile', LOG,
    ], { windowsHide: true, stdio: 'ignore' })
    child.on('exit', () => { child = null })
    currentKey = cfg.hotkey + '|' + cfg.mode
    return { ok: true, hotkey: cfg.hotkey, mode: cfg.mode }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

function capture(mode, outDir) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_CAPTURE, '-Mode', mode, '-OutDir', outDir],
      { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: String(stderr || err.message).slice(0, 400) })
        const p = String(stdout).trim().split('\n').pop().trim()
        resolve(p ? { ok: true, path: p } : { ok: false, error: '没拿到路径' })
      })
  })
}

function listShots(outDir, limit = 20) {
  try {
    return readdirSync(outDir)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .map((f) => {
        const p = join(outDir, f)
        return { name: f, path: p, size: statSync(p).size, mtime: statSync(p).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
  } catch { return [] }
}

const textOutput = {
  schema: { type: 'object', properties: {}, additionalProperties: true },
  render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
}
const defineTool = (o) => o
const sendJson = (res, code, obj) => {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}
const readBody = (req) => new Promise((r) => {
  let b = ''
  req.on('data', (d) => { b += d })
  req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } })
})

export function apply(ctx) {
  const tool = (spec) => ctx.tools.register(defineTool({
    ...spec,
    output: textOutput,
    async execute(args) {
      try { return await spec.execute(args || {}) } catch (e) { return { ok: false, error: String(e?.message || e) } }
    },
  }))

  const first = startHotkey(readConf())

  tool({
    name: 'shot_capture',
    description: '立刻截屏。mode 可选 full（整屏）或 window（当前窗口），不填按设置。',
    parameters: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['region', 'full', 'window'] } },
      additionalProperties: false,
    },
    async execute({ mode }) {
      const cfg = readConf()
      const m = mode || cfg.mode || 'full'
      const r = await capture(m, cfg.outDir)
      return r.ok ? { ...r, mode: m } : r
    },
  })

  tool({
    name: 'shot_latest',
    description: '看最近一张截图（路径、大小、时间）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const cfg = readConf()
      const list = listShots(cfg.outDir, 1)
      return list.length ? { ok: true, shot: list[0], dir: cfg.outDir } : { ok: false, error: '还没有截图' }
    },
  })

  tool({
    name: 'shot_list',
    description: '列出最近的截图。',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: '默认 20' } },
      additionalProperties: false,
    },
    async execute({ limit = 20 }) {
      const cfg = readConf()
      const list = listShots(cfg.outDir, Math.min(Math.max(Number(limit) || 20, 1), 100))
      return { ok: true, count: list.length, dir: cfg.outDir, shots: list }
    },
  })

  tool({
    name: 'shot_hotkey',
    description: '查看或修改全局截图快捷键。传 hotkey（如 "Ctrl+Alt+S"）就改，不传就返回当前设置。',
    parameters: {
      type: 'object',
      properties: {
        hotkey: { type: 'string', description: '如 Ctrl+Alt+S、F9、PrintScreen' },
        mode: { type: 'string', enum: ['region', 'full', 'window'] },
      },
      additionalProperties: false,
    },
    async execute({ hotkey, mode }) {
      const cfg = readConf()
      if (!hotkey && !mode) return { ok: true, ...cfg, running: !!child }
      if (hotkey) cfg.hotkey = String(hotkey).trim()
      if (mode) cfg.mode = mode
      writeConf(cfg)
      const r = startHotkey(cfg)
      return { ok: r.ok, ...cfg, restart: r }
    },
  })

  /* ───── 设置页接口 ───── */

  const handle = async (req, res, url) => {
    const p = (url.pathname.replace(/^\/api\/shot/, '') || '/')
    const method = req.method || 'GET'

    if (p === '/config' && method === 'GET') {
      const c = readConf()
      return sendJson(res, 200, { ok: true, ...c, running: !!child })
    }
    if (p === '/config' && method === 'POST') {
      const b = await readBody(req)
      const c = readConf()
      if (typeof b.hotkey === 'string' && b.hotkey.trim()) c.hotkey = b.hotkey.trim()
      if (b.mode === 'region' || b.mode === 'full' || b.mode === 'window') c.mode = b.mode
      if (typeof b.outDir === 'string' && b.outDir.trim()) c.outDir = b.outDir.trim()
      writeConf(c)
      const r = startHotkey(c)
      return sendJson(res, 200, { ok: r.ok, ...c, restart: r })
    }
    if (p === '/capture' && method === 'POST') {
      const b = await readBody(req)
      const c = readConf()
      const r = await capture(b.mode || c.mode, c.outDir)
      return sendJson(res, 200, r)
    }
    if (p === '/list' && method === 'GET') {
      const c = readConf()
      return sendJson(res, 200, { ok: true, dir: c.outDir, shots: listShots(c.outDir, 30) })
    }
    if (p === '/file' && method === 'GET') {
      // 返回图片二进制，给设置页预览
      const name = (url.searchParams.get('name') || '').replace(/[\\/]/g, '')
      const c = readConf()
      const p2 = join(c.outDir, name)
      try {
        const buf = readFileSync(p2)
        res.statusCode = 200
        res.setHeader('content-type', 'image/png')
        res.setHeader('cache-control', 'no-store')
        res.end(buf)
      } catch {
        sendJson(res, 404, { ok: false, error: 'not found' })
      }
      return
    }
    if (p === '/log' && method === 'GET') {
      try { return sendJson(res, 200, { ok: true, log: readFileSync(LOG, 'utf8').split('\n').slice(-30).join('\n') }) }
      catch { return sendJson(res, 200, { ok: true, log: '' }) }
    }
    return sendJson(res, 404, { ok: false, error: `unknown ${method} ${p}` })
  }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/api/shot',
      handler: async (req, res) => {
        try { await handle(req, res, new URL(req.url, 'http://127.0.0.1')) }
        catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
      },
    }), 'screenshot: /api/shot 路由')
  } catch { /* ignore */ }

  ctx.effect(() => () => stopHotkey(), 'screenshot: 收热键进程')

  if (!first.ok) console.warn('[screenshot] 热键没起来：', first.error)
}
