import io
from typing import Dict

import numpy as np
from pydub import AudioSegment


async def extract_audio_from_video(video_bytes: bytes) -> bytes:
    """
    使用 ffmpeg 从视频中提取音频轨道。
    这里演示使用 pydub 简化调用，实际生产建议使用 subprocess 直接调用 ffmpeg，
    并做好异常处理与格式兼容。
    """
    # 注意：需要系统已安装 ffmpeg，pydub 会自动调用
    video_file = AudioSegment.from_file(io.BytesIO(video_bytes))
    # 统一转换为单声道 16kHz，方便后续 ASR 和特征分析
    audio = video_file.set_frame_rate(16000).set_channels(1)
    buf = io.BytesIO()
    audio.export(buf, format="wav")
    return buf.getvalue()


async def analyze_audio_features(audio_bytes: bytes) -> Dict:
    """
    对音频做基础分析：
    - 平均音量（dBFS）
    - 音量动态范围
    - 粗略音高方差（简单过零率或周期估计，示例化实现）
    - 长停顿检测（静音段）
    """
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format="wav")

    # 1) 平均音量（dBFS）
    avg_loudness_db = float(audio.dBFS)

    # 2) 动态范围（简单用 max_dB - min_dB 估计）
    # 将音频切成短帧做分帧分析
    frame_ms = 200  # 200ms 一帧
    loudness_list = []
    silence_threshold_db = -40  # 小于该阈值视为静音
    long_pause_count = 0
    current_silence_ms = 0

    for i in range(0, len(audio), frame_ms):
        frame = audio[i : i + frame_ms]
        if len(frame) == 0:
            continue
        l = frame.dBFS
        loudness_list.append(l)
        if l < silence_threshold_db:
            current_silence_ms += frame_ms
        else:
            # 如果静音时间超过 2000ms 记为一次长停顿
            if current_silence_ms >= 2000:
                long_pause_count += 1
            current_silence_ms = 0

    if current_silence_ms >= 2000:
        long_pause_count += 1

    if loudness_list:
        dynamic_range = float(max(loudness_list) - min(loudness_list))
    else:
        dynamic_range = 0.0

    # 3) 粗略音高方差（这里给出一个近似示例：使用短时自相关估计 F0）
    #   为了避免引入 librosa 造成示例过重，使用简单过零率作为“音高动态”的 proxy
    samples = np.array(audio.get_array_of_samples()).astype(np.float32)
    # 正常化
    samples = samples / (np.max(np.abs(samples)) + 1e-9)
    frame_len = int(0.03 * audio.frame_rate)  # 30ms
    hop_len = int(0.01 * audio.frame_rate)  # 10ms
    zcr_list = []
    for start in range(0, len(samples) - frame_len, hop_len):
        frame = samples[start : start + frame_len]
        zero_crossings = np.sum(np.abs(np.diff(np.sign(frame)))) / 2.0
        zcr = zero_crossings / frame_len
        zcr_list.append(zcr)
    if zcr_list:
        pitch_variance = float(np.var(zcr_list))
    else:
        pitch_variance = 0.0

    return {
        "avg_loudness_db": avg_loudness_db,
        "dynamic_range": dynamic_range,
        "pitch_variance": pitch_variance,
        "long_pause_count": long_pause_count,
    }


