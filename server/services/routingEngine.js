function dijkstra(startNode, endNode, graph, nodes, edgeMap = {}) {
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

  const coordinates = pathNodes.map(id => ({
    id,
    x: nodes[id].x,
    y: nodes[id].y
  }));

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

function getRoadSegmentName(nodeA, nodeB, landmarks = []) {
  if (!nodeA) return 'Campus Walkway';
  const midX = nodeB ? (nodeA.x + nodeB.x) / 2 : nodeA.x;
  const midY = nodeB ? (nodeA.y + nodeB.y) / 2 : nodeA.y;

  if (landmarks && landmarks.length > 0) {
    let closestLandmark = null;
    let closestDist = Infinity;
    for (const lm of landmarks) {
      const d = Math.hypot(lm.x - midX, lm.y - midY) * 0.25;
      if (d < closestDist) {
        closestDist = d;
        closestLandmark = lm;
      }
    }
    if (closestLandmark && closestDist <= 35) {
      return `${closestLandmark.shortName} Promenade`;
    }
  }

  if (midY > 3000) return 'Main Entrance Boulevard';
  if (midY > 2400 && midY <= 3000) return 'South Academic Connector';
  if (midX >= 1500 && midX <= 2000 && midY >= 1800 && midY <= 2400) return 'Central Academic Avenue';
  if (midX < 1400 && midY < 1800) return 'Hostels Paved Promenade';
  if (midX > 2200 && midY < 2000) return 'Sports Ground & Oval Perimeter';
  if (midY < 1200) return 'North Campus Walkway';

  return 'Main Campus Pathway';
}

function generateTurnByTurn(pathNodes, nodes, landmarks, startPlace, endPlace) {
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

  for (let i = 0; i < pathNodes.length - 1; i++) {
    const p1 = nodes[pathNodes[i]];
    const p2 = nodes[pathNodes[i + 1]];
    if (!p1 || !p2) continue;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.round(Math.hypot(dx, dy) * 0.25);
    const roadName = getRoadSegmentName(p1, p2, landmarks);

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
      const nearby = findLandmarkNearNode(pathNodes[i], landmarks, [startPlace?.id, endPlace?.id]);

      if (Math.abs(angle) > 35) {
        const turnDir = angle > 0 ? 'Turn right' : 'Turn left';
        const modifier = Math.abs(angle) > 75 ? '' : 'slight ';
        steps.push({
          step: stepIndex++,
          instruction: `${turnDir.replace('Turn', 'Turn ' + modifier)} onto ${roadName}.`,
          detail: nearby ? `Pass by ${nearby.name} on your ${angle > 0 ? 'left' : 'right'}. Continue for ${dist}m.` : `Follow ${roadName} for ${dist}m.`,
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

function findNearestFacility(sourcePlaceId, targetType, landmarks, graph, nodes, edgeMap = {}) {
  const source = landmarks.find(l => l.id === sourcePlaceId);
  if (!source) return null;

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

  const evaluated = candidates.map(candidate => {
    const route = dijkstra(source.nearestNode, candidate.nearestNode, graph, nodes, edgeMap);
    return {
      candidate,
      route,
      distance: route ? route.totalDistance : Infinity,
      walkingMinutes: route ? route.walkingMinutes : Infinity
    };
  }).filter(c => c.route !== null);

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

export {
  dijkstra,
  generateTurnByTurn,
  findNearestFacility
};
