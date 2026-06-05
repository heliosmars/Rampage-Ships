// grid.js — Grilla hexagonal pointy-top (vértice arriba)
// Reutilizable: se instancia una vez por jugador.
// Pointy-top significa que los hexágonos tienen vértice apuntando arriba/abajo
// y lados planos a izquierda/derecha — ideal para pantalla vertical móvil.

import * as THREE from 'three'

export const HEX_SIZE    = 1
export const GRID_RADIUS = 6   // radio 6 = 127 celdas por grilla

// ── Conversión de coordenadas ─────────────────────────────────────────────────
// Flat-top axial → mundo 3D (lados planos arriba/abajo, vértices a los lados)
// Con cámara top-down esto produce el hexágono global con lados verticales
// paralelos al borde de la pantalla móvil.
export function hexToWorld(q, r) {
  const x = HEX_SIZE * (3 / 2) * q
  const z = HEX_SIZE * (Math.sqrt(3) * r + (Math.sqrt(3) / 2) * q)
  return { x, z }
}

// Mundo 3D → hex axial
export function worldToHex(x, z) {
  const q = Math.round((2 / 3) * x / HEX_SIZE)
  const r = Math.round((z / HEX_SIZE - (Math.sqrt(3) / 2) * q) / Math.sqrt(3))
  return { q, r }
}

function hexRound(q, r) {
  const s  = -q - r
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s)
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds)        rr = -rq - rs
  return { q: rq, r: rr }
}

// Distancia hex entre dos celdas
export function hexDistance(q1, r1, q2, r2) {
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs((q1 + r1) - (q2 + r2)))
}

// Celdas alcanzables desde (q,r) en `steps` pasos
export function getReachableCells(q, r, steps, tileMap) {
  const visited = new Set([`${q},${r}`])
  const result  = []
  const dirs    = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
  let frontier  = [{ q, r }]
  for (let step = 0; step < steps; step++) {
    const next = []
    frontier.forEach(({ q: cq, r: cr }) => {
      dirs.forEach(([dq, dr]) => {
        const key = `${cq+dq},${cr+dr}`
        if (!visited.has(key) && tileMap[key]) {
          visited.add(key)
          result.push({ q: cq+dq, r: cr+dr })
          next.push({ q: cq+dq, r: cr+dr })
        }
      })
    })
    frontier = next
  }
  return result
}

// ── Mesh de una celda hexagonal (pointy-top) ──────────────────────────────────
function createHexMesh(fillColor, edgeColor = 0x0a3d6b) {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    // Flat-top: ángulo inicial 0°
    const angle = (Math.PI / 180) * (60 * i)
    const x = HEX_SIZE * Math.cos(angle)
    const y = HEX_SIZE * Math.sin(angle)
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)
  }
  shape.closePath()

  const geo     = new THREE.ShapeGeometry(shape)
  const mat     = new THREE.MeshStandardMaterial({ color: fillColor, roughness: 0.8 })
  const edgeGeo = new THREE.EdgesGeometry(geo)
  const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor })
  const edges   = new THREE.LineSegments(edgeGeo, edgeMat)
  const group   = new THREE.Group()
  group.add(new THREE.Mesh(geo, mat))
  group.add(edges)
  return group
}

// ── Colores de celda ──────────────────────────────────────────────────────────
export const TILE_COLOR = {
  OWN:      0x1a6fa8,   // zona propia iluminada
  ENEMY:    0x050d1a,   // zona enemiga oscura (niebla)
  REVEALED: 0x1a6fa8,   // celda enemiga revelada por disparo
  HIT:      0x1a3a1a,   // celda enemiga donde impactó sin barco
  HOVER:    0x2a9fd8,   // hover sobre celda enemiga
  MOVE:     0x27ae60,   // celda de movimiento disponible
}

