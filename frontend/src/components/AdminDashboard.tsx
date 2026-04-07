import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, FileVideo, Clock, User, ArrowRight } from "lucide-react";
import EvaluationReportView from "./EvaluationReportView";

interface EvaluationRecord {
  id: number;
  teacher_id: string;
  evaluation_time: string;
  video_name: string | null;
  overall_score: number;
  overall_level: string;
}

interface AdminDashboardProps {
  onViewReport: (evaluationId: number) => void;
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

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onViewReport }) => {
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<number | null>(null);

  useEffect(() => {
    fetchEvaluations();
  }, [searchQuery]);

  const fetchEvaluations = async () => {
    setLoading(true);
    setError(null);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const url = searchQuery.trim()
        ? `${API_BASE_URL}/api/admin/evaluations?teacher_id=${encodeURIComponent(searchQuery.trim())}`
        : `${API_BASE_URL}/api/admin/evaluations`;
      
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`获取评估记录失败: ${response.status}`);
      }

      const data = await response.json();
      setEvaluations(data.evaluations || []);
    } catch (err: any) {
      setError(err.message || "获取评估记录失败");
      console.error("获取评估记录错误：", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewReport = (evaluationId: number) => {
    setSelectedEvaluationId(evaluationId);
  };

  const handleBackToList = () => {
    setSelectedEvaluationId(null);
  };

  if (selectedEvaluationId) {
    return (
      <EvaluationReportView
        evaluationId={selectedEvaluationId}
        teacherId="root"
        onBack={handleBackToList}
      />
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h2>管理员控制台</h2>
        <p className="admin-subtitle">查看所有教师的批课报告</p>
      </div>

      <div className="admin-search">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="搜索教师ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <div className="admin-loading">
          <p>正在加载评估记录...</p>
        </div>
      )}

      {error && (
        <div className="admin-error">
          <p>错误：{error}</p>
          <button className="primary-button" onClick={fetchEvaluations}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {evaluations.length === 0 ? (
            <div className="admin-empty">
              <p>{searchQuery ? "未找到符合条件的评估记录" : "暂无评估记录"}</p>
            </div>
          ) : (
            <div className="admin-records">
              <div className="admin-stats">
                <p>共找到 {evaluations.length} 条评估记录</p>
              </div>
              {evaluations.map((record, index) => (
                <motion.div
                  key={record.id}
                  className="admin-record-card card"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.01 }}
                  onClick={() => handleViewReport(record.id)}
                >
                  <div className="admin-record-content">
                    <div className="admin-record-main">
                      <div className="admin-record-title">
                        <FileVideo size={20} />
                        <span className="admin-video-name">
                          {record.video_name || "未命名视频"}
                        </span>
                      </div>
                      <div className="admin-record-meta">
                        <div className="admin-record-meta-item">
                          <User size={16} />
                          <span>教师ID: {record.teacher_id}</span>
                        </div>
                        <div className="admin-record-meta-item">
                          <Clock size={16} />
                          <span>{formatDateTime(record.evaluation_time)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-record-scores">
                      <div className="admin-score-item">
                        <span className="admin-score-label">综合评分</span>
                        <span className="admin-score-value">
                          {record.overall_score.toFixed(1)} 分
                        </span>
                      </div>
                      <div className="admin-level-item">
                        <span className="admin-level-label">评级</span>
                        <span
                          className="admin-level-badge"
                          style={{ color: getLevelColor(record.overall_level) }}
                        >
                          {record.overall_level}
                        </span>
                      </div>
                    </div>

                    <div className="admin-record-action">
                      <ArrowRight size={20} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminDashboard;

