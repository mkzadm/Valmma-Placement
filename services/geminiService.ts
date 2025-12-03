/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { DebugInfo } from '../types';

// Helper to convert a data URL string to a File object
export const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("URL de datos inválida");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("No se pudo extraer el tipo MIME de la URL de datos");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

// Helper to get intrinsic image dimensions from a File object
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Error al leer el archivo."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = (err) => reject(new Error(`Error al cargar la imagen: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`Error del lector de archivos: ${err}`));
    });
};

// Helper to crop a square image back to an original aspect ratio, removing padding.
const cropToOriginalAspectRatio = (
    imageDataUrl: string,
    originalWidth: number,
    originalHeight: number,
    targetDimension: number
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imageDataUrl;
        img.onload = () => {
            // Re-calculate the dimensions of the content area within the padded square image
            const aspectRatio = originalWidth / originalHeight;
            let contentWidth, contentHeight;
            if (aspectRatio > 1) { // Landscape
                contentWidth = targetDimension;
                contentHeight = targetDimension / aspectRatio;
            } else { // Portrait or square
                contentHeight = targetDimension;
                contentWidth = targetDimension * aspectRatio;
            }

            // Calculate the top-left offset of the content area
            const x = (targetDimension - contentWidth) / 2;
            const y = (targetDimension - contentHeight) / 2;

            const canvas = document.createElement('canvas');
            // Set canvas to the final, un-padded dimensions
            canvas.width = contentWidth;
            canvas.height = contentHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('No se pudo obtener el contexto del canvas para recortar.'));
            }
            
            // Draw the relevant part of the square generated image onto the new, smaller canvas
            ctx.drawImage(img, x, y, contentWidth, contentHeight, 0, 0, contentWidth, contentHeight);
            
            // Return the data URL of the newly cropped image
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = (err) => reject(new Error(`Error al cargar la imagen durante el recorte: ${err}`));
    });
};


// New resize logic inspired by the reference to enforce a consistent aspect ratio without cropping.
// It resizes the image to fit within a square and adds padding, ensuring a consistent
// input size for the AI model, which enhances stability.
const resizeImage = (file: File, targetDimension: number): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Error al leer el archivo."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetDimension;
                canvas.height = targetDimension;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('No se pudo obtener el contexto del canvas.'));
                }

                // Fill the canvas with a neutral background to avoid transparency issues
                // and ensure a consistent input format for the model.
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, targetDimension, targetDimension);

                // Calculate new dimensions to fit inside the square canvas while maintaining aspect ratio
                const aspectRatio = img.width / img.height;
                let newWidth, newHeight;

                if (aspectRatio > 1) { // Landscape image
                    newWidth = targetDimension;
                    newHeight = targetDimension / aspectRatio;
                } else { // Portrait or square image
                    newHeight = targetDimension;
                    newWidth = targetDimension * aspectRatio;
                }

                // Calculate position to center the image on the canvas
                const x = (targetDimension - newWidth) / 2;
                const y = (targetDimension - newHeight) / 2;
                
                // Draw the resized image onto the centered position
                ctx.drawImage(img, x, y, newWidth, newHeight);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg', // Force jpeg to handle padding color consistently
                            lastModified: Date.now()
                        }));
                    } else {
                        reject(new Error('La conversión de Canvas a Blob falló.'));
                    }
                }, 'image/jpeg', 0.95);
            };
            img.onerror = (err) => reject(new Error(`Error al cargar la imagen: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`Error del lector de archivos: ${err}`));
    });
};

// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("URL de datos inválida");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("No se pudo extraer el tipo MIME de la URL de datos");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

// Helper to convert File to a data URL string
const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

// Helper to draw a marker on an image and return a new File object
const markImage = async (
    paddedSquareFile: File, 
    position: { xPercent: number; yPercent: number; },
    originalDimensions: { originalWidth: number; originalHeight: number; }
): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(paddedSquareFile);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Error al leer el archivo para marcarlo."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const targetDimension = canvas.width;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('No se pudo obtener el contexto del canvas para marcar.'));
                }

                // Draw the original (padded) image
                ctx.drawImage(img, 0, 0);

                // Recalculate the content area's dimensions and offset within the padded square canvas.
                // This is crucial to translate the content-relative percentages to the padded canvas coordinates.
                const { originalWidth, originalHeight } = originalDimensions;
                const aspectRatio = originalWidth / originalHeight;
                let contentWidth, contentHeight;

                if (aspectRatio > 1) { // Landscape
                    contentWidth = targetDimension;
                    contentHeight = targetDimension / aspectRatio;
                } else { // Portrait or square
                    contentHeight = targetDimension;
                    contentWidth = targetDimension * aspectRatio;
                }
                
                const offsetX = (targetDimension - contentWidth) / 2;
                const offsetY = (targetDimension - contentHeight) / 2;

                // Calculate the marker's coordinates relative to the actual image content
                const markerXInContent = (position.xPercent / 100) * contentWidth;
                const markerYInContent = (position.yPercent / 100) * contentHeight;

                // The final position on the canvas is the content's offset plus the relative position
                const finalMarkerX = offsetX + markerXInContent;
                const finalMarkerY = offsetY + markerYInContent;

                // Make radius proportional to image size, but with a minimum
                const markerRadius = Math.max(5, Math.min(canvas.width, canvas.height) * 0.015);

                // Draw the marker (red circle with white outline) at the corrected coordinates
                ctx.beginPath();
                ctx.arc(finalMarkerX, finalMarkerY, markerRadius, 0, 2 * Math.PI, false);
                ctx.fillStyle = 'red';
                ctx.fill();
                ctx.lineWidth = markerRadius * 0.2;
                ctx.strokeStyle = 'white';
                ctx.stroke();

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], `marked-${paddedSquareFile.name}`, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    } else {
                        reject(new Error('La conversión de Canvas a Blob falló durante el marcado.'));
                    }
                }, 'image/jpeg', 0.95);
            };
            img.onerror = (err) => reject(new Error(`Error al cargar la imagen durante el marcado: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`Error del lector de archivos durante el marcado: ${err}`));
    });
};

