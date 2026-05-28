// scene.js — J11: grilla ampliada + barcos multicelda + daño por sección
import * as THREE from 'three'
import { createShip, ShipType } from './ship.js'
import { fireProjectile } from './projectile.js'
import { createTrajectory } from './trajectory.js'
import { createExplosion } from './explosion.js'
import { createTurnSystem } from './turns.js'
import { createHUD } from './hud.js'
import { resolveImpactByDistance } from './damage.js'

const HEX_SIZE    = 1
const GRID_RADIUS = 8   // ← ampliado de 5 a 8 (281 celdas vs 61)
const DAMAGE_PER_SHOT = 3

function hexToWorld(q, r) {
  const x = HEX_SIZE * (3 / 2) * q
  const z = HEX_SIZE * (Math.sqrt(3) * r + (Math.sqrt(3) / 2) * q)
  return { x, z }
}

function createHexMesh(color) {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    const x = HEX_SIZE * Math.cos(angle)
    const y = HEX_SIZE * Math.sin(angle)
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)
  }
  shape.closePath()

  const geo     = new THREE.ShapeGeometry(shape)
  const mat     = new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  const edgeGeo = new THREE.EdgesGeometry(geo)
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0a3d6b })
  const edges   = new THREE.LineSegments(edgeGeo, edgeMat)
  const group   = new THREE.Group()
  group.add(new THREE.Mesh(geo, mat))
  group.add(edges)
  return group
}

function buildGrid(scene) {
  const tiles   = []
  const tileMap = {}

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (Math.abs(q + r) > GRID_RADIUS) continue
      const { x, z } = hexToWorld(q, r)
      const hex = createHexMesh(0x1a6fa8)
      hex.rotation.x = -Math.PI / 2
      hex.position.set(x, 0.01, z)
      hex.userData = { q, r }
      scene.add(hex)
      tiles.push(hex)
      tileMap[`${q},${r}`] = hex
    }
  }
  return { tiles, tileMap }
}

// Celdas dentro de `steps` pasos de (q,r), respetando el tileMap
function getReachableCells(q, r, steps, tileMap) {
  const visited = new Set()
  const result  = []
  visited.add(`${q},${r}`)

  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
  let frontier = [{ q, r }]

  for (let step = 0; step < steps; step++) {
    const next = []
    frontier.forEach(({ q: cq, r: cr }) => {
      dirs.forEach(([dq, dr]) => {
        const nq = cq + dq
        const nr = cr + dr
        const key = `${nq},${nr}`
        if (!visited.has(key) && tileMap[key]) {
          visited.add(key)
          result.push({ q: nq, r: nr })
          next.push({ q: nq, r: nr })
        }
      })
    })
    frontier = next
  }

  return result
}

