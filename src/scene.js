import * as THREE from "three";

export function initScene() {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // Escena y fondo
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1628);

  // Cámara isométrica
  const aspect = window.innerWidth / window.innerHeight;
  const zoom = 10;
  const camera = new THREE.OrthographicCamera(
    -zoom * aspect,
    zoom * aspect,
    zoom,
    -zoom,
    0.1,
    1000,
  );

  // Posición isométrica clásica
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);

  // Luz
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(10, 20, 10);
  scene.add(sun);

  // Plano de océano temporal
  const geo = new THREE.PlaneGeometry(20, 20);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a6fa8 });
  const ocean = new THREE.Mesh(geo, mat);
  ocean.rotation.x = -Math.PI / 2;
  scene.add(ocean);

  // Cubo de prueba (representa un barco por ahora)
  const shipGeo = new THREE.BoxGeometry(1, 0.5, 2);
  const shipMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8 });
  const ship = new THREE.Mesh(shipGeo, shipMat);
  ship.position.set(0, 0.25, 0);
  scene.add(ship);

  // Resize
  window.addEventListener("resize", () => {
    const a = window.innerWidth / window.innerHeight;
    camera.left = -zoom * a;
    camera.right = zoom * a;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Loop
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}
