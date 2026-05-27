export function createTurnSystem(ships, onTurnChange) {
  let currentIdx = 0
  let actionsLeft = { move: 1, shoot: 1 }

  function currentShip() {
    return ships[currentIdx]
  }

  function useAction(type) {
    if (actionsLeft[type] <= 0) return false
    actionsLeft[type]--
    if (actionsLeft.move <= 0 && actionsLeft.shoot <= 0) {
      nextTurn()
    }
    return true
  }

  function nextTurn() {
    currentIdx = (currentIdx + 1) % ships.length
    actionsLeft = { move: 1, shoot: 1 }
    onTurnChange(currentIdx, actionsLeft)
  }

  function getActions() {
    return { ...actionsLeft }
  }

  return { currentShip, useAction, nextTurn, getActions }
}