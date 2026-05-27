export function createHUD() {
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 10px 24px;
    border-radius: 12px;
    font-family: monospace;
    font-size: 15px;
    pointer-events: none;
    border: 1px solid rgba(255,255,255,0.2);
    display: flex;
    gap: 24px;
    align-items: center;
  `
  document.body.appendChild(container)

  const turnEl = document.createElement('span')
  const moveEl = document.createElement('span')
  const shootEl = document.createElement('span')

  container.appendChild(turnEl)
  container.appendChild(moveEl)
  container.appendChild(shootEl)

  function update(playerIdx, actions) {
    const colors = ['#00cfff', '#ff6b6b']
    const names = ['Jugador 1', 'Jugador 2']
    turnEl.innerHTML = `<span style="color:${colors[playerIdx]}">● ${names[playerIdx]}</span>`
    moveEl.textContent = `Mover: ${actions.move}`
    shootEl.textContent = `Disparar: ${actions.shoot}`
  }

  return { update }
}