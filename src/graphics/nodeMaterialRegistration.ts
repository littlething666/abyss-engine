import { extend } from '@react-three/fiber/webgpu';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';

extend({ MeshBasicNodeMaterial, MeshStandardNodeMaterial });
