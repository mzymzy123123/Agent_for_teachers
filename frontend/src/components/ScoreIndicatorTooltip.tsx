import React, { useState } from "react";
import { getScoreDescription, ScoreDescription } from "../utils/scoreDescriptions";

interface ScoreIndicatorTooltipProps {
  indicatorName: string;
}

/**
 * 评分指标提示组件
 * 显示"？"图标，悬停或点击时显示评分说明
 */
const ScoreIndicatorTooltip: React.FC<ScoreIndicatorTooltipProps> = ({
  indicatorName,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const description = getScoreDescription(indicatorName);

  if (!description) {
    return null;
  }

  return (
    <span className="score-tooltip-container">
      <span
        className="score-tooltip-icon"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        title="点击查看评分说明"
      >
        ？
      </span>
      {showTooltip && (
        <div className="score-tooltip-content">
          <div className="tooltip-header">
            <strong>{description.name}</strong>
            <button
              className="tooltip-close"
              onClick={() => setShowTooltip(false)}
            >
              ×
            </button>
          </div>
          <div className="tooltip-body">
            <p className="tooltip-rule">{description.rule}</p>
            <div className="tooltip-intervals">
              <strong>分数区间说明：</strong>
              <ul>
                {description.intervals.map((interval, idx) => (
                  <li key={idx}>
                    <span className="interval-range">{interval.range}：</span>
                    {interval.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </span>
  );
};

export default ScoreIndicatorTooltip;
