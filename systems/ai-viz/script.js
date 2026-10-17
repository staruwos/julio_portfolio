import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const GRID_SIZE = 18;
const HALF_GRID = GRID_SIZE / 2;

// Replaced Tailwind colors with earthy, organic tones
const COLORS = {
  background: 0xe8e4d9, // Warm paper
  ground: 0xdcd8cc,     // Slightly darker paper
  wall: 0x3a3f44,       // Charcoal / graphite
  start: 0x4a7c59,      // Organic green
  goal: 0xb55a5a,       // Brick red
  explored: 0x8ba6b5,   // Muted sketch blue
  path: 0xd4a373        // Mustard/tan
};

const viewport = document.querySelector("#viewport");

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);
// Subtle fog to blend the edges into the paper background
//scene.fog = new THREE.Fog(COLORS.background, 15, 45);

const camera = new THREE.PerspectiveCamera(
  48,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  100
);

camera.position.set(13, 16, 16);

const renderer = new THREE.WebGLRenderer({
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(2, 0, 0);
controls.minDistance = 8;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI / 2.05;

/* Lighting - adjusted for a daylight/room setting instead of dark mode */

const hemisphereLight = new THREE.HemisphereLight(
  0xffffff, // Sky color (white)
  0x8d8d8d, // Ground color (greyish)
  1.2
);

scene.add(hemisphereLight);

const sun = new THREE.DirectionalLight(0xfffaed, 2.0); // Warm sunlight

sun.position.set(8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
// Soften the shadows slightly to look more like ambient room light
sun.shadow.bias = -0.0005; 

scene.add(sun);

/* Ground and grid */

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
  new THREE.MeshStandardMaterial({
    color: COLORS.ground,
    roughness: 0.92,
    metalness: 0.05
  })
);

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;

scene.add(ground);

const gridHelper = new THREE.GridHelper(
  GRID_SIZE,
  GRID_SIZE,
  0x52708c,
  0x2b3b50
);

gridHelper.position.y = 0.015;

scene.add(gridHelper);

/*
 * This invisible plane receives mouse clicks. Raycasting directly against it
 * allows tiles behind walls to remain selectable.
 */
const hitPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
);

hitPlane.rotation.x = -Math.PI / 2;
hitPlane.position.y = 0.04;

scene.add(hitPlane);

/* Scene groups */

const wallGroup = new THREE.Group();
const searchGroup = new THREE.Group();

scene.add(wallGroup);
scene.add(searchGroup);

/* Playground state */

const walls = new Set();

let startCell = { x: 2, z: 2 };
let goalCell = {
  x: GRID_SIZE - 3,
  z: GRID_SIZE - 3
};

let agentCell = { ...startCell };
let selectedTool = "wall";
let runToken = 0;

/* Reusable geometry and materials */

const wallGeometry = new THREE.BoxGeometry(0.9, 1.1, 0.9);

const wallMaterial = new THREE.MeshStandardMaterial({
  color: COLORS.wall,
  roughness: 0.6,
  metalness: 0.25
});

const searchGeometry = new THREE.BoxGeometry(0.72, 0.055, 0.72);

const exploredMaterial = new THREE.MeshBasicMaterial({
  color: COLORS.explored,
  transparent: true,
  opacity: 0.58
});

const pathMaterial = new THREE.MeshBasicMaterial({
  color: COLORS.path
});

/* Markers and agent */

function createMarker(color, type) {
  const geometry =
    type === "goal"
      ? new THREE.ConeGeometry(0.28, 0.7, 20)
      : new THREE.CylinderGeometry(0.27, 0.27, 0.18, 20);

  const marker = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      roughness: 0.4
    })
  );

  marker.castShadow = true;
  scene.add(marker);

  return marker;
}

const startMarker = createMarker(COLORS.start, "start");
const goalMarker = createMarker(COLORS.goal, "goal");

const agent = new THREE.Mesh(
  new THREE.SphereGeometry(0.27, 24, 18),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: COLORS.explored,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.35
  })
);

agent.castShadow = true;
scene.add(agent);

const agentTop = new THREE.Mesh(
  new THREE.ConeGeometry(0.11, 0.26, 12),
  new THREE.MeshStandardMaterial({
    color: COLORS.explored,
    emissive: COLORS.explored,
    emissiveIntensity: 0.7
  })
);

agentTop.position.y = 0.28;
agent.add(agentTop);

/* Utility functions */

function cellKey(cell) {
  return `${cell.x},${cell.z}`;
}

function sameCell(first, second) {
  return first.x === second.x && first.z === second.z;
}

