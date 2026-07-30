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

    // Best score (persisted)
    bestScore: 0,
    allCheckpointsBonusGiven: false,
  };

  // Reusable scratch vectors to avoid per-frame allocations
  const _scratchTarget = new BABYLON.Vector3();
  const _scratchLookTarget = new BABYLON.Vector3();

  // Cached DOM references (populated in init)
  const dom = {};
  const lastHudText = {};

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

    // Cache DOM references once instead of querying every frame
    cacheDomRefs();

    // Load persisted best score
    gameState.bestScore = parseInt(localStorage.getItem('planeGameBestScore') || '0', 10);
    if (dom.bestScore) dom.bestScore.textContent = gameState.bestScore;

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

  // Cache DOM Elements
  function cacheDomRefs() {
    dom.altitude = document.getElementById('altitude');
    dom.speed = document.getElementById('speed');
    dom.heading = document.getElementById('heading');
    dom.flightTime = document.getElementById('flightTime');
    dom.score = document.getElementById('score');
    dom.bestScore = document.getElementById('bestScore');
    dom.fps = document.getElementById('fps');
    dom.gameOverText = document.getElementById('gameOverText');
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
      ring.freezeWorldMatrix(); // Static mesh - only spins visually via material, no transform changes

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
    skybox.freezeWorldMatrix(); // Static mesh - skip per-frame matrix recompute
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

    ground.freezeWorldMatrix(); // Static mesh - skip per-frame matrix recompute
    return ground;
  }

  // Create Plane Mesh
  function createPlaneMesh(scene) {
    // Create a simple plane model from primitives.
    // Note: planeGroup.position must be a real BABYLON.Vector3 (not the plain
    // {x,y,z} object in gameState.plane.position) since updateGame() calls
    // .copyFromFloats() on it every frame instead of reallocating.
    const planeGroup = new BABYLON.TransformNode('planeGroup', scene);
    planeGroup.position = new BABYLON.Vector3(
      gameState.plane.position.x,
      gameState.plane.position.y,
      gameState.plane.position.z
    );

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
    // Create a shadow generator for better visuals.
    // planeMesh is a TransformNode (no geometry of its own) - only its actual
    // child meshes can be registered as shadow casters, otherwise Babylon
    // throws "getBoundingInfo is not a function" the first time it renders
    // the shadow map, which silently kills the render loop.
    const light = scene.lights[0];
    const shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
    planeMesh.getChildMeshes().forEach((mesh) => shadowGenerator.addShadowCaster(mesh));
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

    // Frame-rate independent time factor, normalized so 1.0 == 60fps.
    // Clamped to avoid physics jumps after tab throttling/minimizing.
    const rawDelta = gameState.engine ? gameState.engine.getDeltaTime() : 16.67;
    const dt = BABYLON.Scalar.Clamp(rawDelta / (1000 / 60), 0, 3);

    // Update flight time
    gameState.flightTime = Math.floor((Date.now() - gameState.startTime) / 1000);

    // Track max altitude
    gameState.maxAltitude = Math.max(gameState.maxAltitude, gameState.plane.position.y);

    // Calculate score (altitude + time)
    gameState.score = Math.floor(gameState.maxAltitude * 10 + gameState.flightTime * 5);

    // Handle input
    handleInput(dt);

    // Apply physics
    updatePlanePhysics(dt);

    // Update plane mesh position and rotation in place (no per-frame Vector3 allocation)
    planeMesh.position.copyFromFloats(
      gameState.plane.position.x,
      gameState.plane.position.y,
      gameState.plane.position.z
    );
    planeMesh.rotation.copyFromFloats(
      gameState.plane.rotation.x,
      gameState.plane.rotation.y,
      gameState.plane.rotation.z
    );

    // Update camera to follow plane
    updateCamera(dt);

    // Check collisions
    checkCollisions();

    // Check checkpoint passages
    checkCheckpoints();
  }

  // Handle Player Input
  function handleInput(dt) {
    const keys = gameState.keys;
    const p = gameState.plane;

    // Throttle control - smoother acceleration/deceleration
    if (keys[' ']) {
      p.throttle = Math.min(1, p.throttle + 0.03 * dt);
    } else if (keys['shift']) {
      p.throttle = Math.max(0, p.throttle - 0.03 * dt);
    }

    // Pitch control (up/down rotation)
    const pitchSensitivity = 0.04 * dt;
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
    const rollSensitivity = 0.04 * dt;
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

    // Gradually return to neutral rotation when no input (frame-rate independent decay)
    const neutralDecay = Math.pow(0.92, dt);
    p.rotation.x *= neutralDecay;
    p.rotation.z *= neutralDecay;

    // Yaw control
    const yawSensitivity = 0.03 * dt;
    if (keys['q']) {
      p.rotation.y -= yawSensitivity;
    }
    if (keys['e']) {
      p.rotation.y += yawSensitivity;
    }
  }

  // Update Plane Physics
  function updatePlanePhysics(dt) {
    const p = gameState.plane;
    const minStallSpeed = 0.15;

    // Calculate speed based on throttle with acceleration curve
    // (exponential smoothing formula keeps the lerp rate consistent regardless of frame rate)
    const maxSpeed = 1.5;
    const targetSpeed = p.throttle * maxSpeed;
    const speedLerpFactor = 1 - Math.pow(1 - 0.1, dt);
    p.speed = BABYLON.Scalar.Lerp(p.speed, targetSpeed, speedLerpFactor);

    // Stall mechanics - too slow = loss of lift and control
    const isStalled = p.speed < minStallSpeed && p.rotation.x > 0.2;

    // Calculate forward direction based on rotation
    const cos = Math.cos(p.rotation.y);
    const sin = Math.sin(p.rotation.y);
    const pitchCos = Math.cos(p.rotation.x);
    const pitchSin = Math.sin(p.rotation.x);

    // Velocity (forward direction) - these represent per-60fps-frame displacement,
    // so they get scaled by dt once at the position-integration step below.
    const forwardMultiplier = isStalled ? 0.3 : 1;
    p.velocity.x = sin * cos * p.speed * pitchCos * forwardMultiplier;
    p.velocity.z = cos * cos * p.speed * pitchCos * forwardMultiplier;

    // Vertical component based on pitch - more sensitive
    const verticalComponent = isStalled ? pitchSin * 0.1 : pitchSin * p.speed * 0.4;
    p.velocity.y += verticalComponent * dt;

    // Apply drag (speed dependent, frame-rate independent decay)
    const speedDrag = p.speed * 0.01;
    const dragFactorY = Math.pow(1 - p.drag - speedDrag, dt);
    const dragFactorXZ = Math.pow(1 - p.drag * 0.3 - speedDrag * 0.5, dt);
    p.velocity.y *= dragFactorY;
    p.velocity.x *= dragFactorXZ;
    p.velocity.z *= dragFactorXZ;

    // Apply lift (higher speed = more lift to counteract gravity)
    const liftForce = p.speed * p.lift;
    if (p.speed > minStallSpeed) {
      p.velocity.y += liftForce * dt;
    } else if (!isStalled) {
      // Minimal lift when slow but not stalled
      p.velocity.y += liftForce * 0.3 * dt;
    }

    // Apply gravity
    const gravityForce = isStalled ? 0.015 : 0.01;
    p.velocity.y -= gravityForce * dt;

    // Terminal velocity limit
    p.velocity.y = Math.max(p.velocity.y, -0.5);

    // Update position (velocity.x/z already represent per-frame displacement at 60fps baseline)
    p.position.x += p.velocity.x * dt;
    p.position.y += p.velocity.y * dt;
    p.position.z += p.velocity.z * dt;

    // Store stall state for HUD
    gameState.plane.isStalled = isStalled;
  }

  // Update Camera
  function updateCamera(dt) {
    const scene = gameState.scene;
    const camera = scene.cameras[0];
    const p = gameState.plane.position;
    const rotY = gameState.plane.rotation.y;

    if (gameState.cameraMode === 'cockpit') {
      // Cockpit view - from inside the plane
      _scratchTarget.copyFromFloats(
        p.x + Math.sin(rotY) * 3,
        p.y + 2,
        p.z + Math.cos(rotY) * 3
      );
      BABYLON.Vector3.LerpToRef(camera.position, _scratchTarget, 1 - Math.pow(1 - 0.2, dt), camera.position);

      // Look ahead in flight direction
      _scratchLookTarget.copyFromFloats(
        p.x + Math.sin(rotY) * 100,
        p.y + Math.sin(gameState.plane.rotation.x) * 50,
        p.z + Math.cos(rotY) * 100
      );
      const currentTarget = camera.getTarget();
      BABYLON.Vector3.LerpToRef(currentTarget, _scratchLookTarget, 1 - Math.pow(1 - 0.1, dt), currentTarget);
      camera.setTarget(currentTarget);
    } else {
      // Chase camera view - behind and above the plane
      const distance = 80;
      const height = 40;

      _scratchTarget.copyFromFloats(
        p.x - Math.sin(rotY) * distance,
        p.y + height,
        p.z - Math.cos(rotY) * distance
      );
      BABYLON.Vector3.LerpToRef(camera.position, _scratchTarget, 1 - Math.pow(1 - 0.1, dt), camera.position);

      // Look at a point ahead of the plane
      _scratchLookTarget.copyFromFloats(p.x + Math.sin(rotY) * 50, p.y + 10, p.z + Math.cos(rotY) * 50);
      const currentTarget = camera.getTarget();
      BABYLON.Vector3.LerpToRef(currentTarget, _scratchLookTarget, 1 - Math.pow(1 - 0.05, dt), currentTarget);
      camera.setTarget(currentTarget);
    }
  }

  // Check Checkpoints
  function checkCheckpoints() {
    if (!gameState.checkpoints) return;

    const p = gameState.plane.position;

    let allPassed = true;

    gameState.checkpoints.forEach((checkpoint) => {
      if (checkpoint.passed) return; // Already passed this checkpoint

      allPassed = false;

      // Compare squared distance to avoid a Math.sqrt call per checkpoint per frame
      const distSq =
        (p.x - checkpoint.position.x) ** 2 +
        (p.y - checkpoint.position.y) ** 2 +
        (p.z - checkpoint.position.z) ** 2;

      if (distSq < checkpoint.radius * checkpoint.radius) {
        // Checkpoint passed!
        checkpoint.passed = true;
        checkpoint.mesh.material.emissiveColor = new BABYLON.Color3(1, 1, 0); // Yellow
        gameState.score += 500; // Bonus for passing checkpoint
        playCheckpointSound();
      }
    });

    // All checkpoints cleared - one-time big bonus
    if (allPassed && !gameState.allCheckpointsBonusGiven) {
      gameState.allCheckpointsBonusGiven = true;
      gameState.score += 2000;
      playCheckpointSound();
    }
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
        saveBestScore();
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
    dom.gameOverText.style.display = 'block';
  }

  // Save Best Score to localStorage
  function saveBestScore() {
    if (gameState.score > gameState.bestScore) {
      gameState.bestScore = gameState.score;
      localStorage.setItem('planeGameBestScore', String(gameState.bestScore));
      if (dom.bestScore) dom.bestScore.textContent = gameState.bestScore;
    }
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

    gameState.allCheckpointsBonusGiven = false;

    // Reset checkpoints
    if (gameState.checkpoints) {
      gameState.checkpoints.forEach((checkpoint) => {
        checkpoint.passed = false;
        checkpoint.mesh.material.emissiveColor = new BABYLON.Color3(0.1, 0.8, 0.1); // Green
      });
    }

    dom.gameOverText.style.display = 'none';
  }

  // Set text content only when the value actually changed, to avoid needless
  // DOM writes/reflow on every rendered frame (HUD numbers change slowly).
  function setHudText(key, el, text) {
    if (lastHudText[key] !== text) {
      lastHudText[key] = text;
      el.textContent = text;
    }
  }

  // Update HUD
  function updateHUD() {
    const p = gameState.plane;
    const speedKmh = Math.floor(p.speed * 500);
    const altitudeM = Math.max(0, Math.floor(p.position.y));

    setHudText('altitude', dom.altitude, altitudeM + 'm');

    // Update speed with visual warning
    let speedText = speedKmh + ' km/h';
    let speedColor;
    if (p.isStalled) {
      speedText = speedKmh + ' km/h ⚠️ STALL';
      speedColor = '#ff4444';
    } else if (p.speed < 0.25) {
      speedColor = '#ffaa00'; // Orange for low speed
    } else {
      speedColor = '#00ff00'; // Green for normal speed
    }
    if (lastHudText.speedColor !== speedColor) {
      lastHudText.speedColor = speedColor;
      dom.speed.style.color = speedColor;
    }
    setHudText('speed', dom.speed, speedText);

    setHudText('heading', dom.heading, Math.round((p.rotation.y * 180) / Math.PI) + '°');
    setHudText('flightTime', dom.flightTime, gameState.flightTime + 's');
    setHudText('score', dom.score, String(gameState.score));

    if (dom.fps) {
      setHudText('fps', dom.fps, Math.round(gameState.engine.getFps()) + ' FPS');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
