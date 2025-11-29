import { DroneSpecs } from './types';

// Common Drone Presets for Photogrammetry
export const DRONE_PRESETS: DroneSpecs[] = [
  { name: 'DJI Mavic 3 Enterprise (Wide)', sensorWidth: 17.3, sensorHeight: 13.0, focalLength: 12.29 }, // 4/3 CMOS
  { name: 'DJI Phantom 4 RTK', sensorWidth: 13.2, sensorHeight: 8.8, focalLength: 8.8 }, // 1 inch
  { name: 'DJI Matrice 300 (P1)', sensorWidth: 35.9, sensorHeight: 24.0, focalLength: 35 }, // Full frame, typical 35mm lens
  { name: 'DJI Mini 3 Pro', sensorWidth: 9.84, sensorHeight: 7.38, focalLength: 6.7 }, // 1/1.3 inch
  { name: 'Custom / Unknown', sensorWidth: 13.2, sensorHeight: 8.8, focalLength: 8.8 }, // Default to 1 inch
];

export const GOOGLE_MAPS_TILE_URL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
