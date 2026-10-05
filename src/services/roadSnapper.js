// BIT NAV'S — Road Network Snapper & GPS Georeferencing Service
// Ensures all live locations, walker tracking, and navigation strictly follow campus roads and walkways

// 1. Reference Ground Control Anchors for Bannari Amman Institute of Technology (BIT)
const ANCHORS = [
  { name: "Main Gate", lat: 11.4948, lng: 77.2764, x: 1540, y: 3450 },
  { name: "Central Library", lat: 11.4985, lng: 77.2772, x: 1800, y: 1950 },
  { name: "Main Block", lat: 11.4978, lng: 77.2768, x: 1600, y: 2150 },
  { name: "Cricket Oval", lat: 11.5002, lng: 77.2805, x: 2450, y: 1700 },
  { name: "Boys Hostels", lat: 11.5015, lng: 77.2745, x: 950, y: 1250 }
];

// Check if raw GPS coordinates fall within realistic campus bounding box
export function isWithinCampusBounds(lat, lng) {
  return lat >= 11.488 && lat <= 11.508 && lng >= 77.268 && lng <= 77.288;
}

// 2. Convert GPS (Lat, Lng) to Campus SVG (X, Y) using bilinear interpolation over anchors
export function gpsToCampusCoords(lat, lng) {
  const origin = ANCHORS[0]; // Main Gate origin
  const dLat = lat - origin.lat;
  const dLng = lng - origin.lng;

  // Scale factors between GPS delta and SVG pixel delta
  const dLatPerY = (ANCHORS[1].lat - origin.lat) / (ANCHORS[1].y - origin.y); // negative
  const dLngPerX = (ANCHORS[3].lng - origin.lng) / (ANCHORS[3].x - origin.x); // positive

  const rawX = origin.x + dLng / dLngPerX;
  const rawY = origin.y + dLat / dLatPerY;

  return {
    x: Math.round(rawX * 10) / 10,
    y: Math.round(rawY * 10) / 10
  };
}

// 3. Project point P onto line segment AB (Orthogonal projection clamped to segment)
export function projectPointOnSegment(p, a, b) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abLenSq = abX * abX + abY * abY;

  if (abLenSq === 0) {
    return { x: a.x, y: a.y, dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  }

  const apX = p.x - a.x;
  const apY = p.y - a.y;

  // Projection scalar t clamped between 0 and 1
  let t = (apX * abX + apY * abY) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * abX;
  const projY = a.y + t * abY;
  const dist = Math.hypot(p.x - projX, p.y - projY);

  return {
    x: Math.round(projX * 10) / 10,
    y: Math.round(projY * 10) / 10,
    dist: Math.round(dist * 0.25), // convert SVG delta to approximate meters
    t
  };
}

// 4. Snap raw position strictly onto the nearest road segment in the active route
export function snapToRoadNetwork(point, pathNodes, nodes, maxDistMeters = 35) {
  if (!point || !pathNodes || pathNodes.length < 2) return point;

  let bestSnap = null;
  let minDistance = Infinity;

  // Search through all consecutive road segments in the active route
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const nodeA = nodes[pathNodes[i]];
    const nodeB = nodes[pathNodes[i + 1]];
    if (!nodeA || !nodeB) continue;

    const projection = projectPointOnSegment(point, nodeA, nodeB);
    if (projection.dist < minDistance) {
      minDistance = projection.dist;
      bestSnap = {
        x: projection.x,
        y: projection.y,
        distanceToRoad: projection.dist,
        segmentIndex: i,
        segmentFrom: pathNodes[i],
        segmentTo: pathNodes[i + 1],
        t: projection.t
      };
    }
  }

  if (bestSnap && bestSnap.distanceToRoad <= maxDistMeters) {
    return bestSnap;
  }

  return point;
}

// 5. Snap any arbitrary coordinate on campus strictly to the nearest road in the entire campus graph
export function snapAnyPointToCampusRoads(point, edgeMap, nodes, maxDistMeters = 50) {
  if (!point || !edgeMap || !nodes) return point;

  let best = null;
  let minDist = Infinity;

  for (const edge of Object.values(edgeMap)) {
    const a = nodes[edge.u];
    const b = nodes[edge.v];
    if (!a || !b) continue;

    const proj = projectPointOnSegment(point, a, b);
    if (proj.dist < minDist) {
      minDist = proj.dist;
      best = {
        x: proj.x,
        y: proj.y,
        distanceToRoad: proj.dist,
        edgeId: edge.id,
        u: edge.u,
        v: edge.v,
        t: proj.t
      };
    }
  }

  if (best && best.distanceToRoad <= maxDistMeters) {
    return best;
  }
  return point;
}

// 6. Calculate heading direction in degrees (0 = East, 90 = South, 180 = West, 270 = North)
export function getRoadHeading(pointA, pointB) {
  if (!pointA || !pointB) return 0;
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return Math.round(angle);
}

// 7. Human-friendly road and avenue naming based on physical campus zones
export function getRoadSegmentName(nodeA, nodeB, landmarks = []) {
  if (!nodeA) return 'Campus Walkway';
  const midX = nodeB ? (nodeA.x + nodeB.x) / 2 : nodeA.x;
  const midY = nodeB ? (nodeA.y + nodeB.y) / 2 : nodeA.y;

  // Check if close to a known landmark
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

  // Zone heuristics
  if (midY > 3000) return 'Main Entrance Boulevard';
  if (midY > 2400 && midY <= 3000) return 'South Academic Connector';
  if (midX >= 1500 && midX <= 2000 && midY >= 1800 && midY <= 2400) return 'Central Academic Avenue';
  if (midX < 1400 && midY < 1800) return 'Hostels Paved Promenade';
  if (midX > 2200 && midY < 2000) return 'Sports Ground & Oval Perimeter';
  if (midY < 1200) return 'North Campus Walkway';

  return 'Main Campus Pathway';
}

// 8. Generate dense road centerline points with smooth intermediate points
export function generateDenseRoadPoints(coordinates, stepDistance = 10) {
  if (!coordinates || coordinates.length < 2) return coordinates || [];

  const dense = [];
  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    dense.push(a);

    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.floor(dist / stepDistance);

    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      dense.push({
        x: Math.round((a.x + (b.x - a.x) * t) * 10) / 10,
        y: Math.round((a.y + (b.y - a.y) * t) * 10) / 10
      });
    }
  }
  dense.push(coordinates[coordinates.length - 1]);
  return dense;
}
