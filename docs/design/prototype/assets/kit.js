/*
 * Prototype runtime. Load at the end of <body>, after icons.js.
 *
 * Theme     <html> gets class "dark" for dark. Mode is light | dark | system.
 *           Default is dark. ?theme=light|dark|system in the URL wins (used for screenshots).
 *           Any element with data-theme-set="light|dark|system" sets the mode on click and
 *           receives aria-pressed / aria-checked / data-active when it is the current mode.
 * Screens   Elements with data-screen="name" are shown one at a time from location.hash
 *           (#chat, #repositories-new ...). Unknown or empty hash shows the first screen.
 *           Any element with data-nav="name" gets data-active + aria-current when that
 *           screen (or a screen listed in data-nav-also="a b") is showing.
 *           A scroll container with data-scroll-end starts scrolled to its end (chat messages);
 *           data-scroll-end on the screen element itself scrolls the window to the end.
 * Popups    data-popup-trigger="id" toggles element #id (hidden attribute) and aria-expanded.
 *           Click outside or Escape closes. data-popup-open="id" on load keeps one open
 *           (use ?open=id in the URL to open one for a screenshot).
 * Toggles   data-toggle="id" toggles data-open on #id (phone drawers etc.).
 * Shot      <div data-shot="invoice-spinner"></div> draws the Client's attached screenshot.
 */
