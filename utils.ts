import { PhotoMetadata, DroneSpecs, FlightMetrics } from './types';

// Earth radius in meters
const R = 6371000;

export const toRad = (value: number) => (value * Math.PI) / 180;
export const toDeg = (value: number) => (value * 180) / Math.PI;

// Calculate distance between two lat/lng points in meters (Haversine)
export const calculateDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate bearing between two points (0-360 degrees)
export const calculateBearing = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
  const y = Math.sin(toRad(p2.lng - p1.lng)) * Math.cos(toRad(p2.lat));
  const x = Math.cos(toRad(p1.lat)) * Math.sin(toRad(p2.lat)) -
            Math.sin(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.cos(toRad(p2.lng - p1.lng));
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

// Project Lat/Lon to a local Cartesian plane
export const projectToPlane = (origin: { lat: number; lng: number }, point: { lat: number; lng: number }) => {
  const x = calculateDistance({ lat: origin.lat, lng: origin.lng }, { lat: origin.lat, lng: point.lng }) * (point.lng > origin.lng ? 1 : -1);
  const y = calculateDistance({ lat: origin.lat, lng: origin.lng }, { lat: point.lat, lng: origin.lng }) * (point.lat > origin.lat ? 1 : -1);
  return { x, y };
};

export const calculateStatistics = (values: number[]) => {
  if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev, min, max };
};

// Updated: Accepts marginW and marginH to expand the box by the photo footprint
export const calculateBoundingBoxArea = (photos: PhotoMetadata[], marginW: number = 0, marginH: number = 0) => {
   if (photos.length < 3) return 0;
   const origin = photos[0];
   let minX = 0, maxX = 0, minY = 0, maxY = 0;

   photos.forEach(p => {
      const { x, y } = projectToPlane(origin, p);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
   });

   // The area is the path bounding box extended by half the footprint on each side (total + 1 full width/height)
   // Box width = (Max X - Min X) + Single Photo Width
   const width = (maxX - minX) + marginW;
   const height = (maxY - minY) + marginH;

   return width * height; 
};

export const calculateAverageSpeed = (photos: PhotoMetadata[]) => {
  if (photos.length < 2) return 0;
  const sorted = [...photos].sort((a, b) => a.timestamp - b.timestamp);
  
  let totalDist = 0;
  let totalTime = 0;

  for(let i=0; i<sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i+1];
    const timeDiff = (p2.timestamp - p1.timestamp) / 1000;
    if (timeDiff > 0 && timeDiff < 60) {
       const dist = calculateDistance(p1, p2);
       totalDist += dist;
       totalTime += timeDiff;
    }
  }

  return totalTime > 0 ? totalDist / totalTime : 0;
};

// Calculate Flight Line Curvature (Average heading deviation on straight segments)
export const calculateFlightCurvature = (photos: PhotoMetadata[], excludeTurns: boolean = false) => {
  if (photos.length < 3) return { avg: 0, max: 0, maxPhotoName: null };
  const sorted = [...photos].sort((a, b) => a.timestamp - b.timestamp);
  
  let totalDeviation = 0;
  let count = 0;
  let maxDeviation = 0;
  let maxPhotoName: string | null = null;
  
  // Threshold to consider it a "turn" vs "wiggle"
  // Default logic ignores intentional U-turns (> 20 degrees).
  // If excludeTurns is true, we use a stricter threshold (e.g. > 10 degrees) to ignore entry/exit of turns.
  const turnThreshold = excludeTurns ? 10 : 20;

  for (let i = 0; i < sorted.length - 2; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i+1];
    const p3 = sorted[i+2];
    
    // Only check segments where the drone moved significantly (> 5m)
    const dist1 = calculateDistance(p1, p2);
    const dist2 = calculateDistance(p2, p3);

    if (dist1 > 5 && dist2 > 5) {
      const b1 = calculateBearing(p1, p2);
      const b2 = calculateBearing(p2, p3);
      
      let diff = Math.abs(b1 - b2);
      if (diff > 180) diff = 360 - diff;
      
      // Filter out turns based on threshold
      if (diff < turnThreshold) {
        totalDeviation += diff;
        count++;

        if (diff > maxDeviation) {
          maxDeviation = diff;
          maxPhotoName = p2.name; // The vertex of the angle is P2
        }
      }
    }
  }

  return {
    avg: count > 0 ? totalDeviation / count : 0,
    max: maxDeviation,
    maxPhotoName: maxPhotoName
  };
};

