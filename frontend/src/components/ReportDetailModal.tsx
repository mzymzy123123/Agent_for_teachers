import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileVideo, TrendingUp, Loader2 } from "lucide-react";
import RadarChart from "./RadarChart";

interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: {
    videoName: string;
    overallScore: number;
    overallLevel: string;
    presentationScore: number;
    contentScore: number;
    evaluationId?: number;
  };
  authorName?: string;
}

// 档位颜色映射
const getLevelColor = (level: string): string => {
  switch (level) {
    case "好":
      return "#10b981";
    case "较好":
      return "#3b82f6";
    case "合格":
      return "#f59e0b";
    case "待提升":
      return "#ef4444";
    default:
      return "#6b7280";
  }
};

// 格式化数值
const formatNumber = (value: number): string => {
  return value.toFixed(1);
};

const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
  isOpen,
  onClose,
  report,
  authorName,
}) => {
  const [loading, setLoading] = useState(false);
  const [fullReport, setFullReport] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 当模态框打开且有 evaluationId 时，尝试获取完整报告
  useEffect(() => {
    if (isOpen && report.evaluationId) {
      fetchFullReport();
    } else {
      setFullReport(null);
      setError(null);
    }
  }, [isOpen, report.evaluationId]);

  const fetchFullReport = async () => {
    if (!report.evaluationId) return;

    setLoading(true);
    setError(null);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_BASE_URL}/api/evaluation/${report.evaluationId}`
      );

      if (!response.ok) {
        throw new Error(`获取完整报告失败: ${response.status}`);
      }

      const data = await response.json();
      
      // 如果存在完整报告，使用完整报告；否则使用基本信息
      if (data.full_report) {
        setFullReport(data.full_report);
      } else {
        // 构建简化版本
        setFullReport({
          总体评级: data.overall_level,
          总体得分: data.overall_score,
          总体评语: `综合评分：${data.overall_score}分，评级：${data.overall_level}`,
          外功综合评分: {
            得分: data.presentation_score,
            等级: data.overall_level,
            评语: "外功表现评分",
            子项评分: {},
          },
          内功综合评分: {
            得分: data.content_score,
            等级: data.overall_level,
            评语: "内功表现评分",
            子项评分: data.content_sub_items || {},
          },
        });
      }
    } catch (err: any) {
      setError(err.message || "获取完整报告失败");
      console.error("获取完整报告错误：", err);
    } finally {
      setLoading(false);
    }
  };

  // 获取雷达图数据
  const getRadarData = () => {
    if (fullReport && fullReport["内功综合评分"]?.子项评分) {
      const subItems = fullReport["内功综合评分"].子项评分;
      return Object.entries(subItems).map(([key, value]: [string, any]) => ({
        name: key,
        value: typeof value.得分 === "number" ? value.得分 : parseFloat(value.得分) || 0,
      }));
    }
    // 如果没有子项数据，使用基础分数构建简单的雷达图
    return [
      { name: "外功", value: report.presentationScore },
      { name: "内功", value: report.contentScore },
    ];
  };

  // 获取详细评语列表
  const getComments = () => {
    if (fullReport) {
      const comments: string[] = [];
      
      // 总体评语
      if (fullReport["总体评语"]) {
        comments.push(fullReport["总体评语"]);
      }
      
      // 外功评语
      if (fullReport["外功综合评分"]?.评语) {
        comments.push(`外功：${fullReport["外功综合评分"].评语}`);
      }
      
      // 内功评语
      if (fullReport["内功综合评分"]?.评语) {
        comments.push(`内功：${fullReport["内功综合评分"].评语}`);
      }
      
      // 子项评语
      if (fullReport["内功综合评分"]?.子项评分) {
        Object.entries(fullReport["内功综合评分"].子项评分).forEach(
          ([key, value]: [string, any]) => {
            if (value.评语) {
              comments.push(`${key}：${value.评语}`);
            }
          }
        );
      }
      
      return comments.length > 0 ? comments : ["暂无详细评语"];
    }
    
    // 如果没有完整报告，返回基础信息
    return [
      `综合评分：${formatNumber(report.overallScore)}分，评级：${report.overallLevel}`,
      `外功评分：${formatNumber(report.presentationScore)}分`,
      `内功评分：${formatNumber(report.contentScore)}分`,
    ];
  };

  // 获取教师名称
  const getTeacherName = () => {
    return authorName || "授课教师";
  };

  // 防止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              zIndex: 1000,
            }}
          />
          
          {/* 模态框容器 - 固定定位，垂直居中略偏上 */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1001,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: "5vh",
              paddingBottom: "5vh",
              overflow: "hidden",
              pointerEvents: "none",
            }}
            onClick={onClose}
          >
            {/* 模态框内容 */}
            <motion.div
              className="report-detail-modal"
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                maxWidth: "800px",
                width: "90%",
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                pointerEvents: "auto",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 固定头部 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "24px 24px 20px 24px",
                  borderBottom: "1px solid #e5e7eb",
                  flexShrink: 0,
                  position: "relative",
                  zIndex: 10,
                  backgroundColor: "white",
                }}
              >
                <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "600", color: "#1f2937" }}>
                  批课报告详情
                </h2>
                <button
                  onClick={onClose}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    color: "#6b7280",
                    transition: "all 0.2s",
                    position: "relative",
                    zIndex: 11,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f3f4f6";
                    e.currentTarget.style.color = "#1f2937";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "#6b7280";
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* 可滚动内容区域 */}
              <div
                style={{
                  overflowY: "auto",
                  overflowX: "hidden",
                  flex: 1,
                  padding: "24px",
                }}
              >

                {/* 加载状态 */}
                {loading && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 size={24} />
                    </motion.div>
                    <span style={{ marginLeft: "12px", color: "#6b7280" }}>正在加载详细报告...</span>
                  </div>
                )}

                {/* 错误状态 */}
                {error && !loading && (
                  <div style={{ padding: "20px", backgroundColor: "#fef2f2", borderRadius: "8px", marginBottom: "20px" }}>
                    <p style={{ color: "#ef4444", margin: 0 }}>{error}</p>
                    <p style={{ color: "#6b7280", margin: "8px 0 0 0", fontSize: "14px" }}>
                      将显示基础报告信息
                    </p>
                  </div>
                )}

                {/* 报告内容 */}
                {!loading && (
                  <div>
                {/* 基本信息 */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                    <FileVideo size={18} style={{ marginRight: "8px", color: "#6b7280" }} />
                    <span style={{ fontWeight: "500", color: "#374151" }}>课程名称：</span>
                    <span style={{ marginLeft: "8px", color: "#1f2937" }}>{report.videoName}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                    <span style={{ fontWeight: "500", color: "#374151" }}>授课教师：</span>
                    <span style={{ marginLeft: "8px", color: "#1f2937" }}>{getTeacherName()}</span>
                  </div>
                </div>

                {/* 总分展示 */}
                <div
                  style={{
                    backgroundColor: "#f9fafb",
                    borderRadius: "12px",
                    padding: "24px",
                    marginBottom: "24px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <span style={{ fontSize: "14px", color: "#6b7280" }}>综合评分</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
                    <span
                      style={{
                        fontSize: "48px",
                        fontWeight: "700",
                        color: "#1f2937",
                      }}
                    >
                      {formatNumber(report.overallScore)}
                    </span>
                    <span
                      style={{
                        fontSize: "20px",
                        fontWeight: "600",
                        color: getLevelColor(report.overallLevel),
                        padding: "6px 16px",
                        borderRadius: "6px",
                        backgroundColor: "white",
                      }}
                    >
                      {report.overallLevel}
                    </span>
                  </div>
                </div>

                {/* 分项评分 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                  <div
                    style={{
                      backgroundColor: "#eff6ff",
                      borderRadius: "8px",
                      padding: "16px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>外功评分</div>
                    <div style={{ fontSize: "28px", fontWeight: "600", color: "#3b82f6" }}>
                      {formatNumber(report.presentationScore)}
                    </div>
                  </div>
                  <div
                    style={{
                      backgroundColor: "#f0fdf4",
                      borderRadius: "8px",
                      padding: "16px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>内功评分</div>
                    <div style={{ fontSize: "28px", fontWeight: "600", color: "#10b981" }}>
                      {formatNumber(report.contentScore)}
                    </div>
                  </div>
                </div>

                {/* 雷达图 */}
                {getRadarData().length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <RadarChart data={getRadarData()} title="能力均衡度分析" />
                  </div>
                )}

                {/* 详细评语 */}
                <div style={{ marginTop: "24px" }}>
                  <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "16px", color: "#1f2937" }}>
                    详细评语
                  </h3>
                  <div
                    style={{
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      padding: "16px",
                    }}
                  >
                    <ul style={{ margin: 0, paddingLeft: "20px", listStyle: "disc" }}>
                      {getComments().map((comment, index) => (
                        <li
                          key={index}
                          style={{
                            marginBottom: "8px",
                            color: "#374151",
                            lineHeight: "1.6",
                          }}
                        >
                          {comment}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                </div>
                )}
              </div>

              {/* 固定底部 */}
              <div
                style={{
                  padding: "20px 24px",
                  borderTop: "1px solid #e5e7eb",
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "flex-end",
                  backgroundColor: "white",
                }}
              >
                <button
                  onClick={onClose}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "500",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#2563eb";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#3b82f6";
                  }}
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ReportDetailModal;