const getShadowDescription = (intensity: number): string => {
    if (intensity <= 10) return "very faint and almost invisible";
    if (intensity <= 35) return "subtle and soft";
    if (intensity <= 65) return "normal and realistic";
    if (intensity <= 85) return "strong and defined";
    return "very dark and dramatic with high contrast";
};

// Helper function to safely get and validate the API key
const getApiKey = (): string => {
    const apiKey = (process.env.API_KEY || '').trim();
    if (!apiKey || apiKey === 'undefined') {
        throw new Error("La clave API (API_KEY) no está configurada. Por favor, asegúrate de añadir tu clave de Gemini en el entorno de despliegue o archivo .env.");
    }
    return apiKey;
}

/**
 * Generates a composite image using a multi-modal AI model.
 * The model takes a product image, a scene image, and a text prompt
 * to generate a new image with the product placed in the scene.
 * @param objectImage The file for the object to be placed.
 * @param objectDescription A text description of the object.
 * @param environmentImage The file for the background environment.
 * @param environmentDescription A text description of the environment.
 * @param dropPosition The relative x/y coordinates (0-100) where the product was dropped.
 * @param customInstructions Optional user-provided instructions for placement.
 * @param shadowIntensity A number from 0-100 indicating desired shadow strength.
 * @returns A promise that resolves to an object containing the base64 data URL of the generated image and the debug image.
 */
