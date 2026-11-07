// frontend/src/components/PersonaBrowser.jsx
import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import PersonaCard3D from './PersonaCard3D';
import PersonaDetailView from './PersonaDetailView';
import './PersonaBrowser.css';

const PersonaBrowser = ({ personas, onSelectPersona }) => {
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [detailPersonaId, setDetailPersonaId] = useState(null);
  const detailPersona = detailPersonaId == null
    ? null
    : (personas || []).find((persona) => persona.id === detailPersonaId) || null;
  const [error, setError] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  const handlePersonaClick = (persona) => {
    setSelectedPersona(persona);
    setHoveredId(null);
  };

  const handleConfirmSelection = () => {
    if (selectedPersona && onSelectPersona) {
      onSelectPersona(selectedPersona);
    }
    setSelectedPersona(null);
  };

  const handleCancelSelection = () => {
    setSelectedPersona(null);
  };

  const handleViewDetails = () => {
    setDetailPersonaId(selectedPersona?.id ?? null);
    setSelectedPersona(null);
  };

  const handleCloseDetail = () => {
    setDetailPersonaId(null);
  };

  if (error) {
    return (
      <div className="persona-browser-container" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#ff6b6b',
        padding: '2rem',
        height: '600px'
      }}>
        <div>
          <h3>3D Browser Error</h3>
          <p>{error.message}</p>
          <button 
            onClick={() => setError(null)}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!personas || personas.length === 0) {
    return (
      <div className="persona-browser-container" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#a0a0b0',
        padding: '2rem',
        height: '600px'
      }}>
        <div>
          <h3>No Personas Available</h3>
          <p>Create some personas in the Character Request tab first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="persona-browser-container">
      <Canvas
        camera={{ position: [0, 3, 22], fov: 42 }}
        style={{ 
          background: '#0a0a0f',
          zIndex: selectedPersona ? 1 : 10,
          pointerEvents: selectedPersona ? 'none' : 'auto'
        }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.2} color="#4C1D95" />

        <spotLight
          position={[0, 15, 8]}
          angle={0.4}
          penumbra={0.8}
          intensity={3.2}
          color="#C0262E"
        />

        <pointLight position={[-12, 6, 10]} intensity={1.8} color="#6B21A8" />
        <pointLight position={[12, -4, 10]} intensity={1.6} color="#7C3AED" />
        <pointLight position={[0, -8, 5]} intensity={0.8} color="#991B1B" />

        <Stars 
          radius={120} 
          depth={60} 
          count={8000} 
          factor={3.5} 
          saturation={0} 
          fade 
          speed={0.6}
        />

        {personas?.map((persona, index) => {
          const x = (index - (personas.length - 1) / 2) * 6.5;
          const z = Math.sin(index) * 2.8;
          
          return (
            <PersonaCard3D
              key={persona.id || index}
              persona={persona}
              position={[x, 0, z]}
              onClick={() => handlePersonaClick(persona)}
              isHovered={hoveredId === (persona.id || index)}
              onHover={(isHovering) => setHoveredId(isHovering ? (persona.id || index) : null)}
            />
          );
        })}
        
        <OrbitControls 
          enableZoom={true}
          enablePan={false}
          enableRotate={true}
          minDistance={12}
          maxDistance={30}
          maxPolarAngle={Math.PI * 0.65}
        />
      </Canvas>

      {/* Cinematic Selection Overlay */}
      {selectedPersona && (
        <div className="persona-selection-overlay">
          <div className="selection-card">
            <div className="selection-glow" />
            
            <img 
              src={selectedPersona.image || '/default-avatar.png'} 
              alt={selectedPersona.name}
              className="selection-image"
            />
            
            <h2 className="selection-name">{selectedPersona.name}</h2>
            <p className="selection-description">{selectedPersona.description}</p>

            <div className="selection-buttons">
              <button 
                className="confirm-button"
                onClick={handleConfirmSelection}
              >
                ENTER THE LINK
              </button>
              <button 
                className="details-button"
                onClick={handleViewDetails}
              >
                VIEW FULL PROFILE
              </button>
              <button 
                className="details-button"
                onClick={handleCancelSelection}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Detail View */}
      {detailPersona && (
        <PersonaDetailView 
          persona={detailPersona} 
          onClose={handleCloseDetail} 
        />
      )}
    </div>
  );
};

export default PersonaBrowser;
