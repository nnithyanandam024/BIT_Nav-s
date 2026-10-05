import { getRoadSegmentName } from './roadSnapper';

export function dijkstra(startNode, endNode, graph, nodes, edgeMap = {}) {
  if (!graph[startNode] || !graph[endNode]) {
    return null;
  }

  const distances = {};
  const previous = {};
  const unvisited = new Set(Object.keys(nodes));

  for (const node of Object.keys(nodes)) {
    distances[node] = Infinity;
  }
  distances[startNode] = 0;

  while (unvisited.size > 0) {
    let current = null;
    let minDistance = Infinity;

    for (const node of unvisited) {
      if (distances[node] < minDistance) {
        minDistance = distances[node];
        current = node;
      }
    }

    if (current === null || distances[current] === Infinity) break;
    if (current === endNode) break;

    unvisited.delete(current);

    const neighbors = graph[current] || [];
    for (const edge of neighbors) {
      const neighbor = edge.node;
      if (!unvisited.has(neighbor)) continue;

      const alt = distances[current] + edge.distance;
      if (alt < distances[neighbor]) {
        distances[neighbor] = alt;
        previous[neighbor] = { node: current, edgeId: edge.edgeId };
      }
    }
  }

  if (distances[endNode] === Infinity) return null;

  // Reconstruct path
  const pathNodes = [];
  const pathEdges = [];
  let curr = endNode;

  while (curr) {
    pathNodes.unshift(curr);
    if (previous[curr]) {
      pathEdges.unshift(previous[curr].edgeId);
      curr = previous[curr].node;
    } else {
      break;
    }
  }

  // Exact coordinates along the road nodes
  const coordinates = pathNodes.map(id => ({
    id,
    x: nodes[id].x,
    y: nodes[id].y
  }));

  // Exact SVG road edge vector details
  const edgeDetails = pathEdges.map(id => edgeMap[id]).filter(Boolean);

  const totalDistance = distances[endNode];
  const walkingMinutes = Math.max(1, Math.round(totalDistance / 75));
  const caloriesBurned = Math.round(totalDistance * 0.05);

  return {
    pathNodes,
    pathEdges,
    edgeDetails,
    coordinates,
    totalDistance,
    walkingMinutes,
    caloriesBurned
  };
}

// Find closest road node to a coordinate (x, y)
export function findNearestNode(x, y, nodes) {
  if (!nodes) return null;
  let best = null;
  let minDist = Infinity;
  for (const [id, n] of Object.entries(nodes)) {
    const dist = Math.hypot(n.x - x, n.y - y);
    if (dist < minDist) {
      minDist = dist;
      best = id;
    }
  }
  return best;
}

// Calculate the shortest path between any two campus places on the physical road network
export function calculateCampusRoute(fromPlace, toPlace, campusData, landmarks = []) {
  if (!fromPlace || !toPlace || !campusData?.nodes || !campusData?.graph) return null;

  // 1. Find nearest road network nodes to fromPlace and toPlace
  const startNode = (fromPlace.nearestNode && campusData.nodes[fromPlace.nearestNode])
    ? fromPlace.nearestNode
    : findNearestNode(fromPlace.x, fromPlace.y, campusData.nodes);

  const endNode = (toPlace.nearestNode && campusData.nodes[toPlace.nearestNode])
    ? toPlace.nearestNode
    : findNearestNode(toPlace.x, toPlace.y, campusData.nodes);

  if (!startNode || !endNode) return null;

  // 2. Dijkstra shortest path on physical campus road graph
  const route = dijkstra(startNode, endNode, campusData.graph, campusData.nodes, campusData.edgeMap || {});
  if (!route) return null;

  // 3. Connect exact place pins at endpoints so route starts and ends right at the buildings
  const fullCoordinates = [...route.coordinates];
  if (fullCoordinates.length === 0 || Math.hypot(fullCoordinates[0].x - fromPlace.x, fullCoordinates[0].y - fromPlace.y) > 5) {
    fullCoordinates.unshift({ id: 'start_pin', x: fromPlace.x, y: fromPlace.y });
  }
  if (Math.hypot(fullCoordinates[fullCoordinates.length - 1].x - toPlace.x, fullCoordinates[fullCoordinates.length - 1].y - toPlace.y) > 5) {
    fullCoordinates.push({ id: 'end_pin', x: toPlace.x, y: toPlace.y });
  }

  // 4. Calculate total physical distance including offset to road
  const startOffset = Math.hypot(campusData.nodes[startNode].x - fromPlace.x, campusData.nodes[startNode].y - fromPlace.y);
  const endOffset = Math.hypot(campusData.nodes[endNode].x - toPlace.x, campusData.nodes[endNode].y - toPlace.y);
  const totalDistance = Math.round(route.totalDistance + (startOffset + endOffset) * 0.25);
  const walkingMinutes = Math.max(1, Math.round(totalDistance / 75));
  const caloriesBurned = Math.round(totalDistance * 0.05);

  const allLandmarks = landmarks && landmarks.length > 0 ? landmarks : campusData.landmarks || [];
  const turnByTurn = generateTurnByTurn(route.pathNodes, campusData.nodes, allLandmarks, fromPlace, toPlace);

  return {
    from: fromPlace,
    to: toPlace,
    route: {
      ...route,
      coordinates: fullCoordinates,
      totalDistance,
      walkingMinutes,
      caloriesBurned
    },
    turnByTurn
  };
}