export const generateCompositeImage = async (
    objectImage: File, 
    objectDescription: string,
    environmentImage: File,
    environmentDescription: string,
    dropPosition: { xPercent: number; yPercent: number; },
    customInstructions: string,
    shadowIntensity: number
): Promise<{ finalImageUrl: string; debugInfo: DebugInfo; }> => {
  console.log('Starting multi-step image generation process...');
  
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // Get original scene dimensions for final cropping and correct marker placement
  const { width: originalWidth, height: originalHeight } = await getImageDimensions(environmentImage);
  
  // Define standard dimension for model inputs
  const MAX_DIMENSION = 1024;
  
  // STEP 1: Prepare images by resizing
  console.log('Resizing product and scene images...');
  const resizedObjectImage = await resizeImage(objectImage, MAX_DIMENSION);
  const resizedEnvironmentImage = await resizeImage(environmentImage, MAX_DIMENSION);

  // STEP 2: Analyze scene lighting using the CLEAN resized image
  console.log('Analyzing scene lighting with gemini-2.5-flash-lite...');
  let lightingDescription = '';
  try {
    const cleanResizedEnvironmentImagePart = await fileToPart(resizedEnvironmentImage);
    const lightingPrompt = `You are an expert in lighting analysis for photography and CGI. Analyze the provided scene image and describe the primary light sources in a single, concise sentence. Focus on the direction, intensity, and color of the light. Examples: "The scene is lit by a soft, warm light coming from a large window on the right." or "The primary light source is a bright, cool overhead light, causing sharp shadows directly underneath objects." or "The scene has multiple light sources, including a warm lamp on the left and cool ambient light from a window on the right."`;
    
    const lightingResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: { parts: [{ text: lightingPrompt }, cleanResizedEnvironmentImagePart] }
    });
    lightingDescription = lightingResponse.text;
    console.log('Generated lighting description:', lightingDescription);
  } catch (error) {
    console.error('Failed to generate lighting description:', error);
    // Fallback to a generic statement if the analysis fails
    lightingDescription = 'The lighting in the scene should be analyzed to create realistic shadows.';
  }

  // STEP 3: Mark the resized scene image for the description model and debug view
  console.log('Marking scene image for analysis...');
  // Pass original dimensions to correctly calculate marker position on the padded image
  const markedResizedEnvironmentImage = await markImage(resizedEnvironmentImage, dropPosition, { originalWidth, originalHeight });

  // The debug image is now the marked one. We also need data URLs for the other inputs.
  const markedSceneUrl = await fileToDataUrl(markedResizedEnvironmentImage);
  const resizedProductUrl = await fileToDataUrl(resizedObjectImage);
  const resizedSceneUrl = await fileToDataUrl(resizedEnvironmentImage);

  // STEP 4: Generate semantic location description with Gemini 2.5 Flash Lite using the MARKED image
  console.log('Generating semantic location description with gemini-2.5-flash-lite...');
  
  const markedEnvironmentImagePart = await fileToPart(markedResizedEnvironmentImage);

  const descriptionPrompt = `
You are an expert scene analyst. I will provide you with an image that has a red marker on it.
Your task is to provide a very dense, semantic description of what is at the exact location of the red marker.
Be specific about surfaces, objects, and spatial relationships. This description will be used to guide another AI in placing a new object.

Example semantic descriptions:
- "The product location is on the dark grey fabric of the sofa cushion, in the middle section, slightly to the left of the white throw pillow."
- "The product location is on the light-colored wooden floor, in the patch of sunlight coming from the window, about a foot away from the leg of the brown leather armchair."
- "The product location is on the white marble countertop, just to the right of the stainless steel sink and behind the green potted plant."

On top of the semantic description above, give a rough relative-to-image description.

Example relative-to-image descriptions:
- "The product location is about 10% away from the bottom-left of the image."
- "The product location is about 20% away from the right of the image."

Provide only the two descriptions concatenated in a few sentences.
`;
  
  let semanticLocationDescription = '';
  try {
    const descriptionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: { parts: [{ text: descriptionPrompt }, markedEnvironmentImagePart] }
    });
    semanticLocationDescription = descriptionResponse.text;
    console.log('Generated description:', semanticLocationDescription);
  } catch (error) {
    console.error('Failed to generate semantic location description:', error);
    // Fallback to a generic statement if the description generation fails
    semanticLocationDescription = `at the specified location.`;
  }

  // STEP 5: Generate composite image using the CLEAN image and the description
  console.log('Preparing to generate composite image...');
  
  const objectImagePart = await fileToPart(resizedObjectImage);
  const cleanEnvironmentImagePart = await fileToPart(resizedEnvironmentImage); // IMPORTANT: Use clean image
  
  const customInstructionsPart = customInstructions.trim()
    ? `
-   **User's Custom Instructions (Override):**
    -   If provided, these instructions take precedence. "${customInstructions.trim()}"`
    : '';

  const shadowIntensityDescription = getShadowDescription(shadowIntensity);
  
  const prompt = `
**Role:**
You are a visual composition expert. Your task is to take a 'product' image and seamlessly integrate it into a 'scene' image, adjusting for perspective, lighting, and scale.

**Specifications:**
-   **Product to add:**
    The first image provided. It may be surrounded by black padding or background, which you should ignore and treat as transparent and only keep the product.
-   **Scene to use:**
    The second image provided. It may also be surrounded by black padding, which you should ignore.
-   **Placement Instruction (Crucial):**
    -   You must place the product at the location described below exactly. You should only place the product once. Use this dense, semantic description to find the exact spot in the scene.
    -   **Product location Description:** "${semanticLocationDescription}"
-   **Lighting & Shadow Instructions (Crucial):**
    -   **Scene Lighting Analysis:** "${lightingDescription}"
    -   Based on this analysis, you MUST render shadows for the product that match the scene's lighting. The shadows should be subtle, context-aware, and accurately reflect the direction, softness, and color of the light sources. The shadow must ground the product in the scene naturally.
    -   **Shadow Intensity (Crucial User Override):** The user has specified the desired shadow intensity. You must render the shadows as: **"${shadowIntensityDescription}"**. This is a strict requirement.${customInstructionsPart}
-   **Final Image Requirements:**
    -   The output image's style, lighting, shadows, reflections, and camera perspective must exactly match the original scene.
    -   Do not just copy and paste the product. You must intelligently re-render it to fit the context. Adjust the product's perspective and orientation to its most natural position, scale it appropriately.
    -   The product must have proportional realism. For example, a lamp product can't be bigger than a sofa in scene.
    -   You must not return the original scene image without product placement. The product must be always present in the composite image.

The output should ONLY be the final, composed image. Do not add any text or explanation.
`;

  const textPart = { text: prompt };
  
  console.log('Sending images and augmented prompt...');
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [objectImagePart, cleanEnvironmentImagePart, textPart] }, // IMPORTANT: Use clean image
  });

  console.log('Received response.');
  
  const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

  if (imagePartFromResponse?.inlineData) {
    const { mimeType, data } = imagePartFromResponse.inlineData;
    console.log(`Received image data (${mimeType}), length:`, data.length);
    const generatedSquareImageUrl = `data:${mimeType};base64,${data}`;
    
    console.log('Cropping generated image to original aspect ratio...');
    const finalImageUrl = await cropToOriginalAspectRatio(
        generatedSquareImageUrl,
        originalWidth,
        originalHeight,
        MAX_DIMENSION
    );
    
    return { 
        finalImageUrl,
        debugInfo: {
            markedSceneUrl: markedSceneUrl,
            resizedProductUrl: resizedProductUrl,
            resizedSceneUrl: resizedSceneUrl,
            finalPrompt: prompt
        }
    };
  }

  console.error("Model response did not contain an image part.", response);
  throw new Error("El modelo de IA no devolvió una imagen. Por favor, inténtalo de nuevo.");
};

