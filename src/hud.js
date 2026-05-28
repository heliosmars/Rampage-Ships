// hud.js — HUD con panel de secciones, pool de movimiento y cargadores de munición
import { AMMO_CONFIG } from './turns.js'

export function createHUD() {
  // ── Contenedor principal ──────────────────────────────────────────────────
  const root = document.createElement('div')
  root.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0;
    pointer-events: none;
    font-family: 'Courier New', monospace;
    user-select: none;
  `
  document.body.appendChild(root)

  // ── Barra superior central (turno + turno número) ──────────────────────
  const topBar = document.createElement('div')
  topBar.style.cssText = `
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.75);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 10px;
    padding: 7px 22px;
    display: flex;
    gap: 20px;
    align-items: center;
    font-size: 13px;
    color: #ccd;
  `
  root.appendChild(topBar)

  const turnLabel  = _el('span', '')
  const turnNumber = _el('span', '')
  topBar.appendChild(turnLabel)
  topBar.appendChild(_sep())
  topBar.appendChild(turnNumber)

  // ── Panel inferior izquierdo (recursos del jugador activo) ──────────────
  const panel = document.createElement('div')
  panel.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 20px;
    background: rgba(0,0,0,0.78);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 12px;
    padding: 12px 16px;
    min-width: 220px;
    font-size: 12px;
    color: #ccd;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `
  root.appendChild(panel)

  // Pool de movimiento
  const moveRow = document.createElement('div')
  moveRow.style.cssText = 'display:flex; align-items:center; gap:8px;'
  const moveLabel = _el('span', 'MOV', 'color:#55ddff; font-weight:bold; width:36px;')
  const moveBar   = _progressBar('#55ddff')
  const moveCount = _el('span', '', 'width:28px; text-align:right;')
  moveRow.appendChild(moveLabel)
  moveRow.appendChild(moveBar.el)
  moveRow.appendChild(moveCount)
  panel.appendChild(moveRow)

  // Tokens de evasión
  const evasionRow = document.createElement('div')
  evasionRow.style.cssText = 'display:flex; align-items:center; gap:8px;'
  const evasionLabel  = _el('span', 'EVA', 'color:#aaffaa; font-weight:bold; width:36px;')
  const evasionTokens = _el('span', '', 'letter-spacing:3px; font-size:14px;')
  evasionRow.appendChild(evasionLabel)
  evasionRow.appendChild(evasionTokens)
  panel.appendChild(evasionRow)

  // Separador
  panel.appendChild(_divider())

  // Cargadores de munición
  const ammoRows = {}
  const ammoKeys = ['cannon_light', 'cannon_std', 'torpedo', 'area']
  const ammoColors = {
    cannon_light: '#ffdd88',
    cannon_std:   '#ff9944',
    torpedo:      '#ff5566',
    area:         '#cc88ff',
  }
  const ammoShortNames = {
    cannon_light: 'CÑ·L',
    cannon_std:   'CÑ·E',
    torpedo:      'TRP ',
    area:         'ÁREA',
  }

  ammoKeys.forEach(key => {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex; align-items:center; gap:8px;'
    const lbl    = _el('span', ammoShortNames[key], `color:${ammoColors[key]}; font-weight:bold; width:36px; font-size:11px;`)
    const dots   = _el('span', '', 'letter-spacing:2px; font-size:13px;')
    const dmgLbl = _el('span', `${AMMO_CONFIG[key].damage}dmg`, 'color:#888; font-size:10px; margin-left:4px;')
    row.appendChild(lbl)
    row.appendChild(dots)
    row.appendChild(dmgLbl)
    panel.appendChild(row)
    ammoRows[key] = dots
  })

  // ── Panel de secciones (aparece al seleccionar un barco) ────────────────
  const sectionsPanel = document.createElement('div')
  sectionsPanel.style.cssText = `
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: rgba(0,0,0,0.78);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 12px;
    padding: 12px 16px;
    min-width: 180px;
    font-size: 12px;
    color: #ccd;
    display: none;
    flex-direction: column;
    gap: 6px;
  `
  root.appendChild(sectionsPanel)

  const sectionTitle = _el('div', 'SECCIONES', 'font-weight:bold; font-size:11px; color:#aab; letter-spacing:1px; margin-bottom:4px;')
  sectionsPanel.appendChild(sectionTitle)

  const sectionRows = []

  // ── API pública ───────────────────────────────────────────────────────────
  /**
   * Actualiza el HUD con el estado del turno actual.
   * @param {number} playerIdx  — 0 o 1
   * @param {object} actions    — objeto de getActions()
   * @param {number} turn       — número de turno
   */
  function update(playerIdx, actions, turn = 1) {
    const colors = ['#00cfff', '#ff6b6b']
    const names  = ['Jugador 1', 'Jugador 2']

    // Barra superior
    turnLabel.innerHTML  = `<span style="color:${colors[playerIdx]}">● ${names[playerIdx]}</span>`
    turnNumber.textContent = `Turno ${turn}`

    // Pool de movimiento
    const movePct = (actions.movePool ?? actions.move) / 8
    moveBar.update(movePct)
    moveCount.textContent = `${actions.movePool ?? actions.move}/8`

    // Tokens de evasión
    const tokens = actions.evasionTokens ?? 0
    evasionTokens.textContent = '◆'.repeat(tokens) + '◇'.repeat(Math.max(0, 2 - tokens))
    evasionTokens.style.color = tokens > 0 ? '#aaffaa' : '#556655'

    // Cargadores
    if (actions.ammo) {
      ammoKeys.forEach(key => {
        const current = actions.ammo[key] ?? 0
        const total   = AMMO_CONFIG[key].total
        const filled  = '●'.repeat(current)
        const empty   = '○'.repeat(total - current)
        ammoRows[key].textContent = filled + empty
        ammoRows[key].style.color = current > 0 ? ammoColors[key] : '#444'
      })
    } else {
      // Compatibilidad legacy
      ammoRows['cannon_light'].textContent = '●'.repeat(actions.shoot ?? 0)
    }
  }

  /**
   * Muestra el panel de secciones para el barco seleccionado.
   * @param {object} ship — barco con userData.sections
   */
  function showSections(ship) {
    if (!ship || !ship.userData.sections) {
      sectionsPanel.style.display = 'none'
      return
    }

    sectionsPanel.style.display = 'flex'

    // Limpiar filas anteriores
    sectionRows.forEach(r => r.remove())
    sectionRows.length = 0

    const caps = ship.userData.getCapabilities()

    ship.userData.sections.forEach((sec, i) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex; align-items:center; gap:8px;'

      const lbl = _el('span', sec.label(), `
        width: 32px;
        font-weight: bold;
        font-size: 11px;
        color: ${sec.destroyed ? '#444' : '#ccd'};
      `)

      const bar = _progressBar(sec.statusColor())
      bar.update(sec.destroyed ? 0 : sec.healthPct())

      const hp = _el('span', sec.destroyed ? 'X' : `${sec.hp}/${sec.maxHp}`, `
        font-size: 10px;
        color: ${sec.destroyed ? '#444' : '#aab'};
        width: 28px;
        text-align: right;
      `)

      row.appendChild(lbl)
      row.appendChild(bar.el)
      row.appendChild(hp)
      sectionsPanel.appendChild(row)
      sectionRows.push(row)
    })

    // Capacidades activas
    const capDiv = document.createElement('div')
    capDiv.style.cssText = 'margin-top:6px; font-size:10px; color:#778; line-height:1.6;'
    const capLines = []
    if (!caps.canFire)        capLines.push('⚠ Sin armamento')
    if (!caps.canMove)        capLines.push('⚠ Sin propulsión')
    if (!caps.canTurn)        capLines.push('⚠ Sin dirección')
    if (caps.radarCharges > 0) capLines.push(`📡 Radar ×${caps.radarCharges}`)
    capDiv.innerHTML = capLines.join('<br>') || '✓ Operativo'
    sectionsPanel.appendChild(capDiv)
    sectionRows.push(capDiv)
  }

  function hideSections() {
    sectionsPanel.style.display = 'none'
  }

  return { update, showSections, hideSections }
}

// ── Helpers DOM ───────────────────────────────────────────────────────────────
function _el(tag, text, style = '') {
  const el = document.createElement(tag)
  el.textContent = text
  if (style) el.style.cssText = style
  return el
}

function _sep() {
  return _el('span', '|', 'color:#334; margin:0 4px;')
}

function _divider() {
  const d = document.createElement('div')
  d.style.cssText = 'border-top:1px solid rgba(255,255,255,0.1); margin:2px 0;'
  return d
}

function _progressBar(color = '#55ddff') {
  const track = document.createElement('div')
  track.style.cssText = `
    flex: 1;
    height: 6px;
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    overflow: hidden;
  `
  const fill = document.createElement('div')
  fill.style.cssText = `
    height: 100%;
    background: ${color};
    border-radius: 3px;
    transition: width 0.15s ease;
    width: 100%;
  `
  track.appendChild(fill)

  function update(pct, newColor) {
    fill.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`
    if (newColor) fill.style.background = newColor
  }

  return { el: track, update }
}
