// deployment.js — Fase de despliegue antes de la batalla
// Jugador 1 coloca su flota en su mitad, confirma. 
// Jugador 2 hace lo mismo sin ver al 1. Luego empieza la partida.

import * as THREE from 'three'
import { createShip, ShipType } from './ship.js'
import { hexToWorld, GRID_RADIUS } from './grid.js'

// Las 6 orientaciones posibles en hexágonos (grados)
const HEX_ORIENTATIONS = [0, 60, 120, 180, 240, 300]

// Flota estándar por jugador
const DEFAULT_FLEET = [
  ShipType.DESTROYER,
  ShipType.DESTROYER,
  ShipType.CRUISER,
  ShipType.BATTLESHIP,
  ShipType.SUBMARINE,
  ShipType.CARRIER,
]

export function createDeploymentPhase(scene, tileMap, camera, renderer, onComplete) {
  // onComplete(player1Ships, player2Ships) — llamado cuando ambos confirman

  let currentPlayer = 0  // 0 o 1
  const fleets      = [[], []]        // barcos colocados por jugador
  const colors      = [null, 0x8b0000]

  // Toda la grilla es zona válida para cada jugador
  // (cada jugador tiene su propio hexágono completo)
  function isValidZone(q, player) {
    return true
  }

  // Estado de despliegue del jugador actual
  let toPlace      = []   // tipos de barcos pendientes
  let placedShips  = []   // barcos ya colocados este jugador
  let dragging     = null // { ship, orientIdx }
  let hoveredTile  = null

  // ── UI de despliegue ──────────────────────────────────────────────────────
  const ui = document.createElement('div')
  ui.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,0.85);
    border-top: 1px solid rgba(255,255,255,0.15);
    padding: 14px 24px;
    display: flex; align-items: center; gap: 16px;
    font-family: monospace; color: #ccd; font-size: 13px;
    pointer-events: auto;
  `
  document.body.appendChild(ui)

  const playerLabel = document.createElement('span')
  playerLabel.style.cssText = 'font-weight:bold; font-size:15px; min-width:110px;'
  ui.appendChild(playerLabel)

  const fleetList = document.createElement('div')
  fleetList.style.cssText = 'display:flex; gap:8px; flex:1; flex-wrap:wrap;'
  ui.appendChild(fleetList)

  const hint = document.createElement('span')
  hint.style.cssText = 'color:#778; font-size:11px; min-width:220px; text-align:right;'
  hint.textContent = 'Clic para colocar · Q/E para rotar · Enter para confirmar'
  ui.appendChild(hint)

  const confirmBtn = document.createElement('button')
  confirmBtn.textContent = 'Confirmar despliegue'
  confirmBtn.style.cssText = `
    background: #1a6fa8; color: white; border: none; border-radius: 8px;
    padding: 8px 18px; font-family: monospace; font-size: 13px;
    cursor: pointer; opacity: 0.4; pointer-events: none;
  `
  ui.appendChild(confirmBtn)

  // Pantalla de transición entre jugadores
  const transition = document.createElement('div')
  transition.style.cssText = `
    position: fixed; inset: 0;
    background: #000;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: monospace; color: white;
    z-index: 100; display: none;
  `
  document.body.appendChild(transition)

  // ── Barco fantasma (preview al arrastrar) ─────────────────────────────────
  let ghostShip = null

  function createGhost(shipType, player) {
    removeGhost()
    // addToScene=false: el ghost no se añade hasta el primer mousemove
    ghostShip = createShip(scene, 0, 0, shipType, colors[player], () => {}, false)

    // Las barras del ghost no se añadieron a la escena (addToScene=false)
    // No hay nada que limpiar aquí

    // Semi-transparente
    ghostShip.traverse(obj => {
      if (obj.material) {
        obj.material = obj.material.clone()
        obj.material.transparent = true
        obj.material.opacity = 0.5
      }
    })
    ghostShip.userData.isGhost  = true
    ghostShip.userData.addedToScene = false
    return ghostShip
  }

  function removeGhost() {
    if (ghostShip) {
      scene.remove(ghostShip)
      ghostShip = null
    }
  }

  // ── Iniciar despliegue de un jugador ─────────────────────────────────────
  function startPlayerDeployment(player) {
    currentPlayer = player
    toPlace       = [...DEFAULT_FLEET]
    placedShips   = []
    dragging      = null
    hoveredTile   = null   // ← reset crítico: evita que el click del botón
                           //   de transición use la última celda del jugador anterior

    updatePlayerLabel()
    updateFleetList()
    updateConfirmButton()
    pickNextShip()
  }

  function pickNextShip() {
    if (toPlace.length === 0) {
      removeGhost()
      dragging = null
      updateConfirmButton()
      return
    }
    const nextType = toPlace[0]
    dragging = { ship: null, orientIdx: 0, shipType: nextType }
    ghostShip = createGhost(nextType, currentPlayer)
    updateFleetList()
  }

  function updatePlayerLabel() {
    const colors2 = ['#00cfff', '#ff6b6b']
    const names   = ['Jugador 1', 'Jugador 2']
    playerLabel.innerHTML = `<span style="color:${colors2[currentPlayer]}">● ${names[currentPlayer]}</span>`
  }

  function updateFleetList() {
    fleetList.innerHTML = ''
    const shipNames = {
      [ShipType.DESTROYER]:  'Destructor',
      [ShipType.CRUISER]:    'Crucero',
      [ShipType.BATTLESHIP]: 'Acorazado',
      [ShipType.SUBMARINE]:  'Submarino',
      [ShipType.CARRIER]:    'Portaaviones',
    }
    toPlace.forEach((type, i) => {
      const tag = document.createElement('span')
      tag.textContent = shipNames[type]
      tag.style.cssText = `
        padding: 3px 10px; border-radius: 6px; font-size: 11px;
        background: ${i === 0 ? 'rgba(0,207,255,0.25)' : 'rgba(255,255,255,0.07)'};
        border: 1px solid ${i === 0 ? '#00cfff' : 'rgba(255,255,255,0.1)'};
        color: ${i === 0 ? '#00cfff' : '#778'};
      `
      fleetList.appendChild(tag)
    })
    if (toPlace.length === 0) {
      fleetList.innerHTML = '<span style="color:#3a6; font-size:12px;">✓ Flota completa</span>'
    }
  }

  function updateConfirmButton() {
    const allPlaced = toPlace.length === 0
    confirmBtn.style.opacity      = allPlaced ? '1' : '0.4'
    confirmBtn.style.pointerEvents = allPlaced ? 'auto' : 'none'
  }

  // ── Rotar el barco fantasma ───────────────────────────────────────────────
  function rotateDragging(dir) {
    if (!dragging || !ghostShip) return
    dragging.orientIdx = (dragging.orientIdx + dir + 6) % 6
    applyOrientation(ghostShip, dragging.orientIdx)
  }

  function applyOrientation(ship, orientIdx) {
    ship.rotation.y = THREE.MathUtils.degToRad(HEX_ORIENTATIONS[orientIdx])
  }

  // ── Posicionar ghost sobre tile hover ────────────────────────────────────
  function updateGhostPosition(q, r) {
    if (!ghostShip) return
    const { x, z } = hexToWorld(q, r)
    ghostShip.position.set(x, 0.2, z)

    // Color de validez
    const valid = isValidZone(q, currentPlayer)
    ghostShip.traverse(obj => {
      if (obj.isMesh && obj.material && !obj.userData.isRing) {
        obj.material.color.set(valid ? 0x00ff88 : 0xff3333)
      }
    })
  }

  // ── Colocar barco en tile ─────────────────────────────────────────────────
  function placeShip(q, r) {
    if (!dragging) return
    if (!isValidZone(q, currentPlayer)) return

    // Crear barco real
    const ship = createShip(scene, q, r, dragging.shipType, colors[currentPlayer], () => {})
    applyOrientation(ship, dragging.orientIdx)
    ship.userData.orientIdx = dragging.orientIdx
    ship.userData.owner     = currentPlayer
    // Posicionar barras HP inmediatamente
    ship.userData.updateBars()

    placedShips.push(ship)
    fleets[currentPlayer].push(ship)

    // Quitar de la cola
    toPlace.shift()
    updateFleetList()
    updateConfirmButton()

    // Siguiente barco o terminar
    pickNextShip()
  }

  // ── Confirmar despliegue ──────────────────────────────────────────────────
  confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (toPlace.length > 0) return
    removeGhost()

    if (currentPlayer === 0) {
      // Ocultar barcos del jugador 1 (group + barras HP) y mostrar transición
      fleets[0].forEach(s => {
        s.visible = false
        // Las barras HP viven en la escena directamente, ocultarlas manualmente
        const bars = s.userData._hpBars ?? []
        bars.forEach(b => { if (b.group) b.group.visible = false })
      })
      showTransition()
    } else {
      // Ambos confirmaron — ocultar UI y barcos del J2, arrancar batalla
      fleets[1].forEach(s => {
        s.visible = false
        const bars = s.userData._hpBars ?? []
        bars.forEach(b => { if (b.group) b.group.visible = false })
      })
      ui.remove()
      transition.remove()
      onComplete(fleets[0], fleets[1])
    }
  })

  function showTransition() {
    transition.style.display = 'flex'
    transition.innerHTML = `
      <div style="font-size:28px; font-weight:bold; margin-bottom:16px; color:#ff6b6b;">● Jugador 2</div>
      <div style="color:#aab; margin-bottom:32px;">Es tu turno de desplegar la flota.</div>
      <div style="color:#556; font-size:12px; margin-bottom:32px;">
        (El Jugador 1 ya colocó sus barcos — no mires la pantalla todavía)
      </div>
      <button id="startP2" style="
        background:#8b0000; color:white; border:none; border-radius:8px;
        padding:12px 28px; font-family:monospace; font-size:14px; cursor:pointer;
      ">Jugador 2: Comenzar despliegue</button>
    `
    document.getElementById('startP2').addEventListener('click', (e) => {
      e.stopPropagation()
      transition.style.display = 'none'
      startPlayerDeployment(1)
    })
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster()
  const mouse     = new THREE.Vector2()

  function getTileUnderMouse(e) {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)
    const allTiles  = Object.values(tileMap).map(t => t.children[0])
    const hits      = raycaster.intersectObjects(allTiles, true)
    if (hits.length === 0) return null
    return hits[0].object.parent.userData
  }

  function onMouseMove(e) {
    if (!dragging || !ghostShip) return
    const tile = getTileUnderMouse(e)
    if (!tile) return
    hoveredTile = tile
    // Añadir a la escena la primera vez que el cursor pasa por el mapa
    if (!ghostShip.userData.addedToScene) {
      scene.add(ghostShip)
      ghostShip.userData.addedToScene = true
    }
    updateGhostPosition(tile.q, tile.r)
  }

  function onClick(e) {
    if (!dragging || !hoveredTile) return
    placeShip(hoveredTile.q, hoveredTile.r)
  }

  function onKeyDown(e) {
    if (e.key === 'q' || e.key === 'Q') rotateDragging(-1)
    if (e.key === 'e' || e.key === 'E') rotateDragging(1)
    if (e.key === 'Enter' && toPlace.length === 0) confirmBtn.click()
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('click', onClick)
  window.addEventListener('keydown', onKeyDown)

  // ── Cleanup ───────────────────────────────────────────────────────────────
  function destroy() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('click', onClick)
    window.removeEventListener('keydown', onKeyDown)
    removeGhost()
    // Restaurar visibilidad solo del J1 — scene.js gestiona la visibilidad
    // de ambas flotas al iniciar la batalla. No tocar fleet[1] aquí.
    fleets[0].forEach(s => {
      s.visible = true
      const bars = s.userData._hpBars ?? []
      bars.forEach(b => { if (b.group) b.group.visible = true })
    })
    // Asegurar que fleet[1] permanece oculto hasta que scene.js lo gestione
    fleets[1].forEach(s => {
      s.visible = false
      const bars = s.userData._hpBars ?? []
      bars.forEach(b => { if (b.group) b.group.visible = false })
    })
  }

  // ── Arrancar con jugador 1 ────────────────────────────────────────────────
  startPlayerDeployment(0)

  return { destroy }
}