/**
 * Generates a new view of a product image using an AI model.
 * @param productImage The file for the product to be rotated.
 * @param rotationDescription A text description of the desired view (e.g., "back view", "view from the left").
 * @returns A promise that resolves to a new File object of the rotated product.
 */
export const rotateProductImage = async (
    productImage: File,
    rotationDescription: string
): Promise<File> => {
    console.log(`Rotating product to: ${rotationDescription}`);
    
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });
    
    const MAX_DIMENSION = 1024;
    const resizedProductImage = await resizeImage(productImage, MAX_DIMENSION);
    
    const productImagePart = await fileToPart(resizedProductImage);
    
    const prompt = `
**Role:**
You are an expert 3D product visualizer. Your task is to re-render the provided product image from a different angle.

**Specifications:**
-   **Product:** The provided image contains a single product, possibly with a simple or padded background.
-   **Task:** Re-render the product to show the **"${rotationDescription}"**.
-   **Requirements:**
    -   Maintain the product's identity, design, colors, and textures perfectly.
    -   The background of the output image MUST be a solid, neutral light gray (#f0f0f0). This is crucial for easy use later. Do not include any shadows on the background.
    -   The product should be centered in the frame.
    -   The lighting on the product should be neutral and professional, as if in a studio.

The output should ONLY be the image of the rotated product. Do not add any text or explanation.
`;

    const textPart = { text: prompt };

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [productImagePart, textPart] },
    });

    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        const generatedImageUrl = `data:${mimeType};base64,${data}`;
        
        const newFileName = `rotated-${rotationDescription.replace(/\s+/g, '-')}-${productImage.name}`;
        
        return dataURLtoFile(generatedImageUrl, newFileName);
    }
    
    console.error("Model response did not contain an image part for rotation.", response);
    throw new Error("El modelo de IA no devolvió una imagen rotada. Por favor, inténtalo de nuevo.");
};