// scene.js — J13: flujo de acciones por barco, cámara viaja al mapa enemigo
import * as THREE from 'three'
import { createShip, ShipType } from './ship.js'
import { fireProjectile } from './projectile.js'
import { createTrajectory } from './trajectory.js'
import { createExplosion } from './explosion.js'
import { createTurnSystem } from './turns.js'
import { createHUD } from './hud.js'
import { resolveImpactByDistance } from './damage.js'
import { createDeploymentPhase } from './deployment.js'
import { createGrid, hexToWorld, worldToHex, getReachableCells, HEX_SIZE, GRID_RADIUS, TILE_COLOR } from './grid.js'
import { createRevealSystem } from './reveal.js'

const DAMAGE_PER_SHOT = 3

export function initScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)

  // ── Cámara ────────────────────────────────────────────────────────────────
  const aspect = window.innerWidth / window.innerHeight
  const zoom   = 14
  const camera = new THREE.OrthographicCamera(
    -zoom * aspect, zoom * aspect, zoom, -zoom, 0.1, 1000
  )
  camera.position.set(0, 30, 6)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const sun = new THREE.DirectionalLight(0xffffff, 0.9)
  sun.position.set(5, 20, 5)
  scene.add(sun)

  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight
    camera.left = -zoom * a; camera.right = zoom * a
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // ── Animación de cámara ───────────────────────────────────────────────────
  let camAnim = null  // { fromPos, toPos, fromLook, toLook, elapsed, duration, onDone }
  const _camFrom = new THREE.Vector3()
  const _camTo   = new THREE.Vector3()

  function animateCamera(toPos, toLook, duration = 0.6, onDone = null) {
    camAnim = {
      fromPos:  camera.position.clone(),
      toPos:    new THREE.Vector3(...toPos),
      fromLook: getCameraLookAt(),
      toLook:   new THREE.Vector3(...toLook),
      elapsed:  0,
      duration,
      onDone,
    }
  }

  function getCameraLookAt() {
    // Reconstruir punto de lookAt desde la dirección actual
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    return camera.position.clone().add(dir.multiplyScalar(30))
  }

  function updateCameraAnim(dt) {
    if (!camAnim) return
    camAnim.elapsed += dt
    const t    = Math.min(camAnim.elapsed / camAnim.duration, 1)
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t  // ease in-out

    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, ease)
    _camFrom.copy(camAnim.fromLook)
    _camTo.copy(camAnim.toLook)
    camera.lookAt(_camFrom.lerp(_camTo, ease))

    if (t >= 1) {
      const cb = camAnim.onDone
      camAnim = null
      if (cb) cb()
    }
  }

  // ── Estado global ─────────────────────────────────────────────────────────
  const clock    = new THREE.Clock()
  let totalTime  = 0
  let allShips   = []
  let gameLoop   = null

  // ── Loop principal ────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate)
    const dt = clock.getDelta()
    totalTime += dt

    updateCameraAnim(dt)

    allShips.forEach((ship, i) => {
      if (!ship.parent) return
      ship.userData.updateMovement(dt)
      const phase     = i * 1.1
      ship.position.y = 0.2 + Math.sin(totalTime * 1.5 + phase) * 0.06
      ship.rotation.z = Math.sin(totalTime * 1.5 + phase) * 0.02
      ship.rotation.x = Math.sin(totalTime * 1.2 + phase) * 0.015
      ship.userData.updateBars()
    })

    if (gameLoop) gameLoop(dt)
    renderer.render(scene, camera)
  }
  animate()

  // ── Despliegue ────────────────────────────────────────────────────────────
  const deployGrid = createGrid(scene, { x: 0, z: 0 }, false)

  const deployment = createDeploymentPhase(
    scene, deployGrid.tileMap, camera, renderer,
    (fleet1, fleet2) => {
      deployment.destroy()
      deployGrid.tiles.forEach(t => scene.remove(t))
      startBattle(fleet1, fleet2)
    }
  )

  // ── BATALLA ───────────────────────────────────────────────────────────────
  function startBattle(fleet1, fleet2) {
    allShips = [...fleet1, ...fleet2]

    // Dos grillas en la misma posición — solo una visible a la vez
    const ownGrid   = createGrid(scene, { x: 0, z: 0 }, false)
    const enemyGrid = createGrid(scene, { x: 0, z: 0 }, true)
    enemyGrid.tiles.forEach(t => { t.visible = false })

    // Ocultar barcos enemigos al inicio
    fleet2.forEach(s => {
      s.visible = false
      ;(s.userData._hpBars ?? []).forEach(b => { if (b.group) b.group.visible = false })
    })

    // Reposicionar barcos sobre la grilla (offset 0,0)
    allShips.forEach(s => {
      const { x, z } = hexToWorld(s.userData.q, s.userData.r)
      s.position.x = x; s.position.z = z
    })

    const trajectory    = createTrajectory(scene)
    const hud           = createHUD()
    const projectiles   = []
    const explosions    = []

    // Sistema de revelación por jugador
    const revealP0 = createRevealSystem(scene, enemyGrid)  // J1 atacando a J2
    const revealP1 = createRevealSystem(scene, enemyGrid)  // J2 atacando a J1

    function getReveal(player) { return player === 0 ? revealP0 : revealP1 }

    // ── Acciones por barco ────────────────────────────────────────────────
    // Cada barco tiene { attacked: bool, moved: bool } por turno
    let shipActions = new Map()

    function resetShipActions() {
      shipActions = new Map()
      allShips.forEach(s => shipActions.set(s, { attacked: false, moved: false }))
    }
    resetShipActions()

    function canAttack(ship) { return !(shipActions.get(ship)?.attacked) }
    function canMove(ship)   { return !(shipActions.get(ship)?.moved) && !(shipActions.get(ship)?.attacked) }
    function markAttacked(ship) { if (shipActions.has(ship)) shipActions.get(ship).attacked = true }
    function markMoved(ship)    { if (shipActions.has(ship)) shipActions.get(ship).moved = true }

    // ── Sistema de turnos ─────────────────────────────────────────────────
    const turns = createTurnSystem(fleet1, fleet2, (playerIdx, actions, turn) => {
      hud.update(playerIdx, actions, turn)
      resetShipActions()
      showOwnView(playerIdx)
    })
    hud.update(0, turns.getActions(), 1)

    // ── Barco seleccionado y modo activo ──────────────────────────────────
    let selectedShip = null   // barco seleccionado en vista propia
    let activeMode   = null   // 'move' | 'attack' | null

    function deselectShip() {
      if (selectedShip) {
        selectedShip.userData.selected = false
        if (selectedShip.userData.ring) selectedShip.userData.ring.material.opacity = 0
        selectedShip = null
      }
      activeMode = null
      ownGrid.clearMoveHighlights()
      hud.hideSections()
      hideActionButtons()
    }

    // ── Vista propia ──────────────────────────────────────────────────────
    function showOwnView(playerIdx) {
      ownGrid.tiles.forEach(t => { t.visible = true })
      enemyGrid.tiles.forEach(t => { t.visible = false })
      enemyGrid.setHover(null, null)

      const myFleet    = playerIdx === 0 ? fleet1 : fleet2
      const enemyFleet = playerIdx === 0 ? fleet2 : fleet1
      const rev        = getReveal(playerIdx)

      myFleet.forEach(s => {
        s.visible = true
        ;(s.userData._hpBars ?? []).forEach(b => { if (b.group) b.group.visible = true })
      })
      enemyFleet.forEach(s => {
        const show = rev.isShipFullyRevealed(s)
        s.visible  = show
        ;(s.userData._hpBars ?? []).forEach(b => { if (b.group) b.group.visible = show })
      })

      // Cámara vuelve al mapa propio
      animateCamera([0, 30, 6], [0, 0, 0])
      deselectShip()
    }

    // ── Vista enemiga (para atacar) ───────────────────────────────────────
    function showEnemyView(playerIdx, onReady) {
      ownGrid.tiles.forEach(t => { t.visible = false })
      enemyGrid.tiles.forEach(t => { t.visible = true })

      const myFleet    = playerIdx === 0 ? fleet1 : fleet2
      const enemyFleet = playerIdx === 0 ? fleet2 : fleet1
      const rev        = getReveal(playerIdx)

      myFleet.forEach(s => { s.visible = false })
      enemyFleet.forEach(s => {
        const show = rev.isShipFullyRevealed(s)
        s.visible  = show
      })

      // Cámara viaja al mapa enemigo (misma posición, efecto de zoom/tilt)
      animateCamera([0, 25, 4], [0, 0, 0], 0.5, onReady)
    }

    // ── Botones de acción ─────────────────────────────────────────────────
    const actionUI = document.createElement('div')
    actionUI.style.cssText = `
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      display: none; gap: 12px; z-index: 20;
    `
    document.body.appendChild(actionUI)

    const btnAttack = makeActionBtn('⚔️ Atacar',  '#8b0000')
    const btnMove   = makeActionBtn('🚢 Mover',   '#1a6fa8')
    actionUI.appendChild(btnAttack)
    actionUI.appendChild(btnMove)

    function makeActionBtn(label, bg) {
      const btn = document.createElement('button')
      btn.textContent = label
      btn.style.cssText = `
        background: ${bg}; color: white; border: none; border-radius: 10px;
        padding: 10px 20px; font-family: monospace; font-size: 14px;
        cursor: pointer; opacity: 0.9;
      `
      return btn
    }

    function showActionButtons(ship) {
      const p = turns.getCurrentPlayer()
      actionUI.style.display = 'flex'
      btnAttack.style.opacity = canAttack(ship) ? '1' : '0.3'
      btnAttack.style.pointerEvents = canAttack(ship) ? 'auto' : 'none'
      btnMove.style.opacity   = canMove(ship)   ? '1' : '0.3'
      btnMove.style.pointerEvents = canMove(ship)   ? 'auto' : 'none'
    }

    function hideActionButtons() {
      actionUI.style.display = 'none'
    }

    // Botón atacar: viaja al mapa enemigo
    btnAttack.addEventListener('click', (e) => {
      e.stopPropagation()   // evitar que el click llegue al canvas
      if (!selectedShip || !canAttack(selectedShip)) return
      activeMode = 'attack'
      hideActionButtons()
      const p = turns.getCurrentPlayer()
      showEnemyView(p, null)
    })

    // Botón mover: muestra celdas disponibles
    btnMove.addEventListener('click', (e) => {
      e.stopPropagation()   // evitar que el click llegue al canvas
      if (!selectedShip || !canMove(selectedShip)) return
      activeMode = 'move'
      hideActionButtons()
      const caps  = selectedShip.userData.getCapabilities()
      const steps = caps.canMove ? Math.min(selectedShip.userData.speedBase ?? 2, caps.speedMax) : 0
      if (steps > 0) {
        const cells = getReachableCells(
          selectedShip.userData.q, selectedShip.userData.r, steps, ownGrid.tileMap
        )
        ownGrid.setMoveHighlights(cells)
      }
    })

    // Botón fin de turno
    const btnEndTurn = document.createElement('button')
    btnEndTurn.textContent = 'Terminar turno →'
    btnEndTurn.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      background: rgba(0,0,0,0.8); color: white;
      border: 1px solid rgba(255,255,255,0.3); border-radius: 12px;
      padding: 10px 18px; font-family: monospace; font-size: 13px;
      cursor: pointer; z-index: 10;
    `
    btnEndTurn.addEventListener('click', (e) => { e.stopPropagation(); endCurrentTurn() })
    document.body.appendChild(btnEndTurn)

    function endCurrentTurn() {
      deselectShip()
      showOwnView(turns.getCurrentPlayer() === 0 ? 1 : 0)
      turns.endTurn()
    }

    // ── Raycaster ─────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster()
    const mouse     = new THREE.Vector2()

    function getNDC(e) {
      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    }

    // ── Click ─────────────────────────────────────────────────────────────
    function onClick(e) {
      getNDC(e)
      raycaster.setFromCamera(mouse, camera)

      // ── Vista enemiga: disparar ──────────────────────────────────────
      if (activeMode === 'attack') {
        const hits = raycaster.intersectObjects(
          enemyGrid.tiles.filter(t => t.visible).map(t => t.children[0]), true
        )
        if (!hits.length) return

        const { q, r } = hits[0].object.parent.userData
        const { x, z } = hexToWorld(q, r)
        const player    = turns.getCurrentPlayer()
        const enemies   = player === 0 ? fleet2 : fleet1
        const rev       = getReveal(player)

        const from = { x, y: 4, z: z - 10 }
        const to   = { x, y: 0.2, z }

        const updater = fireProjectile(scene, from, to, pos => {
          const hitResult = resolveImpactByDistance(pos, enemies, DAMAGE_PER_SHOT)
          rev.registerHit(q, r, hitResult?.hit ? hitResult : null)
          explosions.push(createExplosion(scene, pos))
        })

        projectiles.push(updater)
        trajectory.hide()
        markAttacked(selectedShip)
        activeMode = null

        // Volver al mapa propio tras un breve delay
        setTimeout(() => showOwnView(player), 1200)
        return
      }

      // ── Vista propia: seleccionar barco o mover ──────────────────────
      if (activeMode === 'move') {
        // Click en celda de movimiento — usar tileMap para validar
        const hits = raycaster.intersectObjects(
          ownGrid.tiles.filter(t => t.visible).map(t => t.children[0]), true
        )
        if (hits.length > 0) {
          const { q, r } = hits[0].object.parent.userData
          // Verificar que la celda está en el set de celdas resaltadas
          if (ownGrid.isHighlighted(q, r)) {
            const dist = Math.max(
              Math.abs(q - selectedShip.userData.q),
              Math.abs(r - selectedShip.userData.r),
              Math.abs((q+r) - (selectedShip.userData.q + selectedShip.userData.r))
            )
            if (turns.useMove(dist)) {
              markMoved(selectedShip)
              selectedShip.userData.q = q
              selectedShip.userData.r = r
              selectedShip.userData.moveTo(q, r)
              deselectShip()
            }
          }
        }
        return
      }

      // Sin modo activo: seleccionar barco de la flota activa
      const activeFleet = turns.getCurrentFleet()
      let clickedShip   = null
      for (const ship of activeFleet) {
        if (!ship.parent || ship.userData.isMoving()) continue
        if (raycaster.intersectObjects(ship.children, true).length > 0) {
          clickedShip = ship; break
        }
      }

      if (clickedShip) {
        if (selectedShip === clickedShip) {
          deselectShip()
        } else {
          deselectShip()
          selectedShip = clickedShip
          selectedShip.userData.selected = true
          selectedShip.userData.ring.material.opacity = 0.8
          hud.showSections(selectedShip)
          showActionButtons(selectedShip)
        }
      } else {
        deselectShip()
      }
    }

    // ── Hover sobre grilla enemiga ─────────────────────────────────────
    function onMouseMove(e) {
      if (activeMode !== 'attack') return
      getNDC(e)
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(
        enemyGrid.tiles.filter(t => t.visible).map(t => t.children[0]), true
      )
      if (hits.length > 0) {
        const { q, r } = hits[0].object.parent.userData
        enemyGrid.setHover(q, r)
      } else {
        enemyGrid.setHover(null, null)
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Enter') endCurrentTurn()
      if (e.key === 'Escape') {
        if (activeMode === 'attack') showOwnView(turns.getCurrentPlayer())
        else deselectShip()
      }
    }

    window.addEventListener('click',     onClick)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('keydown',   onKeyDown)

    gameLoop = (dt) => {
      ownGrid.updateWaves(totalTime)
      enemyGrid.updateWaves(totalTime)
      revealP0.updateSmoke(totalTime)
      revealP1.updateSmoke(totalTime)
      for (let i = projectiles.length - 1; i >= 0; i--) {
        if (!projectiles[i](dt)) projectiles.splice(i, 1)
      }
      for (let i = explosions.length - 1; i >= 0; i--) {
        if (!explosions[i](dt)) explosions.splice(i, 1)
      }
    }

    // Iniciar en vista propia del J1
    showOwnView(0)
  }
}
