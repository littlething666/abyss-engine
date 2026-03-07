import { extend } from '@react-three/fiber';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';

extend({ MeshBasicNodeMaterial, MeshStandardNodeMaterial });