function cellToWorld(cell, y = 0) {
  return new THREE.Vector3(
    cell.x - HALF_GRID + 0.5,
    y,
    cell.z - HALF_GRID + 0.5
  );
}

function isInside(cell) {
  return (
    cell.x >= 0 &&
    cell.x < GRID_SIZE &&
    cell.z >= 0 &&
    cell.z < GRID_SIZE
  );
}

function isBlocked(cell) {
  return walls.has(cellKey(cell));
}

function setStatus(message) {
  document.querySelector("#status").textContent = message;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function getSpeed() {
  return Number(document.querySelector("#speed").value);
}

function algorithmName(value) {
  const names = {
    astar: "A* Search",
    dijkstra: "Dijkstra",
    bfs: "Breadth-First Search",
    greedy: "Greedy Best-First"
  };

  return names[value] ?? value;
}

/* Board rendering */

function updateMarkers() {
  startMarker.position.copy(cellToWorld(startCell, 0.1));
  goalMarker.position.copy(cellToWorld(goalCell, 0.38));
}

function resetAgent() {
  agentCell = { ...startCell };
  agent.position.copy(cellToWorld(agentCell, 0.32));
}

function clearSearchVisuals() {
  searchGroup.clear();
}

function renderWalls() {
  wallGroup.clear();

  for (const key of walls) {
    const [x, z] = key.split(",").map(Number);

    const wall = new THREE.Mesh(
      wallGeometry,
      wallMaterial
    );

    wall.position.copy(cellToWorld({ x, z }, 0.55));
    wall.castShadow = true;
    wall.receiveShadow = true;

    wallGroup.add(wall);
  }
}

function stopSimulation(message = "Simulation stopped.") {
  runToken += 1;

  if (message) {
    setStatus(message);
  }
}

/* Pathfinding */

function getNeighbors(cell) {
  const directions = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ];

  const neighbors = [];

  for (const direction of directions) {
    const neighbor = {
      x: cell.x + direction.x,
      z: cell.z + direction.z
    };

    if (isInside(neighbor) && !isBlocked(neighbor)) {
      neighbors.push(neighbor);
    }
  }

  return neighbors;
}

function heuristic(first, second) {
  return (
    Math.abs(first.x - second.x) +
    Math.abs(first.z - second.z)
  );
}

function reconstructPath(parent, endCell) {
  const path = [];
  let currentKey = cellKey(endCell);

  while (currentKey) {
    const [x, z] = currentKey.split(",").map(Number);

    path.push({ x, z });
    currentKey = parent.get(currentKey);
  }

  return path.reverse();
}

function findPath(start, goal, algorithm) {
  if (sameCell(start, goal)) {
    return {
      visited: [{ ...start }],
      path: [{ ...start }]
    };
  }

  const startKey = cellKey(start);
  const goalKey = cellKey(goal);

  const frontier = [
    {
      cell: { ...start },
      cost: 0,
      priority: 0,
      order: 0
    }
  ];

  const bestCost = new Map([[startKey, 0]]);
  const parent = new Map();
  const closed = new Set();
  const visited = [];

  let insertionOrder = 1;

  while (frontier.length > 0) {
    frontier.sort((first, second) => {
      if (first.priority !== second.priority) {
        return first.priority - second.priority;
      }

      return first.order - second.order;
    });

    const current = frontier.shift();
    const currentKey = cellKey(current.cell);

    if (closed.has(currentKey)) {
      continue;
    }

    closed.add(currentKey);
    visited.push(current.cell);

    if (currentKey === goalKey) {
      return {
        visited,
        path: reconstructPath(parent, goal)
      };
    }

    for (const neighbor of getNeighbors(current.cell)) {
      const neighborKey = cellKey(neighbor);

      if (closed.has(neighborKey)) {
        continue;
      }

      const newCost = current.cost + 1;
      const oldCost = bestCost.get(neighborKey);

      if (oldCost !== undefined && newCost >= oldCost) {
        continue;
      }

      bestCost.set(neighborKey, newCost);
      parent.set(neighborKey, currentKey);

      let priority;

      switch (algorithm) {
        case "greedy":
          priority = heuristic(neighbor, goal);
          break;

        case "astar":
          priority = newCost + heuristic(neighbor, goal);
          break;

        case "bfs":
        case "dijkstra":
        default:
          priority = newCost;
          break;
      }

      frontier.push({
        cell: neighbor,
        cost: newCost,
        priority,
        order: insertionOrder
      });

      insertionOrder += 1;
    }
  }

  return {
    visited,
    path: []
  };
}

/* Search visualization */