export const calculateOverlaps = (
  photos: PhotoMetadata[],
  drone: DroneSpecs,
  relativeHeight: number
) => {
  const groundWidth = (drone.sensorWidth * relativeHeight) / drone.focalLength;
  const groundHeight = (drone.sensorHeight * relativeHeight) / drone.focalLength;
  
  // Note: GSD calculation assumes a standard pixel count (approx 20MP / 5472px width) as pixel pitch isn't in specs.
  const estimatedGSD = ((drone.sensorWidth / 5472) * (relativeHeight / drone.focalLength) * 100).toFixed(2);

  if (photos.length < 2) return { forward: 0, side: 0, gsd: 0, groundWidth, groundHeight };

  const sortedPhotos = [...photos].sort((a, b) => a.timestamp - b.timestamp);
  let totalForwardOverlap = 0;
  let count = 0;

  for (let i = 0; i < sortedPhotos.length - 1; i++) {
    const p1 = sortedPhotos[i];
    const p2 = sortedPhotos[i + 1];
    const dist = calculateDistance(p1, p2);
    
    if (dist < groundHeight * 2) {
      const overlap = Math.max(0, (1 - (dist / groundHeight)) * 100);
      totalForwardOverlap += overlap;
      count++;
    }
  }

  let totalSideOverlap = 0;
  let sideCount = 0;

  // New Approach: Directional Filtering
  // Only consider photos that are roughly perpendicular to the current flight direction as "side neighbors"
  for (let i = 0; i < sortedPhotos.length; i++) {
    const p1 = sortedPhotos[i];
    
    // Determine current heading
    let heading = 0;
    if (i < sortedPhotos.length - 1) {
       heading = calculateBearing(p1, sortedPhotos[i+1]);
    } else if (i > 0) {
       heading = calculateBearing(sortedPhotos[i-1], p1);
    }

    let minSideDist = Infinity;
    
    for (let j = 0; j < sortedPhotos.length; j++) {
      // 1. Sequence Filter: Ignore immediate neighbors in time (likely same strip)
      if (Math.abs(i - j) < 20) continue; 

      const p2 = sortedPhotos[j];
      const dist = calculateDistance(p1, p2);
      
      // 2. Range Filter: Ignore points too far away (e.g., > 3x ground width)
      if (dist > groundWidth * 3) continue;

      // 3. Angle Filter: Check if the neighbor is actually "to the side"
      const bearingToNeighbor = calculateBearing(p1, p2);
      let angleDiff = Math.abs(heading - bearingToNeighbor);
      if (angleDiff > 180) angleDiff = 360 - angleDiff;

      // Acceptance Window: 45° to 135° (Center at 90°) implies the point is perpendicular
      if (angleDiff > 45 && angleDiff < 135) {
         if (dist < minSideDist) minSideDist = dist;
      }
    }

    if (minSideDist < Infinity) {
       // Side overlap formula: 1 - (Distance / Coverage Width)
       // Clamp between 0 and 100
       const overlap = Math.max(0, Math.min(100, (1 - (minSideDist / groundWidth)) * 100));
       totalSideOverlap += overlap;
       sideCount++;
    }
  }

  return {
    forward: count > 0 ? totalForwardOverlap / count : 0,
    side: sideCount > 0 ? totalSideOverlap / sideCount : 0,
    gsd: parseFloat(estimatedGSD),
    groundWidth,
    groundHeight
  };
};

export const extractRelativeAltitude = (file: File): Promise<number | undefined> => {
  return new Promise((resolve) => {
    // Read the first 64KB which typically contains the XMP metadata header
    const blob = file.slice(0, 64 * 1024);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        resolve(undefined); 
        return;
      }
      
      // Try to find DJI relative altitude
      const regex1 = /drone-dji:RelativeAltitude="([+|-]?\d*\.?\d*)"/i;
      const regex2 = /<drone-dji:RelativeAltitude>([+|-]?\d*\.?\d*)<\/drone-dji:RelativeAltitude>/i;

      const match = text.match(regex1) || text.match(regex2);
      
      if (match && match[1]) {
        resolve(parseFloat(match[1]));
      } else {
        resolve(undefined);
      }
    };
    reader.onerror = () => resolve(undefined);
    reader.readAsText(blob);
  });
};

