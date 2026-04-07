from typing import Dict
import io

import cv2
import numpy as np


async def _iter_video_frames(video_bytes: bytes, sample_fps: int = 2):
    """
    将内存中的视频字节流交给 OpenCV 读取，并按指定 FPS 采样帧。
    注意：OpenCV 通常需要文件路径，这里演示通过临时文件的方式，
    实际生产环境可以将 bytes 落盘到 /tmp 再读取。
    
    返回：生成器，每次yield (frame, frame_timestamp, orig_fps)
    """
    # 简化处理：先写入临时文件
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
        tmp.write(video_bytes)
        tmp.flush()

        cap = cv2.VideoCapture(tmp.name)
        if not cap.isOpened():
            raise RuntimeError("无法打开视频文件进行分析")

        orig_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_interval = max(int(orig_fps // sample_fps), 1)
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % frame_interval == 0:
                # 计算当前帧的时间戳（秒）
                frame_timestamp = frame_idx / orig_fps
                yield frame, frame_timestamp, orig_fps
            frame_idx += 1

        cap.release()


async def analyze_video_visual(video_bytes: bytes) -> Dict:
    """
    视频视觉分析主逻辑：
    - 使用人脸检测 + 头部朝向粗略估计背板（未检测到正脸/脸部朝向偏离摄像机方向）
    - 估计背板时间比例和次数
    - 估计手势/肢体动作频率（通过前后两帧轮廓差分近似表示）
    - 综合动作幅度估算能量值（energy_score）

    说明：
    - 这里示例使用 OpenCV 的 Haar 级联做正脸检测。
    - 更精细的头部姿态可用 MediaPipe Face Mesh / Holistic，计算 3D 关键点后估计 yaw/pitch。
    """
    # 加载 OpenCV 自带人脸分类器（需要系统安装 opencv-data 或手动指定路径）
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    facing_blackboard_frames = 0
    facing_blackboard_events = 0
    in_blackboard_state = False
    blackboard_start_frame = None
    blackboard_start_timestamp = None  # 背板开始时间戳（秒）
    blackboard_event_counted = False  # 标记当前背板事件是否已计数
    # 采样 FPS 为 2，则每帧约 0.5 秒，5秒需要10帧
    MIN_BLACKBOARD_FRAMES = 10  # 5秒 = 10帧（2fps采样）
    # 严重背板事件：超过10秒
    SEVERE_BLACKBOARD_DURATION = 10.0  # 10秒

    # 严重背板事件列表
    severe_blackboard_events = []
    # 标记当前背板事件是否已记录为严重事件
    severe_event_recorded = False

    gesture_motions = []
    prev_gray = None
    total_frames = 0
    orig_fps = 25.0  # 默认值，会在第一次迭代时更新
    last_frame_timestamp = 0.0  # 记录最后一帧的时间戳

    async for frame_data in _iter_video_frames(video_bytes, sample_fps=2):
        frame, frame_timestamp, orig_fps = frame_data
        total_frames += 1
        last_frame_timestamp = frame_timestamp  # 更新最后一帧时间戳
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 1) 人脸检测：若检测不到人脸，认为是背对学生
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
        has_front_face = len(faces) > 0

        if not has_front_face:
            facing_blackboard_frames += 1
            if not in_blackboard_state:
                # 开始进入背板状态，记录起始帧和时间戳
                blackboard_start_frame = total_frames
                blackboard_start_timestamp = frame_timestamp
                in_blackboard_state = True
                blackboard_event_counted = False
                severe_event_recorded = False  # 重置严重事件标记
            else:
                # 持续背板状态，检查是否达到5秒（10帧）
                if blackboard_start_frame is not None and not blackboard_event_counted:
                    blackboard_duration_frames = total_frames - blackboard_start_frame
                    if blackboard_duration_frames >= MIN_BLACKBOARD_FRAMES:
                        # 达到5秒，计为一次有效背板事件
                        facing_blackboard_events += 1
                        blackboard_event_counted = True  # 标记已计数，避免重复计数
                
                # 检查是否达到10秒严重背板事件（只在达到10秒时记录一次）
                if blackboard_start_timestamp is not None and not severe_event_recorded:
                    current_duration = frame_timestamp - blackboard_start_timestamp
                    if current_duration >= SEVERE_BLACKBOARD_DURATION:
                        # 记录严重背板事件（使用当前时间戳作为结束时间，后续会更新）
                        severe_blackboard_events.append({
                            "start_time": round(blackboard_start_timestamp, 2),
                            "end_time": round(frame_timestamp, 2),
                            "duration": round(current_duration, 2),
                        })
                        severe_event_recorded = True  # 标记已记录，避免重复
                elif blackboard_start_timestamp is not None and severe_event_recorded:
                    # 如果已经记录过，更新结束时间和持续时间
                    if severe_blackboard_events:
                        last_event = severe_blackboard_events[-1]
                        if last_event["start_time"] == round(blackboard_start_timestamp, 2):
                            current_duration = frame_timestamp - blackboard_start_timestamp
                            last_event["end_time"] = round(frame_timestamp, 2)
                            last_event["duration"] = round(current_duration, 2)
        else:
            # 检测到正脸，退出背板状态
            if in_blackboard_state:
                # 如果背板时间不足5秒，不计入背板事件（但已计入总背板时间）
                # 检查是否在退出前达到了10秒严重背板事件
                if blackboard_start_timestamp is not None and not severe_event_recorded:
                    final_duration = frame_timestamp - blackboard_start_timestamp
                    if final_duration >= SEVERE_BLACKBOARD_DURATION:
                        # 记录严重背板事件
                        severe_blackboard_events.append({
                            "start_time": round(blackboard_start_timestamp, 2),
                            "end_time": round(frame_timestamp, 2),
                            "duration": round(final_duration, 2),
                        })
                        severe_event_recorded = True
            in_blackboard_state = False
            blackboard_start_frame = None
            blackboard_start_timestamp = None
            blackboard_event_counted = False
            severe_event_recorded = False

        # 2) 简单肢体/手势动作估计：使用帧间差分的非零像素面积近似
        if prev_gray is not None:
            diff = cv2.absdiff(prev_gray, gray)
            _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
            motion_score = np.sum(thresh > 0) / float(thresh.size)
            gesture_motions.append(motion_score)
        prev_gray = gray

    # 处理视频结束时仍在背板状态的情况
    if in_blackboard_state and blackboard_start_timestamp is not None:
        # 使用最后一帧的时间戳作为结束时间
        final_timestamp = last_frame_timestamp
        
        # 检查是否达到10秒严重背板事件
        if not severe_event_recorded:
            final_duration = final_timestamp - blackboard_start_timestamp
            if final_duration >= SEVERE_BLACKBOARD_DURATION:
                severe_blackboard_events.append({
                    "start_time": round(blackboard_start_timestamp, 2),
                    "end_time": round(final_timestamp, 2),
                    "duration": round(final_duration, 2),
                })
        else:
            # 如果已经记录过，更新结束时间和持续时间
            if severe_blackboard_events:
                last_event = severe_blackboard_events[-1]
                if last_event["start_time"] == round(blackboard_start_timestamp, 2):
                    final_duration = final_timestamp - blackboard_start_timestamp
                    last_event["end_time"] = round(final_timestamp, 2)
                    last_event["duration"] = round(final_duration, 2)

    if total_frames == 0:
        return {
            "facing_blackboard_ratio": 0.0,
            "facing_blackboard_count": 0,
            "gesture_frequency": 0.0,
            "energy_score": 0.5,
            "severe_blackboard_events": [],
        }

    # 采样 FPS 为 2，则每帧约 0.5 秒
    sample_fps = 2
    total_duration_seconds = total_frames / sample_fps
    blackboard_duration_seconds = facing_blackboard_frames / sample_fps
    facing_blackboard_ratio = blackboard_duration_seconds / total_duration_seconds

    # 手势频率估计：统计 motion_score 超过阈值的帧数，转为“次/分钟”
    if gesture_motions:
        motion_threshold = 0.02
        active_frames = sum(1 for m in gesture_motions if m > motion_threshold)
        active_seconds = active_frames / sample_fps
        gesture_frequency = (active_seconds / 60.0)  # 次/分钟的近似
        avg_motion = float(np.mean(gesture_motions))
    else:
        gesture_frequency = 0.0
        avg_motion = 0.0

    # 能量值：综合动作幅度与是否经常背板；动作越多、背板越少，能量越高
    energy_score = float(
        min(1.0, max(0.0, avg_motion * 5.0)) * (1.0 - min(1.0, facing_blackboard_ratio))
    )

    return {
        "facing_blackboard_ratio": float(facing_blackboard_ratio),
        "facing_blackboard_count": int(facing_blackboard_events),
        "gesture_frequency": float(gesture_frequency),
        "energy_score": energy_score,
        "severe_blackboard_events": severe_blackboard_events,  # 严重背板事件列表
    }


async def extract_blackboard_frames(video_bytes: bytes, max_frames: int = 5) -> list:
    """
    从视频中提取板书较为完整的帧（使用智能算法）。
    
    新策略：
    1. 静止检测：优先选择画面变化较小的片段
    2. 内容密度分析：计算边缘密度和深色像素密度，选择内容最丰富的时刻
    3. 去重：确保提取的帧在时间轴上有间隔，分别代表课程的前、中、后期
    
    参数:
        video_bytes: 视频文件的字节流
        max_frames: 最大提取帧数（默认5，实际返回3-5张）
        
    返回:
        frames: 包含帧信息的列表，每个元素包含：
            - frame_index: 帧索引
            - timestamp: 时间戳（秒）
            - image_base64: base64编码的图片
            - motion_score: 运动分数
            - content_density: 内容密度
            - stability_score: 综合稳定性分数
    """
    import base64
    from .blackboard_extractor import FrameExtractor
    
    # 创建智能帧提取器
    extractor = FrameExtractor(
        sample_fps=2,  # 每秒采样2帧，平衡效率和准确性
        min_frames_interval=30,  # 最小间隔30帧（约15秒），避免重复
        motion_threshold=0.015,  # 运动阈值
        min_content_density=0.05,  # 最小内容密度
    )
    
    # 提取候选帧（目标数量为max_frames，但实际可能返回3-5张）
    target_count = min(max_frames, 5)  # 最多5张
    candidates = await extractor.extract_frames(video_bytes, target_count=target_count)
    
    # 转换为返回格式
    blackboard_frames = []
    for candidate in candidates:
        # 将帧编码为base64
        _, buffer = cv2.imencode('.jpg', candidate.frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        blackboard_frames.append({
            "frame_index": candidate.frame_index,
            "timestamp": candidate.timestamp,
            "image_base64": f"data:image/jpeg;base64,{frame_base64}",
            "motion_score": candidate.motion_score,
            "content_density": candidate.content_density,
            "stability_score": candidate.stability_score,
        })
    
    return blackboard_frames


