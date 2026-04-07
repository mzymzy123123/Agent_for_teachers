"""
数据库模型定义
使用 SQLite 作为轻量级数据库
"""
import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path


# 数据库文件路径
DB_PATH = Path(__file__).parent.parent.parent / "data" / "evaluations.db"


def init_database():
    """初始化数据库，创建表结构"""
    # 确保数据目录存在
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 创建评估记录表
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT NOT NULL,
            evaluation_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            video_name TEXT,
            overall_score REAL NOT NULL,
            overall_level TEXT NOT NULL,
            presentation_score REAL NOT NULL,
            presentation_mandarin_score REAL NOT NULL,
            presentation_posture_score REAL NOT NULL,
            presentation_filler_score REAL NOT NULL,
            presentation_pitch_score REAL NOT NULL,
            content_score REAL NOT NULL,
            content_sub_items TEXT NOT NULL,
            full_report TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 添加新字段（如果表已存在，这些操作会被忽略）
    try:
        cursor.execute("ALTER TABLE evaluations ADD COLUMN video_name TEXT")
    except sqlite3.OperationalError:
        pass  # 字段已存在
    
    try:
        cursor.execute("ALTER TABLE evaluations ADD COLUMN full_report TEXT")
    except sqlite3.OperationalError:
        pass  # 字段已存在

    # 创建索引
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_teacher_id ON evaluations(teacher_id)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_evaluation_time ON evaluations(evaluation_time)
        """
    )

    conn.commit()
    conn.close()


def save_evaluation(
    teacher_id: str,
    overall_score: float,
    overall_level: str,
    presentation_score: float,
    presentation_sub_items: Dict,
    content_score: float,
    content_sub_items: Dict,
    video_name: Optional[str] = None,
    full_report: Optional[Dict] = None,
) -> int:
    """
    保存评估记录

    Args:
        teacher_id: 教师ID
        overall_score: 总体得分
        overall_level: 总体评级
        presentation_score: 外功得分
        presentation_sub_items: 外功子项评分
        content_score: 内功得分
        content_sub_items: 内功子项评分
        video_name: 视频名称（可选）
        full_report: 完整评估报告（可选）

    Returns:
        评估记录ID
    """
    init_database()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 提取外功4项核心指标得分
    mandarin_score = presentation_sub_items.get("普通话标准度", {}).get("得分", 0.0)
    posture_score = presentation_sub_items.get("仪态大方", {}).get("得分", 0.0)
    filler_score = presentation_sub_items.get("口头禅频率", {}).get("得分", 0.0)
    pitch_score = presentation_sub_items.get("音高方差", {}).get("得分", 0.0)

    # 将完整报告转换为JSON字符串
    full_report_json = json.dumps(full_report, ensure_ascii=False) if full_report else None

    cursor.execute(
        """
        INSERT INTO evaluations (
            teacher_id, video_name, overall_score, overall_level,
            presentation_score,
            presentation_mandarin_score, presentation_posture_score,
            presentation_filler_score, presentation_pitch_score,
            content_score, content_sub_items, full_report
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            teacher_id,
            video_name,
            round(overall_score, 2),
            overall_level,
            round(presentation_score, 2),
            round(mandarin_score, 2),
            round(posture_score, 2),
            round(filler_score, 2),
            round(pitch_score, 2),
            round(content_score, 2),
            json.dumps(content_sub_items, ensure_ascii=False),
            full_report_json,
        ),
    )

    evaluation_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return evaluation_id


def get_teacher_evaluations(teacher_id: str, limit: Optional[int] = None) -> List[Dict]:
    """
    获取教师的历史评估记录

    Args:
        teacher_id: 教师ID
        limit: 返回记录数量限制

    Returns:
        评估记录列表，按时间倒序
    """
    init_database()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = """
        SELECT * FROM evaluations
        WHERE teacher_id = ?
        ORDER BY evaluation_time DESC
    """
    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query, (teacher_id,))
    rows = cursor.fetchall()

    results = []
    for row in rows:
        # 安全地获取可能不存在的字段
        video_name = None
        if "video_name" in row.keys():
            video_name = row["video_name"]
        
        result = {
            "id": row["id"],
            "teacher_id": row["teacher_id"],
            "evaluation_time": row["evaluation_time"],
            "video_name": video_name,
            "overall_score": row["overall_score"],
            "overall_level": row["overall_level"],
            "presentation_score": row["presentation_score"],
            "presentation_mandarin_score": row["presentation_mandarin_score"],
            "presentation_posture_score": row["presentation_posture_score"],
            "presentation_filler_score": row["presentation_filler_score"],
            "presentation_pitch_score": row["presentation_pitch_score"],
            "content_score": row["content_score"],
            "content_sub_items": json.loads(row["content_sub_items"]),
        }
        # 如果存在完整报告，也包含在结果中
        if "full_report" in row.keys() and row["full_report"]:
            try:
                result["full_report"] = json.loads(row["full_report"])
            except:
                result["full_report"] = None
        results.append(result)

    conn.close()
    return results


