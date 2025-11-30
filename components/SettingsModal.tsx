import React, { useState } from 'react';
import { AIModelConfig, DroneSpecs } from '../types';
import { DEFAULT_AI_CONFIGS, DRONE_PRESETS } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // AI Configs
  configs: AIModelConfig[];
  setConfigs: (configs: AIModelConfig[]) => void;
  selectedConfigId: string;
  setSelectedConfigId: (id: string) => void;
  // Drone Configs
  drones: DroneSpecs[];
  setDrones: (drones: DroneSpecs[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, onClose, 
  configs, setConfigs, selectedConfigId, setSelectedConfigId,
  drones, setDrones
}) => {
  const [mainTab, setMainTab] = useState<'ai' | 'drones'>('ai');
  
  // AI Tab State
  const [aiSubTab, setAiSubTab] = useState<'list' | 'add'>('list');
  const [newConfig, setNewConfig] = useState<Partial<AIModelConfig>>({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1'
  });

  // Drone Tab State
  const [droneSubTab, setDroneSubTab] = useState<'list' | 'add'>('list');
  const [newDrone, setNewDrone] = useState<Partial<DroneSpecs>>({
    name: '', sensorWidth: 0, sensorHeight: 0, focalLength: 0
  });

  if (!isOpen) return null;

  // --- AI Handlers ---
  const handleAddAI = () => {
    if (!newConfig.name || !newConfig.apiKey || !newConfig.model) {
      alert("请填写所有必填项 (名称, Key, 模型)");
      return;
    }
    const config: AIModelConfig = {
      id: Date.now().toString(),
      name: newConfig.name!,
      provider: newConfig.provider as 'google' | 'openai',
      apiKey: newConfig.apiKey!,
      model: newConfig.model!,
      baseUrl: newConfig.baseUrl
    };
    const updated = [...configs, config];
    setConfigs(updated);
    localStorage.setItem('drone_check_ai_configs', JSON.stringify(updated));
    setAiSubTab('list');
    setNewConfig({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', name: '', apiKey: '', model: '' });
  };

  const handleDeleteAI = (id: string, e: React.MouseEvent) => {
    // Crucial: Stop propagation and prevent default
    e.stopPropagation();
    e.preventDefault();
    
    // Use window.confirm to be explicit
    if (window.confirm("确定要删除这个配置吗？")) {
      const updated = configs.filter(c => c.id !== id);
      setConfigs(updated);
      localStorage.setItem('drone_check_ai_configs', JSON.stringify(updated));
      
      // If we deleted the currently selected one, switch to the first available or reset
      if (selectedConfigId === id) {
        if (updated.length > 0) {
            setSelectedConfigId(updated[0].id);
            localStorage.setItem('drone_check_selected_config_id', updated[0].id);
        } else {
            // If empty, reset to defaults
            setConfigs(DEFAULT_AI_CONFIGS);
            setSelectedConfigId(DEFAULT_AI_CONFIGS[0].id);
            localStorage.setItem('drone_check_ai_configs', JSON.stringify(DEFAULT_AI_CONFIGS));
        }
      }
    }
  };

  const handleUpdateKey = (id: string, newKey: string) => {
    const updated = configs.map(c => c.id === id ? { ...c, apiKey: newKey } : c);
    setConfigs(updated);
    localStorage.setItem('drone_check_ai_configs', JSON.stringify(updated));
  }

  const handleResetAI = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.confirm("确定要重置 AI 配置为默认值吗？")) {
       setConfigs(DEFAULT_AI_CONFIGS);
       localStorage.setItem('drone_check_ai_configs', JSON.stringify(DEFAULT_AI_CONFIGS));
       setSelectedConfigId(DEFAULT_AI_CONFIGS[0].id);
    }
  };

  // --- Drone Handlers ---
  const handleAddDrone = () => {
    if (!newDrone.name || !newDrone.sensorWidth || !newDrone.sensorHeight || !newDrone.focalLength) {
      alert("请填写所有完整的传感器参数");
      return;
    }
    const drone: DroneSpecs = {
      name: newDrone.name!,
      sensorWidth: Number(newDrone.sensorWidth),
      sensorHeight: Number(newDrone.sensorHeight),
      focalLength: Number(newDrone.focalLength)
    };
    // Check duplicates
    if (drones.some(d => d.name === drone.name)) {
        alert("已存在相同名称的机型");
        return;
    }
    const updated = [...drones, drone];
    setDrones(updated);
    localStorage.setItem('drone_check_drones', JSON.stringify(updated));
    setDroneSubTab('list');
    setNewDrone({ name: '', sensorWidth: 0, sensorHeight: 0, focalLength: 0 });
  };

  const handleDeleteDrone = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (window.confirm(`确定要删除 ${name} 吗？`)) {
      const updated = drones.filter(d => d.name !== name);
      // Removed restriction on emptying list
      setDrones(updated);
      localStorage.setItem('drone_check_drones', JSON.stringify(updated));
    }
  };

  const handleResetDrones = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (window.confirm("确定要重置为系统默认机型列表吗？")) {
          setDrones(DRONE_PRESETS);
          localStorage.setItem('drone_check_drones', JSON.stringify(DRONE_PRESETS));
      }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            系统设置
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Main Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50">
            <button 
                type="button"
                onClick={() => setMainTab('ai')}
                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${mainTab === 'ai' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                AI 模型配置
            </button>
            <button 
                type="button"
                onClick={() => setMainTab('drones')}
                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${mainTab === 'drones' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
                机型 / 传感器库
            </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* ============ AI TAB ============ */}
          {mainTab === 'ai' && (
            <>
                <div className="flex mb-4 bg-slate-100 rounded p-1">
                    <button type="button" onClick={() => setAiSubTab('list')} className={`flex-1 py-1 text-xs rounded font-medium transition-all ${aiSubTab === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-600'}`}>已存模型</button>
                    <button type="button" onClick={() => setAiSubTab('add')} className={`flex-1 py-1 text-xs rounded font-medium transition-all ${aiSubTab === 'add' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-600'}`}>添加新模型</button>
                </div>

                {aiSubTab === 'list' ? (
                    <div className="space-y-4">
                    {configs.map(config => (
                        <div key={config.id} className="border border-slate-200 rounded-lg p-3 hover:border-indigo-200 transition-colors bg-slate-50/50 relative group">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                            <h4 className="font-bold text-slate-700 text-sm">{config.name}</h4>
                            <p className="text-xs text-slate-400">{config.provider === 'google' ? 'Google SDK' : config.baseUrl} ({config.model})</p>
                            </div>
                            
                            <button 
                                type="button" 
                                onClick={(e) => handleDeleteAI(config.id, e)} 
                                className="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors cursor-pointer relative z-10 border border-transparent hover:border-red-100"
                                title="删除"
                            >
                                <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">API Key</label>
                            <input 
                            type="password" 
                            value={config.apiKey}
                            onChange={(e) => handleUpdateKey(config.id, e.target.value)}
                            placeholder="sk-..."
                            className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        </div>
                    ))}
                    <div className="pt-4 border-t border-slate-100 mt-4">
                        <button type="button" onClick={handleResetAI} className="text-xs text-slate-400 underline hover:text-slate-600">重置为默认配置</button>
                    </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">显示名称</label>
                        <input 
                        type="text" 
                        value={newConfig.name || ''}
                        onChange={e => setNewConfig({...newConfig, name: e.target.value})}
                        placeholder="例如: DeepSeek V3"
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">接口类型</label>
                        <div className="flex gap-4">
                        <label className="flex items-center">
                            <input type="radio" name="provider" checked={newConfig.provider === 'openai'} onChange={() => setNewConfig({...newConfig, provider: 'openai', baseUrl: 'https://api.openai.com/v1'})} className="mr-2 text-indigo-600" />
                            <span className="text-sm">OpenAI 兼容 (通用)</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" name="provider" checked={newConfig.provider === 'google'} onChange={() => setNewConfig({...newConfig, provider: 'google', baseUrl: undefined})} className="mr-2 text-indigo-600" />
                            <span className="text-sm">Google Native</span>
                        </label>
                        </div>
                    </div>
                    {newConfig.provider === 'openai' && (
                        <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Base URL (API地址)</label>
                        <input 
                            type="text" 
                            value={newConfig.baseUrl || ''}
                            onChange={e => setNewConfig({...newConfig, baseUrl: e.target.value})}
                            placeholder="https://api.deepseek.com"
                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">API Key</label>
                        <input 
                        type="password" 
                        value={newConfig.apiKey || ''}
                        onChange={e => setNewConfig({...newConfig, apiKey: e.target.value})}
                        placeholder="sk-..."
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">模型名称 (Model ID)</label>
                        <input 
                        type="text" 
                        value={newConfig.model || ''}
                        onChange={e => setNewConfig({...newConfig, model: e.target.value})}
                        placeholder="e.g. deepseek-chat, gpt-4o"
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                    </div>
                    <button type="button" onClick={handleAddAI} className="w-full py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 transition-colors mt-2">
                        保存模型配置
                    </button>
                    </div>
                )}
            </>
          )}

          {/* ============ DRONES TAB ============ */}
          {mainTab === 'drones' && (
              <>
                <div className="flex mb-4 bg-slate-100 rounded p-1">
                    <button type="button" onClick={() => setDroneSubTab('list')} className={`flex-1 py-1 text-xs rounded font-medium transition-all ${droneSubTab === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-600'}`}>列表</button>
                    <button type="button" onClick={() => setDroneSubTab('add')} className={`flex-1 py-1 text-xs rounded font-medium transition-all ${droneSubTab === 'add' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-600'}`}>添加机型</button>
                </div>

                {droneSubTab === 'list' ? (
                    <div className="space-y-3">
                        {drones.map((d, i) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div>
                                    <div className="font-bold text-slate-700 text-sm">{d.name}</div>
                                    <div className="text-xs text-slate-500 font-mono">
                                        传感器: {d.sensorWidth}x{d.sensorHeight}mm | f={d.focalLength}mm
                                    </div>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={(e) => handleDeleteDrone(d.name, e)} 
                                    className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors cursor-pointer relative z-10 border border-transparent hover:border-red-100"
                                >
                                    <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        ))}
                        <div className="pt-4 border-t border-slate-100 mt-4">
                            <button type="button" onClick={handleResetDrones} className="text-xs text-slate-400 underline hover:text-slate-600">重置为系统默认列表</button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">机型名称</label>
                            <input 
                                type="text" 
                                value={newDrone.name}
                                onChange={e => setNewDrone({...newDrone, name: e.target.value})}
                                placeholder="例如: Mavic 3 Multispectral"
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">传感器宽 (mm)</label>
                                <input 
                                    type="number" 
                                    value={newDrone.sensorWidth || ''}
                                    onChange={e => setNewDrone({...newDrone, sensorWidth: Number(e.target.value)})}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">传感器高 (mm)</label>
                                <input 
                                    type="number" 
                                    value={newDrone.sensorHeight || ''}
                                    onChange={e => setNewDrone({...newDrone, sensorHeight: Number(e.target.value)})}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">镜头焦距 (mm)</label>
                            <input 
                                type="number" 
                                value={newDrone.focalLength || ''}
                                onChange={e => setNewDrone({...newDrone, focalLength: Number(e.target.value)})}
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <button type="button" onClick={handleAddDrone} className="w-full py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 transition-colors mt-2">
                            添加机型
                        </button>
                    </div>
                )}
              </>
          )}

        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-50 text-sm font-medium">
                关闭
            </button>
        </div>
      </div>
    </div>
  );
};