export function initScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)

  const aspect = window.innerWidth / window.innerHeight
  const zoom   = 18   // ← aumentado para ver la grilla más grande
  const camera = new THREE.OrthographicCamera(
    -zoom * aspect, zoom * aspect, zoom, -zoom, 0.1, 1000
  )
  camera.position.set(20, 20, 20)
  camera.lookAt(0, 0, 0)

  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  sun.position.set(10, 20, 10)
  scene.add(sun)

  const { tiles, tileMap } = buildGrid(scene)
  const hud = createHUD()

  // ── Crear barcos con tipos específicos ──────────────────────────────────
  // Jugador 1: zona izquierda (q negativo)
  const ship1 = createShip(scene, -4, 0,  ShipType.DESTROYER, null, () => {
    trajectory.hide()
  })

  // Jugador 2: zona derecha (q positivo), color rojo
  const ship2 = createShip(scene,  3, -1, ShipType.CRUISER, 0x8b0000, () => {
    trajectory.hide()
  })

  const allShips = [ship1, ship2]

  // ── Sistema de turnos ───────────────────────────────────────────────────
  const turns = createTurnSystem(allShips, (idx, actions, turn) => {
    hud.update(idx, actions, turn)
  })

  hud.update(0, turns.getActions(), 1)

  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight
    camera.left  = -zoom * a
    camera.right =  zoom * a
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  const clock      = new THREE.Clock()
  const projectiles = []
  const trajectory = createTrajectory(scene)
  const explosions = []

  const raycaster = new THREE.Raycaster()
  const mouse     = new THREE.Vector2()
  let highlighted = []

  // ── Resaltado de celdas ─────────────────────────────────────────────────
  function clearHighlights() {
    highlighted.forEach(t => t.children[0].material.color.set(0x1a6fa8))
    highlighted = []
  }

  function highlightMoves(q, r, steps) {
    clearHighlights()
    const cells = getReachableCells(q, r, steps, tileMap)
    cells.forEach(({ q: nq, r: nr }) => {
      const tile = tileMap[`${nq},${nr}`]
      if (tile) {
        tile.children[0].material.color.set(0x27ae60)
        highlighted.push(tile)
      }
    })
  }

  // ── Click izquierdo: seleccionar / mover ────────────────────────────────
  window.addEventListener('click', e => {
    const active = turns.currentShip()
    if (!active.parent) return

    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    // Click en el barco activo → seleccionar
    const shipHits = raycaster.intersectObjects(active.children, true)
    if (shipHits.length > 0) {
      active.userData.selected = !active.userData.selected
      active.userData.ring.material.opacity = active.userData.selected ? 0.8 : 0

      if (active.userData.selected) {
        // Pasos de movimiento = pool restante (1 punto = 1 hex)
        const movePool = turns.getActions().movePool ?? turns.getActions().move
        highlightMoves(active.userData.q, active.userData.r, movePool)
        hud.showSections(active)
      } else {
        clearHighlights()
        hud.hideSections()
      }
      return
    }

    // Click en celda resaltada → mover
    if (active.userData.selected && turns.canMove(1)) {
      const tileHits = raycaster.intersectObjects(
        highlighted.map(t => t.children[0]), true
      )
      if (tileHits.length > 0) {
        const tile       = tileHits[0].object.parent
        const { q, r }   = tile.userData
        const { x, z }   = hexToWorld(q, r)

        // Calcular coste (distancia hex desde posición actual)
        const dq   = Math.abs(q - active.userData.q)
        const dr   = Math.abs(r - active.userData.r)
        const ds   = Math.abs((q + r) - (active.userData.q + active.userData.r))
        const dist = Math.max(dq, dr, ds)

        if (turns.useMove(dist)) {
          active.userData.q = q
          active.userData.r = r
          active.userData.moveTo(q, r)
          active.userData.selected = false
          active.userData.ring.material.opacity = 0
          clearHighlights()
          hud.update(
            turns.currentShip() === ship1 ? 0 : 1,
            turns.getActions(),
            turns.getTurnNumber()
          )
        }
      }
    }
  })

  // ── Click derecho: disparar ─────────────────────────────────────────────
  window.addEventListener('contextmenu', e => {
    e.preventDefault()
    const active = turns.currentShip()
    if (!active.parent) return
    if (!turns.canFire('cannon_light')) return

    const caps = active.userData.getCapabilities()
    if (!caps.canFire) return // sección de cañón destruida

    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    const allTiles = tiles.map(t => t.children[0])
    const hits     = raycaster.intersectObjects(allTiles, true)

    if (hits.length > 0) {
      const from = { x: active.position.x, y: active.position.y + 0.3, z: active.position.z }
      const to   = { x: hits[0].point.x,   y: 0.2,                     z: hits[0].point.z }

      const enemies = allShips.filter(s => s !== active)

      const updater = fireProjectile(scene, from, to, pos => {
        // Resolver impacto usando damage.js
        const result = resolveImpactByDistance(pos, enemies, DAMAGE_PER_SHOT)

        if (result.hit) {
          console.log(
            `Impacto en ${result.sectionLabel} (${result.sectionType})` +
            (result.destroyed ? ' — DESTRUIDA' : ` — HP restante: ${result.ship.userData.sections[result.sectionIndex].hp}`)
          )
          if (result.capabilities) {
            const caps = result.capabilities
            if (!caps.canFire)  console.log('  ⚠ Barco enemigo sin armamento')
            if (!caps.canMove)  console.log('  ⚠ Barco enemigo sin propulsión')
          }
        }

        explosions.push(createExplosion(scene, pos))
      })

      projectiles.push(updater)
      trajectory.hide()
      turns.useAmmo('cannon_light')

      hud.update(
        turns.currentShip() === ship1 ? 0 : 1,
        turns.getActions(),
        turns.getTurnNumber()
      )
    }
  })

  // ── Tecla ENTER: terminar turno ─────────────────────────────────────────
  window.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearHighlights()
      hud.hideSections()
      const active = turns.currentShip()
      active.userData.selected = false
      if (active.userData.ring) active.userData.ring.material.opacity = 0
      turns.endTurn()
      hud.update(
        turns.currentShip() === ship1 ? 0 : 1,
        turns.getActions(),
        turns.getTurnNumber()
      )
    }
  })

  // ── Mousemove: trayectoria ──────────────────────────────────────────────
  window.addEventListener('mousemove', e => {
    const active = turns.currentShip()
    if (!active.parent) { trajectory.hide(); return }

    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    const allTiles = tiles.map(t => t.children[0])
    const hits     = raycaster.intersectObjects(allTiles, true)

    if (hits.length > 0) {
      const from = { x: active.position.x, y: active.position.y + 0.3, z: active.position.z }
      const to   = { x: hits[0].point.x,   y: 0.2,                     z: hits[0].point.z }
      trajectory.update(from, to)
    } else {
      trajectory.hide()
    }
  })

  // ── Loop de animación ───────────────────────────────────────────────────
  let totalTime = 0
  function animate() {
    requestAnimationFrame(animate)
    const dt = clock.getDelta()
    totalTime += dt

    // Olas en tiles
    tiles.forEach(tile => {
      const { q, r } = tile.userData
      tile.position.y = Math.sin(totalTime * 1.5 + q * 0.8 + r * 0.8) * 0.08
    })

    // Flotación de barcos
    allShips.forEach((ship, i) => {
      if (!ship.parent) return
      const phase = i * 1.1
      ship.position.y  = 0.2 + Math.sin(totalTime * 1.5 + phase) * 0.08
      ship.rotation.z  = Math.sin(totalTime * 1.5 + phase) * 0.03
      ship.rotation.x  = Math.sin(totalTime * 1.2 + phase) * 0.02
    })

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (!projectiles[i](dt)) projectiles.splice(i, 1)
    }
    for (let i = explosions.length - 1; i >= 0; i--) {
      if (!explosions[i](dt)) explosions.splice(i, 1)
    }

    renderer.render(scene, camera)
  }
  animate()
}
