// ship.js — Barco con secciones funcionales y posición multicelda
import * as THREE from 'three'
import { Section, SectionType, SectionEffect } from './section.js'

// ── Definiciones de tipos de barco ──────────────────────────────────────────
// Cada tipo define sus secciones en orden proa→popa.
// cellOffset es relativo a la celda ancla (proa), en dirección +q (este).
// Para orientación inicial: la proa apunta en dirección +q.

export const ShipType = {
  DESTROYER:    'destroyer',
  CRUISER:      'cruiser',
  BATTLESHIP:   'battleship',
  SUBMARINE:    'submarine',
  CARRIER:      'carrier',
}

const SHIP_DEFINITIONS = {
  [ShipType.DESTROYER]: {
    name: 'Destructor',
    sections: [
      { type: SectionType.CANNON, hp: 2, dq: 0, dr: 0 },
      { type: SectionType.ENGINE, hp: 2, dq: 1, dr: 0 },
    ],
    speedBase: 3,
    color: { hull: 0x2c3e50, super: 0x34495e },
    size: 2,
  },
  [ShipType.CRUISER]: {
    name: 'Crucero',
    sections: [
      { type: SectionType.CANNON, hp: 3, dq: 0, dr: 0 },
      { type: SectionType.BRIDGE, hp: 3, dq: 1, dr: 0 },
      { type: SectionType.ENGINE, hp: 3, dq: 2, dr: 0 },
    ],
    speedBase: 2,
    color: { hull: 0x1a3a5c, super: 0x2a5a8c },
    size: 3,
  },
  [ShipType.BATTLESHIP]: {
    name: 'Acorazado',
    sections: [
      { type: SectionType.BOW,    hp: 5, dq: 0, dr: 0 },
      { type: SectionType.TURRET, hp: 4, dq: 1, dr: 0 },
      { type: SectionType.TURRET, hp: 4, dq: 2, dr: 0 },
      { type: SectionType.ENGINE, hp: 4, dq: 3, dr: 0 },
    ],
    speedBase: 1,
    color: { hull: 0x3d3d3d, super: 0x555555 },
    size: 4,
  },
  [ShipType.SUBMARINE]: {
    name: 'Submarino',
    sections: [
      { type: SectionType.TORPEDO, hp: 2, dq: 0, dr: 0 },
      { type: SectionType.DIVE,    hp: 2, dq: 1, dr: 0 },
    ],
    speedBase: 2,
    color: { hull: 0x2d4a22, super: 0x3d6a32 },
    size: 2,
  },
  [ShipType.CARRIER]: {
    name: 'Portaaviones',
    sections: [
      { type: SectionType.CANNON, hp: 3, dq: 0, dr: 0 },
      { type: SectionType.HANGAR, hp: 3, dq: 1, dr: 0 },
      { type: SectionType.HANGAR, hp: 3, dq: 2, dr: 0 },
      { type: SectionType.ENGINE, hp: 3, dq: 3, dr: 0 },
    ],
    speedBase: 1,
    color: { hull: 0x4a3520, super: 0x6a5530 },
    size: 4,
  },
}

// ── Helpers de geometría ─────────────────────────────────────────────────────
const HEX_SIZE = 1

function hexToWorld(q, r) {
  const x = HEX_SIZE * (3 / 2) * q
  const z = HEX_SIZE * (Math.sqrt(3) * r + (Math.sqrt(3) / 2) * q)
  return { x, z }
}

// ── Mesh de barra HP por sección ─────────────────────────────────────────────
function createSectionHpBar(offsetX) {
  const group = new THREE.Group()

  const bgGeo = new THREE.PlaneGeometry(0.7, 0.1)
  const bgMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
  const bg = new THREE.Mesh(bgGeo, bgMat)
  group.add(bg)

  const fgGeo = new THREE.PlaneGeometry(0.7, 0.1)
  const fgMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide })
  const fg = new THREE.Mesh(fgGeo, fgMat)
  fg.position.z = 0.01
  group.add(fg)

  group.position.set(offsetX, 1.1, 0)

  function update(pct) {
    fg.scale.x = Math.max(0, pct)
    fg.position.x = -(1 - Math.max(0, pct)) * 0.35
    if (pct > 0.6)      fg.material.color.set(0x00cc44)
    else if (pct > 0.3) fg.material.color.set(0xffaa00)
    else                fg.material.color.set(0xff3333)
  }

  return { group, update }
}

