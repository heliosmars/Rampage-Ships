import * as THREE from "three";
import { createShip } from "./ship.js";
import { fireProjectile } from "./projectile.js";
import { createTrajectory } from "./trajectory.js";
import { createExplosion } from "./explosion.js";
import { createTurnSystem } from "./turns.js";
import { createHUD } from "./hud.js";

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
  const tileMap = {};

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
      tileMap[`${q},${r}`] = hex;
    }
  }
  return { tiles, tileMap };
}

function getNeighbors(q, r, radius = 2) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ];
  const result = [];
  for (let step = 1; step <= radius; step++) {
    dirs.forEach(([dq, dr]) => {
      result.push({ q: q + dq * step, r: r + dr * step });
    });
  }
  return result;
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

  const { tiles, tileMap } = buildGrid(scene);

  // Barco placeholder en el centro
  const hud = createHUD();

  const ship1 = createShip(scene, 0, 0, () => {
    trajectory.hide();
  });
  const ship2 = createShip(scene, 3, -3, () => {
    trajectory.hide();
  });
  ship2.children[0].material.color.set(0x8b0000); // casco rojo para jugador 2
  ship2.children[1].material.color.set(0x6b0000);

  const { x: x2, z: z2 } = hexToWorld(3, -3);
  ship2.position.set(x2, 0.2, z2);

  const turns = createTurnSystem([ship1, ship2], (idx, actions) => {
    hud.update(idx, actions);
  });

  hud.update(0, turns.getActions());

  const ship = ship1; // mantener compatibilidad con código existente);

  window.addEventListener("resize", () => {
    const a = window.innerWidth / window.innerHeight;
    camera.left = -zoom * a;
    camera.right = zoom * a;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  const projectiles = [];
  const trajectory = createTrajectory(scene);
  const explosions = [];

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let highlighted = [];

  function clearHighlights() {
    highlighted.forEach((t) => {
      t.children[0].material.color.set(0x1a6fa8);
    });
    highlighted = [];
  }

  function highlightMoves(q, r) {
    clearHighlights();
    const neighbors = getNeighbors(q, r, 2);
    neighbors.forEach(({ q: nq, r: nr }) => {
      const tile = tileMap[`${nq},${nr}`];
      if (tile) {
        tile.children[0].material.color.set(0x27ae60);
        highlighted.push(tile);
      }
    });
  }

  window.addEventListener("click", (e) => {
    const active = turns.currentShip();
    if (!active.parent) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Click en barco
    const shipHits = raycaster.intersectObjects(active.children, true);
    if (shipHits.length > 0) {
      active.userData.selected = !active.userData.selected;
      active.userData.ring.material.opacity = active.userData.selected
        ? 0.8
        : 0;
      if (active.userData.selected) {
        highlightMoves(active.userData.q, active.userData.r);
      } else {
        clearHighlights();
      }
      return;
    }

    // Click en tile resaltado — mover barco
    if (active.userData.selected && turns.getActions().move > 0) {
      const tileHits = raycaster.intersectObjects(
        highlighted.map((t) => t.children[0]),
        true,
      );
      if (tileHits.length > 0) {
        const tile = tileHits[0].object.parent;
        const { q, r } = tile.userData;
        const { x, z } = hexToWorld(q, r);
        active.userData.q = q;
        active.userData.r = r;
        active.position.x = x;
        active.position.z = z;
        active.userData.selected = false;
        active.userData.ring.material.opacity = 0;
        clearHighlights();
        turns.useAction("move");
        hud.update(turns.currentShip() === ship1 ? 0 : 1, turns.getActions());
      }
    }
  });

  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const active = turns.currentShip();
    if (!active.parent) return; // barco muerto
    if (turns.getActions().shoot <= 0) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const allTiles = tiles.map((t) => t.children[0]);
    const hits = raycaster.intersectObjects(allTiles, true);
    if (hits.length > 0) {
      const from = {
        x: active.position.x,
        y: active.position.y + 0.3,
        z: active.position.z,
      };
      const to = {
        x: hits[0].point.x,
        y: 0.2,
        z: hits[0].point.z,
      };
      const updater = fireProjectile(scene, from, to, (pos) => {
        // Daño al barco enemigo
        const enemy = active === ship1 ? ship2 : ship1;
        // Detectar si impactó cerca del barco enemigo
        const dx = pos.x - enemy.position.x;
        const dz = pos.z - enemy.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
          enemy.userData.takeDamage(3);
        }
        const exp = createExplosion(scene, pos);
        explosions.push(exp);
      });
      projectiles.push(updater);
      trajectory.hide();
      turns.useAction("shoot");
      hud.update(turns.currentShip() === ship1 ? 0 : 1, turns.getActions());
    }
  });

  window.addEventListener("mousemove", (e) => {
    const active = turns.currentShip();

    if (!active.parent) {
      trajectory.hide();
      return;
    }
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const allTiles = tiles.map((t) => t.children[0]);
    const hits = raycaster.intersectObjects(allTiles, true);
    if (hits.length > 0) {
      const from = {
        x: active.position.x,
        y: active.position.y + 0.3,
        z: active.position.z,
      };
      const to = {
        x: hits[0].point.x,
        y: 0.2,
        z: hits[0].point.z,
      };
      trajectory.update(from, to);
    } else {
      trajectory.hide();
    }
  });

  let totalTime = 0;
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    totalTime += dt;

    tiles.forEach((tile) => {
      const { q, r } = tile.userData;
      const wave = Math.sin(totalTime * 1.5 + q * 0.8 + r * 0.8) * 0.08;
      tile.position.y = wave;
    });

    // Barco flota con la ola del tile central
    const wave = Math.sin(totalTime * 1.5) * 0.08;
    ship.position.y = 0.2 + wave;
    ship.rotation.z = Math.sin(totalTime * 1.5) * 0.03;
    ship.rotation.x = Math.sin(totalTime * 1.2) * 0.02;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const alive = projectiles[i](dt);
      if (!alive) projectiles.splice(i, 1);
    }
    for (let i = explosions.length - 1; i >= 0; i--) {
      const alive = explosions[i](dt);
      if (!alive) explosions.splice(i, 1);
    }

    renderer.render(scene, camera);
  }
  animate();
}
