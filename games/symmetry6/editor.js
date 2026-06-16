var process = { env: { NODE_ENV: "production" } };

// editor.js
var hexRadius = 30;
var hexWidth = Math.sqrt(3) * hexRadius;
var hexHeight = 2 * hexRadius;
var colorMap = {
  "r": "#e74c3c",
  "b": "#3498db",
  "y": "#f1c40f",
  "g": "#2ecc71",
  "p": "#9b59b6",
  "o": "#e67e22",
  "c": "#00bcd4",
  "*": "#838383",
  "@": "#272727"
};
var pathData = {
  "s": [[0, 3]],
  "c": [[0, 1]],
  "a": [[1, 5]],
  "C": [[0, 1], [3, 4]],
  "B": [[0, 1], [2, 3]],
  "A": [[1, 5], [2, 4]],
  "t": [[0, 1], [2, 3], [4, 5]],
  "0": [[0, 6]],
  "1": [[1, 6]],
  "2": [[2, 6]],
  "3": [[3, 6]],
  "4": [[4, 6]],
  "5": [[5, 6]]
};
var allowedPathModels = ["s", "c", "a", "C", "B", "t", "A", "0", "1", "2", "3", "4", "5"];
var EDITOR_MAX_COLS = 7;
var EDITOR_MAX_ROWS = 5;
var EDITOR_R_LIMIT = Math.floor(EDITOR_MAX_ROWS / 2);
var EDITOR_Q_OFFSET = Math.floor(EDITOR_MAX_COLS / 2);
function isOutOfBounds(q, r) {
  if (r < -EDITOR_R_LIMIT || r > EDITOR_R_LIMIT)
    return true;
  let cols = EDITOR_MAX_COLS;
  if (Math.abs(r) % 2 === 0 === (EDITOR_MAX_COLS % 2 === 0))
    cols--;
  const qOffset = Math.floor(cols / 2);
  const qStart = Math.ceil(-r / 2) - qOffset;
  return q < qStart || q > qStart + cols - 1;
}
function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
  toast.style.color = "white";
  toast.style.padding = "10px 20px";
  toast.style.borderRadius = "5px";
  toast.style.zIndex = "1000";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.5s, bottom 0.5s";
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.bottom = "30px";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.bottom = "20px";
    toast.addEventListener("transitionend", () => {
      if (toast.parentNode)
        document.body.removeChild(toast);
    });
  }, 2500);
}
var levels = [];
var currentLevelIdx = 6;
var editingObjective = false;
var editingInterlude = false;
var grid = /* @__PURE__ */ new Map();
var walls = /* @__PURE__ */ new Set();
var colorGates = /* @__PURE__ */ new Map();
var zoneMask = /* @__PURE__ */ new Map();
var freezeMask = /* @__PURE__ */ new Map();
var undoStack = [];
var redoStack = [];
var currentTool = "paintTop";
var currentTopColor = "rr";
var currentBotColor = "rr";
var isDragging = false;
var isTestMode = false;
var isRecordingTutorial = false;
var isPlayingTutorial = false;
var playbackRunId = 0;
var tutorialHandEl = null;
var tutorialSteps = [];
var tutorialStartConfig = null;
var testSteps = 0;
var flipsSinceCopy = 0;
var lastDragTileStr = null;
var selectedFlipTile = null;
var svgGrid = document.getElementById("grid");
function axialToPixel(q, r) {
  return {
    x: hexRadius * Math.sqrt(3) * (q + r / 2),
    y: hexRadius * 3 / 2 * r
  };
}
function pathTypeAndRotationToEdges(pathType, rot) {
  if (!pathType || pathType.length === 0)
    return [];
  if (!pathData[pathType])
    return [];
  const totalRot = (6 + rot) % 6;
  const edges = [];
  for (const segment of pathData[pathType]) {
    const e1 = (segment[0] + totalRot) % 6;
    const e2 = segment[1] === 6 ? 6 : (segment[1] + totalRot) % 6;
    if (e1 !== 6)
      edges.push(e1);
    if (e2 !== 6)
      edges.push(e2);
  }
  return edges;
}
function edgesToPathString(edges) {
  if (!edges || edges.length === 0)
    return "";
  const inputSet = new Set(edges.map((e) => (e % 6 + 6) % 6));
  for (let p = 0; p <= 5; p++) {
    for (let rot = 0; rot < 6; rot++) {
      const candidate = new Set(pathTypeAndRotationToEdges("0", rot));
      if (candidate.size === inputSet.size && [...candidate].every((e) => inputSet.has(e))) {
        return rot.toString();
      }
    }
  }
  for (const type of ["s", "c", "a", "C", "B", "A", "t"]) {
    for (let rot = 0; rot < 6; rot++) {
      const candidate = new Set(pathTypeAndRotationToEdges(type, rot));
      if (candidate.size === inputSet.size && [...candidate].every((e) => inputSet.has(e))) {
        return `${type}${rot}`;
      }
    }
  }
  return "";
}
function getHexPolygonPoints(radius) {
  let points = [];
  for (let i = 0; i < 6; i++) {
    let a = i / 6 * Math.PI * 2;
    points.push(`${Math.sin(a) * radius},${Math.cos(a) * radius}`);
  }
  return points.join(" ");
}
function getEdgeMidpoint(edgeIdx) {
  const mappedIdx = (10 - edgeIdx) % 6;
  const angle = (mappedIdx + 0.5) * (Math.PI / 3);
  const innerRadius = hexWidth / 2;
  return {
    x: Math.sin(angle) * innerRadius,
    y: Math.cos(angle) * innerRadius
  };
}
function saveHistoryState() {
  const stateGrid = Array.from(grid.entries()).map(([k, v]) => [k, { ...v, edges: [...v.edges] }]);
  undoStack.push({ grid: stateGrid, walls: Array.from(walls), colorGates: Array.from(colorGates.entries()), zones: Array.from(zoneMask.entries()), freezes: Array.from(freezeMask.entries()) });
  redoStack = [];
}
function applyHistoryState(state) {
  grid = new Map(state.grid.map(([k, v]) => [k, { ...v, edges: [...v.edges] }]));
  walls = new Set(state.walls);
  colorGates = new Map(state.colorGates || []);
  zoneMask = new Map(state.zones || []);
  freezeMask = new Map(state.freezes || []);
  render();
  saveCurrentToData();
}
function undo() {
  if (isTestMode || isRecordingTutorial || isPlayingTutorial)
    return;
  if (undoStack.length === 0)
    return;
  const stateGrid = Array.from(grid.entries()).map(([k, v]) => [k, { ...v, edges: [...v.edges] }]);
  redoStack.push({ grid: stateGrid, walls: Array.from(walls), colorGates: Array.from(colorGates.entries()), zones: Array.from(zoneMask.entries()), freezes: Array.from(freezeMask.entries()) });
  applyHistoryState(undoStack.pop());
}
function redo() {
  if (isTestMode || isRecordingTutorial || isPlayingTutorial)
    return;
  if (redoStack.length === 0)
    return;
  const stateGrid = Array.from(grid.entries()).map(([k, v]) => [k, { ...v, edges: [...v.edges] }]);
  undoStack.push({ grid: stateGrid, walls: Array.from(walls), colorGates: Array.from(colorGates.entries()), zones: Array.from(zoneMask.entries()), freezes: Array.from(freezeMask.entries()) });
  applyHistoryState(redoStack.pop());
}
function copyLayer(level, direction, showToastNotification = true) {
  flipsSinceCopy = 0;
  const targetMovesInput = document.getElementById("target-moves-input");
  if (targetMovesInput)
    targetMovesInput.value = 0;
  level.targetMoves = 0;
  if (direction === "objective-to-initial") {
    level.map = JSON.parse(JSON.stringify(level.objective?.map || []));
    if (showToastNotification)
      showToast("Copied Objective map to Initial Board.");
  } else {
    if (!level.objective)
      level.objective = { type: "match_map", map: [] };
    level.objective.map = JSON.parse(JSON.stringify(level.map || []));
    if (showToastNotification)
      showToast("Copied Initial Board to Objective map.");
  }
}
var isShuffling = false;
function isBlockedEdge(tileA, tileB, wallSet) {
  if (!tileA || !tileB)
    return true;
  let keyA = `${tileA.q},${tileA.r}`;
  let keyB = `${tileB.q},${tileB.r}`;
  let wallKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
  if (wallSet && wallSet.has(wallKey))
    return true;
  if (colorGates.has(wallKey)) {
    const allowedColors = colorGates.get(wallKey);
    const isTileAllowed = (tile) => {
      if (!tile || !tile.topColor || tile.topColor === "**" || tile.topColor === "@@" || tile.topColor.startsWith("T"))
        return true;
      return allowedColors.includes(tile.topColor[0]);
    };
    if (!isTileAllowed(tileA) || !isTileAllowed(tileB)) {
      return true;
    }
  }
  return false;
}
function performFlip(targetGrid, wallSet, tileA, tileB) {
  if (!tileA || !tileB)
    return false;
  if (!isTileMovable(tileA) || !isTileMovable(tileB))
    return false;
  const edge = getAdjacentEdge(tileA.q, tileA.r, tileB.q, tileB.r);
  if (edge === null)
    return false;
  let keyA = `${tileA.q},${tileA.r}`;
  let keyB = `${tileB.q},${tileB.r}`;
  if (isBlockedEdge(tileA, tileB, wallSet))
    return false;
  const mod = (n, m) => (n % m + m) % m;
  const reflectEdges = (edges, flipDir) => edges.map((e) => mod(2 * flipDir + 3 - e, 6));
  const aReflected = reflectEdges(tileA.edges, edge);
  const targetFlipDir = (edge + 3) % 6;
  const bReflected = reflectEdges(tileB.edges, targetFlipDir);
  const advanceColorIndex = (tile) => {
    if (!tile.isBlocked && !tile.isTarget && tile.topColor !== "**") {
      return (tile.colorIndex || 0) + 1;
    }
    return tile.colorIndex || 0;
  };
  const newIdxA = advanceColorIndex(tileA);
  const newIdxB = advanceColorIndex(tileB);
  const newTileA = {
    ...tileA,
    q: tileB.q,
    r: tileB.r,
    edges: aReflected,
    path: combineEdgesToPath(aReflected),
    colorIndex: newIdxA
  };
  newTileA.topColor = getCurrentEditorColor(newTileA, 0).repeat(2);
  newTileA.botColor = getCurrentEditorColor(newTileA, 1).repeat(2);
  const newTileB = {
    ...tileB,
    q: tileA.q,
    r: tileA.r,
    edges: bReflected,
    path: combineEdgesToPath(bReflected),
    colorIndex: newIdxB
  };
  newTileB.topColor = getCurrentEditorColor(newTileB, 0).repeat(2);
  newTileB.botColor = getCurrentEditorColor(newTileB, 1).repeat(2);
  targetGrid.set(keyA, newTileB);
  targetGrid.set(keyB, newTileA);
  return true;
}
async function shuffleGrid(targetGrid, wallSet, { flips = 5, onFlip = null }) {
  let flippableKeys = Array.from(targetGrid.keys()).filter((key) => {
    let t = targetGrid.get(key);
    return isTileMovable(t);
  });
  if (flippableKeys.length === 0)
    return;
  const neighbors = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
  let successfulFlips = 0;
  let attempts = 0;
  while (successfulFlips < flips && attempts < flips * 100) {
    attempts++;
    const randomKey = flippableKeys[Math.floor(Math.random() * flippableKeys.length)];
    const tileA = targetGrid.get(randomKey);
    const randomDirIdx = Math.floor(Math.random() * 6);
    const [dq, dr] = [neighbors[randomDirIdx][0], neighbors[randomDirIdx][1]];
    const nKey = `${tileA.q + dq},${tileA.r + dr}`;
    const tileB = targetGrid.get(nKey);
    if (!performFlip(targetGrid, wallSet, tileA, tileB))
      continue;
    successfulFlips++;
    if (onFlip) {
      const newA = targetGrid.get(nKey);
      const newB = targetGrid.get(randomKey);
      await onFlip(newA, newB);
    }
  }
}
async function init() {
  try {
    const res = await fetch("levels.json");
    levels = await res.json();
  } catch (e) {
    console.warn("Could not load levels.json, starting fresh.");
    levels = [{ id: 1, map: [] }];
  }
  populateLevelSelect();
  loadLevel(currentLevelIdx);
  setupEvents();
  render();
}
var levelListPanel = document.getElementById("level-list-panel");
var selectedReorderItems = /* @__PURE__ */ new Set();
var lastSelectedReorderItem = null;
function updateLevelListActiveState() {
  if (!levelListPanel)
    return;
  levelListPanel.querySelectorAll(".reorder-item").forEach((el) => {
    const isInterlude = el.dataset.type === "interlude";
    if (parseInt(el.dataset.index) === currentLevelIdx && isInterlude === editingInterlude) {
      el.classList.add("active");
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      el.classList.remove("active");
    }
  });
}
function populateLevelSelect() {
  levelListPanel.innerHTML = "";
  reorderItems = [];
  selectedReorderItems.clear();
  lastSelectedReorderItem = null;
  levels.forEach((lvl, i) => {
    if (lvl.interlude) {
      reorderItems.push({
        id: reorderItems.length,
        type: "interlude",
        data: JSON.parse(JSON.stringify(lvl.interlude)),
        originalIndex: i
      });
    }
    reorderItems.push({
      id: reorderItems.length,
      type: "level",
      originalObj: lvl,
      originalIndex: i
    });
  });
  reorderItems.forEach((item) => {
    const div = document.createElement("div");
    div.className = "reorder-item";
    div.draggable = true;
    div.dataset.id = item.id;
    div.dataset.type = item.type;
    div.dataset.index = item.originalIndex;
    if (item.type === "interlude") {
      div.style.backgroundColor = "#2c3e50";
      div.style.borderColor = "#34495e";
      div.innerHTML = `
                <div style="flex-shrink: 0; width: 40px; height: 40px; background: #1a252f; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid #34495e; color: #f1c40f; font-size: 20px;">
                    \u{1F4AC}
                </div>
                <div style="display: flex; flex-direction: column; overflow: hidden; flex-grow: 1;">
                    <strong style="color: #f1c40f; font-size: 14px;">Interlude</strong> 
                    <span style="color:#aaa; font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.data.title || "Untitled"}</span>
                </div>
            `;
    } else {
      let lvl = item.originalObj;
      div.innerHTML = `
                <div style="flex-shrink: 0; width: 40px; height: 40px; background: #222; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid #444;">
                    ${generateMiniMapSVG(lvl)}
                </div>
                <div style="display: flex; flex-direction: column; overflow: hidden; flex-grow: 1;">
                    <strong style="color: #eee; font-size: 14px;">Level ${item.originalIndex + 1}</strong> 
                    <span style="color:#aaa; font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${lvl.objectiveString || "No objective"}</span>
                </div>
            `;
    }
    div.addEventListener("click", (e) => {
      disableTestMode();
      saveCurrentToData();
      const allItems = Array.from(levelListPanel.querySelectorAll(".reorder-item"));
      if (e.shiftKey && lastSelectedReorderItem) {
        const currentIndex = allItems.indexOf(div);
        const lastIndex = allItems.indexOf(lastSelectedReorderItem);
        const min = Math.min(currentIndex, lastIndex);
        const max = Math.max(currentIndex, lastIndex);
        selectedReorderItems.clear();
        for (let i = min; i <= max; i++) {
          selectedReorderItems.add(allItems[i]);
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (selectedReorderItems.has(div)) {
          selectedReorderItems.delete(div);
        } else {
          selectedReorderItems.add(div);
        }
        lastSelectedReorderItem = div;
      } else {
        selectedReorderItems.clear();
        selectedReorderItems.add(div);
        lastSelectedReorderItem = div;
      }
      allItems.forEach((el) => el.classList.remove("selected"));
      selectedReorderItems.forEach((el) => el.classList.add("selected"));
      editingInterlude = item.type === "interlude";
      loadLevel(item.originalIndex);
      if (item.type === "interlude") {
        const btnInterlude = document.getElementById("btn-edit-interlude");
        if (btnInterlude)
          btnInterlude.click();
      }
    });
    div.addEventListener("dragstart", handleDragStart);
    div.addEventListener("dragover", handleDragOver);
    div.addEventListener("drop", handleDrop);
    div.addEventListener("dragenter", handleDragEnter);
    div.addEventListener("dragleave", handleDragLeave);
    div.addEventListener("dragend", handleDragEnd);
    levelListPanel.appendChild(div);
  });
  updateLevelListActiveState();
}
function parseTile(q, r, typeStr) {
  const tile = { q, r, staticColors: "", cyclingColors: "", colorIndex: 0, topColor: "**", botColor: "**", isTarget: false, isBlocked: false, path: "", edges: [] };
  if (!typeStr)
    return tile;
  if (typeStr.startsWith("@@")) {
    tile.isBlocked = true;
    return tile;
  }
  if (/^\*+$/.test(typeStr)) {
    return tile;
  }
  if (typeStr.startsWith("T")) {
    tile.isTarget = true;
    tile.staticColors = typeStr[1];
    tile.topColor = typeStr[1] + typeStr[1];
    tile.botColor = tile.topColor;
    tile.path = typeStr.substring(2).replace(/\*+$/, "");
  } else if (typeStr.startsWith("**")) {
    tile.topColor = "**";
    tile.botColor = "**";
    tile.path = typeStr.substring(2).replace(/\*+$/, "");
  } else if (typeStr.startsWith("[")) {
    let closeIdx = typeStr.indexOf("]");
    if (closeIdx !== -1) {
      let colorsPart = typeStr.substring(1, closeIdx);
      let dashIdx = colorsPart.indexOf("-");
      if (dashIdx !== -1) {
        tile.staticColors = colorsPart.substring(0, dashIdx);
        tile.cyclingColors = colorsPart.substring(dashIdx + 1);
      } else {
        tile.staticColors = "";
        tile.cyclingColors = colorsPart;
      }
      tile.path = typeStr.substring(closeIdx + 1).replace(/\*+$/, "");
    }
  } else {
    tile.staticColors = "";
    tile.cyclingColors = typeStr.substring(0, Math.min(2, typeStr.length));
    if (tile.cyclingColors.length === 1)
      tile.cyclingColors += tile.cyclingColors;
    tile.path = typeStr.substring(tile.cyclingColors.length).replace(/\*+$/, "");
  }
  let firstColor = tile.staticColors.length > 0 ? tile.staticColors[0] : tile.cyclingColors.length > 0 ? tile.cyclingColors[0] : "*";
  tile.topColor = firstColor + firstColor;
  let nextColor = "*";
  if (tile.staticColors.length > 1)
    nextColor = tile.staticColors[1];
  else if (tile.staticColors.length === 1 && tile.cyclingColors.length > 0)
    nextColor = tile.cyclingColors[0];
  else if (tile.cyclingColors.length > 1)
    nextColor = tile.cyclingColors[1];
  else if (tile.cyclingColors.length === 1)
    nextColor = tile.cyclingColors[0];
  tile.botColor = nextColor + nextColor;
  if (tile.path) {
    const lastChar = tile.path[tile.path.length - 1];
    let pathType = null;
    let rot = 0;
    if (/[0-5]/.test(lastChar)) {
      rot = parseInt(lastChar, 10);
      pathType = tile.path.length > 1 ? tile.path[0] : "0";
      if (pathType === "*" || /[0-5]/.test(pathType))
        pathType = "0";
    } else {
      pathType = tile.path[0];
    }
    if (pathType) {
      tile.edges = pathTypeAndRotationToEdges(pathType, rot);
    } else {
      tile.edges = [];
    }
  }
  return tile;
}
function encodeTile(tile) {
  if (tile.isBlocked)
    return "@@";
  let pStr = tile.path || "";
  if (tile.isTarget) {
    return "T" + (tile.staticColors || tile.topColor[0] || "*") + pStr;
  }
  let sc = tile.staticColors !== void 0 ? tile.staticColors : "";
  let cc = tile.cyclingColors !== void 0 ? tile.cyclingColors : (tile.topColor[0] || "*") + (tile.botColor[0] || "*");
  if (sc === "" && cc.length <= 2) {
    let cStr = cc.padEnd(2, cc[0] || "*");
    if (cStr === "**" && !pStr)
      return "**";
    return cStr + pStr;
  }
  return `[${sc}-${cc}]${pStr}`;
}
function parseStaticTile(q, r, s) {
  if (!s || s === "*" || s.startsWith("**"))
    return null;
  let tile = { q, r, isBlocked: false, isTarget: false, topColor: "**", botColor: "**", path: "", edges: [], freeze: 0 };
  let hasData = false;
  if (s.includes("@@")) {
    tile.isBlocked = true;
    hasData = true;
  }
  let matchT = s.match(/T([a-zA-Z*])/);
  if (matchT) {
    tile.isTarget = true;
    tile.topColor = matchT[1] + matchT[1];
    tile.botColor = tile.topColor;
    hasData = true;
  }
  let matchE = s.match(/E([a-zA-Z*])?([1-6])/);
  if (matchE) {
    let c = matchE[1] || "*";
    let dir = parseInt(matchE[2], 10) - 1;
    tile.topColor = c + c;
    tile.botColor = c + c;
    tile.path = "0" + dir;
    tile.edges = [dir];
    hasData = true;
  }
  return hasData ? tile : null;
}
function updateInterludeButton() {
  const btn = document.getElementById("btn-edit-interlude");
  if (!btn)
    return;
  const interlude = levels[currentLevelIdx]?.interlude;
  if (interlude && (interlude.title || interlude.text || interlude.image || interlude.tutorial)) {
    btn.innerHTML = editingInterlude ? "Edit Interlude Data" : "Edit Interlude";
    btn.style.borderColor = "#f1c40f";
    btn.style.color = "#f1c40f";
  } else {
    btn.innerHTML = editingInterlude ? "Edit Interlude Data" : "Add Interlude";
    btn.style.borderColor = "#555";
    btn.style.color = "#aaa";
  }
  if (editingInterlude) {
    btn.style.backgroundColor = "#2c3e50";
  } else {
    btn.style.backgroundColor = "#333";
  }
}
function loadLevel(idx) {
  currentLevelIdx = idx;
  grid.clear();
  walls.clear();
  colorGates.clear();
  zoneMask.clear();
  freezeMask.clear();
  undoStack = [];
  redoStack = [];
  const baseLvl = levels[idx];
  let lvl = baseLvl;
  if (editingInterlude) {
    if (!baseLvl.interlude)
      baseLvl.interlude = {};
    if (!baseLvl.interlude.tutorial)
      baseLvl.interlude.tutorial = { map: [], staticMap: [] };
    lvl = baseLvl.interlude.tutorial;
  }
  let staticGrid = /* @__PURE__ */ new Map();
  if (lvl.staticMap && lvl.staticMap.length > 0) {
    let halfRows = Math.floor(lvl.staticMap.length / 2);
    for (let i = 0; i < lvl.staticMap.length; i++) {
      let r = i - halfRows;
      const rowTiles = lvl.staticMap[i].trim().split(/\s+/).filter((t) => t.length > 0);
      const N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        let s = rowTiles[j];
        let matchZ = s.match(/Z(\d+)/);
        if (matchZ)
          zoneMask.set(`${q},${r}`, parseInt(matchZ[1], 10));
        let matchF = s.match(/F(\d+)/);
        if (matchF)
          freezeMask.set(`${q},${r}`, parseInt(matchF[1], 10));
        let matchW = s.match(/W([1-6]+)/);
        if (matchW) {
          let dirs = matchW[1].split("").map(Number);
          dirs.forEach((d) => {
            let edge = d - 1;
            const neighbors = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
            let nq = q + neighbors[edge][0];
            let nr = r + neighbors[edge][1];
            let k1 = `${q},${r}`;
            let k2 = `${nq},${nr}`;
            let wallKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
            walls.add(wallKey);
          });
        }
        let matchC = [...s.matchAll(/C([a-zA-Z]+)([1-6]+)/g)];
        if (matchC.length > 0) {
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
              colorGates.set(wallKey, colors);
            });
          });
        }
        let tileStr = s.replace(/Z\d+/g, "").replace(/F\d+/g, "").replace(/W[1-6]+/g, "").replace(/C[a-zA-Z]+[1-6]+/g, "").replace(/E[a-zA-Z*]?[1-6]/g, "");
        let t = parseStaticTile(q, r, tileStr);
        if (!t)
          t = parseTile(q, r, "**");
        if (t)
          staticGrid.set(`${q},${r}`, t);
      }
    }
  } else {
    const zones = lvl.zones || {};
    const frozen = lvl.frozen || {};
    const lvlWalls = lvl.walls || [];
    const lvlColorGates = lvl.colorGates || {};
    for (const [k, v] of Object.entries(zones))
      zoneMask.set(k, v);
    for (const [k, v] of Object.entries(frozen))
      freezeMask.set(k, v);
    lvlWalls.forEach((w) => walls.add(w));
    for (const [k, v] of Object.entries(lvlColorGates))
      colorGates.set(k, v);
  }
  let movablesMap = editingObjective && lvl.objective ? lvl.objective.map || [] : lvl.map || [];
  if (editingObjective && lvl.objective && lvl.objective.pieces) {
    lvl.objective.pieces.forEach((p) => {
      let parsed = parseTile(p.q, p.r, p.type);
      parsed.freeze = freezeMask.get(`${p.q},${p.r}`) || 0;
      grid.set(`${p.q},${p.r}`, parsed);
    });
  } else if (!editingObjective && lvl.initial) {
    lvl.initial.forEach((p) => {
      let parsed = parseTile(p.q, p.r, p.type);
      parsed.freeze = freezeMask.get(`${p.q},${p.r}`) || 0;
      grid.set(`${p.q},${p.r}`, parsed);
    });
  } else if (movablesMap.length > 0) {
    let halfRows = Math.floor(movablesMap.length / 2);
    for (let i = 0; i < movablesMap.length; i++) {
      let r = i - halfRows;
      const rowTiles = movablesMap[i].trim().split(/\s+/).filter((t) => t.length > 0);
      const N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        let type = rowTiles[j];
        let parsed = parseTile(q, r, type);
        parsed.freeze = freezeMask.get(`${q},${r}`) || 0;
        if (lvl.staticMap) {
          if (!/^\*+$/.test(type))
            grid.set(`${q},${r}`, parsed);
        } else {
          grid.set(`${q},${r}`, parsed);
        }
      }
    }
  }
  staticGrid.forEach((t, k) => {
    if (!grid.has(k)) {
      t.freeze = freezeMask.get(k) || 0;
      grid.set(k, t);
    }
  });
  render();
  const objInput = document.getElementById("objective-input");
  if (objInput) {
    objInput.value = lvl.objectiveString || "";
  }
  const targetMovesInput = document.getElementById("target-moves-input");
  if (targetMovesInput) {
    targetMovesInput.value = lvl.targetMoves || 0;
  }
  const intTitle = document.getElementById("interlude-title");
  const intText = document.getElementById("interlude-text");
  const intImg = document.getElementById("interlude-image");
  if (intTitle && intText && intImg) {
    const interlude = levels[idx].interlude || {};
    intTitle.value = interlude.title || "";
    intText.value = interlude.text || "";
    intImg.value = interlude.image || "";
  }
  updateInterludeButton();
  updateLevelListActiveState();
}
function isTileMovable(tile) {
  if (!tile)
    return false;
  if (tile.isBlocked)
    return false;
  if (tile.isTarget)
    return false;
  if ((isTestMode || isRecordingTutorial || isPlayingTutorial) && tile.freeze > 0) {
    if (!isZoneComplete(tile.freeze))
      return false;
  }
  if (tile.path && tile.path.length > 0) {
    const lastChar = tile.path[tile.path.length - 1];
    const pType = tile.path.length > 1 ? tile.path[0] : "0";
    if (pType === "0" || pType >= "0" && pType <= "5")
      return false;
  }
  let lvl = levels[currentLevelIdx];
  if (editingInterlude && lvl.interlude && lvl.interlude.tutorial) {
    lvl = lvl.interlude.tutorial;
  }
  if (lvl && lvl.objective && lvl.objective.type === "path_connect" && Array.isArray(lvl.objective.targets)) {
    const targetMatch = lvl.objective.targets.some((t) => t.q === tile.q && t.r === tile.r);
    if (targetMatch)
      return false;
  }
  return true;
}
function isZoneComplete(zoneId) {
  let lvl = levels[currentLevelIdx];
  if (editingInterlude && lvl.interlude && lvl.interlude.tutorial) {
    lvl = lvl.interlude.tutorial;
  }
  if (!lvl || !lvl.objective || !lvl.objective.map)
    return false;
  const objMap = lvl.objective.map;
  let halfRows = Math.floor(objMap.length / 2);
  for (let i = 0; i < objMap.length; i++) {
    let r = i - halfRows;
    const rowTiles = objMap[i].trim().split(/\s+/).filter((t) => t.length > 0);
    const N = rowTiles.length;
    if (N === 0)
      continue;
    let qStart = Math.floor(-r / 2 - (N - 1) / 2);
    for (let j = 0; j < N; j++) {
      let q = qStart + j;
      if (zoneMask.get(`${q},${r}`) !== zoneId)
        continue;
      let expectedType = rowTiles[j];
      if (/^\*+$/.test(expectedType))
        continue;
      const tile = grid.get(`${q},${r}`);
      if (!tile)
        return false;
      const currentType = encodeTile(tile);
      const cleanExpected = expectedType.length > 2 ? expectedType.substring(0, 2) + expectedType.substring(2).replace(/\*+$/, "") : expectedType;
      const cleanCurrent = currentType.length > 2 ? currentType.substring(0, 2) + currentType.substring(2).replace(/\*+$/, "") : currentType;
      if (cleanExpected.startsWith("T") || cleanExpected === "@@") {
        if (cleanCurrent[0] !== cleanExpected[0])
          return false;
      } else {
        if (cleanExpected[0] !== cleanCurrent[0])
          return false;
        if (cleanExpected.length > 2) {
          if (cleanExpected.substring(2) !== cleanCurrent.substring(2))
            return false;
        }
      }
    }
  }
  return true;
}
function getCurrentEditorColor(tile, offset = 0) {
  if (tile.isBlocked || tile.isTarget) {
    return tile.isTarget ? tile.staticColors || tile.topColor[0] || "*" : "*";
  }
  let sc = tile.staticColors || "";
  let cc = tile.cyclingColors || "";
  if (!sc && !cc) {
    return tile.topColor ? tile.topColor[0] : "*";
  }
  let idx = (tile.colorIndex || 0) + offset;
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
function checkTestModeWin() {
  let lvl = levels[currentLevelIdx];
  if (editingInterlude && lvl.interlude && lvl.interlude.tutorial) {
    lvl = lvl.interlude.tutorial;
  }
  if (!lvl || !lvl.objective || !lvl.objective.map)
    return false;
  const objMap = lvl.objective.map;
  let halfRows = Math.floor(objMap.length / 2);
  for (let i = 0; i < objMap.length; i++) {
    let r = i - halfRows;
    const rowTiles = objMap[i].trim().split(/\s+/).filter((t) => t.length > 0);
    const N = rowTiles.length;
    if (N === 0)
      continue;
    let qStart = Math.floor(-r / 2 - (N - 1) / 2);
    for (let j = 0; j < N; j++) {
      let q = qStart + j;
      let expectedType = rowTiles[j];
      if (/^\*+$/.test(expectedType))
        continue;
      const tile = grid.get(`${q},${r}`);
      if (!tile)
        return false;
      if (expectedType.startsWith("@@")) {
        if (!tile.isBlocked)
          return false;
      } else if (expectedType.startsWith("T")) {
        if (!tile.isTarget)
          return false;
        if (expectedType[1] !== getCurrentEditorColor(tile))
          return false;
      } else if (expectedType.startsWith("**")) {
        if (tile.isTarget || tile.isBlocked)
          return false;
      } else {
        if (tile.isBlocked || tile.isTarget)
          return false;
        let expectedTop = expectedType[0];
        if (expectedType.startsWith("[")) {
          expectedTop = expectedType.substring(1).replace("-", "")[0] || "*";
        }
        if (expectedTop !== getCurrentEditorColor(tile))
          return false;
      }
      let expectedPath = expectedType.replace(/^@@/, "").replace(/^\*\*/, "").replace(/^T./, "").replace(/^\[.*?\]/, "").replace(/^[a-z*]{2}/, "").replace(/\*+$/, "");
      let currentPath = tile.path || "";
      if (expectedPath !== currentPath)
        return false;
    }
  }
  return true;
}
function flipTwoTiles(tileA, tileB) {
  if (!tileA || !tileB)
    return false;
  if (!isTileMovable(tileA) || !isTileMovable(tileB))
    return false;
  const edge = getAdjacentEdge(tileA.q, tileA.r, tileB.q, tileB.r);
  if (edge === null)
    return false;
  let keyA = `${tileA.q},${tileA.r}`;
  let keyB = `${tileB.q},${tileB.r}`;
  let isBlocked = isBlockedEdge(tileA, tileB, walls);
  if (tileA.freeze > 0 || tileB.freeze > 0)
    isBlocked = true;
  if (isRecordingTutorial) {
    tutorialSteps.push([tileA.q, tileA.r, tileB.q, tileB.r, isBlocked]);
    document.getElementById("tutorial-record-steps").innerText = tutorialSteps.length;
  }
  if (isBlocked)
    return false;
  const mod = (n, m) => (n % m + m) % m;
  const reflectEdges = (edges, flipDir) => edges.map((e) => mod(2 * flipDir + 3 - e, 6));
  const aReflected = reflectEdges(tileA.edges, edge);
  const targetFlipDir = (edge + 3) % 6;
  const bReflected = reflectEdges(tileB.edges, targetFlipDir);
  const advanceColorIndex = (tile) => {
    if (!tile.isBlocked && !tile.isTarget && tile.topColor !== "**") {
      return (tile.colorIndex || 0) + 1;
    }
    return tile.colorIndex || 0;
  };
  const newIdxA = advanceColorIndex(tileA);
  const newIdxB = advanceColorIndex(tileB);
  const newTileA = {
    ...tileA,
    q: tileB.q,
    r: tileB.r,
    edges: aReflected,
    path: combineEdgesToPath(aReflected),
    colorIndex: newIdxA
  };
  newTileA.topColor = getCurrentEditorColor(newTileA, 0).repeat(2);
  newTileA.botColor = getCurrentEditorColor(newTileA, 1).repeat(2);
  const newTileB = {
    ...tileB,
    q: tileA.q,
    r: tileA.r,
    edges: bReflected,
    path: combineEdgesToPath(bReflected),
    colorIndex: newIdxB
  };
  newTileB.topColor = getCurrentEditorColor(newTileB, 0).repeat(2);
  newTileB.botColor = getCurrentEditorColor(newTileB, 1).repeat(2);
  grid.set(keyA, newTileB);
  grid.set(keyB, newTileA);
  if (!isTestMode && !isRecordingTutorial && !editingObjective) {
    flipsSinceCopy++;
    let targetLvl = levels[currentLevelIdx];
    if (editingInterlude) {
      if (!targetLvl.interlude)
        targetLvl.interlude = {};
      if (!targetLvl.interlude.tutorial)
        targetLvl.interlude.tutorial = {};
      targetLvl.interlude.tutorial.targetMoves = flipsSinceCopy;
    } else {
      targetLvl.targetMoves = flipsSinceCopy;
    }
    const targetMovesInput = document.getElementById("target-moves-input");
    if (targetMovesInput)
      targetMovesInput.value = flipsSinceCopy;
  }
  if (isTestMode) {
    testSteps++;
    const testStepsDisplay = document.getElementById("test-steps");
    if (testStepsDisplay)
      testStepsDisplay.innerText = `Steps: ${testSteps}`;
    if (checkTestModeWin()) {
      setTimeout(() => {
        const winModal = document.getElementById("test-win-modal");
        const stepsText = document.getElementById("test-win-steps");
        if (stepsText)
          stepsText.innerText = `You completed the level in ${testSteps} steps.`;
        if (winModal)
          winModal.showModal();
      }, 300);
    }
  }
  commitGridState();
  return true;
}
function exportGridState() {
  grid.forEach((t, k) => {
    if (isOutOfBounds(t.q, t.r)) {
      grid.delete(k);
    }
  });
  walls.forEach((w) => {
    const [k1, k2] = w.split("|");
    const [q1, r1] = k1.split(",").map(Number);
    const [q2, r2] = k2.split(",").map(Number);
    if (isOutOfBounds(q1, r1) || isOutOfBounds(q2, r2)) {
      walls.delete(w);
    }
  });
  colorGates.forEach((colors, w) => {
    const [k1, k2] = w.split("|");
    const [q1, r1] = k1.split(",").map(Number);
    const [q2, r2] = k2.split(",").map(Number);
    if (isOutOfBounds(q1, r1) || isOutOfBounds(q2, r2)) {
      colorGates.delete(w);
    }
  });
  zoneMask.forEach((v, k) => {
    const [q, r] = k.split(",").map(Number);
    if (isOutOfBounds(q, r)) {
      zoneMask.delete(k);
    }
  });
  freezeMask.forEach((v, k) => {
    const [q, r] = k.split(",").map(Number);
    if (isOutOfBounds(q, r)) {
      freezeMask.delete(k);
    }
  });
  let allCoords = /* @__PURE__ */ new Set();
  let unmovables = /* @__PURE__ */ new Map();
  let movables = /* @__PURE__ */ new Map();
  grid.forEach((t, k) => {
    allCoords.add(k);
    if (!isTileMovable(t)) {
      unmovables.set(k, t);
    } else {
      movables.set(k, t);
    }
  });
  walls.forEach((w) => {
    w.split("|").forEach((k) => allCoords.add(k));
  });
  colorGates.forEach((colors, w) => {
    w.split("|").forEach((k) => allCoords.add(k));
  });
  zoneMask.forEach((v, k) => allCoords.add(k));
  freezeMask.forEach((v, k) => allCoords.add(k));
  let tileWalls = /* @__PURE__ */ new Map();
  walls.forEach((w) => {
    const [k1, k2] = w.split("|");
    const [q1, r1] = k1.split(",").map(Number);
    const [q2, r2] = k2.split(",").map(Number);
    let d = getAdjacentEdge(q1, r1, q2, r2);
    let t1 = allCoords.has(k1);
    let t2 = allCoords.has(k2);
    if (t1 && t2) {
      if (d < 3) {
        if (!tileWalls.has(k1))
          tileWalls.set(k1, []);
        tileWalls.get(k1).push(d + 1);
      } else {
        if (!tileWalls.has(k2))
          tileWalls.set(k2, []);
        tileWalls.get(k2).push((d + 3) % 6 + 1);
      }
    } else if (t1) {
      if (!tileWalls.has(k1))
        tileWalls.set(k1, []);
      tileWalls.get(k1).push(d + 1);
    } else if (t2) {
      let d2 = (d + 3) % 6;
      if (!tileWalls.has(k2))
        tileWalls.set(k2, []);
      tileWalls.get(k2).push(d2 + 1);
    }
  });
  let tileColorGates = /* @__PURE__ */ new Map();
  colorGates.forEach((colors, w) => {
    const [k1, k2] = w.split("|");
    const [q1, r1] = k1.split(",").map(Number);
    const [q2, r2] = k2.split(",").map(Number);
    let d = getAdjacentEdge(q1, r1, q2, r2);
    let t1 = allCoords.has(k1);
    let t2 = allCoords.has(k2);
    if (t1 && t2) {
      if (d < 3) {
        if (!tileColorGates.has(k1))
          tileColorGates.set(k1, []);
        tileColorGates.get(k1).push({ edge: d + 1, colors });
      } else {
        if (!tileColorGates.has(k2))
          tileColorGates.set(k2, []);
        tileColorGates.get(k2).push({ edge: (d + 3) % 6 + 1, colors });
      }
    } else if (t1) {
      if (!tileColorGates.has(k1))
        tileColorGates.set(k1, []);
      tileColorGates.get(k1).push({ edge: d + 1, colors });
    } else if (t2) {
      let d2 = (d + 3) % 6;
      if (!tileColorGates.has(k2))
        tileColorGates.set(k2, []);
      tileColorGates.get(k2).push({ edge: d2 + 1, colors });
    }
  });
  let linesStatic = [];
  let linesMovable = [];
  if (allCoords.size > 0) {
    let minR = Infinity, maxR = -Infinity;
    allCoords.forEach((k) => {
      let r = parseInt(k.split(",")[1], 10);
      if (r < minR)
        minR = r;
      if (r > maxR)
        maxR = r;
    });
    let maxAbsR = Math.max(Math.abs(minR), Math.abs(maxR));
    let numRows = maxAbsR * 2 + 1;
    let rawStatic = [];
    let rawMovable = [];
    let maxLenStatic = 2;
    let maxLenMovable = 2;
    for (let i = 0; i < numRows; i++) {
      let r = i - maxAbsR;
      let rowCoords = Array.from(allCoords).map((k) => {
        let [qStr, rStr] = k.split(",");
        return { q: parseInt(qStr, 10), r: parseInt(rStr, 10) };
      }).filter((c) => c.r === r);
      if (rowCoords.length === 0) {
        rawStatic.push([]);
        rawMovable.push([]);
        continue;
      }
      let minQ = Math.min(...rowCoords.map((c) => c.q));
      let maxQ = Math.max(...rowCoords.map((c) => c.q));
      let N = maxQ - minQ + 1;
      let qStart;
      while (true) {
        qStart = Math.floor(-r / 2 - (N - 1) / 2);
        if (qStart <= minQ && qStart + N - 1 >= maxQ)
          break;
        N++;
      }
      let rowStatic = [];
      let rowMovable = [];
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        let k = `${q},${r}`;
        let sStr = "**";
        let tUn = unmovables.get(k);
        let sParts = "";
        if (tUn && tUn.isBlocked)
          sParts += "@@";
        if (tUn && tUn.isTarget)
          sParts += "T" + (tUn.topColor[0] || "*");
        if (tUn && tUn.path && tUn.path.length > 0) {
          const lastChar = tUn.path[tUn.path.length - 1];
          const pType = tUn.path.length > 1 ? tUn.path[0] : "0";
          if (pType === "0" || pType >= "0" && pType <= "5") {
            let dir = parseInt(lastChar, 10) + 1;
            sParts += "E" + (tUn.topColor[0] || "*") + dir;
          }
        }
        if (zoneMask.has(k))
          sParts += "Z" + zoneMask.get(k);
        if (freezeMask.has(k))
          sParts += "F" + freezeMask.get(k);
        if (tileWalls.has(k)) {
          let dirs = Array.from(new Set(tileWalls.get(k))).sort((a, b) => a - b).join("");
          sParts += "W" + dirs;
        }
        if (tileColorGates.has(k)) {
          let gatesByColors = {};
          tileColorGates.get(k).forEach((g) => {
            if (!gatesByColors[g.colors])
              gatesByColors[g.colors] = [];
            gatesByColors[g.colors].push(g.edge);
          });
          for (let colors in gatesByColors) {
            let dirs = Array.from(new Set(gatesByColors[colors])).sort((a, b) => a - b).join("");
            sParts += "C" + colors + dirs;
          }
        }
        if (sParts.length > 0)
          sStr = sParts;
        if (sStr.length > maxLenStatic)
          maxLenStatic = sStr.length;
        rowStatic.push(sStr);
        let mStr = "**";
        let tM = movables.get(k);
        if (tM) {
          mStr = encodeTile(tM);
        }
        if (mStr === "*")
          mStr = "**";
        if (mStr.length > maxLenMovable)
          maxLenMovable = mStr.length;
        rowMovable.push(mStr);
      }
      rawStatic.push(rowStatic);
      rawMovable.push(rowMovable);
    }
    linesStatic = rawStatic.map((row) => {
      if (row.length === 0)
        return "  ";
      return "  " + row.map((s) => s.padEnd(maxLenStatic, "*")).join(" ") + "  ";
    });
    linesMovable = rawMovable.map((row) => {
      if (row.length === 0)
        return "  ";
      return "  " + row.map((s) => s.padEnd(maxLenMovable, "*")).join(" ") + "  ";
    });
  }
  return { staticMap: linesStatic, map: linesMovable };
}
function saveCurrentToData() {
  if (isTestMode || isRecordingTutorial || isPlayingTutorial)
    return;
  const exported = exportGridState();
  let targetLvl = levels[currentLevelIdx];
  if (editingInterlude) {
    if (!targetLvl.interlude)
      targetLvl.interlude = {};
    if (!targetLvl.interlude.tutorial)
      targetLvl.interlude.tutorial = { map: [], staticMap: [] };
    targetLvl = targetLvl.interlude.tutorial;
  }
  targetLvl.staticMap = exported.staticMap;
  delete targetLvl.zones;
  delete targetLvl.frozen;
  delete targetLvl.walls;
  delete targetLvl.colorGates;
  delete targetLvl.initial;
  if (targetLvl.objective) {
    delete targetLvl.objective.pieces;
  }
  if (editingObjective) {
    if (!targetLvl.objective)
      targetLvl.objective = { type: "match_map" };
    targetLvl.objective.map = exported.map;
    targetLvl.objective.type = "match_map";
  } else {
    targetLvl.map = exported.map;
  }
}
function render() {
  let svgContent = document.getElementById("grid-content");
  if (!svgContent) {
    svgGrid.innerHTML = '<g id="grid-content"></g><g id="grid-overlay"></g>';
    svgContent = document.getElementById("grid-content");
  }
  svgContent.innerHTML = "";
  const hexPointsOuter = getHexPolygonPoints(hexRadius);
  const hexPointsInner = getHexPolygonPoints(hexRadius * 0.6);
  const completedZonesCache = /* @__PURE__ */ new Map();
  const checkZone = (z) => {
    if (completedZonesCache.has(z))
      return completedZonesCache.get(z);
    const res = isTestMode || isRecordingTutorial || isPlayingTutorial ? isZoneComplete(z) : false;
    completedZonesCache.set(z, res);
    return res;
  };
  for (let r = -EDITOR_R_LIMIT; r <= EDITOR_R_LIMIT; r++) {
    let cols = EDITOR_MAX_COLS;
    if (Math.abs(r) % 2 === 0 === (EDITOR_MAX_COLS % 2 === 0))
      cols--;
    const qOffset = Math.floor(cols / 2);
    const qStart = Math.ceil(-r / 2) - qOffset;
    for (let q = qStart; q <= qStart + cols - 1; q++) {
      const pos = axialToPixel(q, r);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);
      g.dataset.q = q;
      g.dataset.r = r;
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", hexPointsOuter);
      poly.setAttribute("class", "hex-bg");
      g.appendChild(poly);
      svgContent.appendChild(g);
      const tile = grid.get(`${q},${r}`);
      if (tile) {
        const tColor = colorMap[tile.topColor[0]] || "#444";
        const bColor = colorMap[tile.botColor[0]] || "#444";
        const topPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        topPoly.setAttribute("points", hexPointsOuter);
        topPoly.setAttribute("class", "hex-top");
        topPoly.setAttribute("fill", tile.isBlocked ? colorMap["@"] : tColor);
        if (tile.highlight) {
          topPoly.setAttribute("stroke", "#ffffff");
          topPoly.setAttribute("stroke-width", "4");
        }
        g.appendChild(topPoly);
        if (!tile.isBlocked && !tile.isTarget && tColor !== bColor) {
          const botPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          botPoly.setAttribute("points", hexPointsInner);
          botPoly.setAttribute("class", "hex-bot");
          botPoly.setAttribute("fill", bColor);
          g.appendChild(botPoly);
        }
        if (tile.isTarget) {
          const star = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          star.setAttribute("r", hexRadius * 0.3);
          star.setAttribute("class", "target-star");
          g.appendChild(star);
        }
        if (tile.path) {
          if (!allowedPathModels.includes(tile.path[0]) && !/[0-5]/.test(tile.path[0])) {
            const warn = document.createElementNS("http://www.w3.org/2000/svg", "text");
            warn.setAttribute("class", "missing-warning");
            warn.textContent = "!";
            g.appendChild(warn);
          } else if (tile.edges && tile.edges.length > 0) {
            if (tile.edges.length % 2 === 1) {
              const p1 = getEdgeMidpoint(tile.edges[tile.edges.length - 1]);
              const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "line");
              pathEl.setAttribute("x1", 0);
              pathEl.setAttribute("y1", 0);
              pathEl.setAttribute("x2", p1.x);
              pathEl.setAttribute("y2", p1.y);
              pathEl.setAttribute("class", "path-line");
              g.appendChild(pathEl);
            }
            for (let i = 0; i < tile.edges.length - 1; i += 2) {
              const p1 = getEdgeMidpoint(tile.edges[i]);
              const p2 = getEdgeMidpoint(tile.edges[i + 1]);
              const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
              pathEl.setAttribute("d", `M ${p1.x} ${p1.y} C ${p1.x * 0.5} ${p1.y * 0.5}, ${p2.x * 0.5} ${p2.y * 0.5}, ${p2.x} ${p2.y}`);
              pathEl.setAttribute("class", "path-line");
              g.appendChild(pathEl);
            }
          }
        }
      }
      if (freezeMask.has(`${q},${r}`)) {
        let fVal = freezeMask.get(`${q},${r}`);
        if (fVal > 0 && !checkZone(fVal)) {
          const iceBorder = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          iceBorder.setAttribute("points", hexPointsOuter);
          iceBorder.setAttribute("fill", "none");
          iceBorder.setAttribute("stroke", "#00ffff");
          iceBorder.setAttribute("stroke-width", "3");
          iceBorder.setAttribute("style", "pointer-events: none;");
          g.appendChild(iceBorder);
          const snowflake = document.createElementNS("http://www.w3.org/2000/svg", "text");
          snowflake.textContent = "\u2744\uFE0F";
          snowflake.setAttribute("font-size", "20");
          snowflake.setAttribute("x", "0");
          snowflake.setAttribute("y", "8");
          snowflake.setAttribute("text-anchor", "middle");
          snowflake.setAttribute("dominant-baseline", "central");
          g.appendChild(snowflake);
          const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
          txt.textContent = "F" + fVal;
          txt.setAttribute("fill", "#0ff");
          txt.setAttribute("font-size", "14");
          txt.setAttribute("font-weight", "bold");
          txt.setAttribute("y", "-10");
          txt.setAttribute("text-anchor", "middle");
          txt.style.textShadow = "0 0 3px black";
          g.appendChild(txt);
        }
      }
      if (zoneMask.has(`${q},${r}`)) {
        let zVal = zoneMask.get(`${q},${r}`);
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.textContent = "Z" + zVal;
        txt.setAttribute("fill", "#f39c12");
        txt.setAttribute("font-size", "14");
        txt.setAttribute("y", "15");
        txt.setAttribute("text-anchor", "middle");
        g.appendChild(txt);
      }
      g.addEventListener("mousedown", (e) => {
        if (e.button === 0 || e.button === 2)
          onHexInteract(q, r, e, true);
      });
      g.addEventListener("mouseenter", (e) => onHexInteract(q, r, e, false));
      g.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }
  walls.forEach((wallKey) => {
    const [k1, k2] = wallKey.split("|");
    const p1 = axialToPixel(...k1.split(",").map(Number));
    const p2 = axialToPixel(...k2.split(",").map(Number));
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len * hexRadius * 0.6;
    const ny = dx / len * hexRadius * 0.6;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", midX - nx);
    line.setAttribute("y1", midY - ny);
    line.setAttribute("x2", midX + nx);
    line.setAttribute("y2", midY + ny);
    line.setAttribute("stroke", "#e74c3c");
    line.setAttribute("stroke-width", "6");
    line.setAttribute("stroke-linecap", "round");
    svgContent.appendChild(line);
  });
  colorGates.forEach((colors, wallKey) => {
    const [k1, k2] = wallKey.split("|");
    const p1 = axialToPixel(...k1.split(",").map(Number));
    const p2 = axialToPixel(...k2.split(",").map(Number));
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len * hexRadius * 0.6;
    const ny = dx / len * hexRadius * 0.6;
    const numColors = colors.length;
    for (let i = 0; i < numColors; i++) {
      const colorChar = colors[i];
      const hexColor = colorMap[colorChar] || "#ffffff";
      const startRatio = i / numColors * 2 - 1;
      const endRatio = (i + 1) / numColors * 2 - 1;
      const x1 = midX + nx * startRatio;
      const y1 = midY + ny * startRatio;
      const x2 = midX + nx * endRatio;
      const y2 = midY + ny * endRatio;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", hexColor);
      line.setAttribute("stroke-width", "6");
      if (i === 0 || i === numColors - 1)
        line.setAttribute("stroke-linecap", "round");
      line.setAttribute("opacity", "0.8");
      svgContent.appendChild(line);
    }
  });
}
function getAdjacentEdge(q1, r1, q2, r2) {
  const dq = q2 - q1;
  const dr = r2 - r1;
  if (dq === 0 && dr === 1)
    return 4;
  if (dq === 1 && dr === 0)
    return 3;
  if (dq === 1 && dr === -1)
    return 2;
  if (dq === 0 && dr === -1)
    return 1;
  if (dq === -1 && dr === 0)
    return 0;
  if (dq === -1 && dr === 1)
    return 5;
  return null;
}
function combineEdgesToPath(edges) {
  if (!edges || edges.length === 0)
    return "";
  const normalizedEdges = Array.from(new Set(edges.map((e) => (e % 6 + 6) % 6))).sort((a, b) => a - b);
  const path = edgesToPathString(normalizedEdges);
  if (path)
    return path;
  if (normalizedEdges.length === 1)
    return normalizedEdges[0].toString();
  if (normalizedEdges.length === 2) {
    const [e1, e2] = normalizedEdges;
    const diff = Math.abs(e1 - e2);
    if (diff === 3)
      return "s0";
  }
  return "";
}
function addEdgeToTile(tile, edge) {
  if (!tile.edges.includes(edge))
    tile.edges.push(edge);
  if (tile.edges.length > 6) {
    tile.edges.shift();
    tile.edges.shift();
  }
  tile.path = combineEdgesToPath(tile.edges);
  if (tile.edges.length >= 6 && !["t"].includes(tile.path[0])) {
    tile.edges.shift();
    tile.edges.shift();
    tile.path = combineEdgesToPath(tile.edges);
  }
  if (tile.edges.length >= 4 && ["s", "c", "a"].includes(tile.path[0])) {
    tile.edges.shift();
    tile.edges.shift();
    tile.path = combineEdgesToPath(tile.edges);
  }
}
function onHexInteract(q, r, event, isClick) {
  if (isPlayingTutorial)
    return;
  if (isRecordingTutorial && currentTool !== "flip")
    return;
  let isRightClick = false;
  if (isClick) {
    isRightClick = event.button === 2;
  } else {
    isRightClick = (event.buttons & 2) !== 0;
  }
  if (isClick) {
    saveHistoryState();
    isDragging = true;
  }
  if (!isDragging)
    return;
  const key = `${q},${r}`;
  let tile = grid.get(key) || { q, r, topColor: "**", botColor: "**", isTarget: false, isBlocked: false, path: "", edges: [], freeze: 0 };
  if (currentTool === "wall") {
    if (isClick) {
      saveHistoryState();
      let clientX = event.clientX !== void 0 ? event.clientX : event.touches ? event.touches[0].clientX : 0;
      let clientY = event.clientY !== void 0 ? event.clientY : event.touches ? event.touches[0].clientY : 0;
      let pt = svgGrid.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      let svgP = pt.matrixTransform(svgGrid.getScreenCTM().inverse());
      let closestNeighbor = null, minD = Infinity;
      const neighbors = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      for (let [dq, dr] of neighbors) {
        let nPos = axialToPixel(q + dq, r + dr);
        let dist = Math.hypot(svgP.x - nPos.x, svgP.y - nPos.y);
        if (dist < minD) {
          minD = dist;
          closestNeighbor = { q: q + dq, r: r + dr };
        }
      }
      if (closestNeighbor) {
        let key1 = `${q},${r}`;
        let key2 = `${closestNeighbor.q},${closestNeighbor.r}`;
        let wallKey = key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
        if (walls.has(wallKey))
          walls.delete(wallKey);
        else
          walls.add(wallKey);
        commitGridState();
        render();
      }
    }
    return;
  }
  if (currentTool === "colorGate") {
    if (isClick) {
      saveHistoryState();
      let clientX = event.clientX !== void 0 ? event.clientX : event.touches ? event.touches[0].clientX : 0;
      let clientY = event.clientY !== void 0 ? event.clientY : event.touches ? event.touches[0].clientY : 0;
      let pt = svgGrid.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      let svgP = pt.matrixTransform(svgGrid.getScreenCTM().inverse());
      let closestNeighbor = null, minD = Infinity;
      const neighbors = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      for (let [dq, dr] of neighbors) {
        let nPos = axialToPixel(q + dq, r + dr);
        let dist = Math.hypot(svgP.x - nPos.x, svgP.y - nPos.y);
        if (dist < minD) {
          minD = dist;
          closestNeighbor = { q: q + dq, r: r + dr };
        }
      }
      if (closestNeighbor) {
        let key1 = `${q},${r}`;
        let key2 = `${closestNeighbor.q},${closestNeighbor.r}`;
        let wallKey = key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
        let selectedChar = currentTopColor ? currentTopColor[0] : null;
        if (selectedChar && selectedChar !== "*" && selectedChar !== "@") {
          if (isRightClick) {
            if (colorGates.has(wallKey)) {
              let colors = colorGates.get(wallKey);
              colors = colors.replace(selectedChar, "");
              if (colors === "")
                colorGates.delete(wallKey);
              else
                colorGates.set(wallKey, colors);
            }
          } else {
            if (colorGates.has(wallKey)) {
              let colors = colorGates.get(wallKey);
              if (!colors.includes(selectedChar)) {
                colorGates.set(wallKey, colors + selectedChar);
              }
            } else {
              colorGates.set(wallKey, selectedChar);
            }
          }
        } else if (isRightClick || !isRightClick && (!selectedChar || selectedChar === "*" || selectedChar === "@")) {
          colorGates.delete(wallKey);
        }
        commitGridState();
        render();
      }
    }
    return;
  }
  if (currentTool === "erase") {
    grid.delete(key);
    lastDragTileStr = null;
  } else if (currentTool === "paintTop") {
    if (tile.isTarget)
      return;
    const newColor = isRightClick ? currentBotColor : currentTopColor;
    if (newColor === "@@") {
      tile.isBlocked = true;
    } else {
      tile.staticColors = "";
      if (tile.cyclingColors === void 0 || tile.cyclingColors.length === 0) {
        tile.cyclingColors = tile.topColor[0] + tile.botColor[0];
      }
      if (isRightClick) {
        if (tile.cyclingColors.length > 0) {
          tile.cyclingColors = tile.cyclingColors[0] + newColor[0];
        } else {
          tile.cyclingColors = "*" + newColor[0];
        }
      } else {
        if (tile.cyclingColors.length > 1) {
          tile.cyclingColors = newColor[0] + tile.cyclingColors[1];
        } else {
          tile.cyclingColors = newColor[0] + (tile.cyclingColors[0] || "*");
        }
      }
      let cc = tile.cyclingColors;
      tile.topColor = cc[0] + cc[0];
      tile.botColor = (cc[1] || cc[0]) + (cc[1] || cc[0]);
      tile.isBlocked = false;
    }
    grid.set(key, tile);
    lastDragTileStr = null;
  } else if (currentTool === "setMultiColor") {
    if (isClick) {
      if (tile.isTarget || tile.isBlocked)
        return;
      openMultiColorModal(tile);
    }
    lastDragTileStr = null;
  } else if (currentTool === "paintTarget") {
    tile.isTarget = true;
    tile.isBlocked = false;
    grid.set(key, tile);
    lastDragTileStr = null;
  } else if (currentTool === "paintZone") {
    const zVal = parseInt(document.getElementById("tool-val-zone").value) || 1;
    if (isRightClick) {
      zoneMask.delete(key);
    } else {
      zoneMask.set(key, Math.max(1, zVal));
    }
    lastDragTileStr = null;
  } else if (currentTool === "paintFreeze") {
    const fVal = parseInt(document.getElementById("tool-val-freeze").value) || 0;
    if (isRightClick)
      tile.freeze = 0;
    else
      tile.freeze = fVal;
    grid.set(key, tile);
    if (isRightClick || fVal <= 0)
      freezeMask.delete(key);
    else
      freezeMask.set(key, fVal);
    lastDragTileStr = null;
  } else if (currentTool === "flip") {
    if (!isTileMovable(tile)) {
      lastDragTileStr = null;
      selectedFlipTile = null;
      render();
      return;
    }
    if (isClick) {
      if (!selectedFlipTile) {
        selectedFlipTile = tile;
        render();
        return;
      }
      if (selectedFlipTile.q === tile.q && selectedFlipTile.r === tile.r) {
        selectedFlipTile = null;
        render();
        return;
      }
      if (flipTwoTiles(selectedFlipTile, tile)) {
        selectedFlipTile = null;
        lastDragTileStr = null;
        return;
      }
      selectedFlipTile = tile;
      render();
      return;
    }
    if (isDragging && lastDragTileStr) {
      const [lq, lr] = lastDragTileStr.split(",").map(Number);
      const dragTile = grid.get(`${lq},${lr}`);
      if (dragTile && getAdjacentEdge(dragTile.q, dragTile.r, tile.q, tile.r) !== null) {
        if (flipTwoTiles(dragTile, tile)) {
          selectedFlipTile = null;
          lastDragTileStr = null;
          isDragging = false;
          return;
        }
      }
    }
    if (isClick === false && !isDragging) {
      lastDragTileStr = key;
    }
  } else if (currentTool === "clearPath") {
    tile.path = "";
    tile.edges = [];
    grid.set(key, tile);
    lastDragTileStr = null;
  } else if (currentTool === "path") {
    grid.set(key, tile);
    if (lastDragTileStr && lastDragTileStr !== key) {
      let [lq, lr] = lastDragTileStr.split(",").map(Number);
      let edgeDir = getAdjacentEdge(lq, lr, q, r);
      if (edgeDir !== null) {
        let lastTile = grid.get(lastDragTileStr);
        addEdgeToTile(lastTile, edgeDir);
        addEdgeToTile(tile, (edgeDir + 3) % 6);
      }
    }
    lastDragTileStr = key;
  }
  render();
}
function disableTestMode() {
  if (isTestMode) {
    isTestMode = false;
    const btnTestMode = document.getElementById("btn-test-mode");
    const testStepsDisplay = document.getElementById("test-steps");
    if (btnTestMode) {
      btnTestMode.innerText = "Test Mode: OFF";
      btnTestMode.style.backgroundColor = "transparent";
      btnTestMode.style.color = "#9b59b6";
    }
    if (testStepsDisplay)
      testStepsDisplay.style.display = "none";
    loadLevel(currentLevelIdx);
  }
}
async function runTutorialPlayback() {
  let overlay = document.getElementById("grid-overlay");
  if (!overlay) {
    svgGrid.innerHTML = '<g id="grid-content"></g><g id="grid-overlay"></g>';
    overlay = document.getElementById("grid-overlay");
  }
  if (!tutorialHandEl) {
    tutorialHandEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tutorialHandEl.textContent = "\u{1F446}";
    tutorialHandEl.setAttribute("font-size", "40");
    tutorialHandEl.setAttribute("style", "pointer-events: none; transition: transform 0.6s ease-in-out, opacity 0.3s;");
    overlay.appendChild(tutorialHandEl);
  }
  tutorialHandEl.style.display = "block";
  tutorialHandEl.style.opacity = "0";
  const moveHand = (q, r, scale = 1) => {
    const pos = axialToPixel(q, r);
    tutorialHandEl.setAttribute("transform", `translate(${pos.x - 15}, ${pos.y + 15}) scale(${scale})`);
  };
  const steps = levels[currentLevelIdx].interlude.tutorial.steps;
  const myRunId = ++playbackRunId;
  while (isPlayingTutorial && myRunId === playbackRunId) {
    loadLevel(currentLevelIdx);
    if (steps.length > 0) {
      tutorialHandEl.style.transition = "none";
      moveHand(steps[0][0], steps[0][1], 1);
      void tutorialHandEl.getBoundingClientRect();
      tutorialHandEl.style.transition = "transform 0.6s ease-in-out, opacity 0.3s";
    }
    tutorialHandEl.style.opacity = "1";
    await new Promise((r) => setTimeout(r, 800));
    for (const step of steps) {
      if (!isPlayingTutorial || myRunId !== playbackRunId)
        break;
      const [q1, r1, q2, r2] = step;
      moveHand(q1, r1, 1);
      await new Promise((r) => setTimeout(r, 600));
      if (!isPlayingTutorial || myRunId !== playbackRunId)
        break;
      moveHand(q1, r1, 0.8);
      await new Promise((r) => setTimeout(r, 200));
      if (!isPlayingTutorial || myRunId !== playbackRunId)
        break;
      moveHand(q2, r2, 0.8);
      await new Promise((r) => setTimeout(r, 600));
      if (!isPlayingTutorial || myRunId !== playbackRunId)
        break;
      moveHand(q2, r2, 1);
      const t1 = grid.get(`${q1},${r1}`);
      const t2 = grid.get(`${q2},${r2}`);
      if (t1 && t2)
        flipTwoTiles(t1, t2);
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!isPlayingTutorial || myRunId !== playbackRunId)
      break;
    tutorialHandEl.style.opacity = "0";
    await new Promise((r) => setTimeout(r, 800));
  }
}
function updateInterludeModalUI() {
  const interlude = levels[currentLevelIdx].interlude || {};
  document.getElementById("interlude-title").value = interlude.title || "";
  document.getElementById("interlude-text").value = interlude.text || "";
  document.getElementById("interlude-image").value = interlude.image || "";
  const status = document.getElementById("interlude-tutorial-status");
  const btnClear = document.getElementById("btn-tutorial-clear");
  const btnRecord = document.getElementById("btn-record-tutorial");
  const btnPreview = document.getElementById("btn-tutorial-preview");
  if (interlude.tutorial && interlude.tutorial.steps) {
    status.innerText = `Recorded: ${interlude.tutorial.steps.length} steps`;
    status.style.color = "#2ecc71";
    btnRecord.innerText = "Re-record";
    btnClear.style.display = "block";
    if (btnPreview)
      btnPreview.style.display = "block";
  } else {
    status.innerText = "No tutorial recorded.";
    status.style.color = "#ccc";
    btnRecord.innerText = "Record";
    btnClear.style.display = "none";
    if (btnPreview)
      btnPreview.style.display = "none";
  }
}
var currentMultiColorTile = null;
var draggedSwatch = null;
var isFromPalette = false;
function createSwatch(colorChar, isPalette = false) {
  const el = document.createElement("div");
  el.className = "color-swatch";
  el.dataset.color = colorChar;
  el.style.backgroundColor = colorMap[colorChar] || "#fff";
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    draggedSwatch = el;
    isFromPalette = isPalette;
    e.dataTransfer.setData("text/plain", colorChar);
    setTimeout(() => el.classList.add("dragging"), 0);
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    draggedSwatch = null;
  });
  el.addEventListener("click", () => {
    if (!isPalette && el.parentElement) {
      el.parentElement.removeChild(el);
    }
  });
  return el;
}
function setupDropZone(listId) {
  const listEl = document.getElementById(listId);
  if (!listEl)
    return;
  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    listEl.classList.add("drag-over");
  });
  listEl.addEventListener("dragleave", () => {
    listEl.classList.remove("drag-over");
  });
  listEl.addEventListener("drop", (e) => {
    e.preventDefault();
    listEl.classList.remove("drag-over");
    const colorChar = e.dataTransfer.getData("text/plain");
    if (!colorChar)
      return;
    const afterElement = getDragAfterElement(listEl, e.clientX);
    if (isFromPalette) {
      const newSwatch = createSwatch(colorChar, false);
      if (afterElement == null) {
        listEl.appendChild(newSwatch);
      } else {
        listEl.insertBefore(newSwatch, afterElement);
      }
    } else if (draggedSwatch && draggedSwatch.parentElement !== listEl) {
      if (afterElement == null) {
        listEl.appendChild(draggedSwatch);
      } else {
        listEl.insertBefore(draggedSwatch, afterElement);
      }
    } else if (draggedSwatch) {
      if (afterElement == null) {
        listEl.appendChild(draggedSwatch);
      } else {
        listEl.insertBefore(draggedSwatch, afterElement);
      }
    }
  });
}
function getDragAfterElement(container, x) {
  const draggableElements = [...container.querySelectorAll(".color-swatch:not(.dragging)")];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - (box.left + box.width / 2);
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}
function initPalette() {
  const palette = document.getElementById("multi-color-palette");
  if (!palette || palette.children.length > 0)
    return;
  const validColors = ["r", "b", "y", "g", "p", "o", "c", "*", "@"];
  validColors.forEach((c) => {
    palette.appendChild(createSwatch(c, true));
  });
  setupDropZone("multi-static-list");
  setupDropZone("multi-cycling-list");
}
window.openMultiColorModal = function(tile) {
  currentMultiColorTile = tile;
  const modal = document.getElementById("multi-color-modal");
  if (!modal)
    return;
  initPalette();
  const staticList = document.getElementById("multi-static-list");
  const cyclingList = document.getElementById("multi-cycling-list");
  staticList.innerHTML = "";
  cyclingList.innerHTML = "";
  const sColors = tile.staticColors || "";
  for (let c of sColors) {
    staticList.appendChild(createSwatch(c, false));
  }
  const cColors = tile.cyclingColors || "";
  for (let c of cColors) {
    cyclingList.appendChild(createSwatch(c, false));
  }
  modal.showModal();
};
document.getElementById("btn-multi-cancel")?.addEventListener("click", () => {
  document.getElementById("multi-color-modal").close();
});
document.getElementById("btn-multi-save")?.addEventListener("click", () => {
  if (currentMultiColorTile) {
    saveHistoryState();
    const staticColors = [...document.getElementById("multi-static-list").children].map((el) => el.dataset.color).join("");
    const cyclingColors = [...document.getElementById("multi-cycling-list").children].map((el) => el.dataset.color).join("");
    currentMultiColorTile.staticColors = staticColors;
    currentMultiColorTile.cyclingColors = cyclingColors;
    let sc = currentMultiColorTile.staticColors;
    let cc = currentMultiColorTile.cyclingColors;
    let firstColor = sc.length > 0 ? sc[0] : cc.length > 0 ? cc[0] : "*";
    currentMultiColorTile.topColor = firstColor + firstColor;
    let nextColor = "*";
    if (sc.length > 1)
      nextColor = sc[1];
    else if (sc.length === 1 && cc.length > 0)
      nextColor = cc[0];
    else if (cc.length > 1)
      nextColor = cc[1];
    else if (cc.length === 1)
      nextColor = cc[0];
    currentMultiColorTile.botColor = nextColor + nextColor;
    render();
  }
  document.getElementById("multi-color-modal").close();
});
function setupEvents() {
  window.addEventListener("mouseup", () => {
    isDragging = false;
    lastDragTileStr = null;
    saveCurrentToData();
  });
  svgGrid.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey)
        redo();
      else
        undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    }
  });
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll("[data-tool]").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      currentTool = e.target.dataset.tool;
    });
  });
  document.querySelectorAll(".swatch").forEach((sw) => {
    sw.addEventListener("click", (e) => {
      document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
      e.target.classList.add("active");
      currentTopColor = e.target.dataset.color;
    });
    sw.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      document.querySelectorAll(".swatch").forEach((s) => {
        s.classList.remove("active-bot");
        s.style.outline = "";
      });
      e.target.classList.add("active-bot");
      e.target.style.outline = "2px dashed #ffffff";
      e.target.style.outlineOffset = "-4px";
      currentBotColor = e.target.dataset.color;
    });
  });
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);
  const testWinModal = document.getElementById("test-win-modal");
  if (testWinModal) {
    testWinModal.addEventListener("close", disableTestMode);
  }
  const btnTestWinClose = document.getElementById("btn-test-win-close");
  if (btnTestWinClose) {
    btnTestWinClose.addEventListener("click", () => {
      if (testWinModal)
        testWinModal.close();
    });
  }
  const objInput = document.getElementById("objective-input");
  if (objInput) {
    objInput.addEventListener("input", (e) => {
      if (editingInterlude) {
        let targetLvl = levels[currentLevelIdx];
        if (!targetLvl.interlude)
          targetLvl.interlude = {};
        if (!targetLvl.interlude.tutorial)
          targetLvl.interlude.tutorial = {};
        targetLvl.interlude.tutorial.objectiveString = e.target.value;
      } else {
        levels[currentLevelIdx].objectiveString = e.target.value;
      }
      saveCurrentToData();
    });
    const targetMovesInput = document.getElementById("target-moves-input");
    if (targetMovesInput) {
      targetMovesInput.addEventListener("input", (e) => {
        let targetLvl = levels[currentLevelIdx];
        if (editingInterlude) {
          if (!targetLvl.interlude)
            targetLvl.interlude = {};
          if (!targetLvl.interlude.tutorial)
            targetLvl.interlude.tutorial = {};
          targetLvl.interlude.tutorial.targetMoves = parseInt(e.target.value, 10) || 0;
        } else {
          targetLvl.targetMoves = parseInt(e.target.value, 10) || 0;
        }
        saveCurrentToData();
      });
    }
    updateInterludeButton();
    document.getElementById("btn-edit-interlude").addEventListener("click", () => {
      disableTestMode();
      saveCurrentToData();
      if (!editingInterlude) {
        editingInterlude = true;
        loadLevel(currentLevelIdx);
      }
      updateInterludeModalUI();
      document.getElementById("interlude-modal").showModal();
    });
    document.getElementById("btn-interlude-cancel").addEventListener("click", () => {
      document.getElementById("interlude-modal").close();
    });
    document.getElementById("btn-tutorial-clear").addEventListener("click", () => {
      if (levels[currentLevelIdx].interlude) {
        delete levels[currentLevelIdx].interlude.tutorial;
      }
      updateInterludeModalUI();
      populateLevelSelect();
    });
    document.getElementById("btn-tutorial-preview").addEventListener("click", () => {
      if (!levels[currentLevelIdx].interlude)
        levels[currentLevelIdx].interlude = {};
      levels[currentLevelIdx].interlude.title = document.getElementById("interlude-title").value.trim();
      levels[currentLevelIdx].interlude.text = document.getElementById("interlude-text").value.trim();
      levels[currentLevelIdx].interlude.image = document.getElementById("interlude-image").value.trim();
      document.getElementById("interlude-modal").close();
      saveCurrentToData();
      if (!editingInterlude) {
        editingInterlude = true;
      }
      if (editingObjective) {
        editingObjective = false;
        document.getElementById("layer-initial").classList.add("active");
        document.getElementById("layer-objective").classList.remove("active");
        document.getElementById("btn-copy-layer").innerText = "Copy to Objective";
      }
      loadLevel(currentLevelIdx);
      isPlayingTutorial = true;
      document.getElementById("tutorial-playback-hud").style.display = "flex";
      document.getElementById("sidebar").style.pointerEvents = "none";
      document.getElementById("sidebar").style.opacity = "0.5";
      document.getElementById("topbar").style.pointerEvents = "none";
      document.getElementById("topbar").style.opacity = "0.5";
      runTutorialPlayback();
    });
    document.getElementById("btn-tutorial-stop-playback").addEventListener("click", () => {
      isPlayingTutorial = false;
      playbackRunId++;
      if (tutorialHandEl)
        tutorialHandEl.style.opacity = "0";
      document.getElementById("tutorial-playback-hud").style.display = "none";
      document.getElementById("sidebar").style.pointerEvents = "auto";
      document.getElementById("sidebar").style.opacity = "1";
      document.getElementById("topbar").style.pointerEvents = "auto";
      document.getElementById("topbar").style.opacity = "1";
      loadLevel(currentLevelIdx);
      updateInterludeModalUI();
      document.getElementById("interlude-modal").showModal();
    });
    document.getElementById("btn-record-tutorial").addEventListener("click", () => {
      if (!levels[currentLevelIdx].interlude)
        levels[currentLevelIdx].interlude = {};
      levels[currentLevelIdx].interlude.title = document.getElementById("interlude-title").value.trim();
      levels[currentLevelIdx].interlude.text = document.getElementById("interlude-text").value.trim();
      levels[currentLevelIdx].interlude.image = document.getElementById("interlude-image").value.trim();
      document.getElementById("interlude-modal").close();
      saveCurrentToData();
      if (!editingInterlude) {
        editingInterlude = true;
      }
      if (editingObjective) {
        editingObjective = false;
        document.getElementById("layer-initial").classList.add("active");
        document.getElementById("layer-objective").classList.remove("active");
        document.getElementById("btn-copy-layer").innerText = "Copy to Objective";
      }
      loadLevel(currentLevelIdx);
      isRecordingTutorial = true;
      tutorialSteps = [];
      const exported = exportGridState();
      const existingTutorial = levels[currentLevelIdx].interlude.tutorial || {};
      tutorialStartConfig = JSON.parse(JSON.stringify(existingTutorial));
      tutorialStartConfig.map = exported.map;
      tutorialStartConfig.staticMap = exported.staticMap;
      document.getElementById("tutorial-record-hud").style.display = "flex";
      document.getElementById("tutorial-record-steps").innerText = "0";
      document.getElementById("sidebar").style.pointerEvents = "none";
      document.getElementById("sidebar").style.opacity = "0.5";
      document.getElementById("topbar").style.pointerEvents = "none";
      document.getElementById("topbar").style.opacity = "0.5";
      const flipBtn = document.querySelector('[data-tool="flip"]');
      if (flipBtn)
        flipBtn.click();
    });
    document.getElementById("btn-tutorial-stop").addEventListener("click", () => {
      isRecordingTutorial = false;
      document.getElementById("tutorial-record-hud").style.display = "none";
      document.getElementById("sidebar").style.pointerEvents = "auto";
      document.getElementById("sidebar").style.opacity = "1";
      document.getElementById("topbar").style.pointerEvents = "auto";
      document.getElementById("topbar").style.opacity = "1";
      tutorialStartConfig.steps = tutorialSteps;
      if (!levels[currentLevelIdx].interlude)
        levels[currentLevelIdx].interlude = {};
      levels[currentLevelIdx].interlude.tutorial = tutorialStartConfig;
      loadLevel(currentLevelIdx);
      updateInterludeModalUI();
      populateLevelSelect();
      document.getElementById("interlude-modal").showModal();
    });
    document.getElementById("btn-tutorial-cancel").addEventListener("click", () => {
      isRecordingTutorial = false;
      document.getElementById("tutorial-record-hud").style.display = "none";
      document.getElementById("sidebar").style.pointerEvents = "auto";
      document.getElementById("sidebar").style.opacity = "1";
      document.getElementById("topbar").style.pointerEvents = "auto";
      document.getElementById("topbar").style.opacity = "1";
      loadLevel(currentLevelIdx);
      updateInterludeModalUI();
      document.getElementById("interlude-modal").showModal();
    });
    document.getElementById("btn-interlude-clear").addEventListener("click", () => {
      document.getElementById("interlude-title").value = "";
      document.getElementById("interlude-text").value = "";
      document.getElementById("interlude-image").value = "";
      if (levels[currentLevelIdx].interlude)
        delete levels[currentLevelIdx].interlude;
      saveCurrentToData();
      updateInterludeModalUI();
      populateLevelSelect();
      document.getElementById("interlude-modal").close();
    });
    document.getElementById("btn-interlude-save").addEventListener("click", () => {
      const title = document.getElementById("interlude-title").value.trim();
      const text = document.getElementById("interlude-text").value.trim();
      const image = document.getElementById("interlude-image").value.trim();
      const existingTutorial = levels[currentLevelIdx].interlude?.tutorial;
      if (title || text || image || existingTutorial) {
        levels[currentLevelIdx].interlude = { ...title && { title }, ...text && { text }, ...image && { image }, ...existingTutorial && { tutorial: existingTutorial } };
      } else {
        delete levels[currentLevelIdx].interlude;
      }
      saveCurrentToData();
      updateInterludeButton();
      populateLevelSelect();
      document.getElementById("interlude-modal").close();
    });
  }
  const btnCleanLevel = document.getElementById("btn-clean-level");
  if (btnCleanLevel) {
    btnCleanLevel.addEventListener("click", () => {
      disableTestMode();
      if (!confirm("Are you sure you want to completely clean this level (both initial and objective maps)?"))
        return;
      saveHistoryState();
      let targetLvl = levels[currentLevelIdx];
      if (editingInterlude) {
        if (!targetLvl.interlude)
          targetLvl.interlude = {};
        if (!targetLvl.interlude.tutorial)
          targetLvl.interlude.tutorial = { map: [], staticMap: [] };
        targetLvl = targetLvl.interlude.tutorial;
      }
      targetLvl.map = [];
      targetLvl.staticMap = [];
      delete targetLvl.initial;
      delete targetLvl.walls;
      delete targetLvl.zones;
      delete targetLvl.frozen;
      delete targetLvl.colorGates;
      walls.clear();
      colorGates.clear();
      zoneMask.clear();
      freezeMask.clear();
      if (targetLvl.objective) {
        targetLvl.objective.map = [];
        delete targetLvl.objective.pieces;
      }
      loadLevel(currentLevelIdx);
    });
  }
  document.getElementById("btn-clear-board").addEventListener("click", () => {
    disableTestMode();
    if (!confirm("Are you sure you want to clear the entire board?"))
      return;
    saveHistoryState();
    grid.clear();
    walls.clear();
    colorGates.clear();
    zoneMask.clear();
    freezeMask.clear();
    saveCurrentToData();
    render();
  });
  document.getElementById("layer-initial").addEventListener("click", (e) => {
    if (!isTestMode) {
      saveCurrentToData();
      editingObjective = false;
      e.target.classList.add("active");
      document.getElementById("layer-objective").classList.remove("active");
      document.getElementById("btn-copy-layer").innerText = "Copy to Objective";
      loadLevel(currentLevelIdx);
    }
  });
  document.getElementById("layer-objective").addEventListener("click", (e) => {
    disableTestMode();
    saveCurrentToData();
    editingObjective = true;
    e.target.classList.add("active");
    document.getElementById("layer-initial").classList.remove("active");
    document.getElementById("btn-copy-layer").innerText = "Copy to Initial";
    loadLevel(currentLevelIdx);
  });
  document.getElementById("btn-add").addEventListener("click", () => {
    disableTestMode();
    saveCurrentToData();
    editingInterlude = false;
    const newLevel = { objectiveString: "Match the target pattern.", staticMap: [], map: [], objective: { type: "match_map", map: [] } };
    levels.splice(currentLevelIdx + 1, 0, newLevel);
    populateLevelSelect();
    loadLevel(currentLevelIdx + 1);
  });
  const btnDuplicate = document.getElementById("btn-duplicate");
  if (btnDuplicate) {
    btnDuplicate.addEventListener("click", () => {
      disableTestMode();
      saveCurrentToData();
      editingInterlude = false;
      const newLevel = JSON.parse(JSON.stringify(levels[currentLevelIdx]));
      delete newLevel.interlude;
      levels.splice(currentLevelIdx + 1, 0, newLevel);
      populateLevelSelect();
      loadLevel(currentLevelIdx + 1);
    });
  }
  document.getElementById("btn-delete").addEventListener("click", () => {
    disableTestMode();
    if (editingInterlude) {
      delete levels[currentLevelIdx].interlude;
      editingInterlude = false;
      saveCurrentToData();
      updateInterludeButton();
      populateLevelSelect();
      loadLevel(currentLevelIdx);
      return;
    }
    if (levels.length <= 1)
      return alert("Cannot delete the last level.");
    editingInterlude = false;
    levels.splice(currentLevelIdx, 1);
    if (currentLevelIdx >= levels.length)
      currentLevelIdx = levels.length - 1;
    populateLevelSelect();
    loadLevel(currentLevelIdx);
  });
  document.getElementById("btn-copy-layer").addEventListener("click", () => {
    disableTestMode();
    saveCurrentToData();
    const direction = editingObjective ? "objective-to-initial" : "initial-to-objective";
    let targetLvl = levels[currentLevelIdx];
    if (editingInterlude) {
      if (!targetLvl.interlude)
        targetLvl.interlude = {};
      if (!targetLvl.interlude.tutorial)
        targetLvl.interlude.tutorial = { map: [], staticMap: [] };
      targetLvl = targetLvl.interlude.tutorial;
    }
    copyLayer(targetLvl, direction, true);
    loadLevel(currentLevelIdx);
  });
  const btnTestMode = document.getElementById("btn-test-mode");
  const testStepsDisplay = document.getElementById("test-steps");
  if (btnTestMode) {
    btnTestMode.addEventListener("click", () => {
      if (!isTestMode) {
        saveCurrentToData();
        if (editingObjective) {
          editingObjective = false;
          document.getElementById("layer-initial").classList.add("active");
          document.getElementById("layer-objective").classList.remove("active");
          document.getElementById("btn-copy-layer").innerText = "Copy to Objective";
          loadLevel(currentLevelIdx);
        }
        isTestMode = true;
        btnTestMode.innerText = "Test Mode: ON";
        btnTestMode.style.backgroundColor = "#9b59b6";
        btnTestMode.style.color = "#fff";
        testSteps = 0;
        testStepsDisplay.style.display = "inline";
        testStepsDisplay.innerText = `Steps: ${testSteps}`;
        const flipBtn = document.querySelector('[data-tool="flip"]');
        if (flipBtn)
          flipBtn.click();
      } else {
        disableTestMode();
      }
    });
  }
  document.getElementById("btn-shuffle").addEventListener("click", async () => {
    if (isShuffling)
      return;
    disableTestMode();
    isShuffling = true;
    saveHistoryState();
    const onFlip = async (tileA, tileB) => {
      tileA.highlight = true;
      tileB.highlight = true;
      render();
      await new Promise((r) => setTimeout(r, 600));
      tileA.highlight = false;
      tileB.highlight = false;
    };
    await shuffleGrid(grid, walls, { flips: 5, onFlip });
    if (!editingObjective) {
      flipsSinceCopy += 5;
      let targetLvl = levels[currentLevelIdx];
      if (editingInterlude) {
        if (!targetLvl.interlude)
          targetLvl.interlude = {};
        if (!targetLvl.interlude.tutorial)
          targetLvl.interlude.tutorial = {};
        targetLvl.interlude.tutorial.targetMoves = flipsSinceCopy;
      } else {
        targetLvl.targetMoves = flipsSinceCopy;
      }
      const targetMovesInput = document.getElementById("target-moves-input");
      if (targetMovesInput)
        targetMovesInput.value = flipsSinceCopy;
    }
    saveCurrentToData();
    render();
    isShuffling = false;
  });
  document.getElementById("btn-export").addEventListener("click", () => {
    disableTestMode();
    saveCurrentToData();
    const json = JSON.stringify(levels, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "levels.json" });
    document.body.appendChild(a).click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("file-import").click();
  });
  document.getElementById("file-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file)
      return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedLevels = JSON.parse(event.target.result);
        if (!Array.isArray(importedLevels)) {
          throw new Error("Invalid file format: root object should be an array of levels.");
        }
        disableTestMode();
        levels = importedLevels;
        currentLevelIdx = 0;
        editingInterlude = false;
        populateLevelSelect();
        loadLevel(0);
      } catch (err) {
        alert("Error loading file: " + err.message);
        console.error(err);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });
  document.getElementById("btn-generate-n").addEventListener("click", async () => {
    disableTestMode();
    const btn = document.getElementById("btn-generate-n");
    let n = parseInt(document.getElementById("gen-n-input").value) || 1;
    if (!confirm(`Generate ${n} new levels? This will append them to your current list.`))
      return;
    btn.disabled = true;
    btn.innerText = "Generating...";
    saveCurrentToData();
    for (let i = 0; i < n; i++) {
      let difficulty = levels.length + 1;
      grid.clear();
      walls.clear();
      zoneMask.clear();
      freezeMask.clear();
      let maxGenRadius = Math.min(EDITOR_R_LIMIT, EDITOR_Q_OFFSET);
      let radius = Math.min(1 + Math.floor(difficulty / 5), maxGenRadius);
      let availableColors = ["rr", "bb", "yy", "gg", "pp", "oo", "cc"].sort(() => Math.random() - 0.5);
      let numColors = Math.min(2 + Math.floor(difficulty / 4), availableColors.length);
      let activeColors = availableColors.slice(0, numColors);
      let objectiveString = "";
      let theme = Math.floor(Math.random() * 6);
      if (theme === 0) {
        objectiveString = "Surround the center with matching colored rings.";
        for (let r = -radius; r <= radius; r++) {
          let q1 = Math.max(-radius, -r - radius);
          let q2 = Math.min(radius, -r + radius);
          for (let q = q1; q <= q2; q++) {
            let dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
            let typeStr = "**";
            if (dist === 0) {
              typeStr = "T" + activeColors[0][0];
            } else if (dist <= radius) {
              let c1 = activeColors[dist % activeColors.length];
              let c2 = c1;
              if (difficulty >= 4 && Math.random() > 0.6)
                c2 = activeColors[(dist + 1) % activeColors.length];
              typeStr = c1[0] + c2[0];
            }
            if (dist > 1 && Math.random() < 0.1)
              typeStr = "@@";
            grid.set(`${q},${r}`, parseTile(q, r, typeStr));
          }
        }
      } else if (theme === 1) {
        objectiveString = "Form parallel stripes of color.";
        for (let r = -radius; r <= radius; r++) {
          let q1 = Math.max(-radius, -r - radius);
          let q2 = Math.min(radius, -r + radius);
          let rowColor = activeColors[(r + radius) % activeColors.length];
          for (let q = q1; q <= q2; q++) {
            let typeStr = rowColor;
            if (difficulty >= 5 && Math.random() > 0.7)
              typeStr = rowColor[0] + activeColors[0][0];
            if (q === 0 && r === 0)
              typeStr = "T" + rowColor[0];
            grid.set(`${q},${r}`, parseTile(q, r, typeStr));
          }
        }
      } else if (theme === 2) {
        objectiveString = "Group the matching colors into clusters.";
        for (let r = -radius; r <= radius; r++) {
          let q1 = Math.max(-radius, -r - radius);
          let q2 = Math.min(radius, -r + radius);
          for (let q = q1; q <= q2; q++) {
            let typeStr = "**";
            if (q > 0)
              typeStr = activeColors[0];
            else if (q < 0)
              typeStr = activeColors[1 % activeColors.length];
            else
              typeStr = activeColors[2 % activeColors.length];
            if (q === Math.floor(radius / 2) && r === 0)
              typeStr = "T" + activeColors[0][0];
            if (q === -Math.floor(radius / 2) && r === 0)
              typeStr = "T" + activeColors[1 % activeColors.length][0];
            grid.set(`${q},${r}`, parseTile(q, r, typeStr));
          }
        }
      } else if (theme === 3) {
        objectiveString = "Connect the matching endpoints with a path.";
        radius = Math.max(radius, 2);
        let pColor = activeColors[0];
        for (let r = -radius; r <= radius; r++) {
          let q1 = Math.max(-radius, -r - radius);
          let q2 = Math.min(radius, -r + radius);
          for (let q = q1; q <= q2; q++) {
            let typeStr = activeColors[1 % activeColors.length];
            if (q === 0) {
              if (r === -radius)
                typeStr = pColor[0] + pColor[0] + "4";
              else if (r === radius)
                typeStr = pColor[0] + pColor[0] + "1";
              else
                typeStr = pColor[0] + (difficulty >= 6 ? activeColors[1][0] : pColor[0]) + "s1";
            } else {
              let dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
              let c1 = activeColors[(dist + 1) % activeColors.length];
              typeStr = c1;
            }
            grid.set(`${q},${r}`, parseTile(q, r, typeStr));
          }
        }
      } else if (theme === 4) {
        objectiveString = "Circle the target with a continuous colored path.";
        radius = Math.max(radius, 1);
        let ringColor = activeColors[0];
        let centerColor = activeColors[1 % activeColors.length];
        const ringRot = { "0,-1": "4", "1,-1": "5", "1,0": "0", "0,1": "1", "-1,1": "2", "-1,0": "3" };
        for (let r = -radius; r <= radius; r++) {
          let q1 = Math.max(-radius, -r - radius);
          let q2 = Math.min(radius, -r + radius);
          for (let q = q1; q <= q2; q++) {
            let dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
            let typeStr = centerColor;
            if (dist === 0)
              typeStr = "T" + centerColor[0];
            else if (dist === 1) {
              let key = `${q},${r}`;
              let rot = ringRot[key] || "0";
              typeStr = ringColor[0] + (difficulty >= 5 ? centerColor[0] : ringColor[0]) + "a" + rot;
            } else if (dist > 1) {
              typeStr = activeColors[dist % activeColors.length];
            }
            grid.set(`${q},${r}`, parseTile(q, r, typeStr));
          }
        }
      } else if (theme === 5) {
        objectiveString = "Match the inner tiles to unfreeze the outer tiles.";
        radius = Math.max(radius, 2);
        let innerColor = activeColors[0];
        let outerColor = activeColors[1 % activeColors.length];
        for (let r = -radius; r <= radius; r++) {
          let q1 = Math.max(-radius, -r - radius);
          let q2 = Math.min(radius, -r + radius);
          for (let q = q1; q <= q2; q++) {
            let dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
            let typeStr = "**";
            let tile = parseTile(q, r, typeStr);
            if (dist <= 1) {
              tile = parseTile(q, r, "T" + innerColor[0]);
              zoneMask.set(`${q},${r}`, 1);
            } else if (dist <= radius) {
              tile = parseTile(q, r, "T" + outerColor[0]);
              zoneMask.set(`${q},${r}`, 2);
            }
            if (dist > 1 && Math.random() < 0.1)
              tile.isBlocked = true;
            grid.set(`${q},${r}`, tile);
          }
        }
      }
      levels.push({ objectiveString, staticMap: [], map: [], objective: { type: "match_map", map: [] } });
      currentLevelIdx = levels.length - 1;
      editingObjective = true;
      saveCurrentToData();
      const neighbors = [[-1, 0], [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1]];
      if (difficulty >= 3) {
        let wallCount = Math.floor(difficulty / 2);
        let keys = Array.from(grid.keys());
        for (let j = 0; j < wallCount; j++) {
          let k = keys[Math.floor(Math.random() * keys.length)];
          let dir = Math.floor(Math.random() * 6);
          let t = grid.get(k);
          let nKey = `${t.q + neighbors[dir][0]},${t.r + neighbors[dir][1]}`;
          if (grid.has(nKey)) {
            walls.add(k < nKey ? `${k}|${nKey}` : `${nKey}|${k}`);
          }
        }
      }
      shuffleGrid();
      saveCurrentToData();
    }
    populateLevelSelect();
    loadLevel(levels.length - 1);
    btn.disabled = false;
    btn.innerText = "Generate Levels";
  });
}
function commitGridState() {
  saveCurrentToData();
  render();
}
var dragSourceEl = null;
var reorderItems = [];
function generateMiniMapSVG(level) {
  let tempGrid = /* @__PURE__ */ new Map();
  if (level.staticMap && level.staticMap.length > 0) {
    let halfRows = Math.floor(level.staticMap.length / 2);
    for (let i = 0; i < level.staticMap.length; i++) {
      let r = i - halfRows;
      const rowTiles = level.staticMap[i].trim().split(/\s+/).filter((t) => t.length > 0);
      const N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        let type = rowTiles[j];
        if (type.includes("@@"))
          tempGrid.set(`${q},${r}`, "#272727");
        else {
          let matchT = type.match(/T([a-zA-Z*])/);
          if (matchT && matchT[1] !== "*")
            tempGrid.set(`${q},${r}`, colorMap[matchT[1]] || "#444");
        }
      }
    }
  }
  let movablesMap = level.objective && level.objective.map ? level.objective.map : level.map || [];
  if (movablesMap.length > 0) {
    let halfRows = Math.floor(movablesMap.length / 2);
    for (let i = 0; i < movablesMap.length; i++) {
      let r = i - halfRows;
      const rowTiles = movablesMap[i].trim().split(/\s+/).filter((t) => t.length > 0);
      const N = rowTiles.length;
      if (N === 0)
        continue;
      let qStart = Math.floor(-r / 2 - (N - 1) / 2);
      for (let j = 0; j < N; j++) {
        let q = qStart + j;
        let type = rowTiles[j];
        if (/^\*+$/.test(type))
          continue;
        if (type.startsWith("@@"))
          tempGrid.set(`${q},${r}`, "#272727");
        else if (type.startsWith("T"))
          tempGrid.set(`${q},${r}`, colorMap[type[1]] || "#444");
        else if (!type.startsWith("**"))
          tempGrid.set(`${q},${r}`, colorMap[type[0]] || "#444");
        else if (!tempGrid.has(`${q},${r}`))
          tempGrid.set(`${q},${r}`, "#838383");
      }
    }
  }
  if (tempGrid.size === 0)
    return '<svg viewBox="0 0 100 100"></svg>';
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const r_scale = 10, w_scale = Math.sqrt(3) * r_scale, h_scale = 2 * r_scale;
  let hexes = [];
  tempGrid.forEach((fill, key) => {
    let [q, r] = key.split(",").map(Number);
    let cx = w_scale * (q + r / 2);
    let cy = h_scale * 0.75 * r;
    minX = Math.min(minX, cx - w_scale);
    maxX = Math.max(maxX, cx + w_scale);
    minY = Math.min(minY, cy - h_scale);
    maxY = Math.max(maxY, cy + h_scale);
    hexes.push({ cx, cy, fill });
  });
  let padding = 10;
  let width = maxX - minX + padding * 2;
  let height = maxY - minY + padding * 2;
  let svg = `<svg viewBox="${minX - padding} ${minY - padding} ${width} ${height}" style="width: 100%; height: 100%; display: block;">`;
  let points = Array.from({ length: 6 }, (_, i) => `${Math.sin(i * Math.PI / 3) * r_scale},${Math.cos(i * Math.PI / 3) * r_scale}`).join(" ");
  for (let hex of hexes)
    svg += `<polygon points="${points}" transform="translate(${hex.cx}, ${hex.cy})" fill="${hex.fill}" stroke="#111" stroke-width="1"/>`;
  return svg + `</svg>`;
}
function handleDragStart(e) {
  if (!selectedReorderItems.has(this)) {
    selectedReorderItems.clear();
    selectedReorderItems.add(this);
    lastSelectedReorderItem = this;
    document.querySelectorAll(".reorder-item").forEach((el) => el.classList.remove("selected"));
    this.classList.add("selected");
  }
  dragSourceEl = this;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", this.dataset.id);
  selectedReorderItems.forEach((el) => el.classList.add("dragging"));
}
function handleDragOver(e) {
  if (e.preventDefault)
    e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  return false;
}
function handleDragEnter(e) {
  if (!selectedReorderItems.has(this))
    this.classList.add("drag-over");
}
function handleDragLeave(e) {
  this.classList.remove("drag-over");
}
function handleDrop(e) {
  if (e.stopPropagation)
    e.stopPropagation();
  if (!selectedReorderItems.has(this)) {
    const list = this.parentNode;
    const allItems = Array.from(list.querySelectorAll(".reorder-item"));
    const sourceIndex = allItems.indexOf(dragSourceEl);
    const targetIndex = allItems.indexOf(this);
    const sortedSelected = Array.from(selectedReorderItems).sort((a, b) => {
      return allItems.indexOf(a) - allItems.indexOf(b);
    });
    let refNode = sourceIndex < targetIndex ? this.nextSibling : this;
    while (refNode && selectedReorderItems.has(refNode)) {
      refNode = refNode.nextSibling;
    }
    sortedSelected.forEach((el) => {
      list.insertBefore(el, refNode);
    });
    if (list.id === "level-list-panel") {
      applyReorder(list);
    }
  }
  return false;
}
function handleDragEnd(e) {
  document.querySelectorAll(".reorder-item").forEach((item) => {
    item.classList.remove("dragging");
    item.classList.remove("drag-over");
  });
}
function applyReorder(list) {
  if (!list)
    return false;
  const items = Array.from(list.querySelectorAll(".reorder-item"));
  for (let i = 0; i < items.length; i++) {
    const type = items[i].dataset.type;
    if (type === "interlude") {
      if (i === items.length - 1) {
        alert("An interlude cannot be the last element.");
        if (list.id === "level-list-panel")
          populateLevelSelect();
        return false;
      }
      const nextType = items[i + 1].dataset.type;
      if (nextType === "interlude") {
        alert("Cannot place two interludes consecutively.");
        if (list.id === "level-list-panel")
          populateLevelSelect();
        return false;
      }
    }
  }
  const currentLevelObj = levels[currentLevelIdx];
  const newLevels = [];
  let pendingInterlude = null;
  items.forEach((itemEl) => {
    const id = parseInt(itemEl.dataset.id, 10);
    const item = reorderItems.find((r) => r.id === id);
    if (item.type === "interlude") {
      pendingInterlude = item.data;
    } else {
      let lvl = item.originalObj;
      if (pendingInterlude) {
        lvl.interlude = pendingInterlude;
        pendingInterlude = null;
      } else {
        delete lvl.interlude;
      }
      newLevels.push(lvl);
    }
  });
  levels.splice(0, levels.length, ...newLevels);
  currentLevelIdx = levels.indexOf(currentLevelObj);
  if (currentLevelIdx === -1)
    currentLevelIdx = 0;
  populateLevelSelect();
  loadLevel(currentLevelIdx);
  return true;
}
init();
//# sourceMappingURL=editor.js.map