// ── createShip ───────────────────────────────────────────────────────────────
export function createShip(scene, anchorQ = 0, anchorR = 0, shipType = ShipType.DESTROYER, playerColor = null, onDeath = () => {}) {
  const def = SHIP_DEFINITIONS[shipType]
  const group = new THREE.Group()

  // ── Instanciar secciones lógicas ──
  const sections = def.sections.map(s =>
    new Section(s.type, s.hp, { dq: s.dq, dr: s.dr })
  )

  // ── Mesh por sección ──
  const sectionMeshes = []
  const hpBars = []

  sections.forEach((sec, i) => {
    const { x: ox, z: oz } = hexToWorld(sec.cellOffset.dq, sec.cellOffset.dr)

    // Segmento de casco
    const segW = 0.75
    const segD = HEX_SIZE * 0.85
    const hullGeo = new THREE.BoxGeometry(segW, 0.22, segD)
    const hullMat = new THREE.MeshStandardMaterial({
      color: playerColor ?? def.color.hull,
      roughness: 0.8
    })
    const hullMesh = new THREE.Mesh(hullGeo, hullMat)
    hullMesh.position.set(ox, 0, oz)
    group.add(hullMesh)
    sectionMeshes.push(hullMesh)

    // Indicador visual de tipo de sección
    if (sec.type === SectionType.CANNON || sec.type === SectionType.TORPEDO) {
      const cannonGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8)
      const cannonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
      const cannon = new THREE.Mesh(cannonGeo, cannonMat)
      cannon.rotation.z = Math.PI / 2
      cannon.position.set(ox + 0.36, 0.22, oz)
      group.add(cannon)
    }

    if (sec.type === SectionType.ENGINE || sec.type === SectionType.DIVE) {
      const chimneyGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.28, 8)
      const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
      const chimney = new THREE.Mesh(chimneyGeo, chimneyMat)
      chimney.position.set(ox, 0.33, oz)
      group.add(chimney)
    }

    if (sec.type === SectionType.BRIDGE) {
      const bridgeGeo = new THREE.BoxGeometry(0.32, 0.22, 0.44)
      const bridgeMat = new THREE.MeshStandardMaterial({ color: def.color.super })
      const bridge = new THREE.Mesh(bridgeGeo, bridgeMat)
      bridge.position.set(ox, 0.22, oz)
      group.add(bridge)
    }

    if (sec.type === SectionType.BOW) {
      // Proa ligeramente elevada para el acorazado
      hullMesh.scale.y = 1.3
    }

    if (sec.type === SectionType.TURRET) {
      const turretGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.16, 8)
      const turretMat = new THREE.MeshStandardMaterial({ color: 0x444444 })
      const turret = new THREE.Mesh(turretGeo, turretMat)
      turret.position.set(ox, 0.27, oz)
      group.add(turret)
    }

    if (sec.type === SectionType.HANGAR) {
      const hangarGeo = new THREE.BoxGeometry(0.55, 0.1, 0.7)
      const hangarMat = new THREE.MeshStandardMaterial({ color: def.color.super })
      const hangar = new THREE.Mesh(hangarGeo, hangarMat)
      hangar.position.set(ox, 0.22, oz)
      group.add(hangar)
    }

    // Barra HP flotante por sección
    const bar = createSectionHpBar(ox)
    bar.group.rotation.x = 0 // mira hacia arriba, se rota en animate si hace falta
    group.add(bar.group)
    hpBars.push(bar)
  })

  // ── Aro de selección (abarca todo el barco) ──
  const shipLength = def.size * HEX_SIZE
  const ringGeo = new THREE.RingGeometry(shipLength * 0.55, shipLength * 0.65, 6 + def.size * 2)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.set((shipLength - HEX_SIZE) / 2, -0.08, 0) // centrado en el barco
  group.add(ring)

  // ── Posición inicial ──
  const { x: ax, z: az } = hexToWorld(anchorQ, anchorR)
  group.position.set(ax, 0.2, az)
  scene.add(group)

  // ── Celdas ocupadas ──
  // anchorQ/R es la celda de la proa; las demás se calculan con los offsets
  function getOccupiedCells() {
    return sections.map(sec => ({
      q: anchorQ + sec.cellOffset.dq,
      r: anchorR + sec.cellOffset.dr,
      sectionIndex: sections.indexOf(sec)
    }))
  }

  // ── Capacidades dinámicas ──
  // Se recalculan cada vez que se destruye una sección
  function getCapabilities() {
    const caps = {
      canFire:        false,
      canFireLateral: false,
      canTurn:        true,
      canMove:        false,
      canDive:        false,
      radarCharges:   0,
      armorBonus:     false,
      speedMax:       def.speedBase,
    }

    sections.forEach(sec => {
      if (sec.destroyed) return

      switch (sec.type) {
        case SectionType.CANNON:
        case SectionType.TORPEDO:
          caps.canFire = true
          break
        case SectionType.TURRET:
          caps.canFireLateral = true
          break
        case SectionType.BRIDGE:
          caps.canFireLateral = true
          // canTurn ya está en true; si se destruye se pone false abajo
          break
        case SectionType.ENGINE:
          caps.canMove = true
          break
        case SectionType.DIVE:
          caps.canMove = true
          caps.canDive = true
          break
        case SectionType.HANGAR:
          caps.radarCharges++
          break
        case SectionType.BOW:
          caps.armorBonus = true
          caps.canFire = true
          break
      }
    })

    // Si el motor está destruido, reducir velocidad máxima
    const engineAlive = sections.some(s =>
      (s.type === SectionType.ENGINE || s.type === SectionType.DIVE) && !s.destroyed
    )
    if (!engineAlive) caps.speedMax = 0

    // Si el bridge está destruido, no puede girar
    const hasBridge = sections.some(s => s.type === SectionType.BRIDGE)
    if (hasBridge) {
      const bridgeAlive = sections.some(s => s.type === SectionType.BRIDGE && !s.destroyed)
      caps.canTurn = bridgeAlive
    }

    return caps
  }

  // ── Recibir daño en una sección específica ──
  function takeDamageAt(sectionIndex, amount) {
    if (sectionIndex < 0 || sectionIndex >= sections.length) return null

    const sec = sections[sectionIndex]

    // Aplicar reducción de armor si proa intacta y es la proa la golpeada
    let finalAmount = amount
    if (sec.type === SectionType.BOW && !sec.destroyed) {
      finalAmount = Math.max(0, amount - 1) // absorbe 1 punto
    }

    const result = sec.takeDamage(finalAmount)

    // Actualizar barra HP visual
    hpBars[sectionIndex].update(sec.healthPct())

    // Flash visual en la sección golpeada
    const mesh = sectionMeshes[sectionIndex]
    const origColor = mesh.material.color.getHex()
    mesh.material.color.set(0xffffff)
    setTimeout(() => {
      if (!sec.destroyed) mesh.material.color.set(origColor)
      else mesh.material.color.set(0x222222) // oscurecer si destruida
    }, 120)

    // Sacudida del grupo
    group.position.y += 0.18
    setTimeout(() => { group.position.y -= 0.18 }, 100)

    if (result.destroyed) {
      onSectionDestroyed(sectionIndex, sec)
    }

    // Verificar hundimiento
    if (shouldSink()) die()

    return { ...result, capabilities: getCapabilities() }
  }

  function onSectionDestroyed(idx, sec) {
    // Oscurecer mesh de la sección destruida
    sectionMeshes[idx].material.color.set(0x1a1a1a)
    console.log(`[${def.name}] Sección ${sec.label()} destruida. Efecto: ${SectionEffect[sec.type] ?? 'ninguno'}`)
  }

  function shouldSink() {
    // Hundimiento si todas las secciones destruidas
    const allDestroyed = sections.every(s => s.destroyed)
    if (allDestroyed) return true

    // Hundimiento por incapacitación total: sin motor Y sin cañón
    const caps = getCapabilities()
    if (!caps.canFire && !caps.canMove) return true

    return false
  }

  function die() {
    onDeath()
    let progress = 0
    const sink = setInterval(() => {
      progress += 0.05
      group.position.y -= 0.04
      group.rotation.z = Math.sin(progress * 5) * 0.3 * (1 - progress)
      sectionMeshes.forEach(m => m.material.color.set(0x111111))
      if (progress >= 1) {
        clearInterval(sink)
        scene.remove(group)
      }
    }, 50)
  }

  // ── Mover barco a nueva celda ancla ──
  function moveTo(newQ, newR) {
    anchorQ = newQ
    anchorR = newR
    const { x, z } = hexToWorld(anchorQ, anchorR)
    group.position.x = x
    group.position.z = z
  }

  // ── userData para compatibilidad con scene.js ──
  group.userData = {
    q: anchorQ,
    r: anchorR,
    shipType,
    selected: false,
    ring,
    sections,
    getCapabilities,
    getOccupiedCells,
    takeDamageAt,
    moveTo,
    // Compatibilidad con el sistema de daño antiguo (distancia euclidiana)
    // Acepta daño en la sección más cercana al punto de impacto
    takeDamage: (amount) => {
      // Sin posición de impacto: daña la primera sección viva
      const firstAlive = sections.findIndex(s => !s.destroyed)
      if (firstAlive >= 0) takeDamageAt(firstAlive, amount)
    },
    hp: () => sections.reduce((sum, s) => sum + s.hp, 0),
  }

  return group
}

// Exportar para que scene.js pueda usarlo
export { SHIP_DEFINITIONS, ShipType as default }
