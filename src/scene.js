// scene.js — J14: dos grillas enemigas independientes, humo sincronizado con vistas
import * as THREE from 'three'
import { createShip, ShipType } from './ship.js'
import { fireProjectile } from './projectile.js'
import { createTrajectory } from './trajectory.js'
import { createExplosion } from './explosion.js'
import { createTurnSystem } from './turns.js'
import { createHUD } from './hud.js'
import { resolveImpactByDistance } from './damage.js'
import { createDeploymentPhase } from './deployment.js'
import { createGrid, hexToWorld, getReachableCells, TILE_COLOR } from './grid.js'
import { createRevealSystem } from './reveal.js'

const DAMAGE_PER_SHOT = 3

export function initScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)

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
  let camAnim = null
  const _camFrom = new THREE.Vector3()
  const _camTo   = new THREE.Vector3()

  function animateCamera(toPos, toLook, duration = 0.6, onDone = null) {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    camAnim = {
      fromPos:  camera.position.clone(),
      toPos:    new THREE.Vector3(...toPos),
      fromLook: camera.position.clone().add(dir.multiplyScalar(30)),
      toLook:   new THREE.Vector3(...toLook),
      elapsed: 0, duration, onDone,
    }
  }

  function updateCameraAnim(dt) {
    if (!camAnim) return
    camAnim.elapsed += dt
    const t    = Math.min(camAnim.elapsed / camAnim.duration, 1)
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, ease)
    _camFrom.copy(camAnim.fromLook)
    _camTo.copy(camAnim.toLook)
    camera.lookAt(_camFrom.lerp(_camTo, ease))
    if (t >= 1) { const cb = camAnim.onDone; camAnim = null; if (cb) cb() }
  }

  const clock   = new THREE.Clock()
  let totalTime = 0
  let allShips  = []
  let gameLoop  = null

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

    const ownGrid = createGrid(scene, { x: 0, z: 0 }, false)

    // Dos grillas enemigas independientes — una por jugador atacante
    const enemyGridP0 = createGrid(scene, { x: 0, z: 0 }, true)  // J1 ve esto al atacar
    const enemyGridP1 = createGrid(scene, { x: 0, z: 0 }, true)  // J2 ve esto al atacar

    enemyGridP0.tiles.forEach(t => { t.visible = false })
    enemyGridP1.tiles.forEach(t => { t.visible = false })

    fleet2.forEach(s => {
      s.visible = false
      ;(s.userData._hpBars ?? []).forEach(b => { if (b.group) b.group.visible = false })
    })

    allShips.forEach(s => {
      const { x, z } = hexToWorld(s.userData.q, s.userData.r)
      s.position.x = x; s.position.z = z
    })

    const trajectory  = createTrajectory(scene)
    const hud         = createHUD()
    const projectiles = []
    const explosions  = []

    // revealP0 marca en enemyGridP0 (historial de ataques de J1)
    // revealP1 marca en enemyGridP1 (historial de ataques de J2)
    const revealP0 = createRevealSystem(scene, enemyGridP0)
    const revealP1 = createRevealSystem(scene, enemyGridP1)

    function getReveal(player)    { return player === 0 ? revealP0 : revealP1 }
    function getEnemyGrid(player) { return player === 0 ? enemyGridP0 : enemyGridP1 }

    // ── Acciones por barco ────────────────────────────────────────────────
    let shipActions = new Map()

    function resetShipActions() {
      shipActions = new Map()
      allShips.forEach(s => shipActions.set(s, { attacked: false, moved: false }))
    }
    resetShipActions()

    function canAttack(ship) { return !shipActions.get(ship)?.attacked }
    function canMove(ship) {
      const a = shipActions.get(ship)
      return !a?.moved && !a?.attacked
    }
    function markAttacked(ship) { if (shipActions.has(ship)) shipActions.get(ship).attacked = true }
    function markMoved(ship)    { if (shipActions.has(ship)) shipActions.get(ship).moved    = true }

    // ── Turnos ────────────────────────────────────────────────────────────
    const turns = createTurnSystem(fleet1, fleet2, (playerIdx, actions, turn) => {
      hud.update(playerIdx, actions, turn)
      resetShipActions()
      showOwnView(playerIdx)
    })
    hud.update(0, turns.getActions(), 1)

    let selectedShip  = null
    let activeMode    = null
    let currentView   = 'own'   // 'own' | 'enemy'
    let viewingPlayer = 0       // qué jugador está viendo su mapa

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
      currentView   = 'own'
      viewingPlayer = playerIdx
      ownGrid.tiles.forEach(t => { t.visible = true })
      enemyGridP0.tiles.forEach(t => { t.visible = false })
      enemyGridP1.tiles.forEach(t => { t.visible = false })
      enemyGridP0.setHover(null, null)
      enemyGridP1.setHover(null, null)

      // Ocultar humo de ataque — no debe verse en el mapa propio
      revealP0.hideSmoke()
      revealP1.hideSmoke()
      // La visibilidad del humo de daño se recalcula cada frame en el gameLoop

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

      animateCamera([0, 30, 6], [0, 0, 0])
      deselectShip()
    }

    // ── Vista enemiga ─────────────────────────────────────────────────────
    function showEnemyView(playerIdx) {
      currentView   = 'enemy'
      viewingPlayer = playerIdx
      ownGrid.tiles.forEach(t => { t.visible = false })

      const myEnemyGrid    = getEnemyGrid(playerIdx)
      const otherEnemyGrid = playerIdx === 0 ? enemyGridP1 : enemyGridP0
      myEnemyGrid.tiles.forEach(t => { t.visible = true })
      otherEnemyGrid.tiles.forEach(t => { t.visible = false })

      // Mostrar solo el humo de ataque del jugador activo
      getReveal(playerIdx).showSmoke()
      getReveal(playerIdx === 0 ? 1 : 0).hideSmoke()
      // La visibilidad del humo de daño se recalcula cada frame en el gameLoop

      const myFleet    = playerIdx === 0 ? fleet1 : fleet2
      const enemyFleet = playerIdx === 0 ? fleet2 : fleet1
      const rev        = getReveal(playerIdx)

      myFleet.forEach(s => { s.visible = false })
      enemyFleet.forEach(s => { s.visible = rev.isShipFullyRevealed(s) })

      animateCamera([0, 25, 4], [0, 0, 0], 0.5)
    }

    // ── Botones de acción ─────────────────────────────────────────────────
    const actionUI = document.createElement('div')
    actionUI.style.cssText = `
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
      display:none; gap:12px; z-index:20;
    `
    document.body.appendChild(actionUI)

    function makeBtn(label, bg) {
      const btn = document.createElement('button')
      btn.textContent = label
      btn.style.cssText = `
        background:${bg}; color:white; border:none; border-radius:10px;
        padding:10px 20px; font-family:monospace; font-size:14px; cursor:pointer;
      `
      return btn
    }

    const btnAttack = makeBtn('⚔️ Atacar', '#8b0000')
    const btnMove   = makeBtn('🚢 Mover',  '#1a6fa8')
    actionUI.appendChild(btnAttack)
    actionUI.appendChild(btnMove)

    function showActionButtons(ship) {
      actionUI.style.display = 'flex'
      btnAttack.style.opacity       = canAttack(ship) ? '1'    : '0.3'
      btnAttack.style.pointerEvents = canAttack(ship) ? 'auto' : 'none'
      btnMove.style.opacity         = canMove(ship)   ? '1'    : '0.3'
      btnMove.style.pointerEvents   = canMove(ship)   ? 'auto' : 'none'
    }
    function hideActionButtons() { actionUI.style.display = 'none' }

    btnAttack.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!selectedShip || !canAttack(selectedShip)) return
      activeMode = 'attack'
      hideActionButtons()
      showEnemyView(turns.getCurrentPlayer())
    })

    btnMove.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!selectedShip || !canMove(selectedShip)) return
      activeMode = 'move'
      hideActionButtons()
      const caps  = selectedShip.userData.getCapabilities()
      const steps = caps.canMove ? Math.min(selectedShip.userData.speedBase ?? 2, caps.speedMax) : 0
      if (steps > 0) {
        ownGrid.setMoveHighlights(
          getReachableCells(selectedShip.userData.q, selectedShip.userData.r, steps, ownGrid.tileMap)
        )
      }
    })

    const btnEndTurn = document.createElement('button')
    btnEndTurn.textContent = 'Terminar turno →'
    btnEndTurn.style.cssText = `
      position:fixed; bottom:24px; right:24px;
      background:rgba(0,0,0,0.8); color:white;
      border:1px solid rgba(255,255,255,0.3); border-radius:12px;
      padding:10px 18px; font-family:monospace; font-size:13px;
      cursor:pointer; z-index:10;
    `
    btnEndTurn.addEventListener('click', (e) => { e.stopPropagation(); turns.endTurn() })
    document.body.appendChild(btnEndTurn)

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

      // Vista enemiga: disparar
      if (activeMode === 'attack') {
        const player      = turns.getCurrentPlayer()
        const myEnemyGrid = getEnemyGrid(player)
        const hits = raycaster.intersectObjects(
          myEnemyGrid.tiles.filter(t => t.visible).map(t => t.children[0]), true
        )
        if (!hits.length) return

        const { q, r } = hits[0].object.parent.userData
        const { x, z } = hexToWorld(q, r)
        const enemies   = player === 0 ? fleet2 : fleet1
        const rev       = getReveal(player)

        const from = { x, y: 4, z: z - 10 }
        const to   = { x, y: 0.2, z }

        const updater = fireProjectile(scene, from, to, pos => {
          const hitResult = resolveImpactByDistance(pos, enemies, DAMAGE_PER_SHOT)
          rev.registerHit(q, r, hitResult?.hit ? hitResult : null)
          // Spawn humo de daño sobre la sección golpeada (visible en vista propia del defensor)
          if (hitResult?.hit) {
            const defenderRev = getReveal(player === 0 ? 1 : 0)
            defenderRev.spawnDamageSmoke(hitResult.ship, hitResult.sectionIndex)
          }
          explosions.push(createExplosion(scene, pos))
        })

        projectiles.push(updater)
        trajectory.hide()
        markAttacked(selectedShip)
        activeMode = null

        setTimeout(() => showOwnView(player), 1200)
        return
      }

      // Vista propia: mover
      if (activeMode === 'move') {
        const hits = raycaster.intersectObjects(
          ownGrid.tiles.filter(t => t.visible).map(t => t.children[0]), true
        )
        if (hits.length > 0) {
          const { q, r } = hits[0].object.parent.userData
          if (ownGrid.isHighlighted(q, r)) {
            // Ejecutar movimiento directamente sin depender del pool de turns
            // (el pool existe para el HUD, no como gate del movimiento)
            const ship = selectedShip  // capturar antes de deselectShip
            markMoved(ship)
            ship.userData.q = q
            ship.userData.r = r
            deselectShip()            // limpiar UI primero
            ship.userData.moveTo(q, r) // luego animar
          }
        }
        return
      }

      // Sin modo: seleccionar barco de la flota activa
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

    // ── Hover sobre grilla enemiga activa ──────────────────────────────
    function onMouseMove(e) {
      if (activeMode !== 'attack') return
      getNDC(e)
      raycaster.setFromCamera(mouse, camera)
      const myEnemyGrid = getEnemyGrid(turns.getCurrentPlayer())
      const hits = raycaster.intersectObjects(
        myEnemyGrid.tiles.filter(t => t.visible).map(t => t.children[0]), true
      )
      if (hits.length > 0) {
        const { q, r } = hits[0].object.parent.userData
        myEnemyGrid.setHover(q, r)
      } else {
        myEnemyGrid.setHover(null, null)
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Enter') turns.endTurn()
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
      enemyGridP0.updateWaves(totalTime)
      enemyGridP1.updateWaves(totalTime)
      revealP0.updateSmoke(totalTime)
      revealP1.updateSmoke(totalTime)
      revealP0.updateDamageSmoke(totalTime)
      revealP1.updateDamageSmoke(totalTime)
      // Visibilidad dinámica del humo de daño según vista activa
      // En vista propia: mostrar humo del oponente (daño que sufriste)
      // En vista enemiga: ocultar todo humo de daño
      if (currentView === 'own') {
        const myDmgSmoke  = viewingPlayer === 0 ? revealP0 : revealP1
        const oppDmgSmoke = viewingPlayer === 0 ? revealP1 : revealP0
        oppDmgSmoke.showDamageSmoke()   // humo de daño en barcos propios
        myDmgSmoke.hideDamageSmoke()    // ocultar humo causado al enemigo
      } else {
        revealP0.hideDamageSmoke()
        revealP1.hideDamageSmoke()
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        if (!projectiles[i](dt)) projectiles.splice(i, 1)
      }
      for (let i = explosions.length - 1; i >= 0; i--) {
        if (!explosions[i](dt)) explosions.splice(i, 1)
      }
    }

    showOwnView(0)
  }
}
