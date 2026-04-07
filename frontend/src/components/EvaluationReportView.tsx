import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, FileText, MessageSquare, Lightbulb } from "lucide-react";
import { generatePDFReport } from "../utils/pdfGenerator";
import ScoreIndicatorTooltip from "./ScoreIndicatorTooltip";
import RadarChart from "./RadarChart";

interface EvaluationReportViewProps {
  evaluationId: number;
  teacherId: string;
  onBack: () => void;
}

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

const EvaluationReportView: React.FC<EvaluationReportViewProps> = ({
  evaluationId,
  teacherId,
  onBack,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEvaluation();
  }, [evaluationId]);

  const fetchEvaluation = async () => {
    setLoading(true);
    setError(null);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_BASE_URL}/api/evaluation/${evaluationId}`
      );

      if (!response.ok) {
        throw new Error(`获取评估报告失败: ${response.status}`);
      }

      const data = await response.json();
      
      // 如果存在完整报告，使用完整报告；否则使用基本信息构建简化报告
      if (data.full_report) {
        setResult(data.full_report);
      } else {
        // 如果没有完整报告，构建一个简化版本
        setResult({
          总体评级: data.overall_level,
          总体得分: data.overall_score,
          总体评语: `综合评分：${data.overall_score}分，评级：${data.overall_level}`,
          外功综合评分: {
            得分: data.presentation_score,
            等级: data.overall_level, // 简化处理
            评语: "外功表现评分",
            子项评分: {},
          },
          内功综合评分: {
            得分: data.content_score,
            等级: data.overall_level, // 简化处理
            评语: "内功表现评分",
            子项评分: data.content_sub_items || {},
          },
        });
      }
    } catch (err: any) {
      setError(err.message || "获取评估报告失败");
      console.error("获取评估报告错误：", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!result || !reportRef.current) {
      alert("无法生成PDF，报告数据不完整。");
      return;
    }

    try {
      await generatePDFReport(
        result,
        teacherId,
        reportRef.current,
        undefined
      );
    } catch (err) {
      console.error("PDF生成失败：", err);
      alert("PDF生成失败，请稍后重试。");
    }
  };

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

  if (loading) {
    return (
      <div className="evaluation-report-view">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={18} />
            返回历史记录
          </button>
        </div>
        <div className="report-loading">
          <p>正在加载评估报告...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="evaluation-report-view">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={18} />
            返回历史记录
          </button>
        </div>
        <div className="report-error">
          <p>错误：{error}</p>
          <button className="primary-button" onClick={fetchEvaluation}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="evaluation-report-view">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={18} />
            返回历史记录
          </button>
        </div>
        <div className="report-empty">
          <p>评估报告不存在或数据不完整</p>
        </div>
      </div>
    );
  }

  return (
    <div className="evaluation-report-view">
      <div className="report-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={18} />
          返回历史记录
        </button>
      </div>

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
            {result["外功综合评分"]?.子项评分 && Object.keys(result["外功综合评分"].子项评分).length > 0 && (
              <div className="sub-items">
                <h5>核心指标评分（4项）：</h5>
                <ul>
                  {Object.entries(result["外功综合评分"].子项评分)
                    .filter(([key]) => {
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
            {result["内功综合评分"]?.子项评分 && Object.keys(result["内功综合评分"].子项评分).length > 0 && (
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

        {/* 详细数据报告 */}
        {result["外功指标原始数据"] || result["内功指标原始数据"] || result["LLM内容分析与改进建议"] ? (
          <div className="detailed-report card">
            <h4>详细数据报告</h4>

            {/* 外功指标原始数据 */}
            {result["外功指标原始数据"] && (
              <div className="report-section">
                <h5>外功指标原始数据</h5>
                <table className="data-table">
                  <tbody>
                    {Object.entries(result["外功指标原始数据"]).map(
                      ([key, value]: [string, any]) => {
                        let displayValue: string;
                        if (typeof value === "boolean") {
                          displayValue = value ? "是" : "否";
                        } else {
                          const numValue = formatNumber(value);
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
                {/* 严重背板事件 */}
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
            )}

            {/* 内功指标原始数据 */}
            {result["内功指标原始数据"] && (
              <div className="report-section">
                <h5>内功指标原始数据</h5>
                <table className="data-table">
                  <tbody>
                    {Object.entries(result["内功指标原始数据"]).map(
                      ([key, value]: [string, any]) => {
                        let displayValue: string;
                        if (typeof value === "boolean") {
                          displayValue = value ? "是" : "否";
                        } else {
                          const numValue = formatNumber(value);
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
            )}

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
                    result["LLM内容分析与改进建议"]["板书评价"]) && (
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
          </div>
        ) : (
          <div className="detailed-report card">
            <p style={{ color: '#6b7280' }}>该历史记录的详细数据报告不可用，可能是在添加详细报告功能之前创建的记录。</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvaluationReportView;