function addSearchTile(cell, material, height) {
  if (sameCell(cell, startCell) || sameCell(cell, goalCell)) {
    return;
  }

  const tile = new THREE.Mesh(searchGeometry, material);

  tile.position.copy(cellToWorld(cell, height));
  searchGroup.add(tile);
}

async function visualizeSearch(result, token) {
  const searchDelay = Math.max(
    1,
    28 - getSpeed() * 0.26
  );

  for (const cell of result.visited) {
    if (token !== runToken) {
      return false;
    }

    addSearchTile(cell, exploredMaterial, 0.07);
    await delay(searchDelay);
  }

  for (const cell of result.path) {
    if (token !== runToken) {
      return false;
    }

    addSearchTile(cell, pathMaterial, 0.115);
    await delay(Math.max(3, searchDelay * 1.5));
  }

  return true;
}

/* Agent animation */

function animateAgentBetween(from, to, token) {
  return new Promise((resolve) => {
    const startPosition = cellToWorld(from, 0.32);
    const endPosition = cellToWorld(to, 0.32);

    const duration = Math.max(
      60,
      260 - getSpeed() * 1.85
    );

    const startTime = performance.now();

    agent.lookAt(
      endPosition.x,
      agent.position.y,
      endPosition.z
    );

    function frame(now) {
      if (token !== runToken) {
        resolve(false);
        return;
      }

      const progress = Math.min(
        1,
        (now - startTime) / duration
      );

      const smooth =
        progress * progress * (3 - 2 * progress);

      agent.position.lerpVectors(
        startPosition,
        endPosition,
        smooth
      );

      agent.position.y +=
        Math.sin(progress * Math.PI) * 0.12;

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        agent.position.copy(endPosition);
        resolve(true);
      }
    }

    requestAnimationFrame(frame);
  });
}

async function moveAgentAlongPath(path, token) {
  for (let index = 1; index < path.length; index += 1) {
    const moved = await animateAgentBetween(
      path[index - 1],
      path[index],
      token
    );

    if (!moved) {
      return false;
    }

    agentCell = { ...path[index] };
  }

  return true;
}

/* AI behaviors */

async function runLeg(target, token) {
  clearSearchVisuals();

  const algorithm =
    document.querySelector("#algorithm").value;

  const result = findPath(
    agentCell,
    target,
    algorithm
  );

  setStatus(
    `Searching with ${algorithmName(algorithm)}. ` +
    `${result.visited.length} tiles examined.`
  );

  const visualized = await visualizeSearch(
    result,
    token
  );

  if (!visualized || token !== runToken) {
    return false;
  }

  if (result.path.length === 0) {
    setStatus(
      "No route was found. Remove some walls and try again."
    );

    return false;
  }

  setStatus(
    `Route found. Moving through ${result.path.length - 1} steps.`
  );

  return moveAgentAlongPath(result.path, token);
}

function randomFreeCell(excludedCell) {
  const freeCells = [];

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let z = 0; z < GRID_SIZE; z += 1) {
      const cell = { x, z };

      if (
        !isBlocked(cell) &&
        !sameCell(cell, excludedCell)
      ) {
        freeCells.push(cell);
      }
    }
  }

  if (freeCells.length === 0) {
    return null;
  }

  const index = Math.floor(
    Math.random() * freeCells.length
  );

  return freeCells[index];
}

async function runSimulation() {
  stopSimulation("");

  const token = runToken;
  const behavior =
    document.querySelector("#behavior").value;

  clearSearchVisuals();
  resetAgent();

  if (behavior === "goal") {
    const successful = await runLeg(
      goalCell,
      token
    );

    if (successful && token === runToken) {
      setStatus("Goal reached.");
    }

    return;
  }

  if (behavior === "patrol") {
    let target = { ...goalCell };

    while (token === runToken) {
      const successful = await runLeg(
        target,
        token
      );

      if (!successful) {
        break;
      }

      if (sameCell(target, goalCell)) {
        setStatus("Goal reached. Returning to start.");
        target = { ...startCell };
      } else {
        setStatus("Start reached. Returning to goal.");
        target = { ...goalCell };
      }

      await delay(350);
    }

    return;
  }

  if (behavior === "wander") {
    while (token === runToken) {
      const target = randomFreeCell(agentCell);

      if (!target) {
        setStatus("No free destination is available.");
        break;
      }

      const successful = await runLeg(
        target,
        token
      );

      if (!successful) {
        if (token === runToken) {
          setStatus(
            "The wander destination could not be reached."
          );
        }

        break;
      }

      setStatus(
        "Wander destination reached. Choosing another tile."
      );

      await delay(350);
    }
  }
}

/* Board editing */

