import React, { useState } from 'react';
import {
  X,
  Key,
  Accessibility,
  Info,
  Check
} from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  accessibleRouting,
  onToggleAccessible
}) {
  const [tempKey, setTempKey] = useState(apiKey || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveApiKey(tempKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.75)',
      padding: 16
    }}>
      <div className="minimal-panel" style={{
        width: 440,
        maxWidth: '100%',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={16} color="var(--color-accent)" />
            <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Navigator Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="minimal-btn"
            style={{ width: 28, height: 28, padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Gemini API Key */}
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
            Google Gemini API Key (Optional)
          </label>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            The app includes offline NLP. Adding a Gemini key enables Generative AI reasoning.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: '#141D17',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.82rem',
                color: 'var(--text-primary)'
              }}
            />
            <button
              onClick={handleSave}
              className="minimal-btn minimal-btn-primary"
              style={{ padding: '8px 14px', fontSize: '0.78rem' }}
            >
              {savedSuccess ? <Check size={14} /> : 'Save'}
            </button>
          </div>
        </div>

        {/* Accessibility Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px',
          background: '#141D17',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Accessibility size={16} color="var(--color-accent)" />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                Accessible Routing
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                Prioritize ramp walkways
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={accessibleRouting}
            onChange={onToggleAccessible}
            style={{ width: 16, height: 16, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
          />
        </div>

        {/* Info */}
        <div style={{
          padding: '10px',
          background: '#141D17',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.45
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Info size={12} color="var(--color-accent)" />
            HACKSPACE 2026
          </div>
          Bannari Amman Institute of Technology (BIT) Sathyamangalam. AI campus navigation with Dijkstra routing & verified map reference.
        </div>
      </div>
    </div>
  );
}
