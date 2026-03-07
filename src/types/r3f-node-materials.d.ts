import * as React from 'react';

declare module '@react-three/fiber' {
  interface ThreeElements {
    meshStandardNodeMaterial: React.DetailedHTMLProps<any, any>;
    meshBasicNodeMaterial: React.DetailedHTMLProps<any, any>;
  }
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
