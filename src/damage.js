// damage.js — Resolución de impactos por celda hexagonal
// Recibe la celda impactada, identifica qué sección del barco ocupa esa celda,
// y aplica el daño correspondiente.

/**
 * Dado un punto de impacto en coordenadas mundo (x, z),
 * convierte a coordenadas hex axiales (q, r).
 * Inversa de hexToWorld en scene.js.
 */
export function worldToHex(x, z) {
  const HEX_SIZE = 1
  // Inversa de: x = HEX_SIZE * (3/2) * q
  //             z = HEX_SIZE * (sqrt3 * r + sqrt3/2 * q)
  const q = (2 / 3) * x / HEX_SIZE
  const r = (z / HEX_SIZE - (Math.sqrt(3) / 2) * q) / Math.sqrt(3)
  return hexRound(q, r)
}

/**
 * Redondea coordenadas hex fraccionarias al hex entero más cercano.
 */
function hexRound(q, r) {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  let rs = Math.round(s)

  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)

  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds)        rr = -rq - rs

  return { q: rq, r: rr }
}

/**
 * Dado un barco y una celda impactada {q, r},
 * devuelve el índice de la sección que ocupa esa celda, o -1 si ninguna.
 */
export function findHitSection(ship, impactQ, impactR) {
  const occupied = ship.userData.getOccupiedCells()
  const hit = occupied.find(cell => cell.q === impactQ && cell.r === impactR)
  return hit ? hit.sectionIndex : -1
}

/**
 * Resuelve el impacto completo:
 * 1. Convierte posición mundo a hex
 * 2. Busca qué barco enemigo ocupa esa celda
 * 3. Identifica la sección impactada
 * 4. Aplica daño
 *
 * @param {object} impactPos   — { x, z } en coordenadas mundo
 * @param {Array}  enemyShips  — lista de barcos enemigos
 * @param {number} damage      — puntos de daño del proyectil
 * @returns {object|null}      — resultado del impacto o null si no hay impacto
 */
export function resolveImpact(impactPos, enemyShips, damage) {
  const { q: impactQ, r: impactR } = worldToHex(impactPos.x, impactPos.z)

  for (const ship of enemyShips) {
    if (!ship.parent) continue // barco hundido

    const sectionIdx = findHitSection(ship, impactQ, impactR)

    if (sectionIdx >= 0) {
      const result = ship.userData.takeDamageAt(sectionIdx, damage)
      const section = ship.userData.sections[sectionIdx]

      return {
        hit:          true,
        ship,
        sectionIndex: sectionIdx,
        sectionType:  section.type,
        sectionLabel: section.label(),
        destroyed:    result.destroyed,
        capabilities: result.capabilities,
        impactQ,
        impactR,
      }
    }
  }

  // Impacto en agua — sin barco en esa celda
  return { hit: false, impactQ, impactR }
}

/**
 * Versión de compatibilidad con el sistema antiguo de distancia euclidiana.
 * Úsala mientras scene.js no usa coordenadas hex para el impacto.
 * Se puede eliminar en J12 cuando se migre el sistema de disparo.
 */
export function resolveImpactByDistance(impactPos, enemyShips, damage, threshold = 1.2) {
  for (const ship of enemyShips) {
    if (!ship.parent) continue

    const dx = impactPos.x - ship.position.x
    const dz = impactPos.z - ship.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < threshold) {
      // Estimar sección más cercana al punto de impacto
      const sections = ship.userData.sections
      let closestIdx = 0
      let closestDist = Infinity

      sections.forEach((sec, i) => {
        if (sec.destroyed) return
        const { x: sx, z: sz } = sectionWorldPos(ship, sec)
        const sd = Math.sqrt((impactPos.x - sx) ** 2 + (impactPos.z - sz) ** 2)
        if (sd < closestDist) {
          closestDist = sd
          closestIdx = i
        }
      })

      const result = ship.userData.takeDamageAt(closestIdx, damage)
      const section = sections[closestIdx]

      return {
        hit:          true,
        ship,
        sectionIndex: closestIdx,
        sectionType:  section.type,
        sectionLabel: section.label(),
        destroyed:    result.destroyed,
        capabilities: result.capabilities,
      }
    }
  }

  return { hit: false }
}

/**
 * Posición mundo del centro de una sección específica de un barco.
 */
function sectionWorldPos(ship, section) {
  const HEX_SIZE = 1
  const { dq, dr } = section.cellOffset
  const ox = HEX_SIZE * (3 / 2) * dq
  const oz = HEX_SIZE * (Math.sqrt(3) * dr + (Math.sqrt(3) / 2) * dq)
  return {
    x: ship.position.x + ox,
    z: ship.position.z + oz,
  }
}
