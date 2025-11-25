/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateCompositeImage, rotateProductImage, dataURLtoFile } from './services/geminiService';
import { Product, DebugInfo } from './types';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import ObjectCard from './components/ObjectCard';
import Spinner from './components/Spinner';
import DebugModal from './components/DebugModal';
import TouchGhost from './components/TouchGhost';

// Pre-load a transparent image to use for hiding the default drag ghost.
// This prevents a race condition on the first drag.
const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const loadingMessages = [
    "Analizando tu producto...",
    "Inspeccionando la escena...",
    "Analizando la iluminación de la escena...",
    "Describiendo la ubicación con IA...",
    "Creando la instrucción de composición perfecta...",
    "Generando opciones fotorrealistas...",
    "Ensamblando la escena final..."
];


const App: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [originalProductImageFile, setOriginalProductImageFile] = useState<File | null>(null);
  const [sceneImage, setSceneImage] = useState<File | null>(null);
  const [originalSceneImage, setOriginalSceneImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRotatingProduct, setIsRotatingProduct] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [persistedOrbPosition, setPersistedOrbPosition] = useState<{x: number, y: number} | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [shadowIntensity, setShadowIntensity] = useState<number>(50);

  // State for touch drag & drop
  const [isTouchDragging, setIsTouchDragging] = useState<boolean>(false);
  const [touchGhostPosition, setTouchGhostPosition] = useState<{x: number, y: number} | null>(null);
  const [isHoveringDropZone, setIsHoveringDropZone] = useState<boolean>(false);
  const [touchOrbPosition, setTouchOrbPosition] = useState<{x: number, y: number} | null>(null);
  const sceneImgRef = useRef<HTMLImageElement>(null);
  
  const sceneImageUrl = sceneImage ? URL.createObjectURL(sceneImage) : null;
  const productImageUrl = selectedProduct ? selectedProduct.imageUrl : null;

  const handleProductImageUpload = useCallback((file: File) => {
    // useEffect will handle cleaning up the previous blob URL
    setError(null);
    try {
        const imageUrl = URL.createObjectURL(file);
        const product: Product = {
            id: Date.now(),
            name: file.name,
            imageUrl: imageUrl,
        };
        setProductImageFile(file);
        setOriginalProductImageFile(file);
        setSelectedProduct(product);
    } catch(err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`No se pudo cargar la imagen del producto. Detalles: ${errorMessage}`);
      console.error(err);
    }
  }, []);

  const handleSceneUpload = useCallback((file: File) => {
    setError(null);
    setSceneImage(file);
    setOriginalSceneImage(file);
    setPersistedOrbPosition(null);
    setDebugInfo(null);
  }, []);

  const handleInstantStart = useCallback(async () => {
    setError(null);
    try {
      // Fetch the default images
      const [objectResponse, sceneResponse] = await Promise.all([
        fetch('/assets/object.jpeg'),
        fetch('/assets/scene.jpeg')
      ]);

      if (!objectResponse.ok || !sceneResponse.ok) {
        throw new Error('Error al cargar las imágenes predeterminadas');
      }

      // Convert to blobs then to File objects
      const [objectBlob, sceneBlob] = await Promise.all([
        objectResponse.blob(),
        sceneResponse.blob()
      ]);

      const objectFile = new File([objectBlob], 'object.jpeg', { type: 'image/jpeg' });
      const sceneFile = new File([sceneBlob], 'scene.jpeg', { type: 'image/jpeg' });

      // Update state with the new files
      handleSceneUpload(sceneFile);
      handleProductImageUpload(objectFile);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`No se pudieron cargar las imágenes predeterminadas. Detalles: ${errorMessage}`);
      console.error(err);
    }
  }, [handleProductImageUpload, handleSceneUpload]);

  const handleProductDrop = useCallback(async (position: {x: number, y: number}, relativePosition: { xPercent: number; yPercent: number; }) => {
    if (!productImageFile || !sceneImage || !selectedProduct) {
      setError('Ocurrió un error inesperado. Por favor, inténtalo de nuevo.');
      return;
    }
    setPersistedOrbPosition(position);
    setIsLoading(true);
    setError(null);
    try {
      const { finalImageUrl, debugInfo } = await generateCompositeImage(
        productImageFile, 
        selectedProduct.name,
        sceneImage,
        sceneImage.name,
        relativePosition,
        customPrompt,
        shadowIntensity
      );
      setDebugInfo(debugInfo);
      const newSceneFile = dataURLtoFile(finalImageUrl, `generated-scene-${Date.now()}.jpeg`);
      setSceneImage(newSceneFile);

    } catch (err)
 {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(`Error al generar la imagen. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
      setPersistedOrbPosition(null);
    }
  }, [productImageFile, sceneImage, selectedProduct, customPrompt, shadowIntensity]);


  const handleReset = useCallback(() => {
    // Let useEffect handle URL revocation
    setSelectedProduct(null);
    setProductImageFile(null);
    setOriginalProductImageFile(null);
    setSceneImage(null);
    setOriginalSceneImage(null);
    setError(null);
    setIsLoading(false);
    setPersistedOrbPosition(null);
    setDebugInfo(null);
    setCustomPrompt('');
    setShadowIntensity(50);
  }, []);

  const handleChangeProduct = useCallback(() => {
    // Let useEffect handle URL revocation
    setSelectedProduct(null);
    setProductImageFile(null);
    setOriginalProductImageFile(null);
    setPersistedOrbPosition(null);
    setDebugInfo(null);
    setCustomPrompt('');
  }, []);
  
  const handleChangeScene = useCallback(() => {
    setSceneImage(null);
    setOriginalSceneImage(null);
    setPersistedOrbPosition(null);
    setDebugInfo(null);
    setCustomPrompt('');
  }, []);

  const handleRedeployScene = useCallback(() => {
    if (originalSceneImage) {
        setSceneImage(originalSceneImage);
        setPersistedOrbPosition(null);
        setDebugInfo(null);
    }
  }, [originalSceneImage]);

  const handleDownload = (file: File | null, url: string | null) => {
    if (!file || !url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRotateProduct = async (rotationDescription: string) => {
    if (!productImageFile || !originalProductImageFile || isRotatingProduct) return;

    // "Restore" should revert to the original uploaded image locally.
    // This is faster and guarantees the original quality.
    if (rotationDescription === 'restore') {
        if (productImageFile === originalProductImageFile) return; // Already showing original
        
        if (selectedProduct && selectedProduct.imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(selectedProduct.imageUrl);
        }
        const newImageUrl = URL.createObjectURL(originalProductImageFile);
        const newProduct: Product = {
            id: Date.now(),
            name: originalProductImageFile.name,
            imageUrl: newImageUrl,
        };
        setProductImageFile(originalProductImageFile);
        setSelectedProduct(newProduct);
        return;
    }

    setIsRotatingProduct(true);
    setError(null);
    try {
        // Use the *current* product image for rotation, allowing for cumulative rotations.
        const newProductFile = await rotateProductImage(productImageFile, rotationDescription);
        
        if (selectedProduct && selectedProduct.imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(selectedProduct.imageUrl);
        }

        const newImageUrl = URL.createObjectURL(newProductFile);
        const newProduct: Product = {
            id: Date.now(),
            name: newProductFile.name,
            imageUrl: newImageUrl,
        };
        setProductImageFile(newProductFile);
        setSelectedProduct(newProduct);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
        setError(`Error al rotar el producto. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsRotatingProduct(false);
    }
  };

  useEffect(() => {
    // Clean up the scene's object URL when the component unmounts or the URL changes
    return () => {
        if (sceneImageUrl) URL.revokeObjectURL(sceneImageUrl);
    };
  }, [sceneImageUrl]);
  
  useEffect(() => {
    // Clean up the product's object URL when the component unmounts or the URL changes
    return () => {
        if (productImageUrl && productImageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(productImageUrl);
        }
    };
  }, [productImageUrl]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isLoading) {
        setLoadingMessageIndex(0); // Reset on start
        interval = setInterval(() => {
            setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
        }, 3000);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!selectedProduct) return;
    // Prevent page scroll
    e.preventDefault();
    setIsTouchDragging(true);
    const touch = e.touches[0];
    setTouchGhostPosition({ x: touch.clientX, y: touch.clientY });
  };

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouchDragging) return;
      const touch = e.touches[0];
      setTouchGhostPosition({ x: touch.clientX, y: touch.clientY });
      
      const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropZone = elementUnderTouch?.closest<HTMLDivElement>('[data-dropzone-id="scene-uploader"]');

      if (dropZone) {
          const rect = dropZone.getBoundingClientRect();
          setTouchOrbPosition({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
          setIsHoveringDropZone(true);
      } else {
          setIsHoveringDropZone(false);
          setTouchOrbPosition(null);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isTouchDragging) return;
      
      const touch = e.changedTouches[0];
      const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropZone = elementUnderTouch?.closest<HTMLDivElement>('[data-dropzone-id="scene-uploader"]');

      if (dropZone && sceneImgRef.current) {
          const img = sceneImgRef.current;
          const containerRect = dropZone.getBoundingClientRect();
          const { naturalWidth, naturalHeight } = img;
          const { width: containerWidth, height: containerHeight } = containerRect;

          const imageAspectRatio = naturalWidth / naturalHeight;
          const containerAspectRatio = containerWidth / containerHeight;

          let renderedWidth, renderedHeight;
          if (imageAspectRatio > containerAspectRatio) {
              renderedWidth = containerWidth;
              renderedHeight = containerWidth / imageAspectRatio;
          } else {
              renderedHeight = containerHeight;
              renderedWidth = containerHeight * imageAspectRatio;
          }
          
          const offsetX = (containerWidth - renderedWidth) / 2;
          const offsetY = (containerHeight - renderedHeight) / 2;

          const dropX = touch.clientX - containerRect.left;
          const dropY = touch.clientY - containerRect.top;

          const imageX = dropX - offsetX;
          const imageY = dropY - offsetY;
          
          if (!(imageX < 0 || imageX > renderedWidth || imageY < 0 || imageY > renderedHeight)) {
            const xPercent = (imageX / renderedWidth) * 100;
            const yPercent = (imageY / renderedHeight) * 100;
            
            handleProductDrop({ x: dropX, y: dropY }, { xPercent, yPercent });
          }
      }

      setIsTouchDragging(false);
      setTouchGhostPosition(null);
      setIsHoveringDropZone(false);
      setTouchOrbPosition(null);
    };

    if (isTouchDragging) {
      document.body.style.overflow = 'hidden'; // Prevent scrolling
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isTouchDragging, handleProductDrop]);

  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-50 border border-red-200 p-8 rounded-lg max-w-2xl mx-auto">
            <h2 className="text-3xl font-extrabold mb-4 text-red-800">Ocurrió un Error</h2>
            <p className="text-lg text-red-700 mb-6">{error}</p>
            <button
                onClick={handleReset}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
              >
                Intentar de Nuevo
            </button>
          </div>
        );
    }
    
    if (!productImageFile || !sceneImage) {
      return (
        <div className="w-full max-w-6xl mx-auto animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="flex flex-col">
              <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Sube tu Producto</h2>
              <ImageUploader 
                id="product-uploader"
                onFileSelect={handleProductImageUpload}
                imageUrl={productImageUrl}
              />
            </div>
            <div className="flex flex-col">
              <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Sube la Escena</h2>
              <ImageUploader 
                id="scene-uploader"
                onFileSelect={handleSceneUpload}
                imageUrl={sceneImageUrl}
              />
            </div>
          </div>
          <div className="text-center mt-10 min-h-[4rem] flex flex-col justify-center items-center">
            <p className="text-zinc-500 animate-fade-in">
              Sube una imagen del producto y una de la escena para comenzar.
            </p>
            <p className="text-zinc-500 animate-fade-in mt-2">
              O haz clic{' '}
              <button
                onClick={handleInstantStart}
                className="font-bold text-blue-600 hover:text-blue-800 underline transition-colors"
              >
                aquí
              </button>
              {' '}para un inicio rápido.
            </p>
          </div>
        </div>
      );
    }

    const actionButtonClasses = "bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors border border-zinc-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";

    return (
      <div className="w-full max-w-7xl mx-auto animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {/* Product Column */}
          <div className="md:col-span-1 flex flex-col items-center">
            <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Producto</h2>
            <div className="flex-grow flex items-center justify-center w-full">
              <div 
                  draggable="true" 
                  onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
                  }}
                  onTouchStart={handleTouchStart}
                  className="cursor-move w-full max-w-xs relative"
              >
                  <div className={isRotatingProduct ? 'opacity-50 transition-opacity' : ''}>
                    <ObjectCard product={selectedProduct!} isSelected={true} />
                  </div>
                  {isRotatingProduct && (
                      <div className="absolute inset-0 flex items-center justify-center">
                          <Spinner />
                      </div>
                  )}
              </div>
            </div>
            <div className="text-center mt-4 w-full max-w-xs space-y-4">
                <div>
                    <label className="text-sm font-medium text-zinc-600 mb-2 block">Rotar Producto (IA)</label>
                    <div className="flex flex-wrap justify-center gap-2">
                        <button onClick={() => handleRotateProduct('front view')} disabled={isRotatingProduct} className={actionButtonClasses}>Frente</button>
                        <button onClick={() => handleRotateProduct('a view of its left side')} disabled={isRotatingProduct} className={actionButtonClasses}>Izquierda</button>
                        <button onClick={() => handleRotateProduct('a view of its right side')} disabled={isRotatingProduct} className={actionButtonClasses}>Derecha</button>
                        <button onClick={() => handleRotateProduct('back view')} disabled={isRotatingProduct} className={actionButtonClasses}>Atrás</button>
                        <button onClick={() => handleRotateProduct('restore')} disabled={isRotatingProduct} className={actionButtonClasses}>Restaurar</button>
                    </div>
                </div>
                <div className="flex justify-center gap-4">
                    <button onClick={() => handleDownload(productImageFile, productImageUrl)} className={actionButtonClasses}>Descargar</button>
                    <button onClick={handleChangeProduct} className={actionButtonClasses}>Cambiar</button>
                </div>
            </div>
          </div>
          {/* Scene Column */}
          <div className="md:col-span-2 flex flex-col">
            <h2 className="text-2xl font-extrabold text-center mb-5 text-zinc-800">Escena</h2>
            <div className="flex-grow flex items-center justify-center">
              <ImageUploader 
                  ref={sceneImgRef}
                  id="scene-uploader" 
                  onFileSelect={handleSceneUpload} 
                  imageUrl={sceneImageUrl}
                  isDropZone={!!sceneImage && !isLoading}
                  onProductDrop={handleProductDrop}
                  persistedOrbPosition={persistedOrbPosition}
                  showDebugButton={!!debugInfo && !isLoading}
                  onDebugClick={() => setIsDebugModalOpen(true)}
                  isTouchHovering={isHoveringDropZone}
                  touchOrbPosition={touchOrbPosition}
              />
            </div>
            {!isLoading && (
              <div className="animate-fade-in w-full max-w-xl mx-auto mt-6">
                <div className="space-y-4">
                    <input
                        type="text"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="Instrucciones (ej: 'hazlo más pequeño')"
                        className="w-full px-4 py-3 bg-slate-100 border border-slate-300 text-zinc-800 placeholder-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow shadow-sm"
                        aria-label="Instrucciones personalizadas para la colocación del producto"
                    />
                    <div>
                      <label htmlFor="shadow-intensity" className="flex justify-between items-center text-sm font-medium text-zinc-600 mb-2">
                          <span>Intensidad de Sombra</span>
                          <span className="font-semibold text-zinc-800 tabular-nums">{shadowIntensity}%</span>
                      </label>
                      <input
                          id="shadow-intensity"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={shadowIntensity}
                          onChange={(e) => setShadowIntensity(Number(e.target.value))}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          aria-label="Deslizador de intensidad de sombra"
                      />
                    </div>
                </div>
              </div>
            )}
            <div className="text-center mt-4">
              <div className="h-8 flex items-center justify-center space-x-4">
                {sceneImage && !isLoading && (
                  <>
                    {debugInfo && originalSceneImage && (
                        <button onClick={handleRedeployScene} className={actionButtonClasses}>Restaurar Original</button>
                    )}
                    <button onClick={() => handleDownload(sceneImage, sceneImageUrl)} className={actionButtonClasses}>Descargar Escena</button>
                    <button onClick={handleChangeScene} className={actionButtonClasses}>Subir Nueva</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="text-center mt-10 min-h-[4rem] flex flex-col justify-center items-center">
           {isLoading ? (
             <div className="animate-fade-in">
                <Spinner />
                <p className="text-xl mt-4 text-zinc-600 transition-opacity duration-500">{loadingMessages[loadingMessageIndex]}</p>
             </div>
           ) : (
            <div className="animate-fade-in w-full max-w-2xl">
              <p className="text-zinc-500">
                  Arrastra el producto a un lugar de la escena, o simplemente haz clic donde lo quieras.
              </p>
            </div>
           )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-white text-zinc-800 flex items-center justify-center p-4 md:p-8">
      <TouchGhost 
        imageUrl={isTouchDragging ? productImageUrl : null} 
        position={touchGhostPosition}
      />
      <div className="flex flex-col items-center gap-8 w-full">
        <Header />
        <main className="w-full">
          {renderContent()}
        </main>
      </div>
      <DebugModal 
        isOpen={isDebugModalOpen} 
        onClose={() => setIsDebugModalOpen(false)}
        debugInfo={debugInfo}
      />
    </div>
  );
};

export default App;