// ── createGrid ────────────────────────────────────────────────────────────────
// Crea una grilla hexagonal completa y la añade a la escena.
// offset: { x, z } — desplazamiento en mundo (para separar las dos grillas)
export function createGrid(scene, offset = { x: 0, z: 0 }, isEnemy = false) {
  const tiles   = []
  const tileMap = {}

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (Math.abs(q + r) > GRID_RADIUS) continue

      const { x, z } = hexToWorld(q, r)
      const color     = isEnemy ? TILE_COLOR.ENEMY : TILE_COLOR.OWN
      const hex       = createHexMesh(color)

      hex.rotation.x = -Math.PI / 2
      hex.position.set(x + offset.x, 0.01, z + offset.z)
      hex.userData   = { q, r, isEnemy, revealed: false, hit: false, shipHit: false }

      scene.add(hex)
      tiles.push(hex)
      tileMap[`${q},${r}`] = hex
    }
  }

  // ── Métodos de la grilla ────────────────────────────────────────────────
  // Revelar una celda (disparo cayó aquí — sin barco)
  function revealEmpty(q, r) {
    const tile = tileMap[`${q},${r}`]
    if (!tile || tile.userData.revealed) return
    tile.userData.revealed = true
    tile.userData.hit      = true
    tile.children[0].material.color.set(TILE_COLOR.HIT)
  }

  // Revelar una celda con impacto en barco (humo, pero barco aún oculto)
  function revealShipHit(q, r) {
    const tile = tileMap[`${q},${r}`]
    if (!tile) return
    tile.userData.revealed = true
    tile.userData.shipHit  = true
    // Color ligeramente diferente al hit vacío — se verá el humo encima
    tile.children[0].material.color.set(0x2a3a2a)
  }

  // Iluminar completamente una celda (barco completamente revelado)
  function fullyReveal(q, r) {
    const tile = tileMap[`${q},${r}`]
    if (!tile) return
    tile.children[0].material.color.set(TILE_COLOR.REVEALED)
  }

  // Hover sobre celda enemiga
  let hoveredTile = null
  function setHover(q, r) {
    if (hoveredTile) {
      const prev = tileMap[`${hoveredTile.q},${hoveredTile.r}`]
      if (prev && !prev.userData.revealed) {
        prev.children[0].material.color.set(TILE_COLOR.ENEMY)
      } else if (prev && prev.userData.revealed) {
        prev.children[0].material.color.set(
          prev.userData.shipHit ? 0x2a3a2a : TILE_COLOR.HIT
        )
      }
    }
    hoveredTile = q !== null ? { q, r } : null
    if (q === null) return
    const tile = tileMap[`${q},${r}`]
    if (tile) tile.children[0].material.color.set(TILE_COLOR.HOVER)
  }

  // Highlight de movimiento
  let highlightedTiles = []
  const highlightedSet = new Set()   // claves 'q,r' para lookup O(1)

  function setMoveHighlights(cells) {
    clearMoveHighlights()
    cells.forEach(({ q, r }) => {
      const tile = tileMap[`${q},${r}`]
      if (tile) {
        tile.children[0].material.color.set(TILE_COLOR.MOVE)
        highlightedTiles.push(tile)
        highlightedSet.add(`${q},${r}`)
      }
    })
  }

  function clearMoveHighlights() {
    highlightedTiles.forEach(t => {
      t.children[0].material.color.set(TILE_COLOR.OWN)
    })
    highlightedTiles = []
    highlightedSet.clear()
  }

  function isHighlighted(q, r) {
    return highlightedSet.has(`${q},${r}`)
  }

  // Animar olas
  function updateWaves(totalTime) {
    tiles.forEach(tile => {
      const { q, r } = tile.userData
      tile.position.y = Math.sin(totalTime * 1.5 + q * 0.8 + r * 0.8) * 0.06
    })
  }

  return {
    tiles,
    tileMap,
    offset,
    revealEmpty,
    revealShipHit,
    fullyReveal,
    setHover,
    setMoveHighlights,
    clearMoveHighlights,
    isHighlighted,
    updateWaves,
  }
}
