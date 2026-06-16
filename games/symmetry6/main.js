var process = { env: { NODE_ENV: "production" } };

// logger.js
function initLogger() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;
  console.log = (...args) => {
    originalLog(...args);
  };
  console.warn = (...args) => {
    originalWarn(...args);
  };
  console.error = (...args) => {
    originalError(...args);
  };
  console.debug = (...args) => {
    originalDebug(...args);
  };
}

// scene.js
var CAMERA_ANGLE_FROM_TOP_DEGREES = 15;
var CAMERA_DISTANCE_MULTIPLIER = 0.8;
var scene = new THREE.Scene();
var _bgResolve;
var backgroundLoaded = new Promise((resolve) => _bgResolve = resolve);
var bgTexture = new THREE.TextureLoader().load(
  "background.webp",
  () => {
    window.dispatchEvent(new Event("resize"));
    _bgResolve();
  },
  void 0,
  () => _bgResolve()
  // Resolve anyway on error so the game doesn't freeze
);
bgTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = bgTexture;
var boardGroup = new THREE.Group();
scene.add(boardGroup);
function updateCameraFrustum(cam, width, height) {
  const aspect = width / height;
  cam.aspect = aspect;
  if (bgTexture.image) {
    const imageAspect = bgTexture.image.width / bgTexture.image.height;
    const maxStretch = 1.1;
    let targetAspect = aspect;
    if (targetAspect > imageAspect * maxStretch) {
      targetAspect = imageAspect * maxStretch;
    } else if (targetAspect < imageAspect / maxStretch) {
      targetAspect = imageAspect / maxStretch;
    }
    let ux = 1, uy = 1;
    if (aspect > targetAspect) {
      uy = targetAspect / aspect;
    } else {
      ux = aspect / targetAspect;
    }
    bgTexture.repeat.set(ux, uy);
    bgTexture.offset.set((1 - ux) / 2, (1 - uy) / 2);
  }
  if (boardGroup.children.length > 0) {
    const shadowMesh = boardGroup.userData.shadowMesh;
    if (shadowMesh)
      shadowMesh.visible = false;
    boardGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(boardGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (shadowMesh)
      shadowMesh.visible = true;
    const fovRad = THREE.MathUtils.degToRad(cam.fov);
    const isPortrait = aspect < 1;
    const topMargin = 0.18;
    const bottomMargin = 0.16;
    const usableHeightFactor = 1 - topMargin - bottomMargin;
    const centerShift = topMargin + usableHeightFactor / 2 - 0.5;
    let distForWidth, distForHeight;
    if (isPortrait) {
      distForWidth = size.z / 2 / (aspect * Math.tan(fovRad / 2));
      distForHeight = size.x / 2 / (Math.tan(fovRad / 2) * usableHeightFactor);
    } else {
      distForWidth = size.x / 2 / (aspect * Math.tan(fovRad / 2));
      distForHeight = size.z / 2 / (Math.tan(fovRad / 2) * usableHeightFactor);
    }
    let distance = Math.max(distForWidth, distForHeight) * CAMERA_DISTANCE_MULTIPLIER;
    const angleFromTopRad = THREE.MathUtils.degToRad(CAMERA_ANGLE_FROM_TOP_DEGREES);
    const offset = distance * Math.tan(angleFromTopRad);
    const camY = center.y + distance;
    if (isPortrait) {
      cam.up.set(-1, 0, 0);
      cam.position.set(center.x + offset, camY, center.z);
    } else {
      cam.up.set(0, 0, -1);
      cam.position.set(center.x, camY, center.z + offset);
    }
    cam.lookAt(center);
    const trueDistance = cam.position.distanceTo(center);
    const frustumHeight = 2 * trueDistance * Math.tan(fovRad / 2);
    cam.translateY(centerShift * frustumHeight);
  }
  cam.updateProjectionMatrix();
}
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e3);
camera.position.set(0, 10, 5);
camera.lookAt(scene.position);
var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
var ambientLight = new THREE.AmbientLight(16777215, 0.6);
scene.add(ambientLight);
var dirLight = new THREE.DirectionalLight(16777215, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// hex.js
var hexRadius = 1;
var hexHeight = 0.1;
var simpleHexShape = new THREE.Shape();
for (let i = 0; i < 6; i++) {
  const a = i / 6 * Math.PI * 2;
  const x = Math.sin(a) * hexRadius;
  const y = Math.cos(a) * hexRadius;
  if (i === 0) {
    simpleHexShape.moveTo(x, y);
  } else {
    simpleHexShape.lineTo(x, y);
  }
}
var hitboxGeometry = new THREE.ExtrudeGeometry(simpleHexShape, { depth: hexHeight, bevelEnabled: false });
hitboxGeometry.center();
hitboxGeometry.rotateX(Math.PI / 2);
var positions = hitboxGeometry.attributes.position;
var uvs = hitboxGeometry.attributes.uv;
var yThreshold = hexHeight / 2 * 0.99;
for (let i = 0; i < positions.count; i++) {
  if (Math.abs(positions.getY(i)) >= yThreshold) {
    uvs.setXY(i, uvs.getX(i) * 0.5 + 0.5, uvs.getY(i) * 0.5 + 0.5);
  }
}
uvs.needsUpdate = true;
var modelLibrary = {
  hex: null,
  tile: null,
  tile_1line: null,
  tile_1arc: null,
  tile_2arcs: null,
  tile_1corner: null,
  tile_1corner_1line: null,
  tile_2corners_a: null,
  tile_2corners_b: null,
  tile_3corners: null,
  tile_endpoint: null
};
var fallbackTexture = new THREE.TextureLoader().load("gray.webp");
fallbackTexture.wrapS = THREE.RepeatWrapping;
fallbackTexture.wrapT = THREE.RepeatWrapping;
fallbackTexture.colorSpace = THREE.SRGBColorSpace;
function loadGeometries(onProgress) {
  const gltfLoader = new THREE.GLTFLoader();
  const dracoLoader = new THREE.DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
  gltfLoader.setDRACOLoader(dracoLoader);
  const mtlLoader = new THREE.MTLLoader();
  const objLoader = new THREE.OBJLoader();
  const processLoadedGroup = (group, baseName) => {
    if (!group)
      return null;
    let hasMesh = false;
    group.traverse((child) => {
      if (child.isMesh)
        hasMesh = true;
    });
    if (!hasMesh)
      return null;
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.traverse((child) => {
      if (child.isMesh) {
        console.log(`[Model Loader] Tile Model: ${baseName}, Mesh Name: ${child.name}, Materials:`, child.material);
        child.geometry.translate(-center.x, 0, -center.z);
        const processMat = (mat) => {
          if (mat && mat.name && mat.name.toLowerCase() === "path") {
            console.log(`[Model Loader] returning 'pathMat' for ${baseName} mesh ${child.name}`);
            return pathMat;
          }
          return new THREE.MeshStandardMaterial({
            color: 16777215,
            map: fallbackTexture,
            roughness: 0.8
          });
        };
        if (Array.isArray(child.material)) {
          child.material = child.material.map(processMat);
        } else {
          child.material = processMat(child.material);
        }
      }
    });
    group.scale.set(1.04, 1, 1.04);
    return group;
  };
  const loadModel = (baseName) => new Promise((resolve) => {
    gltfLoader.load(
      `models/${baseName}.glb`,
      (gltf) => {
        console.log(`Loaded ${baseName}.glb`);
        resolve(processLoadedGroup(gltf.scene, baseName));
      },
      void 0,
      (e) => {
        console.log(`Could not load ${baseName}.glb, falling back to .obj`);
        mtlLoader.load(
          `models/${baseName}.mtl`,
          (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(`models/${baseName}.obj`, (group) => resolve(processLoadedGroup(group, baseName)), void 0, () => resolve(null));
          },
          void 0,
          () => {
            objLoader.setMaterials(null);
            objLoader.load(`models/${baseName}.obj`, (group) => resolve(processLoadedGroup(group, baseName)), void 0, () => resolve(null));
          }
        );
      }
    );
  });
  const keys = Object.keys(modelLibrary);
  let loadedCount = 0;
  return Promise.all(keys.map((k) => loadModel(k).then((res) => {
    loadedCount++;
    if (onProgress)
      onProgress(loadedCount, keys.length);
    return res;
  }))).then((results) => {
    keys.forEach((k, i) => {
      modelLibrary[k] = results[i];
    });
    console.log("Model loading process complete.");
  });
}
var pathMat = new THREE.MeshPhysicalMaterial({
  name: "path",
  color: "#fafafa",
  roughness: 0.3,
  metalness: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide
});
var pathEndpointMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.8, toneMapped: false, side: THREE.DoubleSide });
pathEndpointMat.userData.isTargetEmissive = true;
var pathData = {
  "s": [[0, 3]],
  // Single Straight
  "c": [[0, 1]],
  // Single Corner (adjacent)
  "C": [[0, 1], [3, 4]],
  // Double Corner
  "B": [[0, 1], [2, 3]],
  // Double Corner B
  "a": [[1, 5]],
  // Single Arc (TL-BL)
  "A": [[1, 5], [2, 4]],
  // Double Arc
  "x": [[0, 3], [1, 4]],
  // Double Straight
  "t": [[0, 1], [2, 3], [4, 5]],
  // Triple Corner
  "S": [[0, 3], [1, 4], [2, 5]],
  // Triple Straight
  "U": [[0, 5], [1, 4], [2, 3]],
  // U-Turn (2 corners, 1 straight)
  "0": [[0, 6]],
  // Endpoint pointing to Edge 0
  "1": [[1, 6]],
  // Endpoint pointing to Edge 1
  "2": [[2, 6]],
  // Endpoint pointing to Edge 2
  "3": [[3, 6]],
  // Endpoint pointing to Edge 3
  "4": [[4, 6]],
  // Endpoint pointing to Edge 4
  "5": [[5, 6]]
  // Endpoint pointing to Edge 5
};
var colorHexes = {
  "r": "#e74c3c",
  // red
  "b": "#3498db",
  // blue
  "y": "#f1c40f",
  // yellow
  "o": "#e67e22",
  // orange
  "p": "#9b59b6",
  // purple
  "g": "#2ecc71",
  // green
  "c": "#00bcd4",
  // cyan
  "*": "#838383"
  // neutral/grey
};
var sharedProjectionUniforms = {
  projectionScale: { value: 2 }
  // Uniform scale preserves aspect ratio
};
var symbolTextures = {
  "r": new THREE.TextureLoader().load("symbols/r.webp"),
  "b": new THREE.TextureLoader().load("symbols/b.webp"),
  "y": new THREE.TextureLoader().load("symbols/y.webp"),
  "g": new THREE.TextureLoader().load("symbols/g.webp"),
  "p": new THREE.TextureLoader().load("symbols/p.webp"),
  "o": new THREE.TextureLoader().load("symbols/o.webp"),
  "c": new THREE.TextureLoader().load("symbols/c.webp"),
  "*": new THREE.TextureLoader().load("symbols/n.webp")
};
Object.values(symbolTextures).forEach((tex) => {
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
});
function setupProjectedMaterial(mat) {
  if (mat.userData.projectedSetup)
    return;
  mat.userData.projectedSetup = true;
  mat.userData.shaderUniforms = {
    projectedMap: { value: null },
    projectionScale: sharedProjectionUniforms.projectionScale,
    useProjectedMap: { value: 0 },
    uBrightness: { value: 1 },
    uBaseBoost: { value: 3.5 }
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.projectedMap = mat.userData.shaderUniforms.projectedMap;
    shader.uniforms.projectionScale = mat.userData.shaderUniforms.projectionScale;
    shader.uniforms.useProjectedMap = mat.userData.shaderUniforms.useProjectedMap;
    shader.uniforms.uBrightness = mat.userData.shaderUniforms.uBrightness;
    shader.uniforms.uBaseBoost = mat.userData.shaderUniforms.uBaseBoost;
    shader.vertexShader = `
            uniform float projectionScale;
            varying vec2 vTileUV;
            ${shader.vertexShader}
        `.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vec4 centerPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            // Calculate upright UV relative to the tile's absolute center in world space
            vec2 localPos = worldPos.xz - centerPos.xz;
            // Rotate UV -90 degrees (180 degrees from previous) with uniform scaling to prevent distortion
            vTileUV = vec2(localPos.y, -localPos.x) / projectionScale + 0.5;`
    );
    shader.fragmentShader = `
            uniform sampler2D projectedMap;
            uniform float useProjectedMap;
            uniform float uBrightness;
            uniform float uBaseBoost;
            varying vec2 vTileUV;
            ${shader.fragmentShader}
        `.replace(
      "#include <map_fragment>",
      `
            #include <map_fragment>
            
            if (useProjectedMap > 0.5) {
                vec4 symbolColor = texture2D(projectedMap, vTileUV);
                diffuseColor = symbolColor;
                diffuseColor.rgb *= uBrightness;
            } else {
                // Universally compensate for the darkening of the gray.webp base texture.
                // This restores the bright, vibrant hex colors of the base tiles.
                diffuseColor.rgb *= uBaseBoost;
            }
            `
    );
  };
}
function getPathModelData(pathType) {
  const step = -Math.PI / 3;
  switch (pathType) {
    case "s":
      return { model: modelLibrary.tile_1line, rot: 0 };
    case "c":
      return { model: modelLibrary.tile_1corner, rot: -step };
    case "a":
      return { model: modelLibrary.tile_1arc, rot: 0 };
    case "C":
      return { model: modelLibrary.tile_2corners_a, rot: -step };
    case "B":
      return { model: modelLibrary.tile_2corners_b, rot: -step };
    case "t":
      return { model: modelLibrary.tile_3corners, rot: -step };
    case "A":
      return { model: modelLibrary.tile_2arcs, rot: 0 };
    case "0":
      return { model: modelLibrary.tile_endpoint, rot: step };
    case "1":
      return { model: modelLibrary.tile_endpoint, rot: 2 * step };
    case "2":
      return { model: modelLibrary.tile_endpoint, rot: 3 * step };
    case "3":
      return { model: modelLibrary.tile_endpoint, rot: 4 * step };
    case "4":
      return { model: modelLibrary.tile_endpoint, rot: 5 * step };
    case "5":
      return { model: modelLibrary.tile_endpoint, rot: 6 * step };
    default:
      return { model: null, rot: 0 };
  }
}
function getTileStyle(type, isTop) {
  if (!type || type === "**")
    return { color: "#838383", emissive: false, colorKey: "*" };
  const colorType = type.substring(0, 2);
  if (colorType === "@@")
    return { color: "#272727", emissive: false, colorKey: "@" };
  let colorKey = null;
  let isEmissive = false;
  if (colorType[0] === "T") {
    colorKey = colorType[1];
    isEmissive = isTop;
  } else {
    colorKey = isTop ? colorType[0] : colorType[1];
  }
  const hex = colorHexes[colorKey] || "#ffffff";
  return { color: hex, emissive: isEmissive, colorKey };
}
function createPathMesh(pathEdges, isEndpoint = false) {
  const group = new THREE.Group();
  const pathWidth = 0.12;
  const shapeRadius = hexRadius * 0.95;
  const edgeMidpoints = [];
  for (let i = 0; i < 6; i++) {
    const mappedIdx = (10 - i) % 6;
    const angle = (mappedIdx + 0.5) * (Math.PI / 3);
    const innerRadius = shapeRadius * Math.sqrt(3) / 2;
    edgeMidpoints.push(new THREE.Vector3(Math.sin(angle) * innerRadius, 0, Math.cos(angle) * innerRadius));
  }
  edgeMidpoints.push(new THREE.Vector3(0, 0, 0));
  pathEdges.forEach((path) => {
    const p1 = edgeMidpoints[path[0]];
    const p2 = edgeMidpoints[path[1]];
    let curve;
    if (path[0] === 6 || path[1] === 6) {
      curve = new THREE.LineCurve3(p1, p2);
    } else {
      const c1 = p1.clone().multiplyScalar(0.5);
      const c2 = p2.clone().multiplyScalar(0.5);
      curve = new THREE.CubicBezierCurve3(p1, c1, c2, p2);
    }
    const tubeGeom = new THREE.TubeGeometry(curve, 20, pathWidth, 8, false);
    const mesh = new THREE.Mesh(tubeGeom, isEndpoint ? pathEndpointMat : pathMat);
    mesh.scale.set(1, 0.2, 1);
    group.add(mesh);
  });
  if (isEndpoint) {
    const hubGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6);
    const hub = new THREE.Mesh(hubGeom, pathEndpointMat);
    group.add(hub);
  }
  return group;
}
function axialToWorld(q, r) {
  const x = hexRadius * Math.sqrt(3) * (q + r / 2);
  const z = hexRadius * 3 / 2 * r;
  return { x, z };
}
function isHexAdjacent(q1, r1, q2, r2) {
  const dq = q1 - q2;
  const dr = r1 - r2;
  const neighbors = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  return neighbors.some((n) => n[0] === dq && n[1] === dr);
}

// state.js
var GameState = {
  SPLASH: "SPLASH",
  HOME: "HOME",
  PLAYING: "PLAYING",
  LEVEL_SELECT: "LEVEL_SELECT",
  MINIGAME: "MINIGAME",
  PAUSED: "PAUSED",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
  PUZZLE: "PUZZLE",
  INTERLUDE: "INTERLUDE"
};
var currentState = GameState.SPLASH;
var stateChangeListeners = [];
function setGameState(newState) {
  if (currentState === newState)
    return;
  const oldState = currentState;
  currentState = newState;
  console.log(`[Game State] Changed from ${oldState} to ${newState}`);
  if (newState === GameState.PLAYING) {
    document.getElementById("btn-back-home").style.display = "block";
  } else if (newState === GameState.HOME) {
    document.getElementById("btn-back-home").style.display = "none";
  }
  stateChangeListeners.forEach((listener) => listener(newState, oldState));
}
function onStateChange(callback) {
  stateChangeListeners.push(callback);
}

// audio.js
var bgmVolume = 0.5;
var sfxVolume = 0.5;
var sounds = {
  bgm: new Audio("audio/bgm.mp3"),
  flip: new Audio("audio/flip.mp3"),
  win: new Audio("audio/win.mp3")
};
sounds.bgm.loop = true;
sounds.bgm.volume = bgmVolume;
var initialized = false;
function initAudio() {
  if (initialized)
    return;
  sounds.bgm.play().catch(() => console.log("[Audio] Autoplay blocked."));
  initialized = true;
}
function playSFX(name) {
  if (!sounds[name])
    return;
  const sfx = sounds[name].cloneNode();
  sfx.volume = sfxVolume;
  sfx.play().catch((e) => console.log("[Audio] Failed to play SFX:", e));
}
function setBGMVolume(vol) {
  bgmVolume = vol;
  sounds.bgm.volume = bgmVolume;
}
function setSFXVolume(vol) {
  sfxVolume = vol;
}
function getVolumes() {
  return { bgmVolume, sfxVolume };
}

// hint.js
var isHintActive = false;
var hintTimeout = null;
function clearHints() {
  if (!isHintActive)
    return;
  isHintActive = false;
  if (hintTimeout) {
    clearTimeout(hintTimeout);
    hintTimeout = null;
  }
  tiles.forEach((tile) => {
    setTileType(tile);
  });
  const hintBtn = document.getElementById("btn-hint");
  if (hintBtn) {
    hintBtn.classList.remove("hint-animating");
  }
}
function showSolutionHint() {
  if (isHintActive) {
    clearHints();
    return false;
  }
  if (!levelConfig || !levelConfig.objective || levelConfig.objective.type !== "match_map" && levelConfig.objective.type !== "match_pieces") {
    console.warn("[Hint] Hint system currently supports match_map / match_pieces puzzles.");
    return false;
  }
  const state = getObjectiveState();
  if (!state)
    return false;
  const zonesConfig = levelConfig.zones || {};
  isHintActive = true;
  let hintsShown = 0;
  tiles.forEach((tile, key) => {
    const z = state.hasZones ? zonesConfig[key] !== void 0 ? zonesConfig[key] : 0 : 1;
    const topObj = tile.children[0];
    const botObj = tile.children[1];
    let displayType = tile.userData.type;
    let isTargetMesh = displayType.startsWith("T") || displayType === "@@";
    let darkenFactor = 0.5;
    if (z === state.targetZone) {
      const expectedType = state.objMap.get(key);
      if (expectedType && !expectedType.startsWith("**") && expectedType !== "@@") {
        displayType = expectedType;
        isTargetMesh = displayType.startsWith("T") || displayType === "@@";
        darkenFactor = 1;
        hintsShown++;
      }
    }
    const topStyle = getTileStyle(displayType, true);
    const botStyle = getTileStyle(displayType, false);
    if (tile.userData.flipped) {
      applyTileStyle(botObj, topStyle, isTargetMesh, tile, darkenFactor);
      applyTileStyle(topObj, botStyle, isTargetMesh, tile, darkenFactor);
    } else {
      applyTileStyle(topObj, topStyle, isTargetMesh, tile, darkenFactor);
      applyTileStyle(botObj, botStyle, isTargetMesh, tile, darkenFactor);
    }
  });
  hintTimeout = setTimeout(() => {
    clearHints();
  }, 5e3);
  const hintBtn = document.getElementById("btn-hint");
  if (hintBtn) {
    hintBtn.classList.add("hint-animating");
  }
  return hintsShown > 0;
}

// analytics.js
var currentLevelIndex = -1;
var levelStartTime = 0;
var actionLog = [];
var gameVersion = "unknown";
var ANALYTICS_ENDPOINT = "https://script.google.com/macros/s/AKfycbxUAscfy-MaG0PkaocxO-LEn7e_6fQBNTmzwGumIlOXhmB8PpmdQ3UkfFYhei7DuBL2/exec";
function initAnalytics() {
  getUserId();
}
function setGameVersion(version) {
  gameVersion = version;
}
function trackLevelStart(levelIndex) {
  currentLevelIndex = levelIndex;
  levelStartTime = Date.now();
  actionLog = [];
  sendEvent("level_start", { level: levelIndex });
}
function trackAction(actionType, details) {
  if (currentLevelIndex === -1)
    return;
  const timeOffset = Date.now() - levelStartTime;
  const actionData = { time: timeOffset, action: actionType, ...details };
  actionLog.push(actionData);
  sendEvent("action", { level: currentLevelIndex, ...actionData });
}
function trackLevelComplete(levelIndex, steps, timeElapsed2) {
  const duration = Date.now() - levelStartTime;
  sendEvent("level_complete", {
    level: levelIndex,
    durationMs: duration,
    timeElapsedSec: timeElapsed2,
    steps,
    recording: actionLog
  });
  currentLevelIndex = -1;
}
function trackLevelRestart(levelIndex) {
  const duration = Date.now() - levelStartTime;
  sendEvent("level_restart", {
    level: levelIndex,
    durationMs: duration,
    recording: actionLog
  });
}
window.addEventListener("beforeunload", () => {
  if (currentLevelIndex !== -1) {
    const duration = Date.now() - levelStartTime;
    sendEvent("level_abandoned", {
      level: currentLevelIndex,
      durationMs: duration,
      recording: actionLog
    });
  }
});
function getUserId() {
  let uid = localStorage.getItem("analytics_user_id");
  if (!uid) {
    uid = "user_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem("analytics_user_id", uid);
  }
  return uid;
}
function sendEvent(eventName, payload) {
  console.log(`[Analytics] ${eventName}:`, payload);
  if (ANALYTICS_ENDPOINT) {
    fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        userId: getUserId(),
        version: gameVersion,
        event: eventName,
        payload,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        device: {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          dpi: window.devicePixelRatio,
          userAgent: navigator.userAgent
        }
      }),
      keepalive: true
      // Ensures the request finishes even if the player closes the tab
    }).catch((err) => console.warn("[Analytics] Network error:", err));
  }
  try {
    const history = JSON.parse(localStorage.getItem("analytics_history") || "[]");
    history.push({ event: eventName, payload, timestamp: Date.now() });
    localStorage.setItem("analytics_history", JSON.stringify(history.slice(-50)));
  } catch (e) {
    console.warn("Analytics storage failed:", e);
  }
}

// interaction.js
var selectedTile = null;
var dragStartTile = null;
var isPointerDown = false;
var isAnimating = false;
var activeTweens = [];
var stepCount = 0;
var completedZones = /* @__PURE__ */ new Set();
var levelWon = false;
var onWinCallback = null;
function setOnWinCallback(cb) {
  onWinCallback = cb;
}
var isSingleFlipActive = false;
var onSingleFlipConsumed = null;
function setOnSingleFlipConsumed(cb) {
  onSingleFlipConsumed = cb;
}
function toggleSingleFlipMode() {
  isSingleFlipActive = !isSingleFlipActive;
  const btn = document.getElementById("btn-single-flip");
  if (btn)
    btn.classList.toggle("active-tool", isSingleFlipActive);
  if (isSingleFlipActive && isSingleRotateActive) {
    toggleSingleRotateMode();
  }
}
var isSingleRotateActive = false;
var onSingleRotateConsumed = null;
function setOnSingleRotateConsumed(cb) {
  onSingleRotateConsumed = cb;
}
function toggleSingleRotateMode() {
  isSingleRotateActive = !isSingleRotateActive;
  const btn = document.getElementById("btn-single-rotate");
  if (btn)
    btn.classList.toggle("active-tool", isSingleRotateActive);
  if (isSingleRotateActive && isSingleFlipActive) {
    toggleSingleFlipMode();
  }
}
function resetInteractionState() {
  stepCount = 0;
  completedZones.clear();
  isAnimating = false;
  activeTweens.length = 0;
  selectedTile = null;
  dragStartTile = null;
  isPointerDown = false;
  levelWon = false;
  isSingleFlipActive = false;
  const flipBtn = document.getElementById("btn-single-flip");
  if (flipBtn)
    flipBtn.classList.remove("active-tool");
  isSingleRotateActive = false;
  const rotateBtn = document.getElementById("btn-single-rotate");
  if (rotateBtn)
    rotateBtn.classList.remove("active-tool");
  clearHints();
  const stepDisplay = document.getElementById("step-count-display");
  if (stepDisplay && levelConfig) {
    stepDisplay.innerText = `Steps: ${stepCount}`;
  }
  const levelDisplay = document.getElementById("level-number-display");
  if (levelDisplay && levelConfig) {
    levelDisplay.innerText = levelConfig.levelNumber;
  }
}
function isFixedTile(tile) {
  if (!tile || !tile.userData || !tile.userData.type)
    return true;
  const type = tile.userData.type;
  if (type === "@@")
    return true;
  if (type.startsWith("T"))
    return true;
  if (tile.userData.isPathTarget)
    return true;
  if (tile.userData.freezeLevel > 0 && !completedZones.has(tile.userData.freezeLevel))
    return true;
  const pathType = type.length > 2 ? type[2] : null;
  if (pathType && "012345".includes(pathType))
    return true;
  return false;
}
function isBlockedEdge(tileA, tileB) {
  let k1 = `${tileA.userData.q},${tileA.userData.r}`;
  let k2 = `${tileB.userData.q},${tileB.userData.r}`;
  let wallKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  if (walls.has(wallKey))
    return true;
  if (colorGates.has(wallKey)) {
    const allowedColors = colorGates.get(wallKey);
    const isTileAllowed = (tile) => {
      const type = tile.userData.type;
      if (type === "**" || type === "@@" || type.startsWith("T"))
        return true;
      const topColor = getCurrentColor(tile);
      return allowedColors.includes(topColor);
    };
    if (!isTileAllowed(tileA) || !isTileAllowed(tileB)) {
      return true;
    }
  }
  return false;
}
function getPathAndRot(typeStr) {
  if (typeStr.length <= 2)
    return { path: null, rot: 0 };
  const lastChar = typeStr[typeStr.length - 1];
  let path = null;
  let rot = 0;
  if (/[0-5]/.test(lastChar)) {
    rot = parseInt(lastChar, 10);
    path = typeStr.length > 3 ? typeStr[2] : "0";
    if (path === "*" || /[0-5]/.test(path))
      path = "0";
  } else {
    path = typeStr[2];
    rot = 0;
  }
  return { path, rot };
}
function isTileMatch(tile, rawExpectedType) {
  const cleanType = (t) => t.length > 2 ? t.substring(0, 2) + t.substring(2).replace(/\*+$/, "") : t;
  const currentType = tile.userData.type;
  const expectedType = cleanType(rawExpectedType);
  let isColorMatch = false;
  if (currentType === expectedType) {
    isColorMatch = true;
  } else if (currentType[0] !== "T" && expectedType[0] !== "T" && currentType !== "@@" && currentType !== "**" && expectedType !== "@@" && expectedType !== "**") {
    let expectedTop = expectedType[0] === "T" ? expectedType[1] : expectedType[0];
    let currentTop = getCurrentColor(tile);
    if (currentTop === expectedTop) {
      isColorMatch = true;
    }
  }
  if (!isColorMatch)
    return false;
  if (expectedType.length <= 2)
    return true;
  const expected = getPathAndRot(expectedType);
  const current = getPathAndRot(currentType);
  if (current.path !== expected.path)
    return false;
  if (expected.path) {
    const expectedRot = expected.rot;
    const currentRot = tile.userData.rotation !== void 0 ? tile.userData.rotation : 0;
    const currentFlipped = tile.userData.flipped || false;
    const baseEdges = pathData[expected.path];
    if (!baseEdges) {
      const norm = (r) => (r % 6 + 6) % 6;
      if (norm(currentRot) !== norm(expectedRot))
        return false;
    } else {
      const mod = (n, m) => (n % m + m) % m;
      const getNormalizedEdges = (rot, flipped) => {
        const edges = baseEdges.map((segment) => {
          const e1 = segment[0] === 6 ? 6 : mod((flipped ? -segment[0] : segment[0]) + rot, 6);
          const e2 = segment[1] === 6 ? 6 : mod((flipped ? -segment[1] : segment[1]) + rot, 6);
          return e1 < e2 ? `${e1},${e2}` : `${e2},${e1}`;
        });
        return edges.sort().join("|");
      };
      if (getNormalizedEdges(currentRot, currentFlipped) !== getNormalizedEdges(expectedRot, false))
        return false;
    }
  }
  return true;
}
function getObjectiveState() {
  if (!levelConfig || !levelConfig.objective)
    return null;
  const obj = levelConfig.objective;
  const zonesConfig = levelConfig?.zones || {};
  const hasZones = Object.keys(zonesConfig).length > 0;
  const objMap = /* @__PURE__ */ new Map();
  const zonesState = {};
  let maxZone = 1;
  let isWin = true;
  if (obj.pieces) {
    for (const p of obj.pieces) {
      objMap.set(`${p.q},${p.r}`, p.type);
      const z = hasZones ? zonesConfig[`${p.q},${p.r}`] !== void 0 ? zonesConfig[`${p.q},${p.r}`] : 0 : 1;
      if (z > maxZone)
        maxZone = z;
      if (!zonesState[z])
        zonesState[z] = { matched: true };
      const tile = tiles.get(`${p.q},${p.r}`);
      if (!tile || !isTileMatch(tile, p.type)) {
        zonesState[z].matched = false;
        isWin = false;
      }
    }
  } else if (obj.map) {
    let halfRows = Math.floor(obj.map.length / 2);
    for (let i = 0; i < obj.map.length; i++) {
      let r = i - halfRows;
      const rowTiles = obj.map[i].trim().split(/\s+/).filter((t) => t.length > 0);
      let N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        const expectedType = rowTiles[j];
        if (/^\*+$/.test(expectedType))
          continue;
        objMap.set(`${q},${r}`, expectedType);
        const z = hasZones ? zonesConfig[`${q},${r}`] !== void 0 ? zonesConfig[`${q},${r}`] : 0 : 1;
        if (z > maxZone)
          maxZone = z;
        if (!zonesState[z])
          zonesState[z] = { matched: true };
        const tile = tiles.get(`${q},${r}`);
        if (!tile || !isTileMatch(tile, expectedType)) {
          zonesState[z].matched = false;
          isWin = false;
        }
      }
    }
  }
  const sortedZones = Object.keys(zonesState).map(Number).sort((a, b) => a - b);
  let targetZone = sortedZones.length > 0 ? sortedZones[sortedZones.length - 1] : 1;
  for (const z of sortedZones) {
    if (!zonesState[z].matched) {
      targetZone = z;
      break;
    }
  }
  return { objMap, zonesState, maxZone, hasZones, isWin, sortedZones, targetZone };
}
function evaluateLogicalWin(objMap) {
  const endpointsByColor = {};
  const pathColors = /* @__PURE__ */ new Set();
  const cleanType = (t) => t.length > 2 ? t.substring(0, 2) + t.substring(2).replace(/\*+$/, "") : t;
  for (const rawExpected of objMap.values()) {
    const expectedType = cleanType(rawExpected);
    if (expectedType.length > 2) {
      const { path } = getPathAndRot(expectedType);
      if (path === "0") {
        const color = expectedType[0];
        if (!endpointsByColor[color])
          endpointsByColor[color] = [];
        pathColors.add(color);
      }
    }
  }
  for (const [key, rawExpected] of objMap.entries()) {
    const expectedType = cleanType(rawExpected);
    const { path, rot } = getPathAndRot(expectedType);
    if (path === "0")
      endpointsByColor[expectedType[0]].push({ key, color: expectedType[0], edge: rot });
  }
  if (pathColors.size === 0)
    return false;
  for (const [key, rawExpectedType] of objMap.entries()) {
    const expectedType = cleanType(rawExpectedType);
    const tile = tiles.get(key);
    if (!tile)
      return false;
    const expectedColor = expectedType[0];
    const currentType = tile.userData.type;
    const currentColor = currentType[0];
    if (expectedType.startsWith("T") || expectedType === "@@") {
      if (currentColor !== expectedColor)
        return false;
      continue;
    }
    if (pathColors.has(expectedColor))
      continue;
    if (expectedColor === "*" && pathColors.has(currentColor))
      continue;
    if (!isTileMatch(tile, rawExpectedType))
      return false;
  }
  const mod = (n, m) => (n % m + m) % m;
  const directions = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
  const getEffectiveEdge = (tile, p) => {
    if (p === 6)
      return 6;
    const r = tile.userData.rotation !== void 0 ? tile.userData.rotation : 0;
    const f = tile.userData.flipped || false;
    return mod((f ? -p : p) + r, 6);
  };
  for (const color of pathColors) {
    const eps = endpointsByColor[color];
    if (!eps || eps.length !== 2)
      return false;
    const [ep1, ep2] = eps;
    const startTile = tiles.get(ep1.key);
    const endTile = tiles.get(ep2.key);
    if (!startTile || !endTile)
      return false;
    const visited = /* @__PURE__ */ new Set();
    const tracePath = (currentTile, entryEdge) => {
      const tileKey = `${currentTile.userData.q},${currentTile.userData.r}`;
      if (visited.has(tileKey) || currentTile.userData.type[0] !== color)
        return false;
      visited.add(tileKey);
      if (currentTile === endTile) {
        if (entryEdge !== null) {
          const pathEdges2 = currentTile.userData.pathEdges;
          if (!pathEdges2) {
            visited.delete(tileKey);
            return false;
          }
          for (const p of pathEdges2) {
            const e1 = getEffectiveEdge(currentTile, p[0]);
            const e2 = getEffectiveEdge(currentTile, p[1]);
            if (e1 === entryEdge || e2 === entryEdge) {
              if (e1 === ep2.edge || e2 === ep2.edge)
                return true;
            }
          }
          visited.delete(tileKey);
          return false;
        }
        return true;
      }
      const pathEdges = currentTile.userData.pathEdges;
      if (!pathEdges) {
        visited.delete(tileKey);
        return false;
      }
      for (const p of pathEdges) {
        const e1 = getEffectiveEdge(currentTile, p[0]);
        const e2 = getEffectiveEdge(currentTile, p[1]);
        const attemptTraceFrom = (exitEdge) => {
          if (exitEdge === 6)
            return false;
          const [dq, dr] = directions[exitEdge];
          const nextTile = tiles.get(`${currentTile.userData.q + dq},${currentTile.userData.r + dr}`);
          if (nextTile)
            return tracePath(nextTile, mod(exitEdge + 3, 6));
          return false;
        };
        if (entryEdge === null) {
          if (e1 !== 6 && attemptTraceFrom(e1))
            return true;
          if (e2 !== 6 && attemptTraceFrom(e2))
            return true;
        } else if (e1 === entryEdge && attemptTraceFrom(e2))
          return true;
        else if (e2 === entryEdge && attemptTraceFrom(e1))
          return true;
      }
      visited.delete(tileKey);
      return false;
    };
    if (!tracePath(startTile, null))
      return false;
  }
  return true;
}
function checkWinCondition() {
  if (!levelConfig || !levelConfig.objective)
    return;
  const obj = levelConfig.objective;
  if (obj.type === "match_map" || obj.type === "match_pieces") {
    const state = getObjectiveState();
    if (!state)
      return;
    let isWin = state.isWin;
    if (!isWin) {
      isWin = evaluateLogicalWin(state.objMap);
    }
    const newlyCompleted = [];
    if (isWin) {
      for (const z of state.sortedZones) {
        if (!completedZones.has(z)) {
          newlyCompleted.push(z);
          completedZones.add(z);
        }
      }
    } else {
      for (const z of state.sortedZones) {
        if (state.zonesState[z].matched && !completedZones.has(z)) {
          newlyCompleted.push(z);
          completedZones.add(z);
        }
      }
    }
    if (newlyCompleted.length > 0) {
      if (!levelConfig || !levelConfig.isTutorial) {
        console.log(`[Game] Zones ${newlyCompleted.join(", ")} complete!`);
      }
      playSFX("win");
      const zonesConfig = levelConfig?.zones || {};
      const flashMeshes = [];
      const flashMat = new THREE.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
      tiles.forEach((tile, key) => {
        const z = state.hasZones ? zonesConfig[key] !== void 0 ? zonesConfig[key] : 0 : 1;
        if (tile.userData.freezeLevel > 0 && newlyCompleted.includes(tile.userData.freezeLevel) && tile.userData.iceMesh) {
          const ice = tile.userData.iceMesh;
          tile.userData.iceMesh = null;
          setTileType(tile);
          if (ice && ice.material) {
            activeTweens.push((time) => {
              if (!ice.userData.startTime)
                ice.userData.startTime = time;
              const p = (time - ice.userData.startTime) / 500;
              if (p >= 1) {
                tile.remove(ice);
                return true;
              }
              ice.scale.set(0.96 * (1 - p), 2.2 * (1 - p), 0.96 * (1 - p));
              ice.material.opacity = 0.5 * (1 - p);
              return false;
            });
          }
        }
        if (newlyCompleted.includes(z)) {
          const flashMesh = new THREE.Mesh(hitboxGeometry, flashMat);
          flashMesh.position.y = 0;
          flashMesh.scale.set(1.02, 1.2, 1.02);
          tile.add(flashMesh);
          flashMeshes.push(flashMesh);
        }
      });
      activeTweens.push((time) => {
        if (!flashMat.userData.startTime)
          flashMat.userData.startTime = time;
        const p = (time - flashMat.userData.startTime) / 600;
        if (p >= 1) {
          flashMeshes.forEach((m) => m.parent.remove(m));
          flashMat.dispose();
          return true;
        }
        flashMat.opacity = 0.8 * (1 - p);
        return false;
      });
    }
    if (isWin && !levelWon && !levelConfig.isTutorial) {
      levelWon = true;
      if (onWinCallback)
        onWinCallback();
    }
  } else if (obj.type === "path_connect" && obj.targets) {
    const mod = (n, m) => (n % m + m) % m;
    const directions = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
    const getEffectiveEdge = (tile, p) => {
      if (p === 6)
        return 6;
      const r = tile.userData.rotation !== void 0 ? tile.userData.rotation : 0;
      const f = tile.userData.flipped || false;
      return mod((f ? -p : p) + r, 6);
    };
    const startCoords = obj.targets[0];
    const endCoords = obj.targets[1];
    const startTile = tiles.get(`${startCoords.q},${startCoords.r}`);
    const endTile = tiles.get(`${endCoords.q},${endCoords.r}`);
    if (!startTile || !endTile)
      return;
    const visited = /* @__PURE__ */ new Set();
    let isWin = false;
    const tracePath = (currentTile, entryEdge) => {
      const tileKey = `${currentTile.userData.q},${currentTile.userData.r}`;
      if (visited.has(tileKey))
        return false;
      visited.add(tileKey);
      if (currentTile === endTile) {
        if (entryEdge !== null) {
          const { pathEdges: pathEdges2 } = currentTile.userData;
          if (!pathEdges2)
            return false;
          for (const path of pathEdges2) {
            const e1 = getEffectiveEdge(currentTile, path[0]);
            const e2 = getEffectiveEdge(currentTile, path[1]);
            if (e1 === entryEdge || e2 === entryEdge)
              return true;
          }
          return false;
        }
        return true;
      }
      const { pathEdges } = currentTile.userData;
      if (!pathEdges)
        return false;
      for (const path of pathEdges) {
        const e1 = getEffectiveEdge(currentTile, path[0]);
        const e2 = getEffectiveEdge(currentTile, path[1]);
        const attemptTraceFrom = (exitEdge) => {
          if (exitEdge === 6)
            return false;
          const [dq, dr] = directions[exitEdge];
          const nextTile = tiles.get(`${currentTile.userData.q + dq},${currentTile.userData.r + dr}`);
          if (nextTile) {
            return tracePath(nextTile, mod(exitEdge + 3, 6));
          }
          return false;
        };
        if (entryEdge === null) {
          if (e1 !== 6 && attemptTraceFrom(e1))
            return true;
          if (e2 !== 6 && attemptTraceFrom(e2))
            return true;
        } else if (e1 === entryEdge) {
          if (attemptTraceFrom(e2))
            return true;
        } else if (e2 === entryEdge) {
          if (attemptTraceFrom(e1))
            return true;
        }
      }
      visited.delete(tileKey);
      return false;
    };
    isWin = tracePath(startTile, null);
    if (isWin && !levelWon && !levelConfig.isTutorial) {
      levelWon = true;
      if (onWinCallback)
        onWinCallback();
    }
  }
}
function flipTile(source, target) {
  if (!levelConfig || !levelConfig.isTutorial) {
    trackAction("flip", { source: `${source.userData.q},${source.userData.r}`, target: `${target.userData.q},${target.userData.r}` });
    console.log(`[Debug] Flipping tiles: (${source.userData.q}, ${source.userData.r}) <-> (${target.userData.q}, ${target.userData.r})`);
  }
  playSFX("flip");
  isAnimating = true;
  source.position.y = 0;
  const sq = source.userData.q;
  const sr = source.userData.r;
  const tq = target.userData.q;
  const tr = target.userData.r;
  tiles.set(`${tq},${tr}`, source);
  tiles.set(`${sq},${sr}`, target);
  source.userData.q = tq;
  source.userData.r = tr;
  target.userData.q = sq;
  target.userData.r = sr;
  const advanceColorIndex = (tile) => {
    if (!tile.userData.type.startsWith("**") && !tile.userData.type.startsWith("@@") && !tile.userData.type.startsWith("T")) {
      tile.userData.colorIndex = (tile.userData.colorIndex || 0) + 1;
    }
  };
  advanceColorIndex(source);
  advanceColorIndex(target);
  const neighborDirections = { "-1,0": 0, "0,-1": 1, "1,-1": 2, "1,0": 3, "0,1": 4, "-1,1": 5 };
  const flipDir = neighborDirections[`${tq - sq},${tr - sr}`];
  const mod = (n, m) => (n % m + m) % m;
  const sourceR = source.userData.rotation !== void 0 ? source.userData.rotation : 0;
  const sourceF = source.userData.flipped || false;
  const targetR = target.userData.rotation !== void 0 ? target.userData.rotation : 0;
  const targetF = target.userData.flipped || false;
  source.userData.rotation = mod(2 * flipDir + 3 - sourceR, 6);
  source.userData.flipped = !sourceF;
  const targetFlipDir = (flipDir + 3) % 6;
  target.userData.rotation = mod(2 * targetFlipDir + 3 - targetR, 6);
  target.userData.flipped = !targetF;
  const oldPos = axialToWorld(sq, sr);
  const newPos = axialToWorld(tq, tr);
  const dx = newPos.x - oldPos.x;
  const dz = newPos.z - oldPos.z;
  const midX = oldPos.x + dx / 2;
  const midZ = oldPos.z + dz / 2;
  const len = Math.sqrt(dx * dx + dz * dz);
  const axis = new THREE.Vector3(-dz / len, 0, dx / len);
  const pivot = new THREE.Group();
  pivot.position.set(midX, 0, midZ);
  boardGroup.add(pivot);
  pivot.attach(source);
  pivot.attach(target);
  const duration = 500;
  const startTime = performance.now();
  activeTweens.push((time) => {
    let progress = (time - startTime) / duration;
    if (progress > 1)
      progress = 1;
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    pivot.setRotationFromAxisAngle(axis, -Math.PI * ease);
    if (progress === 1) {
      boardGroup.attach(source);
      boardGroup.attach(target);
      boardGroup.remove(pivot);
      source.position.set(newPos.x, 0, newPos.z);
      target.position.set(oldPos.x, 0, oldPos.z);
      setTileType(source);
      setTileType(target);
      stepCount++;
      const stepDisplay = document.getElementById("step-count-display");
      if (stepDisplay) {
        stepDisplay.innerText = `Steps: ${stepCount}`;
      }
      isAnimating = false;
      checkWinCondition();
      return true;
    }
    return false;
  });
}
function performSingleFlip(tile) {
  if (!levelConfig || !levelConfig.isTutorial) {
    trackAction("single_flip", { target: `${tile.userData.q},${tile.userData.r}` });
  }
  playSFX("flip");
  isAnimating = true;
  tile.position.y = 0;
  if (!tile.userData.type.startsWith("**") && !tile.userData.type.startsWith("@@") && !tile.userData.type.startsWith("T")) {
    tile.userData.colorIndex = (tile.userData.colorIndex || 0) + 1;
  }
  const oldR = tile.userData.rotation !== void 0 ? tile.userData.rotation : 0;
  const mod = (n, m) => (n % m + m) % m;
  tile.userData.rotation = mod(-oldR, 6);
  tile.userData.flipped = !(tile.userData.flipped || false);
  const pivot = new THREE.Group();
  pivot.position.copy(tile.position);
  boardGroup.add(pivot);
  pivot.attach(tile);
  const axis = new THREE.Vector3(1, 0, 0);
  const duration = 500;
  const startTime = performance.now();
  activeTweens.push((time) => {
    let progress = (time - startTime) / duration;
    if (progress > 1)
      progress = 1;
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    pivot.setRotationFromAxisAngle(axis, -Math.PI * ease);
    pivot.position.y = Math.sin(ease * Math.PI) * 0.8;
    if (progress === 1) {
      boardGroup.attach(tile);
      boardGroup.remove(pivot);
      tile.position.y = 0;
      setTileType(tile);
      stepCount++;
      const stepDisplay = document.getElementById("step-count-display");
      if (stepDisplay) {
        stepDisplay.innerText = `Steps: ${stepCount}`;
      }
      isAnimating = false;
      checkWinCondition();
      return true;
    }
    return false;
  });
}
function performSingleRotate(tile) {
  if (!levelConfig || !levelConfig.isTutorial) {
    trackAction("single_rotate", { target: `${tile.userData.q},${tile.userData.r}` });
  }
  playSFX("flip");
  isAnimating = true;
  tile.position.y = 0;
  const oldR = tile.userData.rotation !== void 0 ? tile.userData.rotation : 0;
  const mod = (n, m) => (n % m + m) % m;
  tile.userData.rotation = mod(oldR + 1, 6);
  const pivot = new THREE.Group();
  pivot.position.copy(tile.position);
  boardGroup.add(pivot);
  pivot.attach(tile);
  const axis = new THREE.Vector3(0, 1, 0);
  const duration = 400;
  const startTime = performance.now();
  activeTweens.push((time) => {
    let progress = (time - startTime) / duration;
    if (progress > 1)
      progress = 1;
    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    pivot.setRotationFromAxisAngle(axis, -Math.PI / 3 * ease);
    pivot.position.y = Math.sin(ease * Math.PI) * 0.4;
    if (progress === 1) {
      boardGroup.attach(tile);
      boardGroup.remove(pivot);
      tile.position.y = 0;
      stepCount++;
      const stepDisplay = document.getElementById("step-count-display");
      if (stepDisplay) {
        stepDisplay.innerText = `Steps: ${stepCount}`;
      }
      isAnimating = false;
      checkWinCondition();
      return true;
    }
    return false;
  });
}
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();
function getIntersectedObject(event) {
  let clientX = event.clientX;
  let clientY = event.clientY;
  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  }
  mouse.x = clientX / window.innerWidth * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(hitboxes);
  if (intersects.length > 0) {
    const tileGroup = intersects[0].object.userData.tileGroup;
    return { ...intersects[0], object: tileGroup };
  }
  console.log("[Debug] Raycast missed all hitboxes.");
  return null;
}
function onPointerDown(event) {
  if (currentState !== GameState.PLAYING)
    return;
  if (isHintActive) {
    trackAction("hint_dismiss", { method: "board_tap" });
    clearHints();
    return;
  }
  if (isAnimating)
    return;
  isPointerDown = true;
  if (isSingleFlipActive) {
    const hit2 = getIntersectedObject(event);
    if (!hit2) {
      toggleSingleFlipMode();
      return;
    }
    const clickedHex2 = hit2.object;
    if (clickedHex2.userData.q !== void 0 && !isFixedTile(clickedHex2)) {
      performSingleFlip(clickedHex2);
      toggleSingleFlipMode();
      if (onSingleFlipConsumed)
        onSingleFlipConsumed();
    } else {
      toggleSingleFlipMode();
    }
    isPointerDown = false;
    return;
  }
  if (isSingleRotateActive) {
    const hit2 = getIntersectedObject(event);
    if (!hit2) {
      toggleSingleRotateMode();
      return;
    }
    const clickedHex2 = hit2.object;
    if (clickedHex2.userData.q !== void 0 && !isFixedTile(clickedHex2)) {
      performSingleRotate(clickedHex2);
      toggleSingleRotateMode();
      if (onSingleRotateConsumed)
        onSingleRotateConsumed();
    } else {
      toggleSingleRotateMode();
    }
    isPointerDown = false;
    return;
  }
  const hit = getIntersectedObject(event);
  if (!hit) {
    if (selectedTile) {
      selectedTile.position.y = 0;
      selectedTile = null;
    }
    return;
  }
  const clickedHex = hit.object;
  if (clickedHex.userData.q === void 0 || isFixedTile(clickedHex))
    return;
  console.log(`
[Debug] --- Click Started ---`);
  console.log(`[Debug] Hit Point (World):`, hit.point);
  console.log(`[Debug] Tile Data -> q: ${clickedHex.userData.q}, r: ${clickedHex.userData.r}, type: ${clickedHex.userData.type}`);
  const localPoint = boardGroup.worldToLocal(hit.point.clone());
  const center = clickedHex.position;
  const dx = localPoint.x - center.x;
  const dz = localPoint.z - center.z;
  const distFromCenter = Math.sqrt(dx * dx + dz * dz);
  console.log(`[Debug] Local Point:`, localPoint, `| Dist from center:`, distFromCenter);
  if (distFromCenter > 0.6) {
    let closestNeighbor = null;
    let minDistance = Infinity;
    const neighbors = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    neighbors.forEach((n) => {
      const nTile = tiles.get(`${clickedHex.userData.q + n[0]},${clickedHex.userData.r + n[1]}`);
      if (nTile && !isFixedTile(nTile)) {
        const nCenter = nTile.position;
        const distToN = Math.sqrt(Math.pow(localPoint.x - nCenter.x, 2) + Math.pow(localPoint.z - nCenter.z, 2));
        console.log(`[Debug] Checking neighbor [${clickedHex.userData.q + n[0]}, ${clickedHex.userData.r + n[1]}] -> Dist to N:`, distToN);
        if (distToN < minDistance) {
          minDistance = distToN;
          closestNeighbor = nTile;
        }
      }
    });
    console.log(`[Debug] Closest neighbor:`, closestNeighbor ? `(${closestNeighbor.userData.q}, ${closestNeighbor.userData.r}) with dist: ${minDistance}` : "None found");
    if (closestNeighbor) {
      if (isBlockedEdge(clickedHex, closestNeighbor)) {
        isPointerDown = false;
        return;
      }
      if (selectedTile) {
        selectedTile.position.y = 0;
        selectedTile = null;
      }
      flipTile(clickedHex, closestNeighbor);
      isPointerDown = false;
      return;
    }
  }
  if (selectedTile && selectedTile !== clickedHex) {
    if (isHexAdjacent(selectedTile.userData.q, selectedTile.userData.r, clickedHex.userData.q, clickedHex.userData.r)) {
      if (isBlockedEdge(selectedTile, clickedHex)) {
        selectedTile.position.y = 0;
        selectedTile = clickedHex;
        selectedTile.position.y = 0.2;
      } else {
        flipTile(selectedTile, clickedHex);
        selectedTile = null;
        isPointerDown = false;
        return;
      }
    } else {
      selectedTile.position.y = 0;
      selectedTile = clickedHex;
      selectedTile.position.y = 0.2;
    }
  } else if (!selectedTile) {
    selectedTile = clickedHex;
    selectedTile.position.y = 0.2;
  }
  dragStartTile = clickedHex;
}
function onPointerMove(event) {
  if (currentState !== GameState.PLAYING)
    return;
  if (!isPointerDown || isAnimating || !dragStartTile)
    return;
  const hit = getIntersectedObject(event);
  if (!hit)
    return;
  const hoveredHex = hit.object;
  if (hoveredHex.userData.q === void 0 || isFixedTile(hoveredHex))
    return;
  if (hoveredHex !== dragStartTile && isHexAdjacent(dragStartTile.userData.q, dragStartTile.userData.r, hoveredHex.userData.q, hoveredHex.userData.r)) {
    if (isBlockedEdge(dragStartTile, hoveredHex))
      return;
    if (selectedTile) {
      selectedTile.position.y = 0;
      selectedTile = null;
    }
    flipTile(dragStartTile, hoveredHex);
    dragStartTile = null;
    isPointerDown = false;
  }
}
function onPointerUp(event) {
  isPointerDown = false;
  dragStartTile = null;
}

// board.js
var tiles = /* @__PURE__ */ new Map();
var levelConfig = null;
var hitboxes = [];
var walls = /* @__PURE__ */ new Set();
var colorGates = /* @__PURE__ */ new Map();
var wallMeshes = [];
var indGeometry = new THREE.CircleGeometry(0.35, 6, Math.PI / 2);
indGeometry.rotateX(-Math.PI / 2);
var iceTexture = new THREE.TextureLoader().load("ice.webp");
iceTexture.colorSpace = THREE.SRGBColorSpace;
function createTile(q, r, type) {
  const pos = axialToWorld(q, r);
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  if (/^\*+$/.test(type))
    type = "**";
  let staticColors = "";
  let cyclingColors = "";
  let pathStr = "";
  let isTargetMesh = false;
  let isBlocked = false;
  if (type.startsWith("@@")) {
    isTargetMesh = true;
    isBlocked = true;
  } else if (type.startsWith("T")) {
    isTargetMesh = true;
    staticColors = type[1];
    pathStr = type.substring(2).replace(/\*+$/, "");
  } else if (type.startsWith("**")) {
    pathStr = type.substring(2).replace(/\*+$/, "");
  } else if (type.startsWith("[")) {
    let closeIdx = type.indexOf("]");
    if (closeIdx !== -1) {
      let colorsPart = type.substring(1, closeIdx);
      let dashIdx = colorsPart.indexOf("-");
      if (dashIdx !== -1) {
        staticColors = colorsPart.substring(0, dashIdx);
        cyclingColors = colorsPart.substring(dashIdx + 1);
      } else {
        cyclingColors = colorsPart;
      }
      pathStr = type.substring(closeIdx + 1).replace(/\*+$/, "");
    }
  } else {
    cyclingColors = type.substring(0, Math.min(2, type.length));
    if (cyclingColors.length === 1 && type !== "**")
      cyclingColors += cyclingColors;
    pathStr = type.substring(cyclingColors.length).replace(/\*+$/, "");
  }
  let pathType = null;
  let initialRot = 0;
  if (pathStr) {
    const lastChar = pathStr[pathStr.length - 1];
    if (/[0-5]/.test(lastChar)) {
      initialRot = parseInt(lastChar, 10);
      pathType = pathStr.length > 1 ? pathStr[0] : "0";
      if (pathType === "*" || /[0-5]/.test(pathType))
        pathType = "0";
    } else {
      pathType = pathStr[0];
      initialRot = 0;
    }
  }
  if (isTargetMesh && pathType === "*")
    pathType = null;
  const pathEdges = pathType ? pathData[pathType] : null;
  let firstColor = staticColors.length > 0 ? staticColors[0] : cyclingColors.length > 0 ? cyclingColors[0] : "*";
  let topColorKey = firstColor;
  let nextColor = "*";
  if (staticColors.length > 1)
    nextColor = staticColors[1];
  else if (staticColors.length === 1 && cyclingColors.length > 0)
    nextColor = cyclingColors[0];
  else if (cyclingColors.length > 1)
    nextColor = cyclingColors[1];
  else if (cyclingColors.length === 1)
    nextColor = cyclingColors[0];
  let botColorKey = nextColor;
  const pathModelData = pathType ? getPathModelData(pathType) : null;
  let topModelToUse = isTargetMesh ? modelLibrary.hex : pathModelData?.model || modelLibrary.tile;
  let botModelToUse = isTargetMesh ? modelLibrary.hex : pathModelData?.model || modelLibrary.tile;
  const step = -Math.PI / 3;
  let meshRotation = initialRot * step + (pathModelData?.rot || 0);
  let useProceduralPath = !pathModelData?.model;
  let usingFallback = false;
  if (!topModelToUse || !botModelToUse) {
    console.warn(`[Board] Missing model for tile type '${type}'. Using fallback geometry.`);
    if (!topModelToUse)
      topModelToUse = modelLibrary.hex || modelLibrary.tile;
    if (!botModelToUse)
      botModelToUse = modelLibrary.hex || modelLibrary.tile;
    usingFallback = true;
  }
  const topMesh = topModelToUse.clone();
  topMesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = Array.isArray(child.material) ? child.material.map((m) => {
        const nm = m.clone();
        setupProjectedMaterial(nm);
        return nm;
      }) : (() => {
        const nm = child.material.clone();
        setupProjectedMaterial(nm);
        return nm;
      })();
    }
  });
  topMesh.rotation.order = "YXZ";
  topMesh.rotation.y = meshRotation;
  const botMesh = botModelToUse.clone();
  botMesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = Array.isArray(child.material) ? child.material.map((m) => {
        const nm = m.clone();
        setupProjectedMaterial(nm);
        return nm;
      }) : (() => {
        const nm = child.material.clone();
        setupProjectedMaterial(nm);
        return nm;
      })();
    }
  });
  botMesh.rotation.order = "YXZ";
  botMesh.rotation.y = meshRotation;
  botMesh.scale.y = -1;
  group.add(topMesh);
  group.add(botMesh);
  const isPathTarget = levelConfig?.objective?.type === "path_connect" && levelConfig.objective.targets?.some((t) => t.q === q && t.r === r);
  const frozenConfig = levelConfig?.frozen || {};
  const freezeLevel = frozenConfig[`${q},${r}`] || 0;
  group.userData = {
    q,
    r,
    type,
    rotation: initialRot,
    flipped: false,
    pathEdges,
    isPathTarget,
    usingFallback,
    freezeLevel,
    staticColors,
    cyclingColors,
    colorIndex: 0,
    isTarget: isTargetMesh,
    isBlocked,
    path: pathStr
  };
  if ((staticColors || cyclingColors) && topColorKey !== "*" && topColorKey !== "@" && !isTargetMesh) {
    const createIndicatorMaterial = (colorKey) => {
      if (!colorHexes[colorKey])
        return new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.7 });
      return new THREE.MeshStandardMaterial({ color: colorHexes[colorKey], roughness: 0.7 });
    };
    const topInd = new THREE.Mesh(indGeometry, createIndicatorMaterial(botColorKey));
    topInd.position.y = hexHeight / 2 + 1e-3;
    group.add(topInd);
    const botInd = new THREE.Mesh(indGeometry, createIndicatorMaterial(topColorKey));
    botInd.position.y = -hexHeight / 2 - 1e-3;
    botInd.rotation.x = Math.PI;
    group.add(botInd);
    group.userData.topInd = topInd;
    group.userData.botInd = botInd;
  }
  if (useProceduralPath && pathEdges) {
    const topPathMesh = createPathMesh(pathEdges, isPathTarget);
    topPathMesh.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        c.material.name = "path";
        setupProjectedMaterial(c.material);
        c.material.userData.shaderUniforms.uBaseBoost.value = 1;
      }
    });
    topPathMesh.position.y = hexHeight / 2 + 2e-3;
    topMesh.add(topPathMesh);
    const bottomPathMesh = createPathMesh(pathEdges, isPathTarget);
    bottomPathMesh.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        c.material.name = "path";
        setupProjectedMaterial(c.material);
        c.material.userData.shaderUniforms.uBaseBoost.value = 1;
      }
    });
    bottomPathMesh.position.y = -hexHeight / 2 - 2e-3;
    botMesh.add(bottomPathMesh);
  }
  if (freezeLevel > 0) {
    const iceMat = new THREE.MeshStandardMaterial({
      color: 65535,
      map: iceTexture,
      transparent: true,
      opacity: 1,
      roughness: 0.1,
      metalness: 0.2
    });
    const iceGeom = hitboxGeometry.clone();
    iceGeom.scale(0.96, 2.2, 0.96);
    const iceMesh = new THREE.Mesh(iceGeom, iceMat);
    iceMesh.position.y = 0;
    group.add(iceMesh);
    group.userData.iceMesh = iceMesh;
  }
  const hitboxMesh = new THREE.Mesh(hitboxGeometry, new THREE.MeshBasicMaterial({ visible: false }));
  hitboxMesh.userData.tileGroup = group;
  group.add(hitboxMesh);
  boardGroup.add(group);
  tiles.set(`${q},${r}`, group);
  hitboxes.push(hitboxMesh);
  setTileType(group);
  return group;
}
function getCurrentColor(tile, offset = 0) {
  let type = tile.userData.type;
  if (type.startsWith("**") || type.startsWith("@@") || type.startsWith("T")) {
    return type.startsWith("T") ? type[1] : "*";
  }
  let sc = tile.userData.staticColors || "";
  let cc = tile.userData.cyclingColors || "";
  let idx = (tile.userData.colorIndex || 0) + offset;
  if (idx < sc.length) {
    return sc[idx];
  } else {
    let cIdx = idx - sc.length;
    if (cc.length > 0) {
      return cc[cIdx % cc.length];
    } else {
      return sc.length > 0 ? sc[sc.length - 1] : "*";
    }
  }
}
function setTileType(tile, unusedType) {
  const isTargetMesh = tile.userData.isTarget;
  let topColorKey = getCurrentColor(tile, 0);
  let botColorKey = getCurrentColor(tile, 1);
  const topStyle = { color: colorHexes[topColorKey] || "#ffffff", emissive: isTargetMesh, colorKey: topColorKey };
  const botStyle = { color: colorHexes[botColorKey] || "#ffffff", emissive: false, colorKey: botColorKey };
  if (tile.userData.topInd && tile.userData.botInd) {
    let indTopMat = new THREE.MeshStandardMaterial({ color: colorHexes[botColorKey] || "#fff", roughness: 0.7 });
    let indBotMat = new THREE.MeshStandardMaterial({ color: colorHexes[topColorKey] || "#fff", roughness: 0.7 });
    if (tile.userData.flipped) {
      tile.userData.botInd.material = indTopMat;
      tile.userData.topInd.material = indBotMat;
    } else {
      tile.userData.topInd.material = indTopMat;
      tile.userData.botInd.material = indBotMat;
    }
  }
  if (tile.children.length >= 2) {
    const topObj = tile.children[0];
    const botObj = tile.children[1];
    if (tile.userData.flipped) {
      applyTileStyle(botObj, topStyle, isTargetMesh, tile);
      applyTileStyle(topObj, botStyle, isTargetMesh, tile);
    } else {
      applyTileStyle(topObj, topStyle, isTargetMesh, tile);
      applyTileStyle(botObj, botStyle, isTargetMesh, tile);
    }
  }
}
function applyTileStyle(meshObj, style, isTargetMesh, tile, darkenFactor = 1) {
  meshObj.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        const isPath = mat.name === "path";
        const colorObj = isPath ? new THREE.Color(16777215) : new THREE.Color(style.color);
        let brightness = 1;
        if (isTargetMesh) {
          colorObj.multiplyScalar(1.2);
          brightness *= 1.2;
        }
        if (tile.userData.iceMesh) {
          colorObj.multiplyScalar(1.3);
          brightness *= 1.3;
        }
        if (darkenFactor !== 1) {
          colorObj.multiplyScalar(darkenFactor);
          brightness *= darkenFactor;
        }
        mat.color.set(colorObj);
        if (mat.userData.shaderUniforms) {
          mat.userData.shaderUniforms.uBaseBoost.value = isPath ? 1 : isTargetMesh ? 1.2 : 3.5;
          const tex = symbolTextures[style.colorKey];
          if (tex && !isTargetMesh && style.colorKey !== "@" && !isPath) {
            mat.userData.shaderUniforms.projectedMap.value = tex;
            mat.userData.shaderUniforms.useProjectedMap.value = 1;
            mat.userData.shaderUniforms.uBrightness.value = brightness;
          } else {
            mat.userData.shaderUniforms.useProjectedMap.value = 0;
          }
        }
        if (isPath) {
        } else if (style.emissive && darkenFactor === 1) {
          mat.emissive.set(colorObj);
          mat.emissiveIntensity = 0.4;
          mat.userData.isTargetEmissive = true;
        } else {
          mat.emissive.set(0);
          mat.emissiveIntensity = 0;
          mat.userData.isTargetEmissive = false;
        }
      });
    }
  });
}
function generateBoardShadow() {
  if (tiles.size === 0)
    return;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  tiles.forEach((tile) => {
    if (tile.position.x < minX)
      minX = tile.position.x;
    if (tile.position.x > maxX)
      maxX = tile.position.x;
    if (tile.position.z < minZ)
      minZ = tile.position.z;
    if (tile.position.z > maxZ)
      maxZ = tile.position.z;
  });
  const padding = 3;
  minX -= padding;
  maxX += padding;
  minZ -= padding;
  maxZ += padding;
  const width = maxX - minX;
  const height = maxZ - minZ;
  const pxPerUnit = 64;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * pxPerUnit);
  canvas.height = Math.ceil(height * pxPerUnit);
  const ctx = canvas.getContext("2d");
  ctx.filter = "blur(20px)";
  ctx.fillStyle = "black";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 0.9 * pxPerUnit;
  ctx.lineJoin = "round";
  const r = hexRadius * pxPerUnit;
  tiles.forEach((tile) => {
    const cx = (tile.position.x - minX) * pxPerUnit;
    const cy = (tile.position.z - minZ) * pxPerUnit;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const px = cx + Math.sin(a) * r;
      const py = cy + Math.cos(a) * r;
      if (i === 0)
        ctx.moveTo(px, py);
      else
        ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  if (wallMeshes && wallMeshes.length > 0) {
    ctx.strokeStyle = "black";
    ctx.lineWidth = 0.9 * pxPerUnit;
    ctx.lineCap = "round";
    wallMeshes.forEach((wall) => {
      const cx = (wall.position.x - minX) * pxPerUnit;
      const cy = (wall.position.z - minZ) * pxPerUnit;
      const halfLen = hexRadius * 1.05 / 2 * pxPerUnit;
      const dx = Math.cos(wall.rotation.y) * halfLen;
      const dy = -Math.sin(wall.rotation.y) * halfLen;
      ctx.beginPath();
      ctx.moveTo(cx - dx, cy - dy);
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  let shadowMesh = boardGroup.userData.shadowMesh;
  if (!shadowMesh) {
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      // 80% opacity matching the mockup
      depthWrite: false
    });
    const geom = new THREE.PlaneGeometry(1, 1);
    shadowMesh = new THREE.Mesh(geom, mat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.renderOrder = -1;
    boardGroup.add(shadowMesh);
    boardGroup.userData.shadowMesh = shadowMesh;
  } else {
    shadowMesh.material.map.dispose();
    shadowMesh.material.map = texture;
  }
  const offset = 4 / pxPerUnit;
  const offsetX = window.innerWidth < window.innerHeight ? offset : 0;
  const offsetZ = window.innerWidth < window.innerHeight ? 0 : offset;
  shadowMesh.scale.set(width, height, 1);
  shadowMesh.position.set((minX + maxX) / 2 + offsetX, -0.5, (minZ + maxZ) / 2 + offsetZ);
}
async function loadLevels() {
  const response = await fetch("levels.json");
  return await response.json();
}
function buildLevel(config) {
  levelConfig = config;
  completedZones.clear();
  activeTweens.length = 0;
  tiles.clear();
  walls.clear();
  colorGates.clear();
  hitboxes.length = 0;
  wallMeshes.forEach((m) => boardGroup.remove(m));
  wallMeshes.length = 0;
  if (boardGroup.userData.shadowMesh) {
    if (boardGroup.userData.shadowMesh.material.map)
      boardGroup.userData.shadowMesh.material.map.dispose();
    boardGroup.userData.shadowMesh.material.dispose();
    boardGroup.userData.shadowMesh.geometry.dispose();
    boardGroup.userData.shadowMesh = null;
  }
  while (boardGroup.children.length > 0) {
    boardGroup.remove(boardGroup.children[0]);
  }
  if (config.staticMap) {
    let halfRows = Math.floor(config.staticMap.length / 2);
    for (let i = 0; i < config.staticMap.length; i++) {
      let r = i - halfRows;
      const rowTiles = config.staticMap[i].trim().split(/\s+/).filter((t) => t.length > 0);
      const N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        const s = rowTiles[j];
        let matchZ = s.match(/Z(\d+)/);
        if (matchZ) {
          if (!config.zones)
            config.zones = {};
          config.zones[`${q},${r}`] = parseInt(matchZ[1], 10);
        }
        let matchF = s.match(/F(\d+)/);
        if (matchF) {
          if (!config.frozen)
            config.frozen = {};
          config.frozen[`${q},${r}`] = parseInt(matchF[1], 10);
        }
        let matchW = s.match(/W([1-6]+)/);
        if (matchW) {
          if (!config.walls)
            config.walls = [];
          let dirs = matchW[1].split("").map(Number);
          dirs.forEach((d) => {
            let edge = d - 1;
            const neighbors = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
            let nq = q + neighbors[edge][0];
            let nr = r + neighbors[edge][1];
            let k1 = `${q},${r}`;
            let k2 = `${nq},${nr}`;
            let wallKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
            if (!config.walls.includes(wallKey))
              config.walls.push(wallKey);
          });
        }
        let matchC = [...s.matchAll(/C([a-zA-Z]+)([1-6]+)/g)];
        if (matchC.length > 0) {
          if (!config.colorGates)
            config.colorGates = {};
          matchC.forEach((m) => {
            let colors = m[1];
            let dirs = m[2].split("").map(Number);
            dirs.forEach((d) => {
              let edge = d - 1;
              const neighbors = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
              let nq = q + neighbors[edge][0];
              let nr = r + neighbors[edge][1];
              let k1 = `${q},${r}`;
              let k2 = `${nq},${nr}`;
              let wallKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
              config.colorGates[wallKey] = colors;
            });
          });
        }
        if (s.includes("@@")) {
          createTile(q, r, "@@");
        } else {
          let matchT = s.match(/T([a-zA-Z*])/);
          let matchE = s.match(/E([a-zA-Z*])?([1-6])/);
          if (matchT) {
            createTile(q, r, "T" + matchT[1]);
          } else if (matchE) {
            let c = matchE[1] || "*";
            let dir = parseInt(matchE[2], 10) - 1;
            createTile(q, r, c + c + "0" + dir);
          } else {
            createTile(q, r, "**");
          }
        }
      }
    }
  } else if (config.map) {
    let halfRows = Math.floor(config.map.length / 2);
    for (let i = 0; i < config.map.length; i++) {
      let r = i - halfRows;
      const rowTiles = config.map[i].trim().split(/\s+/).filter((t) => t.length > 0);
      const N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        const type = rowTiles[j];
        createTile(q, r, type);
      }
    }
  }
  if (config.staticMap && config.map) {
    let halfRows = Math.floor(config.map.length / 2);
    for (let i = 0; i < config.map.length; i++) {
      let r = i - halfRows;
      const rowTiles = config.map[i].trim().split(/\s+/).filter((t) => t.length > 0);
      const N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        const type = rowTiles[j];
        if (!/^\*+$/.test(type)) {
          const existing = tiles.get(`${q},${r}`);
          if (existing) {
            boardGroup.remove(existing);
            const index = hitboxes.findIndex((h) => h.userData.tileGroup === existing);
            if (index > -1)
              hitboxes.splice(index, 1);
          }
          createTile(q, r, type);
        }
      }
    }
  } else if (config.initial) {
    config.initial.forEach((p) => {
      const existing = tiles.get(`${p.q},${p.r}`);
      if (existing) {
        boardGroup.remove(existing);
        const index = hitboxes.findIndex((h) => h.userData.tileGroup === existing);
        if (index > -1)
          hitboxes.splice(index, 1);
      }
      createTile(p.q, p.r, p.type);
    });
  }
  if (config.walls) {
    config.walls.forEach((w) => walls.add(w));
    config.walls.forEach((wallKey) => {
      const [k1, k2] = wallKey.split("|");
      const p1 = axialToWorld(...k1.split(",").map(Number));
      const p2 = axialToWorld(...k2.split(",").map(Number));
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const angle = Math.atan2(dx, dz);
      const wallGeom = new THREE.BoxGeometry(hexRadius * 1.05, hexHeight * 2, 0.15);
      const wallMat = new THREE.MeshStandardMaterial({ color: 15158332, roughness: 0.5, metalness: 0.2 });
      const wallMesh = new THREE.Mesh(wallGeom, wallMat);
      wallMesh.position.set(midX, hexHeight * 0.5, midZ);
      wallMesh.rotation.y = angle;
      boardGroup.add(wallMesh);
      wallMeshes.push(wallMesh);
    });
  }
  if (config.colorGates) {
    Object.entries(config.colorGates).forEach(([wallKey, colors]) => {
      colorGates.set(wallKey, colors);
      const [k1, k2] = wallKey.split("|");
      const p1 = axialToWorld(...k1.split(",").map(Number));
      const p2 = axialToWorld(...k2.split(",").map(Number));
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const angle = Math.atan2(dx, dz);
      const numColors = colors.length;
      const segmentLength = hexRadius * 1.05 / numColors;
      for (let i = 0; i < numColors; i++) {
        const colorChar = colors[i];
        const hexColor = colorHexes[colorChar] || "#ffffff";
        const wallGeom = new THREE.BoxGeometry(segmentLength, hexHeight * 1.2, 0.15);
        const wallMat = new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.8 });
        const wallMesh = new THREE.Mesh(wallGeom, wallMat);
        const offsetAmount = (i - (numColors - 1) / 2) * segmentLength;
        wallMesh.position.set(
          midX + Math.cos(angle) * offsetAmount,
          hexHeight * 0.3,
          midZ - Math.sin(angle) * offsetAmount
        );
        wallMesh.rotation.y = angle;
        boardGroup.add(wallMesh);
        wallMeshes.push(wallMesh);
      }
    });
  }
  generateBoardShadow();
}

// ui.js
function initUI() {
  const screens = {
    [GameState.SPLASH]: document.getElementById("splash-screen"),
    [GameState.HOME]: document.getElementById("home-screen"),
    [GameState.PLAYING]: document.getElementById("game-hud"),
    [GameState.LEVEL_SELECT]: document.getElementById("level-select-screen"),
    [GameState.MINIGAME]: document.getElementById("minigame-container"),
    [GameState.LEVEL_COMPLETE]: document.getElementById("level-complete-screen"),
    [GameState.PUZZLE]: document.getElementById("puzzle-screen"),
    [GameState.INTERLUDE]: document.getElementById("interlude-screen")
  };
  boardGroup.visible = false;
  onStateChange((newState, oldState) => {
    Object.values(screens).forEach((el) => {
      if (el)
        el.style.display = "none";
    });
    const activeScreen = screens[newState];
    if (activeScreen) {
      activeScreen.style.display = "block";
    }
    if ([GameState.SPLASH, GameState.HOME, GameState.LEVEL_SELECT, GameState.PUZZLE, GameState.MINIGAME].includes(newState)) {
      boardGroup.visible = false;
    } else {
      boardGroup.visible = true;
    }
  });
}

// flags.js
var FF_DEBUG_STORE = false;
var APP_VERSION = "0.12.0";

// platform.js
var isStoreSupported = true;
var areAdsSupported = true;
var isAdLoading = false;
function toggleLoadingOverlay(show) {
  const overlay = document.getElementById("ad-loading-overlay");
  if (overlay) {
    overlay.style.display = show ? "flex" : "none";
  }
}
async function initPlatform() {
  console.log("[Platform] Initialized local mock platform.");
  return true;
}
async function showAd(type) {
  if (!areAdsSupported)
    return true;
  if (isAdLoading) {
    console.log(`[Platform] ${type} Ad is already loading, skipping request.`);
    return false;
  }
  isAdLoading = true;
  toggleLoadingOverlay(true);
  return new Promise((resolve) => {
    console.log(`[Platform] Loading mock ad: ${type}`);
    setTimeout(() => {
      toggleLoadingOverlay(false);
      console.log(`[Platform] Showing mock ad: ${type}`);
      const container = document.getElementById("ads-container");
      if (container)
        container.style.display = "block";
      setTimeout(() => {
        if (container)
          container.style.display = "none";
        console.log("[Platform] Mock ad finished.");
        isAdLoading = false;
        resolve(true);
      }, 1500);
    }, 800);
  });
}
async function showPrivacyOptions() {
  console.log("[Platform] Mock showing privacy options form.");
  alert("The AdMob privacy consent form would appear here on a real device.");
}
async function initStore() {
  if (!isStoreSupported)
    return;
  console.log("[Platform] Mock Store initialized (Using hardcoded HTML prices).");
}
async function purchaseItem(id, price, name) {
  if (!isStoreSupported)
    return false;
  return new Promise((resolve) => resolve(confirm(`Buy ${name} for $${price}? (Simulated Purchase)`)));
}
async function saveData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn("[Platform] Failed to save local data:", e);
    return false;
  }
}
async function loadData(key) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.warn("[Platform] Failed to load local data:", e);
    return null;
  }
}
async function getAppVersion() {
  return APP_VERSION || null;
}

// ads.js
async function initAds() {
  await initPlatform();
}
function showAd2(type) {
  return showAd(type);
}

// puzzle.js
var PUZZLE_12_PATHS = [
  "M90.23 33.34a13.5 13.5 0 1 0 0 23.82V90.23H57.16A13.5 13.5 0 1 0 33.34 90.23H-0.01V0h90.23z",
  "M45.25 70.38A13.5 13.5 0 0 1 57.15 90.23h33.08v33.33a13.5 13.5 0 1 0 0 23.82v33.07H57.16a13.5 13.5 0 1 1-23.82 0H-0.01V90.23H33.34a13.5 13.5 0 0 1 11.9-19.84",
  "M90.23 213.79a13.5 13.5 0 1 1 0 23.82v33.06H57.16a13.5 13.5 0 1 1-23.82 0H-0.01v-90.22H33.34a13.5 13.5 0 1 0 23.82 0h33.07z",
  "M90.23 304.01a13.5 13.5 0 1 0 0 23.82v33.07H-0.01v-90.23H33.34a13.5 13.5 0 1 0 23.82 0h33.07z",
  "M180.45 33.34a13.5 13.5 0 1 0 0 23.82V90.23h-33.07a13.5 13.5 0 1 1-23.82 0H90.23V57.16a13.5 13.5 0 1 1 0-23.82V0h90.22z",
  "M123.56 90.23a13.5 13.5 0 1 0 23.82 0h33.07v33.33a13.5 13.5 0 1 0 0 23.82v33.07h-33.07a13.5 13.5 0 1 0-23.82 0H90.23v-33.07a13.5 13.5 0 1 1 0-23.82V90.23Z",
  "M135.47 160.61a13.5 13.5 0 0 1 11.9 19.84h33.08v33.34a13.5 13.5 0 1 1 0 23.82v33.06h-33.07a13.5 13.5 0 1 1-23.82 0H90.23v-33.07a13.5 13.5 0 1 0 0-23.82v-33.33h33.33a13.5 13.5 0 0 1 11.9-19.84",
  "M180.45 304.01a13.5 13.5 0 1 0 0 23.82v33.07H90.23V327.83a13.5 13.5 0 1 1 0-23.82v-33.34h33.33a13.5 13.5 0 1 0 23.82 0h33.07z",
  "M270.67 90.23h-33.07a13.5 13.5 0 1 0-23.82 0h-33.33V57.16a13.5 13.5 0 1 1 0-23.82V0h90.22z",
  "M225.69 70.38A13.5 13.5 0 0 1 237.6 90.23h33.07v90.22h-33.07a13.5 13.5 0 1 1-23.82 0h-33.33v-33.07a13.5 13.5 0 1 1 0-23.82V90.23h33.34a13.5 13.5 0 0 1 11.9-19.84",
  "M270.67 270.67h-33.07a13.5 13.5 0 1 1-23.82 0h-33.33v-33.07a13.5 13.5 0 1 0 0-23.82v-33.33h33.34a13.5 13.5 0 1 0 23.82 0h33.06z",
  "M270.67 360.9h-90.22V327.83a13.5 13.5 0 1 1 0-23.82v-33.34h33.34a13.5 13.5 0 1 0 23.82 0h33.06z"
];
var PUZZLE_24_PATHS = [
  "m 67.6,0.13 v 25.1 l 0.2,-0.1 a 9.92,9.92 0 1 1 0,17.48 l -0.2,-0.1 v 25.1 H 42.5 l 0.1,0.19 a 9.92,9.92 0 1 1 -17.48,0 l 0.11,-0.2 H 0.13 V 0.13 Z",
  "m 24.8,67.87 a 10.19,10.19 0 1 0 18.15,0 H 67.6 v 24.65 a 10.19,10.19 0 1 0 0,18.15 v 24.66 H 42.5 l 0.1,0.2 a 9.92,9.92 0 1 1 -17.48,0 l 0.11,-0.2 H 0.13 V 67.87 Z",
  "m 24.8,135.6 a 10.19,10.19 0 1 0 18.15,0 H 67.6 v 24.66 a 10.19,10.19 0 1 0 0,18.15 v 24.66 H 42.5 l 0.1,0.2 a 9.92,9.92 0 1 1 -17.48,0 l 0.11,-0.2 H 0.13 V 135.6 Z",
  "m 24.8,203.33 a 10.19,10.19 0 1 0 18.15,0 H 67.6 v 25.1 l 0.2,-0.1 a 9.92,9.92 0 1 1 0,17.48 l -0.2,-0.1 v 25.1 H 42.5 l 0.1,0.19 a 9.92,9.92 0 1 1 -17.48,0 l 0.11,-0.2 H 0.13 v -67.47 z",
  "m 24.8,271.07 a 10.19,10.19 0 1 0 18.15,0 H 67.6 v 25.1 l 0.2,-0.1 a 9.92,9.92 0 1 1 0,17.48 l -0.2,-0.11 v 25.1 H 42.5 l 0.1,0.19 a 9.92,9.92 0 1 1 -17.48,0 l 0.11,-0.2 H 0.13 v -67.46 z",
  "m 24.8,338.8 c -3.462697,6.78015 1.461949,14.82461 9.075,14.82461 7.613051,0 12.537697,-8.04446 9.075,-14.82461 H 67.6 v 25.1 l 0.2,-0.1 c 6.608739,-3.54817 14.612312,1.23916 14.612312,8.74 0,7.50084 -8.003573,12.28817 -14.612312,8.74 l -0.2,-0.11 v 25.1 H 0.13 V 338.8 Z",
  "m 92.52,67.87 a 10.19,10.19 0 1 0 18.15,0 h 24.66 v 25.1 l 0.2,-0.11 a 9.92,9.92 0 1 1 0,17.48 l -0.2,-0.1 v 25.1 h -24.65 a 10.19,10.19 0 1 0 -18.15,0 H 67.86 v -25.1 l -0.2,0.1 a 9.92,9.92 0 1 1 0,-17.48 l 0.2,0.1 v -25.1 z",
  "m 101.6,120.78 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 25.1 l 0.19,-0.1 a 9.92,9.92 0 1 1 0,17.48 l -0.2,-0.11 v 25.1 h -24.65 a 10.19,10.19 0 1 0 -18.15,0 H 67.86 v -25.1 l -0.2,0.1 a 9.92,9.92 0 1 1 0,-17.48 l 0.2,0.1 v -25.1 h 25.1 l -0.11,-0.19 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "m 101.6,188.52 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 25.1 l 0.19,-0.11 a 9.92,9.92 0 1 1 0,17.48 l -0.2,-0.1 v 25.1 h -24.65 a 10.19,10.19 0 1 0 -18.15,0 H 67.86 v -24.67 a 10.19,10.19 0 1 0 0,-18.15 v -24.66 h 25.1 l -0.11,-0.2 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "m 101.6,256.25 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 25.1 l 0.19,-0.1 a 9.92,9.92 0 1 1 0,17.48 l -0.2,-0.11 v 25.1 h -24.65 a 10.19,10.19 0 1 0 -18.15,0 H 67.86 v -24.66 a 10.19,10.19 0 1 0 0,-18.15 v -24.66 h 25.1 l -0.11,-0.2 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "M 203.07,0.13 V 24.8 c -6.78015,-3.462697 -14.82461,1.461949 -14.82461,9.075 0,7.613051 8.04446,12.537697 14.82461,9.075 V 67.6 H 178.4 c 3.4627,-6.780149 -1.46195,-14.824605 -9.075,-14.824605 -7.61305,0 -12.5377,8.044456 -9.075,14.824605 H 135.6 V 42.5 l -0.2,0.1 c -6.60874,3.548167 -14.61231,-1.239164 -14.61231,-8.74 0,-7.500836 8.00357,-12.288167 14.61231,-8.74 l 0.2,0.11 V 0.13 Z",
  "m 169.33,53.05 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 24.65 a 10.19,10.19 0 1 0 0,18.15 v 24.66 H 178.4 a 10.19,10.19 0 1 0 -18.15,0 H 135.6 v -24.66 a 10.19,10.19 0 1 0 0,-18.15 V 67.87 h 25.1 l -0.1,-0.2 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "m 169.33,120.78 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 24.66 a 10.19,10.19 0 1 0 0,18.15 v 24.66 h -25.1 l 0.1,0.2 a 9.92,9.92 0 1 1 -17.48,0 l 0.1,-0.2 h -25.1 V 178.4 a 10.19,10.19 0 1 0 0,-18.15 V 135.6 h 25.1 l -0.1,-0.2 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "m 160.26,203.33 a 10.19,10.19 0 1 0 18.15,0 h 24.66 V 228 a 10.19,10.19 0 1 0 0,18.15 v 24.66 H 178.4 a 10.19,10.19 0 1 0 -18.15,0 H 135.6 v -24.66 a 10.19,10.19 0 1 0 0,-18.15 v -24.66 z",
  "m 169.33,256.25 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 24.65 a 10.19,10.19 0 1 0 0,18.15 v 24.66 H 178.4 a 10.19,10.19 0 1 0 -18.15,0 H 135.6 v -24.65 a 10.19,10.19 0 1 0 0,-18.15 v -24.66 h 25.1 l -0.1,-0.2 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "M 270.8,0.13 V 67.6 h -24.66 c 3.4627,-6.780149 -1.46195,-14.824605 -9.075,-14.824605 -7.61305,0 -12.5377,8.044456 -9.075,14.824605 H 203.33 V 42.5 l -0.2,0.1 c -6.60874,3.548167 -14.61231,-1.239164 -14.61231,-8.74 0,-7.500836 8.00357,-12.288167 14.61231,-8.74 l 0.2,0.11 V 0.13 Z",
  "m 237.07,53.05 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 67.46 h -24.67 a 10.19,10.19 0 1 0 -18.15,0 h -24.66 v -25.1 l -0.2,0.11 a 9.92,9.92 0 1 1 0,-17.48 l 0.2,0.1 v -25.1 h 25.1 l -0.1,-0.19 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "m 237.07,120.78 a 9.92,9.92 0 0 1 8.74,14.62 l -0.1,0.2 h 25.1 v 67.47 h -25.1 l 0.1,0.2 a 9.92,9.92 0 1 1 -17.48,0 l 0.1,-0.2 h -25.1 v -25.1 l -0.2,0.1 a 9.92,9.92 0 1 1 0,-17.48 l 0.2,0.1 v -25.1 h 25.1 l -0.1,-0.19 a 9.92,9.92 0 0 1 8.74,-14.62 z",
  "m 228,203.33 a 10.19,10.19 0 1 0 18.15,0 h 24.65 v 67.47 h -25.1 l 0.1,0.2 a 9.92,9.92 0 1 1 -17.48,0 l 0.11,-0.2 h -25.1 v -25.1 l -0.2,0.1 a 9.92,9.92 0 1 1 0,-17.48 l 0.2,0.11 v -25.1 z",
  "m 228,271.07 a 10.19,10.19 0 1 0 18.15,0 h 24.65 v 67.46 h -25.1 l 0.1,0.2 a 9.92,9.92 0 1 1 -17.48,0 l 0.11,-0.2 h -25.1 v -25.1 l -0.2,0.1 a 9.92,9.92 0 1 1 0,-17.48 l 0.2,0.11 v -25.1 z",
  "m 228,338.8 a 10.19,10.19 0 1 0 18.15,0 h 24.65 v 67.47 H 203.33 V 381.6 a 10.19,10.19 0 1 0 0,-18.15 V 338.8 Z",
  "m 135.33,0.13 v 24.669999 c -6.78015,-3.462697 -14.82461,1.461949 -14.82461,9.075 0,7.613051 8.04446,12.537697 14.82461,9.075 v 24.65 h -25.1 l 0.11,0.2 c 3.54817,6.608739 -1.23916,14.612312 -8.74,14.612312 -7.50084,0 -12.28817,-8.003573 -8.74,-14.612312 l 0.1,-0.2 h -25.1 v -24.66 c 6.78015,3.462697 14.82461,-1.461949 14.82461,-9.075 0,-7.613051 -8.04446,-12.537697 -14.82461,-9.075 V 0.13 Z",
  "m 101.59576,323.97522 c 7.50648,-0.003 12.2965,8.00951 8.74,14.62 l -0.1,0.2 h 25.1 v 24.66 c -6.78015,-3.4627 -14.82461,1.46195 -14.82461,9.075 0,7.61305 8.04446,12.5377 14.82461,9.075 v 24.66 H 67.855777 v -24.67 c 6.78015,3.4627 14.82461,-1.46195 14.82461,-9.075 0,-7.61305 -8.04446,-12.5377 -14.82461,-9.075 v -24.65 h 25.1 l -0.11,-0.2 c -3.5565,-6.61049 1.23352,-14.62308 8.739983,-14.62 z",
  "m 169.32903,323.97522 c 7.50648,-0.003 12.2965,8.00951 8.74,14.62 l -0.1,0.2 h 25.1 v 25.1 l 0.2,-0.1 c 6.60874,-3.54817 14.61231,1.23916 14.61231,8.74 0,7.50084 -8.00357,12.28817 -14.61231,8.74 l -0.2,-0.11 v 25.1 h -67.47 v -25.1 l -0.2,0.1 c -6.60874,3.54817 -14.61231,-1.23916 -14.61231,-8.74 0,-7.50084 8.00357,-12.28817 14.61231,-8.74 l 0.2,0.1 v -25.1 h 25.1 l -0.1,-0.19 c -3.5565,-6.61049 1.23352,-14.62308 8.74,-14.62 z"
];
var PUZZLE_35_PATHS = [
  "M 53.842292,0.13132561 V 19.801326 a 8.2,8.2 0 1 0 0,14.64 v 19.4 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 H 0.1322915 V 0.14132561 Z",
  "m 27.122292,42.201326 a 7.94,7.94 0 0 1 6.99,11.71 l -0.1,0.2 h 19.83 v 19.66 a 8.2,8.2 0 1 0 0,14.64 v 19.399994 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 H 0.1322915 V 54.111326 H 20.242292 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 27.122292,96.18133 a 7.94,7.94 0 0 1 6.99,11.69999 l -0.1,0.2 h 19.83 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 H 0.1322915 v -53.7 H 20.242292 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.70999 z",
  "m 27.122292,150.15132 a 7.94,7.94 0 0 1 6.99,11.71 l -0.1,0.2 h 19.83 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 H 0.1422915 v -53.71 H 20.242292 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 19.802292,216.0736 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 H 0.13229175 v -53.7 z",
  "m 27.122292,258.1436 a 7.94,7.94 0 0 1 6.99,11.71 l -0.1,0.2 h 19.83 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.4 q 0.87,-1.7 0.88,-3.7 a 8.2,8.2 0 1 0 -15.52,3.7 H 0.13229175 v -53.71 H 20.242292 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 26.782292,312.0536 a 7.94,7.94 0 0 1 6.99,11.7 l -0.1,0.2 h 19.83 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 H -0.19770825 v -53.7 H 19.902292 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "M 107.82229,0.13132561 V 20.231326 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 H 87.982292 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.1,-0.2 h -20.1 v -19.84 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.1 V 0.13132561 Z",
  "m 73.782292,54.111326 a 8.2,8.2 0 1 0 14.64,0 h 19.399998 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 V 107.82132 H 88.422292 q 0.86,-1.7 0.88,-3.7 a 8.2,8.2 0 1 0 -15.52,3.7 h -19.68 V 87.971326 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.11 v -20.1 z",
  "m 81.102292,96.18133 a 7.94,7.94 0 0 1 6.98,11.69999 l -0.1,0.2 h 19.839998 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 H 87.982292 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.1,-0.2 h -20.1 v -19.84 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.1 v -20.1 h 20.1 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.99,-11.69999 z",
  "m 73.782292,162.06132 a 8.2,8.2 0 1 0 14.64,0 h 19.399998 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 H 87.982292 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.1,-0.2 h -20.1 v -19.4 q 1.69,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.53 v -19.66 z",
  "m 73.782292,216.0736 a 8.2,8.2 0 1 0 14.64,0 h 19.399998 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 H 88.422292 a 8.2,8.2 0 1 0 -14.64,0 h -19.68 v -19.84 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.1 v -20.1 z",
  "m 81.102292,258.1436 a 7.94,7.94 0 0 1 6.98,11.71 l -0.1,0.2 h 19.839998 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 H 87.982292 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.1,-0.2 h -20.1 v -19.4 a 8.2,8.2 0 1 0 0,-14.64 v -19.67 h 20.1 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 73.442292,323.9536 a 8.2,8.2 0 1 0 14.64,0 h 19.399998 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 H 53.772292 v -19.4 q 1.68,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.52 v -19.67 z",
  "M 161.80229,0.13132561 V 20.231326 l 0.19,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.09 v -19.4 a 8.2,8.2 0 1 0 0,-14.64 V 0.13132561 Z",
  "m 127.75229,54.111326 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.839994 h -19.4 q 0.87,-1.7 0.88,-3.7 a 8.2,8.2 0 1 0 -15.52,3.7 h -19.67 V 88.421326 q 1.7,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.53 v -19.66 z",
  "m 135.07229,96.18133 a 7.94,7.94 0 0 1 6.99,11.69999 l -0.1,0.2 h 19.83 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 h -19.67 v -19.84 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.1 v -20.1 h 20.12 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.70999 z",
  "m 135.07229,150.15132 a 7.94,7.94 0 0 1 6.99,11.71 l -0.1,0.2 h 19.83 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.09 v -19.4 a 8.2,8.2 0 1 0 0,-14.64 v -19.67 h 20.1 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 127.75229,216.0736 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.09 v -19.84 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.1 v -20.1 z",
  "m 127.75229,270.0536 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.09 v -19.85 l -0.2,0.1 a 7.92,7.92 0 0 1 -11.709998,-6.98 7.94,7.94 0 0 1 11.699998,-6.98 l 0.2,0.1 v -20.1 z",
  "m 127.41229,323.9536 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -53.69 v -19.84 l -0.2,0.1 a 7.92,7.92 0 0 1 -11.709998,-6.98 7.94,7.94 0 0 1 11.699998,-6.99 l 0.2,0.1 v -20.1 z",
  "M 215.77229,0.13132561 V 20.231326 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 h -19.67 v -19.4 q 1.69,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.52 V 0.13132561 Z",
  "m 189.05229,42.201326 a 7.94,7.94 0 0 1 6.98,11.71 l -0.1,0.2 h 19.84 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.839994 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.1,-0.2 h -20.1 V 88.421326 q 1.69,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.53 v -19.66 h 20.1 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 181.73229,108.08132 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.1,-0.2 h -20.1 v -19.4 q 1.69,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.52 v -19.67 z",
  "m 181.73229,162.06132 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.1,-0.2 h -20.1 v -19.4 q 1.69,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.53 v -19.66 z",
  "m 181.73229,216.0736 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 h -19.67 v -19.4 q 1.69,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.52 v -19.67 z",
  "m 189.05229,258.1436 a 7.94,7.94 0 0 1 6.98,11.71 l -0.1,0.2 h 19.84 v 20.1 l 0.2,-0.1 a 7.94,7.94 0 1 1 0,13.97 l -0.2,-0.1 v 19.84 h -19.4 q 0.86,-1.7 0.88,-3.7 a 8.2,8.2 0 1 0 -15.52,3.7 h -19.67 v -19.85 l -0.2,0.1 a 7.92,7.92 0 0 1 -11.7,-6.98 7.94,7.94 0 0 1 11.7,-6.98 l 0.2,0.1 v -20.1 h 20.1 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 188.71229,312.0536 a 7.94,7.94 0 0 1 6.98,11.7 l -0.1,0.2 h 19.84 v 19.67 a 8.2,8.2 0 1 0 0,14.64 v 19.4 h -53.71 v -19.4 q 1.69,0.86 3.7,0.88 a 8.2,8.2 0 1 0 -3.7,-15.52 v -19.67 h 20.1 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "M 269.74229,0.13132561 V 53.841326 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.1 v -19.4 a 8.2,8.2 0 1 0 0,-14.64 V 0.13132561 Z",
  "m 235.70229,54.111326 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 53.699994 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.1 V 88.411326 a 8.2,8.2 0 1 0 0,-14.64 v -19.66 z",
  "m 235.70229,108.08132 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 53.71 h -19.4 a 8.2,8.2 0 1 0 -14.64,0 h -19.67 v -19.84 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.1 v -20.1 z",
  "m 243.02229,150.15132 a 7.94,7.94 0 0 1 6.99,11.71 l -0.1,0.2 h 19.83 v 53.7 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.1 v -19.4 a 8.2,8.2 0 1 0 0,-14.64 v -19.66 h 20.1 l -0.1,-0.2 a 7.94,7.94 0 0 1 6.98,-11.71 z",
  "m 235.70229,216.0736 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 53.71 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.1 v -19.84 l -0.2,0.1 a 7.94,7.94 0 1 1 0,-13.97 l 0.2,0.1 v -20.1 z",
  "m 235.70229,270.0536 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 53.7 h -19.84 l 0.1,0.2 a 7.94,7.94 0 1 1 -13.97,0 l 0.11,-0.2 h -20.1 v -19.4 a 8.2,8.2 0 1 0 0,-14.64 v -19.66 z",
  "m 235.36229,323.9536 a 8.2,8.2 0 1 0 14.64,0 h 19.4 v 53.71 h -53.7 v -19.84 l -0.2,0.1 a 7.92,7.92 0 0 1 -11.71,-6.98 7.94,7.94 0 0 1 11.7,-6.99 l 0.2,0.1 v -20.1 z"
];
var PUZZLE_CONFIG = [
  {
    image: "puzzles/1_sky_castle.webp",
    video: "puzzles/1_sky_castle.webm",
    customPaths: PUZZLE_12_PATHS,
    viewBox: "0 0 270.66876 360.89166"
  },
  {
    image: "puzzles/2_tree_in_garden.webp",
    video: "puzzles/2_tree_in_garden.webm",
    customPaths: PUZZLE_24_PATHS,
    viewBox: "0 0 270.93 406.4"
  },
  {
    image: "puzzles/3_lava.webp",
    video: "puzzles/3_lava.webm",
    customPaths: PUZZLE_35_PATHS,
    viewBox: "0 0 269.88 377.83"
  }
];
var currentPuzzleIndex;
var unlockedPieces;
var puzzleContainer = null;
var puzzleContainerId = null;
function getPuzzleState() {
  const config = PUZZLE_CONFIG[currentPuzzleIndex];
  const totalPieces = config.customPaths ? config.customPaths.length : config.cols * config.rows;
  return { config, totalPieces };
}
function setPuzzleState({ index, pieces }) {
  currentPuzzleIndex = index;
  unlockedPieces = pieces;
}
function getPuzzleProgress() {
  return { currentPuzzleIndex, unlockedPieces };
}
function initPuzzle(containerId) {
  puzzleContainerId = containerId;
  puzzleContainer = document.getElementById(containerId);
  if (!puzzleContainer) {
    console.error(`Puzzle container with id #${containerId} not found.`);
    return;
  }
  renderPuzzle();
}
function unlockNextPiece() {
  return new Promise((resolve) => {
    console.log("[Puzzle Debug] unlockNextPiece called.");
    const { config, totalPieces } = getPuzzleState();
    if (unlockedPieces.size >= totalPieces) {
      console.log("[Puzzle Debug] Puzzle already complete, resolving false.");
      return resolve(false);
    }
    const availablePieces = [];
    for (let i = 0; i < totalPieces; i++) {
      if (!unlockedPieces.has(i))
        availablePieces.push(i);
    }
    const randomPieceIndex = availablePieces[Math.floor(Math.random() * availablePieces.length)];
    console.log(`[Puzzle Debug] Unlocking random piece index: ${randomPieceIndex}`);
    unlockedPieces.add(randomPieceIndex);
    const pieceElements = puzzleContainer.querySelectorAll(".puzzle-piece");
    const pieceElement = pieceElements[randomPieceIndex];
    if (pieceElement) {
      console.log("[Puzzle Debug] Found piece element. Scheduling animation.");
      requestAnimationFrame(() => {
        console.log("[Puzzle Debug] First rAF fired.");
        requestAnimationFrame(() => {
          console.log("[Puzzle Debug] Second rAF fired. Adding animation class.");
          pieceElement.classList.add("unlocked", "celebration-animation");
        });
      });
    } else {
      console.warn(`[Puzzle Debug] Could not find piece element for index: ${randomPieceIndex}`);
    }
    const animationDuration = 1500;
    console.log(`[Puzzle Debug] Setting timeout for ${animationDuration}ms to clean up and resolve.`);
    setTimeout(() => {
      console.log("[Puzzle Debug] Timeout fired. Cleaning up animation class.");
      if (pieceElement) {
        pieceElement.classList.remove("celebration-animation");
      }
      if (unlockedPieces.size >= totalPieces) {
        console.log(`[Puzzle] Puzzle ${currentPuzzleIndex} complete!`);
        if (config.video) {
          puzzleContainer = document.getElementById(puzzleContainerId);
          if (!puzzleContainer) {
            console.error("Puzzle container not found after animation.");
            return resolve(true);
          }
          puzzleContainer.innerHTML = "";
          const videoElement = document.createElement("video");
          videoElement.src = config.video;
          videoElement.autoplay = true;
          videoElement.muted = true;
          videoElement.playsInline = true;
          videoElement.style.width = "100%";
          videoElement.style.height = "100%";
          videoElement.style.objectFit = "cover";
          puzzleContainer.appendChild(videoElement);
          videoElement.onended = () => {
            console.log(`[Puzzle] Video ended.`);
            advanceToNextPuzzle();
            resolve(true);
          };
          videoElement.onerror = () => {
            console.error(`[Puzzle] Error playing video.`);
            setTimeout(() => {
              advanceToNextPuzzle();
              resolve(true);
            }, 500);
          };
        } else {
          advanceToNextPuzzle();
          resolve(true);
        }
      } else {
        console.log("[Puzzle Debug] Puzzle not complete. Resolving promise.");
        resolve(true);
      }
    }, animationDuration);
  });
}
function debug_playPieceAnimation() {
  puzzleContainer = document.getElementById(puzzleContainerId);
  if (!puzzleContainer) {
    console.error("Debug: Puzzle container not found.");
    return;
  }
  const allPieceElements = puzzleContainer.querySelectorAll(".puzzle-piece");
  if (allPieceElements.length === 0) {
    console.error("Debug: No puzzle pieces found to animate.");
    return;
  }
  const randomPieceIndex = Math.floor(Math.random() * allPieceElements.length);
  const randomPieceToAnimate = allPieceElements[randomPieceIndex];
  console.log("Debug: Triggering celebration animation on a random piece.");
  randomPieceToAnimate.classList.remove("celebration-animation");
  requestAnimationFrame(() => {
    randomPieceToAnimate.classList.add("celebration-animation");
  });
  setTimeout(() => {
    randomPieceToAnimate.classList.remove("celebration-animation");
  }, 1500);
}
function debug_playCompletionVideo() {
  const { config } = getPuzzleState();
  if (!config.video) {
    console.log("Debug: No video configured for this puzzle.");
    return;
  }
  puzzleContainer = document.getElementById(puzzleContainerId);
  if (!puzzleContainer)
    return;
  console.log(`Debug: Playing video: ${config.video}`);
  puzzleContainer.innerHTML = "";
  const videoElement = document.createElement("video");
  videoElement.src = config.video;
  videoElement.autoplay = true;
  videoElement.muted = false;
  videoElement.controls = true;
  videoElement.playsInline = true;
  videoElement.style.width = "100%";
  videoElement.style.height = "100%";
  videoElement.style.objectFit = "cover";
  puzzleContainer.appendChild(videoElement);
  videoElement.onended = () => {
    console.log(`[Debug] Video ended. Re-rendering puzzle.`);
    renderPuzzle();
  };
  videoElement.onerror = (e) => {
    console.error(`[Debug] Error playing video.`, e);
    renderPuzzle();
  };
}
function getUnlockedPieceCount() {
  return unlockedPieces.size;
}
function advanceToNextPuzzle() {
  currentPuzzleIndex = (currentPuzzleIndex + 1) % PUZZLE_CONFIG.length;
  unlockedPieces.clear();
  renderPuzzle();
  console.log(`[Puzzle] Advanced to puzzle ${currentPuzzleIndex}.`);
}
function renderPuzzle() {
  puzzleContainer = document.getElementById(puzzleContainerId);
  if (!puzzleContainer)
    return;
  puzzleContainer.innerHTML = "";
  const { config, totalPieces } = getPuzzleState();
  const { image, cols, rows, customPaths, viewBox } = config;
  const pieceSize = 80;
  const L = pieceSize;
  let puzzleWidth = cols * L;
  let puzzleHeight = rows * L;
  let vb = `0 0 ${puzzleWidth} ${puzzleHeight}`;
  let imgW = puzzleWidth;
  let imgH = puzzleHeight;
  if (customPaths) {
    const vbParts = viewBox.split(" ").map(Number);
    const originalWidth = vbParts[2];
    const originalHeight = vbParts[3];
    vb = viewBox;
    imgW = originalWidth;
    imgH = originalHeight;
  }
  puzzleContainer.style.display = "block";
  puzzleContainer.style.gridTemplateColumns = "";
  puzzleContainer.style.gridTemplateRows = "";
  puzzleContainer.style.position = "relative";
  puzzleContainer.style.width = "68vw";
  puzzleContainer.style.height = "104vw";
  const paths = [];
  if (customPaths) {
    paths.push(...customPaths);
  } else {
    const dRatio = 0.22;
    const h_edge = (c, r) => Math.sin(c * 12.9898 + r * 78.233) > 0 ? 1 : -1;
    const v_edge = (c, r) => Math.cos(c * 39.346 + r * 53.4) > 0 ? 1 : -1;
    for (let i = 0; i < totalPieces; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * L;
      const y = row * L;
      let d = `M ${x} ${y} `;
      const drawEdge = (ex, ey, dx, dy, nx, ny, isTab) => {
        if (isTab === 0) {
          d += `L ${ex + dx} ${ey + dy} `;
          return;
        }
        const depth = isTab * dRatio * L;
        const pt = (t, dn) => `${ex + t * dx + dn * depth * nx} ${ey + t * dy + dn * depth * ny}`;
        d += `L ${pt(0.35, 0)} `;
        d += `C ${pt(0.35, 0.5)}, ${pt(0.25, 1)}, ${pt(0.5, 1)} `;
        d += `C ${pt(0.75, 1)}, ${pt(0.65, 0.5)}, ${pt(0.65, 0)} `;
        d += `L ${pt(1, 0)} `;
      };
      drawEdge(x, y, L, 0, 0, -1, row === 0 ? 0 : h_edge(col, row));
      drawEdge(x + L, y, 0, L, 1, 0, col === cols - 1 ? 0 : -v_edge(col + 1, row));
      drawEdge(x + L, y + L, -L, 0, 0, 1, row === rows - 1 ? 0 : -h_edge(col, row + 1));
      drawEdge(x, y + L, 0, -L, -1, 0, col === 0 ? 0 : v_edge(col, row));
      d += "Z";
      paths.push(d);
    }
  }
  const bgSvg = document.createElement("div");
  bgSvg.style.position = "absolute";
  bgSvg.style.top = "0";
  bgSvg.style.left = "0";
  bgSvg.style.width = "100%";
  bgSvg.style.height = "100%";
  let bgPathsStr = "";
  paths.forEach((d) => {
    bgPathsStr += `<path d="${d}" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
  });
  bgSvg.innerHTML = `<svg width="100%" height="100%" viewBox="${vb}" preserveAspectRatio="none">${bgPathsStr}</svg>`;
  puzzleContainer.appendChild(bgSvg);
  for (let i = 0; i < totalPieces; i++) {
    const piece = document.createElement("div");
    piece.classList.add("puzzle-piece");
    if (unlockedPieces.has(i)) {
      piece.classList.add("unlocked");
    }
    piece.style.position = "absolute";
    piece.style.top = "0";
    piece.style.left = "0";
    piece.style.width = "100%";
    piece.style.height = "100%";
    piece.style.margin = "0";
    piece.style.padding = "0";
    const d = paths[i];
    const clipId = `clip_${currentPuzzleIndex}_${i}`;
    const dropShadowTr = `translate(0, -1)`;
    const svg = `
            <svg width="100%" height="100%" viewBox="${vb}" preserveAspectRatio="none">
                <defs>
                    <clipPath id="${clipId}">
                        <path d="${d}" />
                    </clipPath>
                </defs>
                <image href="${image}" width="${imgW}" height="${imgH}" clip-path="url(#${clipId})" preserveAspectRatio="none" />
                <path d="${d}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="2" />
                <path d="${d}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1" transform="${dropShadowTr}" />
            </svg>
        `;
    piece.innerHTML = svg;
    puzzleContainer.appendChild(piece);
  }
}

// progress.js
var SAVE_GAME_KEY = "symmetry6-save-data";
async function initProgressService() {
  console.log("[Progress] Initializing save game service...");
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log("[Progress] Service ready.");
  return true;
}
async function saveProgress(progress) {
  console.log("[Progress] Saving to cloud:", progress);
  try {
    const dataToSave = {
      currentLevelIndex: progress.currentLevelIndex,
      maxUnlockedLevel: progress.maxUnlockedLevel !== void 0 ? progress.maxUnlockedLevel : progress.currentLevelIndex,
      currentPuzzleIndex: progress.currentPuzzleIndex,
      unlockedPieces: Array.from(progress.unlockedPieces),
      // Convert Set to Array for JSON
      levelStars: progress.levelStars || {},
      hintsAvailable: progress.hintsAvailable || 0,
      flipsAvailable: progress.flipsAvailable || 0,
      rotatesAvailable: progress.rotatesAvailable || 0,
      coins: progress.coins || 0,
      lastDailyClaim: progress.lastDailyClaim || 0,
      adFreeUntil: progress.adFreeUntil || 0,
      audio: progress.audio || { bgmVolume: 0.5, sfxVolume: 0.5 }
    };
    await saveData(SAVE_GAME_KEY, dataToSave);
    console.log("[Progress] Save successful.");
    return { success: true };
  } catch (error) {
    console.error("[Progress] Failed to save progress:", error);
    return { success: false, error };
  }
}
async function loadProgress() {
  console.log("[Progress] Loading from cloud...");
  try {
    const savedData = await loadData(SAVE_GAME_KEY);
    if (savedData) {
      savedData.unlockedPieces = new Set(savedData.unlockedPieces);
      if (savedData.maxUnlockedLevel === void 0) {
        savedData.maxUnlockedLevel = savedData.currentLevelIndex || 0;
      }
      console.log("[Progress] Loaded data:", savedData);
      return savedData;
    } else {
      console.log("[Progress] No save data found. Starting new game.");
      return { currentLevelIndex: 0, maxUnlockedLevel: 0, currentPuzzleIndex: 0, unlockedPieces: /* @__PURE__ */ new Set(), levelStars: {}, hintsAvailable: 0, flipsAvailable: 0, rotatesAvailable: 0, coins: 0, lastDailyClaim: 0, adFreeUntil: 0, audio: { bgmVolume: 0.5, sfxVolume: 0.5 } };
    }
  } catch (error) {
    console.error("[Progress] Failed to load progress:", error);
    return { currentLevelIndex: 0, maxUnlockedLevel: 0, currentPuzzleIndex: 0, unlockedPieces: /* @__PURE__ */ new Set(), levelStars: {}, hintsAvailable: 0, flipsAvailable: 0, rotatesAvailable: 0, coins: 0, lastDailyClaim: 0, adFreeUntil: 0, audio: { bgmVolume: 0.5, sfxVolume: 0.5 } };
  }
}

// animation.js
var PUZZLE_ICON = '<img src="graphics/puzzle.webp" alt="Puzzle">';
var COIN_ICON = '<img src="graphics/coin.webp" alt="Coin">';
function _animateFlyingItems({
  count,
  sourceRect,
  targetElement,
  elementHTML,
  fontSize,
  getAnimationConfig,
  onItemFinish,
  fallbackTargetRect
}) {
  if (!targetElement || !sourceRect)
    return Promise.resolve();
  let targetRect = targetElement.getBoundingClientRect();
  if (targetRect.width === 0 && targetRect.height === 0 && fallbackTargetRect) {
    targetRect = fallbackTargetRect;
  }
  const startPos = { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
  let endPos = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
  const sourceSize = Math.min(sourceRect.width, sourceRect.height) || 30;
  let targetSize = Math.min(targetRect.width, targetRect.height) || 30;
  const targetMedia = targetElement.querySelector("img, svg");
  if (targetMedia) {
    const mediaRect = targetMedia.getBoundingClientRect();
    if (mediaRect.width > 0 && mediaRect.height > 0) {
      targetSize = Math.min(mediaRect.width, mediaRect.height);
      endPos = { x: mediaRect.left + mediaRect.width / 2, y: mediaRect.top + mediaRect.height / 2 };
    }
  }
  const promises = [];
  for (let i = 0; i < count; i++) {
    const element = document.createElement("div");
    element.innerHTML = elementHTML;
    element.style.position = "fixed";
    element.style.left = `${startPos.x}px`;
    element.style.top = `${startPos.y}px`;
    element.style.width = `${sourceSize}px`;
    element.style.height = `${sourceSize}px`;
    element.style.display = "flex";
    element.style.alignItems = "center";
    element.style.justifyContent = "center";
    element.style.fontSize = fontSize;
    element.style.pointerEvents = "none";
    element.style.zIndex = "10000";
    element.style.transform = "translate(-50%, -50%)";
    element.style.filter = "drop-shadow(0px 2px 4px rgba(0,0,0,0.5))";
    const mediaElements = element.querySelectorAll("img, svg");
    mediaElements.forEach((el) => {
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.objectFit = "contain";
    });
    document.body.appendChild(element);
    const { keyframes, options } = getAnimationConfig(i, startPos, endPos, sourceSize, targetSize);
    const animation = element.animate(keyframes, options);
    promises.push(new Promise((resolve) => {
      animation.onfinish = () => {
        element.remove();
        if (onItemFinish) {
          onItemFinish(i);
        }
        resolve();
      };
    }));
  }
  return Promise.all(promises);
}
async function animateCoinsFlying(amount, sourceRect, onUpdateCoinsDisplay) {
  const targetEl = document.getElementById("coins-display");
  const numCoins = Math.min(amount, 15);
  const getAnimationConfig = (index, startPos, endPos, sourceSize, targetSize) => {
    const spreadX = (Math.random() - 0.5) * 100;
    const spreadY = (Math.random() - 0.5) * 100;
    const duration = 600 + Math.random() * 400;
    const delay = Math.random() * 250;
    const scaleEnd = sourceSize > 0 ? targetSize / sourceSize : 1;
    const scaleMid = Math.max(1, scaleEnd) * 1.5;
    return {
      keyframes: [
        { transform: `translate(-50%, -50%) scale(1)`, opacity: 0, offset: 0 },
        { transform: `translate(calc(-50% + ${spreadX}px), calc(-50% + ${spreadY}px)) scale(${scaleMid})`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${endPos.x - startPos.x}px), calc(-50% + ${endPos.y - startPos.y}px)) scale(${scaleEnd})`, opacity: 0.9, offset: 1 }
      ],
      options: { duration, delay, easing: "ease-in-out", fill: "forwards" }
    };
  };
  const onItemFinish = (index) => {
    if (targetEl) {
      targetEl.animate([
        { transform: "scale(1)" },
        { transform: "scale(1.3)" },
        { transform: "scale(1)" }
      ], { duration: 150 });
    }
  };
  await _animateFlyingItems({
    count: numCoins,
    sourceRect,
    targetElement: targetEl,
    elementHTML: COIN_ICON,
    fontSize: "24px",
    getAnimationConfig,
    onItemFinish,
    fallbackTargetRect: { left: window.innerWidth - 50, top: 20, width: 30, height: 30 }
  });
  if (onUpdateCoinsDisplay) {
    onUpdateCoinsDisplay();
  }
}
function animatePuzzleFlying(sourceRect, targetCount) {
  const targetEl = document.getElementById("rewards-display");
  const getAnimationConfig = (index, startPos, endPos, sourceSize, targetSize) => {
    const spreadY = -30;
    const scaleEnd = sourceSize > 0 ? targetSize / sourceSize : 1;
    const scaleMid = Math.max(1, scaleEnd) * 1.2;
    return {
      keyframes: [
        { transform: `translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0 },
        { transform: `translate(-50%, calc(-50% + ${spreadY}px)) scale(${scaleMid})`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${endPos.x - startPos.x}px), calc(-50% + ${endPos.y - startPos.y}px)) scale(${scaleEnd})`, opacity: 0.8, offset: 1 }
      ],
      options: { duration: 1500, easing: "ease-in-out", fill: "forwards" }
    };
  };
  const onItemFinish = () => {
    if (targetEl) {
      const countToShow = targetCount !== void 0 ? targetCount : getUnlockedPieceCount();
      targetEl.innerHTML = `${PUZZLE_ICON} ${countToShow}`;
      targetEl.animate([
        { transform: "scale(1)" },
        { transform: "scale(1.3)" },
        { transform: "scale(1)" }
      ], { duration: 150 });
    }
  };
  _animateFlyingItems({
    count: 1,
    sourceRect,
    targetElement: targetEl,
    elementHTML: PUZZLE_ICON,
    fontSize: "32px",
    getAnimationConfig,
    onItemFinish,
    fallbackTargetRect: { left: 20, top: 20, width: 30, height: 30 }
  });
}

