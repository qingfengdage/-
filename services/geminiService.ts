
import { GoogleGenAI } from "@google/genai";
import { FlightMetrics, DroneSpecs } from '../types';

export const analyzeFlightData = async (
  metrics: FlightMetrics,
  drone: DroneSpecs,
  photoCount: number,
  warnings: string[]
): Promise<string> => {
  
  if (!process.env.API_KEY) {
    throw new Error("API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const rtkText = metrics.rtkFixedRatio === -1 
    ? "无 MRK 数据 (单点定位)" 
    : `固定解 (Fixed) 占比 ${metrics.rtkFixedRatio.toFixed(1)}%`;

  const qualityText = `模糊照片: ${metrics.qualityIssues.blurryCount} 张, 过曝照片: ${metrics.qualityIssues.overexposedCount} 张`;

  const prompt = `
    你是一位具有10年以上经验的无人机测绘（摄影测量）总工程师。请检查这份外业成果数据，生成一份专业的《外业成果质量检查报告》。

    **项目摘要:**
    - 机型: ${drone.name} (传感器尺寸: ${drone.sensorWidth}x${drone.sensorHeight}mm)
    - 像片数量: ${photoCount} 张
    - 作业面积: ${(metrics.areaCovered / 10000).toFixed(2)} 公顷
    - 平均航速: ${metrics.avgSpeed.toFixed(1)} m/s

    **核心质检参数 (QC Metrics):**
    1. **分辨率 (GSD)**: ${metrics.groundResolution} cm/px
    2. **重叠率**: 航向 ${metrics.avgForwardOverlap.toFixed(1)}% / 旁向 ${metrics.avgSideOverlap.toFixed(1)}%
    3. **飞行质量**: 
       - 航高一致性(标准差): ${metrics.altitudeStdDev.toFixed(2)}m
       - 航线弯曲度(直线性): ${metrics.flightLineCurvature.toFixed(2)}度 (越小越直)
    4. **POS 数据完整性**: ${rtkText} (Q=50 为固定解)
    5. **影像画质抽检**: ${qualityText}

    **系统自动检测警告:**
    ${warnings.length > 0 ? warnings.join('\n- ') : "系统预检通过，未发现明显异常。"}

    **请按以下结构输出报告:**
    
    ### 1. 综合评级
    (评级：优秀/良好/合格/不合格。如果 RTK 固定率低或重叠率不足，请严厉判定。)

    ### 2. 详细指标分析
    *   **控制与定位 (POS)**: 评价 RTK 固定率。
    *   **重叠率与连接强度**: 分析重叠率。
    *   **影像质量**: 针对模糊/过曝情况。
    *   **飞行动力学**: 评价航速 (${metrics.avgSpeed.toFixed(1)}m/s) 是否过快导致糊片；根据**航线弯曲度** (${metrics.flightLineCurvature.toFixed(2)}°) 评价受风影响程度或航线保持能力。

    ### 3. 处理建议
    (针对内业空三处理的建议，是否需要剔除废片，或建议重飞)
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 } 
      }
    });

    return response.text || "无法生成分析报告，请稍后再试。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("AI分析服务暂时不可用");
  }
};
