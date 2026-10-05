import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Accessibility,
  Info,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { testGeminiApiKey } from '../services/nlpEngine';

export default function SettingsModal({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  accessibleRouting,
  onToggleAccessible
}) {
  const [tempKey, setTempKey] = useState(apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // { success: boolean, message: string }
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setTempKey(apiKey || '');
    setTestStatus(null);
  }, [apiKey, isOpen]);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!tempKey.trim()) {
      setTestStatus({ success: false, message: 'Please enter a Gemini API key first.' });
      return;
    }
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await testGeminiApiKey(tempKey.trim());
      setTestStatus(res);
    } catch (err) {
      setTestStatus({ success: false, message: err.message || 'Connection test failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const cleanKey = tempKey.trim();
    onSaveApiKey(cleanKey);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const handleClear = () => {
    setTempKey('');
    onSaveApiKey('');
    setTestStatus(null);
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
      background: 'rgba(0, 0, 0, 0.78)',
      backdropFilter: 'blur(4px)',
      padding: 16
    }}>
      <div className="minimal-panel" style={{
        width: 460,
        maxWidth: '100%',
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Key size={15} color="var(--color-accent)" />
            </div>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Navigator Settings
              </h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                Configure AI reasoning & routing options
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="minimal-btn"
            style={{ width: 28, height: 28, padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Gemini API Key Section */}
        <div style={{
          background: '#131D16',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Google Gemini API Key
              </label>
              {apiKey && (
                <span style={{ fontSize: '0.66rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> Active in Storage
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Powers intelligent campus chat, room finding, and natural queries with Gemini 1.5 Flash.
            </div>
          </div>

          {/* Key Input Field */}
          <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="Paste AIzaSy... here"
                value={tempKey}
                onChange={(e) => {
                  setTempKey(e.target.value);
                  setTestStatus(null);
                }}
                style={{
                  width: '100%',
                  padding: '9px 34px 9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#0D140F',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "Hide key" : "Show key"}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {tempKey && (
              <button
                onClick={handleClear}
                className="minimal-btn"
                title="Clear key"
                style={{ width: 34, height: 34, padding: 0 }}
              >
                <Trash2 size={14} color="#EF4444" />
              </button>
            )}
          </div>

          {/* Action Buttons: Test Key & Save Key */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleTestKey}
              disabled={isTesting || !tempKey.trim()}
              className="minimal-btn"
              style={{
                flex: 1,
                padding: '7px 12px',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: (!tempKey.trim() || isTesting) ? 0.6 : 1
              }}
            >
              {isTesting ? (
                <>
                  <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  Testing...
                </>
              ) : (
                <>
                  <RefreshCw size={13} />
                  Test Key
                </>
              )}
            </button>

            <button
              onClick={handleSave}
              className="minimal-btn minimal-btn-primary"
              style={{
                flex: 1,
                padding: '7px 12px',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              {savedSuccess ? (
                <>
                  <Check size={14} /> Saved!
                </>
              ) : (
                'Save Key'
              )}
            </button>
          </div>

          {/* Test Status Feedback Card */}
          {testStatus && (
            <div style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.74rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: testStatus.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${testStatus.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: testStatus.success ? '#10B981' : '#FCA5A5'
            }}>
              {testStatus.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span style={{ lineHeight: 1.35 }}>{testStatus.message}</span>
            </div>
          )}

          {/* Quick Help / How to get key */}
          <div style={{
            fontSize: '0.71rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingTop: 4,
            borderTop: '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Need a free key?</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: 'var(--color-accent)',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontWeight: 600
                }}
              >
                Get Gemini Key <ExternalLink size={11} />
              </a>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              Tip: You can also paste your key directly into the BIT NAV'S chat box anytime!
            </div>
          </div>
        </div>

        {/* Accessibility Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#131D16',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Accessibility size={16} color="var(--color-accent)" />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                Accessible Routing
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                Prioritize ramp walkways & elevators
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

        {/* Info Footer */}
        <div style={{
          padding: '10px 12px',
          background: '#131D16',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.45
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Info size={13} color="var(--color-accent)" />
            HACKSPACE 2026 • BIT NAV'S
          </div>
          Bannari Amman Institute of Technology, Sathyamangalam. AI campus navigation with strict blue-line pathway graph, Google Gemini reasoning, and 385 verified rooms & labs.
        </div>
      </div>
    </div>
  );
}
