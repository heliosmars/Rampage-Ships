import * as THREE from 'three'

export function fireProjectile(scene, from, to, onImpact) {
  const geo = new THREE.SphereGeometry(0.12, 8, 8)
  const mat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200 })
  const ball = new THREE.Mesh(geo, mat)
  ball.position.set(from.x, from.y, from.z)
  scene.add(ball)

  const duration = 1.2 // segundos
  const height = 4     // altura máxima del arco
  let elapsed = 0

  function update(dt) {
    elapsed += dt
    const t = Math.min(elapsed / duration, 1)

    // Interpolación lineal en X y Z
    ball.position.x = from.x + (to.x - from.x) * t
    ball.position.z = from.z + (to.z - from.z) * t

    // Arco parabólico en Y
    ball.position.y = from.y + (to.y - from.y) * t + height * Math.sin(Math.PI * t)

    if (t >= 1) {
      scene.remove(ball)
      if (onImpact) onImpact(to)
      return false // detener
    }
    return true // continuar
  }

  return update
}