// Generate human-friendly turn-by-turn navigation steps
export function generateTurnByTurn(pathNodes, nodes, landmarks, startPlace, endPlace) {
  if (!pathNodes || pathNodes.length < 2) {
    return [
      {
        step: 1,
        instruction: `You are already at ${endPlace?.name || 'the destination'}.`,
        distance: 0,
        type: 'arrive'
      }
    ];
  }

  const steps = [];
  let stepIndex = 1;

  // Initial step
  const firstP1 = nodes[pathNodes[0]];
  const firstP2 = nodes[pathNodes[1]];
  const initialRoad = firstP1 && firstP2 ? getRoadSegmentName(firstP1, firstP2, landmarks) : 'the main paved pathway';

  steps.push({
    step: stepIndex++,
    instruction: `Start from ${startPlace ? startPlace.name : 'your starting point'}.`,
    detail: `Head toward ${initialRoad}. ${startPlace?.building ? `(${startPlace.building})` : ''}`,
    distance: 0,
    type: 'depart'
  });

  // Calculate direction bearings between segments
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const p1 = nodes[pathNodes[i]];
    const p2 = nodes[pathNodes[i + 1]];
    if (!p1 || !p2) continue;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.round(Math.hypot(dx, dy) * 0.25);
    const roadName = getRoadSegmentName(p1, p2, landmarks);

    // Group small intermediate hops or describe significant direction changes
    if (i === 0) {
      const cardinal = getCardinalDirection(dx, dy);
      steps.push({
        step: stepIndex++,
        instruction: `Walk ${cardinal} along ${roadName}.`,
        detail: `Continue straight for about ${dist} meters.`,
        distance: dist,
        type: 'straight'
      });
    } else if (i < pathNodes.length - 2) {
      const p0 = nodes[pathNodes[i - 1]];
      const angle = getTurnAngle(p0, p1, p2);
      
      // Look for any nearby landmarks passed at this junction
      const nearby = findLandmarkNearNode(pathNodes[i], landmarks, [startPlace?.id, endPlace?.id]);

      if (Math.abs(angle) > 35) {
        const turnDir = angle > 0 ? 'Turn right' : 'Turn left';
        const modifier = Math.abs(angle) > 75 ? '' : 'slight ';
        steps.push({
          step: stepIndex++,
          instruction: `${turnDir.replace('Turn', 'Turn ' + modifier)} onto ${roadName}.`,
          detail: nearby ? `You will pass by ${nearby.name} on your ${angle > 0 ? 'left' : 'right'}. Continue for ${dist}m.` : `Follow ${roadName} for ${dist}m.`,
          distance: dist,
          type: angle > 0 ? 'turn-right' : 'turn-left'
        });
      } else if (nearby && i % 4 === 0) {
        steps.push({
          step: stepIndex++,
          instruction: `Continue past ${nearby.shortName || nearby.name}.`,
          detail: `Keep straight along ${roadName} for ${dist}m.`,
          distance: dist,
          type: 'straight'
        });
      }
    }
  }

  // Arrival step
  steps.push({
    step: stepIndex++,
    instruction: `Arrive at ${endPlace ? endPlace.name : 'your destination'}.`,
    detail: endPlace?.floor ? `Located at ${endPlace.building}, ${endPlace.floor}.` : 'You have reached your destination.',
    distance: 0,
    type: 'arrive'
  });

  return steps;
}

