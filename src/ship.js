import * as THREE from 'three'

export function createShip(scene, q = 0, r = 0, onDeath = () => {}) {
  const group = new THREE.Group()

  // Casco
  const hullGeo = new THREE.BoxGeometry(0.6, 0.25, 1.4)
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
  const hull = new THREE.Mesh(hullGeo, hullMat)
  group.add(hull)

  // Superestructura
  const superGeo = new THREE.BoxGeometry(0.35, 0.25, 0.5)
  const superMat = new THREE.MeshStandardMaterial({ color: 0x34495e })
  const superStr = new THREE.Mesh(superGeo, superMat)
  superStr.position.set(0, 0.25, 0.1)
  group.add(superStr)

  // Cañón
  const cannonGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8)
  const cannonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  const cannon = new THREE.Mesh(cannonGeo, cannonMat)
  cannon.rotation.z = Math.PI / 2
  cannon.position.set(0.35, 0.3, 0.1)
  group.add(cannon)

  // Chimenea
  const chimneyGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8)
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  const chimney = new THREE.Mesh(chimneyGeo, chimneyMat)
  chimney.position.set(0, 0.42, -0.1)
  group.add(chimney)

  // Aro de selección
  const ringGeo = new THREE.RingGeometry(0.7, 0.85, 6)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -0.1
  group.add(ring)

  // Barra de vida (fondo rojo)
  const bgGeo = new THREE.PlaneGeometry(1.0, 0.12)
  const bgMat = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    side: THREE.DoubleSide
  })
  const hpBg = new THREE.Mesh(bgGeo, bgMat)
  hpBg.position.set(0, 0.9, 0)
  group.add(hpBg)

  // Barra de vida (relleno verde)
  const fgGeo = new THREE.PlaneGeometry(1.0, 0.12)
  const fgMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide
  })
  const hpFg = new THREE.Mesh(fgGeo, fgMat)
  hpFg.position.set(0, 0.9, 0.01)
  group.add(hpFg)

  const MAX_HP = 10
  let hp = MAX_HP

  function takeDamage(amount) {
    hp = Math.max(0, hp - amount)
    const pct = hp / MAX_HP
    hpFg.scale.x = pct
    hpFg.position.x = -(1 - pct) * 0.5

    // Color de la barra según HP
    if (pct > 0.5) hpFg.material.color.set(0x00ff00)
    else if (pct > 0.25) hpFg.material.color.set(0xffaa00)
    else hpFg.material.color.set(0xff0000)

    // Sacudida visual
    group.position.y += 0.2
    setTimeout(() => { group.position.y -= 0.2 }, 100)

    if (hp <= 0) die()
    return hp
  }

  function die() {
    // Hundir el barco
    onDeath()
    let sinkProgress = 0
    const sink = setInterval(() => {
      sinkProgress += 0.05
      group.position.y -= 0.05
      group.rotation.z = Math.sin(sinkProgress * 5) * 0.3 * (1 - sinkProgress)
      hull.material.color.set(0x1a1a1a)
      if (sinkProgress >= 1) {
        clearInterval(sink)
        scene.remove(group)
      }
    }, 50)
  }

  group.userData = { q, r, selected: false, ring, takeDamage, hp: () => hp }
  group.position.set(0, 0.2, 0)
  scene.add(group)

  return group
}