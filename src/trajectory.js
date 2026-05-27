import * as THREE from 'three'

export function createTrajectory(scene) {
  const points = []
  for (let i = 0; i <= 20; i++) points.push(new THREE.Vector3())

  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const mat = new THREE.LineDashedMaterial({
    color: 0xffff00,
    dashSize: 0.2,
    gapSize: 0.15,
    transparent: true,
    opacity: 0.7
  })

  const line = new THREE.Line(geo, mat)
  line.computeLineDistances()
  line.visible = false
  scene.add(line)

  function update(from, to) {
    const height = 4
    const pts = []
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const x = from.x + (to.x - from.x) * t
      const z = from.z + (to.z - from.z) * t
      const y = from.y + (to.y - from.y) * t + height * Math.sin(Math.PI * t)
      pts.push(new THREE.Vector3(x, y, z))
    }
    line.geometry.setFromPoints(pts)
    line.computeLineDistances()
    line.visible = true
  }

  function hide() {
    line.visible = false
  }

  return { update, hide }
}