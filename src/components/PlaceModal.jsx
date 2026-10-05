import React from 'react';
import {
  X,
  Building,
  Layers,
  Navigation,
  Compass,
  CheckCircle
} from 'lucide-react';

export default function PlaceModal({
  place,
  onClose,
  onNavigateTo,
  onSetAsStart
}) {
  if (!place) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 110,
      right: 16,
      zIndex: 45,
      width: 330,
      maxWidth: 'calc(100vw - 32px)',
      pointerEvents: 'auto'
    }}>
      <div className="minimal-panel" style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <span className="minimal-badge" style={{ fontSize: '0.65rem', marginBottom: 4 }}>
              {place.category}
            </span>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0 }}>
              {place.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="minimal-btn"
            style={{ width: 28, height: 28, padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Building & Floor meta */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          padding: '8px 10px',
          background: '#141D17',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.76rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
            <Building size={13} color="var(--color-accent)" />
            <span>{place.building}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
            <Layers size={13} color="var(--color-primary)" />
            <span>{place.floor}</span>
          </div>
        </div>

        {/* Description */}
        <p style={{
          fontSize: '0.78rem',
          lineHeight: 1.45,
          color: 'var(--text-secondary)',
          margin: 0
        }}>
          {place.description}
        </p>

        {/* Facilities */}
        {place.facilities && place.facilities.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {place.facilities.map((fac, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#141D17',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.68rem',
                  color: 'var(--text-secondary)'
                }}
              >
                <CheckCircle size={10} color="var(--color-accent)" />
                {fac}
              </span>
            ))}
          </div>
        )}

        {/* Floors and Rooms Directory */}
        {place.floors && place.floors.length > 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 160,
            overflowY: 'auto',
            padding: '8px',
            background: '#0D1410',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
              Floors & Labs Directory ({place.rooms?.length || 0} Rooms)
            </span>
            {place.floors.map((floor, fIdx) => (
              <div key={fIdx} style={{ fontSize: '0.74rem' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Building size={13} color="var(--color-primary)" />
                  <span>{floor.name}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {(floor.rooms || []).map((rm, rIdx) => (
                    <span
                      key={rIdx}
                      style={{
                        padding: '1px 5px',
                        background: '#16221B',
                        borderRadius: 3,
                        fontSize: '0.66rem',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      {rm}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons: Navigate Here & Set as Start */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
          <button
            onClick={() => onNavigateTo(place)}
            className="minimal-btn minimal-btn-primary"
            style={{
              padding: '8px 12px',
              fontSize: '0.82rem',
              gap: 6
            }}
          >
            <Navigation size={14} />
            Navigate Here
          </button>

          <button
            onClick={() => onSetAsStart(place)}
            className="minimal-btn"
            style={{ fontSize: '0.82rem', padding: '8px 12px', gap: 6 }}
          >
            <Compass size={14} />
            Set as Start
          </button>
        </div>
      </div>
    </div>
  );
}
