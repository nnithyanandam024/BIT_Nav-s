import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { dijkstra, generateTurnByTurn, findNearestFacility } from './services/routingEngine.js';
import { processNaturalLanguageQuery } from './services/nlpEngine.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Load campus dataset
const dataPath = path.join(__dirname, 'data', 'campusData.json');
let campusData = null;

try {
  const raw = fs.readFileSync(dataPath, 'utf8');
  campusData = JSON.parse(raw);
  console.log(`Loaded campus data: ${campusData.landmarks.length} landmarks, ${Object.keys(campusData.nodes).length} nodes, ${Object.keys(campusData.edgeMap).length} edges.`);
} catch (err) {
  console.error('Failed to load campus data:', err);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    project: 'AI Campus Navigation Assistant (BIT Sathyamangalam)',
    hackathon: 'HACKSPACE 2026',
    placesCount: campusData?.landmarks?.length || 0,
    nodesCount: campusData ? Object.keys(campusData.nodes).length : 0
  });
});

// List all campus places / search
app.get('/api/places', (req, res) => {
  if (!campusData) return res.status(500).json({ error: 'Campus data not loaded' });

  let results = campusData.landmarks;
  const { category, search } = req.query;

  if (category && category !== 'all') {
    results = results.filter(l => l.category === category || l.type === category);
  }

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.shortName.toLowerCase().includes(q) ||
      l.building.toLowerCase().includes(q) ||
      l.aliases.some(a => a.toLowerCase().includes(q))
    );
  }

  res.json({ count: results.length, places: results });
});

// Get place details by ID
app.get('/api/places/:id', (req, res) => {
  if (!campusData) return res.status(500).json({ error: 'Campus data not loaded' });
  const place = campusData.landmarks.find(l => l.id === req.params.id);
  if (!place) return res.status(404).json({ error: 'Place not found' });
  res.json(place);
});

// Calculate Route between two places
app.post('/api/route', (req, res) => {
  if (!campusData) return res.status(500).json({ error: 'Campus data not loaded' });
  const { fromId, toId } = req.body;

  const startPlace = campusData.landmarks.find(l => l.id === fromId);
  const endPlace = campusData.landmarks.find(l => l.id === toId);

  if (!startPlace || !endPlace) {
    return res.status(400).json({ error: 'Invalid source or destination place ID' });
  }

  const route = dijkstra(startPlace.nearestNode, endPlace.nearestNode, campusData.graph, campusData.nodes, campusData.edgeMap);

  if (!route) {
    return res.status(404).json({ error: 'No walkable route found between specified locations' });
  }

  const turnByTurn = generateTurnByTurn(
    route.pathNodes,
    campusData.nodes,
    campusData.landmarks,
    startPlace,
    endPlace
  );

  res.json({
    from: startPlace,
    to: endPlace,
    route,
    turnByTurn
  });
});

// Nearest Facility Finder
app.post('/api/nearest', (req, res) => {
  if (!campusData) return res.status(500).json({ error: 'Campus data not loaded' });
  const { fromId, facilityType } = req.body;

  const result = findNearestFacility(
    fromId,
    facilityType,
    campusData.landmarks,
    campusData.graph,
    campusData.nodes,
    campusData.edgeMap
  );

  if (!result) {
    return res.status(404).json({ error: `No facility of type "${facilityType}" found near the specified location.` });
  }

  res.json(result);
});

// Natural Language Chat Endpoint
app.post('/api/chat', async (req, res) => {
  if (!campusData) return res.status(500).json({ error: 'Campus data not loaded' });
  const { query, apiKey } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  try {
    const aiParsed = await processNaturalLanguageQuery(query, campusData.landmarks, apiKey || process.env.GEMINI_API_KEY);

    let routeResult = null;
    let nearestResult = null;
    let matchingPlaces = [];

    if (aiParsed.intent === 'navigate') {
      const from = campusData.landmarks.find(l => l.id === aiParsed.source) ||
                   campusData.landmarks.find(l => l.id === 'main_gate');
      const to = campusData.landmarks.find(l => l.id === aiParsed.destination);

      if (from && to) {
        const route = dijkstra(from.nearestNode, to.nearestNode, campusData.graph, campusData.nodes, campusData.edgeMap);
        if (route) {
          const turnByTurn = generateTurnByTurn(route.pathNodes, campusData.nodes, campusData.landmarks, from, to);
          routeResult = { from, to, route, turnByTurn };
        }
      }
    } else if (aiParsed.intent === 'nearest_facility') {
      const sourceId = aiParsed.source || 'central_library';
      const type = aiParsed.facility_type || 'computer_lab';
      nearestResult = findNearestFacility(sourceId, type, campusData.landmarks, campusData.graph, campusData.nodes, campusData.edgeMap);
      if (nearestResult) {
        routeResult = {
          from: nearestResult.source,
          to: nearestResult.target,
          route: nearestResult.route,
          turnByTurn: nearestResult.turnByTurn
        };
      }
    } else if (aiParsed.intent === 'find_place' && aiParsed.destination) {
      const target = campusData.landmarks.find(l => l.id === aiParsed.destination);
      if (target) {
        matchingPlaces = [target];
        // Calculate route from Main Gate as reference
        const gate = campusData.landmarks.find(l => l.id === 'main_gate');
        if (gate) {
          const route = dijkstra(gate.nearestNode, target.nearestNode, campusData.graph, campusData.nodes, campusData.edgeMap);
          if (route) {
            const turnByTurn = generateTurnByTurn(route.pathNodes, campusData.nodes, campusData.landmarks, gate, target);
            routeResult = { from: gate, to: target, route, turnByTurn };
          }
        }
      }
    } else if (aiParsed.intent === 'list_facilities' && aiParsed.facility_type) {
      matchingPlaces = campusData.landmarks.filter(l =>
        l.type === aiParsed.facility_type || l.category === aiParsed.facility_type
      );
    }

    res.json({
      query,
      aiParsed,
      routeResult,
      nearestResult,
      matchingPlaces
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process natural language request', details: err.message });
  }
});

// Calibrate Save Endpoint (Saves permanently to disk)
app.post('/api/calibrate/save', (req, res) => {
  try {
    const { landmarks, customRoutes, campusWalkways } = req.body;
    if (!campusData) {
      return res.status(500).json({ error: 'Campus data not loaded' });
    }

    if (landmarks && Array.isArray(landmarks)) {
      campusData.landmarks = landmarks;
    }
    if (customRoutes) {
      campusData.customRoutes = customRoutes;
    }
    if (campusWalkways && Array.isArray(campusWalkways)) {
      campusData.campusWalkways = campusWalkways;
    }

    // Save to server/data/campusData.json
    fs.writeFileSync(dataPath, JSON.stringify(campusData, null, 2));

    // Also save to src/data/campusData.json
    const srcPath = path.join(__dirname, '..', 'src', 'data', 'campusData.json');
    if (fs.existsSync(path.dirname(srcPath))) {
      fs.writeFileSync(srcPath, JSON.stringify(campusData, null, 2));
    }

    console.log('Saved calibrated campus data permanently to disk!');
    res.json({ success: true, message: 'Campus data updated successfully!' });
  } catch (err) {
    console.error('Calibration save error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`AI Campus Navigation Server running on http://localhost:${PORT}`);
});