function editCell(cell) {
  stopSimulation("");
  clearSearchVisuals();

  const key = cellKey(cell);

  if (selectedTool === "wall") {
    if (
      sameCell(cell, startCell) ||
      sameCell(cell, goalCell)
    ) {
      setStatus(
        "Move the start or goal before placing a wall here."
      );

      return;
    }

    if (walls.has(key)) {
      walls.delete(key);
    } else {
      walls.add(key);
    }
  }

  if (selectedTool === "erase") {
    walls.delete(key);
  }

  if (selectedTool === "start") {
    if (sameCell(cell, goalCell)) {
      setStatus(
        "Start and goal must use different tiles."
      );

      return;
    }

    walls.delete(key);
    startCell = { ...cell };
  }

  if (selectedTool === "goal") {
    if (sameCell(cell, startCell)) {
      setStatus(
        "Start and goal must use different tiles."
      );

      return;
    }

    walls.delete(key);
    goalCell = { ...cell };
  }

  renderWalls();
  updateMarkers();
  resetAgent();

  setStatus(`Edited tile ${cell.x}, ${cell.z}.`);
}

function addRandomWalls() {
  stopSimulation("");
  clearSearchVisuals();
  walls.clear();

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let z = 0; z < GRID_SIZE; z += 1) {
      const cell = { x, z };

      if (
        sameCell(cell, startCell) ||
        sameCell(cell, goalCell)
      ) {
        continue;
      }

      if (Math.random() < 0.23) {
        walls.add(cellKey(cell));
      }
    }
  }

  renderWalls();
  resetAgent();

  setStatus(
    "Random walls generated. A route is not guaranteed."
  );
}

function clearBoard() {
  stopSimulation("");
  walls.clear();
  clearSearchVisuals();
  renderWalls();
  resetAgent();

  setStatus("Board cleared.");
}

/* Mouse tile selection */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let pointerDownPosition = null;

renderer.domElement.addEventListener(
  "pointerdown",
  (event) => {
    if (event.button !== 0) {
      return;
    }

    pointerDownPosition = {
      x: event.clientX,
      y: event.clientY
    };
  }
);

renderer.domElement.addEventListener(
  "pointerup",
  (event) => {
    if (
      event.button !== 0 ||
      !pointerDownPosition
    ) {
      return;
    }

    const movement = Math.hypot(
      event.clientX - pointerDownPosition.x,
      event.clientY - pointerDownPosition.y
    );

    pointerDownPosition = null;

    /*
     * Larger pointer movement is treated as camera rotation
     * rather than a tile click.
     */
    if (movement > 6) {
      return;
    }

    const rectangle =
      renderer.domElement.getBoundingClientRect();

    pointer.x =
      ((event.clientX - rectangle.left) /
        rectangle.width) *
        2 -
      1;

    pointer.y =
      -(
        (event.clientY - rectangle.top) /
        rectangle.height
      ) *
        2 +
      1;

    raycaster.setFromCamera(pointer, camera);

    const intersections =
      raycaster.intersectObject(hitPlane);

    if (intersections.length === 0) {
      return;
    }

    const point = intersections[0].point;

    const cell = {
      x: Math.floor(point.x + HALF_GRID),
      z: Math.floor(point.z + HALF_GRID)
    };

    if (isInside(cell)) {
      editCell(cell);
    }
  }
);

/* Toolbar controls */

document.querySelectorAll(".tool").forEach((button) => {
  button.addEventListener("click", () => {
    selectedTool = button.dataset.tool;

    document.querySelectorAll(".tool").forEach((item) => {
      item.classList.toggle(
        "active",
        item === button
      );
    });

    setStatus(`Selected tool: ${button.textContent.trim()}.`);
  });
});

document
  .querySelector("#run")
  .addEventListener("click", runSimulation);

document
  .querySelector("#stop")
  .addEventListener("click", () => {
    stopSimulation();
  });

document
  .querySelector("#random")
  .addEventListener("click", addRandomWalls);

document
  .querySelector("#clear")
  .addEventListener("click", clearBoard);

const speedInput = document.querySelector("#speed");
const speedValue = document.querySelector("#speedValue");

speedInput.addEventListener("input", () => {
  speedValue.textContent = `${speedInput.value}%`;
});

/* Window resize */

function resizeRenderer() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (width === 0 || height === 0) {
    return;
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
  );
}

window.addEventListener("resize", resizeRenderer);

const resizeObserver = new ResizeObserver(() => {
  resizeRenderer();
});

resizeObserver.observe(viewport);

/* Main render loop */

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  renderer.render(scene, camera);
  console.log(camera.position)
}

/* Initial setup */

updateMarkers();
renderWalls();
resetAgent();
resizeRenderer();
animate();
