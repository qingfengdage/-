
import { DroneSpecs, AIModelConfig } from './types';

// Common Drone Presets for Photogrammetry
export const DRONE_PRESETS: DroneSpecs[] = [
  { name: 'DJI Mavic 3 Enterprise (Wide)', sensorWidth: 17.3, sensorHeight: 13.0, focalLength: 12.29 }, // 4/3 CMOS
  { name: 'DJI Phantom 4 RTK', sensorWidth: 13.2, sensorHeight: 8.8, focalLength: 8.8 }, // 1 inch
  { name: 'DJI Matrice 300 (P1)', sensorWidth: 35.9, sensorHeight: 24.0, focalLength: 35 }, // Full frame, typical 35mm lens
  { name: 'DJI Mini 3 Pro', sensorWidth: 9.84, sensorHeight: 7.38, focalLength: 6.7 }, // 1/1.3 inch
  { name: 'Custom / Unknown', sensorWidth: 13.2, sensorHeight: 8.8, focalLength: 8.8 }, // Default to 1 inch
];

export const GOOGLE_MAPS_TILE_URL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

export const APP_CONFIG = {
  defaultTitle: "航测外业成果质量检测助手",
  defaultCopyright: "版权所有@B站清风搞名堂",
  bilibiliLink: "https://space.bilibili.com/414317872?spm_id_from=333.1007.0.0",
  // Default API Key from environment or empty string
  defaultApiKey: typeof process !== 'undefined' && process.env && process.env.API_KEY ? process.env.API_KEY : ""
};

export const DEFAULT_AI_CONFIGS: AIModelConfig[] = [
  {
    id: 'default-google',
    name: 'Google Gemini (默认)',
    provider: 'google',
    apiKey: APP_CONFIG.defaultApiKey,
    model: 'gemini-2.5-flash'
  },
  {
    id: 'preset-deepseek',
    name: 'DeepSeek V3 (推荐)',
    provider: 'openai',
    apiKey: '',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com'
  },
  {
    id: 'custom-openai-example',
    name: 'OpenAI 兼容接口 (自定义)',
    provider: 'openai',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    baseUrl: 'https://api.openai.com/v1'
  }
];
