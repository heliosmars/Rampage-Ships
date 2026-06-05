// reveal.js — Sistema de revelación del mapa enemigo
// Gestiona qué celdas han sido atacadas, qué barcos están completamente
// revelados, y los efectos visuales de humo sobre celdas impactadas.

import * as THREE from 'three'

export function createRevealSystem(scene, enemyGrid) {
  // Celdas atacadas: clave `q,r` → true
  const attackedCells = new Set()

  // Barcos con secciones reveladas: Map<ship, Set<sectionIndex>>
  const shipHits = new Map()

  // Barcos completamente revelados
  const fullyRevealedShips = new Set()

  // Meshes de humo activos: Map<`q,r`, humoGroup>
  const smokeEffects = new Map()

  // Barras HP ocultas hasta ser golpeadas
  // Se gestiona desde aquí para centralizar la lógica

  // ── Registrar un impacto ──────────────────────────────────────────────────
  // Llamar cuando un proyectil impacta en el mapa enemigo.
  // hitResult: objeto de resolveImpactByDistance, o null si impactó en agua.
  function registerHit(q, r, hitResult) {
    const key = `${q},${r}`
    attackedCells.add(key)

    if (!hitResult || !hitResult.hit) {
      // Impacto en agua — revelar celda vacía
      enemyGrid.revealEmpty(q, r)
      return { type: 'water' }
    }

    // Impacto en barco
    const { ship, sectionIndex } = hitResult
    enemyGrid.revealShipHit(q, r)
    spawnSmoke(q, r, enemyGrid.offset)

    // Registrar sección golpeada
    if (!shipHits.has(ship)) shipHits.set(ship, new Set())
    shipHits.get(ship).add(sectionIndex)

    // Verificar si el barco está completamente revelado
    const totalSections  = ship.userData.sections.length
    const hitsOnShip     = shipHits.get(ship).size
    const isFullyRevealed = hitsOnShip >= totalSections

    if (isFullyRevealed && !fullyRevealedShips.has(ship)) {
      fullyRevealedShips.add(ship)
      revealShipFully(ship)
      return { type: 'ship_revealed', ship }
    }

    // Mostrar barra HP de la sección golpeada
    showSectionBar(ship, sectionIndex)

    return { type: 'ship_hit', ship, sectionIndex, isFullyRevealed }
  }

  // ── Mostrar barra HP de una sección específica ────────────────────────────
  function showSectionBar(ship, sectionIndex) {
    const bars = ship.userData._hpBars ?? []
    if (bars[sectionIndex] && bars[sectionIndex].group) {
      bars[sectionIndex].group.visible = true
    }
  }

  // ── Revelar barco completamente ───────────────────────────────────────────
  function revealShipFully(ship) {
    // Hacer visible el group del barco
    ship.visible = true

    // Iluminar todas sus celdas en la grilla
    const cells = ship.userData.getOccupiedCells()
    cells.forEach(({ q, r }) => {
      enemyGrid.fullyReveal(q, r)
      removeSmoke(q, r)
    })

    // Mostrar todas las barras HP
    const bars = ship.userData._hpBars ?? []
    bars.forEach(b => { if (b.group) b.group.visible = true })
  }

  // ── Efecto de humo ────────────────────────────────────────────────────────
  function spawnSmoke(q, r, offset) {
    const key = `${q},${r}`
    if (smokeEffects.has(key)) return  // ya hay humo

    const { x, z } = worldPosFromQR(q, r, offset)
    const group     = new THREE.Group()
    group.position.set(x, 0.3, z)

    const particles = []
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 5, 5)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.5 + Math.random() * 0.3,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.4,
        (Math.random() - 0.5) * 0.5
      )
      mesh.userData.speed   = 0.3 + Math.random() * 0.4
      mesh.userData.phase   = Math.random() * Math.PI * 2
      group.add(mesh)
      particles.push(mesh)
    }

    scene.add(group)
    smokeEffects.set(key, { group, particles })
  }

  function removeSmoke(q, r) {
    const key = `${q},${r}`
    const fx  = smokeEffects.get(key)
    if (!fx) return
    scene.remove(fx.group)
    smokeEffects.delete(key)
  }

  // Animar humo cada frame
  function updateSmoke(totalTime) {
    smokeEffects.forEach(({ group, particles }) => {
      particles.forEach(p => {
        p.position.y   = Math.abs(Math.sin(totalTime * p.userData.speed + p.userData.phase)) * 0.6
        p.material.opacity = 0.3 + Math.abs(Math.sin(totalTime * 0.8 + p.userData.phase)) * 0.3
        p.scale.setScalar(0.8 + Math.sin(totalTime * p.userData.speed * 0.5) * 0.2)
      })
    })
  }

  // ── Estado para la vista del defensor ────────────────────────────────────
  // Retorna las celdas atacadas este turno para mostrarlas al defensor
  let newHitsThisTurn = []

  function recordHitForDefender(q, r) {
    newHitsThisTurn.push({ q, r })
  }

  function getAndClearDefenderHits() {
    const hits = [...newHitsThisTurn]
    newHitsThisTurn = []
    return hits
  }

  // ── Verificar si una celda fue atacada ────────────────────────────────────
  function wasCellAttacked(q, r) {
    return attackedCells.has(`${q},${r}`)
  }

  function isShipFullyRevealed(ship) {
    return fullyRevealedShips.has(ship)
  }

  return {
    registerHit,
    updateSmoke,
    wasCellAttacked,
    isShipFullyRevealed,
    recordHitForDefender,
    getAndClearDefenderHits,
  }
}

// Posición mundo desde q,r + offset de grilla
function worldPosFromQR(q, r, offset) {
  const HEX_SIZE = 1
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2) + offset.x
  const z = HEX_SIZE * (3 / 2) * r + offset.z
  return { x, z }
}
