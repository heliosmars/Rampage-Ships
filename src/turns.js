// turns.js — Sistema de turnos por jugador (no por barco)

export const MOVE_POOL_PER_TURN    = 8
export const EVASION_TOKENS_PER_TURN = 2

export const AMMO_CONFIG = {
  cannon_light: { total: 6, damage: 2, label: 'Cañón ligero' },
  cannon_std:   { total: 4, damage: 3, label: 'Cañón estándar' },
  cannon_heavy: { total: 3, damage: 4, label: 'Cañón pesado' },
  cannon_low:   { total: 4, damage: 2, label: 'Cañón raso' },
  torpedo:      { total: 2, damage: 5, label: 'Torpedo' },
  area:         { total: 1, damage: 2, label: 'Área (splash)' },
}

function freshState() {
  return {
    movePool:      MOVE_POOL_PER_TURN,
    evasionTokens: EVASION_TOKENS_PER_TURN,
    ammo: Object.fromEntries(
      Object.entries(AMMO_CONFIG).map(([k, v]) => [k, v.total])
    ),
  }
}

// fleet1, fleet2: arrays de barcos de cada jugador
export function createTurnSystem(fleet1, fleet2, onTurnChange) {
  const fleets = [fleet1, fleet2]
  let currentPlayer = 0
  let turnNumber    = 1

  // Estado independiente por jugador (munición es por partida, no se resetea)
  const playerState = [freshState(), freshState()]

  // ── Acceso ────────────────────────────────────────────────────────────────
  function getCurrentPlayer()  { return currentPlayer }
  function getCurrentFleet()   { return fleets[currentPlayer] }
  function getTurnNumber()     { return turnNumber }

  // Compatibilidad: devuelve el primer barco vivo del jugador activo
  function currentShip() {
    return fleets[currentPlayer].find(s => s.parent) ?? fleets[currentPlayer][0]
  }

  // ── Movimiento ────────────────────────────────────────────────────────────
  function useMove(cost = 1) {
    const st = playerState[currentPlayer]
    if (st.movePool < cost) return false
    st.movePool -= cost
    _notify()
    return true
  }

  function canMove(cost = 1) {
    return playerState[currentPlayer].movePool >= cost
  }

  // ── Disparo ───────────────────────────────────────────────────────────────
  function useAmmo(key) {
    const st = playerState[currentPlayer]
    if (!st.ammo[key] || st.ammo[key] <= 0) return false
    st.ammo[key]--
    _notify()
    return true
  }

  function canFire(key) {
    return (playerState[currentPlayer].ammo[key] ?? 0) > 0
  }

  function getAmmo(key) {
    return playerState[currentPlayer].ammo[key] ?? 0
  }

  // ── Tokens de evasión ─────────────────────────────────────────────────────
  function useEvasionToken() {
    const st = playerState[currentPlayer]
    if (st.evasionTokens <= 0) return false
    st.evasionTokens--
    _notify()
    return true
  }

  function reloadWithEvasionToken(key) {
    const st = playerState[currentPlayer]
    if (st.evasionTokens <= 0) return false
    const max = AMMO_CONFIG[key]?.total ?? 0
    if ((st.ammo[key] ?? 0) >= max) return false
    st.evasionTokens--
    st.ammo[key]++
    _notify()
    return true
  }

  // ── Fin de turno ──────────────────────────────────────────────────────────
  function endTurn() {
    currentPlayer = currentPlayer === 0 ? 1 : 0
    if (currentPlayer === 0) turnNumber++

    // Resetear recursos de turno (munición no se resetea)
    const st = playerState[currentPlayer]
    st.movePool      = MOVE_POOL_PER_TURN
    st.evasionTokens = EVASION_TOKENS_PER_TURN

    _notify()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getActions() {
    const st = playerState[currentPlayer]
    return {
      move:          st.movePool,
      shoot:         st.ammo['cannon_light'],
      movePool:      st.movePool,
      evasionTokens: st.evasionTokens,
      ammo:          { ...st.ammo },
    }
  }

  function _notify() {
    onTurnChange(currentPlayer, getActions(), turnNumber)
  }

  return {
    getCurrentPlayer,
    getCurrentFleet,
    currentShip,       // compatibilidad
    getTurnNumber,
    useMove,
    canMove,
    useAmmo,
    canFire,
    getAmmo,
    useEvasionToken,
    reloadWithEvasionToken,
    endTurn,
    getActions,
    // legacy
    useAction: (type) => {
      if (type === 'move')  return useMove(1)
      if (type === 'shoot') return useAmmo('cannon_light')
      return false
    },
  }
}