function getCardinalDirection(dx, dy) {
  // In SVG coordinates, y increases downwards (South)
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle >= -22.5 && angle < 22.5) return 'East';
  if (angle >= 22.5 && angle < 67.5) return 'Southeast';
  if (angle >= 67.5 && angle < 112.5) return 'South';
  if (angle >= 112.5 && angle < 157.5) return 'Southwest';
  if (angle >= -67.5 && angle < -22.5) return 'Northeast';
  if (angle >= -112.5 && angle < -67.5) return 'North';
  if (angle >= -157.5 && angle < -112.5) return 'Northwest';
  return 'West';
}

function getTurnAngle(p0, p1, p2) {
  const v1x = p1.x - p0.x;
  const v1y = p1.y - p0.y;
  const v2x = p2.x - p1.x;
  const v2y = p2.y - p1.y;

  const a1 = Math.atan2(v1y, v1x);
  const a2 = Math.atan2(v2y, v2x);

  let diff = (a2 - a1) * (180 / Math.PI);
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

function findLandmarkNearNode(nodeId, landmarks, excludeIds = []) {
  return landmarks.find(l => l.nearestNode === nodeId && !excludeIds.includes(l.id));
}

// Find nearest facility of a given type/category from a source place
export function findNearestFacility(sourcePlaceId, targetType, landmarks, graph, nodes, edgeMap = {}) {
  const source = landmarks.find(l => l.id === sourcePlaceId);
  if (!source) return null;

  // Filter candidate facilities
  const candidates = landmarks.filter(l => {
    if (l.id === source.id) return false;
    if (l.type === targetType || l.category === targetType) return true;
    if (targetType === 'computer_lab' && (l.type === 'computer_lab' || l.aliases.some(a => a.includes('lab')))) return true;
    if (targetType === 'canteen' && (l.category === 'canteen' || l.type === 'canteen')) return true;
    if (targetType === 'sports' && (l.category === 'sports' || l.type === 'sports')) return true;
    if (targetType === 'hostel' && (l.category === 'hostel' || l.type === 'hostel')) return true;
    if (targetType === 'atm' && (l.type === 'atm' || l.id.includes('atm'))) return true;
    if (targetType === 'medical' && (l.type === 'medical' || l.id.includes('medical'))) return true;
    return false;
  });

  if (candidates.length === 0) return null;

  // Calculate routes to all candidates
  const evaluated = candidates.map(candidate => {
    const route = dijkstra(source.nearestNode, candidate.nearestNode, graph, nodes, edgeMap);
    return {
      candidate,
      route,
      distance: route ? route.totalDistance : Infinity,
      walkingMinutes: route ? route.walkingMinutes : Infinity
    };
  }).filter(c => c.route !== null);

  // Sort by distance ascending
  evaluated.sort((a, b) => a.distance - b.distance);

  if (evaluated.length === 0) return null;

  const nearest = evaluated[0];
  const turnByTurn = generateTurnByTurn(
    nearest.route.pathNodes,
    nodes,
    landmarks,
    source,
    nearest.candidate
  );

  return {
    source,
    target: nearest.candidate,
    route: nearest.route,
    turnByTurn,
    alternatives: evaluated.slice(1, 4).map(e => ({
      place: e.candidate,
      distance: e.distance,
      walkingMinutes: e.walkingMinutes
    }))
  };
}

// Calculate shortest-path route across the whole campus road/walkway network drawn by the user
export function routeAcrossWalkways(startPlace, endPlace, campusWalkways, landmarks) {
  if (!campusWalkways || campusWalkways.length === 0 || !startPlace || !endPlace) return null;

  const nodes = {};
  const graph = {};
  const pointToNodeId = [];

  // 1. Build nodes from all walkway points
  campusWalkways.forEach((seg, sIdx) => {
    pointToNodeId[sIdx] = [];
    seg.points.forEach((pt, pIdx) => {
      const id = `W_${sIdx}_${pIdx}`;
      nodes[id] = { id, x: pt.x, y: pt.y, roadName: seg.name };
      graph[id] = [];
      pointToNodeId[sIdx][pIdx] = id;
    });
  });

  // 2. Connect consecutive points on the same segment
  campusWalkways.forEach((seg, sIdx) => {
    for (let i = 0; i < seg.points.length - 1; i++) {
      const u = pointToNodeId[sIdx][i];
      const v = pointToNodeId[sIdx][i + 1];
      const pU = nodes[u];
      const pV = nodes[v];
      const dist = Math.round(Math.hypot(pV.x - pU.x, pV.y - pU.y) * 0.25);
      graph[u].push({ node: v, distance: dist, edgeId: `E_${u}_${v}` });
      graph[v].push({ node: u, distance: dist, edgeId: `E_${v}_${u}` });
    }
  });

  // 3. Connect intersection points across different segments (within 35px / ~9m)
  const allNodeIds = Object.keys(nodes);
  for (let i = 0; i < allNodeIds.length; i++) {
    for (let j = i + 1; j < allNodeIds.length; j++) {
      const idA = allNodeIds[i];
      const idB = allNodeIds[j];
      const nA = nodes[idA];
      const nB = nodes[idB];
      const pixelDist = Math.hypot(nB.x - nA.x, nB.y - nA.y);
      if (pixelDist <= 35) {
        const dist = Math.max(1, Math.round(pixelDist * 0.25));
        if (!graph[idA].some(e => e.node === idB)) {
          graph[idA].push({ node: idB, distance: dist, edgeId: `J_${idA}_${idB}` });
        }
        if (!graph[idB].some(e => e.node === idA)) {
          graph[idB].push({ node: idA, distance: dist, edgeId: `J_${idB}_${idA}` });
        }
      }
    }
  }

  // 4. Find closest walkway node to startPlace and endPlace
  let closestStartNode = null;
  let minStartDist = Infinity;
  let closestEndNode = null;
  let minEndDist = Infinity;

  for (const nId of allNodeIds) {
    const n = nodes[nId];
    const dStart = Math.hypot(n.x - startPlace.x, n.y - startPlace.y);
    if (dStart < minStartDist) {
      minStartDist = dStart;
      closestStartNode = nId;
    }
    const dEnd = Math.hypot(n.x - endPlace.x, n.y - endPlace.y);
    if (dEnd < minEndDist) {
      minEndDist = dEnd;
      closestEndNode = nId;
    }
  }

  if (!closestStartNode || !closestEndNode) return null;

  // 5. Run Dijkstra on the walkway graph
  const route = dijkstra(closestStartNode, closestEndNode, graph, nodes, {});
  if (!route) return null;

  // Prepend startPlace coords and append endPlace coords
  const fullCoordinates = [
    { x: startPlace.x, y: startPlace.y, id: 'start' },
    ...route.coordinates,
    { x: endPlace.x, y: endPlace.y, id: 'end' }
  ];

  const turnByTurn = generateTurnByTurn(route.pathNodes, nodes, landmarks, startPlace, endPlace);

  return {
    pathNodes: route.pathNodes,
    coordinates: fullCoordinates,
    edgeDetails: [],
    totalDistance: route.totalDistance + Math.round((minStartDist + minEndDist) * 0.25),
    walkingMinutes: Math.max(1, Math.round(route.totalDistance / 75)),
    caloriesBurned: Math.round(route.totalDistance * 0.05),
    turnByTurn
  };
}
