// Plane Simulation Game
// Phase 1: Foundation - Scene Setup, Plane Model, Camera

(function() {
  'use strict';

  // Game State
  const gameState = {
    isFlying: false,
    isCrashed: false,
    flightTime: 0,
    startTime: null,

    // Plane Physics
    plane: {
      position: { x: 0, y: 50, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      speed: 0,
      throttle: 0, // 0-1
      mass: 1000,
      drag: 0.02,
      lift: 0.08,
    },

    // Input
    keys: {},
    gameOverText: null,
  };

  // Initialize Game
  function init() {
    const canvas = document.getElementById('gameCanvas');
    const engine = new BABYLON.Engine(canvas, true);

    const scene = createScene(engine, canvas);
    setupLighting(scene);
    createGround(scene);
    const planeMesh = createPlaneMesh(scene);

    // Setup game physics and controls
    setupPhysics(scene, planeMesh);
    setupControls();

    // Game loop
    engine.runRenderLoop(() => {
      updateGame(planeMesh);
      updateHUD();
      scene.render();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      engine.resize();
    });

    // Store references for easy access
    gameState.engine = engine;
    gameState.scene = scene;
    gameState.planeMesh = planeMesh;
  }

  // Create Scene
  function createScene(engine, canvas) {
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    scene.gravity = new BABYLON.Vector3(0, -0.015, 0); // Reduced gravity for flight

    // Camera - Follow behind the plane
    const camera = new BABYLON.UniversalCamera('camera', new BABYLON.Vector3(0, 60, -80));
    camera.attachControl(canvas, true);
    camera.inertia = 0.7;
    camera.angularSensibility = 1000;

    // Fog for atmosphere
    scene.fogEnabled = true;
    scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    scene.fogStart = 100;
    scene.fogEnd = 2000;
    scene.fogColor = new BABYLON.Color3(0.9, 0.9, 0.95);

    return scene;
  }

  // Setup Lighting
  function setupLighting(scene) {
    // Directional Light (Sun)
    const light = new BABYLON.DirectionalLight('sunlight', new BABYLON.Vector3(1, 1, 1));
    light.intensity = 1;
    light.position = new BABYLON.Vector3(100, 100, 100);
    light.range = 5000;

    // Ambient Light
    const ambientLight = new BABYLON.HemisphericLight('ambientLight', new BABYLON.Vector3(0, 1, 0));
    ambientLight.intensity = 0.6;
  }

  // Create Ground
  function createGround(scene) {
    const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
    groundMaterial.diffuse = new BABYLON.Color3(0.2, 0.8, 0.2);
    groundMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.5, 0.1);

    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 5000, height: 5000 }, scene);
    ground.material = groundMaterial;
    ground.checkCollisions = true;
    ground.position.y = 0;

    return ground;
  }

  // Create Plane Mesh
  function createPlaneMesh(scene) {
    // Create a simple plane model from primitives
    const planeGroup = new BABYLON.TransformNode('planeGroup', scene);
    planeGroup.position = gameState.plane.position;

    // Fuselage (main body)
    const fuselage = BABYLON.MeshBuilder.CreateCylinder('fuselage', { height: 15, diameter: 2, tessellation: 8 }, scene);
    fuselage.parent = planeGroup;
    const fuselageMat = new BABYLON.StandardMaterial('fuselageMat', scene);
    fuselageMat.diffuse = new BABYLON.Color3(0.8, 0.2, 0.2);
    fuselage.material = fuselageMat;
    fuselage.rotation.z = Math.PI / 2;

    // Wings
    const wing = BABYLON.MeshBuilder.CreateBox('wing', { width: 30, height: 1, depth: 3 }, scene);
    wing.parent = planeGroup;
    const wingMat = new BABYLON.StandardMaterial('wingMat', scene);
    wingMat.diffuse = new BABYLON.Color3(0.8, 0.2, 0.2);
    wing.material = wingMat;
    wing.position.y = 0;

    // Tail fin
    const tail = BABYLON.MeshBuilder.CreateBox('tail', { width: 2, height: 8, depth: 2 }, scene);
    tail.parent = planeGroup;
    const tailMat = new BABYLON.StandardMaterial('tailMat', scene);
    tailMat.diffuse = new BABYLON.Color3(0.6, 0.2, 0.2);
    tail.material = tailMat;
    tail.position.z = -7;
    tail.position.y = 1;

    // Cockpit
    const cockpit = BABYLON.MeshBuilder.CreateSphere('cockpit', { diameter: 2.5 }, scene);
    cockpit.parent = planeGroup;
    const cockpitMat = new BABYLON.StandardMaterial('cockpitMat', scene);
    cockpitMat.diffuse = new BABYLON.Color3(0.3, 0.3, 0.3);
    cockpitMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    cockpit.material = cockpitMat;
    cockpit.position.x = 5;
    cockpit.position.y = 1.5;

    planeGroup.checkCollisions = true;

    return planeGroup;
  }

  // Setup Physics
  function setupPhysics(scene, planeMesh) {
    // Create a shadow generator for better visuals
    const light = scene.lights[0];
    const shadowGenerator = new BABYLON.ShadowGenerator(2048, light);
    shadowGenerator.addShadowCaster(planeMesh);
    shadowGenerator.useBlurExponentialShadowMap = true;
  }

  // Setup Controls
  function setupControls() {
    document.addEventListener('keydown', (e) => {
      gameState.keys[e.key.toLowerCase()] = true;
      if (e.key === 'r' || e.key === 'R') {
        if (gameState.isCrashed) {
          restartGame();
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      gameState.keys[e.key.toLowerCase()] = false;
    });
  }

  // Update Game Physics
  function updateGame(planeMesh) {
    if (gameState.isCrashed) return;

    if (!gameState.isFlying) {
      gameState.isFlying = true;
      gameState.startTime = Date.now();
    }

    // Update flight time
    gameState.flightTime = Math.floor((Date.now() - gameState.startTime) / 1000);

    // Handle input
    handleInput();

    // Apply physics
    updatePlanePhysics();

    // Update plane mesh position and rotation
    planeMesh.position = new BABYLON.Vector3(
      gameState.plane.position.x,
      gameState.plane.position.y,
      gameState.plane.position.z
    );
    planeMesh.rotation = new BABYLON.Vector3(
      gameState.plane.rotation.x,
      gameState.plane.rotation.y,
      gameState.plane.rotation.z
    );

    // Update camera to follow plane
    updateCamera();

    // Check collisions
    checkCollisions();
  }

  // Handle Player Input
  function handleInput() {
    const keys = gameState.keys;

    // Throttle control
    if (keys[' '] || keys['w'] || keys['arrowup']) {
      gameState.plane.throttle = Math.min(1, gameState.plane.throttle + 0.02);
    }
    if (keys['shift'] || keys['s'] || keys['arrowdown']) {
      gameState.plane.throttle = Math.max(0, gameState.plane.throttle - 0.02);
    }

    // Pitch control (up/down rotation)
    if (keys['arrowup'] || keys['w']) {
      gameState.plane.rotation.x = Math.max(gameState.plane.rotation.x - 0.05, -Math.PI / 3);
    }
    if (keys['arrowdown'] || keys['s']) {
      gameState.plane.rotation.x = Math.min(gameState.plane.rotation.x + 0.05, Math.PI / 3);
    }

    // Roll control (left/right rotation)
    if (keys['arrowleft'] || keys['a']) {
      gameState.plane.rotation.z = Math.min(gameState.plane.rotation.z + 0.05, Math.PI / 4);
    }
    if (keys['arrowright'] || keys['d']) {
      gameState.plane.rotation.z = Math.max(gameState.plane.rotation.z - 0.05, -Math.PI / 4);
    }

    // Gradually return to neutral rotation when no input
    gameState.plane.rotation.x *= 0.95;
    gameState.plane.rotation.z *= 0.95;
  }

  // Update Plane Physics
  function updatePlanePhysics() {
    const p = gameState.plane;

    // Calculate speed based on throttle
    const maxSpeed = 1.5;
    p.speed = p.throttle * maxSpeed;

    // Calculate forward direction based on rotation
    const cos = Math.cos(p.rotation.y);
    const sin = Math.sin(p.rotation.y);
    const pitchCos = Math.cos(p.rotation.x);
    const pitchSin = Math.sin(p.rotation.x);

    // Velocity (forward direction)
    p.velocity.x = sin * cos * p.speed * pitchCos;
    p.velocity.z = cos * cos * p.speed * pitchCos;
    p.velocity.y += pitchSin * p.speed * 0.3; // Vertical component based on pitch

    // Apply drag
    p.velocity.y *= (1 - p.drag);
    p.velocity.x *= (1 - p.drag * 0.5);
    p.velocity.z *= (1 - p.drag * 0.5);

    // Apply lift (higher speed = more lift to counteract gravity)
    const liftForce = p.speed * p.lift;
    if (p.speed > 0.2) {
      p.velocity.y += liftForce;
    }

    // Apply gravity
    p.velocity.y -= 0.01;

    // Update position
    p.position.x += p.velocity.x;
    p.position.y += p.velocity.y;
    p.position.z += p.velocity.z;

    // Handle heading rotation (continuous yaw)
    if (gameState.keys['q']) {
      p.rotation.y -= 0.05;
    }
    if (gameState.keys['e']) {
      p.rotation.y += 0.05;
    }
  }

  // Update Camera
  function updateCamera() {
    const scene = gameState.scene;
    const camera = scene.cameras[0];
    const p = gameState.plane.position;

    // Calculate camera position behind and above the plane
    const distance = 80;
    const height = 40;
    const rotY = gameState.plane.rotation.y;

    const cameraX = p.x - Math.sin(rotY) * distance;
    const cameraY = p.y + height;
    const cameraZ = p.z - Math.cos(rotY) * distance;

    // Smooth camera movement
    camera.position = BABYLON.Vector3.Lerp(
      camera.position,
      new BABYLON.Vector3(cameraX, cameraY, cameraZ),
      0.1
    );

    // Look at a point ahead of the plane
    const lookAheadX = p.x + Math.sin(rotY) * 50;
    const lookAheadZ = p.z + Math.cos(rotY) * 50;
    const lookTarget = new BABYLON.Vector3(lookAheadX, p.y + 10, lookAheadZ);

    camera.setTarget(
      BABYLON.Vector3.Lerp(camera.getTarget(), lookTarget, 0.05)
    );
  }

  // Check Collisions
  function checkCollisions() {
    const p = gameState.plane;

    if (p.position.y <= 1) {
      // Crashed into ground
      gameState.isCrashed = true;
      gameState.planeMesh.position.y = 1;
      displayGameOver();
    }
  }

  // Display Game Over Message
  function displayGameOver() {
    const gameOverText = document.getElementById('gameOverText');
    gameOverText.style.display = 'block';
  }

  // Restart Game
  function restartGame() {
    gameState.isFlying = false;
    gameState.isCrashed = false;
    gameState.flightTime = 0;
    gameState.startTime = null;

    gameState.plane.position = { x: 0, y: 50, z: 0 };
    gameState.plane.velocity = { x: 0, y: 0, z: 0 };
    gameState.plane.rotation = { x: 0, y: 0, z: 0 };
    gameState.plane.speed = 0;
    gameState.plane.throttle = 0;

    document.getElementById('gameOverText').style.display = 'none';
  }

  // Update HUD
  function updateHUD() {
    const p = gameState.plane;

    document.getElementById('altitude').textContent = Math.max(0, Math.floor(p.position.y)) + 'm';
    document.getElementById('speed').textContent = Math.floor(p.speed * 500) + ' km/h';
    document.getElementById('heading').textContent = Math.round((p.rotation.y * 180) / Math.PI) + '°';
    document.getElementById('flightTime').textContent = gameState.flightTime + 's';
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
