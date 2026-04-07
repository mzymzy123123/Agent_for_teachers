from typing import List, Optional
from pydantic import BaseModel, Field


class ScoreItem(BaseModel):
    """单项评分结果"""

    level: str = Field(..., description="好/较好/合格/待提升")
    score: float = Field(..., description="0-100 的数值分")
    comment: str = Field(..., description="简要评价说明")


class PresentationMetrics(BaseModel):
    """外功（表现力）各子指标"""
    
    # 核心评分指标（4项）
    mandarin_standard_score: float = Field(..., description="普通话标准度得分（0-100）")
    posture_confidence_score: float = Field(..., description="仪态大方得分（0-100）")
    filler_word_freq_per_min: float = Field(..., description="口头禅出现频率（次/分钟）")
    voice_pitch_variance: float = Field(..., description="音高方差，衡量抑扬顿挫")
    
    # 参考数据（不参与评分）
    facing_blackboard_ratio: float = Field(
        ..., description="背对学生的时间占总时长的比例（0-1）"
    )
    facing_blackboard_count: int = Field(..., description="背板事件次数")
    gesture_frequency: float = Field(
        ..., description="单位时间内手势/肢体动作频率（次/分钟）"
    )
    energy_score: float = Field(..., description="根据动作和音量计算的整体精神状态得分 0-1")


class ContentMetrics(BaseModel):
    """内功（教学内容）各子指标/raw 数据"""

    total_duration_minutes: float = Field(..., description="课程总时长（分钟）")
    intro_duration_minutes: float = Field(..., description="引入部分时长（分钟）")
    body_duration_minutes: float = Field(..., description="讲解部分时长（分钟）")
    conclusion_duration_minutes: float = Field(..., description="总结部分时长（分钟）")
    has_clear_structure: bool = Field(..., description="是否具有清晰的三段式结构")
    interaction_question_count: int = Field(..., description="老师提出的问题数量")
    student_response_engagement: float = Field(..., description="学生回答问题积极性得分（0-100）")
    estimated_wait_silence_seconds: float = Field(
        ..., description="为等待学生回答而产生的静默总时长估计（秒）"
    )
    long_pause_count: int = Field(
        ..., description="异常长停顿（如 >2 秒）的次数，用于衡量熟练度"
    )


class DimensionScore(BaseModel):
    """某一维度（外功/内功）的综合评分"""

    score_item: ScoreItem
    sub_items: dict = Field(
        ..., description="子项名称 -> ScoreItem，用于前端展示细分评分"
    )


class RawLLMContentEval(BaseModel):
    """LLM 对教学内容分析的原始结构化输出"""

    intro_summary: str = Field(..., description="引入部分摘要")
    body_summary: str = Field(..., description="讲解部分摘要")
    conclusion_summary: str = Field(..., description="总结部分摘要")
    structure_comment: str = Field(..., description="结构评价")
    logic_comment: str = Field(..., description="逻辑评价")
    interaction_comment: str = Field(..., description="互动评价")
    blackboard_comment: Optional[str] = Field(None, description="板书评价")
    suggestions: List[str] = Field(..., description="改进建议")

    def to_chinese_dict(self) -> dict:
        """返回中文字段名的字典，用于前端显示"""
        return {
            "引入部分摘要": self.intro_summary,
            "讲解部分摘要": self.body_summary,
            "总结部分摘要": self.conclusion_summary,
            "结构评价": self.structure_comment,
            "逻辑评价": self.logic_comment,
            "互动评价": self.interaction_comment,
            "板书评价": self.blackboard_comment,
            "改进建议": self.suggestions,
        }


