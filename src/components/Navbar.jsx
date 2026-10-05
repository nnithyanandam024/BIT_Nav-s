import React, { useState, useRef, useEffect } from 'react';
import {
  Compass,
  Search,
  Layers,
  Volume2,
  VolumeX,
  Settings,
  X
} from 'lucide-react';

export default function Navbar({
  landmarks,
  onSelectPlace,
  isSatellite,
  onToggleSatellite,
  soundEnabled,
  onToggleSound,
  onOpenSettings
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const filteredPlaces = searchTerm.trim()
    ? landmarks.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.shortName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.building.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.aliases.some(a => a.toLowerCase().includes(searchTerm.toLowerCase()))
      ).slice(0, 8)
    : [];

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (place) => {
    onSelectPlace(place);
    setSearchTerm('');
    setIsSearchOpen(false);
  };

  return (
    <header style={{
      position: 'absolute',
      top: 14,
      left: 14,
      right: 14,
      zIndex: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      pointerEvents: 'none'
    }}>
      {/* Brand */}
      <div className="minimal-panel" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        pointerEvents: 'auto'
      }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F2F4F2'
        }}>
          <Compass size={18} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
              BIT <span style={{ color: 'var(--color-accent)' }}>NAV'S</span>
            </span>
            <span className="minimal-badge" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
              HACKSPACE 2026
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Bannari Amman Institute of Technology
          </div>
        </div>
      </div>

      {/* Minimal Search Bar */}
      <div ref={searchRef} style={{
        position: 'relative',
        flex: 1,
        maxWidth: 420,
        pointerEvents: 'auto'
      }}>
        <div className="minimal-panel" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          borderRadius: 'var(--radius-md)'
        }}>
          <Search size={16} color="var(--color-accent)" />
          <input
            type="text"
            placeholder="Search blocks, computer labs, canteens, hostels..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            style={{
              flex: 1,
              fontSize: '0.84rem',
              color: 'var(--text-primary)'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setIsSearchOpen(false);
              }}
              style={{ color: 'var(--text-secondary)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {isSearchOpen && filteredPlaces.length > 0 && (
          <div className="minimal-panel" style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            padding: '6px',
            maxHeight: 280,
            overflowY: 'auto'
          }}>
            {filteredPlaces.map(place => (
              <div
                key={place.id}
                onClick={() => handleSelect(place)}
                style={{
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    {place.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {place.building} • {place.floor}
                  </div>
                </div>
                <span className="minimal-badge" style={{ fontSize: '0.62rem' }}>
                  {place.category}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minimal Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
        {/* Toggle Pathways Overlay */}
        <button
          onClick={onToggleSatellite}
          className={`minimal-btn ${isSatellite ? 'active' : ''}`}
          title={isSatellite ? "Hide Pathways Overlay" : "Show Physical Pathways Overlay"}
        >
          <Layers size={15} />
          <span className="desktop-only">
            {isSatellite ? 'Pathways' : 'Physical'}
          </span>
        </button>

        {/* Audio Toggle */}
        <button
          onClick={onToggleSound}
          className={`minimal-btn ${soundEnabled ? 'active' : ''}`}
          title={soundEnabled ? "Audio Directions Enabled" : "Audio Muted"}
          style={{ width: 34, height: 34, padding: 0 }}
        >
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} color="var(--text-secondary)" />}
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="minimal-btn"
          title="Settings"
          style={{ width: 34, height: 34, padding: 0 }}
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
}