// store.js
function setupStoreUI(FF_DEBUG_STORE2, adFreeUntilGetter, callbacks) {
  if (!isStoreSupported && !FF_DEBUG_STORE2) {
    const storeBtn2 = document.getElementById("btn-store");
    if (storeBtn2)
      storeBtn2.style.display = "none";
    return;
  }
  const storeBtn = document.getElementById("btn-store");
  if (storeBtn)
    storeBtn.style.display = "flex";
  const btnCloseStore = document.getElementById("btn-close-store");
  if (btnCloseStore) {
    btnCloseStore.addEventListener("click", () => {
      document.getElementById("store-modal").style.display = "none";
    });
  }
  document.querySelectorAll(".btn-buy-coins").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.currentTarget;
      const id = target.dataset.id;
      const amount = parseInt(target.dataset.amount);
      const price = target.dataset.price;
      const success = await purchaseItem(id, price, `${amount} Coins`);
      if (success && callbacks.onCoinsPurchased) {
        callbacks.onCoinsPurchased(amount, target.getBoundingClientRect(), price, id);
      }
    });
  });
  document.querySelectorAll(".btn-buy-adfree").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      if (Date.now() < adFreeUntilGetter()) {
        alert("You already have an active Ad-Free pass!");
        return;
      }
      const target = e.currentTarget;
      const id = target.dataset.id;
      const days = parseInt(target.dataset.days);
      const price = target.dataset.price;
      const success = await purchaseItem(id, price, `Ad-Free (${days} Days)`);
      if (success && callbacks.onAdFreePurchased) {
        callbacks.onAdFreePurchased(days, price, id);
      }
    });
  });
  document.querySelectorAll(".btn-buy-package").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.currentTarget;
      const id = target.dataset.id;
      const coinsReward = parseInt(target.dataset.coins) || 0;
      const hintsReward = parseInt(target.dataset.hints) || 0;
      const flipsReward = parseInt(target.dataset.flips) || 0;
      const rotatesReward = parseInt(target.dataset.rotates) || 0;
      const price = target.dataset.price;
      const pkgName = target.dataset.name;
      const success = await purchaseItem(id, price, pkgName);
      if (success && callbacks.onPackagePurchased) {
        callbacks.onPackagePurchased({
          id,
          price,
          pkgName,
          coins: coinsReward,
          hints: hintsReward,
          flips: flipsReward,
          rotates: rotatesReward,
          rect: target.getBoundingClientRect()
        });
      }
    });
  });
}
function renderDynamicStore(offering) {
  const storeContent = document.getElementById("store-content");
  if (!storeContent)
    return;
  const metadata = offering.metadata || {};
  const rewardsDict = metadata.rewards || {
    "pkg_10hints": { hints: 10 },
    "pkg_starterpack": { coins: 500, hints: 5, flips: 5, rotates: 5 },
    "pkg_propack": { coins: 1500, hints: 30, flips: 30, rotates: 30 },
    "coins_100": { amount: 100 },
    "coins_500": { amount: 500 },
    "coins_1200": { amount: 1200 },
    "adfree_3d": { days: 3 },
    "adfree_7d": { days: 7 },
    "adfree_30d": { days: 30 }
  };
  let packagesHtml = "";
  let coinsHtml = "";
  let adsHtml = "";
  offering.availablePackages.forEach((pkg) => {
    const product = pkg.product;
    const id = product.identifier;
    const pkgId = pkg.identifier;
    console.warn(`[Store Debug] ID: ${id} | Name: "${product.name}" | Title: "${product.title}" | Desc: "${product.description}"`);
    const title = (product.name || product.title.replace(/\s*\([^)]*\)\s*$/, "")).trim();
    const desc = product.description;
    const price = product.priceString;
    const rewards = rewardsDict[id] || {};
    const descHtml = desc && desc !== title ? `<p style="font-size: 12px; font-weight: normal; text-shadow: none; color: #ddd;">${desc}</p>` : "";
    if (id.startsWith("pkg_") || pkgId.startsWith("pkg_")) {
      packagesHtml += `
                <button class="btn btn-buy-package" data-id="${id}" 
                    data-coins="${rewards.coins || 0}" 
                    data-hints="${rewards.hints || 0}" 
                    data-flips="${rewards.flips || 0}" 
                    data-rotates="${rewards.rotates || 0}" 
                    data-price="${product.price}" data-name="${title}">
                    <span style="${descHtml ? "text-align: left;" : ""}">${title}${descHtml}</span>
                    <span class="store-btn-price">${price}</span>
                </button>
            `;
    } else if (id.startsWith("coins_") || pkgId.startsWith("coins_") || title.toLowerCase().includes("coin")) {
      const amount = rewards.amount || parseInt(title.replace(/[^0-9]/g, "")) || 0;
      coinsHtml += `
                <button class="btn btn-buy-coins" data-id="${id}" data-amount="${amount}" data-price="${product.price}">
                    ${COIN_ICON}<div><span style="${descHtml ? "text-align: left;" : ""}">${title}</span>${descHtml}</div>
                    <span class="store-btn-price">${price}</span>
                </button>
            `;
    } else if (id.startsWith("adfree_") || pkgId.startsWith("adfree_") || title.toLowerCase().includes("ad")) {
      const days = rewards.days || (id.includes("3d") ? 3 : id.includes("7d") ? 7 : id.includes("30d") ? 30 : 0);
      adsHtml += `
                <button class="btn btn-buy-adfree" data-id="${id}" data-days="${days}" data-price="${product.price}">
                    <span style="${descHtml ? "text-align: left;" : ""}">${title}${descHtml}</span>
                    <span class="store-btn-price">${price}</span>
                </button>
            `;
    } else {
      packagesHtml += `
                <button class="btn btn-buy-package" data-id="${id}" data-price="${product.price}" data-name="${title}">
                    <span style="${descHtml ? "text-align: left;" : ""}">${title}${descHtml}</span>
                    <span class="store-btn-price">${price}</span>
                </button>
            `;
    }
  });
  let finalHtml = "";
  if (packagesHtml)
    finalHtml += `<h3>Special Packages</h3><div class="store-buttons-container">${packagesHtml}</div>`;
  if (coinsHtml)
    finalHtml += `<h3>Buy more coins!</h3><div class="store-buttons-container">${coinsHtml}</div>`;
  if (adsHtml)
    finalHtml += `<h3>Remove Ads</h3><div class="store-buttons-container">${adsHtml}</div>`;
  storeContent.innerHTML = finalHtml;
}
function openStore(adFreeUntil) {
  const storeModal = document.getElementById("store-modal");
  if (storeModal) {
    const isAdFreeActive = Date.now() < adFreeUntil;
    document.querySelectorAll(".btn-buy-adfree").forEach((btn) => {
      btn.disabled = isAdFreeActive;
    });
    storeModal.style.display = "flex";
  }
}