class EvaluationReport(BaseModel):
    """最终返回给前端的整体评估报告"""

    # 原始文本
    transcript: str = Field(..., description="完整 ASR 文本")

    # 原始指标
    presentation_metrics: PresentationMetrics
    content_metrics: ContentMetrics

    # 综合维度评分
    presentation_score: DimensionScore
    content_score: DimensionScore

    # LLM 对教学内容的文字化分析和建议
    llm_content_eval: RawLLMContentEval

    # 口头禅详细数据
    filler_words_detail: List[dict] = Field(default_factory=list, description="口头禅详细列表，包含word和count")

    # 严重背板事件列表（超过10秒的背板事件）
    severe_blackboard_events: List[dict] = Field(
        default_factory=list, 
        description="严重背板事件列表，每个事件包含start_time、end_time、duration（单位：秒）"
    )

    # 总体结论
    overall_level: str = Field(..., description="总体评级：好/较好/合格/待提升")
    overall_comment: str = Field(..., description="总体评语")
    overall_score: float = Field(..., description="总体分数（0-100）")

    @classmethod
    def from_raw_results(
        cls,
        visual: dict,
        audio: dict,
        transcript: str,
        content_eval: dict,
        filler_eval: dict,
    ) -> "EvaluationReport":
        """
        根据各模块的原始输出（visual/audio/LLM）组装统一的评估报告。
        这里给出一种简单的权重/规则示例，你可以按需微调。
        """
        # ---- 外功原始指标组装 ----
        # 普通话标准度从 LLM 分析中获取，如果没有则使用默认值
        mandarin_standard_score = content_eval.get("mandarin_standard_score", 80.0)
        # 仪态大方得分：综合手势频率、能量得分、背板情况等计算
        # 手势频率和能量得分越高，背板时间越少，仪态得分越高
        posture_base = min(100, visual["gesture_frequency"] * 10 + visual["energy_score"] * 100)
        posture_penalty = visual["facing_blackboard_ratio"] * 30  # 背板时间越长，扣分越多
        posture_confidence_score = max(0, min(100, posture_base - posture_penalty))
        
        presentation_metrics = PresentationMetrics(
            mandarin_standard_score=mandarin_standard_score,
            posture_confidence_score=posture_confidence_score,
            filler_word_freq_per_min=filler_eval["filler_freq_per_min"],
            voice_pitch_variance=audio["pitch_variance"],
            # 参考数据
            facing_blackboard_ratio=visual["facing_blackboard_ratio"],
            facing_blackboard_count=visual["facing_blackboard_count"],
            gesture_frequency=visual["gesture_frequency"],
            energy_score=visual["energy_score"],
        )

        # ---- 内功原始指标组装 ----
        # 学生回答问题积极性从 LLM 分析中获取，如果没有则使用默认值
        student_response_engagement = content_eval.get("student_response_engagement", 70.0)
        content_metrics = ContentMetrics(
            total_duration_minutes=content_eval.get("total_duration_minutes", 30.0),
            intro_duration_minutes=content_eval.get("intro_duration_minutes", 5.0),
            body_duration_minutes=content_eval.get("body_duration_minutes", 20.0),
            conclusion_duration_minutes=content_eval.get(
                "conclusion_duration_minutes", 5.0
            ),
            has_clear_structure=content_eval.get("has_clear_structure", True),
            interaction_question_count=content_eval.get(
                "interaction_question_count", 0
            ),
            student_response_engagement=student_response_engagement,
            estimated_wait_silence_seconds=content_eval.get(
                "estimated_wait_silence_seconds", 0.0
            ),
            long_pause_count=audio["long_pause_count"],
        )

        # ---- 评分档位映射规则 ----
        def level_from_score(s: float) -> str:
            if s >= 85:
                return "好"
            if s >= 70:
                return "较好"
            if s >= 60:
                return "合格"
            return "待提升"

        # 外功分（4项核心指标，每项25%权重）
        # 1. 普通话标准度（0-100）
        mandarin_score = presentation_metrics.mandarin_standard_score
        
        # 2. 仪态大方（60-100分区间）
        # 将原始得分（0-100）映射到60-100区间
        posture_raw = presentation_metrics.posture_confidence_score
        posture_score = max(60.0, min(100.0, 60.0 + (posture_raw / 100.0) * 40.0))
        
        # 3. 口头禅频率（60-100分区间，频率越低，得分越高）
        # 口头禅频率转换为得分：频率0次/分钟=100分，频率10次/分钟=60分
        filler_raw = max(0, min(100, 100 - presentation_metrics.filler_word_freq_per_min * 10))
        filler_score = max(60.0, min(100.0, 60.0 + (filler_raw / 100.0) * 40.0))
        
        # 4. 音高方差（60-100分区间，方差越大，语调越生动，得分越高）
        # 音高方差转换为得分：方差0=60分，方差5=100分
        pitch_raw = min(100, presentation_metrics.voice_pitch_variance * 20)
        pitch_score = max(60.0, min(100.0, 60.0 + (pitch_raw / 100.0) * 40.0))
        
        # 外功总分 = 四项指标的平均值
        present_score_val = round(
            (mandarin_score + posture_score + filler_score + pitch_score) / 4.0,
            2
        )

        presentation_score = DimensionScore(
            score_item=ScoreItem(
                level=level_from_score(present_score_val),
                score=present_score_val,
                comment="综合考虑普通话标准度、仪态大方、口头禅频率和音高方差得出的外功评分。",
            ),
            sub_items={
                "普通话标准度": ScoreItem(
                    level=level_from_score(mandarin_score),
                    score=round(mandarin_score, 2),
                    comment="评估教师发音是否标准、是否存在明显方言或不规范读音。",
                ),
                "仪态大方": ScoreItem(
                    level=level_from_score(posture_score),
                    score=round(posture_score, 2),
                    comment="评估教师授课时的整体仪态表现，包括肢体语言是否自然、状态是否自信。",
                ),
                "口头禅频率": ScoreItem(
                    level=level_from_score(filler_score),
                    score=round(filler_score, 2),
                    comment=f"评估教师在授课过程中是否频繁使用无意义口头禅（频率：{round(presentation_metrics.filler_word_freq_per_min, 2)}次/分钟），频率越低，得分越高。",
                ),
                "音高方差": ScoreItem(
                    level=level_from_score(pitch_score),
                    score=round(pitch_score, 2),
                    comment="评估教师授课时的声音起伏变化，反映课堂是否生动、是否能够通过语音变化调动学生情绪。",
                ),
            },
        )

        # 内功分（更新后的权重，新增学生回答积极性）
        content_score_val = 0.0
        content_score_val += (90 if content_metrics.has_clear_structure else 60) * 0.3
        content_score_val += min(
            100, content_eval.get("logic_score", 80)
        ) * 0.3  # 来自 LLM 的逻辑评分
        content_score_val += min(
            100, 50 + content_metrics.interaction_question_count * 5
        ) * 0.2
        content_score_val += content_metrics.student_response_engagement * 0.2

        content_score = DimensionScore(
            score_item=ScoreItem(
                level=level_from_score(content_score_val),
                score=round(content_score_val, 2),
                comment="综合考虑内容结构、逻辑链条、互动情况和学生回答积极性得出的内功评分。",
            ),
            sub_items={
                "结构设计": ScoreItem(
                    level=level_from_score(90 if content_metrics.has_clear_structure else 60),
                    score=round(90 if content_metrics.has_clear_structure else 60, 2),
                    comment=content_eval.get("structure_comment", ""),
                ),
                "逻辑清晰度": ScoreItem(
                    level=level_from_score(content_eval.get("logic_score", 80)),
                    score=round(content_eval.get("logic_score", 80), 2),
                    comment=content_eval.get("logic_comment", ""),
                ),
                "学生回答积极性": ScoreItem(
                    level=level_from_score(content_metrics.student_response_engagement),
                    score=round(content_metrics.student_response_engagement, 2),
                    comment="评估学生在课堂互动中回答问题的积极性和参与度。",
                ),
            },
        )

        # 整体评级（新公式：总分 = 外功总分 * 40% + 内功总分 * 60%）
        overall_score = round(
            presentation_score.score_item.score * 0.4 + content_score.score_item.score * 0.6,
            2
        )
        overall_level = level_from_score(overall_score)

        # 获取三个摘要字段，如果为空则使用默认提示
        intro_summary = content_eval.get("intro_summary", "").strip()
        body_summary = content_eval.get("body_summary", "").strip()
        conclusion_summary = content_eval.get("conclusion_summary", "").strip()
        
        # 如果摘要为空，使用默认提示（可能是 LLM 没有返回这些字段）
        if not intro_summary:
            intro_summary = "（LLM 未生成引入部分摘要，请检查逐字稿是否包含引入环节）"
        if not body_summary:
            body_summary = "（LLM 未生成讲解部分摘要，请检查逐字稿是否包含讲解环节）"
        if not conclusion_summary:
            conclusion_summary = "（LLM 未生成总结部分摘要，请检查逐字稿是否包含总结环节）"
        
        llm_content_eval = RawLLMContentEval(
            intro_summary=intro_summary,
            body_summary=body_summary,
            conclusion_summary=conclusion_summary,
            structure_comment=content_eval.get("structure_comment", ""),
            logic_comment=content_eval.get("logic_comment", ""),
            interaction_comment=content_eval.get("interaction_comment", ""),
            blackboard_comment=content_eval.get("blackboard_comment"),
            suggestions=content_eval.get("suggestions", []),
        )

        # 提取口头禅详细数据，取Top 5
        filler_words_detail = filler_eval.get("filler_words", [])
        # 按count降序排序，取前5个
        filler_words_detail_sorted = sorted(
            filler_words_detail, 
            key=lambda x: x.get("count", 0), 
            reverse=True
        )[:5]

        # 从visual结果中获取严重背板事件列表
        severe_blackboard_events = visual.get("severe_blackboard_events", [])

        return cls(
            transcript=transcript,
            presentation_metrics=presentation_metrics,
            content_metrics=content_metrics,
            presentation_score=presentation_score,
            content_score=content_score,
            llm_content_eval=llm_content_eval,
            filler_words_detail=filler_words_detail_sorted,
            severe_blackboard_events=severe_blackboard_events,
            overall_level=overall_level,
            overall_score=overall_score,
            overall_comment=f"综合外功与内功表现，本次授课整体评为：{overall_level}。",
        )

    def to_chinese_dict(self) -> dict:
        """
        返回中文字段名的完整报告字典，用于前端显示。
        所有英文字段名都会被映射为对应的中文名称。
        """
        return {
            "完整逐字稿": self.transcript,
            "外功指标原始数据": {
                # 核心评分指标（使用映射后的分数，与外功综合评分保持一致）
                "普通话标准度": round(self.presentation_metrics.mandarin_standard_score, 2),
                "仪态大方": round(self.presentation_score.sub_items.get("仪态大方", ScoreItem(level="合格", score=70.0, comment="")).score, 2),
                "口头禅频率": round(self.presentation_metrics.filler_word_freq_per_min, 2),
                "音高方差": round(self.presentation_metrics.voice_pitch_variance, 2),
                # 参考数据
                "背板时间比例": round(self.presentation_metrics.facing_blackboard_ratio, 2),
                "背板次数": self.presentation_metrics.facing_blackboard_count,
                "手势频率": round(self.presentation_metrics.gesture_frequency, 2),
            },
            "内功指标原始数据": {
                "总时长分钟": round(self.content_metrics.total_duration_minutes, 2),
                "引入时长分钟": round(self.content_metrics.intro_duration_minutes, 2),
                "讲解时长分钟": round(self.content_metrics.body_duration_minutes, 2),
                "总结时长分钟": round(self.content_metrics.conclusion_duration_minutes, 2),
                "结构清晰": self.content_metrics.has_clear_structure,
                "互动问题数": self.content_metrics.interaction_question_count,
                "学生回答积极性": round(self.content_metrics.student_response_engagement, 2),
                "等待静默秒数": round(self.content_metrics.estimated_wait_silence_seconds, 2),
                "长停顿次数": self.content_metrics.long_pause_count,
            },
            "外功综合评分": {
                "等级": self.presentation_score.score_item.level,
                "得分": round(self.presentation_score.score_item.score, 2),
                "评语": self.presentation_score.score_item.comment,
                "子项评分": {
                    k: {
                        "等级": v.level,
                        "得分": round(v.score, 2),
                        "评语": v.comment,
                    }
                    for k, v in self.presentation_score.sub_items.items()
                },
            },
            "内功综合评分": {
                "等级": self.content_score.score_item.level,
                "得分": round(self.content_score.score_item.score, 2),
                "评语": self.content_score.score_item.comment,
                "子项评分": {
                    k: {
                        "等级": v.level,
                        "得分": round(v.score, 2),
                        "评语": v.comment,
                    }
                    for k, v in self.content_score.sub_items.items()
                },
            },
            "LLM内容分析与改进建议": self.llm_content_eval.to_chinese_dict(),
            "口头禅Top5": self.filler_words_detail,  # 添加Top 5口头禅数据
            "严重背板事件": self.severe_blackboard_events,  # 严重背板事件列表（超过10秒）
            "总体评级": self.overall_level,
            "总体得分": round(self.overall_score, 2),
            "总体评语": self.overall_comment,
        }