def get_teacher_trend_data(teacher_id: str) -> List[Dict]:
    """
    获取教师成长趋势数据（用于图表展示）

    Returns:
        [{"time": "2024-01-01", "score": 85.5}, ...]
    """
    evaluations = get_teacher_evaluations(teacher_id)
    return [
        {
            "time": eval["evaluation_time"],
            "score": eval["overall_score"],
        }
        for eval in evaluations
    ]


def get_evaluation_by_id(evaluation_id: int) -> Optional[Dict]:
    """
    根据ID获取单个评估记录

    Args:
        evaluation_id: 评估记录ID

    Returns:
        评估记录字典，如果不存在则返回None
    """
    init_database()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT * FROM evaluations
        WHERE id = ?
        """,
        (evaluation_id,),
    )

    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    # 安全地获取可能不存在的字段
    video_name = None
    if "video_name" in row.keys():
        video_name = row["video_name"]

    result = {
        "id": row["id"],
        "teacher_id": row["teacher_id"],
        "evaluation_time": row["evaluation_time"],
        "video_name": video_name,
        "overall_score": row["overall_score"],
        "overall_level": row["overall_level"],
        "presentation_score": row["presentation_score"],
        "presentation_mandarin_score": row["presentation_mandarin_score"],
        "presentation_posture_score": row["presentation_posture_score"],
        "presentation_filler_score": row["presentation_filler_score"],
        "presentation_pitch_score": row["presentation_pitch_score"],
        "content_score": row["content_score"],
        "content_sub_items": json.loads(row["content_sub_items"]),
    }
    
    # 如果存在完整报告，也包含在结果中
    if "full_report" in row.keys() and row["full_report"]:
        try:
            result["full_report"] = json.loads(row["full_report"])
        except:
            result["full_report"] = None
    
    return result


def get_all_evaluations(teacher_id_filter: Optional[str] = None) -> List[Dict]:
    """
    获取所有教师的评估记录（管理员使用）

    Args:
        teacher_id_filter: 可选的教师ID过滤条件

    Returns:
        评估记录列表，按时间倒序
    """
    init_database()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    if teacher_id_filter:
        query = """
            SELECT * FROM evaluations
            WHERE teacher_id LIKE ?
            ORDER BY evaluation_time DESC
        """
        cursor.execute(query, (f"%{teacher_id_filter}%",))
    else:
        query = """
            SELECT * FROM evaluations
            ORDER BY evaluation_time DESC
        """
        cursor.execute(query)

    rows = cursor.fetchall()

    results = []
    for row in rows:
        # 安全地获取可能不存在的字段
        video_name = None
        if "video_name" in row.keys():
            video_name = row["video_name"]
        
        result = {
            "id": row["id"],
            "teacher_id": row["teacher_id"],
            "evaluation_time": row["evaluation_time"],
            "video_name": video_name,
            "overall_score": row["overall_score"],
            "overall_level": row["overall_level"],
            "presentation_score": row["presentation_score"],
            "presentation_mandarin_score": row["presentation_mandarin_score"],
            "presentation_posture_score": row["presentation_posture_score"],
            "presentation_filler_score": row["presentation_filler_score"],
            "presentation_pitch_score": row["presentation_pitch_score"],
            "content_score": row["content_score"],
            "content_sub_items": json.loads(row["content_sub_items"]),
        }
        # 如果存在完整报告，也包含在结果中
        if "full_report" in row.keys() and row["full_report"]:
            try:
                result["full_report"] = json.loads(row["full_report"])
            except:
                result["full_report"] = None
        results.append(result)

    conn.close()
    return results