// confetti.js
function fireConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = [];
  const colors = ["#00bcd4", "#e74c3c", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22", "#3498db"];
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      w: Math.random() * 8 + 6,
      h: Math.random() * 12 + 8,
      dx: Math.random() * 40 - 20,
      // Horizontal spread
      dy: Math.random() * -30 - 10,
      // Initial upward velocity
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.4
    });
  }
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.dx;
      p.y += p.dy;
      p.dy += 0.8;
      p.dx *= 0.96;
      p.rot += p.rotSpeed;
      if (p.y < canvas.height + 50)
        active = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (active)
      requestAnimationFrame(render);
    else
      document.body.removeChild(canvas);
  }
  render();
}

// game.js
var LEVEL_REWARD_PUZZLE_PIECES = 1;
var LEVEL_REWARD_COINS = 5;
var DAILY_REWARD_COINS = 10;
var AD_REWARD_COINS = 30;
var STAR_GOLD_IMG = '<img src="graphics/star_gold.webp" alt="Star Gold">';
var STAR_DARK_IMG = '<img src="graphics/star_dark.webp" alt="Star Dark">';
var HAND_SVG = '<img src="icons/hand.svg" alt="Hand" style="width: 1em; height: 1em;">';
var CROSS_SVG = '<img src="icons/cross.svg" alt="Cross" style="width: 1em; height: 1em;">';
var gameLevels = [];
var currentLevelIndex2 = 0;
var maxUnlockedLevel = 0;
var levelStars = {};
var helpUsedInLevel = false;
var timeElapsed = 0;
var timerInterval = null;
var lastInteractionTime = Date.now();
var tutorialActive = false;
var tutorialRunId = 0;
function setGameData(levels, currentIdx, maxUnlocked, stars) {
  gameLevels = levels;
  currentLevelIndex2 = currentIdx;
  maxUnlockedLevel = maxUnlocked;
  levelStars = stars;
}
function setHelpUsed(used) {
  helpUsedInLevel = used;
}
function advanceLevel() {
  currentLevelIndex2++;
  maxUnlockedLevel = Math.max(maxUnlockedLevel, currentLevelIndex2);
}
function resetIdleTimer() {
  lastInteractionTime = Date.now();
}
function updateTimerDisplay() {
  const timerDisplay = document.getElementById("timer-display");
  if (timerDisplay) {
    const m = Math.floor(timeElapsed / 60).toString().padStart(2, "0");
    const s = (timeElapsed % 60).toString().padStart(2, "0");
    timerDisplay.innerText = `${m}:${s}`;
  }
}
function startTimer() {
  clearInterval(timerInterval);
  timeElapsed = 0;
  updateTimerDisplay();
  resetIdleTimer();
  timerInterval = setInterval(() => {
    timeElapsed++;
    updateTimerDisplay();
  }, 1e3);
  trackLevelStart(currentLevelIndex2);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}