(function () {
  var KEY = 'agent6-theme'
  var params = new URLSearchParams(location.search)
  var media = window.matchMedia('(prefers-color-scheme: dark)')

  function readMode() {
    var q = params.get('theme')
    if (q === 'light' || q === 'dark' || q === 'system') return q
    try { return localStorage.getItem(KEY) || 'dark' } catch (e) { return 'dark' }
  }
  function apply(mode) {
    var dark = mode === 'dark' || (mode === 'system' && media.matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelectorAll('[data-theme-set]').forEach(function (el) {
      var on = el.getAttribute('data-theme-set') === mode
      if (el.getAttribute('role') === 'menuitemradio' || el.getAttribute('role') === 'radio') el.setAttribute('aria-checked', on)
      else el.setAttribute('aria-pressed', on)
      if (on) el.setAttribute('data-active', '')
      else el.removeAttribute('data-active')
    })
    document.querySelectorAll('[data-theme-label]').forEach(function (el) {
      el.textContent = { light: 'Light', dark: 'Dark', system: 'System' }[mode]
    })
  }
  var mode = readMode()
  apply(mode)
  media.addEventListener('change', function () { if (mode === 'system') apply(mode) })
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-theme-set]')
    if (!t) return
    mode = t.getAttribute('data-theme-set')
    try { localStorage.setItem(KEY, mode) } catch (err) {}
    apply(mode)
  })

  // ---- screens ----
  function show() {
    var screens = document.querySelectorAll('[data-screen]')
    if (!screens.length) return
    var name = decodeURIComponent(location.hash.slice(1))
    var match = document.querySelector('[data-screen="' + CSS.escape(name) + '"]')
    if (!match) { match = screens[0]; name = match.getAttribute('data-screen') }
    screens.forEach(function (s) { s.hidden = s !== match })
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      var names = [el.getAttribute('data-nav')].concat((el.getAttribute('data-nav-also') || '').split(' '))
      var on = names.indexOf(name) >= 0
      if (on) { el.setAttribute('data-active', ''); el.setAttribute('aria-current', 'page') }
      else { el.removeAttribute('data-active'); el.removeAttribute('aria-current') }
    })
    if (match.dataset.title) document.title = match.dataset.title
    window.scrollTo(0, 0)
    // scroll containers marked data-scroll-end start at their end (latest message visible)
    requestAnimationFrame(function () {
      match.querySelectorAll('[data-scroll-end]').forEach(function (el) { el.scrollTop = el.scrollHeight })
      if (match.hasAttribute('data-scroll-end')) window.scrollTo(0, document.documentElement.scrollHeight)
    })
  }
  window.addEventListener('hashchange', show)
  show()

  // ---- popups ----
  function closeAll(except) {
    document.querySelectorAll('[data-popup-trigger]').forEach(function (tr) {
      var id = tr.getAttribute('data-popup-trigger')
      if (id === except) return
      var p = document.getElementById(id)
      if (p && !p.hasAttribute('data-popup-pinned')) { p.hidden = true; tr.setAttribute('aria-expanded', 'false') }
    })
  }
  document.addEventListener('click', function (e) {
    var tr = e.target.closest('[data-popup-trigger]')
    if (tr) {
      var id = tr.getAttribute('data-popup-trigger')
      var p = document.getElementById(id)
      closeAll(id)
      if (p) { p.removeAttribute('data-popup-pinned'); p.hidden = !p.hidden; tr.setAttribute('aria-expanded', String(!p.hidden)) }
      return
    }
    if (!e.target.closest('[data-popup]')) closeAll()
  })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll() })
  // a menu item that navigates closes its menu
  window.addEventListener('hashchange', function () {
    document.querySelectorAll('[data-popup-pinned]').forEach(function (p) { p.removeAttribute('data-popup-pinned') })
    closeAll()
  })
  var openId = params.get('open')
  if (openId) {
    var p = document.getElementById(openId)
    if (p) {
      p.hidden = false
      p.setAttribute('data-popup-pinned', '')
      document.querySelectorAll('[data-popup-trigger="' + openId + '"]').forEach(function (t) { t.setAttribute('aria-expanded', 'true') })
    }
  }

  // ---- toggles ----
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]')
    if (!t) return
    var el = document.getElementById(t.getAttribute('data-toggle'))
    if (!el) return
    if (el.hasAttribute('data-open')) el.removeAttribute('data-open')
    else el.setAttribute('data-open', '')
  })

  // ---- the Client's attached screenshot (token colours only) ----
  var SHOT = '<svg viewBox="0 0 640 400" class="block h-auto w-full" role="img" aria-label="Screenshot of the Customer Portal invoices page with the Download button still loading">' +
    '<rect width="640" height="400" class="fill-background"/>' +
    '<rect width="640" height="44" class="fill-card"/><rect y="44" width="640" height="1" class="fill-border"/>' +
    '<rect x="20" y="14" width="16" height="16" rx="4" class="fill-primary"/>' +
    '<text x="46" y="27" class="fill-foreground" font-size="13" font-weight="600">Halden Customer Portal</text>' +
    '<text x="430" y="27" class="fill-muted-foreground" font-size="12">Shipments</text><text x="508" y="27" class="fill-foreground" font-size="12" font-weight="600">Invoices</text><text x="575" y="27" class="fill-muted-foreground" font-size="12">Help</text>' +
    '<text x="20" y="84" class="fill-foreground" font-size="20" font-weight="600">Invoices</text>' +
    '<text x="20" y="106" class="fill-muted-foreground" font-size="12">PT Sumber Makmur · Account 30418</text>' +
    '<rect x="20" y="126" width="600" height="250" rx="8" class="fill-card stroke-border" stroke-width="1"/>' +
    '<text x="36" y="154" class="fill-muted-foreground" font-size="11">PERIOD</text><text x="230" y="154" class="fill-muted-foreground" font-size="11">AMOUNT</text><text x="380" y="154" class="fill-muted-foreground" font-size="11">STATUS</text>' +
    '<rect x="20" y="166" width="600" height="1" class="fill-border"/>' +
    row(198, 'October 2026', 'Rp 48.250.000', 'Due 30 Nov', true) +
    '<rect x="20" y="218" width="600" height="1" class="fill-border"/>' +
    row(250, 'September 2026', 'Rp 51.900.000', 'Paid', false) +
    '<rect x="20" y="270" width="600" height="1" class="fill-border"/>' +
    row(302, 'August 2026', 'Rp 46.775.000', 'Paid', false) +
    '<rect x="20" y="322" width="600" height="1" class="fill-border"/>' +
    row(354, 'July 2026', 'Rp 49.120.000', 'Paid', false) +
    '</svg>'
  function row(y, period, amount, status, loading) {
    var btn = loading
      ? '<rect x="520" y="' + (y - 17) + '" width="84" height="26" rx="6" class="fill-primary"/>' +
        '<circle cx="540" cy="' + (y - 4) + '" r="6" fill="none" class="stroke-primary-foreground" stroke-width="2" stroke-dasharray="26 12"/>' +
        '<text x="552" y="' + y + '" class="fill-primary-foreground" font-size="12" font-weight="600">Wait…</text>'
      : '<rect x="520" y="' + (y - 17) + '" width="84" height="26" rx="6" fill="none" class="stroke-border" stroke-width="1"/>' +
        '<text x="535" y="' + y + '" class="fill-foreground" font-size="12" font-weight="500">Download</text>'
    return '<text x="36" y="' + y + '" class="fill-foreground" font-size="13" font-weight="500">' + period + '</text>' +
      '<text x="230" y="' + y + '" class="fill-foreground" font-size="13">' + amount + '</text>' +
      '<text x="380" y="' + y + '" class="fill-muted-foreground" font-size="13">' + status + '</text>' + btn
  }
  document.querySelectorAll('[data-shot="invoice-spinner"]').forEach(function (el) { el.innerHTML = SHOT })
})()
