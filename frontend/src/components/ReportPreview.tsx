import React from "react";
import { FileVideo, TrendingUp } from "lucide-react";

interface ReportPreviewProps {
  report: {
    videoName: string;
    overallScore: number;
    overallLevel: string;
    presentationScore: number;
    contentScore: number;
    evaluationId?: number;
  };
}

const ReportPreview: React.FC<ReportPreviewProps> = ({ report }) => {
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

  return (
    <div className="report-preview">
      <div className="report-preview-header">
        <FileVideo size={18} />
        <span className="report-preview-title">批课报告</span>
      </div>
      <div className="report-preview-content">
        <div className="report-preview-video">
          <span className="video-name-label">视频：</span>
          <span className="video-name">{report.videoName}</span>
        </div>
        <div className="report-preview-scores">
          <div className="report-score-item">
            <span className="score-label">综合评分</span>
            <div className="score-value-wrapper">
              <span className="score-value">{report.overallScore.toFixed(1)}</span>
              <span
                className="score-level"
                style={{ color: getLevelColor(report.overallLevel) }}
              >
                {report.overallLevel}
              </span>
            </div>
          </div>
          <div className="report-score-item">
            <span className="score-label">外功</span>
            <span className="score-value-small">
              {report.presentationScore.toFixed(1)}分
            </span>
          </div>
          <div className="report-score-item">
            <span className="score-label">内功</span>
            <span className="score-value-small">
              {report.contentScore.toFixed(1)}分
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPreview;

