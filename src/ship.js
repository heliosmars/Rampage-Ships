import * as THREE from "three";

export function createShip(scene) {
  const group = new THREE.Group();

  // Casco
  const hullGeo = new THREE.BoxGeometry(0.6, 0.25, 1.4);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  group.add(hull);

  // Superestructura
  const superGeo = new THREE.BoxGeometry(0.35, 0.25, 0.5);
  const superMat = new THREE.MeshStandardMaterial({ color: 0x34495e });
  const superStr = new THREE.Mesh(superGeo, superMat);
  superStr.position.set(0, 0.25, 0.1);
  group.add(superStr);

  // Cañón
  const cannonGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8);
  const cannonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const cannon = new THREE.Mesh(cannonGeo, cannonMat);
  cannon.rotation.z = Math.PI / 2;
  cannon.position.set(0.35, 0.3, 0.1);
  group.add(cannon);

  // Chimenea
  const chimneyGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8);
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
  chimney.position.set(0, 0.42, -0.1);
  group.add(chimney);

  // Selección visual (aro debajo del barco)
  const ringGeo = new THREE.RingGeometry(0.7, 0.85, 6);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.1;
  group.add(ring);

  group.userData = { q: 0, r: 0, selected: false, ring };
  group.position.set(0, 0.2, 0);
  scene.add(group);

  return group;
}
