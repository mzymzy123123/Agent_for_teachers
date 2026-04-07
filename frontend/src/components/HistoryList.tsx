import React, { useState, useEffect } from "react";
import { Clock, FileVideo, Star, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface HistoryListProps {
  teacherId: string;
  onViewReport: (evaluationId: number) => void;
}

interface EvaluationRecord {
  id: number;
  evaluation_time: string;
  video_name: string | null;
  overall_score: number;
  overall_level: string;
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

// 格式化时间
const formatDateTime = (dateTimeStr: string): string => {
  try {
    const date = new Date(dateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return dateTimeStr;
  }
};

const HistoryList: React.FC<HistoryListProps> = ({ teacherId, onViewReport }) => {
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvaluations();
  }, [teacherId]);

  const fetchEvaluations = async () => {
    setLoading(true);
    setError(null);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_BASE_URL}/api/teacher/${teacherId}/evaluations`
      );

      if (!response.ok) {
        throw new Error(`获取历史记录失败: ${response.status}`);
      }

      const data = await response.json();
      setEvaluations(data.evaluations || []);
    } catch (err: any) {
      setError(err.message || "获取历史记录失败");
      console.error("获取历史记录错误：", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="history-list">
        <div className="history-header">
          <h2>历史记录</h2>
        </div>
        <div className="history-loading">
          <p>正在加载历史记录...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-list">
        <div className="history-header">
          <h2>历史记录</h2>
        </div>
        <div className="history-error">
          <p>错误：{error}</p>
          <button className="primary-button" onClick={fetchEvaluations}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div className="history-list">
        <div className="history-header">
          <h2>历史记录</h2>
        </div>
        <div className="history-empty">
          <p>暂无历史评估数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-list">
      <div className="history-header">
        <h2>历史记录</h2>
        <p className="history-desc">查看您之前上传过的视频评估记录</p>
      </div>

      <div className="history-records">
        {evaluations.map((record) => (
          <motion.div
            key={record.id}
            className="history-record-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
            onClick={() => onViewReport(record.id)}
          >
            <div className="history-record-content">
              <div className="history-record-main">
                <div className="history-record-title">
                  <FileVideo size={20} />
                  <span className="history-video-name">
                    {record.video_name || "未命名视频"}
                  </span>
                </div>
                <div className="history-record-meta">
                  <div className="history-record-meta-item">
                    <Clock size={16} />
                    <span>{formatDateTime(record.evaluation_time)}</span>
                  </div>
                </div>
              </div>

              <div className="history-record-scores">
                <div className="history-score-item">
                  <span className="history-score-label">综合评分</span>
                  <span className="history-score-value">
                    {record.overall_score.toFixed(1)} 分
                  </span>
                </div>
                <div className="history-level-item">
                  <span className="history-level-label">评级</span>
                  <span
                    className="history-level-badge"
                    style={{ color: getLevelColor(record.overall_level) }}
                  >
                    {record.overall_level}
                  </span>
                </div>
              </div>

              <div className="history-record-action">
                <ArrowRight size={20} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default HistoryList;

