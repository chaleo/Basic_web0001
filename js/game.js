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
    maxAltitude: 0,
    score: 0,

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
      isStalled: false,
    },

    // Input
    keys: {},
    gameOverText: null,
    cameraMode: 'chase', // 'chase' or 'cockpit'

    // Audio
    audioContext: null,
  };

  // Audio Functions (Web Audio API)
  function initAudio() {
    if (!gameState.audioContext) {
      gameState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playSound(frequency, duration, type = 'sine') {
    if (!gameState.audioContext) return;

    const ctx = gameState.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = frequency;
    osc.type = type;

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function playCheckpointSound() {
    if (!gameState.audioContext) return;
    // Play ascending tone for checkpoint
    playSound(600, 0.1, 'sine');
    setTimeout(() => playSound(800, 0.1, 'sine'), 100);
  }

  function playCrashSound() {
    if (!gameState.audioContext) return;
    // Play low descending tone for crash
    playSound(200, 0.3, 'sine');
    setTimeout(() => playSound(100, 0.2, 'sine'), 150);
  }

  // Initialize Game
  function init() {
    const canvas = document.getElementById('gameCanvas');
    const engine = new BABYLON.Engine(canvas, true);

    // Initialize audio
    initAudio();

    const scene = createScene(engine, canvas);
    setupLighting(scene);
    createGround(scene);
    const planeMesh = createPlaneMesh(scene);

    // Setup game physics and controls
    setupPhysics(scene, planeMesh);
    setupControls();
    createCheckpoints(scene);

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

  // Create Checkpoints (rings to fly through)
  function createCheckpoints(scene) {
    gameState.checkpoints = [];

    const checkpointPositions = [
      { x: 200, y: 100, z: 0 },
      { x: 400, y: 150, z: -200 },
      { x: 200, y: 200, z: -400 },
      { x: -200, y: 150, z: -200 },
      { x: -400, y: 100, z: 0 },
      { x: -200, y: 180, z: 300 },
    ];

    checkpointPositions.forEach((pos, index) => {
      const ringMaterial = new BABYLON.StandardMaterial('ringMat' + index, scene);
      ringMaterial.diffuse = new BABYLON.Color3(0.2, 1, 0.2);
      ringMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.8, 0.1);
      ringMaterial.alpha = 0.9;

      // Create ring using torus
      const ring = BABYLON.MeshBuilder.CreateTorus('ring' + index, { diameter: 60, thickness: 3 }, scene);
      ring.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
      ring.material = ringMaterial;

      gameState.checkpoints.push({
        mesh: ring,
        position: pos,
        passed: false,
        radius: 35,
      });
    });
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
    const light = new BABYLON.DirectionalLight('sunlight', new BABYLON.Vector3(0.5, 1, 0.5));
    light.intensity = 1.2;
    light.position = new BABYLON.Vector3(200, 200, 200);
    light.range = 8000;

    // Ambient Light
    const ambientLight = new BABYLON.HemisphericLight('ambientLight', new BABYLON.Vector3(0, 1, 0));
    ambientLight.intensity = 0.7;
    ambientLight.diffuse = new BABYLON.Color3(0.8, 0.9, 1);
    ambientLight.specular = new BABYLON.Color3(0.5, 0.5, 0.5);

    // Create skybox
    createSkybox(scene);
  }

  // Create Skybox
  function createSkybox(scene) {
    const skybox = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 3000 }, scene);

    const skyboxMaterial = new BABYLON.StandardMaterial('skybox', scene);
    skyboxMaterial.emissiveColor = new BABYLON.Color3(0.7, 0.85, 1);
    skyboxMaterial.backFaceCulling = false;

    skybox.material = skyboxMaterial;
    skybox.infiniteDistance = true;
  }

  // Create Ground
  function createGround(scene) {
    const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
    groundMaterial.diffuse = new BABYLON.Color3(0.2, 0.8, 0.2);
    groundMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.5, 0.1);
    groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    // Create ground with more subdivisions for better collision
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 5000, height: 5000, subdivisions: 50 }, scene);
    ground.material = groundMaterial;
    ground.checkCollisions = true;
    ground.position.y = 0;

    // Add some visual terrain variation
    const heightMap = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (heightMap) {
      for (let i = 0; i < heightMap.length; i += 3) {
        // Add subtle rolling hills
        const x = heightMap[i];
        const z = heightMap[i + 2];
        const noise = Math.sin(x * 0.01) * Math.cos(z * 0.01) * 2;
        heightMap[i + 1] = noise;
      }
      ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, heightMap);
    }

    return ground;
  }

  // Create Plane Mesh
  function createPlaneMesh(scene) {
    // Create a simple plane model from primitives
    const planeGroup = new BABYLON.TransformNode('planeGroup', scene);
    planeGroup.position = gameState.plane.position;

    // Fuselage (main body)
    const fuselage = BABYLON.MeshBuilder.CreateCylinder('fuselage', { height: 15, diameter: 2, tessellation: 12 }, scene);
    fuselage.parent = planeGroup;
    const fuselageMat = new BABYLON.StandardMaterial('fuselageMat', scene);
    fuselageMat.diffuse = new BABYLON.Color3(0.9, 0.1, 0.1);
    fuselageMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    fuselageMat.emissiveColor = new BABYLON.Color3(0.2, 0, 0);
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

      const key = e.key.toLowerCase();
      if (key === 'r') {
        if (gameState.isCrashed) {
          restartGame();
        }
      } else if (key === 'c') {
        // Toggle camera mode
        gameState.cameraMode = gameState.cameraMode === 'chase' ? 'cockpit' : 'chase';
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

    // Track max altitude
    gameState.maxAltitude = Math.max(gameState.maxAltitude, gameState.plane.position.y);

    // Calculate score (altitude + time)
    gameState.score = Math.floor(gameState.maxAltitude * 10 + gameState.flightTime * 5);

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

    // Check checkpoint passages
    checkCheckpoints();
  }

  // Handle Player Input
  function handleInput() {
    const keys = gameState.keys;
    const p = gameState.plane;

    // Throttle control - smoother acceleration/deceleration
    if (keys[' ']) {
      p.throttle = Math.min(1, p.throttle + 0.03);
    } else if (keys['shift']) {
      p.throttle = Math.max(0, p.throttle - 0.03);
    }

    // Pitch control (up/down rotation)
    const pitchSensitivity = 0.04;
    const maxPitch = Math.PI / 2.5;
    let pitchInput = 0;

    if (keys['arrowup'] || keys['w']) {
      pitchInput -= pitchSensitivity;
    }
    if (keys['arrowdown'] || keys['s']) {
      pitchInput += pitchSensitivity;
    }

    // Apply pitch with smoothing
    p.rotation.x = BABYLON.Scalar.Clamp(p.rotation.x + pitchInput, -maxPitch, maxPitch);

    // Roll control (left/right rotation)
    const rollSensitivity = 0.04;
    const maxRoll = Math.PI / 3;
    let rollInput = 0;

    if (keys['arrowleft'] || keys['a']) {
      rollInput += rollSensitivity;
    }
    if (keys['arrowright'] || keys['d']) {
      rollInput -= rollSensitivity;
    }

    // Apply roll with smoothing
    p.rotation.z = BABYLON.Scalar.Clamp(p.rotation.z + rollInput, -maxRoll, maxRoll);

    // Gradually return to neutral rotation when no input
    p.rotation.x *= 0.92;
    p.rotation.z *= 0.92;

    // Yaw control
    const yawSensitivity = 0.03;
    if (keys['q']) {
      p.rotation.y -= yawSensitivity;
    }
    if (keys['e']) {
      p.rotation.y += yawSensitivity;
    }
  }

  // Update Plane Physics
  function updatePlanePhysics() {
    const p = gameState.plane;
    const minStallSpeed = 0.15;

    // Calculate speed based on throttle with acceleration curve
    const maxSpeed = 1.5;
    const targetSpeed = p.throttle * maxSpeed;
    p.speed = BABYLON.Scalar.Lerp(p.speed, targetSpeed, 0.1);

    // Stall mechanics - too slow = loss of lift and control
    const isStalled = p.speed < minStallSpeed && p.rotation.x > 0.2;

    // Calculate forward direction based on rotation
    const cos = Math.cos(p.rotation.y);
    const sin = Math.sin(p.rotation.y);
    const pitchCos = Math.cos(p.rotation.x);
    const pitchSin = Math.sin(p.rotation.x);

    // Velocity (forward direction)
    const forwardMultiplier = isStalled ? 0.3 : 1;
    p.velocity.x = sin * cos * p.speed * pitchCos * forwardMultiplier;
    p.velocity.z = cos * cos * p.speed * pitchCos * forwardMultiplier;

    // Vertical component based on pitch - more sensitive
    const verticalComponent = isStalled ? pitchSin * 0.1 : pitchSin * p.speed * 0.4;
    p.velocity.y += verticalComponent;

    // Apply drag (speed dependent)
    const speedDrag = p.speed * 0.01;
    p.velocity.y *= (1 - p.drag - speedDrag);
    p.velocity.x *= (1 - p.drag * 0.3 - speedDrag * 0.5);
    p.velocity.z *= (1 - p.drag * 0.3 - speedDrag * 0.5);

    // Apply lift (higher speed = more lift to counteract gravity)
    const liftForce = p.speed * p.lift;
    if (p.speed > minStallSpeed) {
      p.velocity.y += liftForce;
    } else if (!isStalled) {
      // Minimal lift when slow but not stalled
      p.velocity.y += liftForce * 0.3;
    }

    // Apply gravity
    const gravityForce = isStalled ? 0.015 : 0.01;
    p.velocity.y -= gravityForce;

    // Terminal velocity limit
    p.velocity.y = Math.max(p.velocity.y, -0.5);

    // Update position
    p.position.x += p.velocity.x;
    p.position.y += p.velocity.y;
    p.position.z += p.velocity.z;

    // Store stall state for HUD
    gameState.plane.isStalled = isStalled;
  }

  // Update Camera
  function updateCamera() {
    const scene = gameState.scene;
    const camera = scene.cameras[0];
    const p = gameState.plane.position;
    const rotY = gameState.plane.rotation.y;

    if (gameState.cameraMode === 'cockpit') {
      // Cockpit view - from inside the plane
      const cockpitX = p.x + Math.sin(rotY) * 3;
      const cockpitY = p.y + 2;
      const cockpitZ = p.z + Math.cos(rotY) * 3;

      camera.position = BABYLON.Vector3.Lerp(
        camera.position,
        new BABYLON.Vector3(cockpitX, cockpitY, cockpitZ),
        0.2
      );

      // Look ahead in flight direction
      const lookAheadX = p.x + Math.sin(rotY) * 100;
      const lookAheadZ = p.z + Math.cos(rotY) * 100;
      const lookTarget = new BABYLON.Vector3(
        lookAheadX,
        p.y + Math.sin(gameState.plane.rotation.x) * 50,
        lookAheadZ
      );

      camera.setTarget(
        BABYLON.Vector3.Lerp(camera.getTarget(), lookTarget, 0.1)
      );
    } else {
      // Chase camera view - behind and above the plane
      const distance = 80;
      const height = 40;

      const cameraX = p.x - Math.sin(rotY) * distance;
      const cameraY = p.y + height;
      const cameraZ = p.z - Math.cos(rotY) * distance;

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
  }

  // Check Checkpoints
  function checkCheckpoints() {
    if (!gameState.checkpoints) return;

    const p = gameState.plane.position;

    gameState.checkpoints.forEach((checkpoint) => {
      if (checkpoint.passed) return; // Already passed this checkpoint

      const dist = Math.sqrt(
        (p.x - checkpoint.position.x) ** 2 +
        (p.y - checkpoint.position.y) ** 2 +
        (p.z - checkpoint.position.z) ** 2
      );

      if (dist < checkpoint.radius) {
        // Checkpoint passed!
        checkpoint.passed = true;
        checkpoint.mesh.material.emissiveColor = new BABYLON.Color3(1, 1, 0); // Yellow
        gameState.score += 500; // Bonus for passing checkpoint
        playCheckpointSound();
      }
    });
  }

  // Check Collisions
  function checkCollisions() {
    const p = gameState.plane;
    const groundLevel = 0.5;

    // Crash if hitting ground
    if (p.position.y <= groundLevel) {
      // Check velocity to avoid bouncing
      if (p.velocity.y < -0.1) {
        gameState.isCrashed = true;
        gameState.planeMesh.position.y = groundLevel;
        displayGameOver();
        playCrashSound();
      } else {
        // Soft landing - just touch ground gently
        p.position.y = groundLevel;
        p.velocity.y = 0;
      }
    }

    // Keep plane within reasonable bounds (prevent flying too far away)
    const maxDistance = 2500;
    const distance = Math.sqrt(p.position.x ** 2 + p.position.z ** 2);
    if (distance > maxDistance) {
      const angle = Math.atan2(p.position.z, p.position.x);
      p.position.x = Math.cos(angle) * maxDistance;
      p.position.z = Math.sin(angle) * maxDistance;
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
    gameState.maxAltitude = 0;
    gameState.score = 0;

    gameState.plane.position = { x: 0, y: 50, z: 0 };
    gameState.plane.velocity = { x: 0, y: 0, z: 0 };
    gameState.plane.rotation = { x: 0, y: 0, z: 0 };
    gameState.plane.speed = 0;
    gameState.plane.throttle = 0;
    gameState.plane.isStalled = false;

    // Reset checkpoints
    if (gameState.checkpoints) {
      gameState.checkpoints.forEach((checkpoint) => {
        checkpoint.passed = false;
        checkpoint.mesh.material.emissiveColor = new BABYLON.Color3(0.1, 0.8, 0.1); // Green
      });
    }

    document.getElementById('gameOverText').style.display = 'none';
  }

  // Update HUD
  function updateHUD() {
    const p = gameState.plane;
    const speedKmh = Math.floor(p.speed * 500);
    const altitudeM = Math.max(0, Math.floor(p.position.y));

    // Update altitude
    const altEl = document.getElementById('altitude');
    altEl.textContent = altitudeM + 'm';

    // Update speed with visual warning
    let speedText = speedKmh + ' km/h';
    const speedEl = document.getElementById('speed');
    if (p.isStalled) {
      speedText = speedKmh + ' km/h ⚠️ STALL';
      speedEl.style.color = '#ff4444';
    } else if (p.speed < 0.25) {
      speedEl.style.color = '#ffaa00'; // Orange for low speed
    } else {
      speedEl.style.color = '#00ff00'; // Green for normal speed
    }
    speedEl.textContent = speedText;

    document.getElementById('heading').textContent = Math.round((p.rotation.y * 180) / Math.PI) + '°';
    document.getElementById('flightTime').textContent = gameState.flightTime + 's';
    document.getElementById('score').textContent = gameState.score;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
