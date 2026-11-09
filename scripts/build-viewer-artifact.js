import fs from 'fs';

const bundleJs = fs.readFileSync('/tmp/viewer-bundle.js', 'utf-8');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chill Flight - 3D Hot Air Balloon Model Viewer</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
      background: radial-gradient(circle at 50% 30%, #1e293b, #0f172a 80%);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #canvas-container {
      position: absolute;
      inset: 0;
      width: 100vw;
      height: 100vh;
    }
    .hud-panel {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }
    .btn-pill {
      transition: all 0.15s ease;
    }
    .btn-pill:hover {
      background-color: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.5);
    }
    .btn-pill.active {
      background-color: #38bdf8;
      color: #0f172a;
      font-weight: 600;
      border-color: #38bdf8;
    }
    /* Custom scrollbar */
    ::-webkit-scrollbar {
      width: 5px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }
  </style>
</head>
<body class="text-slate-100">

  <!-- 3D WebGL Canvas Container -->
  <div id="canvas-container"></div>

  <!-- Top Header / Title Bar -->
  <header class="absolute top-4 left-4 z-20 flex items-center space-x-3 pointer-events-none">
    <div class="hud-panel pointer-events-auto px-4 py-2.5 rounded-xl flex items-center space-x-3">
      <span class="text-2xl">🎈</span>
      <div>
        <h1 class="text-sm font-bold tracking-wider uppercase text-sky-400">Chill Flight</h1>
        <p class="text-xs text-slate-400 font-medium">Hot Air Balloon & Vehicle Inspector</p>
      </div>
    </div>
  </header>

  <!-- Controls Sidebar (Left) -->
  <aside class="absolute top-20 left-4 z-20 w-80 max-h-[calc(100vh-6rem)] overflow-y-auto hud-panel rounded-2xl p-4 space-y-4">
    
    <!-- Vehicle Selection -->
    <div>
      <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">Model</label>
      <div class="grid grid-cols-2 gap-1.5" id="model-selector">
        <button class="btn-pill active px-3 py-2 text-xs rounded-lg border border-slate-700 text-left font-medium" data-model="balloon">🎈 Balloon</button>
        <button class="btn-pill px-3 py-2 text-xs rounded-lg border border-slate-700 text-left font-medium" data-model="airplane">🛩️ Seaplane</button>
        <button class="btn-pill px-3 py-2 text-xs rounded-lg border border-slate-700 text-left font-medium" data-model="biplane">✈️ Biplane</button>
        <button class="btn-pill px-3 py-2 text-xs rounded-lg border border-slate-700 text-left font-medium" data-model="jet">🚀 Jet</button>
        <button class="btn-pill px-3 py-2 text-xs rounded-lg border border-slate-700 text-left font-medium" data-model="twin">🛫 Twin Engine</button>
        <button class="btn-pill px-3 py-2 text-xs rounded-lg border border-slate-700 text-left font-medium" data-model="buggy">🏎️ Dune Buggy</button>
      </div>
    </div>

    <!-- Balloon Specific Controls -->
    <div id="balloon-controls" class="space-y-4 pt-2 border-t border-slate-800">

      <!-- LOD Level -->
      <div>
        <div class="flex justify-between items-center mb-1.5">
          <label class="text-xs font-semibold uppercase tracking-wider text-slate-400">Level of Detail (LOD)</label>
          <span id="lod-indicator" class="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">LOD 0 (Near)</span>
        </div>
        <div class="grid grid-cols-3 gap-1.5" id="lod-buttons">
          <button class="btn-pill active px-2 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-center" data-lod="0">LOD 0 (Near)</button>
          <button class="btn-pill px-2 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-center" data-lod="1">LOD 1 (Mid)</button>
          <button class="btn-pill px-2 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-center" data-lod="2">LOD 2 (Far)</button>
        </div>
        <p class="text-[11px] text-slate-400 mt-1" id="lod-desc">Full 16 gores, 4 suspension cables, sandbags, dual burner nozzles, decal emblem.</p>
      </div>

      <!-- Decal Emblem -->
      <div>
        <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">Envelope Decal</label>
        <div class="grid grid-cols-2 gap-1.5" id="decal-buttons">
          <button class="btn-pill active px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-left" data-decal="sunburst">☀️ Sunburst</button>
          <button class="btn-pill px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-left" data-decal="cloud">☁️ Cloud</button>
          <button class="btn-pill px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-left" data-decal="mountain">⛰️ Mountain</button>
          <button class="btn-pill px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-left" data-decal="none">🚫 None</button>
        </div>
      </div>

      <!-- Burner Flame Toggle -->
      <div>
        <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">Burner Flame & Light</label>
        <button id="burner-toggle" class="w-full btn-pill px-3 py-2 text-xs rounded-lg border border-slate-700 flex items-center justify-between font-medium">
          <span class="flex items-center space-x-2">
            <span id="burner-icon">🔥</span>
            <span>Flame Glow & PointLight</span>
          </span>
          <span id="burner-status" class="text-slate-400 font-mono text-[11px]">OFF</span>
        </button>
      </div>
    </div>

    <!-- Color Palette -->
    <div class="pt-2 border-t border-slate-800">
      <div class="flex justify-between items-center mb-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-slate-400">Livery Color</label>
        <button id="cycle-color-btn" class="text-[11px] text-sky-400 hover:text-sky-300 font-medium">🎲 Cycle Random</button>
      </div>
      <div class="grid grid-cols-4 gap-2" id="color-palette">
        <!-- Palette circles generated dynamically -->
      </div>
    </div>

    <!-- Display / Camera Options -->
    <div class="pt-2 border-t border-slate-800 space-y-2">
      <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">View Options</label>
      <div class="grid grid-cols-2 gap-2">
        <button id="wireframe-btn" class="btn-pill px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-center">
          🕸️ Wireframe
        </button>
        <button id="autorotate-btn" class="btn-pill active px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-center">
          🔄 Auto-Rotate
        </button>
      </div>
      <button id="reset-cam-btn" class="w-full btn-pill px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 font-medium text-center text-slate-300">
        🎯 Center Camera
      </button>
    </div>

  </aside>

  <!-- Inspector / Stats Badge (Bottom-Right) -->
  <aside class="absolute bottom-4 right-4 z-20 hud-panel rounded-xl p-3.5 space-y-1.5 text-xs pointer-events-auto min-w-[200px]">
    <div class="flex justify-between font-semibold text-sky-400 border-b border-slate-800 pb-1.5">
      <span id="stat-name">Hot Air Balloon</span>
      <span id="stat-tris">0 Tris</span>
    </div>
    <div class="flex justify-between text-slate-400">
      <span>Vertices:</span>
      <span id="stat-verts" class="font-mono text-slate-200">0</span>
    </div>
    <div class="flex justify-between text-slate-400">
      <span>Mesh Parts:</span>
      <span id="stat-meshes" class="font-mono text-slate-200">0</span>
    </div>
    <div class="flex justify-between text-slate-400">
      <span>Height:</span>
      <span id="stat-dimensions" class="font-mono text-slate-200">~24m</span>
    </div>
    <div class="flex justify-between text-slate-400">
      <span>Envelope Diam:</span>
      <span class="font-mono text-slate-200">~16m</span>
    </div>
    <div class="pt-1 text-[10px] text-slate-400 text-center border-t border-slate-800">
      Left Drag: Orbit • Right Drag: Pan • Scroll: Zoom
    </div>
  </aside>

  <!-- Inlined Bundle Script -->
  <script type="module">
    ${bundleJs}

    // App state
    const state = {
      modelType: 'balloon',
      colorIndex: 0,
      lodLevel: 0,
      decalType: 'sunburst',
      burnerActive: false,
      wireframe: false,
      autoRotate: true,
    };

    const COLORS = [
      { name: 'Coral Sunset', hex: 0xe0564c, white: 0xf8fafc },
      { name: 'Azure Ocean', hex: 0x3b82f6, white: 0xf8fafc },
      { name: 'Sunflower Gold', hex: 0xeab308, white: 0x1e293b },
      { name: 'Emerald Forest', hex: 0x10b981, white: 0xf8fafc },
      { name: 'Twilight Purple', hex: 0x8b5cf6, white: 0xf8fafc },
      { name: 'Teal Mirage', hex: 0x14b8a6, white: 0xf8fafc },
      { name: 'Sand Dune', hex: 0xe8c382, white: 0x1c3144 },
      { name: 'Midnight Charcoal', hex: 0x334155, white: 0xf8fafc },
    ];

    // Three.js Scene Setup
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1322);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(22, 14, 28);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 1.2;
    controls.target.set(0, 10, 0);
    controls.minDistance = 5;
    controls.maxDistance = 120;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    sunLight.position.set(30, 50, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    const d = 25;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    const skyLight = new THREE.HemisphereLight(0x93c5fd, 0x334155, 0.7);
    scene.add(skyLight);

    // Subtle Ground Disc / Pedestal
    const groundGeo = new THREE.CylinderGeometry(18, 19, 0.5, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper on pedestal
    const grid = new THREE.GridHelper(36, 18, 0x38bdf8, 0x334155);
    grid.position.y = 0.01;
    scene.add(grid);

    let currentModel = null;

    function buildCurrentModel() {
      if (currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material?.dispose();
          }
        });
        currentModel = null;
      }

      const activeColor = COLORS[state.colorIndex];

      if (state.modelType === 'balloon') {
        currentModel = window.createBalloonModel({
          planeColor: activeColor.hex,
          decalType: state.decalType === 'none' ? null : state.decalType,
        });
        currentModel.userData.setLOD(state.lodLevel);
        currentModel.userData.setBurnerActive(state.burnerActive);
        controls.target.set(0, 10, 0);
      } else if (state.modelType === 'airplane') {
        currentModel = window.createSeaplaneModel({ planeColor: activeColor.hex });
        controls.target.set(0, 2, 0);
      } else if (state.modelType === 'biplane') {
        currentModel = window.createBiplaneModel({ planeColor: activeColor.hex });
        controls.target.set(0, 2, 0);
      } else if (state.modelType === 'jet') {
        currentModel = window.createJetModel({ planeColor: activeColor.hex });
        controls.target.set(0, 2, 0);
      } else if (state.modelType === 'twin') {
        currentModel = window.createTwinModel({ planeColor: activeColor.hex });
        controls.target.set(0, 2, 0);
      } else if (state.modelType === 'buggy') {
        currentModel = window.createBuggyModel();
        controls.target.set(0, 1, 0);
      }

      if (currentModel) {
        scene.add(currentModel);
        applyWireframe();
        updateStats();
      }
    }

    function applyWireframe() {
      if (!currentModel) return;
      currentModel.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => { m.wireframe = state.wireframe; });
          } else {
            child.material.wireframe = state.wireframe;
          }
        }
      });
    }

    function updateStats() {
      if (!currentModel) return;
      let tris = 0;
      let verts = 0;
      let meshes = 0;

      currentModel.traverse((child) => {
        if (child.isMesh && child.visible && child.geometry) {
          meshes++;
          const geo = child.geometry;
          if (geo.index) {
            tris += geo.index.count / 3;
          } else if (geo.attributes.position) {
            tris += geo.attributes.position.count / 3;
          }
          if (geo.attributes.position) {
            verts += geo.attributes.position.count;
          }
        }
      });

      document.getElementById('stat-tris').textContent = \`\${Math.round(tris).toLocaleString()} Tris\`;
      document.getElementById('stat-verts').textContent = Math.round(verts).toLocaleString();
      document.getElementById('stat-meshes').textContent = meshes;

      const titles = {
        balloon: 'Hot Air Balloon',
        airplane: 'Seaplane',
        biplane: 'Biplane',
        jet: 'Jet Fighter',
        twin: 'Twin Engine',
        buggy: 'Dune Buggy'
      };
      document.getElementById('stat-name').textContent = titles[state.modelType] || 'Model';

      const isBalloon = state.modelType === 'balloon';
      document.getElementById('balloon-controls').style.display = isBalloon ? 'block' : 'none';
      document.getElementById('stat-dimensions').textContent = isBalloon ? '~24m' : '~3m';
    }

    // UI Events & Binding
    // Palette
    const paletteEl = document.getElementById('color-palette');
    COLORS.forEach((col, idx) => {
      const btn = document.createElement('button');
      btn.className = \`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 \${idx === state.colorIndex ? 'border-sky-400 scale-110' : 'border-transparent'}\`;
      btn.style.backgroundColor = '#' + col.hex.toString(16).padStart(6, '0');
      btn.title = col.name;
      btn.onclick = () => {
        state.colorIndex = idx;
        document.querySelectorAll('#color-palette button').forEach((b, i) => {
          b.className = \`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 \${i === idx ? 'border-sky-400 scale-110' : 'border-transparent'}\`;
        });
        buildCurrentModel();
      };
      paletteEl.appendChild(btn);
    });

    document.getElementById('cycle-color-btn').onclick = () => {
      state.colorIndex = (state.colorIndex + 1) % COLORS.length;
      document.querySelectorAll('#color-palette button').forEach((b, i) => {
        b.className = \`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 \${i === state.colorIndex ? 'border-sky-400 scale-110' : 'border-transparent'}\`;
      });
      buildCurrentModel();
    };

    // Model selection
    document.querySelectorAll('#model-selector button').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('#model-selector button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.modelType = btn.dataset.model;
        buildCurrentModel();
      };
    });

    // LOD buttons
    const lodDescs = {
      0: 'Full 16 gores, 4 suspension cables, sandbags, dual burner nozzles, decal emblem.',
      1: 'Mid distance: Sub-pixel cables, sandbags & decals omitted to reduce draw calls.',
      2: 'Silhouette: Pure low-poly silhouette for distance terrain rendering (zero extra draw calls).'
    };
    document.querySelectorAll('#lod-buttons button').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('#lod-buttons button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.lodLevel = parseInt(btn.dataset.lod);
        document.getElementById('lod-indicator').textContent = \`LOD \${state.lodLevel}\`;
        document.getElementById('lod-desc').textContent = lodDescs[state.lodLevel];
        if (currentModel?.userData?.setLOD) {
          currentModel.userData.setLOD(state.lodLevel);
          updateStats();
        }
      };
    });

    // Decal buttons
    document.querySelectorAll('#decal-buttons button').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('#decal-buttons button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.decalType = btn.dataset.decal;
        buildCurrentModel();
      };
    });

    // Burner Toggle
    const burnerToggle = document.getElementById('burner-toggle');
    burnerToggle.onclick = () => {
      state.burnerActive = !state.burnerActive;
      const statusEl = document.getElementById('burner-status');
      if (state.burnerActive) {
        burnerToggle.classList.add('active');
        statusEl.textContent = 'ACTIVE';
        statusEl.className = 'text-amber-400 font-bold font-mono text-[11px] animate-pulse';
      } else {
        burnerToggle.classList.remove('active');
        statusEl.textContent = 'OFF';
        statusEl.className = 'text-slate-400 font-mono text-[11px]';
      }
      if (currentModel?.userData?.setBurnerActive) {
        currentModel.userData.setBurnerActive(state.burnerActive);
      }
    };

    // Wireframe
    const wireframeBtn = document.getElementById('wireframe-btn');
    wireframeBtn.onclick = () => {
      state.wireframe = !state.wireframe;
      wireframeBtn.classList.toggle('active', state.wireframe);
      applyWireframe();
    };

    // Auto rotate
    const autoRotateBtn = document.getElementById('autorotate-btn');
    autoRotateBtn.onclick = () => {
      state.autoRotate = !state.autoRotate;
      autoRotateBtn.classList.toggle('active', state.autoRotate);
      controls.autoRotate = state.autoRotate;
    };

    // Reset Camera
    document.getElementById('reset-cam-btn').onclick = () => {
      if (state.modelType === 'balloon') {
        camera.position.set(22, 14, 28);
        controls.target.set(0, 10, 0);
      } else {
        camera.position.set(10, 6, 12);
        controls.target.set(0, 2, 0);
      }
      controls.update();
    };

    // Window resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Initial build
    buildCurrentModel();

    // Animation Loop
    let clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      controls.update();

      // Dynamic burner flame flicker when active
      if (state.burnerActive && currentModel?.userData?.setBurnerActive) {
        const flicker = 0.8 + Math.sin(Date.now() * 0.015) * 0.2 + (Math.random() - 0.5) * 0.15;
        currentModel.userData.setBurnerActive(true, flicker);
      }

      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>
`;

fs.writeFileSync('/tmp/hot_air_balloon_viewer.html', htmlContent);
console.log('Successfully created /tmp/hot_air_balloon_viewer.html, size:', htmlContent.length);
