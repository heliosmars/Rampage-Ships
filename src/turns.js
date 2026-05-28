// turns.js — Sistema de turnos con pool de movimiento y cargadores de munición

// ── Configuración de recursos ────────────────────────────────────────────────
export const MOVE_POOL_PER_TURN = 8        // Puntos de movimiento por turno (pool compartido)
export const EVASION_TOKENS_PER_TURN = 2   // Tokens de evasión por turno

// Cargas totales por tipo de arma para toda la partida
export const AMMO_CONFIG = {
  cannon_light:  { total: 6, damage: 2, label: 'Cañón ligero' },
  cannon_std:    { total: 4, damage: 3, label: 'Cañón estándar' },
  cannon_heavy:  { total: 3, damage: 4, label: 'Cañón pesado' },
  cannon_low:    { total: 4, damage: 2, label: 'Cañón raso' },
  torpedo:       { total: 2, damage: 5, label: 'Torpedo' },
  area:          { total: 1, damage: 2, label: 'Área (splash)' },
}

// ── createTurnSystem ─────────────────────────────────────────────────────────
export function createTurnSystem(ships, onTurnChange) {
  let currentIdx = 0
  let turnNumber  = 1

  // Estado por jugador
  const playerState = ships.map(() => ({
    movePool:      MOVE_POOL_PER_TURN,
    evasionTokens: EVASION_TOKENS_PER_TURN,
    // Cargadores: inicializar con cargas totales para cada tipo de arma
    ammo: Object.fromEntries(
      Object.entries(AMMO_CONFIG).map(([key, cfg]) => [key, cfg.total])
    ),
  }))

  // ── Acceso al estado actual ──────────────────────────────────────────────
  function currentShip() {
    return ships[currentIdx]
  }

  function getState() {
    return { ...playerState[currentIdx] }
  }

  function getTurnNumber() {
    return turnNumber
  }

  // ── Movimiento ───────────────────────────────────────────────────────────
  /**
   * Intenta gastar `cost` puntos de movimiento del pool actual.
   * Devuelve true si hay suficientes, false si no.
   */
  function useMove(cost = 1) {
    const state = playerState[currentIdx]
    if (state.movePool < cost) return false
    state.movePool -= cost
    _notifyChange()
    return true
  }

  function canMove(cost = 1) {
    return playerState[currentIdx].movePool >= cost
  }

  // ── Disparo ──────────────────────────────────────────────────────────────
  /**
   * Intenta gastar 1 carga del arma indicada.
   * @param {string} weaponKey — clave de AMMO_CONFIG
   */
  function useAmmo(weaponKey) {
    const state = playerState[currentIdx]
    if (state.ammo[weaponKey] === undefined) return false
    if (state.ammo[weaponKey] <= 0) return false
    state.ammo[weaponKey]--
    _notifyChange()
    return true
  }

  function canFire(weaponKey) {
    const state = playerState[currentIdx]
    return (state.ammo[weaponKey] ?? 0) > 0
  }

  function getAmmo(weaponKey) {
    return playerState[currentIdx].ammo[weaponKey] ?? 0
  }

  // ── Tokens de evasión ────────────────────────────────────────────────────
  function useEvasionToken() {
    const state = playerState[currentIdx]
    if (state.evasionTokens <= 0) return false
    state.evasionTokens--
    _notifyChange()
    return true
  }

  /**
   * Sacrifica un token de evasión para recargar 1 munición del arma indicada.
   */
  function reloadWithEvasionToken(weaponKey) {
    const state = playerState[currentIdx]
    if (state.evasionTokens <= 0) return false
    if (state.ammo[weaponKey] === undefined) return false
    const maxAmmo = AMMO_CONFIG[weaponKey]?.total ?? 0
    if (state.ammo[weaponKey] >= maxAmmo) return false // ya está lleno
    state.evasionTokens--
    state.ammo[weaponKey]++
    _notifyChange()
    return true
  }

  // ── Fin de turno ─────────────────────────────────────────────────────────
  /**
   * Avanza al siguiente jugador y resetea recursos de turno.
   * Los cargadores de munición NO se resetean (son por partida).
   */
  function nextTurn() {
    currentIdx = (currentIdx + 1) % ships.length

    // Al completar una ronda, incrementar turno
    if (currentIdx === 0) turnNumber++

    // Resetear solo los recursos que se renuevan por turno
    playerState[currentIdx].movePool      = MOVE_POOL_PER_TURN
    playerState[currentIdx].evasionTokens = EVASION_TOKENS_PER_TURN

    _notifyChange()
  }

  /**
   * Fin de turno manual (el jugador presiona "Terminar turno").
   */
  function endTurn() {
    nextTurn()
  }

  // ── Compatibilidad con la API anterior de turns.js ───────────────────────
  // scene.js usa turns.useAction('move') y turns.useAction('shoot')
  // Mantenemos este wrapper para no romper scene.js en J11.
  // Se eliminará en J12 cuando se migre scene.js.
  function useAction(type) {
    if (type === 'move')  return useMove(1)
    if (type === 'shoot') return useAmmo('cannon_light') // arma por defecto
    return false
  }

  function getActions() {
    // Formato legacy que espera hud.js actual
    const state = playerState[currentIdx]
    return {
      move:  state.movePool,
      shoot: state.ammo['cannon_light'],
      // Nuevo formato extendido:
      movePool:      state.movePool,
      evasionTokens: state.evasionTokens,
      ammo:          { ...state.ammo },
    }
  }

  // ── Interno ──────────────────────────────────────────────────────────────
  function _notifyChange() {
    onTurnChange(currentIdx, getActions(), turnNumber)
  }

  return {
    // API principal
    currentShip,
    getState,
    getTurnNumber,
    useMove,
    canMove,
    useAmmo,
    canFire,
    getAmmo,
    useEvasionToken,
    reloadWithEvasionToken,
    endTurn,
    nextTurn,
    // Compatibilidad legacy
    useAction,
    getActions,
  }
}
