import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip } from 'recharts';
import { PhotoMetadata } from '../types';
import { projectToPlane, calculateBearing, calculateDistance } from '../utils';

interface FlightVisualizerProps {
  photos: PhotoMetadata[];
  highlightPhotoName?: string | null;
  excludeTurns?: boolean;
  onToggleExcludeTurns?: (val: boolean) => void;
}

export const FlightVisualizer: React.FC<FlightVisualizerProps> = ({ 
  photos, 
  highlightPhotoName,
  excludeTurns = false,
  onToggleExcludeTurns
}) => {
  // Compute data with "isTurn" flag
  const data = useMemo(() => {
    if (photos.length === 0) return [];
    
    // Sort by timestamp
    const sortedPhotos = [...photos].sort((a, b) => a.timestamp - b.timestamp);
    const origin = sortedPhotos[0];
    
    // 1. Identify turn points logic (similar to utils.ts but applied per point for visual filtering)
    // We'll mark points as "hidden" if they are part of a sharp turn and excludeTurns is on.
    const turnPoints = new Set<string>();
    
    if (excludeTurns) {
        for (let i = 0; i < sortedPhotos.length - 2; i++) {
            const p1 = sortedPhotos[i];
            const p2 = sortedPhotos[i+1];
            const p3 = sortedPhotos[i+2];
            
            const dist1 = calculateDistance(p1, p2);
            const dist2 = calculateDistance(p2, p3);

            if (dist1 > 5 && dist2 > 5) {
                const b1 = calculateBearing(p1, p2);
                const b2 = calculateBearing(p2, p3);
                let diff = Math.abs(b1 - b2);
                if (diff > 180) diff = 360 - diff;
                
                // If angle change > 15 degrees, mark P2 as a turn point
                if (diff > 15) {
                    turnPoints.add(p2.name);
                    // Also mark neighbors to clean up the curve visual
                    turnPoints.add(p1.name);
                    turnPoints.add(p3.name);
                }
            }
        }
    }

    return sortedPhotos.map((p, index) => {
      const { x, y } = projectToPlane(origin, p);
      const isTurn = turnPoints.has(p.name);
      
      return { 
        x: Math.round(x), 
        y: Math.round(y), 
        z: Math.round(p.alt), 
        name: p.name,
        seq: index + 1, 
        accuracy: p.gpsAccuracy,
        rtk: p.rtkStatus,
        isTurn // Flag to hide/dim
      };
    });
  }, [photos, excludeTurns]);

  const adaptiveDotRadius = useMemo(() => {
    const count = photos.length;
    if (count === 0) return 3;
    if (count < 50) return 3;
    if (count < 150) return 2;
    if (count < 500) return 1.2;
    if (count < 1000) return 0.8;
    return 0.4;
  }, [photos.length]);

  const [dotSize, setDotSize] = useState<number>(adaptiveDotRadius);

  useEffect(() => {
    setDotSize(adaptiveDotRadius);
  }, [adaptiveDotRadius]);

  const adjustSize = (delta: number) => {
    setDotSize(prev => Math.max(0.1, Math.min(20, parseFloat((prev + delta).toFixed(1)))));
  };

  const renderDot = (props: any) => {
    const { cx, cy, payload } = props;
    
    // If excluding turns and this is a turn point, hide it or make it very faint
    if (excludeTurns && payload.isTurn) {
        return null; // Completely hide
    }

    const isHighlight = payload.name === highlightPhotoName;
    const isStart = payload.seq === 1;
    const isEnd = payload.seq === data.length;

    let fill = '#6366f1'; 
    if (isStart) fill = '#10b981'; 
    else if (isEnd) fill = '#ef4444'; 
    else if (payload.rtk && payload.rtk !== 'FIXED') fill = '#f59e0b'; 

    if (isHighlight) {
        return (
            <svg x={cx - 10} y={cy - 10} width={20} height={20} className="overflow-visible">
                 <circle cx="10" cy="10" r={Math.max(6, dotSize * 2)} fill="#ec4899" className="animate-pulse" />
                 <circle cx="10" cy="10" r={Math.max(6, dotSize * 2)} fill="none" stroke="white" strokeWidth={2} />
            </svg>
        );
    }

    const r = (isStart || isEnd) ? Math.max(3, dotSize * 1.5) : dotSize;
    return <circle cx={cx} cy={cy} r={r} fill={fill} stroke="none" />;
  };

  if (photos.length === 0) return null;

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center shrink-0">
          <svg className="w-5 h-5 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-1.447-.894L15 7m0 13V7m0 0L9 4" />
          </svg>
          外业航线还原图
        </h3>
        
        <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto justify-end">
             {/* Exclude Turns Checkbox - Moved Inside to avoid layout issues */}
             {onToggleExcludeTurns && (
                <label className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={excludeTurns}
                        onChange={(e) => onToggleExcludeTurns(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-3 w-3" 
                    />
                    <span>排除转弯 (&gt;15°)</span>
                </label>
             )}

             {/* Manual Size Control */}
             <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                <span className="text-xs text-slate-500 font-medium px-2">点大小</span>
                <button 
                  onClick={() => adjustSize(-0.1)}
                  className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600 active:scale-95 transition-transform"
                >
                  -
                </button>
                <div className="w-16 px-2 flex items-center">
                    <input 
                        type="range" 
                        min="0.1" 
                        max="10" 
                        step="0.1" 
                        value={dotSize} 
                        onChange={(e) => setDotSize(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                </div>
                <button 
                  onClick={() => adjustSize(0.1)}
                  className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600 active:scale-95 transition-transform"
                >
                  +
                </button>
            </div>
        </div>
      </div>
      
      <div className="h-[450px] w-full bg-slate-50 rounded-lg overflow-hidden relative border border-slate-100">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <XAxis type="number" dataKey="x" name="East(m)" unit="m" tickLine={false} axisLine={false} tick={{fontSize: 10, fill: '#cbd5e1'}} />
            <YAxis type="number" dataKey="y" name="North(m)" unit="m" tickLine={false} axisLine={false} tick={{fontSize: 10, fill: '#cbd5e1'}} />
            <ZAxis type="number" dataKey="z" range={[0, 0]} name="Altitude" unit="m" />
            <Tooltip 
              cursor={{ strokeDasharray: '3 3' }} 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white/95 backdrop-blur p-2 border border-slate-200 shadow-xl rounded text-xs z-50">
                      <p className="font-bold mb-1 text-slate-800">{d.name}</p>
                      <div className="space-y-1">
                        <p className="text-slate-600">Seq: #{d.seq}</p>
                        <p className="text-indigo-600 font-mono">Alt: {d.z}m</p>
                        {d.isTurn && <p className="text-red-500 font-bold">转弯点 (隐藏)</p>}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter 
              name="Flight Path" 
              data={data} 
              line={{ stroke: '#64748b', strokeWidth: 1, strokeOpacity: 0.3 }} 
              lineType="joint"
              shape={renderDot}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-400 mt-2 text-center">
        * 蓝色散点代表 Fixed 解，黄色代表非 Fixed 解，粉色大点代表航线最大弯曲位置
      </p>
    </div>
  );
};