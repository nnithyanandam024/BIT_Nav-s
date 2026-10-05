import React, { useState, useEffect } from 'react';
import campusData from './data/campusData.json';
import Navbar from './components/Navbar';
import CategoryBar from './components/CategoryBar';
import CampusMap from './components/CampusMap';
import AIAssistant from './components/AIAssistant';
import PlaceModal from './components/PlaceModal';
import SettingsModal from './components/SettingsModal';
import {
  dijkstra,
  generateTurnByTurn,
  findNearestFacility,
  calculateCampusRoute,
  findNearestNode
} from './services/routingEngine';
import { processNaturalLanguageQuery } from './services/nlpEngine';

export default function App() {
  const [landmarks, setLandmarks] = useState(campusData.landmarks);

  const [isSatellite, setIsSatellite] = useState(true); // Default: Satellite aerial view first
  const [showPathways, setShowPathways] = useState(false); // Default: Pathway overlay off on initial load
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [selectedPlace, setSelectedPlace] = useState(null);
  const [startPlace, setStartPlace] = useState(null);
  const [destinationPlace, setDestinationPlace] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);

  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || (import.meta.env.VITE_GEMINI_API_KEY || '');
  });
  const [accessibleRouting, setAccessibleRouting] = useState(false);

  // Save API key
  const handleSaveApiKey = (key) => {
    const cleanKey = (key || '').trim();
    setApiKey(cleanKey);
    if (cleanKey) {
      localStorage.setItem('gemini_api_key', cleanKey);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  };

  // Calculate Shortest Route between two places across physical campus road network
  const handleCalculateRoute = async (fromId, toId) => {
    const from = landmarks.find(l => l.id === fromId);
    const to = landmarks.find(l => l.id === toId);

    if (!from || !to) return;

    // 1. Direct Shortest Path Calculation over Physical Campus Road Network
    const campusRoute = calculateCampusRoute(from, to, campusData, landmarks);
    if (campusRoute) {
      setStartPlace(from);
      setDestinationPlace(to);
      setActiveRoute(campusRoute);
      setSelectedPlace(null);
      setIsAssistantOpen(true);
      return;
    }

    // 2. Direct Client-Side Routing Fallback
    const startNode = findNearestNode(from.x, from.y, campusData.nodes) || from.nearestNode;
    const endNode = findNearestNode(to.x, to.y, campusData.nodes) || to.nearestNode;
    const route = dijkstra(startNode, endNode, campusData.graph, campusData.nodes, campusData.edgeMap);
    if (route) {
      const turnByTurn = generateTurnByTurn(route.pathNodes, campusData.nodes, landmarks, from, to);
      const result = { from, to, route, turnByTurn };
      setStartPlace(from);
      setDestinationPlace(to);
      setActiveRoute(result);
      setSelectedPlace(null);
      setIsAssistantOpen(true);
    }
  };

  // Calculate Nearest Facility
  const handleCalculateNearest = async (fromPlace, facilityType) => {
    const from = fromPlace || campusData.landmarks.find(l => l.id === 'as-main-left') || campusData.landmarks[0];

    try {
      const res = await fetch('/api/nearest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId: from.id, facilityType })
      });

      if (res.ok) {
        const data = await res.json();
        setStartPlace(from);
        setDestinationPlace(data.target);
        setActiveRoute({
          from: data.source,
          to: data.target,
          route: data.route,
          turnByTurn: data.turnByTurn
        });
        setSelectedPlace(data.target);
        return;
      }
    } catch {
      // Fallback
    }

    // Client-side fallback
    const result = findNearestFacility(from.id, facilityType, campusData.landmarks, campusData.graph, campusData.nodes, campusData.edgeMap);
    if (result) {
      const campusRoute = calculateCampusRoute(result.source, result.target, campusData, landmarks);
      setStartPlace(from);
      setDestinationPlace(result.target);
      setActiveRoute(campusRoute || {
        from: result.source,
        to: result.target,
        route: result.route,
        turnByTurn: result.turnByTurn
      });
      setSelectedPlace(result.target);
    }
  };

  // Natural Language Query Processor (Powered by Google Gemini 1.5 Flash + Local Campus RAG)
  const handleProcessAIQuery = async (query, chatHistory = []) => {
    // Direct Client-Side Gemini / Semantic RAG & Routing Execution
    const aiParsed = await processNaturalLanguageQuery(query, campusData.landmarks, apiKey, chatHistory);
    let routeResult = null;
    let nearestResult = null;
    let matchingPlaces = [];

    // Handle Map View Switching from Voice or Text
    if (aiParsed.intent === 'toggle_map') {
      if (aiParsed.mapMode === 'satellite') {
        setIsSatellite(true);
      } else if (aiParsed.mapMode === 'standard') {
        setIsSatellite(false);
      }
    } else if (aiParsed.intent === 'find_room' && aiParsed.roomDetails) {
      const target = campusData.landmarks.find(l => l.id === aiParsed.roomDetails.placeId) ||
                     campusData.landmarks.find(l => l.id === aiParsed.destination);
      if (target) {
        matchingPlaces = [target];
        setSelectedPlace(target);
        const origin = startPlace || campusData.landmarks.find(l => l.id === 'as-main-left') || campusData.landmarks[0];
        const campusRoute = calculateCampusRoute(origin, target, campusData, landmarks);
        if (campusRoute) {
          routeResult = campusRoute;
          setStartPlace(origin);
          setDestinationPlace(target);
          setActiveRoute(routeResult);
        }
      }
    } else if (aiParsed.intent === 'navigate') {
      const from = campusData.landmarks.find(l => l.id === aiParsed.source) ||
                   startPlace ||
                   campusData.landmarks.find(l => l.id === 'as-main-left') ||
                   campusData.landmarks[0];
      const to = campusData.landmarks.find(l => l.id === aiParsed.destination);

      if (from && to) {
        const campusRoute = calculateCampusRoute(from, to, campusData, landmarks);
        if (campusRoute) {
          routeResult = campusRoute;
          setStartPlace(from);
          setDestinationPlace(to);
          setActiveRoute(routeResult);
        }
      }
    } else if (aiParsed.intent === 'nearest_facility') {
      const sourcePlaceObj = campusData.landmarks.find(l => l.id === aiParsed.source) || startPlace || campusData.landmarks[0];
      const type = aiParsed.facility_type || 'canteen';
      nearestResult = findNearestFacility(sourcePlaceObj.id, type, campusData.landmarks, campusData.graph, campusData.nodes);
      if (nearestResult) {
        const campusRoute = calculateCampusRoute(nearestResult.source, nearestResult.target, campusData, landmarks);
        routeResult = campusRoute || {
          from: nearestResult.source,
          to: nearestResult.target,
          route: nearestResult.route,
          turnByTurn: nearestResult.turnByTurn
        };
        setStartPlace(nearestResult.source);
        setDestinationPlace(nearestResult.target);
        setActiveRoute(routeResult);
      }
    } else if (aiParsed.intent === 'find_place' && aiParsed.destination) {
      const target = campusData.landmarks.find(l => l.id === aiParsed.destination);
      if (target) {
        matchingPlaces = [target];
        setSelectedPlace(target);
        const origin = startPlace || campusData.landmarks.find(l => l.id === 'as-main-left') || campusData.landmarks[0];
        const campusRoute = calculateCampusRoute(origin, target, campusData, landmarks);
        if (campusRoute) {
          routeResult = campusRoute;
          setStartPlace(origin);
          setDestinationPlace(target);
          setActiveRoute(routeResult);
        }
      }
    } else if (aiParsed.intent === 'list_facilities' && aiParsed.facility_type) {
      matchingPlaces = campusData.landmarks.filter(l =>
        l.type === aiParsed.facility_type || l.category === aiParsed.facility_type
      );
    }

    return {
      query,
      aiParsed,
      routeResult,
      nearestResult,
      matchingPlaces
    };
  };

  const handleClearRoute = () => {
    setActiveRoute(null);
    setStartPlace(null);
    setDestinationPlace(null);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top Navbar */}
      <Navbar
        landmarks={landmarks}
        onSelectPlace={(place) => {
          setSelectedPlace(place);
          setDestinationPlace(place);
        }}
        isSatellite={isSatellite}
        onToggleSatellite={() => setIsSatellite(!isSatellite)}
        showPathways={showPathways}
        onTogglePathways={() => setShowPathways(!showPathways)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Category Filter Chips Bar */}
      <CategoryBar
        activeCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {/* Interactive Campus Map Canvas with Findmyway Physical Map & Satellite View */}
      <CampusMap
        isSatellite={isSatellite}
        onToggleSatellite={() => setIsSatellite(!isSatellite)}
        showPathways={showPathways}
        onTogglePathways={() => setShowPathways(!showPathways)}
        landmarks={landmarks}
        selectedCategory={selectedCategory}
        activeRoute={activeRoute}
        selectedPlace={selectedPlace}
        onSelectPlace={setSelectedPlace}
        startPlace={startPlace}
        destinationPlace={destinationPlace}
      />

      {/* AI Assistant Chat & Route Drawer */}
      <AIAssistant
        landmarks={landmarks}
        activeRoute={activeRoute}
        onCalculateRoute={handleCalculateRoute}
        onCalculateNearest={handleCalculateNearest}
        onClearRoute={handleClearRoute}
        onProcessAIQuery={handleProcessAIQuery}
        soundEnabled={soundEnabled}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isOpen={isAssistantOpen}
        onToggleOpen={() => setIsAssistantOpen(!isAssistantOpen)}
      />

      {/* Place Inspection Modal */}
      {selectedPlace && (
        <PlaceModal
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
          onNavigateTo={(place) => {
            const originId = startPlace ? startPlace.id : 'main_gate';
            handleCalculateRoute(originId, place.id);
          }}
          onSetAsStart={(place) => {
            setStartPlace(place);
            if (destinationPlace && destinationPlace.id !== place.id) {
              handleCalculateRoute(place.id, destinationPlace.id);
            }
          }}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
        accessibleRouting={accessibleRouting}
        onToggleAccessible={() => setAccessibleRouting(!accessibleRouting)}
      />
    </div>
  );
}