function loadLevel(index) {
  if (index >= gameLevels.length) {
    const playBtn2 = document.getElementById("btn-play");
    if (playBtn2) {
      playBtn2.innerText = "All Levels Complete!";
      playBtn2.disabled = true;
    }
    return;
  }
  currentLevelIndex2 = index;
  gameLevels[index].levelNumber = index + 1;
  buildLevel(gameLevels[index]);
  const playBtn = document.getElementById("btn-play");
  if (playBtn)
    playBtn.innerText = `Play Level ${index + 1}`;
  const objectiveDisplay = document.getElementById("objective-display");
  if (objectiveDisplay) {
    objectiveDisplay.innerText = gameLevels[index].objectiveString || "Match the target pattern.";
  }
  updateCameraFrustum(camera, window.innerWidth, window.innerHeight);
  resetInteractionState();
  stopTimer();
  timeElapsed = 0;
  helpUsedInLevel = false;
  updateTimerDisplay();
}
function startGameplay(showInterludeCallback) {
  const lvl = gameLevels[currentLevelIndex2];
  if (lvl && lvl.interlude) {
    showInterludeCallback(lvl.interlude);
  } else {
    setGameState(GameState.PLAYING);
    startTimer();
  }
}
async function playTutorial(tutorialData) {
  tutorialActive = true;
  const myRunId = ++tutorialRunId;
  tutorialData.isTutorial = true;
  let handEl = document.getElementById("tutorial-hand");
  if (!handEl) {
    handEl = document.createElement("div");
    handEl.id = "tutorial-hand";
    handEl.innerHTML = HAND_SVG;
    handEl.style.position = "fixed";
    handEl.style.fontSize = "4rem";
    handEl.style.pointerEvents = "none";
    handEl.style.zIndex = "10001";
    handEl.style.display = "none";
    handEl.style.transition = "left 0.6s ease-in-out, top 0.6s ease-in-out, transform 0.15s ease-out, opacity 0.3s";
    handEl.style.transform = "translate(-40%, 0%)";
    handEl.style.filter = "drop-shadow(2px 4px 6px rgba(0,0,0,0.5))";
    document.body.appendChild(handEl);
  }
  handEl.style.display = "block";
  handEl.style.opacity = 0;
  const moveHandToTile = (tile) => {
    const pos = tile.position.clone();
    pos.project(camera);
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (pos.y * -0.5 + 0.5) * window.innerHeight;
    handEl.style.left = `${x}px`;
    handEl.style.top = `${y}px`;
  };
  while (tutorialActive && myRunId === tutorialRunId) {
    buildLevel(tutorialData);
    updateCameraFrustum(camera, window.innerWidth, window.innerHeight);
    if (tutorialData.steps && tutorialData.steps.length > 0) {
      const firstStep = tutorialData.steps[0];
      const startTile = tiles.get(`${firstStep[0]},${firstStep[1]}`);
      if (startTile) {
        handEl.style.transition = "none";
        moveHandToTile(startTile);
        handEl.style.transform = "translate(-40%, 0%) scale(1)";
        void handEl.offsetWidth;
        handEl.style.transition = "left 0.6s ease-in-out, top 0.6s ease-in-out, transform 0.15s ease-out, opacity 0.3s";
      }
    }
    handEl.style.opacity = 1;
    await new Promise((r) => setTimeout(r, 800));
    if (!tutorialActive || myRunId !== tutorialRunId)
      break;
    for (const step of tutorialData.steps) {
      if (!tutorialActive || myRunId !== tutorialRunId)
        break;
      const [q1, r1, q2, r2, isBlockedStep] = step;
      const t1 = tiles.get(`${q1},${r1}`);
      const t2 = tiles.get(`${q2},${r2}`);
      if (t1 && t2) {
        moveHandToTile(t1);
        await new Promise((r) => setTimeout(r, 600));
        if (!tutorialActive || myRunId !== tutorialRunId)
          break;
        handEl.style.transform = "translate(-40%, 0%) scale(0.8)";
        await new Promise((r) => setTimeout(r, 200));
        if (!tutorialActive || myRunId !== tutorialRunId)
          break;
        moveHandToTile(t2);
        await new Promise((r) => setTimeout(r, 600));
        if (!tutorialActive || myRunId !== tutorialRunId)
          break;
        handEl.style.transform = "translate(-40%, 0%) scale(1)";
        const k1 = `${t1.userData.q},${t1.userData.r}`;
        const k2 = `${t2.userData.q},${t2.userData.r}`;
        const wallKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        const isBlocked = isBlockedStep === true || walls.has(wallKey);
        if (isBlocked) {
          const xEl = document.createElement("div");
          xEl.innerHTML = CROSS_SVG;
          xEl.style.position = "fixed";
          xEl.style.fontSize = "4rem";
          xEl.style.pointerEvents = "none";
          xEl.style.zIndex = "10002";
          xEl.style.transform = "translate(-50%, -50%)";
          xEl.style.filter = "drop-shadow(0px 2px 4px rgba(0,0,0,0.5))";
          document.body.appendChild(xEl);
          const pos1 = t1.position.clone().project(camera);
          const pos2 = t2.position.clone().project(camera);
          const x = ((pos1.x + pos2.x) / 2 * 0.5 + 0.5) * window.innerWidth;
          const y = ((pos1.y + pos2.y) / 2 * -0.5 + 0.5) * window.innerHeight;
          xEl.style.left = `${x}px`;
          xEl.style.top = `${y}px`;
          xEl.animate([
            { transform: "translate(-50%, -50%) scale(0.5)", opacity: 0, offset: 0 },
            { transform: "translate(-50%, -50%) scale(1.2)", opacity: 1, offset: 0.2 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.8 },
            { transform: "translate(-50%, -50%) scale(0.8)", opacity: 0, offset: 1 }
          ], { duration: 800, easing: "ease-in-out" });
          setTimeout(() => xEl.remove(), 800);
          await new Promise((r) => setTimeout(r, 800));
        } else {
          flipTile(t1, t2);
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }
    if (!tutorialActive || myRunId !== tutorialRunId)
      break;
    handEl.style.opacity = 0;
    await new Promise((r) => setTimeout(r, 400));
  }
}
function stopTutorial() {
  tutorialActive = false;
  tutorialRunId++;
  const handEl = document.getElementById("tutorial-hand");
  if (handEl) {
    handEl.style.display = "none";
    handEl.style.opacity = 0;
  }
}
function triggerIdleHint() {
  const buttons = ["btn-hint", "btn-single-flip", "btn-single-rotate"];
  buttons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.animate([
        { transform: "scale(1)", filter: "brightness(1)", offset: 0 },
        { transform: "scale(1.2)", filter: "brightness(1.5)", offset: 0.2 },
        { transform: "scale(1)", filter: "brightness(1)", offset: 0.4 },
        { transform: "scale(1.2)", filter: "brightness(1.5)", offset: 0.6 },
        { transform: "scale(1)", filter: "brightness(1)", offset: 1 }
      ], { duration: 1500, easing: "ease-in-out" });
    }
  });
}
function animate(time) {
  requestAnimationFrame(animate);
  if (timerInterval !== null && !tutorialActive && !isSingleFlipActive && !isSingleRotateActive && !isHintActive) {
    if (Date.now() - lastInteractionTime > 1e4) {
      triggerIdleHint();
      lastInteractionTime = Date.now();
    }
  }
  if (typeof time === "number") {
    for (let i = activeTweens.length - 1; i >= 0; i--) {
      if (activeTweens[i](time)) {
        activeTweens.splice(i, 1);
      }
    }
    const pulse = 0.1 + (Math.sin(time * 3e-3) + 1) / 2 * 0.6;
    boardGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m.userData && m.userData.isTargetEmissive) {
            m.emissiveIntensity = pulse;
          }
        });
      }
    });
  }
  renderer.render(scene, camera);
}
function setupWinLogic(onWinCallbackObj) {
  setOnWinCallback(async () => {
    stopTimer();
    trackLevelComplete(currentLevelIndex2, stepCount, timeElapsed);
    let starsEarned = 1;
    if (!helpUsedInLevel)
      starsEarned++;
    const targetMoves = gameLevels[currentLevelIndex2].targetMoves;
    if (targetMoves !== void 0 && stepCount <= targetMoves)
      starsEarned++;
    const currentStars = levelStars[currentLevelIndex2] || 0;
    if (starsEarned > currentStars) {
      levelStars[currentLevelIndex2] = starsEarned;
    }
    const starsContainer = document.getElementById("level-complete-stars");
    if (starsContainer) {
      starsContainer.innerHTML = "";
      for (let i = 0; i < 3; i++) {
        const star = document.createElement("span");
        const isEarned = i < starsEarned;
        star.innerHTML = isEarned ? STAR_GOLD_IMG : STAR_DARK_IMG;
        star.style.display = "inline-block";
        star.style.opacity = "0";
        star.style.transform = "scale(0)";
        starsContainer.appendChild(star);
        star.animate([
          { transform: "scale(0) rotate(-30deg)", opacity: 0, offset: 0 },
          { transform: isEarned ? "scale(1.5) rotate(10deg)" : "scale(1.2) rotate(10deg)", opacity: 1, offset: 0.6 },
          { transform: "scale(1) rotate(0deg)", opacity: 1, offset: 1 }
        ], {
          duration: 600,
          delay: 200 + i * 200,
          easing: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          fill: "forwards"
        });
      }
    }
    const isFirstTimeWin = currentLevelIndex2 >= maxUnlockedLevel;
    const lvlCompText = document.getElementById("level-complete-text");
    if (lvlCompText) {
      lvlCompText.innerHTML = isFirstTimeWin ? `<div>${PUZZLE_ICON}<p>\xD7${LEVEL_REWARD_PUZZLE_PIECES}</p></div> <div>${COIN_ICON}<p>\xD7${LEVEL_REWARD_COINS}</p></div>` : `Level Complete!`;
    }
    setGameState(GameState.LEVEL_COMPLETE);
    playSFX("win");
    fireConfetti();
    if (onWinCallbackObj) {
      onWinCallbackObj(isFirstTimeWin);
    }
  });
}

