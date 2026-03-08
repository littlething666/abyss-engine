import * as React from 'react';

type R3FNodeMaterialElements = {
  meshStandardNodeMaterial: React.DetailedHTMLProps<any, any>;
  meshBasicNodeMaterial: React.DetailedHTMLProps<any, any>;
};

declare module '@react-three/fiber/webgpu' {
  interface ThreeElements extends R3FNodeMaterialElements {}
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      meshStandardNodeMaterial: React.DetailedHTMLProps<any, any>;
      meshBasicNodeMaterial: React.DetailedHTMLProps<any, any>;
    }
  }
}

export {};
