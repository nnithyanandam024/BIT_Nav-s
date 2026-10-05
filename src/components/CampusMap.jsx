import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Crosshair,
  Navigation,
  Play,
  Pause,
  RotateCcw,
  Footprints,
  Compass,
  AlertCircle,
  X,
  FastForward,
  MapPin,
  Globe
} from 'lucide-react';
import campusData from '../data/campusData.json';
import {
  projectPointOnSegment,
  snapToRoadNetwork,
  snapAnyPointToCampusRoads,
  generateDenseRoadPoints,
  getRoadHeading,
  getRoadSegmentName,
  gpsToCampusCoords,
  isWithinCampusBounds
} from '../services/roadSnapper';

const MAP_WIDTH = 3392;
const MAP_HEIGHT = 3913;

// Central Academic Complex (Focus point on Findmyway map)
const DEFAULT_CENTER_X = 1680;
const DEFAULT_CENTER_Y = 1950;

export default function CampusMap({
  isSatellite,
  onToggleSatellite,
  showPathways = true,
  landmarks = [],
  selectedCategory,
  activeRoute,
  selectedPlace,
  onSelectPlace,
  startPlace,
  destinationPlace
}) {
  const containerRef = useRef(null);

  // Pan and Zoom transform state
  const [transform, setTransform] = useState({
    x: -800,
    y: -900,
    scale: 1.15
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Live Location & Walk Simulator State
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1); // 1x, 2x, 4x
  const [simProgress, setSimProgress] = useState(0); // 0.0 to 1.0
  const [followCamera, setFollowCamera] = useState(true);
  const [gpsNotification, setGpsNotification] = useState(null);

  // User position on the road
  const [userPuck, setUserPuck] = useState(null);

  const watchIdRef = useRef(null);
  const animFrameRef = useRef(null);
  const simStartRef = useRef(null);

  const visibleLandmarks = useMemo(() => {
    return landmarks.filter(l =>
      selectedCategory === 'all' || l.category === selectedCategory || l.type === selectedCategory
    );
  }, [landmarks, selectedCategory]);

  // Dense road points along the active route
  const denseRoutePoints = useMemo(() => {
    if (!activeRoute?.route?.coordinates || activeRoute.route.coordinates.length < 2) {
      return [];
    }
    return generateDenseRoadPoints(activeRoute.route.coordinates, 8);
  }, [activeRoute]);

  // Minimum scale ensuring edge-to-edge coverage with zero black letterbox space
  const getMinScale = useCallback((width, height) => {
    return Math.max(width / MAP_WIDTH, height / MAP_HEIGHT);
  }, []);

  // Position clamping keeping map bound to container edges
  const clampPosition = useCallback((x, y, scale, width, height) => {
    const minX = width - MAP_WIDTH * scale;
    const minY = height - MAP_HEIGHT * scale;

    const clampedX = minX < 0 ? Math.min(0, Math.max(minX, x)) : (width - MAP_WIDTH * scale) / 2;
    const clampedY = minY < 0 ? Math.min(0, Math.max(minY, y)) : (height - MAP_HEIGHT * scale) / 2;

    return { x: clampedX, y: clampedY };
  }, []);

  // Center on a specific campus coordinate
  const centerOnPoint = useCallback((ptX, ptY, customScale = null) => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const minScale = getMinScale(clientWidth, clientHeight);
    const targetScale = customScale || Math.max(transform.scale, minScale * 1.15);

    const rawX = clientWidth / 2 - ptX * targetScale;
    const rawY = clientHeight / 2 - ptY * targetScale;

    const { x, y } = clampPosition(rawX, rawY, targetScale, clientWidth, clientHeight);
    setTransform({ x, y, scale: targetScale });
  }, [transform.scale, getMinScale, clampPosition]);

  // Reset to Central Campus view (GeoBITs reference)
  const handleResetView = useCallback(() => {
    centerOnPoint(DEFAULT_CENTER_X, DEFAULT_CENTER_Y, 1.15);
  }, [centerOnPoint]);

  // Fit entire route in viewport without black space
  const handleFitRoute = useCallback(() => {
    if (!activeRoute?.route?.coordinates || activeRoute.route.coordinates.length < 2) return;
    if (!containerRef.current) return;

    const coords = activeRoute.route.coordinates;
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX || 400;
    const height = maxY - minY || 400;
    const padding = 260;

    const { clientWidth, clientHeight } = containerRef.current;
    const minScale = getMinScale(clientWidth, clientHeight);

    const scaleX = clientWidth / (width + padding * 2);
    const scaleY = clientHeight / (height + padding * 2);
    const calculatedScale = Math.min(scaleX, scaleY);

    const newScale = Math.min(Math.max(calculatedScale, minScale), 2.2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const rawX = clientWidth / 2 - centerX * newScale;
    const rawY = clientHeight / 2 - centerY * newScale;

    const { x, y } = clampPosition(rawX, rawY, newScale, clientWidth, clientHeight);
    setTransform({ x, y, scale: newScale });
  }, [activeRoute, getMinScale, clampPosition]);

  // Initial center on mount
  useEffect(() => {
    handleResetView();
  }, [handleResetView]);

  // Auto-fit route when activeRoute updates
  useEffect(() => {
    if (activeRoute?.route) {
      handleFitRoute();
      // Set initial puck at start of route
      if (activeRoute.route.coordinates?.[0]) {
        const startCoord = activeRoute.route.coordinates[0];
        const nextCoord = activeRoute.route.coordinates[1] || startCoord;
        const heading = getRoadHeading(startCoord, nextCoord);
        const street = getRoadSegmentName(startCoord, nextCoord, landmarks);

        setUserPuck({
          x: startCoord.x,
          y: startCoord.y,
          heading,
          streetName: street,
          distanceRemaining: activeRoute.route.totalDistance,
          isSimulating: false,
          isLive: false
        });
        setSimProgress(0);
        setIsSimulating(false);
      }
    }
  }, [activeRoute, handleFitRoute, landmarks]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const minScale = getMinScale(clientWidth, clientHeight);
      setTransform(prev => {
        const scale = Math.max(prev.scale, minScale);
        const { x, y } = clampPosition(prev.x, prev.y, scale, clientWidth, clientHeight);
        return { x, y, scale };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getMinScale, clampPosition]);

  // =========================================================================
  // WALK SIMULATOR ALONG DENSE ROAD NETWORK
  // =========================================================================
  useEffect(() => {
    if (!isSimulating || denseRoutePoints.length < 2) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const totalDist = activeRoute?.route?.totalDistance || 500;
    // Base walking duration: ~1.4 meters per second
    const baseDurationMs = (totalDist / 1.4) * 1000;
    const effectiveDurationMs = Math.max(3000, baseDurationMs / simSpeed);

    let startTime = null;
    const initialProgress = simProgress;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const deltaProgress = elapsed / effectiveDurationMs;
      const newProgress = Math.min(1, initialProgress + deltaProgress);

      setSimProgress(newProgress);

      // Compute coordinate along dense road points
      const targetIdx = newProgress * (denseRoutePoints.length - 1);
      const idx = Math.min(Math.floor(targetIdx), denseRoutePoints.length - 2);
      const frac = targetIdx - idx;

      const pA = denseRoutePoints[idx];
      const pB = denseRoutePoints[idx + 1];

      const currentX = pA.x + (pB.x - pA.x) * frac;
      const currentY = pA.y + (pB.y - pA.y) * frac;
      const heading = getRoadHeading(pA, pB);
      const street = getRoadSegmentName(pA, pB, landmarks);
      const distRemaining = Math.max(0, Math.round(totalDist * (1 - newProgress)));

      setUserPuck({
        x: Math.round(currentX * 10) / 10,
        y: Math.round(currentY * 10) / 10,
        heading,
        streetName: street,
        distanceRemaining: distRemaining,
        isSimulating: true,
        isLive: false
      });

      // Follow camera if enabled
      if (followCamera && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const rawX = clientWidth / 2 - currentX * transform.scale;
        const rawY = clientHeight / 2 - currentY * transform.scale;
        const clamped = clampPosition(rawX, rawY, transform.scale, clientWidth, clientHeight);
        setTransform(prev => ({ ...prev, x: clamped.x, y: clamped.y }));
      }

      if (newProgress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        setIsSimulating(false);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    isSimulating,
    denseRoutePoints,
    simSpeed,
    activeRoute,
    followCamera,
    transform.scale,
    clampPosition,
    landmarks
  ]);

  // =========================================================================
  // LIVE GPS TRACKING SNAPPED TO ROAD NETWORK
  // =========================================================================
  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsNotification('Geolocation is not supported by your browser.');
      return;
    }

    setIsLiveTracking(true);
    setIsSimulating(false);
    setGpsNotification('Acquiring campus GPS signal...');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        if (!isWithinCampusBounds(latitude, longitude)) {
          setGpsNotification('GPS is outside BIT campus bounds. Showing simulated road tracking.');
          // Simulate at Main Gate
          const gateNode = campusData.nodes['180'] || { x: 1530, y: 3432 };
          const snapped = snapAnyPointToCampusRoads(gateNode, campusData.edgeMap, campusData.nodes);
          setUserPuck({
            x: snapped.x,
            y: snapped.y,
            heading: 0,
            streetName: 'Main Entrance Boulevard',
            distanceRemaining: 0,
            isSimulating: false,
            isLive: true
          });
          return;
        }

        // Convert GPS to SVG
        const rawSvgPt = gpsToCampusCoords(latitude, longitude);

        // Snap strictly to road network
        let snapped;
        if (activeRoute?.route?.pathNodes) {
          snapped = snapToRoadNetwork(rawSvgPt, activeRoute.route.pathNodes, campusData.nodes, 40);
        } else {
          snapped = snapAnyPointToCampusRoads(rawSvgPt, campusData.edgeMap, campusData.nodes, 45);
        }

        const street = snapped.segmentFrom
          ? getRoadSegmentName(campusData.nodes[snapped.segmentFrom], campusData.nodes[snapped.segmentTo], landmarks)
          : 'Campus Paved Road';

        setUserPuck(prev => ({
          x: snapped.x,
          y: snapped.y,
          heading: prev?.x ? getRoadHeading(prev, snapped) : 0,
          streetName: street,
          distanceRemaining: 0,
          isSimulating: false,
          isLive: true
        }));

        setGpsNotification(null);

        if (followCamera) {
          centerOnPoint(snapped.x, snapped.y);
        }
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setGpsNotification('GPS unavailable. You can use the Walk Simulator to test road navigation.');
        setIsLiveTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  }, [activeRoute, followCamera, centerOnPoint, landmarks]);

  const stopGpsTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsLiveTracking(false);
    setGpsNotification(null);
  }, []);

  const toggleGpsTracking = () => {
    if (isLiveTracking) {
      stopGpsTracking();
    } else {
      startGpsTracking();
    }
  };

  // Toggle Walk Simulation
  const toggleWalkSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
    } else {
      if (simProgress >= 1) {
        setSimProgress(0);
      }
      setIsSimulating(true);
      setIsLiveTracking(false);
      stopGpsTracking();
    }
  };

  const handleResetSimulation = () => {
    setIsSimulating(false);
    setSimProgress(0);
    if (denseRoutePoints.length > 0) {
      const p = denseRoutePoints[0];
      const pNext = denseRoutePoints[1] || p;
      setUserPuck({
        x: p.x,
        y: p.y,
        heading: getRoadHeading(p, pNext),
        streetName: getRoadSegmentName(p, pNext, landmarks),
        distanceRemaining: activeRoute?.route?.totalDistance || 0,
        isSimulating: false,
        isLive: false
      });
    }
  };

  // =========================================================================
  // PAN & ZOOM GESTURE HANDLERS
  // =========================================================================
  const handleWheel = (e) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { clientWidth, clientHeight } = containerRef.current;
    const minScale = getMinScale(clientWidth, clientHeight);

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(Math.max(transform.scale * zoomFactor, minScale), 3.0);

    const rawX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
    const rawY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

    const { x, y } = clampPosition(rawX, rawY, newScale, clientWidth, clientHeight);
    setTransform({ x, y, scale: newScale });
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const rawX = e.clientX - dragStart.x;
    const rawY = e.clientY - dragStart.y;
    const { x, y } = clampPosition(rawX, rawY, transform.scale, clientWidth, clientHeight);
    setTransform(prev => ({ ...prev, x, y }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers with two-finger pinch-to-zoom support
  const touchStartRef = useRef(null);
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      touchStartRef.current = {
        x: e.touches[0].clientX - transform.x,
        y: e.touches[0].clientY - transform.y
      };
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartRef.current = {
        pinchDist: dist,
        scale: transform.scale,
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  };

  const handleTouchMove = (e) => {
    if (isDragging && e.touches.length === 1 && touchStartRef.current && containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      const rawX = e.touches[0].clientX - touchStartRef.current.x;
      const rawY = e.touches[0].clientY - touchStartRef.current.y;
      const { x, y } = clampPosition(rawX, rawY, transform.scale, clientWidth, clientHeight);
      setTransform(prev => ({ ...prev, x, y }));
    } else if (e.touches.length === 2 && touchStartRef.current?.pinchDist && containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      const minScale = getMinScale(clientWidth, clientHeight);
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = newDist / touchStartRef.current.pinchDist;
      const newScale = Math.min(Math.max(touchStartRef.current.scale * factor, minScale), 4.0);

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = touchStartRef.current.midX - rect.left;
      const mouseY = touchStartRef.current.midY - rect.top;

      const rawX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
      const rawY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
      const { x, y } = clampPosition(rawX, rawY, newScale, clientWidth, clientHeight);
      setTransform({ x, y, scale: newScale });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartRef.current = null;
  };

  const zoomIn = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const minScale = getMinScale(clientWidth, clientHeight);
    const newScale = Math.min(transform.scale * 1.3, 4.0);
    const rawX = clientWidth / 2 - (clientWidth / 2 - transform.x) * (newScale / transform.scale);
    const rawY = clientHeight / 2 - (clientHeight / 2 - transform.y) * (newScale / transform.scale);
    const { x, y } = clampPosition(rawX, rawY, newScale, clientWidth, clientHeight);
    setTransform({ x, y, scale: newScale });
  };

  const zoomOut = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const minScale = getMinScale(clientWidth, clientHeight);
    const newScale = Math.max(transform.scale * 0.75, minScale);
    const rawX = clientWidth / 2 - (clientWidth / 2 - transform.x) * (newScale / transform.scale);
    const rawY = clientHeight / 2 - (clientHeight / 2 - transform.y) * (newScale / transform.scale);
    const { x, y } = clampPosition(rawX, rawY, newScale, clientWidth, clientHeight);
    setTransform({ x, y, scale: newScale });
  };

  // Centerline SVG path connecting node centers along the road
  const routePathD = activeRoute?.route?.coordinates?.length > 1
    ? 'M ' + activeRoute.route.coordinates.map(c => `${c.x},${c.y}`).join(' L ')
    : '';

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        background: '#0A0D0B',
        userSelect: 'none'
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: '0 0',
        transition: isDragging ? 'none' : 'transform 0.12s ease-out'
      }}>
        {/* Layer 1: High-Resolution Physical Campus Map OR Satellite Aerial View */}
        <img
          src={isSatellite ? "/map/campus_map_2.png" : "/map/campus_map.png"}
          alt={isSatellite ? "BIT Campus Satellite Aerial View" : "BIT Campus Physical Map"}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            pointerEvents: 'none',
            filter: isSatellite ? 'contrast(1.06) brightness(0.96)' : 'none'
          }}
        />

        {/* Layer 2: Physical Road Paths Overlay */}
        {showPathways && (
          <img
            src="/map/paths.png"
            alt="BIT Campus Physical Paths"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              opacity: isSatellite ? 0.9 : 0.85,
              pointerEvents: 'none',
              mixBlendMode: isSatellite ? 'screen' : 'normal'
            }}
          />
        )}

        {/* Layer 3: Strict Road Network Vector Highlight & Centerline */}
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          {activeRoute && (
            <g id="active-road-vectors">
              {/* 1. Physical Road Network Glowing Corridor */}
              {routePathD && (
                <>
                  <path
                    d={routePathD}
                    fill="none"
                    stroke="#1B8A5A"
                    strokeWidth="20"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.38"
                  />
                  <path
                    d={routePathD}
                    fill="none"
                    stroke="#2BAE72"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.9"
                  />
                  <path
                    d={routePathD}
                    fill="none"
                    stroke="#0A0D0B"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.4"
                  />
                  <path
                    d={routePathD}
                    fill="none"
                    stroke="#F2F4F2"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="8 8"
                    className="route-path-animated"
                    opacity="0.95"
                  />
                </>
              )}

              {/* 2. Waypoint turn markers along road intersections */}
              {activeRoute.route?.coordinates?.map((pt, idx) => (
                <circle
                  key={`wpt-${idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.5"
                  fill="#1B8A5A"
                  stroke="#F2F4F2"
                  strokeWidth="1.2"
                />
              ))}
            </g>
          )}

          {/* 3. Location Puck strictly on Road Centerline */}
          {userPuck && (
            <g
              transform={`translate(${userPuck.x}, ${userPuck.y})`}
              style={{
                transition: isSimulating ? 'none' : 'transform 0.25s ease-out'
              }}
            >
              {/* Pulsing Emerald Accuracy Ring */}
              <circle
                r="16"
                fill="none"
                stroke="var(--color-accent)"
                className="location-pulse-ring"
              />

              {/* Road Snapped Puck */}
              <circle
                r="11"
                fill="var(--color-primary)"
                stroke="#F2F4F2"
                strokeWidth="2.5"
              />
              <circle r="4" fill="#F2F4F2" />

              {/* Heading Direction Arrow */}
              {userPuck.heading !== undefined && (
                <g transform={`rotate(${userPuck.heading - 90})`}>
                  <polygon
                    points="0,-18 5,-12 -5,-12"
                    fill="var(--color-accent)"
                    stroke="#F2F4F2"
                    strokeWidth="1"
                  />
                </g>
              )}
            </g>
          )}
        </svg>

        {/* Layer 4: Minimal Landmark Pins from Findmyway */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 20
        }}>
          {visibleLandmarks.map(landmark => {
            const isSelected = selectedPlace?.id === landmark.id;
            const isStart = startPlace?.id === landmark.id;
            const isDest = destinationPlace?.id === landmark.id;
            const showFullBadge = isDest || isStart || isSelected || landmark.isMajor || transform.scale >= 0.8;

            return (
              <div
                key={landmark.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPlace(landmark);
                }}
                className="map-marker"
                title={`${landmark.name} (${landmark.building || ''})`}
                style={{
                  position: 'absolute',
                  left: landmark.x,
                  top: landmark.y,
                  transform: 'translate(-50%, -100%)',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  zIndex: isDest || isStart || isSelected ? 40 : landmark.isMajor ? 25 : 20
                }}
              >
                {showFullBadge ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: isDest || isStart ? '5px 10px' : '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: isDest
                      ? 'linear-gradient(135deg, #1C3829, #12281D)'
                      : isStart
                      ? 'linear-gradient(135deg, #16241D, #0E1813)'
                      : isSelected
                      ? 'var(--color-accent)'
                      : 'var(--bg-surface)',
                    border: isDest
                      ? '1.5px solid var(--color-primary)'
                      : isStart
                      ? '1.5px solid var(--color-accent)'
                      : isSelected
                      ? '1.5px solid #F2F4F2'
                      : '1px solid var(--border-subtle)',
                    color: isSelected && !isDest && !isStart ? '#101713' : 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    fontSize: transform.scale < 0.65 ? '10px' : '11px',
                    fontWeight: isDest || isStart || isSelected ? 700 : 500,
                    boxShadow: isDest || isStart
                      ? '0 4px 14px rgba(0,0,0,0.6), 0 0 10px rgba(43,174,114,0.3)'
                      : '0 2px 8px rgba(0,0,0,0.5)',
                    transition: 'all 0.2s ease'
                  }}>
                    {isDest ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'var(--color-primary)',
                        color: '#FFFFFF',
                        flexShrink: 0
                      }}>
                        <MapPin size={11} />
                      </span>
                    ) : isStart ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'rgba(92, 225, 230, 0.2)',
                        color: 'var(--color-accent)',
                        border: '1px solid var(--color-accent)',
                        flexShrink: 0
                      }}>
                        <Navigation size={10} style={{ transform: 'rotate(45deg)' }} />
                      </span>
                    ) : (
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: isSelected ? '#101713' : 'var(--color-primary)',
                        flexShrink: 0
                      }} />
                    )}

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {isStart && (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          letterSpacing: '0.05em',
                          color: 'var(--color-accent)',
                          textTransform: 'uppercase'
                        }}>
                          Start:
                        </span>
                      )}
                      {isDest && (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          letterSpacing: '0.05em',
                          color: 'var(--color-primary)',
                          textTransform: 'uppercase'
                        }}>
                          Dest:
                        </span>
                      )}
                      <span>{landmark.name}</span>
                    </span>
                  </div>
                ) : (
                  <div style={{
                    width: isDest || isStart ? 14 : 10,
                    height: isDest || isStart ? 14 : 10,
                    borderRadius: '50%',
                    background: isDest ? 'var(--color-primary)' : isStart ? 'var(--color-accent)' : 'var(--color-primary)',
                    border: '1.5px solid #F2F4F2',
                    boxShadow: isDest || isStart
                      ? '0 0 10px rgba(43,174,114,0.8)'
                      : '0 0 6px rgba(43,174,114,0.6)'
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating GPS Notification Toast */}
      {gpsNotification && (
        <div style={{
          position: 'absolute',
          top: 70,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 45,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-active)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.78rem',
          color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-flat)'
        }}>
          <AlertCircle size={15} color="var(--color-accent)" />
          <span>{gpsNotification}</span>
          <button
            onClick={() => setGpsNotification(null)}
            style={{ color: 'var(--text-secondary)', marginLeft: 6 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Floating Walk / Tracking HUD Banner at Bottom Center */}
      {(userPuck && (isSimulating || isLiveTracking || activeRoute)) && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 40,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-active)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: 'var(--shadow-flat)',
          maxWidth: '92vw'
        }}>
          {/* Status Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isLiveTracking ? '#2BAE72' : isSimulating ? 'var(--color-accent)' : 'var(--text-secondary)',
              boxShadow: isLiveTracking || isSimulating ? '0 0 8px #2BAE72' : 'none'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
                {isLiveTracking ? 'Live GPS Tracking' : isSimulating ? 'Walking Simulation' : 'Active Road'}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {userPuck.streetName || 'Central Academic Avenue'}
              </span>
            </div>
          </div>

          <div style={{ width: 1, height: 26, background: 'var(--border-subtle)' }} />

          {/* Remaining Distance & Walk Time */}
          {activeRoute && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Remaining</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {userPuck.distanceRemaining !== undefined ? `${userPuck.distanceRemaining}m` : `${activeRoute.route.totalDistance}m`}
                </span>
              </div>
            </div>
          )}

          {/* Walk Simulator Controls */}
          {activeRoute && (
            <>
              <div style={{ width: 1, height: 26, background: 'var(--border-subtle)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={toggleWalkSimulation}
                  className="minimal-btn minimal-btn-primary"
                  title={isSimulating ? 'Pause Walk' : 'Start Walk Simulation'}
                  style={{ width: 32, height: 32, padding: 0 }}
                >
                  {isSimulating ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
                </button>

                <button
                  onClick={handleResetSimulation}
                  className="minimal-btn"
                  title="Reset to Start"
                  style={{ width: 32, height: 32, padding: 0 }}
                >
                  <RotateCcw size={13} />
                </button>

                {/* Speed Toggle */}
                <button
                  onClick={() => setSimSpeed(prev => (prev === 1 ? 2 : prev === 2 ? 4 : 1))}
                  className="minimal-btn"
                  title="Toggle Walk Speed (1x, 2x, 4x)"
                  style={{ padding: '4px 7px', fontSize: '0.72rem', fontWeight: 600 }}
                >
                  {simSpeed}x
                </button>
              </div>
            </>
          )}

          {/* Follow Camera Toggle */}
          <button
            onClick={() => setFollowCamera(!followCamera)}
            className={`minimal-btn ${followCamera ? 'active' : ''}`}
            title={followCamera ? 'Camera following user' : 'Free camera'}
            style={{ width: 30, height: 30, padding: 0 }}
          >
            <Compass size={14} />
          </button>
        </div>
      )}

      {/* Floating Action Controls on Right */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        right: 20,
        zIndex: 35,
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        {/* Toggle GPS Tracking */}
        <button
          onClick={toggleGpsTracking}
          className={`minimal-btn ${isLiveTracking ? 'active' : ''}`}
          title={isLiveTracking ? 'Stop Live GPS' : 'Locate Me (Strict Road GPS)'}
          style={{ width: 38, height: 38, padding: 0 }}
        >
          <Crosshair size={17} />
        </button>

        {/* Toggle Walk Simulation Button */}
        {activeRoute && (
          <button
            onClick={toggleWalkSimulation}
            className={`minimal-btn ${isSimulating ? 'active' : 'minimal-btn-primary'}`}
            title={isSimulating ? 'Pause Walk' : 'Simulate Walk on Road'}
            style={{ width: 38, height: 38, padding: 0 }}
          >
            {isSimulating ? <Pause size={15} /> : <Footprints size={16} />}
          </button>
        )}

        {/* Fit Route */}
        {activeRoute && (
          <button
            onClick={handleFitRoute}
            className="minimal-btn"
            title="Fit Route to View"
            style={{ width: 38, height: 38, padding: 0 }}
          >
            <Navigation size={16} />
          </button>
        )}

        {/* Satellite Aerial View Toggle */}
        <button
          onClick={onToggleSatellite}
          className={`minimal-btn ${isSatellite ? 'active' : ''}`}
          title={isSatellite ? "Switch to Standard Campus Map" : "Switch to Satellite Aerial View"}
          style={{ width: 38, height: 38, padding: 0 }}
        >
          <Globe size={16} />
        </button>

        {/* Reset to Academic Complex */}
        <button
          onClick={handleResetView}
          className="minimal-btn"
          title="Center Central Academic Complex"
          style={{ width: 38, height: 38, padding: 0 }}
        >
          <Compass size={16} />
        </button>

        {/* Zoom In / Out Panel */}
        <div className="minimal-panel" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 3,
          gap: 2
        }}>
          <button
            onClick={zoomIn}
            onMouseDown={(e) => e.stopPropagation()}
            className="minimal-btn"
            title="Zoom In"
            style={{ width: 34, height: 34, padding: 0 }}
          >
            <ZoomIn size={16} />
          </button>

          <div style={{
            fontSize: '0.62rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            padding: '1px 0',
            userSelect: 'none'
          }}>
            {Math.round(transform.scale * 100)}%
          </div>

          <button
            onClick={zoomOut}
            onMouseDown={(e) => e.stopPropagation()}
            className="minimal-btn"
            title="Zoom Out"
            style={{ width: 34, height: 34, padding: 0 }}
          >
            <ZoomOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
