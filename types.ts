/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Product {
  id: number;
  name: string;
  imageUrl: string;
}

export interface DebugInfo {
    markedSceneUrl: string;
    resizedProductUrl: string;
    resizedSceneUrl: string;
    finalPrompt: string;
}
