"""
智能板书截图与点评模块

包含两个核心类：
1. FrameExtractor: 智能帧提取，使用多种算法判断板书完整性
2. BlackboardEvaluator: AI点评，调用GPT-4o对板书进行多维度评价
"""

import os
import base64
import tempfile
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

import cv2
import numpy as np
import httpx


@dataclass
class FrameCandidate:
    """候选帧数据结构"""
    frame: np.ndarray  # 原始帧图像
    frame_index: int  # 帧索引
    timestamp: float  # 时间戳（秒）
    motion_score: float  # 运动分数（越小越稳定）
    content_density: float  # 内容密度（边缘密度或深色像素密度）
    has_front_face: bool  # 是否检测到正脸
    stability_score: float  # 综合稳定性分数（用于排序）


class FrameExtractor:
    """
    智能帧提取类
    
    核心功能：
    1. 静止检测：优先选择画面变化较小的片段（老师写完字离开画面或站立不动）
    2. 内容密度分析：计算画面中的边缘密度或深色像素密度，选择密度达到峰值的时刻
    3. 去重：确保提取的帧在时间轴上有间隔，分别代表课程的前、中、后期
    """
    
    def __init__(
        self,
        sample_fps: int = 2,
        min_frames_interval: int = 30,  # 最小帧间隔（避免重复）
        motion_threshold: float = 0.015,  # 运动阈值（小于此值认为静止）
        min_content_density: float = 0.05,  # 最小内容密度阈值
    ):
        """
        初始化帧提取器
        
        参数:
            sample_fps: 采样帧率（每秒采样多少帧）
            min_frames_interval: 最小帧间隔（采样帧数），用于去重
            motion_threshold: 运动阈值，小于此值认为画面静止
            min_content_density: 最小内容密度阈值，过滤内容太少的帧
        """
        self.sample_fps = sample_fps
        self.min_frames_interval = min_frames_interval
        self.motion_threshold = motion_threshold
        self.min_content_density = min_content_density
        
        # 加载人脸检测器
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
    
    async def _iter_video_frames(self, video_bytes: bytes) -> Tuple[float, np.ndarray]:
        """
        迭代视频帧，返回时间戳和帧图像
        
        参数:
            video_bytes: 视频文件的字节流
            
        生成:
            (timestamp, frame): 时间戳（秒）和帧图像
        """
        with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
            tmp.write(video_bytes)
            tmp.flush()
            
            cap = cv2.VideoCapture(tmp.name)
            if not cap.isOpened():
                raise RuntimeError("无法打开视频文件进行分析")
            
            orig_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            frame_interval = max(int(orig_fps // self.sample_fps), 1)
            frame_idx = 0
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                if frame_idx % frame_interval == 0:
                    timestamp = frame_idx / orig_fps
                    yield timestamp, frame
                
                frame_idx += 1
            
            cap.release()
    
    def _detect_motion(self, prev_gray: Optional[np.ndarray], curr_gray: np.ndarray) -> float:
        """
        检测两帧之间的运动量
        
        参数:
            prev_gray: 前一帧的灰度图
            curr_gray: 当前帧的灰度图
            
        返回:
            motion_score: 运动分数（0-1），越小表示画面越静止
        """
        if prev_gray is None:
            return 1.0  # 第一帧无法计算运动，返回最大值
        
        # 计算帧间差分
        diff = cv2.absdiff(prev_gray, curr_gray)
        _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
        
        # 运动分数 = 变化像素占比
        motion_score = np.sum(thresh > 0) / float(thresh.size)
        return float(motion_score)
    
    def _calculate_content_density(self, frame: np.ndarray) -> float:
        """
        计算画面内容密度
        
        策略：
        1. 边缘检测：使用Canny边缘检测，计算边缘像素占比
        2. 深色像素密度：假设黑板为白色背景，计算深色像素（板书内容）占比
        
        参数:
            frame: 原始帧图像（BGR格式）
            
        返回:
            density: 内容密度（0-1），越大表示内容越丰富
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 方法1：边缘密度
        # 使用Canny边缘检测
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / float(edges.size)
        
        # 方法2：深色像素密度（假设黑板为白色背景）
        # 将图像转为灰度后，深色像素（板书）通常值较小
        # 使用自适应阈值，找出深色区域
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        dark_pixel_density = np.sum(binary > 0) / float(binary.size)
        
        # 综合两种方法：取较大值，确保能捕捉到不同风格的板书
        density = max(edge_density, dark_pixel_density)
        
        return float(density)
    
    def _detect_face(self, gray: np.ndarray) -> bool:
        """
        检测是否包含正脸（用于判断是否背板）
        
        参数:
            gray: 灰度图像
            
        返回:
            has_front_face: True表示检测到正脸（面向学生），False表示背板
        """
        faces = self.face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5,
            minSize=(30, 30)  # 最小人脸尺寸，过滤误检
        )
        return len(faces) > 0
    
    def _calculate_stability_score(
        self, 
        motion_score: float, 
        content_density: float, 
        has_front_face: bool
    ) -> float:
        """
        计算综合稳定性分数
        
        分数越高，表示该帧越适合作为板书截图：
        - 画面静止（motion_score小）
        - 内容丰富（content_density大）
        - 无遮挡（无正脸，has_front_face=False）
        
        参数:
            motion_score: 运动分数（越小越好）
            content_density: 内容密度（越大越好）
            has_front_face: 是否检测到正脸（False更好）
            
        返回:
            stability_score: 综合稳定性分数（0-1），越大越好
        """
        # 运动分数归一化：越小越好，转换为越大越好
        motion_normalized = 1.0 - min(motion_score / self.motion_threshold, 1.0)
        
        # 内容密度：越大越好，直接使用（已归一化到0-1）
        content_normalized = min(content_density * 2.0, 1.0)  # 放大内容密度的影响
        
        # 遮挡惩罚：如果有正脸，大幅降低分数
        occlusion_penalty = 0.3 if has_front_face else 1.0
        
        # 综合分数：加权平均
        stability_score = (
            motion_normalized * 0.4 +  # 静止性权重40%
            content_normalized * 0.5 +  # 内容密度权重50%
            (1.0 if not has_front_face else 0.0) * 0.1  # 无遮挡权重10%
        ) * occlusion_penalty
        
        return float(stability_score)
    
    async def extract_frames(
        self, 
        video_bytes: bytes, 
        target_count: int = 5
    ) -> List[FrameCandidate]:
        """
        从视频中提取最佳板书帧
        
        算法流程：
        1. 遍历视频帧，计算每帧的运动分数、内容密度、人脸检测结果
        2. 计算综合稳定性分数
        3. 筛选候选帧（静止、内容丰富、无遮挡）
        4. 按稳定性分数排序
        5. 时间轴去重：确保选中的帧在时间上有足够间隔
        
        注意：不强制提取固定数量的帧，只要找到符合条件的帧（板书完整且无遮挡）即可
        
        参数:
            video_bytes: 视频文件的字节流
            target_count: 最大提取帧数（默认5，实际可能返回更少）
            
        返回:
            candidates: 候选帧列表，按时间顺序排列
        """
        candidates: List[FrameCandidate] = []
        prev_gray: Optional[np.ndarray] = None
        frame_index = 0
        
        # 第一步：收集所有候选帧
        async for timestamp, frame in self._iter_video_frames(video_bytes):
            frame_index += 1
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # 计算各项指标
            motion_score = self._detect_motion(prev_gray, gray)
            content_density = self._calculate_content_density(frame)
            has_front_face = self._detect_face(gray)
            
            # 计算综合稳定性分数
            stability_score = self._calculate_stability_score(
                motion_score, content_density, has_front_face
            )
            
            # 筛选条件（更严格，确保板书完整且无遮挡）：
            # 1. 画面静止（运动分数小于阈值）
            # 2. 内容密度达到最小阈值
            # 3. 无遮挡（必须未检测到正脸，确保教师未遮挡板书）
            is_stable = motion_score < self.motion_threshold
            has_content = content_density >= self.min_content_density
            is_clear = not has_front_face  # 严格要求：必须无正脸（无遮挡）
            
            # 只选择同时满足三个条件的帧：静止、有内容、无遮挡
            if is_stable and has_content and is_clear:
                candidate = FrameCandidate(
                    frame=frame,
                    frame_index=frame_index,
                    timestamp=timestamp,
                    motion_score=motion_score,
                    content_density=content_density,
                    has_front_face=has_front_face,
                    stability_score=stability_score,
                )
                candidates.append(candidate)
            
            prev_gray = gray
        
        if not candidates:
            return []
        
        # 第二步：按稳定性分数排序
        candidates.sort(key=lambda x: x.stability_score, reverse=True)
        
        # 第三步：时间轴去重，选择时间间隔足够的帧
        # 不强制达到target_count，只要找到符合条件的帧即可
        selected: List[FrameCandidate] = []
        for candidate in candidates:
            # 检查与已选帧的时间间隔
            if not selected:
                selected.append(candidate)
            else:
                # 计算与最近已选帧的时间间隔（转换为采样帧数）
                min_interval_seconds = self.min_frames_interval / self.sample_fps
                time_since_last = abs(candidate.timestamp - selected[-1].timestamp)
                
                if time_since_last >= min_interval_seconds:
                    selected.append(candidate)
                    
                    # 如果已经选够最大数量，停止（但不强制）
                    if len(selected) >= target_count:
                        break
        
        # 如果去重后帧数不足target_count，也不强制补充
        # 只要找到符合条件的帧就返回（即使只有1张也可以）
        
        # 按时间戳排序，确保返回的帧按时间顺序
        selected.sort(key=lambda x: x.timestamp)
        
        return selected


class BlackboardEvaluator:
    """
    板书AI点评类
    
    使用GPT-4o多模态大模型对板书进行多维度评价：
    - 字迹工整度
    - 布局合理性
    - 逻辑清晰度
    """
    
    def __init__(
        self,
        api_base: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """
        初始化点评器
        
        参数:
            api_base: API基础URL（默认使用公司网关）
            api_key: API密钥（公司网关格式：APP_ID:APP_KEY）
        """
        # 优先使用环境变量，如果没有则使用传入参数
        # 默认使用公司网关地址
        self.api_base = api_base or os.getenv(
            "TAL_LLM_BASE", 
            "http://ai-service.tal.com/openai-compatible/v1"
        )
        
        # API密钥：优先使用环境变量，格式为 APP_ID:APP_KEY
        if api_key:
            self.api_key = api_key
        else:
            app_id = os.getenv("TAL_MLOPS_APP_ID", "")
            app_key = os.getenv("TAL_MLOPS_APP_KEY", "")
            if app_id and app_key:
                self.api_key = f"{app_id}:{app_key}"
            else:
                # 如果没有配置，尝试使用OPENAI_API_KEY（兼容OpenAI格式）
                self.api_key = os.getenv("OPENAI_API_KEY", "")
    
    def _encode_image(self, frame: np.ndarray) -> str:
        """
        将图像编码为base64字符串
        
        参数:
            frame: 图像数组（BGR格式）
            
        返回:
            base64_string: base64编码的字符串
        """
        # 编码为JPEG（OpenCV的imencode直接使用BGR格式）
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        image_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return image_base64
    
    async def evaluate_frame(self, frame: np.ndarray, frame_index: int) -> Dict:
        """
        对单张板书图片进行AI点评
        
        参数:
            frame: 图像数组
            frame_index: 帧索引（用于标识）
            
        返回:
            evaluation: 包含点评结果的字典
        """
        # 编码图像
        image_base64 = self._encode_image(frame)
        
        # 构建系统提示词
        system_prompt = (
            "你是一名资深教研员，专门负责评估教师的板书质量。\n"
            "请从以下三个维度对板书进行评价：\n"
            "1. **字迹工整度**（0-100分）：评估字迹是否清晰、工整、易读\n"
            "2. **布局合理性**（0-100分）：评估板书布局是否合理、层次分明、重点突出\n"
            "3. **逻辑清晰度**（0-100分）：评估板书内容的逻辑结构是否清晰、条理分明\n\n"
            "请以JSON格式返回评价结果，格式如下：\n"
            "{\n"
            '  "handwriting_score": int,      // 字迹工整度分数（0-100）\n'
            '  "layout_score": int,           // 布局合理性分数（0-100）\n'
            '  "logic_score": int,            // 逻辑清晰度分数（0-100）\n'
            '  "handwriting_comment": string, // 字迹工整度点评\n'
            '  "layout_comment": string,      // 布局合理性点评\n'
            '  "logic_comment": string,       // 逻辑清晰度点评\n'
            '  "overall_comment": string      // 总体评价\n'
            "}\n"
            "请只返回JSON，不要添加其他文字说明。"
        )
        
        # 构建请求payload（公司网关OpenAI兼容格式）
        # 注意：对于多模态消息（包含图片），content使用数组格式
        payload = {
            "model": "gpt-4o",  # 使用GPT-4o模型
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,  # 纯文本消息，content为字符串
                },
                {
                    "role": "user",
                    "content": [  # 多模态消息，content为数组
                        {
                            "type": "text",
                            "text": f"请对这张板书截图（第{frame_index}张）进行评价。",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}",
                            },
                        },
                    ],
                },
            ],
            "temperature": 0.3,  # 较低温度，保证评价一致性
            "max_tokens": 1000,
        }
        
        # 构建请求头（公司网关格式：Bearer APP_ID:APP_KEY）
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        # 默认返回值（API调用失败时使用）
        default_result = {
            "handwriting_score": 75,
            "layout_score": 75,
            "logic_score": 75,
            "handwriting_comment": "AI点评服务暂时不可用，使用默认评价。",
            "layout_comment": "AI点评服务暂时不可用，使用默认评价。",
            "logic_comment": "AI点评服务暂时不可用，使用默认评价。",
            "overall_comment": "AI点评服务暂时不可用，请检查API配置。",
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.api_base}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                
                if resp.status_code < 200 or resp.status_code >= 300:
                    print(
                        f"[BlackboardEvaluator] API调用失败: "
                        f"{resp.status_code} - {resp.text[:200]}"
                    )
                    return default_result
                
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                
                # 尝试解析JSON
                try:
                    import json
                    # 移除可能的markdown代码块标记
                    content = content.strip()
                    if content.startswith("```"):
                        # 找到第一个```和最后一个```
                        start = content.find("\n") + 1
                        end = content.rfind("```")
                        content = content[start:end].strip()
                    
                    evaluation = json.loads(content)
                    return evaluation
                except json.JSONDecodeError as e:
                    print(
                        f"[BlackboardEvaluator] JSON解析失败: {e}\n"
                        f"原始内容: {content[:500]}"
                    )
                    return default_result
                    
        except Exception as e:
            print(f"[BlackboardEvaluator] 点评异常: {repr(e)}")
            return default_result
    
    async def evaluate_frames(self, frames: List[FrameCandidate]) -> List[Dict]:
        """
        批量评价多张板书图片
        
        参数:
            frames: 帧候选列表
            
        返回:
            evaluations: 评价结果列表，每个元素对应一张图片的评价
        """
        evaluations = []
        
        for i, candidate in enumerate(frames, 1):
            print(f"[BlackboardEvaluator] 正在评价第 {i}/{len(frames)} 张板书...")
            evaluation = await self.evaluate_frame(candidate.frame, i)
            evaluations.append(evaluation)
        
        return evaluations

