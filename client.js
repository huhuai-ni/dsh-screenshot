/**
 * dsh-screenshot —— 浏览器半端：设置里的一页「截屏」
 */
window.__ModuleLoader__.load({
  id: 'dsh-screenshot',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const API = '/api/shot'

    const getJson = async (url) => {
      const r = await fetch(url, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }
    const postJson = async (url, body) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }

    const CSS = `
[data-ss-wrap]{display:flex;flex-direction:column;gap:12px;padding:6px 2px 24px;font-size:13px}
[data-ss-row]{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
[data-ss-label]{width:96px;opacity:.85}
[data-ss-input]{flex:1;min-width:200px;padding:6px 9px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-size:13px}
[data-ss-btn]{padding:6px 14px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;font-size:13px}
[data-ss-btn]:hover{background:rgba(127,127,127,.12)}
[data-ss-msg]{font-size:12px;opacity:.78;min-height:16px}
[data-ss-note]{font-size:12px;opacity:.6;line-height:1.6}
[data-ss-grid]{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
[data-ss-card]{border:1px solid rgba(127,127,127,.25);border-radius:10px;overflow:hidden}
[data-ss-card] img{width:100%;display:block}
[data-ss-cap]{font-size:11px;opacity:.6;padding:4px 6px;word-break:break-all}
[data-ss-tag]{font-size:11px;padding:1px 7px;border-radius:5px;background:rgba(80,200,120,.28)}
`

    function Panel() {
      const [cfg, setCfg] = React.useState({ hotkey: 'Ctrl+Alt+S', mode: 'full', outDir: '', running: false })
      const [shots, setShots] = React.useState([])
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const load = async () => {
        try {
          const c = await getJson(API + '/config')
          setCfg(c)
          const l = await getJson(API + '/list')
          setShots(l.shots || [])
        } catch (e) { setMsg('读取失败：' + e.message) }
      }
      React.useEffect(() => { load() }, [])

      const save = async () => {
        setBusy(true); setMsg('')
        try {
          const r = await postJson(API + '/config', { hotkey: cfg.hotkey, mode: cfg.mode, outDir: cfg.outDir })
          setMsg(r.ok ? `已保存，快捷键 ${r.hotkey}（${r.mode === 'region' ? '区域' : r.mode === 'full' ? '整屏' : '当前窗口'}）` : '保存失败：' + (r.restart?.error || ''))
          await load()
        } catch (e) { setMsg('保存失败：' + e.message) }
        setBusy(false)
      }

      const shoot = async () => {
        setBusy(true); setMsg('正在截…')
        try {
          const r = await postJson(API + '/capture', { mode: cfg.mode })
          setMsg(r.ok ? '已截图：' + r.path : '失败：' + (r.error || ''))
          await load()
        } catch (e) { setMsg('出错：' + e.message) }
        setBusy(false)
      }

      return h('div', { 'data-ss-wrap': '' },
        h('div', { 'data-ss-note': '' },
          '设一个全局快捷键，按一下就截图，存在下面的文件夹里。快捷键只在 DSH 运行时有效。'),

        h('div', { 'data-ss-row': '' },
          h('span', { 'data-ss-label': '' }, '快捷键'),
          h('input', {
            'data-ss-input': '', value: cfg.hotkey || '',
            placeholder: 'Ctrl+Alt+S / F9 / PrintScreen',
            onChange: (e) => setCfg({ ...cfg, hotkey: e.target.value }),
          }),
          h('span', { 'data-ss-tag': cfg.running ? '' : undefined, style: cfg.running ? {} : { opacity: .4 } },
            cfg.running ? '热键已注册' : '热键未运行'),
        ),

        h('div', { 'data-ss-row': '' },
          h('span', { 'data-ss-label': '' }, '截图范围'),
          h('select', {
            'data-ss-input': '', value: cfg.mode || 'full',
            style: { maxWidth: 220 },
            onChange: (e) => setCfg({ ...cfg, mode: e.target.value }),
          },
            h('option', { value: 'region' }, '拖框选择区域'),
            h('option', { value: 'full' }, '整个屏幕'),
            h('option', { value: 'window' }, '当前窗口'),
          ),
        ),

        h('div', { 'data-ss-row': '' },
          h('span', { 'data-ss-label': '' }, '保存目录'),
          h('input', {
            'data-ss-input': '', value: cfg.outDir || '',
            onChange: (e) => setCfg({ ...cfg, outDir: e.target.value }),
          }),
        ),

        h('div', { 'data-ss-row': '' },
          h('button', { 'data-ss-btn': '', onClick: save, disabled: busy }, '保存并注册'),
          h('button', { 'data-ss-btn': '', onClick: shoot, disabled: busy }, '立即截图'),
          h('button', { 'data-ss-btn': '', onClick: load, disabled: busy }, '刷新'),
        ),

        h('div', { 'data-ss-msg': '' }, msg),

        shots.length
          ? h('div', { 'data-ss-grid': '' }, shots.slice(0, 12).map((s, i) => h('div', { 'data-ss-card': '', key: i },
            h('img', { src: API + '/file?name=' + encodeURIComponent(s.name), alt: s.name }),
            h('div', { 'data-ss-cap': '' }, s.name + ' · ' + Math.round(s.size / 1024) + ' KB'),
          )))
          : h('div', { 'data-ss-note': '' }, '还没有截图。按快捷键或者点「立即截图」。'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-screenshot')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-screenshot: 设置页样式')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'screenshot', order: 47, label: '截屏' },
          () => h(Panel),
        ))
      },
    }
  },
})