// main.js
initLogger();
if (window.innerWidth > 900) {
  document.body.innerHTML = `
        <div style="color:white; text-align:center; margin-top:40vh; font-family:sans-serif;">
        This game is designed for mobile.<br/>
        Please open on your phone, resize your browser window, or open dev-tools and toggle device toolbar.
        </div>
    `;
} else {
  let updateCoinsDisplay = function() {
    const coinsDisplay = document.getElementById("coins-display");
    if (coinsDisplay) {
      const plusHTML = isStoreSupported || FF_DEBUG_STORE ? ' <span style="color:#2ecc71; font-weight:bold; margin-left:5px;">+</span>' : "";
      coinsDisplay.innerHTML = `${COIN_ICON} ${coins}${plusHTML}`;
    }
  }, updateHintButton = function() {
    const btn = document.getElementById("btn-hint");
    if (btn)
      btn.style.position = "relative";
    const badge = document.getElementById("hint-badge");
    if (badge) {
      if (hintsAvailable > 0) {
        badge.innerText = hintsAvailable;
        badge.classList.remove("ad");
      } else if (coins >= 100) {
        badge.innerHTML = `100 ${COIN_ICON}`;
        badge.classList.remove("ad");
      } else {
        badge.innerText = "AD";
        badge.classList.add("ad");
      }
    }
  }, updateFlipButton = function() {
    const btn = document.getElementById("btn-single-flip");
    if (btn)
      btn.style.position = "relative";
    const badge = document.getElementById("flip-badge");
    if (badge) {
      if (flipsAvailable > 0) {
        badge.innerText = flipsAvailable;
        badge.classList.remove("ad");
      } else if (coins >= 100) {
        badge.innerHTML = `100 ${COIN_ICON}`;
        badge.classList.remove("ad");
      } else {
        badge.innerText = "AD";
        badge.classList.add("ad");
      }
    }
  }, updateRotateButton = function() {
    const btn = document.getElementById("btn-single-rotate");
    if (btn)
      btn.style.position = "relative";
    const badge = document.getElementById("rotate-badge");
    if (badge) {
      if (rotatesAvailable > 0) {
        badge.innerText = rotatesAvailable;
        badge.classList.remove("ad");
      } else if (coins >= 100) {
        badge.innerHTML = `100 ${COIN_ICON}`;
        badge.classList.remove("ad");
      } else {
        badge.innerText = "AD";
        badge.classList.add("ad");
      }
    }
  }, setupDailyRewardUI = function() {
    const playBtn = document.getElementById("btn-play");
    if (!playBtn)
      return;
    const dailyBtn = document.getElementById("btn-daily-reward");
    const updateDailyBtn = () => {
      const now = /* @__PURE__ */ new Date();
      const lastDate = new Date(lastDailyClaim);
      const canClaim = lastDailyClaim === 0 || lastDate.toDateString() !== now.toDateString();
      dailyBtn.style.position = "relative";
      if (canClaim) {
        dailyBtn.innerHTML = 'Claim 10 Coins <span style="position: absolute; top: -5px; right: -5px; width: 14px; height: 14px; background-color: #e74c3c; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></span>';
      } else {
        dailyBtn.innerText = "Get 30 Coins (Ad)";
      }
    };
    dailyBtn.addEventListener("click", async () => {
      console.debug("daily reward button clicked");
      const now = /* @__PURE__ */ new Date();
      const lastDate = new Date(lastDailyClaim);
      if (lastDailyClaim === 0 || lastDate.toDateString() !== now.toDateString()) {
        coins += DAILY_REWARD_COINS;
        console.debug("daily reward claimed");
        lastDailyClaim = Date.now();
        await saveCurrentProgress();
        updateHintButton();
        updateDailyBtn();
        animateCoinsFlying(DAILY_REWARD_COINS, dailyBtn.getBoundingClientRect(), updateCoinsDisplay);
      } else {
        const success = await showAd2("Main menu coins");
        if (success) {
          coins += AD_REWARD_COINS;
          await saveCurrentProgress();
          updateHintButton();
          animateCoinsFlying(AD_REWARD_COINS, dailyBtn.getBoundingClientRect(), updateCoinsDisplay);
        } else {
          console.log("error loading ad");
        }
      }
    });
    updateDailyBtn();
  }, populateLevelSelectScreen = function() {
    const grid = document.getElementById("level-select-grid");
    if (!grid)
      return;
    grid.innerHTML = "";
    gameLevels.forEach((level, index) => {
      const btn = document.createElement("button");
      btn.classList.add("btn");
      const numSpan = document.createElement("div");
      numSpan.innerText = index + 1;
      btn.appendChild(numSpan);
      const stars = levelStars[index] || 0;
      if (index <= maxUnlockedLevel) {
        const starsDiv = document.createElement("div");
        starsDiv.classList.add("level-stars");
        let starsHTML = "";
        for (let i = 0; i < 3; i++) {
          starsHTML += i < stars ? STAR_GOLD_IMG : STAR_DARK_IMG;
        }
        starsDiv.innerHTML = starsHTML;
        btn.appendChild(starsDiv);
      }
      if (index > maxUnlockedLevel) {
        btn.disabled = true;
      }
      btn.addEventListener("click", () => {
        loadLevel(index);
        const lvl = gameLevels[currentLevelIndex2];
        if (lvl && lvl.interlude) {
          showInterlude(lvl.interlude);
        } else {
          setGameState(GameState.PLAYING);
          startTimer();
        }
      });
      grid.appendChild(btn);
    });
  }, openSettings = function() {
    const vols = getVolumes();
    document.getElementById("bgm-slider").value = vols.bgmVolume;
    document.getElementById("sfx-slider").value = vols.sfxVolume;
    document.getElementById("settings-modal").style.display = "flex";
  }, showInterlude = function(interlude) {
    stopTimer();
    document.getElementById("interlude-title").innerText = interlude.title || "New Mechanic!";
    document.getElementById("interlude-text").innerText = interlude.text || "";
    const imgContainer = document.getElementById("interlude-img-container");
    const imgEl = document.getElementById("interlude-img");
    const interludeScreen = document.getElementById("interlude-screen");
    if (interlude.image) {
      imgEl.src = interlude.image;
      imgContainer.style.display = "block";
    } else {
      imgEl.src = "";
      imgContainer.style.display = "none";
    }
    if (interlude.tutorial) {
      interludeScreen.classList.add("tutorial-active");
      playTutorial(interlude.tutorial);
    } else {
      interludeScreen.classList.remove("tutorial-active");
    }
    setGameState(GameState.INTERLUDE);
  };
  let hintsAvailable = 0;
  let flipsAvailable = 0;
  let rotatesAvailable = 0;
  let coins = 0;
  let lastDailyClaim = 0;
  let adFreeUntil = 0;
  async function saveCurrentProgress() {
    const puzzleProgress = getPuzzleProgress();
    const progress = {
      currentLevelIndex: currentLevelIndex2,
      maxUnlockedLevel,
      currentPuzzleIndex: puzzleProgress.currentPuzzleIndex,
      unlockedPieces: puzzleProgress.unlockedPieces,
      levelStars,
      hintsAvailable,
      flipsAvailable,
      rotatesAvailable,
      coins,
      lastDailyClaim,
      adFreeUntil,
      audio: getVolumes()
    };
    await saveProgress(progress);
  }
  setupWinLogic((isFirstTimeWin) => {
    setTimeout(async () => {
      if (currentState !== GameState.LEVEL_COMPLETE)
        return;
      const puzzleIcon = document.querySelector('#level-complete-text img[alt="Puzzle"]');
      const coinIcon = document.querySelector('#level-complete-text img[alt="Coin"]');
      const btn = document.getElementById("btn-continue");
      const puzzleSourceRect = puzzleIcon ? puzzleIcon.getBoundingClientRect() : btn ? btn.getBoundingClientRect() : null;
      const coinSourceRect = coinIcon ? coinIcon.getBoundingClientRect() : btn ? btn.getBoundingClientRect() : null;
      if (isFirstTimeWin) {
        animatePuzzleFlying(puzzleSourceRect, getUnlockedPieceCount() + LEVEL_REWARD_PUZZLE_PIECES);
        coins += LEVEL_REWARD_COINS;
        animateCoinsFlying(LEVEL_REWARD_COINS, coinSourceRect, updateCoinsDisplay);
      }
    }, 2e3);
  });
  initUI();
  const btn_back_home = document.getElementById("btn-back-home");
  document.getElementById("btn-play").addEventListener("click", () => {
    startGameplay(showInterlude);
  });
  document.getElementById("btn-puzzle").addEventListener("click", () => {
    setGameState(GameState.PUZZLE);
  });
  document.getElementById("btn-level-select").addEventListener("click", () => {
    setGameState(GameState.LEVEL_SELECT);
  });
  btn_back_home.addEventListener("click", () => {
    stopTimer();
    setGameState(GameState.HOME);
  });
  document.getElementById("btn-puzzle-back").addEventListener("click", () => {
    setGameState(GameState.HOME);
  });
  document.getElementById("btn-mg-back").addEventListener("click", () => {
    setGameState(GameState.HOME);
  });
  document.getElementById("btn-level-select-back").addEventListener("click", () => {
    setGameState(GameState.HOME);
  });
  const debug_anim = document.getElementById("btn-debug-animation");
  if (debug_anim) {
    debug_anim.addEventListener("click", () => {
      console.log("Debug animation button clicked");
      debug_playPieceAnimation();
    });
  }
  const debug_vid = document.getElementById("btn-debug-video");
  if (debug_vid) {
    debug_vid.addEventListener("click", () => {
      console.log("Debug video button clicked");
      debug_playCompletionVideo();
    });
  }
  document.getElementById("btn-settings").addEventListener("click", openSettings);
  document.getElementById("btn-close-settings").addEventListener("click", () => {
    document.getElementById("settings-modal").style.display = "none";
  });
  document.getElementById("bgm-slider").addEventListener("input", (e) => setBGMVolume(e.target.value));
  document.getElementById("sfx-slider").addEventListener("input", (e) => setSFXVolume(e.target.value));
  const btnPrivacy = document.getElementById("btn-privacy-settings");
  if (btnPrivacy) {
    btnPrivacy.addEventListener("click", showPrivacyOptions);
  }
  const btnStore = document.getElementById("btn-store");
  if (btnStore) {
    btnStore.addEventListener("click", () => openStore(adFreeUntil));
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown, false);
  renderer.domElement.addEventListener("pointermove", onPointerMove, { passive: false });
  renderer.domElement.addEventListener("pointerup", onPointerUp, false);
  window.addEventListener("resize", () => {
    updateCameraFrustum(camera, window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }, false);
  window.addEventListener("pointerdown", resetIdleTimer);
  setOnSingleFlipConsumed(async () => {
    flipsAvailable--;
    setHelpUsed(true);
    await saveCurrentProgress();
    updateFlipButton();
  });
  setOnSingleRotateConsumed(async () => {
    rotatesAvailable--;
    setHelpUsed(true);
    await saveCurrentProgress();
    updateRotateButton();
  });
  document.getElementById("btn-interlude-continue").addEventListener("click", () => {
    stopTutorial();
    document.getElementById("interlude-screen").classList.remove("tutorial-active");
    loadLevel(currentLevelIndex2);
    startTimer();
    setGameState(GameState.PLAYING);
  });
  document.getElementById("btn-single-flip").addEventListener("click", async () => {
    if (isSingleFlipActive) {
      toggleSingleFlipMode();
      return;
    }
    if (flipsAvailable > 0) {
      toggleSingleFlipMode();
    } else if (coins >= 100) {
      const btn = document.getElementById("btn-single-flip");
      btn.disabled = true;
      coins -= 100;
      flipsAvailable++;
      await saveCurrentProgress();
      updateCoinsDisplay();
      updateFlipButton();
      toggleSingleFlipMode();
      btn.disabled = false;
    } else {
      const btn = document.getElementById("btn-single-flip");
      btn.disabled = true;
      try {
        const success = await showAd2("Single Flip");
        if (success) {
          flipsAvailable++;
          await saveCurrentProgress();
          updateFlipButton();
          toggleSingleFlipMode();
        }
      } catch (err) {
        console.log("Ad failed to load:", err);
      }
      btn.disabled = false;
    }
  });
  document.getElementById("btn-single-rotate").addEventListener("click", async () => {
    if (isSingleRotateActive) {
      toggleSingleRotateMode();
      return;
    }
    if (rotatesAvailable > 0) {
      toggleSingleRotateMode();
    } else if (coins >= 100) {
      const btn = document.getElementById("btn-single-rotate");
      btn.disabled = true;
      coins -= 100;
      rotatesAvailable++;
      await saveCurrentProgress();
      updateCoinsDisplay();
      updateRotateButton();
      toggleSingleRotateMode();
      btn.disabled = false;
    } else {
      const btn = document.getElementById("btn-single-rotate");
      btn.disabled = true;
      try {
        const success = await showAd2("Single Rotate");
        if (success) {
          rotatesAvailable++;
          await saveCurrentProgress();
          updateRotateButton();
          toggleSingleRotateMode();
        }
      } catch (err) {
        console.log("Ad failed to load:", err);
      }
      btn.disabled = false;
    }
  });
  document.getElementById("reset-view-btn").addEventListener("click", () => {
    trackLevelRestart(currentLevelIndex2);
    loadLevel(currentLevelIndex2);
    startGameplay(showInterlude);
  });
  document.getElementById("btn-hint").addEventListener("click", async () => {
    if (isHintActive) {
      trackAction("hint_dismiss", { method: "button" });
      showSolutionHint();
      return;
    }
    if (hintsAvailable > 0) {
      const hintsShown = showSolutionHint();
      if (hintsShown) {
        hintsAvailable--;
        setHelpUsed(true);
        trackAction("hint", { method: "inventory" });
        await saveCurrentProgress();
        updateHintButton();
      }
    } else if (coins >= 100) {
      const hintsShown = showSolutionHint();
      if (hintsShown) {
        coins -= 100;
        setHelpUsed(true);
        trackAction("hint", { method: "coins" });
        await saveCurrentProgress();
        updateCoinsDisplay();
        updateHintButton();
      }
    } else {
      const btn = document.getElementById("btn-hint");
      btn.disabled = true;
      try {
        const success = await showAd2("Hint");
        if (success) {
          const hintsShown = showSolutionHint();
          if (hintsShown) {
            setHelpUsed(true);
          }
          trackAction("hint", { method: "ad" });
          await saveCurrentProgress();
        }
      } catch (err) {
        console.log("Ad failed to load:", err);
      }
      btn.disabled = false;
      updateHintButton();
    }
  });
  document.getElementById("btn-continue").addEventListener("click", async () => {
    const btn = document.getElementById("btn-continue");
    btn.disabled = true;
    const isFirstTimeWin = currentLevelIndex2 >= maxUnlockedLevel;
    if (isFirstTimeWin) {
      setGameState(GameState.PUZZLE);
      for (let i = 0; i < LEVEL_REWARD_PUZZLE_PIECES; i++) {
        await unlockNextPiece();
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (Date.now() > adFreeUntil) {
      btn.innerText = "Loading Ad...";
      try {
        await showAd2("Interstitial");
      } catch (err) {
        console.log("Ad skipped or failed to load:", err);
      }
    } else {
      console.log("Post-level Ad skipped - User has active Ad-Free subscription.");
    }
    advanceLevel();
    await saveCurrentProgress();
    updateCoinsDisplay();
    document.getElementById("rewards-display").innerHTML = `${PUZZLE_ICON} ${getUnlockedPieceCount()}`;
    btn.innerText = "Continue";
    btn.disabled = false;
    if (currentLevelIndex2 >= gameLevels.length) {
      loadLevel(currentLevelIndex2);
      setGameState(GameState.HOME);
    } else {
      loadLevel(currentLevelIndex2);
      startGameplay(showInterlude);
    }
    populateLevelSelectScreen();
  });
  async function initializeGame() {
    console.debug("Initializing game...");
    requestAnimationFrame(animate);
    let currentProgress = 0;
    const updateProgress = (percent) => {
      currentProgress = percent;
      const bar = document.getElementById("splash-loading-bar");
      const text = document.getElementById("splash-loading-text");
      if (bar)
        bar.style.width = `${Math.floor(percent)}%`;
      if (text)
        text.innerText = `Loading... ${Math.floor(percent)}%`;
    };
    await backgroundLoaded;
    updateProgress(10);
    initAnalytics();
    await loadGeometries((loaded, total) => {
      updateProgress(10 + loaded / total * 70);
    });
    const levels = await loadLevels();
    updateProgress(85);
    await initProgressService();
    updateProgress(90);
    await initAds();
    updateProgress(95);
    const progress = await loadProgress();
    updateProgress(100);
    setGameData(
      levels,
      progress.currentLevelIndex,
      progress.maxUnlockedLevel !== void 0 ? progress.maxUnlockedLevel : progress.currentLevelIndex,
      progress.levelStars || {}
    );
    hintsAvailable = progress.hintsAvailable || 0;
    flipsAvailable = progress.flipsAvailable || 0;
    rotatesAvailable = progress.rotatesAvailable || 0;
    coins = progress.coins || 0;
    lastDailyClaim = progress.lastDailyClaim || 0;
    adFreeUntil = progress.adFreeUntil || 0;
    if (progress.audio) {
      setBGMVolume(progress.audio.bgmVolume);
      setSFXVolume(progress.audio.sfxVolume);
    }
    setPuzzleState({ index: progress.currentPuzzleIndex, pieces: progress.unlockedPieces });
    initPuzzle("puzzle-grid-container");
    populateLevelSelectScreen();
    document.getElementById("rewards-display").innerHTML = `${PUZZLE_ICON} ${getUnlockedPieceCount()}`;
    updateCoinsDisplay();
    setupDailyRewardUI();
    let offering = await initStore();
    if (FF_DEBUG_STORE && !offering) {
      console.debug("[Store] Injecting mock offering for local debugging");
      offering = {
        availablePackages: [
          { identifier: "pkg_starterpack", product: { identifier: "pkg_starterpack", name: "Starter Pack", title: "Starter Pack", description: "Great value!", priceString: "$4.99", price: 4.99 } },
          { identifier: "pkg_propack", product: { identifier: "pkg_propack", name: "Pro Pack", title: "Pro Pack", description: "For the pros!", priceString: "$14.99", price: 14.99 } },
          { identifier: "coins_100", product: { identifier: "coins_100", name: "100 Coins", title: "100 Coins", description: "A small pile of coins", priceString: "$0.99", price: 0.99 } },
          { identifier: "coins_500", product: { identifier: "coins_500", name: "500 Coins", title: "500 Coins", description: "A large pile of coins", priceString: "$3.99", price: 3.99 } },
          { identifier: "adfree_3d", product: { identifier: "adfree_3d", name: "Ad-Free 3 Days", title: "Ad-Free 3 Days", description: "Remove ads for 3 days", priceString: "$1.99", price: 1.99 } },
          { identifier: "adfree_30d", product: { identifier: "adfree_30d", name: "Ad-Free 30 Days", title: "Ad-Free 30 Days", description: "Remove ads for 1 month", priceString: "$9.99", price: 9.99 } }
        ]
      };
    }
    if (offering) {
      renderDynamicStore(offering);
    } else if (isStoreSupported || FF_DEBUG_STORE) {
      const storeContent = document.getElementById("store-content");
      if (storeContent) {
        storeContent.innerHTML = '<p style="text-align: center; color: #ccc; margin-top: 20px;">Store is currently unavailable. Please check your connection.</p>';
      }
    }
    setupStoreUI(FF_DEBUG_STORE, () => adFreeUntil, {
      onCoinsPurchased: async (amount, rect, price, id) => {
        coins += amount;
        await saveCurrentProgress();
        updateHintButton();
        updateFlipButton();
        updateRotateButton();
        animateCoinsFlying(amount, rect, updateCoinsDisplay);
        document.getElementById("store-modal").style.display = "none";
        trackAction("iap_purchase", { item: `coins_${amount}`, price });
      },
      onAdFreePurchased: async (days, price, id) => {
        adFreeUntil = Date.now() + days * 24 * 60 * 60 * 1e3;
        await saveCurrentProgress();
        alert(`Ads successfully removed for ${days} days!`);
        document.getElementById("store-modal").style.display = "none";
        trackAction("iap_purchase", { item: `adfree_${days}d`, price });
      },
      onPackagePurchased: async (pkg) => {
        if (pkg.coins > 0)
          coins += pkg.coins;
        if (pkg.hints > 0)
          hintsAvailable += pkg.hints;
        if (pkg.flips > 0)
          flipsAvailable += pkg.flips;
        if (pkg.rotates > 0)
          rotatesAvailable += pkg.rotates;
        await saveCurrentProgress();
        updateCoinsDisplay();
        updateHintButton();
        updateFlipButton();
        updateRotateButton();
        if (pkg.coins > 0) {
          animateCoinsFlying(pkg.coins, pkg.rect, updateCoinsDisplay);
        }
        document.getElementById("store-modal").style.display = "none";
        trackAction("iap_purchase", { item: `pkg_${pkg.pkgName.replace(/\s+/g, "").toLowerCase()}`, price: pkg.price });
        alert(`Successfully purchased ${pkg.pkgName}!`);
      }
    });
    const coinsDisplay = document.getElementById("coins-display");
    if (coinsDisplay && (isStoreSupported || FF_DEBUG_STORE)) {
      coinsDisplay.style.cursor = "pointer";
      coinsDisplay.addEventListener("click", () => openStore(adFreeUntil));
    }
    updateHintButton();
    updateFlipButton();
    updateRotateButton();
    loadLevel(currentLevelIndex2);
    const loadingText = document.getElementById("splash-loading-text");
    const loadingContainer = document.getElementById("splash-loading-container");
    const tapText = document.getElementById("splash-tap-text");
    if (loadingText)
      loadingText.style.display = "none";
    if (loadingContainer)
      loadingContainer.style.display = "none";
    if (tapText)
      tapText.style.display = "block";
    try {
      const version = await getAppVersion();
      if (version) {
        setGameVersion(version);
        const v = `v${version}`;
        const homeVersion = document.getElementById("version-display-home");
        const settingsVersion = document.getElementById("version-display-settings");
        if (homeVersion)
          homeVersion.innerText = v;
        if (settingsVersion)
          settingsVersion.innerText = v;
      }
    } catch (e) {
      console.warn("[App] Could not read app version:", e);
    }
  }
  document.body.addEventListener("pointerdown", () => {
    initAudio();
  }, { once: true });
  const splashScreen = document.getElementById("splash-screen");
  if (splashScreen) {
    splashScreen.addEventListener("click", () => {
      if (document.getElementById("splash-tap-text").style.display !== "none") {
        initAudio();
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch((err) => console.warn(err));
        }
        setGameState(GameState.HOME);
      }
    });
  }
  window.onload = initializeGame;
}
//# sourceMappingURL=main.js.map
