// fog.js — Niebla de guerra
// Cada jugador ve su propia zona claramente.
// La zona enemiga está cubierta salvo celdas reveladas temporalmente.
// Las últimas posiciones conocidas quedan como marcadores fantasma.

import * as THREE from 'three'

const FOG_REVEAL_TURNS = 2   // cuántos turnos dura una celda revelada por disparo

export function createFogSystem(scene, tileMap, playerZoneFn) {
  // playerZoneFn(q, player) → true si la celda pertenece a la zona del jugador

  // Estado de niebla por celda enemiga
  // clave: `${q},${r}` → { revealed: bool, turnsLeft: number, hasGhost: bool }
  const cellState = {}

  // Meshes de niebla (planos oscuros sobre cada celda enemiga)
  const fogMeshes = {}

  // Meshes de fantasma (silueta semi-transparente de última posición conocida)
  const ghostMeshes = {}

  // ── Inicializar niebla sobre la zona enemiga ──────────────────────────────
  function init(viewingPlayer) {
    // Limpiar meshes anteriores
    Object.values(fogMeshes).forEach(m => scene.remove(m))
    Object.values(ghostMeshes).forEach(m => scene.remove(m))
    Object.keys(fogMeshes).forEach(k => delete fogMeshes[k])
    Object.keys(ghostMeshes).forEach(k => delete ghostMeshes[k])
    Object.keys(cellState).forEach(k => delete cellState[k])

    Object.entries(tileMap).forEach(([key, tile]) => {
      const { q, r } = tile.userData
      // Solo cubrir celdas que NO pertenecen al jugador actual
      if (!playerZoneFn(q, viewingPlayer)) {
        cellState[key] = { revealed: false, turnsLeft: 0, hasGhost: false }
        const mesh = createFogMesh(tile)
        fogMeshes[key] = mesh
        scene.add(mesh)
      }
    })
  }

  // ── Mesh de niebla sobre una celda ───────────────────────────────────────
  function createFogMesh(tile) {
    const shape = new THREE.Shape()
    const HEX_SIZE = 0.95
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i)
      const x = HEX_SIZE * Math.cos(angle)
      const y = HEX_SIZE * Math.sin(angle)
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)
    }
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x050d1a,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(tile.position.x, tile.position.y + 0.15, tile.position.z)
    return mesh
  }

  // ── Mesh de fantasma (última posición conocida) ───────────────────────────
  function createGhostMarker(worldX, worldZ) {
    const geo = new THREE.SphereGeometry(0.25, 8, 8)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(worldX, 0.4, worldZ)
    scene.add(mesh)
    return mesh
  }

  // ── Revelar celdas por disparo ────────────────────────────────────────────
  // Revela la celda objetivo y sus vecinos inmediatos por FOG_REVEAL_TURNS turnos
  function revealByShot(q, r) {
    const toReveal = [{ q, r }]
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
    dirs.forEach(([dq, dr]) => toReveal.push({ q: q + dq, r: r + dr }))

    toReveal.forEach(({ q: rq, r: rr }) => {
      const key = `${rq},${rr}`
      if (!cellState[key]) return
      cellState[key].revealed  = true
      cellState[key].turnsLeft = FOG_REVEAL_TURNS
      if (fogMeshes[key]) fogMeshes[key].visible = false
    })
  }

  // ── Revelar celda por radar (1 turno, todas las celdas enemigas) ──────────
  function revealByRadar() {
    Object.entries(cellState).forEach(([key, state]) => {
      state.revealed  = true
      state.turnsLeft = 1
      if (fogMeshes[key]) fogMeshes[key].visible = false
    })
  }

  // ── Actualizar posición conocida de un barco enemigo ─────────────────────
  // Llamar cuando un barco enemigo es visto (celda revelada o impacto)
  function updateGhost(q, r, worldX, worldZ) {
    const key = `${q},${r}`

    // Eliminar fantasma anterior en esa celda
    if (ghostMeshes[key]) {
      scene.remove(ghostMeshes[key])
      delete ghostMeshes[key]
    }

    // Crear nuevo fantasma
    ghostMeshes[key] = createGhostMarker(worldX, worldZ)
  }

  // ── Revelar flash de evasión (1 segundo, 1 celda aleatoria) ──────────────
  function revealEvasionFlash(q, r) {
    const key = `${q},${r}`
    if (!cellState[key]) return

    if (fogMeshes[key]) fogMeshes[key].visible = false
    setTimeout(() => {
      if (fogMeshes[key] && !cellState[key]?.revealed) {
        fogMeshes[key].visible = true
      }
    }, 1000)
  }

  // ── Tick de turno: decrementar contadores y restaurar niebla ─────────────
  function onTurnEnd() {
    Object.entries(cellState).forEach(([key, state]) => {
      if (!state.revealed) return
      state.turnsLeft--
      if (state.turnsLeft <= 0) {
        state.revealed  = false
        state.turnsLeft = 0
        if (fogMeshes[key]) fogMeshes[key].visible = true
      }
    })
  }

  // ── Actualizar posición Y de los meshes de niebla con las olas ───────────
  function syncWithWaves(totalTime) {
    Object.entries(fogMeshes).forEach(([key, mesh]) => {
      if (!mesh.visible) return
      const tile = tileMap[key]
      if (tile) mesh.position.y = tile.position.y + 0.15
    })
  }

  // ── Verificar si una celda está visible para el jugador actual ───────────
  function isCellVisible(q, r) {
    const key = `${q},${r}`
    if (!cellState[key]) return true   // celda propia → siempre visible
    return cellState[key].revealed
  }

  return {
    init,
    revealByShot,
    revealByRadar,
    revealEvasionFlash,
    updateGhost,
    onTurnEnd,
    syncWithWaves,
    isCellVisible,
  }
}
