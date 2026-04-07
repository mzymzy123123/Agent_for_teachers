/**
 * 评分指标说明数据
 * 用于前端展示评分规则的详细说明
 */

export interface ScoreDescription {
  name: string;
  rule: string;
  intervals: {
    range: string;
    description: string;
  }[];
}

export const scoreDescriptions: { [key: string]: ScoreDescription } = {
  "普通话标准度": {
    name: "普通话标准度",
    rule: "评估教师发音是否标准、是否存在明显方言或不规范读音。由大模型根据语音识别文本分析发音准确性、方言使用情况、语音清晰度等。",
    intervals: [
      { range: "0-60分", description: "方言严重或发音不规范，需要加强普通话训练" },
      { range: "60-75分", description: "存在明显方言或较多不规范读音，基本可理解" },
      { range: "75-90分", description: "基本标准，偶有方言或不规范读音，整体良好" },
      { range: "90-100分", description: "标准普通话、发音清晰准确，表现优秀" },
    ],
  },
  "仪态大方": {
    name: "仪态大方",
    rule: "评估教师授课时的整体仪态表现，包括肢体语言是否自然、状态是否自信。综合手势频率、能量得分、背板情况等指标计算。评分区间为60-100分，避免对新手教师过度惩罚。",
    intervals: [
      { range: "60-75分", description: "仪态基本合格，肢体语言较少，需要提升自信度" },
      { range: "75-85分", description: "仪态自然，肢体语言适中，表现良好" },
      { range: "85-95分", description: "仪态大方，肢体语言丰富自然，状态自信" },
      { range: "95-100分", description: "仪态优秀，肢体语言自然流畅，状态非常自信" },
    ],
  },
  "口头禅频率": {
    name: "口头禅频率",
    rule: "评估教师在授课过程中是否频繁使用无意义口头禅（如'那个'、'然后'、'呃'等）。频率越低，得分越高。评分区间为60-100分，避免对新手教师过度惩罚。",
    intervals: [
      { range: "60-75分", description: "口头禅使用较多，影响课堂专业性，需要刻意减少" },
      { range: "75-85分", description: "口头禅使用适中，基本不影响教学效果" },
      { range: "85-95分", description: "口头禅使用较少，课堂表达清晰专业" },
      { range: "95-100分", description: "几乎无口头禅，表达非常清晰专业" },
    ],
  },
  "音高方差": {
    name: "音高方差",
    rule: "评估教师授课时的声音起伏变化，反映课堂是否生动、是否能够通过语音变化调动学生情绪。音高变化越大，语调越生动。评分区间为60-100分，避免对新手教师过度惩罚。",
    intervals: [
      { range: "60-75分", description: "音调变化较少，语调偏平，容易让学生走神" },
      { range: "75-85分", description: "音调有一定变化，语调基本生动" },
      { range: "85-95分", description: "音调变化合理，语调生动，能调动学生情绪" },
      { range: "95-100分", description: "音调变化丰富，语调非常生动，课堂感染力强" },
    ],
  },
  "结构设计": {
    name: "结构设计",
    rule: "评估课堂是否具有清晰的三段式结构：引入(Intro)、讲解(Body)、总结(Conclusion)。结构清晰、时间分配合理得分高。",
    intervals: [
      { range: "0-60分", description: "结构混乱，缺少引入或总结，时间分配不合理" },
      { range: "60-75分", description: "结构基本完整，但时间分配需要优化" },
      { range: "75-90分", description: "结构清晰，时间分配合理，表现良好" },
      { range: "90-100分", description: "结构非常清晰，时间分配优秀，表现优秀" },
    ],
  },
  "逻辑清晰度": {
    name: "逻辑清晰度",
    rule: "评估知识点是否循序渐进，有无逻辑跳跃或前后矛盾。由大模型分析讲解顺序、例题难度安排等，给出0-100分的逻辑评分。",
    intervals: [
      { range: "0-60分", description: "逻辑混乱，存在明显跳跃或矛盾，需要改进" },
      { range: "60-75分", description: "逻辑基本清晰，偶有跳跃，基本可理解" },
      { range: "75-90分", description: "逻辑清晰，循序渐进，表现良好" },
      { range: "90-100分", description: "逻辑非常清晰，讲解有条理，表现优秀" },
    ],
  },
  "学生回答积极性": {
    name: "学生回答积极性",
    rule: "评估学生在课堂互动中回答问题的积极性和参与度。根据文本中学生回答情况、回答质量、互动频率等判断。",
    intervals: [
      { range: "0-60分", description: "学生参与度低，互动效果差，需要改进互动设计" },
      { range: "60-75分", description: "学生参与度一般，基本有互动，但可以提升" },
      { range: "75-90分", description: "学生参与度较高，互动效果良好" },
      { range: "90-100分", description: "学生参与度很高，互动效果优秀" },
    ],
  },
};

/**
 * 获取指标的说明
 */
export const getScoreDescription = (indicatorName: string): ScoreDescription | undefined => {
  return scoreDescriptions[indicatorName];
};
