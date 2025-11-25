/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { DebugInfo } from '../types';

interface DebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  debugInfo: DebugInfo | null;
}

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const DebugModal: React.FC<DebugModalProps> = ({ isOpen, onClose, debugInfo }) => {
  if (!isOpen || !debugInfo) {
    return null;
  }

  const { markedSceneUrl, resizedProductUrl, resizedSceneUrl, finalPrompt } = debugInfo;

  const handleModalContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl p-6 md:p-8 relative transform transition-all flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={handleModalContentClick}
        role="document"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-800 transition-colors z-10"
          aria-label="Cerrar modal"
        >
          <CloseIcon />
        </button>
        <div className="text-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-extrabold text-zinc-800">Vista de Depuración</h2>
        </div>
        
        <div className="flex flex-col gap-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                  <p className="text-zinc-600 mb-2 text-sm font-semibold">1. Imagen del Producto Enviada a la IA</p>
                  <div className="rounded-lg overflow-hidden bg-zinc-100 border">
                      <img src={resizedProductUrl} alt="Producto redimensionado enviado a la IA" className="w-full h-full object-contain" />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Esta imagen (redimensionada a 1024x1024 con relleno) se envía al modelo final.</p>
              </div>

              <div>
                  <p className="text-zinc-600 mb-2 text-sm font-semibold">2. Imagen de la Escena Enviada a la IA</p>
                  <div className="rounded-lg overflow-hidden bg-zinc-100 border">
                      <img src={resizedSceneUrl} alt="Escena redimensionada enviada a la IA" className="w-full h-full object-contain" />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Esta versión limpia se usa para analizar la iluminación y como base para la composición final.</p>
              </div>

              <div>
                  <p className="text-zinc-600 mb-2 text-sm font-semibold">3. Escena Marcada para Análisis</p>
                  <div className="rounded-lg overflow-hidden bg-zinc-100 border">
                      <img src={markedSceneUrl} alt="Vista de depuración de la escena marcada" className="w-full h-full object-contain" />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Esta versión con el marcador rojo se envía a un modelo separado para describir la ubicación.</p>
              </div>
          </div>
          
          {finalPrompt && (
            <div>
                <h3 className="text-lg font-bold text-zinc-800 mb-2">Prompt Final para el Modelo de Imagen</h3>
                <pre className="bg-zinc-100 text-zinc-700 p-4 rounded-lg text-xs whitespace-pre-wrap">
                    <code>{finalPrompt}</code>
                </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebugModal;