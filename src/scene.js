import * as THREE from "three";
import { createShip } from "./ship.js";

const HEX_SIZE = 1;
const GRID_RADIUS = 5;

function hexToWorld(q, r) {
  const x = HEX_SIZE * ((3 / 2) * q);
  const z = HEX_SIZE * (Math.sqrt(3) * r + (Math.sqrt(3) / 2) * q);
  return { x, z };
}

function createHexMesh(color) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const x = HEX_SIZE * 1 * Math.cos(angle);
    const y = HEX_SIZE * 1 * Math.sin(angle);
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  // Borde del hexágono
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0a3d6b });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  group.add(edges);
  return group;
}

function buildGrid(scene) {
  const tiles = [];
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (Math.abs(q + r) > GRID_RADIUS) continue;
      const { x, z } = hexToWorld(q, r);
      const hex = createHexMesh(0x1a6fa8);
      hex.rotation.x = -Math.PI / 2;
      hex.position.set(x, 0.01, z);
      hex.userData = { q, r, baseY: 0 };
      scene.add(hex);
      tiles.push(hex);
    }
  }
  return tiles;
}

export function initScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1628);

  const aspect = window.innerWidth / window.innerHeight;
  const zoom = 12;
  const camera = new THREE.OrthographicCamera(
    -zoom * aspect,
    zoom * aspect,
    zoom,
    -zoom,
    0.1,
    1000,
  );
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(10, 20, 10);
  scene.add(sun);

  const tiles = buildGrid(scene);

  // Barco placeholder en el centro
  const ship = createShip(scene);

  window.addEventListener("resize", () => {
    const a = window.innerWidth / window.innerHeight;
    camera.left = -zoom * a;
    camera.right = zoom * a;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener("click", (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObjects(ship.children, true);
    if (hits.length > 0) {
      ship.userData.selected = !ship.userData.selected;
      ship.userData.ring.material.opacity = ship.userData.selected ? 0.8 : 0;
    }
  });

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    tiles.forEach((tile) => {
      const { q, r } = tile.userData;
      const wave = Math.sin(t * 1.5 + q * 0.8 + r * 0.8) * 0.08;
      tile.position.y = wave;
    });

    // Barco flota con la ola del tile central
    const wave = Math.sin(t * 1.5) * 0.08;
    ship.position.y = 0.2 + wave;
    ship.rotation.z = Math.sin(t * 1.5) * 0.03;
    ship.rotation.x = Math.sin(t * 1.2) * 0.02;

    renderer.render(scene, camera);
  }
  animate();
}
