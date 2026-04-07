import React, { useState, useRef, useEffect } from "react";
import { generatePDFReport } from "../utils/pdfGenerator";
import ScoreIndicatorTooltip from "./ScoreIndicatorTooltip";
import RadarChart from "./RadarChart";
import { FileText, MessageSquare, Lightbulb, AlertCircle, Camera, Clock, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useVideoAnalysis } from "../store/VideoAnalysisStore";
import { videoAnalysisService } from "../services/VideoAnalysisService";

interface SmartLessonUploaderProps {
  teacherId: string;
}

/**
 * 智能批课前端核心交互组件：
 * - 选择并上传授课视频
 * - 显示上传/分析进度与错误信息
 * - 以简洁卡片方式展示评估结果（总体结论 + 外功 / 内功摘要 + 详细数据报告）
 * - 支持 PDF 报告导出
 */

// 档位颜色映射
const getLevelColor = (level: string): string => {
  switch (level) {
    case "好":
      return "#10b981"; // 绿色
    case "较好":
      return "#3b82f6"; // 蓝色
    case "合格":
      return "#f59e0b"; // 橙色
    case "待提升":
      return "#ef4444"; // 红色
    default:
      return "#6b7280"; // 灰色
  }
};

// 格式化数值，保留两位小数
const formatNumber = (value: any): string => {
  if (typeof value === "number") {
    return value.toFixed(2);
  }
  if (typeof value === "string") {
    const num = parseFloat(value);
    return isNaN(num) ? value : num.toFixed(2);
  }
  return String(value);
};

