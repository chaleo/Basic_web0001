// Plane Simulation Game
// Phase 1: Foundation - Scene Setup, Plane Model, Camera

(function() {
  'use strict';

  // Plane types: each is built from the same handful of simple primitives
  // (cylinders/boxes/cones - low tessellation, no imported models) so
  // switching planes never adds real rendering cost. Stat multipliers apply
  // on top of the baseline physics constants in gameState.plane.
  const PLANE_TYPES = {
    sport: {
      name: 'Sport Plane',
      description: 'Small and nimble. Balanced all-rounder.',
      fuselageLength: 15,
      fuselageDiameter: 2,
      bodyColor: new BABYLON.Color3(0.9, 0.1, 0.1),
      accentColor: new BABYLON.Color3(0.6, 0.2, 0.2),
      wingStyle: 'straight',
      wingSpan: 30,
      wingDepth: 3,
      tailHeight: 8,
      noseStyle: 'sphere',
      engineCount: 0,
      stats: { speed: 1, lift: 1, turnRate: 1, drag: 1 },
    },
    boeing747: {
      name: 'Boeing 747',
      description: 'Jumbo jet. Heavy and stable, slow to turn.',
      fuselageLength: 26,
      fuselageDiameter: 3.2,
      bodyColor: new BABYLON.Color3(0.95, 0.95, 0.97),
      accentColor: new BABYLON.Color3(0.15, 0.35, 0.75),
      wingStyle: 'straight',
      wingSpan: 42,
      wingDepth: 4,
      tailHeight: 11,
      noseStyle: 'hump',
      engineCount: 4,
      stats: { speed: 0.85, lift: 1.3, turnRate: 0.55, drag: 1.1 },
    },
    a380: {
      name: 'Airbus A380',
      description: 'The biggest airliner. Huge lift, very slow to turn.',
      fuselageLength: 30,
      fuselageDiameter: 4,
      bodyColor: new BABYLON.Color3(0.95, 0.95, 0.97),
      accentColor: new BABYLON.Color3(0.8, 0.15, 0.15),
      wingStyle: 'straight',
      wingSpan: 48,
      wingDepth: 4.5,
      tailHeight: 12,
      noseStyle: 'sphere',
      engineCount: 4,
      stats: { speed: 0.8, lift: 1.4, turnRate: 0.45, drag: 1.15 },
    },
    concorde: {
      name: 'Concorde',
      description: 'Supersonic needle nose and delta wings. Very fast.',
      fuselageLength: 28,
      fuselageDiameter: 1.4,
      bodyColor: new BABYLON.Color3(0.95, 0.95, 0.97),
      accentColor: new BABYLON.Color3(0.15, 0.15, 0.15),
      wingStyle: 'delta',
      wingSpan: 20,
      wingDepth: 14,
      tailHeight: 9,
      noseStyle: 'cone',
      engineCount: 2,
      stats: { speed: 1.6, lift: 0.7, turnRate: 0.9, drag: 0.85 },
    },
  };
  const DEFAULT_PLANE_TYPE = 'sport';

  // Game State
  const gameState = {
    gameStarted: false, // becomes true once "Start Flight" is clicked
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
      drag: 0.02,
      lift: 0.08,
      isStalled: false,
    },

    // Selected plane type and its stat multipliers (see PLANE_TYPES),
    // applied on top of the baseline constants above.
    selectedPlaneType: DEFAULT_PLANE_TYPE,
    planeStats: PLANE_TYPES[DEFAULT_PLANE_TYPE].stats,

    // Input
    keys: {},
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
    createCheckpoints(scene);

    // The plane mesh itself is created lazily by startFlight() once the
    // player picks a plane and clicks Start - the scene/ground/skybox render
    // in the background behind the main menu in the meantime.
    setupControls();
    setupMenuControls();

    // Game loop
    engine.runRenderLoop(() => {
      updateGame();
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
  }

  // Wire up main menu (plane selection + Start) and crash-screen buttons
  function setupMenuControls() {
    const cards = dom.planeSelect.querySelectorAll('.plane-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        cards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        gameState.selectedPlaneType = card.dataset.plane;
      });
    });

    dom.startFlightBtn.addEventListener('click', () => {
      // Audio contexts often start suspended until a user gesture - Start
      // Flight is one, so make sure sound actually plays.
      if (gameState.audioContext && gameState.audioContext.state === 'suspended') {
        gameState.audioContext.resume();
      }
      startFlight(gameState.selectedPlaneType);
    });

    dom.restartBtn.addEventListener('click', restartGame);
    dom.changePlaneBtn.addEventListener('click', changePlane);
  }

  // Create (or replace) the flyable plane mesh for the given type and begin
  // the flight, hiding the menu and revealing the HUD.
  function startFlight(typeKey) {
    gameState.selectedPlaneType = typeKey;
    gameState.planeStats = (PLANE_TYPES[typeKey] || PLANE_TYPES[DEFAULT_PLANE_TYPE]).stats;

    resetPlaneState();

    if (gameState.planeMesh) {
      gameState.planeMesh.dispose();
    }
    gameState.planeMesh = createPlaneMesh(gameState.scene, typeKey);
    setupPhysics(gameState.scene, gameState.planeMesh);

    dom.mainMenu.classList.add('hidden');
    dom.crashOverlay.style.display = 'none';
    dom.gameHud.classList.remove('hidden');
    dom.controlsHint.classList.remove('hidden');
    dom.fpsCounterBox.classList.remove('hidden');

    gameState.gameStarted = true;
  }

  // Hide the HUD and return to the main menu so the player can pick a
  // different plane; the actual mesh swap happens on the next Start click.
  function changePlane() {
    resetPlaneState();
    gameState.gameStarted = false;

    dom.crashOverlay.style.display = 'none';
    dom.gameHud.classList.add('hidden');
    dom.controlsHint.classList.add('hidden');
    dom.fpsCounterBox.classList.add('hidden');
    dom.mainMenu.classList.remove('hidden');
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
    dom.artificialHorizonCanvas = document.getElementById('artificialHorizonCanvas');

    dom.gameHud = document.getElementById('gameHud');
    dom.controlsHint = document.getElementById('controlsHint');
    dom.fpsCounterBox = document.getElementById('fpsCounter');

    dom.mainMenu = document.getElementById('mainMenu');
    dom.planeSelect = document.getElementById('planeSelect');
    dom.startFlightBtn = document.getElementById('startFlightBtn');

    dom.crashOverlay = document.getElementById('crashOverlay');
    dom.crashScoreLine = document.getElementById('crashScoreLine');
    dom.restartBtn = document.getElementById('restartBtn');
    dom.changePlaneBtn = document.getElementById('changePlaneBtn');
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
      ring.freezeWorldMatrix(); // Static mesh - position/rotation/scaling never change after creation

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

  // Create Skybox with gradient (sky blue above, lighter below for horizon)
  function createSkybox(scene) {
    const skybox = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 3000 }, scene);

    const skyboxMaterial = new BABYLON.StandardMaterial('skybox', scene);
    skyboxMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.75, 1);
    skyboxMaterial.backFaceCulling = false;

    skybox.material = skyboxMaterial;
    skybox.infiniteDistance = true;

    // Create a dynamic gradient texture for better sky appearance
    const skyTexture = new BABYLON.DynamicTexture('skyTexture', 256);
    const ctx = skyTexture.getContext();
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#4da6ff');    // Deep blue at top
    gradient.addColorStop(0.5, '#87ceeb');  // Sky blue middle
    gradient.addColorStop(1, '#e0f6ff');    // Light horizon at bottom
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    skyTexture.update();

    skyboxMaterial.emissiveTexture = skyTexture;
  }

  // Create Ground with water and islands
  function createGround(scene) {
    // Ocean/Water base
    const oceanMaterial = new BABYLON.StandardMaterial('oceanMat', scene);
    oceanMaterial.diffuse = new BABYLON.Color3(0.1, 0.3, 0.6);
    oceanMaterial.emissiveColor = new BABYLON.Color3(0.15, 0.4, 0.7);
    oceanMaterial.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    const ocean = BABYLON.MeshBuilder.CreateGround('ocean', { width: 5000, height: 5000, subdivisions: 20 }, scene);
    ocean.material = oceanMaterial;
    ocean.position.y = 0;

    // Add subtle wave height variation to water
    const oceanHeights = ocean.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (oceanHeights) {
      for (let i = 0; i < oceanHeights.length; i += 3) {
        const x = oceanHeights[i];
        const z = oceanHeights[i + 2];
        const wave = Math.sin(x * 0.002) * Math.cos(z * 0.002) * 0.5;
        oceanHeights[i + 1] = wave;
      }
      ocean.updateVerticesData(BABYLON.VertexBuffer.PositionKind, oceanHeights);
    }
    ocean.freezeWorldMatrix();

    // Island 1 - Northeast
    createIsland(scene, 1200, 200, 800, 250, 'Island 1');

    // Island 2 - Southwest
    createIsland(scene, -1500, 150, -1000, 200, 'Island 2');

    // Island 3 - East
    createIsland(scene, 2000, 120, 500, 180, 'Island 3');

    // Create forests on islands
    createForest(scene, 1200, 200, 800, 30);
    createForest(scene, -1500, 150, -1000, 25);
    createForest(scene, 2000, 120, 500, 20);

    return ocean;
  }

  // Helper: Create an island with elevation
  function createIsland(scene, centerX, maxHeight, centerZ, radius, name) {
    const groundMaterial = new BABYLON.StandardMaterial(`islandMat_${name}`, scene);
    groundMaterial.diffuse = new BABYLON.Color3(0.3, 0.6, 0.2);
    groundMaterial.emissiveColor = new BABYLON.Color3(0.2, 0.5, 0.1);
    groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    const island = BABYLON.MeshBuilder.CreateGround(name, { width: radius * 2, height: radius * 2, subdivisions: 20 }, scene);
    island.material = groundMaterial;
    island.position.x = centerX;
    island.position.z = centerZ;

    // Create dome-like island elevation
    const heights = island.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (heights) {
      for (let i = 0; i < heights.length; i += 3) {
        const x = heights[i];
        const z = heights[i + 2];
        const distFromCenter = Math.sqrt(x * x + z * z);
        const height = Math.max(0, maxHeight * (1 - (distFromCenter / radius) * (distFromCenter / radius)));
        heights[i + 1] = height;
      }
      island.updateVerticesData(BABYLON.VertexBuffer.PositionKind, heights);
    }
    island.freezeWorldMatrix();
  }

  // Helper: Create forest trees on island
  function createForest(scene, islandX, islandY, islandZ, treeCount) {
    for (let i = 0; i < treeCount; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const distance = Math.random() * 150;
      const treeX = islandX + Math.cos(angle) * distance;
      const treeZ = islandZ + Math.sin(angle) * distance;
      const treeHeight = 15 + Math.random() * 10;

      // Simple tree: cylinder trunk + cone top
      const trunk = BABYLON.MeshBuilder.CreateCylinder('trunk', {
        height: treeHeight * 0.3,
        diameterTop: 2,
        diameterBottom: 3,
      }, scene);
      trunk.position.x = treeX;
      trunk.position.y = islandY + treeHeight * 0.15;
      trunk.position.z = treeZ;

      const trunkMat = new BABYLON.StandardMaterial('trunkMat', scene);
      trunkMat.diffuse = new BABYLON.Color3(0.4, 0.2, 0.1);
      trunk.material = trunkMat;

      const foliage = BABYLON.MeshBuilder.CreateCone('foliage', {
        height: treeHeight * 0.7,
        diameterBottom: treeHeight * 0.5,
      }, scene);
      foliage.position.x = treeX;
      foliage.position.y = islandY + treeHeight * 0.5;
      foliage.position.z = treeZ;

      const foliageMat = new BABYLON.StandardMaterial('foliageMat', scene);
      foliageMat.diffuse = new BABYLON.Color3(0.1 + Math.random() * 0.2, 0.5 + Math.random() * 0.2, 0.1);
      foliage.material = foliageMat;
    }
  }

  // Create Plane Mesh
  // Every plane type is assembled from the same handful of simple primitives
  // (cylinders/boxes/cones, low tessellation) - only dimensions, colors, and
  // which optional parts are attached change per type in PLANE_TYPES. This
  // keeps every plane just as cheap to render as the original single model.
  function createPlaneMesh(scene, typeKey) {
    const type = PLANE_TYPES[typeKey] || PLANE_TYPES[DEFAULT_PLANE_TYPE];

    // Note: planeGroup.position must be a real BABYLON.Vector3 (not the plain
    // {x,y,z} object in gameState.plane.position) since updateGame() calls
    // .copyFromFloats() on it every frame instead of reallocating.
    const planeGroup = new BABYLON.TransformNode('planeGroup', scene);
    planeGroup.position = new BABYLON.Vector3(
      gameState.plane.position.x,
      gameState.plane.position.y,
      gameState.plane.position.z
    );

    const bodyMat = new BABYLON.StandardMaterial('bodyMat', scene);
    bodyMat.diffuse = type.bodyColor;
    bodyMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    const accentMat = new BABYLON.StandardMaterial('accentMat', scene);
    accentMat.diffuse = type.accentColor;
    accentMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    const cockpitMat = new BABYLON.StandardMaterial('cockpitMat', scene);
    cockpitMat.diffuse = new BABYLON.Color3(0.3, 0.3, 0.3);
    cockpitMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);

    // Fuselage (main body)
    const fuselage = BABYLON.MeshBuilder.CreateCylinder('fuselage', {
      height: type.fuselageLength, diameter: type.fuselageDiameter, tessellation: 12,
    }, scene);
    fuselage.parent = planeGroup;
    fuselage.material = bodyMat;
    fuselage.rotation.z = Math.PI / 2;

    // Wings - straight rectangular wing for most planes, or a simple two-box
    // swept "delta" shape (two thin boxes angled outward) for Concorde.
    if (type.wingStyle === 'delta') {
      const halfSpan = type.wingSpan / 2;
      const sweepAngle = Math.PI / 5; // ~36 degrees sweep, just for silhouette
      [1, -1].forEach((side) => {
        const wingHalf = BABYLON.MeshBuilder.CreateBox('wingHalf', {
          width: halfSpan * 1.4, height: 0.4, depth: type.wingDepth * 0.5,
        }, scene);
        wingHalf.parent = planeGroup;
        wingHalf.material = accentMat;
        wingHalf.position.x = side * halfSpan * 0.45;
        wingHalf.position.z = -type.wingDepth * 0.15;
        wingHalf.rotation.y = -side * sweepAngle;
      });
    } else {
      const wing = BABYLON.MeshBuilder.CreateBox('wing', {
        width: type.wingSpan, height: 1, depth: type.wingDepth,
      }, scene);
      wing.parent = planeGroup;
      wing.material = accentMat;
    }

    // Tail fin
    const tail = BABYLON.MeshBuilder.CreateBox('tail', {
      width: type.fuselageDiameter, height: type.tailHeight, depth: 2,
    }, scene);
    tail.parent = planeGroup;
    tail.material = accentMat;
    tail.position.z = -(type.fuselageLength / 2 - 1);
    tail.position.y = type.tailHeight / 2 - 1;

    // Nose - a sphere "cockpit" bubble for most planes, or a thin cone for
    // Concorde's iconic droop nose. The 747 additionally gets a small hump
    // (upper deck) sitting just behind its cockpit.
    if (type.noseStyle === 'cone') {
      const nose = BABYLON.MeshBuilder.CreateCylinder('nose', {
        height: 4, diameterTop: 0, diameterBottom: type.fuselageDiameter * 0.8, tessellation: 8,
      }, scene);
      nose.parent = planeGroup;
      nose.material = accentMat;
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = type.fuselageLength / 2 + 1.5;
    } else {
      const cockpit = BABYLON.MeshBuilder.CreateSphere('cockpit', { diameter: type.fuselageDiameter * 1.2 }, scene);
      cockpit.parent = planeGroup;
      cockpit.material = cockpitMat;
      cockpit.position.x = type.fuselageLength / 2 - 2;
      cockpit.position.y = type.fuselageDiameter * 0.4;

      if (type.noseStyle === 'hump') {
        const hump = BABYLON.MeshBuilder.CreateSphere('hump', {
          diameterX: type.fuselageDiameter * 1.4,
          diameterY: type.fuselageDiameter * 0.8,
          diameterZ: type.fuselageDiameter * 2.2,
        }, scene);
        hump.parent = planeGroup;
        hump.material = bodyMat;
        hump.position.x = type.fuselageLength / 2 - 6;
        hump.position.y = type.fuselageDiameter * 0.55;
      }
    }

    // Engines - small cylinders slung under the wings, evenly spread per side.
    if (type.engineCount > 0) {
      const engineMat = new BABYLON.StandardMaterial('engineMat', scene);
      engineMat.diffuse = new BABYLON.Color3(0.25, 0.25, 0.28);
      const perSide = type.engineCount / 2;
      [1, -1].forEach((side) => {
        for (let i = 0; i < perSide; i++) {
          const engine = BABYLON.MeshBuilder.CreateCylinder('engine', {
            height: type.fuselageLength * 0.18, diameter: type.fuselageDiameter * 0.45, tessellation: 8,
          }, scene);
          engine.parent = planeGroup;
          engine.material = engineMat;
          engine.rotation.z = Math.PI / 2;
          const spanFraction = 0.3 + i * 0.3;
          engine.position.x = side * type.wingSpan * spanFraction * 0.5;
          engine.position.y = -type.fuselageDiameter * 0.6;
        }
      });
    }

    return planeGroup;
  }

  // Setup Physics
  function setupPhysics(scene, planeMesh) {
    // Create a shadow generator for better visuals.
    // planeMesh is a TransformNode (no geometry of its own) - only its actual
    // child meshes can be registered as shadow casters, otherwise Babylon
    // throws "getBoundingInfo is not a function" the first time it renders
    // the shadow map, which silently kills the render loop.
    if (gameState.shadowGenerator) {
      gameState.shadowGenerator.dispose();
    }
    const light = scene.lights[0];
    const shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
    planeMesh.getChildMeshes().forEach((mesh) => shadowGenerator.addShadowCaster(mesh));
    shadowGenerator.useBlurExponentialShadowMap = true;
    gameState.shadowGenerator = shadowGenerator;
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
  function updateGame() {
    if (!gameState.gameStarted || gameState.isCrashed) return;
    const planeMesh = gameState.planeMesh;

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
    const turnRate = gameState.planeStats.turnRate;

    // Throttle control - smoother acceleration/deceleration
    if (keys[' ']) {
      p.throttle = Math.min(1, p.throttle + 0.03 * dt);
    } else if (keys['shift']) {
      p.throttle = Math.max(0, p.throttle - 0.03 * dt);
    }

    // Pitch control (up/down rotation) - heavier planes (lower turnRate) respond slower
    const pitchSensitivity = 0.04 * dt * turnRate;
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
    const rollSensitivity = 0.04 * dt * turnRate;
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
    const yawSensitivity = 0.03 * dt * turnRate;
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
    const stats = gameState.planeStats;
    const minStallSpeed = 0.15;

    // Calculate speed based on throttle with acceleration curve
    // (exponential smoothing formula keeps the lerp rate consistent regardless of frame rate)
    const maxSpeed = 1.5 * stats.speed;
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
    const drag = p.drag * stats.drag;
    const speedDrag = p.speed * 0.01;
    const dragFactorY = Math.pow(1 - drag - speedDrag, dt);
    const dragFactorXZ = Math.pow(1 - drag * 0.3 - speedDrag * 0.5, dt);
    p.velocity.y *= dragFactorY;
    p.velocity.x *= dragFactorXZ;
    p.velocity.z *= dragFactorXZ;

    // Apply lift (higher speed = more lift to counteract gravity)
    const liftForce = p.speed * p.lift * stats.lift;
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
        p.position.y = groundLevel;
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
    dom.crashScoreLine.textContent = 'Score: ' + gameState.score;
    dom.crashOverlay.style.display = 'flex';
  }

  // Save Best Score to localStorage
  function saveBestScore() {
    if (gameState.score > gameState.bestScore) {
      gameState.bestScore = gameState.score;
      localStorage.setItem('planeGameBestScore', String(gameState.bestScore));
      if (dom.bestScore) dom.bestScore.textContent = gameState.bestScore;
    }
  }

  // Reset all flight/score/checkpoint state back to spawn conditions.
  // Shared by restartGame() (same plane, keyboard R / Restart button) and
  // changePlane() (returns to the main menu to pick a different plane).
  function resetPlaneState() {
    gameState.isFlying = false;
    gameState.isCrashed = false;
    gameState.flightTime = 0;
    gameState.startTime = null;
    gameState.maxAltitude = 0;
    gameState.score = 0;

    // Clear held-key state so a key held through the reset (e.g. Space
    // for throttle) doesn't immediately re-apply on the next frame.
    gameState.keys = {};

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
  }

  // Restart Game (same plane type - keyboard R or the Restart button)
  function restartGame() {
    resetPlaneState();
    dom.crashOverlay.style.display = 'none';
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
  function drawArtificialHorizon() {
    if (!dom.artificialHorizonCanvas) return;

    const canvas = dom.artificialHorizonCanvas;
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2.2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sky (blue) and ground (brown) background
    ctx.fillStyle = '#4da6ff';
    ctx.fillRect(0, 0, canvas.width, centerY);
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(0, centerY, canvas.width, centerY);

    ctx.save();
    ctx.translate(centerX, centerY);

    // Rotate based on pitch (rotation.x)
    const pitchAngle = gameState.plane.rotation.x;
    ctx.rotate(pitchAngle);

    // Draw horizon line
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();

    // Draw pitch lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const y = i * (radius / 3);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.3, y);
      ctx.lineTo(radius * 0.3, y);
      ctx.stroke();
    }

    ctx.restore();

    // Draw roll indicator (sides)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    const rollAngle = gameState.plane.rotation.z;

    // Left wing marker
    ctx.save();
    ctx.translate(centerX - radius * 0.6, centerY);
    ctx.rotate(rollAngle);
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Right wing marker
    ctx.save();
    ctx.translate(centerX + radius * 0.6, centerY);
    ctx.rotate(rollAngle);
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Center aircraft symbol
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(centerX - 8, centerY - 2, 16, 4);
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();
  }

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

    // Draw artificial horizon indicator
    if (gameState.gameStarted && dom.artificialHorizonCanvas) {
      drawArtificialHorizon();
    }

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
