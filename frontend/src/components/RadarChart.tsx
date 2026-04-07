import React from "react";
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

interface RadarChartProps {
  data: Array<{ name: string; value: number; fullMark?: number }>;
  title?: string;
}

/**
 * 雷达图组件
 * 用于展示多维度能力评估，直观显示各项能力的均衡程度
 */
const RadarChart: React.FC<RadarChartProps> = ({ data, title }) => {
  // 确保数据格式正确，并设置最大值为100
  const chartData = data.map((item) => ({
    name: item.name,
    value: Math.min(item.value, 100), // 确保不超过100
    fullMark: 100,
  }));

  return (
    <div className="radar-chart-container">
      {title && <h6 className="radar-chart-title">{title}</h6>}
      <ResponsiveContainer width="100%" height={300}>
        <RechartsRadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#4b5563" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
          />
          <Radar
            name="得分"
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.6}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RadarChart;

