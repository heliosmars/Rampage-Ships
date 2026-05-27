import * as THREE from 'three'

export function createExplosion(scene, position) {
  const particles = []
  const count = 30

  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(Math.random() * 0.12 + 0.04, 6, 6)
    const mat = new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? 0xff4400 : 0xffaa00,
      emissive: Math.random() > 0.5 ? 0xff2200 : 0xff6600,
      transparent: true,
      opacity: 1
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(position.x, position.y, position.z)

    // Velocidad aleatoria en todas direcciones
    const speed = Math.random() * 3 + 1
    const angle = Math.random() * Math.PI * 2
    const elevation = Math.random() * Math.PI - Math.PI / 2
    mesh.userData.vel = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elevation) * speed,
      Math.abs(Math.sin(elevation)) * speed + 1,
      Math.sin(angle) * Math.cos(elevation) * speed
    )
    mesh.userData.life = 1.0

    scene.add(mesh)
    particles.push(mesh)
  }

  // Onda de choque (anillo plano)
  const ringGeo = new THREE.RingGeometry(0.1, 0.3, 16)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(position.x, position.y + 0.05, position.z)
  scene.add(ring)

  let alive = true

  function update(dt) {
    if (!alive) return false

    let allDead = true

    particles.forEach(p => {
      if (p.userData.life <= 0) return
      allDead = false

      // Gravedad
      p.userData.vel.y -= 4 * dt
      p.position.addScaledVector(p.userData.vel, dt)

      // Fade out
      p.userData.life -= dt * 1.5
      p.material.opacity = Math.max(0, p.userData.life)

      if (p.userData.life <= 0) scene.remove(p)
    })

    // Expande y desvanece la onda
    ring.scale.x += dt * 8
    ring.scale.y += dt * 8
    ring.material.opacity -= dt * 3
    if (ring.material.opacity <= 0) scene.remove(ring)

    if (allDead) {
      alive = false
      return false
    }
    return true
  }

  return update
}