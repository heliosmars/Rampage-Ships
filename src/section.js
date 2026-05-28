// section.js — Sección individual de un barco
// Cada barco tiene N secciones; cada una tiene HP propio y una función que se pierde al destruirse.

export const SectionType = {
  CANNON:    'cannon',    // Disparo principal
  TURRET:    'turret',    // Disparo lateral
  BRIDGE:    'bridge',    // Dirección + disparo lateral
  ENGINE:    'engine',    // Movimiento
  TORPEDO:   'torpedo',   // Ataque torpedo
  DIVE:      'dive',      // Motor + inmersión (submarino)
  HANGAR:    'hangar',    // Almacena 1 carga de radar
  BOW:       'bow',       // Proa blindada (acorazado)
  HULL:      'hull',      // Sección genérica sin función especial
}

// Qué función se pierde cuando cada tipo de sección es destruida
export const SectionEffect = {
  [SectionType.CANNON]:  'canFire',
  [SectionType.TURRET]:  'canFireLateral',
  [SectionType.BRIDGE]:  'canTurn',
  [SectionType.ENGINE]:  'canMove',
  [SectionType.TORPEDO]: 'canFire',
  [SectionType.DIVE]:    'canDive',
  [SectionType.HANGAR]:  'radarCharge',
  [SectionType.BOW]:     'armorBonus',
  [SectionType.HULL]:    null,
}

export class Section {
  /**
   * @param {string} type    — SectionType
   * @param {number} maxHp   — HP máximo de esta sección
   * @param {object} cellOffset — {dq, dr} offset relativo a la celda ancla del barco
   */
  constructor(type, maxHp, cellOffset = { dq: 0, dr: 0 }) {
    this.type       = type
    this.maxHp      = maxHp
    this.hp         = maxHp
    this.cellOffset = cellOffset   // posición relativa al ancla del barco
    this.destroyed  = false
  }

  /**
   * Aplica daño a la sección.
   * Devuelve { destroyed, wasAlreadyDead }
   */
  takeDamage(amount) {
    if (this.destroyed) return { destroyed: false, wasAlreadyDead: true }

    this.hp = Math.max(0, this.hp - amount)

    if (this.hp === 0 && !this.destroyed) {
      this.destroyed = true
      return { destroyed: true, wasAlreadyDead: false }
    }

    return { destroyed: false, wasAlreadyDead: false }
  }

  /** Porcentaje de vida restante [0..1] */
  healthPct() {
    return this.hp / this.maxHp
  }

  /** Color de estado para el HUD */
  statusColor() {
    if (this.destroyed)       return '#555555'
    const pct = this.healthPct()
    if (pct > 0.6)            return '#00cc44'
    if (pct > 0.3)            return '#ffaa00'
    return                           '#ff3333'
  }

  /** Etiqueta corta para el HUD */
  label() {
    const labels = {
      [SectionType.CANNON]:  'CÑN',
      [SectionType.TURRET]:  'TRT',
      [SectionType.BRIDGE]:  'PNT',
      [SectionType.ENGINE]:  'MOT',
      [SectionType.TORPEDO]: 'TRP',
      [SectionType.DIVE]:    'BUC',
      [SectionType.HANGAR]:  'HGR',
      [SectionType.BOW]:     'PRO',
      [SectionType.HULL]:    'CSC',
    }
    return labels[this.type] || '???'
  }
}