const SmartLessonUploader: React.FC<SmartLessonUploaderProps> = ({
  teacherId,
}) => {
  // 使用全局状态管理
  const {
    getActiveTask,
    createTask,
    updateTask,
    setActiveTask,
    getTasksByTeacher,
  } = useVideoAnalysis();

  // 本地UI状态（文件选择）
  const [file, setFile] = useState<File | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const currentTaskIdRef = useRef<string | null>(null);

  // 从全局store获取当前任务状态
  const activeTask = getActiveTask();
  
  // 如果当前没有活动任务，尝试恢复该教师最近的任务
  useEffect(() => {
    if (!activeTask) {
      const teacherTasks = getTasksByTeacher(teacherId);
      // 优先恢复进行中的任务
      const inProgressTask = teacherTasks.find(
        (t) => t.status === "uploading" || t.status === "analyzing" || t.status === "extracting_blackboard"
      );
      if (inProgressTask) {
        setActiveTask(inProgressTask.id);
        currentTaskIdRef.current = inProgressTask.id;
      } else {
        // 如果没有进行中的任务，恢复最近完成的任务
        const completedTask = teacherTasks
          .filter((t) => t.status === "completed")
          .sort((a, b) => (b.completedTime || 0) - (a.completedTime || 0))[0];
        if (completedTask) {
          setActiveTask(completedTask.id);
          currentTaskIdRef.current = completedTask.id;
        }
      }
    } else {
      currentTaskIdRef.current = activeTask.id;
    }
  }, [activeTask, teacherId, getTasksByTeacher, setActiveTask]);

  // 注册通知回调
  useEffect(() => {
    const unsubscribe = videoAnalysisService.onNotification((taskId, message, type) => {
      // 通知会在App.tsx中统一处理
      console.log(`任务 ${taskId} 通知:`, message, type);
    });
    return unsubscribe;
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      // 选择新文件时，不清除当前任务，允许用户查看之前的结果
      // 只有在点击"开始分析"时才会创建新任务
    }
  };

  const handleUpload = async () => {
    if (!file) {
      // 显示错误提示（可以通过toast或临时状态）
      alert("请先选择一个视频文件。");
      return;
    }
    
    // 检查是否有正在进行的任务
    const teacherTasks = getTasksByTeacher(teacherId);
    const inProgressTask = teacherTasks.find(
      (t) => t.status === "uploading" || t.status === "analyzing" || t.status === "extracting_blackboard"
    );
    
    if (inProgressTask) {
      alert("已有分析任务正在进行中，请等待完成后再上传新视频。");
      // 切换到正在进行的任务
      setActiveTask(inProgressTask.id);
      currentTaskIdRef.current = inProgressTask.id;
      return;
    }
    
    // 创建新任务
    const taskId = createTask(teacherId, file);
    currentTaskIdRef.current = taskId;
    setActiveTask(taskId);
    
    // 启动后台分析任务（即使组件卸载，任务也会继续）
    videoAnalysisService.analyzeVideo(
      taskId,
      file,
      teacherId,
      (updates) => {
        // 更新任务状态（这个回调会在后台服务中调用，即使组件已卸载）
        updateTask(taskId, updates);
      }
    );
  };

  // extractBlackboardFrames 现在由 VideoAnalysisService 处理，不需要在这里实现

  const handleDownloadPDF = async () => {
    if (!result || !reportRef.current) {
      alert("无法生成PDF，请先完成分析。");
      return;
    }

    try {
      await generatePDFReport(
        result,
        teacherId,
        reportRef.current,
        activeTask?.fileName || file?.name || undefined
      );
    } catch (err) {
      console.error("PDF生成失败：", err);
      alert("PDF生成失败，请稍后重试。");
    }
  };

  // 从活动任务获取数据
  const result = activeTask?.result || null;
  const loading = activeTask?.status === "uploading" || activeTask?.status === "analyzing" || activeTask?.status === "extracting_blackboard";
  const error = activeTask?.error || null;
  const blackboardFrames = activeTask?.blackboardFrames || [];
  const extractingBlackboard = activeTask?.extractingBlackboard || false;
  const isNoBlackboard = activeTask?.isNoBlackboard || false;

  // 获取数据辅助函数
  const getOverallLevel = () => result?.["总体评级"] ?? result?.overall_level ?? "--";
  const getOverallScore = () => {
    const score = result?.["总体得分"] ?? result?.overall_score ?? result?.["总体评级"];
    return typeof score === "number" ? formatNumber(score) : "--";
  };
  const getPresentationScore = () => result?.["外功综合评分"]?.得分 ?? result?.presentation_score?.score_item?.score ?? "--";
  const getPresentationLevel = () => result?.["外功综合评分"]?.等级 ?? result?.presentation_score?.score_item?.level ?? "--";
  const getContentScore = () => result?.["内功综合评分"]?.得分 ?? result?.content_score?.score_item?.score ?? "--";
  const getContentLevel = () => result?.["内功综合评分"]?.等级 ?? result?.content_score?.score_item?.level ?? "--";

  return (
    <div>
      <div className="uploader-header">
        <div className="page-header-with-logo">
          <img src="/images/logo_apu/各种阿噗-02.png" alt="Logo" className="page-logo" />
          <div>
            <h2>上传授课视频</h2>
            <p className="uploader-desc">
              支持常见视频格式（mp4 / mov 等），上传后系统会自动分析外功与内功表现。
            </p>
          </div>
        </div>
      </div>

      <div className="uploader-controls">
        <label className="file-input-label">
          <span>
            {file 
              ? `已选择：${file.name}` 
              : activeTask?.fileName 
                ? `当前任务：${activeTask.fileName}` 
                : "点击或拖拽选择视频文件"}
          </span>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="file-input-hidden"
          />
        </label>
        <button
          className="primary-button"
          onClick={handleUpload}
          disabled={loading || !file}
        >
          {loading 
            ? activeTask?.status === "uploading" 
              ? "上传中，请稍候..." 
              : activeTask?.status === "analyzing"
              ? "分析中，请稍候..."
              : activeTask?.status === "extracting_blackboard"
              ? "提取板书中，请稍候..."
              : "处理中，请稍候..."
            : "开始分析"}
        </button>
      </div>

      {loading && (
        <div className="status status-loading">
          正在上传并分析视频，大约需要几十秒到数分钟（取决于视频时长）……
        </div>
      )}

      {error && (
        <div className="status status-error">
          <strong>错误：</strong>
          {error}
        </div>
      )}

      {result && (
        <div className="result-section" ref={reportRef}>
          <div className="result-header">
            <div className="result-summary card">
              <div className="result-title-row">
                <h3>
                  总体结果：
                  <span
                    className="level-badge"
                    style={{ color: getLevelColor(getOverallLevel()) }}
                  >
                    {getOverallLevel()}
                  </span>
                  {getOverallScore() !== "--" && (
                    <span className="score-text">（{getOverallScore()} 分）</span>
                  )}
                </h3>
                <button className="pdf-button" onClick={handleDownloadPDF}>
                  下载 PDF 报告
                </button>
              </div>
              <p>{result["总体评语"] ?? result.overall_comment ?? ""}</p>
            </div>
          </div>

          <div className="result-grid">
            <div className="card">
              <h4>外功表现（Presentation）</h4>
              <p className="result-score">
                综合得分：
                <span className="score-value">
                  {typeof getPresentationScore() === "number"
                    ? formatNumber(getPresentationScore())
                    : getPresentationScore()}{" "}
                  分
                </span>
                <span
                  className="level-badge"
                  style={{ color: getLevelColor(getPresentationLevel()) }}
                >
                  （{getPresentationLevel()}）
                </span>
              </p>
              <p className="result-comment">
                {result["外功综合评分"]?.评语 ??
                  result.presentation_score?.score_item?.comment ??
                  ""}
              </p>
              {result["外功综合评分"]?.子项评分 && (
                <div className="sub-items">
                  <h5>核心指标评分（4项）：</h5>
                  <ul>
                    {Object.entries(result["外功综合评分"].子项评分)
                      .filter(([key]) => {
                        // 只显示4项核心指标
                        const coreItems = [
                          "普通话标准度",
                          "仪态大方",
                          "口头禅频率",
                          "音高方差",
                        ];
                        return coreItems.includes(key);
                      })
                      .map(([key, value]: [string, any]) => (
                        <li key={key}>
                          <span className="sub-item-name">
                            {key}
                            <ScoreIndicatorTooltip indicatorName={key} />
                            ：
                          </span>
                          <span
                            className="level-badge-small"
                            style={{ color: getLevelColor(value.等级) }}
                          >
                            {value.等级}
                          </span>
                          <span className="sub-item-score">
                            {formatNumber(value.得分)} 分
                          </span>
                        </li>
                      ))}
                  </ul>
                  {/* 外功雷达图 */}
                  {(() => {
                    const coreItems = [
                      "普通话标准度",
                      "仪态大方",
                      "口头禅频率",
                      "音高方差",
                    ];
                    const radarData = Object.entries(result["外功综合评分"].子项评分)
                      .filter(([key]) => coreItems.includes(key))
                      .map(([key, value]: [string, any]) => ({
                        name: key,
                        value: parseFloat(formatNumber(value.得分)),
                      }));
                    return radarData.length > 0 ? (
                      <RadarChart data={radarData} title="外功能力均衡度" />
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            <div className="card">
              <h4>内功表现（Teaching Content）</h4>
              <p className="result-score">
                综合得分：
                <span className="score-value">
                  {typeof getContentScore() === "number"
                    ? formatNumber(getContentScore())
                    : getContentScore()}{" "}
                  分
                </span>
                <span
                  className="level-badge"
                  style={{ color: getLevelColor(getContentLevel()) }}
                >
                  （{getContentLevel()}）
                </span>
              </p>
              <p className="result-comment">
                {result["内功综合评分"]?.评语 ??
                  result.content_score?.score_item?.comment ??
                  ""}
              </p>
              {result["内功综合评分"]?.子项评分 && (
                <div className="sub-items">
                  <h5>子项评分：</h5>
                  <ul>
                    {Object.entries(result["内功综合评分"].子项评分).map(
                      ([key, value]: [string, any]) => (
                        <li key={key}>
                          <span className="sub-item-name">
                            {key}
                            <ScoreIndicatorTooltip indicatorName={key} />
                            ：
                          </span>
                          <span
                            className="level-badge-small"
                            style={{ color: getLevelColor(value.等级) }}
                          >
                            {value.等级}
                          </span>
                          <span className="sub-item-score">
                            {formatNumber(value.得分)} 分
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                  {/* 内功雷达图 */}
                  {(() => {
                    const radarData = Object.entries(result["内功综合评分"].子项评分).map(
                      ([key, value]: [string, any]) => ({
                        name: key,
                        value: parseFloat(formatNumber(value.得分)),
                      })
                    );
                    return radarData.length > 0 ? (
                      <RadarChart data={radarData} title="内功能力均衡度" />
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* 详细数据报告 - 使用表格展示 */}
          <div className="detailed-report card">
            <h4>详细数据报告</h4>

            {/* 外功指标原始数据 */}
            <div className="report-section">
              <h5>外功指标原始数据</h5>
              <table className="data-table">
                <tbody>
                  {result["外功指标原始数据"] &&
                    Object.entries(result["外功指标原始数据"]).map(
                      ([key, value]: [string, any]) => {
                        // 根据指标名称添加单位
                        let displayValue: string;
                        if (typeof value === "boolean") {
                          displayValue = value ? "是" : "否";
                        } else {
                          const numValue = formatNumber(value);
                          // 为不同指标添加单位
                          if (key === "口头禅频率") {
                            displayValue = `${numValue} 次/分钟`;
                          } else if (key === "音高方差") {
                            displayValue = `${numValue}`;
                          } else if (key === "背板时间比例") {
                            displayValue = `${numValue} (${(parseFloat(numValue) * 100).toFixed(1)}%)`;
                          } else if (key === "背板次数") {
                            displayValue = `${numValue} 次`;
                          } else if (key === "手势频率") {
                            displayValue = `${numValue} 次/分钟`;
                          } else if (key.includes("得分") || key.includes("标准度") || key.includes("大方")) {
                            displayValue = `${numValue} 分`;
                          } else {
                            displayValue = numValue;
                          }
                        }
                        return (
                          <tr key={key}>
                            <td className="data-label">{key}</td>
                            <td className="data-value">{displayValue}</td>
                          </tr>
                        );
                      }
                    )}
                </tbody>
              </table>
              {/* 口头禅排序 */}
              {result["口头禅Top5"] && result["口头禅Top5"].length > 0 && (
                <div className="filler-words-section">
                  <h6 className="filler-words-section-title">口头禅排序（频率排名前5）：</h6>
                  <ul className="filler-words-list">
                    {result["口头禅Top5"].map((item: any, idx: number) => (
                      <li key={idx} className="filler-word-item">
                        <span className="filler-word-rank">{idx + 1}.</span>
                        <span className="filler-word-text">"{item.word || "未知"}"</span>
                        <span className="filler-word-count">{item.count || 0}次</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* 严重背板事件时间戳 */}
              {result["严重背板事件"] && result["严重背板事件"].length > 0 && (
                <div className="severe-blackboard-section">
                  <h6 className="severe-blackboard-section-title">背板时段较长提示（教研需根据实际情况判断）：</h6>
                  <div className="severe-blackboard-table-wrapper">
                    <table className="severe-blackboard-table">
                      <thead>
                        <tr>
                          <th>序号</th>
                          <th>开始时间</th>
                          <th>结束时间</th>
                          <th>持续时长</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result["严重背板事件"].map((event: any, idx: number) => {
                          const formatTime = (seconds: number) => {
                            const mins = Math.floor(seconds / 60);
                            const secs = Math.floor(seconds % 60);
                            return `${mins}:${String(secs).padStart(2, '0')}`;
                          };
                          return (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td>{formatTime(event.start_time || 0)}</td>
                              <td>{formatTime(event.end_time || 0)}</td>
                              <td>{formatNumber(event.duration || 0)} 秒</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* 内功指标原始数据 */}
            <div className="report-section">
              <h5>内功指标原始数据</h5>
              <table className="data-table">
                <tbody>
                  {result["内功指标原始数据"] &&
                    Object.entries(result["内功指标原始数据"]).map(
                      ([key, value]: [string, any]) => {
                        // 根据指标名称添加单位
                        let displayValue: string;
                        if (typeof value === "boolean") {
                          displayValue = value ? "是" : "否";
                        } else {
                          const numValue = formatNumber(value);
                          // 为不同指标添加单位
                          if (key.includes("时长分钟") || key.includes("分钟")) {
                            displayValue = `${numValue} 分钟`;
                          } else if (key.includes("秒数")) {
                            displayValue = `${numValue} 秒`;
                          } else if (key.includes("次数")) {
                            displayValue = `${numValue} 次`;
                          } else if (key.includes("积极性") || key.includes("得分")) {
                            displayValue = `${numValue} 分`;
                          } else {
                            displayValue = numValue;
                          }
                        }
                        return (
                          <tr key={key}>
                            <td className="data-label">{key}</td>
                            <td className="data-value">{displayValue}</td>
                          </tr>
                        );
                      }
                    )}
                </tbody>
              </table>
            </div>

            {/* 内容分析与改进建议 */}
            {result["LLM内容分析与改进建议"] && (
              <div className="report-section">
                <h5>内容分析与改进建议</h5>
                <div className="llm-content">
                  {/* 摘要部分 */}
                  {(result["LLM内容分析与改进建议"]["引入部分摘要"] || 
                    result["LLM内容分析与改进建议"]["讲解部分摘要"] || 
                    result["LLM内容分析与改进建议"]["总结部分摘要"]) && (
                    <div className="llm-section llm-section-summary">
                      <div className="llm-section-header">
                        <FileText className="llm-section-icon" size={18} />
                        <strong>课堂摘要</strong>
                      </div>
                      {result["LLM内容分析与改进建议"]["引入部分摘要"] && (
                        <div className="llm-section-item">
                          <span className="llm-section-label">引入部分：</span>
                          <span>{result["LLM内容分析与改进建议"]["引入部分摘要"]}</span>
                        </div>
                      )}
                      {result["LLM内容分析与改进建议"]["讲解部分摘要"] && (
                        <div className="llm-section-item">
                          <span className="llm-section-label">讲解部分：</span>
                          <span>{result["LLM内容分析与改进建议"]["讲解部分摘要"]}</span>
                        </div>
                      )}
                      {result["LLM内容分析与改进建议"]["总结部分摘要"] && (
                        <div className="llm-section-item">
                          <span className="llm-section-label">总结部分：</span>
                          <span>{result["LLM内容分析与改进建议"]["总结部分摘要"]}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 评价部分 */}
                  {(result["LLM内容分析与改进建议"]["结构评价"] || 
                    result["LLM内容分析与改进建议"]["逻辑评价"] || 
                    result["LLM内容分析与改进建议"]["互动评价"] ||
                    result["LLM内容分析与改进建议"]["板书评价"] ||
                    blackboardFrames.length > 0) && (
                    <div className="llm-section llm-section-evaluation">
                      <div className="llm-section-header">
                        <MessageSquare className="llm-section-icon" size={18} />
                        <strong>教学评价</strong>
                      </div>
                      {result["LLM内容分析与改进建议"]["结构评价"] && (
                        <div className="llm-section-item">
                          <span className="llm-section-label">结构评价：</span>
                          <span>{result["LLM内容分析与改进建议"]["结构评价"]}</span>
                        </div>
                      )}
                      {result["LLM内容分析与改进建议"]["逻辑评价"] && (
                        <div className="llm-section-item">
                          <span className="llm-section-label">逻辑评价：</span>
                          <span>{result["LLM内容分析与改进建议"]["逻辑评价"]}</span>
                        </div>
                      )}
                      {result["LLM内容分析与改进建议"]["互动评价"] && (
                        <div className="llm-section-item">
                          <span className="llm-section-label">互动评价：</span>
                          <span>{result["LLM内容分析与改进建议"]["互动评价"]}</span>
                        </div>
                      )}
                      {result["LLM内容分析与改进建议"]["板书评价"] && (
                        <div className="llm-section-item">
                          <span className="llm-section-label">板书评价：</span>
                          <span>{result["LLM内容分析与改进建议"]["板书评价"]}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 改进建议部分 */}
                  {result["LLM内容分析与改进建议"]["改进建议"] && 
                   Array.isArray(result["LLM内容分析与改进建议"]["改进建议"]) && 
                   result["LLM内容分析与改进建议"]["改进建议"].length > 0 && (
                    <div className="llm-section llm-section-suggestions">
                      <div className="llm-section-header">
                        <Lightbulb className="llm-section-icon" size={18} />
                        <strong>改进建议</strong>
                      </div>
                      <ul className="llm-suggestions-list">
                        {result["LLM内容分析与改进建议"]["改进建议"].map((item: string, idx: number) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 板书智能截图与分析 */}
            {(extractingBlackboard || blackboardFrames.length > 0 || isNoBlackboard) && (
              <div className="blackboard-section card">
                <div className="blackboard-section-header">
                  <Camera className="blackboard-section-icon" size={20} />
                  <h4>板书智能截图与分析</h4>
                </div>
                {isNoBlackboard ? (
                  <div className="blackboard-frames-container">
                    <p className="blackboard-frames-desc" style={{ color: '#6b7280' }}>
                      该授课形式为无板书/线上授课，故无板书截图
                    </p>
                  </div>
                ) : extractingBlackboard ? (
                  <div className="blackboard-extracting">
                    <span>正在从视频中提取板书截图...</span>
                  </div>
                ) : blackboardFrames.length > 0 ? (
                  <div className="blackboard-frames-container">
                    <p className="blackboard-frames-desc">
                      系统已自动从视频中提取了 {blackboardFrames.length} 张板书较为完整的截图：
                    </p>
                    <div className="blackboard-frames-grid">
                      <AnimatePresence>
                        {blackboardFrames.map((frame: any, idx: number) => {
                          const timestamp = `${Math.floor(frame.timestamp / 60)}:${String(Math.floor(frame.timestamp % 60)).padStart(2, '0')}`;
                          return (
                            <motion.div
                              key={frame.frame_index || idx}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="blackboard-frame-item"
                            >
                              <div className="blackboard-frame-image-wrapper">
                                <img
                                  src={frame.image_base64 || ""}
                                  alt={`板书截图 ${frame.frame_index || idx}`}
                                  className="blackboard-frame-image"
                                />
                              </div>
                              <div className="blackboard-frame-info">
                                <Clock size={14} />
                                <span>{timestamp}</span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                ) : (
                  <div className="blackboard-frames-container">
                    <p className="blackboard-frames-desc" style={{ color: '#6b7280' }}>
                      未能从视频中提取到合适的板书截图，请确保视频中包含教师面向黑板的画面，且板书内容完整、无遮挡。
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartLessonUploader;
