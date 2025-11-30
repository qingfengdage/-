import { GoogleGenAI } from "@google/genai";
import { FlightMetrics, DroneSpecs, AIModelConfig } from '../types';

export const analyzeFlightData = async (
  metrics: FlightMetrics,
  drone: DroneSpecs,
  photoCount: number,
  warnings: string[],
  config: AIModelConfig // New Argument
): Promise<string> => {
  
  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const rtkText = metrics.rtkFixedRatio === -1 
    ? "无 MRK 数据 (单点定位)" 
    : `固定解 (Fixed) 占比 ${metrics.rtkFixedRatio.toFixed(1)}%`;

  const qualityText = `模糊照片: ${metrics.qualityIssues.blurryCount} 张, 过曝照片: ${metrics.qualityIssues.overexposedCount} 张`;

  const systemInstruction = `你是一位具有10年以上经验的无人机测绘（摄影测量）总工程师。请检查这份外业成果数据，生成一份专业的《外业成果质量检查报告》。报告必须客观、严谨，指出所有潜在隐患。`;

  const prompt = `
    ${systemInstruction}

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
    // 1. Google Gemini Native SDK
    if (config.provider === 'google') {
        const apiKey = config.apiKey || process.env.API_KEY;
        if (!apiKey) throw new Error("缺少 Google API Key");

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: config.model,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingBudget: 0 } 
          }
        });
        return response.text || "AI 返回了空内容。";
    } 
    
    // 2. OpenAI Compatible Fetch
    else if (config.provider === 'openai') {
        let baseUrl = config.baseUrl?.trim() || "https://api.openai.com/v1";
        
        // Robust sanitization to prevent 404s
        // Remove trailing slash
        baseUrl = baseUrl.replace(/\/$/, "");
        // Remove specific endpoints if the user pasted the full URL (e.g., .../chat/completions)
        baseUrl = baseUrl.replace(/\/chat\/completions$/, "");
        baseUrl = baseUrl.replace(/\/chat$/, "");
        
        const url = `${baseUrl}/chat/completions`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: prompt }
                ]
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "AI 返回了空内容。";
    }

    return "不支持的 AI 提供商配置";

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    throw new Error(`AI分析服务错误: ${error.message || "未知错误"}`);
  }
};