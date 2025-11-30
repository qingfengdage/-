import React, { useState, useMemo, useEffect } from 'react';
import { PhotoUploader } from './components/PhotoUploader';
import { FlightVisualizer } from './components/FlightVisualizer';
import { SettingsModal } from './components/SettingsModal';
import { DRONE_PRESETS, APP_CONFIG, DEFAULT_AI_CONFIGS } from './constants';
import { PhotoMetadata, DroneSpecs, FlightMetrics, AnalysisStatus, AIModelConfig } from './types';
import { calculateOverlaps, calculateStatistics, calculateBoundingBoxArea, calculateAverageSpeed, analyzeImageQuality, calculateFlightCurvature, generateHtmlReport } from './utils';
import { analyzeFlightData } from './services/geminiService';

const App: React.FC = () => {
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  // Use state for drones to support custom additions
  const [drones, setDrones] = useState<DroneSpecs[]>(DRONE_PRESETS);
  const [selectedDrone, setSelectedDrone] = useState<DroneSpecs>(DRONE_PRESETS[0]);
  
  const [flightHeight, setFlightHeight] = useState<number>(100); 
  const [excludeTurns, setExcludeTurns] = useState<boolean>(false); // New state for turn exclusion

  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [inspectorName, setInspectorName] = useState<string>('');

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiConfigs, setAiConfigs] = useState<AIModelConfig[]>(DEFAULT_AI_CONFIGS);
  const [selectedConfigId, setSelectedConfigId] = useState<string>(DEFAULT_AI_CONFIGS[0].id);

  // Load settings (AI & Drones) from localStorage
  useEffect(() => {
    // 1. Load AI Configs
    const savedConfigs = localStorage.getItem('drone_check_ai_configs');
    const savedSelectedId = localStorage.getItem('drone_check_selected_config_id');
    
    if (savedConfigs) {
      try {
        const parsed = JSON.parse(savedConfigs);
        if (Array.isArray(parsed) && parsed.length > 0) {
           setAiConfigs(parsed);
        }
      } catch (e) { console.error("Failed to parse saved configs", e); }
    }
    
    if (savedSelectedId) {
      setSelectedConfigId(savedSelectedId);
    }

    // 2. Load Custom Drones
    const savedDrones = localStorage.getItem('drone_check_drones');
    if (savedDrones) {
        try {
            const parsedDrones = JSON.parse(savedDrones);
            if (Array.isArray(parsedDrones) && parsedDrones.length > 0) {
                setDrones(parsedDrones);
                // Also update selected drone if it's not in the default list anymore (optional logic, keeping simple for now)
                if (!parsedDrones.find(d => d.name === selectedDrone.name)) {
                    setSelectedDrone(parsedDrones[0]);
                }
            }
        } catch (e) { console.error("Failed to parse saved drones", e); }
    }
  }, []);

  // Auto-fill Flight Height if relative altitude is available from XMP
  useEffect(() => {
    if (photos.length > 0) {
      const validRelAlts = photos.map(p => p.relativeAlt).filter(a => a !== undefined && a > 2) as number[];
      if (validRelAlts.length > 0) {
        const avg = validRelAlts.reduce((a, b) => a + b, 0) / validRelAlts.length;
        setFlightHeight(Math.round(avg));
      }
    }
  }, [photos]);

  // Save selection change
  const handleConfigSelect = (id: string) => {
    setSelectedConfigId(id);
    localStorage.setItem('drone_check_selected_config_id', id);
  }

  // Image Quality Analysis State
  const [qualityCheckProgress, setQualityCheckProgress] = useState<number>(0);
  const [isCheckingQuality, setIsCheckingQuality] = useState(false);

  const metrics = useMemo<FlightMetrics | null>(() => {
    if (photos.length < 2) return null;

    const overlapData = calculateOverlaps(photos, selectedDrone, flightHeight);
    const altitudes = photos.map(p => p.alt);
    const altStats = calculateStatistics(altitudes);
    
    const area = calculateBoundingBoxArea(photos, overlapData.groundWidth, overlapData.groundHeight);
    
    const sorted = [...photos].sort((a, b) => a.timestamp - b.timestamp);
    const durationMs = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
    const speed = calculateAverageSpeed(photos);
    
    // Pass excludeTurns to curvature calculation
    const curvatureData = calculateFlightCurvature(photos, excludeTurns);
    
    const relAlts = photos.map(p => p.relativeAlt).filter(a => a !== undefined) as number[];
    const avgRelAlt = relAlts.length > 0 ? relAlts.reduce((a, b) => a + b, 0) / relAlts.length : undefined;

    const fixedCount = photos.filter(p => p.rtkStatus === 'FIXED').length;
    const rtkFixedRatio = photos[0].rtkStatus ? (fixedCount / photos.length) * 100 : -1;

    const blurryCount = photos.filter(p => p.imageQuality?.isBlurry).length;
    const overexposedCount = photos.filter(p => p.imageQuality?.isOverexposed).length;

    const firstPhoto = sorted[0];
    const timestamp = firstPhoto.timestamp;
    const jobDate = new Date(timestamp).toLocaleDateString('zh-CN');
    const startTime = new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    
    const gpsTimeDate = new Date(timestamp + 18000);
    const startGpsTime = gpsTimeDate.toISOString().substring(11, 19);
    
    const bdtTimeDate = new Date(timestamp + 4000);
    const startBdtTime = bdtTimeDate.toISOString().substring(11, 19);

    const singleArea = overlapData.groundWidth * overlapData.groundHeight;
    const estTerrainAlts = altitudes.map(alt => alt - flightHeight);
    const terrainStats = calculateStatistics(estTerrainAlts);

    return {
      avgAltitude: altStats.mean,
      altitudeStdDev: altStats.stdDev,
      minAltitude: altStats.min,
      maxAltitude: altStats.max,
      avgRelativeAltitude: avgRelAlt,
      avgForwardOverlap: overlapData.forward,
      avgSideOverlap: overlapData.side,
      groundResolution: overlapData.gsd,
      areaCovered: area, 
      flightDuration: durationMs / 1000 / 60,
      avgSpeed: speed,
      flightLineCurvature: curvatureData.avg,
      maxFlightLineCurvature: curvatureData.max,
      maxCurvaturePhotoName: curvatureData.maxPhotoName,
      rtkFixedRatio,
      qualityIssues: {
        blurryCount,
        overexposedCount
      },
      jobDate,
      startTime,
      startGpsTime,
      startBdtTime,
      singlePhotoW: overlapData.groundWidth,
      singlePhotoH: overlapData.groundHeight,
      singlePhotoArea: singleArea,
      estTerrainMax: terrainStats.max,
      estTerrainMin: terrainStats.min,
      estTerrainDiff: terrainStats.max - terrainStats.min
    };
  }, [photos, selectedDrone, flightHeight, excludeTurns]); 

  const handleAnalysis = async () => {
    if (!metrics) return;
    const activeConfig = aiConfigs.find(c => c.id === selectedConfigId);
    if (!activeConfig) {
      alert("请先选择一个有效的 AI 模型配置");
      return;
    }
    if (!activeConfig.apiKey) {
      setIsSettingsOpen(true);
      alert("所选模型缺少 API Key，请在设置中配置。");
      return;
    }

    setAnalysisStatus(AnalysisStatus.ANALYZING);
    try {
      const warnings: string[] = [];
      if (metrics.avgForwardOverlap < 60) warnings.push("航向重叠率严重不足 (<60%)，空三易断裂");
      if (metrics.avgSideOverlap < 30) warnings.push("旁向重叠率不足 (<30%)，可能导致建图漏洞");
      if (metrics.altitudeStdDev > 5) warnings.push(`航高波动大 (StdDev: ${metrics.altitudeStdDev.toFixed(1)}m)`);
      if (metrics.flightLineCurvature > 5) warnings.push(`航线弯曲明显 (平均: ${metrics.flightLineCurvature.toFixed(1)}°, 最大: ${metrics.maxFlightLineCurvature.toFixed(1)}°)`);
      if (metrics.avgSpeed > 15) warnings.push(`飞行速度过快 (${metrics.avgSpeed.toFixed(1)} m/s)`);
      if (metrics.rtkFixedRatio >= 0 && metrics.rtkFixedRatio < 95) warnings.push(`POS固定解比例低 (${metrics.rtkFixedRatio.toFixed(1)}%)，控制点需加密`);
      if (metrics.qualityIssues.blurryCount > 0) warnings.push(`检测到 ${metrics.qualityIssues.blurryCount} 张模糊照片`);
      if (metrics.qualityIssues.overexposedCount > 0) warnings.push(`检测到 ${metrics.qualityIssues.overexposedCount} 张过曝照片`);

      const report = await analyzeFlightData(metrics, selectedDrone, photos.length, warnings, activeConfig);
      setAiReport(report);
      setAnalysisStatus(AnalysisStatus.COMPLETED);
    } catch (e: any) {
      setAiReport(`分析失败: ${e.message}`);
      setAnalysisStatus(AnalysisStatus.ERROR);
    }
  };

  const runQualityCheck = async () => {
    if (isCheckingQuality || photos.length === 0) return;
    setIsCheckingQuality(true);
    setQualityCheckProgress(0);

    const updatedPhotos = [...photos];
    for (let i = 0; i < updatedPhotos.length; i++) {
       if (updatedPhotos[i].file) {
          const result = await analyzeImageQuality(updatedPhotos[i].file!);
          updatedPhotos[i].imageQuality = { ...result, analyzed: true };
          if (i % 5 === 0 || i === updatedPhotos.length - 1) {
             setPhotos([...updatedPhotos]);
             setQualityCheckProgress(Math.round(((i + 1) / updatedPhotos.length) * 100));
          }
       }
    }
    setIsCheckingQuality(false);
  };

  const handleDownloadReport = () => {
    if (!metrics || !aiReport) return;
    const htmlContent = generateHtmlReport(metrics, selectedDrone, photos, aiReport, inspectorName);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `外业质检报告_${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 flex flex-col">
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        configs={aiConfigs}
        setConfigs={setAiConfigs}
        selectedConfigId={selectedConfigId}
        setSelectedConfigId={handleConfigSelect}
        // Drone Configs Props
        drones={drones}
        setDrones={setDrones}
      />

      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 flex items-baseline flex-wrap gap-1">
              {APP_CONFIG.defaultTitle} 
              <span className="text-xs text-slate-400 font-medium tracking-wide">PRO</span>
              <span className="text-sm text-slate-500 font-normal">（宁夏建院航测王老师）</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {metrics && (
               <div className="hidden md:flex items-center space-x-4 text-sm font-medium text-slate-600">
                  <span className="bg-slate-100 px-3 py-1 rounded-full text-xs font-mono">{photos.length} Photos</span>
                  <span className="bg-slate-100 px-3 py-1 rounded-full text-xs font-mono">{metrics.flightDuration.toFixed(1)} Min</span>
                  <span className="bg-slate-100 px-3 py-1 rounded-full text-xs font-mono">{(metrics.areaCovered / 1000000).toFixed(4)} km²</span>
               </div>
            )}
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors relative"
              title="设置 / 配置 AI Key"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              {!aiConfigs.find(c => c.apiKey) && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
        {photos.length === 0 && (
          <div className="text-center mb-10 py-10">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">{APP_CONFIG.defaultTitle}</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
              支持读取 <span className="font-bold text-indigo-600">JPG</span> 影像与 <span className="font-bold text-indigo-600">.MRK</span> POS数据，一键生成重叠率、RTK状态及画质分析报告。
            </p>
          </div>
        )}

        <PhotoUploader onPhotosProcessed={setPhotos} isProcessing={isCheckingQuality} />

        {photos.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            <div className="lg:col-span-2 space-y-6">
              
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-end">
                 <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">机型 / 传感器</label>
                    <select 
                      className="w-full rounded-lg border-slate-300 border p-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                      value={selectedDrone.name}
                      onChange={(e) => {
                        const drone = drones.find(d => d.name === e.target.value);
                        if(drone) setSelectedDrone(drone);
                      }}
                    >
                      {drones.map(d => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                 </div>
                 <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      设计相对航高 (米)
                      {metrics?.avgRelativeAltitude && (
                        <span className="ml-2 text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100 font-normal">
                          已自动提取
                        </span>
                      )}
                    </label>
                    <input 
                      type="number" 
                      value={flightHeight}
                      onChange={(e) => setFlightHeight(Number(e.target.value))}
                      className="w-full rounded-lg border-slate-300 border p-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                 </div>
              </div>

              {/* Flight Visualizer - Passed props for excludeTurns control */}
              <FlightVisualizer 
                  photos={photos} 
                  highlightPhotoName={metrics?.maxCurvaturePhotoName}
                  excludeTurns={excludeTurns}
                  onToggleExcludeTurns={setExcludeTurns}
              />

              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">作业参数概览</h3>
                  {/* ... (Metrics Grid - Unchanged) ... */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                      <div>
                        <div className="text-xs text-slate-500">作业日期</div>
                        <div className="font-bold text-slate-700">{metrics?.jobDate}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">开始时间</div>
                        <div className="font-bold text-slate-700">{metrics?.startTime}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">GPS 时间</div>
                        <div className="font-bold text-indigo-700 font-mono text-sm mt-0.5">{metrics?.startGpsTime}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">北斗 (BDT) 时间</div>
                        <div className="font-bold text-indigo-700 font-mono text-sm mt-0.5">{metrics?.startBdtTime}</div>
                      </div>
                  </div>

                  {/* 新增单片覆盖与高程估算栏 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center mb-4 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                      <div>
                        <div className="text-xs text-slate-500">单片覆盖 (长x宽)</div>
                        <div className="font-bold text-slate-700">
                           {metrics?.singlePhotoW.toFixed(1)}m × {metrics?.singlePhotoH.toFixed(1)}m
                        </div>
                        <div className="text-[10px] text-slate-400">
                            面积: {metrics?.singlePhotoArea.toFixed(0)} m²
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">估算测区地面高程范围</div>
                        <div className="font-bold text-slate-700">
                          {metrics?.estTerrainMin.toFixed(1)}m ~ {metrics?.estTerrainMax.toFixed(1)}m
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">估算测区地面高差</div>
                        <div className="font-bold text-emerald-700 text-lg">
                           {metrics?.estTerrainDiff.toFixed(1)} <span className="text-xs font-normal">m</span>
                        </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-xs text-slate-500">地面分辨率 (GSD)</div>
                          <div className="font-bold text-slate-800 text-lg">{metrics?.groundResolution} <span className="text-xs font-normal">cm</span></div>
                      </div>
                      
                      {/* 作业面积：平方米和亩 */}
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-center">
                          <div className="text-xs text-slate-500">作业面积</div>
                          <div className="font-bold text-slate-800 text-sm">
                             {metrics?.areaCovered.toFixed(0)} <span className="text-xs font-normal">m²</span>
                          </div>
                          <div className="text-xs text-indigo-600 font-medium">
                             {(metrics?.areaCovered ? metrics.areaCovered / 666.667 : 0).toFixed(2)} 亩
                          </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-xs text-slate-500">POS 固定解率</div>
                          <div className={`font-bold text-lg ${metrics && metrics.rtkFixedRatio < 95 ? 'text-red-500' : 'text-emerald-600'}`}>
                              {metrics?.rtkFixedRatio === -1 ? <span className="text-slate-400 text-sm font-normal">无数据</span> : metrics?.rtkFixedRatio.toFixed(1) + '%'}
                          </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-center">
                          <div className="text-xs text-slate-500">平均绝对航高 (ASL)</div>
                          <div className="font-bold text-slate-800 text-sm">
                             {metrics?.avgAltitude.toFixed(1)} m
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                             提取相对: {metrics?.avgRelativeAltitude ? metrics.avgRelativeAltitude.toFixed(1) + 'm' : 'N/A'}
                          </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-xs text-slate-500">最大航线弯曲</div>
                          <div className={`font-bold text-lg ${metrics && metrics.maxFlightLineCurvature > 5 ? 'text-amber-500' : 'text-slate-800'}`}>
                             {metrics?.maxFlightLineCurvature.toFixed(1)}°
                          </div>
                      </div>
                  </div>
              </div>
            </div>

            <div className="space-y-6">
              {metrics && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                   <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                     关键质量指标 (Key KPIs)
                   </h3>
                   <div className="space-y-6">
                      
                      <div>
                        <div className="flex justify-between items-end mb-1">
                          <span className="text-sm font-medium text-slate-700">航向重叠率 (Forward)</span>
                          <span className={`text-lg font-bold ${metrics.avgForwardOverlap < 60 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {metrics.avgForwardOverlap.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-500 ${metrics.avgForwardOverlap < 60 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, metrics.avgForwardOverlap)}%` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-end mb-1">
                          <span className="text-sm font-medium text-slate-700">旁向重叠率 (Side)</span>
                          <span className={`text-lg font-bold ${metrics.avgSideOverlap < 30 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {metrics.avgSideOverlap.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-500 ${metrics.avgSideOverlap < 30 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, metrics.avgSideOverlap)}%` }}></div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">影像画质检测 (Deep Analysis)</h4>
                        {!isCheckingQuality && qualityCheckProgress === 0 ? (
                           <button 
                             onClick={runQualityCheck}
                             className="w-full py-2 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg text-sm font-medium transition-colors"
                           >
                             开始深度画质分析 (耗时)
                           </button>
                        ) : (
                           <div>
                              <div className="flex justify-between text-xs mb-1">
                                 <span>分析进度</span>
                                 <span>{qualityCheckProgress}%</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3">
                                <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${qualityCheckProgress}%` }}></div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div className={`p-2 rounded bg-slate-50 border ${metrics.qualityIssues.overexposedCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-100'}`}>
                                      <span className="text-xs text-slate-500 block">过曝</span>
                                      <span className="font-bold">{metrics.qualityIssues.overexposedCount} 张</span>
                                  </div>
                                  <div className={`p-2 rounded bg-slate-50 border ${metrics.qualityIssues.blurryCount > 0 ? 'border-red-200 bg-red-50' : 'border-slate-100'}`}>
                                      <span className="text-xs text-slate-500 block">模糊</span>
                                      <span className="font-bold">{metrics.qualityIssues.blurryCount} 张</span>
                                  </div>
                              </div>
                           </div>
                        )}
                      </div>

                   </div>
                </div>
              )}

               {metrics && (
                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">POS & 数据检查</h4>
                  <ul className="space-y-2 text-xs text-slate-600">
                     <li className="flex items-start">
                      <span className={`mr-2 ${metrics.rtkFixedRatio < 95 && metrics.rtkFixedRatio !== -1 ? 'text-red-500' : 'text-emerald-500'}`}>●</span>
                      <span>
                          <strong className="text-slate-800">POS 完整性:</strong> 
                          {metrics.rtkFixedRatio === -1 
                            ? " 未检测到 .MRK 文件，仅有单点GPS。" 
                            : ` 固定解 (Fixed) 占比 ${metrics.rtkFixedRatio.toFixed(1)}%。`
                          }
                      </span>
                    </li>
                     <li className="flex items-start">
                      <span className={`mr-2 ${metrics.flightLineCurvature > 5 ? 'text-amber-500' : 'text-indigo-500'}`}>●</span>
                      <span>
                          <strong className="text-slate-800">航线弯曲度:</strong> {metrics.flightLineCurvature.toFixed(2)}° (最大: {metrics.maxFlightLineCurvature.toFixed(1)}°)
                          {metrics.flightLineCurvature > 5 ? " (需注意侧风影响)" : " (飞行平直)"}
                      </span>
                    </li>
                  </ul>
                </div>
               )}

              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-xl">
                <div className="flex items-start gap-3 mb-4">
                   <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                   </div>
                   <div>
                     <h3 className="font-bold text-lg">外业成果验收报告</h3>
                     <p className="text-slate-400 text-xs">AI 总工智能分析</p>
                   </div>
                </div>

                {analysisStatus === AnalysisStatus.IDLE && (
                   <div className="space-y-3">
                     <select 
                       value={selectedConfigId}
                       onChange={(e) => handleConfigSelect(e.target.value)}
                       className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                     >
                        {aiConfigs.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.model})</option>
                        ))}
                     </select>
                     <button 
                       onClick={handleAnalysis}
                       disabled={isCheckingQuality}
                       className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg text-sm flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                       {isCheckingQuality ? '等待画质分析完成...' : '生成质检报告'}
                     </button>
                   </div>
                )}

                {analysisStatus === AnalysisStatus.ANALYZING && (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mb-2"></div>
                    <div className="text-sm font-medium text-slate-300">正在综合 POS、重叠率与画质数据...</div>
                  </div>
                )}

                {analysisStatus === AnalysisStatus.COMPLETED && aiReport && (
                  <div className="space-y-4">
                     <div className="bg-white/5 rounded-lg p-4 text-sm leading-relaxed border border-white/10 max-h-64 overflow-y-auto custom-scrollbar">
                        <div className="prose prose-invert prose-sm">
                           <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-slate-300">{aiReport}</pre>
                        </div>
                     </div>
                     
                     <div className="pt-2 border-t border-white/10">
                        <label className="block text-xs text-slate-400 mb-1">检查员签字</label>
                        <input 
                           type="text" 
                           placeholder="输入您的姓名..."
                           value={inspectorName}
                           onChange={(e) => setInspectorName(e.target.value)}
                           className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 mb-3"
                        />
                        <button 
                           onClick={handleDownloadReport}
                           className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition-all text-sm flex justify-center items-center gap-2"
                        >
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                           导出报告 (HTML/PDF打印)
                        </button>
                     </div>
                  </div>
                )}
                 {analysisStatus === AnalysisStatus.ERROR && (
                    <div className="bg-red-500/20 p-3 rounded text-sm text-red-200 mt-2 border border-red-500/30">
                        {aiReport}
                        <button onClick={handleAnalysis} className="block mt-2 underline hover:text-white">重试</button>
                    </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 底部版权信息 */}
      <footer className="w-full bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="text-center text-slate-500 text-xs font-medium">
          <a 
            href={APP_CONFIG.bilibiliLink}
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-indigo-600 hover:underline transition-all"
          >
            {APP_CONFIG.defaultCopyright}
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;