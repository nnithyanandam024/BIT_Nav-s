import React from 'react';
import {
  GraduationCap,
  FlaskConical,
  Utensils,
  Home,
  Trophy,
  Coffee,
  DoorOpen,
  MapPin
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: MapPin },
  { id: 'academic', label: 'Academic', icon: GraduationCap },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { id: 'canteen', label: 'Food', icon: Utensils },
  { id: 'hostel', label: 'Hostels', icon: Home },
  { id: 'sports', label: 'Sports', icon: Trophy },
  { id: 'amenity', label: 'Amenities', icon: Coffee },
  { id: 'gates', label: 'Gates', icon: DoorOpen }
];

export default function CategoryBar({ activeCategory, onSelectCategory }) {
  return (
    <div style={{
      position: 'absolute',
      top: 68,
      left: 14,
      right: 14,
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      overflowX: 'auto',
      pointerEvents: 'none'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'auto'
      }}>
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`minimal-btn ${isActive ? 'active' : ''}`}
              style={{
                padding: '5px 11px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.76rem',
                whiteSpace: 'nowrap',
                gap: 5
              }}
            >
              <Icon size={13} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