export const parseMrkContent = (content: string): Map<number, 'FIXED' | 'FLOAT' | 'SINGLE'> => {
  const map = new Map<number, 'FIXED' | 'FLOAT' | 'SINGLE'>();
  const lines = content.split('\n');

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const matchIndex = trimmed.match(/^(\d+)\s+/);
    if (!matchIndex) return;
    const index = parseInt(matchIndex[1], 10);
    let status: 'FIXED' | 'FLOAT' | 'SINGLE' = 'SINGLE';
    if (trimmed.includes('50,Q')) {
      status = 'FIXED';
    } else if (trimmed.includes('20,Q') || trimmed.includes('34,Q')) {
      status = 'FLOAT';
    }
    map.set(index, status);
  });
  return map;
};

export const analyzeImageQuality = (file: File): Promise<{ isBlurry: boolean; blurScore: number; isOverexposed: boolean; exposureScore: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const w = Math.floor(img.width * scale);
      const h = Math.floor(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve({ isBlurry: false, blurScore: 1000, isOverexposed: false, exposureScore: 0 });
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      let overExposedCount = 0;
      const grayData = new Uint8Array(w * h);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        grayData[i / 4] = gray;
        if (r > 250 && g > 250 && b > 250) {
          overExposedCount++;
        }
      }
      const exposureScore = (overExposedCount / (w * h)) * 100;
      const isOverexposed = exposureScore > 15;
      let mean = 0;
      for (let i = 0; i < grayData.length; i++) mean += grayData[i];
      mean /= grayData.length;
      let laplacianMean = 0;
      let laplacianVar = 0;
      const laplacianValues = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          const val = grayData[idx - w] * 1 + grayData[idx - 1] * 1 + grayData[idx] * -4 + grayData[idx + 1] * 1 + grayData[idx + w] * 1;
          laplacianValues.push(val);
          laplacianMean += val;
        }
      }
      laplacianMean /= laplacianValues.length;
      for (let i = 0; i < laplacianValues.length; i++) {
        laplacianVar += Math.pow(laplacianValues[i] - laplacianMean, 2);
      }
      laplacianVar /= laplacianValues.length;
      const isBlurry = laplacianVar < 50; 
      resolve({ isBlurry, blurScore: laplacianVar, isOverexposed, exposureScore });
    };
    img.onerror = () => resolve({ isBlurry: false, blurScore: 1000, isOverexposed: false, exposureScore: 0 });
    img.src = objectUrl;
  });
};

export const parseMarkdown = (markdown: string): string => {
  if (!markdown) return '';
  let html = markdown
    // Convert Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    // Convert Bold
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    // Convert List Items
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    
    // AGGRESSIVELY REMOVE EMPTY LINES
    .replace(/^\s*[\r\n]/gm, '') 
    
    // Convert newlines to HTML breaks (only for actual content breaks)
    .replace(/\n/gim, '<br />');

  // Wrap lists
  if (html.includes('<li>')) {
      html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>'); 
      // Remove double breaks that might appear around lists
      html = html.replace(/<\/ul><br \/><ul>/gim, '');
  }
  
  return html;
};

