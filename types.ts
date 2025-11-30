
export interface PhotoMetadata {
  id: string;
  name: string;
  lat: number;
  lng: number;
  alt: number; // Absolute altitude
  relativeAlt?: number; // Relative altitude from XMP
  timestamp: number;
  gpsAccuracy?: number; // GPS Positioning Error (meters)
  rtkStatus?: 'FIXED' | 'FLOAT' | 'SINGLE' | 'NONE'; // From .MRK file
  imageQuality?: {
    isBlurry: boolean;
    blurScore: number; // Variance of Laplacian
    isOverexposed: boolean;
    exposureScore: number; // Bright pixel ratio
    analyzed: boolean;
  };
  file?: File; // Keep reference for pixel analysis
}

export interface DroneSpecs {
  name: string;
  sensorWidth: number; // mm
  sensorHeight: number; // mm
  focalLength: number; // mm
}

export interface FlightMetrics {
  avgAltitude: number;
  altitudeStdDev: number;
  minAltitude: number;
  maxAltitude: number;
  avgRelativeAltitude?: number; // Average extracted relative altitude
  avgForwardOverlap: number;
  avgSideOverlap: number;
  groundResolution: number;
  areaCovered: number; // In square meters
  flightDuration: number;
  avgSpeed: number;
  flightLineCurvature: number; // Average heading deviation in degrees on straight segments
  maxFlightLineCurvature: number; // Max deviation found
  maxCurvaturePhotoName: string | null; // Name of the photo at the max deviation turn
  rtkFixedRatio: number; // 0 to 100 percentage
  qualityIssues: {
    blurryCount: number;
    overexposedCount: number;
  };
  // Time Information
  jobDate: string;
  startTime: string;
  startGpsTime: string;
  startBdtTime: string;
  // Single Photo & Terrain Stats
  singlePhotoW: number; // Ground Width in meters
  singlePhotoH: number; // Ground Height in meters
  singlePhotoArea: number; // Ground Area in sq meters
  estTerrainMax: number; // Estimated Max Terrain Height
  estTerrainMin: number; // Estimated Min Terrain Height
  estTerrainDiff: number; // Estimated Terrain Difference
}

export enum AnalysisStatus {
  IDLE,
  ANALYZING,
  COMPLETED,
  ERROR
}

export interface AIModelConfig {
  id: string;
  name: string; // Display Name (e.g., "My Gemini", "DeepSeek")
  provider: 'google' | 'openai';
  apiKey: string;
  model: string; // Model ID (e.g., "gemini-2.5-flash", "gpt-4")
  baseUrl?: string; // Only for OpenAI compatible
}
