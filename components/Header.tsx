/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="w-full p-4 text-center">
      <div className="flex items-center justify-center">
          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight text-zinc-800">
            Valmma Studio
          </h1>
      </div>
      <p className="mt-4 text-lg text-zinc-600 max-w-3xl mx-auto">
        Integra productos en escenas con un toque de magia y realismo.
        <br />
        Sube tus fotos, arrastra y deja que la IA haga el resto.
      </p>
    </header>
  );
};

export default Header;