export const generateFlightPathSVG = (photos: PhotoMetadata[], maxCurvatureName: string | null): string => {
  if (photos.length < 2) return '';

  const sorted = [...photos].sort((a, b) => a.timestamp - b.timestamp);
  const origin = sorted[0];
  
  const points = sorted.map(p => {
    const { x, y } = projectToPlane(origin, p);
    return { x, y, name: p.name, isMaxCurve: p.name === maxCurvatureName };
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const padding = Math.max(20, (maxX - minX) * 0.05);
  minX -= padding; maxX += padding;
  minY -= padding; maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;
  
  const getSvgX = (x: number) => x - minX;
  const getSvgY = (y: number) => maxY - y;

  const polylinePoints = points.map(p => `${getSvgX(p.x)},${getSvgY(p.y)}`).join(' ');

  const circles = points.map((p, i) => {
    const cx = getSvgX(p.x);
    const cy = getSvgY(p.y);
    let fill = '#6366f1';
    let r = 2; 
    
    if (i === 0) { fill = '#10b981'; r = 4; } 
    else if (i === points.length - 1) { fill = '#ef4444'; r = 4; } 
    else if (p.isMaxCurve) { fill = '#ec4899'; r = 6; } 

    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
  }).join('');

  return `
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <polyline points="${polylinePoints}" fill="none" stroke="#94a3b8" stroke-width="1" />
      ${circles}
    </svg>
    <div style="font-size: 10px; color: #64748b; margin-top: 5px; text-align: center;">
      <span style="color: #10b981;">● 起点</span> &nbsp;
      <span style="color: #ef4444;">● 终点</span> &nbsp;
      <span style="color: #6366f1;">● 航点</span> &nbsp;
      <span style="color: #ec4899;">● 最大弯曲点</span>
    </div>
  `;
};

export const generateHtmlReport = (
  metrics: FlightMetrics,
  drone: DroneSpecs,
  photos: PhotoMetadata[], 
  aiReport: string,
  inspectorName: string
) => {
  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const areaMu = (metrics.areaCovered / 666.667).toFixed(2);
  const areaM2 = metrics.areaCovered.toFixed(0);
  const flightPathSvg = generateFlightPathSVG(photos, metrics.maxCurvaturePhotoName);
  const aiHtmlContent = parseMarkdown(aiReport);

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>航测外业成果质检报告</title>
    <style>
        body { font-family: "SimSun", "Songti SC", serif; color: #333; line-height: 1.6; max-width: 210mm; margin: 0 auto; padding: 20px; background: #fff; }
        @media print { 
            body { padding: 0; } 
            .no-print { display: none; } 
            .page-break { page-break-before: always; display: block; height: 1px; } 
            .chart-container { break-inside: avoid; }
        }
        h1 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; font-size: 24px; }
        h2 { border-left: 4px solid #4f46e5; padding-left: 10px; margin-top: 30px; font-size: 18px; background: #f9fafb; padding: 8px 10px; }
        h3 { font-size: 16px; margin-top: 15px; color: #1e1b4b; font-weight: bold; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .info-item { display: flex; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .label { font-weight: bold; width: 120px; color: #555; }
        .value { font-family: Arial, sans-serif; font-weight: bold; }
        
        /* Updated Table Styles for Print */
        table { width: 99%; border-collapse: collapse; margin: 15px 0; table-layout: fixed; }
        th, td { border: 1px solid #000 !important; padding: 8px 12px; text-align: left; word-wrap: break-word; }
        th { background-color: #f3f4f6; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        
        .status-good { color: green; font-weight: bold; }
        .status-bad { color: red; font-weight: bold; }
        .ai-content { background: #fdfdfd; padding: 15px; border: 1px dashed #ccc; font-size: 14px; }
        .ai-content ul { margin: 10px 0; padding-left: 20px; }
        .ai-content li { margin-bottom: 5px; }
        .ai-content strong { color: #4338ca; }
        .footer { margin-top: 50px; border-top: 1px solid #000; padding-top: 20px; display: flex; justify-content: space-between; }
        .sign-box { width: 200px; text-align: center; }
        .copyright { text-align: center; margin-top: 40px; font-size: 12px; color: #888; }
        .chart-container { margin: 20px 0; padding: 10px; border: 1px solid #eee; }
    </style>
</head>
<body>
    <h1>航测外业成果质量检查报告</h1>
    
    <div class="info-grid">
        <div class="info-item"><span class="label">项目名称:</span> <span class="value">无人机航测外业数据</span></div>
        <div class="info-item"><span class="label">作业日期:</span> <span class="value">${metrics.jobDate}</span></div>
        <div class="info-item"><span class="label">开始时间:</span> <span class="value">${metrics.startTime}</span></div>
        <div class="info-item"><span class="label">GPS时间:</span> <span class="value">${metrics.startGpsTime}</span></div>
        <div class="info-item"><span class="label">北斗时间:</span> <span class="value">${metrics.startBdtTime}</span></div>
        <div class="info-item"><span class="label">检查员:</span> <span class="value">${inspectorName || '未填写'}</span></div>
        <div class="info-item"><span class="label">航摄设备:</span> <span class="value">${drone.name}</span></div>
    </div>

    <h2>1. 作业基本参数</h2>
    <table>
        <colgroup>
            <col style="width: 15%">
            <col style="width: 35%">
            <col style="width: 15%">
            <col style="width: 35%">
        </colgroup>
        <tr>
            <th>照片总数</th>
            <td>${photos.length} 张</td>
            <th>作业面积</th>
            <td>${areaM2} m² (${areaMu} 亩)</td>
        </tr>
        <tr>
            <th>平均航高 (Abs)</th>
            <td>${metrics.avgAltitude.toFixed(1)} m</td>
            <th>飞行时长</th>
            <td>${metrics.flightDuration.toFixed(1)} 分钟</td>
        </tr>
        <tr>
            <th>平均航速</th>
            <td>${metrics.avgSpeed.toFixed(1)} m/s</td>
            <th>地面分辨率</th>
            <td>${metrics.groundResolution} cm/px</td>
        </tr>
        <tr>
             <th>单片覆盖 (WxH)</th>
             <td>${metrics.singlePhotoW.toFixed(1)}m × ${metrics.singlePhotoH.toFixed(1)}m</td>
             <th>单片面积</th>
             <td>${metrics.singlePhotoArea.toFixed(0)} m²</td>
        </tr>
        <tr>
             <th>估算地面高程</th>
             <td>${metrics.estTerrainMin.toFixed(1)}m ~ ${metrics.estTerrainMax.toFixed(1)}m</td>
             <th>估算测区高差</th>
             <td>${metrics.estTerrainDiff.toFixed(1)} m</td>
        </tr>
    </table>

    <h2>2. 质量控制指标 (QC Metrics)</h2>
    <table>
        <thead>
            <tr>
                <th>检查项目</th>
                <th>测量值</th>
                <th>参考标准</th>
                <th>评价</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>航向重叠率</td>
                <td>${metrics.avgForwardOverlap.toFixed(0)}%</td>
                <td>≥ 60%</td>
                <td class="${metrics.avgForwardOverlap >= 60 ? 'status-good' : 'status-bad'}">${metrics.avgForwardOverlap >= 60 ? '合格' : '不足'}</td>
            </tr>
            <tr>
                <td>旁向重叠率</td>
                <td>${metrics.avgSideOverlap.toFixed(0)}%</td>
                <td>≥ 30%</td>
                <td class="${metrics.avgSideOverlap >= 30 ? 'status-good' : 'status-bad'}">${metrics.avgSideOverlap >= 30 ? '合格' : '不足'}</td>
            </tr>
            <tr>
                <td>航高一致性 (StdDev)</td>
                <td>±${metrics.altitudeStdDev.toFixed(2)} m</td>
                <td>≤ 5.0m</td>
                <td class="${metrics.altitudeStdDev <= 5 ? 'status-good' : 'status-bad'}">${metrics.altitudeStdDev <= 5 ? '平稳' : '波动大'}</td>
            </tr>
            <tr>
                <td>航线弯曲度 (最大)</td>
                <td>Max: ${metrics.maxFlightLineCurvature.toFixed(2)}° (Avg: ${metrics.flightLineCurvature.toFixed(2)}°)</td>
                <td>≤ 5.0°</td>
                <td class="${metrics.flightLineCurvature <= 5 ? 'status-good' : 'status-bad'}">${metrics.flightLineCurvature <= 5 ? '平直' : '弯曲'}</td>
            </tr>
            <tr>
                <td>RTK 固定解率</td>
                <td>${metrics.rtkFixedRatio === -1 ? 'N/A' : metrics.rtkFixedRatio.toFixed(1) + '%'}</td>
                <td>≥ 95%</td>
                <td class="${metrics.rtkFixedRatio >= 95 ? 'status-good' : 'status-bad'}">
                    ${metrics.rtkFixedRatio === -1 ? '无数据' : (metrics.rtkFixedRatio >= 95 ? '优秀' : '需补控')}
                </td>
            </tr>
             <tr>
                <td>影像画质异常</td>
                <td>${metrics.qualityIssues.blurryCount + metrics.qualityIssues.overexposedCount} 张</td>
                <td>0 张</td>
                <td class="${(metrics.qualityIssues.blurryCount + metrics.qualityIssues.overexposedCount) === 0 ? 'status-good' : 'status-bad'}">
                    ${(metrics.qualityIssues.blurryCount + metrics.qualityIssues.overexposedCount) === 0 ? '正常' : '异常'}
                </td>
            </tr>
        </tbody>
    </table>

    <h2>3. 外业航线还原图</h2>
    <div class="chart-container">
       ${flightPathSvg}
    </div>

    <!-- PAGE BREAK FOR PRINTING -->
    <div class="page-break"></div>

    <h2>4. 智能分析结论</h2>
    <div class="ai-content">
        ${aiHtmlContent || '暂无详细分析报告。'}
    </div>

    <div class="footer">
        <div class="sign-box">
            <p>检查单位 (盖章)</p>
        </div>
        <div class="sign-box">
            <p>检查员签字: ________________</p>
        </div>
        <div class="sign-box">
            <p>日期: ${dateStr}</p>
        </div>
    </div>

    <div class="copyright">
        宁夏建院航测王老师
    </div>
</body>
</html>
  `;
};