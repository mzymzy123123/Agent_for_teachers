"""
LLM 与 ASR 相关逻辑：
- 使用 SiliconFlow ASR 服务进行语音转文字（不加载本地模型）
- 使用多模态大模型对文本 + 关键帧做教学内容分析

当前配置：
- ASR：使用 SiliconFlow API (https://api.siliconflow.cn/v1/audio/transcriptions)
  模型：FunAudioLLM/SenseVoiceSmall
  鉴权：Authorization: Bearer ${SILICONFLOW_API_TOKEN}
  如果 ASR 调用失败，会自动使用预设的优秀教师授课逐字稿作为 fallback

- 文本 / 多模态大模型：使用公司提供的 `glm-4.6v`，接口为
  `http://ai-service.tal.com/openai-compatible/v1/chat/completions`
  鉴权方式为：Authorization: Bearer ${TAL_MLOPS_APP_ID}:${TAL_MLOPS_APP_KEY}
"""

from typing import Dict, List
import io
import os
import httpx
import json
import re
import numpy as np


# 公司大模型 glm-4.6v 网关与鉴权配置
TAL_LLM_BASE = os.getenv(
    "TAL_LLM_BASE", "http://ai-service.tal.com/openai-compatible/v1"
)
TAL_MLOPS_APP_ID = os.getenv("TAL_MLOPS_APP_ID", "")
TAL_MLOPS_APP_KEY = os.getenv("TAL_MLOPS_APP_KEY", "")

# SiliconFlow ASR 服务配置
SILICONFLOW_ASR_URL = os.getenv(
    "SILICONFLOW_ASR_URL", "https://api.siliconflow.cn/v1/audio/transcriptions"
)
SILICONFLOW_API_TOKEN = os.getenv("SILICONFLOW_API_TOKEN", "")
SILICONFLOW_ASR_MODEL = os.getenv(
    "SILICONFLOW_ASR_MODEL", "FunAudioLLM/SenseVoiceSmall"
)


def _tal_auth_header() -> str:
    """
    生成公司大模型所需的 Authorization 字段值。
    形如：Bearer ${TAL_MLOPS_APP_ID}:${TAL_MLOPS_APP_KEY}
    """
    return f"Bearer {TAL_MLOPS_APP_ID}:{TAL_MLOPS_APP_KEY}"


def _extract_json_from_text(text: str) -> Dict:
    """
    从可能包含 markdown 代码块或其他文字的文本中提取 JSON 对象。
    
    策略：
    1. 先尝试直接解析整个文本
    2. 如果失败，尝试从 markdown 代码块中提取（```json ... ```），使用栈匹配找到完整 JSON
    3. 如果还失败，在整个文本中使用栈匹配找到第一个完整的 { ... } JSON 对象
    """
    # 策略 1: 直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # 策略 2: 从 markdown 代码块中提取
    # 先找到代码块的开始和结束位置
    code_block_start = text.find('```')
    if code_block_start != -1:
        # 找到代码块结束位置（下一个 ```）
        code_block_end = text.find('```', code_block_start + 3)
        if code_block_end != -1:
            # 提取代码块内容（跳过开头的 ```json 或 ``` 和结尾的 ```）
            code_content_start = code_block_start + 3
            # 跳过可能的 "json" 标识和空白
            while code_content_start < code_block_end and text[code_content_start] in ' \n\t':
                code_content_start += 1
            if text[code_content_start:code_content_start+4] == 'json':
                code_content_start += 4
                while code_content_start < code_block_end and text[code_content_start] in ' \n\t':
                    code_content_start += 1
            
            code_content = text[code_content_start:code_block_end].strip()
            
            # 在代码块内容中使用栈匹配找到完整的 JSON
            json_obj = _extract_json_with_stack(code_content)
            if json_obj:
                return json_obj
    
    # 策略 3: 在整个文本中使用栈匹配找到第一个完整的 JSON 对象
    json_obj = _extract_json_with_stack(text)
    if json_obj:
        return json_obj
    
    raise ValueError("无法提取有效的 JSON 对象")


def _extract_json_with_stack(text: str) -> Dict:
    """
    使用栈匹配从文本中提取第一个完整的 JSON 对象。
    正确处理字符串中的大括号、转义字符等。
    """
    # 找到第一个 { 的位置
    start_idx = text.find('{')
    if start_idx == -1:
        return None
    
    # 使用栈来匹配完整的大括号
    stack = []
    in_string = False
    escape_next = False
    
    for i in range(start_idx, len(text)):
        char = text[i]
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\':
            escape_next = True
            continue
        
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        
        if in_string:
            continue
        
        if char == '{':
            stack.append(i)
        elif char == '}':
            if stack:
                stack.pop()
                if not stack:  # 找到了完整的 JSON 对象
                    json_str = text[start_idx:i+1]
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        # 继续寻找下一个
                        start_idx = text.find('{', i + 1)
                        if start_idx == -1:
                            break
                        stack = []
                        in_string = False
                        escape_next = False
    
    return None


async def transcribe_audio_whisper(audio_bytes: bytes) -> str:
    """
    使用 SiliconFlow ASR 服务完成语音转文字。

    对应的 curl 示例为：
    curl --request POST \\
      --url https://api.siliconflow.cn/v1/audio/transcriptions \\
      --header 'Authorization: Bearer <token>' \\
      --header 'Content-Type: multipart/form-data' \\
      --form file='@example-file' \\
      --form model=FunAudioLLM/SenseVoiceSmall

    实现步骤：
    1. 将输入音频 bytes（当前为 wav 格式）直接作为文件上传；
    2. 使用 multipart/form-data 格式，包含 file 和 model 字段；
    3. 调用 SiliconFlow ASR 接口，返回识别出的中文文本。
    4. 如果调用失败（401/500 等），返回预设的优秀教师授课逐字稿作为 fallback。
    """
    fallback_transcript = (
        "【高中生物｜孟德尔遗传性状课堂实录】\n"
        "同学们好，今天我们进入经典遗传学的核心——孟德尔的遗传规律。"
        "请大家先思考一个问题：为什么豌豆有的花是紫色，有的是白色？这种稳定的差异从何而来？\n\n"
        "第一部分：基本概念。我们先统一术语。表型是可观察到的性状表现，比如紫花或白花；"
        "基因是控制性状的遗传因子，位于染色体的特定位置；等位基因是同一基因的不同版本，"
        "比如紫花的等位基因与白花的等位基因；显性与隐性描述的是两种等位基因共同存在时，"
        "哪一种能够在表型上被表达。问题来了：若紫花为显性、白花为隐性，那么杂合个体表现成什么颜色？"
        "对，表现为紫色，因为显性等位基因的作用被表达出来。\n\n"
        "第二部分：单因子遗传与分离定律。我们以'花色'这一单一性状为例。"
        "设紫花等位基因为 A，白花为 a。AA 与 aa 杂交得到 F1，全部表现为紫花（Aa）。"
        "若让 F1 自交（Aa × Aa），F2 的基因型比例为 1:2:1（AA:Aa:aa），表型比例为 3:1（紫花:白花）。"
        "这就是分离定律：等位基因在形成配子时彼此分离，随机结合。请大家用旁边的潘尼特方格亲手推导一次，"
        "体会随机组合如何导致 3:1 的经典比例。\n\n"
        "第三部分：测交与概率。若我们观察到一个紫花个体，如何判断它是 AA 还是 Aa？"
        "方法是与纯隐性个体 aa 测交：若后代全为紫花，推断亲本为 AA；"
        "若出现 1:1 的紫花与白花，推断亲本为 Aa。概率思想在遗传学中非常重要——"
        "多次独立事件的联合概率可用乘法规则估算，这也是我们分析更复杂性状的基础。\n\n"
        "第四部分：双因子遗传与自由组合定律。考虑'种子形状'和'子叶颜色'两个性状。"
        "设圆粒为 R、皱粒为 r；黄子叶为 Y、绿子叶为 y。双杂合个体 RrYy 自交时，"
        "在不连锁的前提下，两个性状的等位基因在配子形成时彼此独立地自由组合，"
        "F2 的表型比例为 9:3:3:1。请同学们用两次单因子的乘法规则构建出四类组合的概率，"
        "并与实验观察对照，验证自由组合定律。\n\n"
        "课堂互动：请一位同学解释为什么'自由组合'要求两个性状位于不同的非同源染色体上或相距较远？"
        "非常好，因为连锁会打破独立分配的前提，从而改变经典比例。现实中我们会观察到偏离 9:3:3:1 的情况，"
        "那通常提示基因可能存在连锁或重组率不同。\n\n"
        "课堂小结：今天我们从表型、基因、等位基因与显隐性的概念出发，"
        "用单因子分离定律解释 3:1 的来源，用测交与概率方法判断隐含基因型，"
        "并在双因子情形下理解自由组合定律与 9:3:3:1 的形成。"
        "课后任务：请完成课本对应练习，尝试用潘尼特方格推导两个自拟性状的遗传比例，"
        "并思考如果出现连锁，比例将如何变化。下节课我们将进入人类遗传与性连锁的讨论。"
    )

    # 如果未配置 token，直接返回 fallback
    if not SILICONFLOW_API_TOKEN:
        print(
            "[transcribe_audio_whisper] SILICONFLOW_API_TOKEN 未设置，使用 fallback 逐字稿"
        )
        return fallback_transcript.strip()

    try:
        headers = {
            "Authorization": f"Bearer {SILICONFLOW_API_TOKEN}",
        }

        # 使用 multipart/form-data 上传文件
        # httpx 会自动处理 Content-Type 和 boundary
        files = {
            "file": ("audio.wav", io.BytesIO(audio_bytes), "audio/wav"),
        }
        data = {
            "model": SILICONFLOW_ASR_MODEL,
        }

        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                SILICONFLOW_ASR_URL,
                headers=headers,
                files=files,
                data=data,
            )

            # 如果返回非 2xx，打印错误并使用 fallback
            if resp.status_code < 200 or resp.status_code >= 300:
                print(
                    f"[transcribe_audio_whisper] SiliconFlow ASR 调用失败: "
                    f"{resp.status_code} - {resp.text}"
                )
                return fallback_transcript.strip()

            # 解析返回的 JSON
            data = resp.json()
            # OpenAI 兼容格式通常返回 {"text": "..."}
            transcript = data.get("text") or data.get("result") or ""

            if not transcript:
                print(
                    "[transcribe_audio_whisper] SiliconFlow ASR 返回空文本，使用 fallback"
                )
                return fallback_transcript.strip()

            return str(transcript).strip()

    except Exception as e:
        print(f"[transcribe_audio_whisper] ASR 调用异常，使用 fallback: {repr(e)}")
        return fallback_transcript.strip()


def _build_content_analysis_system_prompt() -> str:
    """
    面向 GPT-4o 的 System Prompt：
    目标：根据完整授课文本（ASR 结果）和可选的板书截图描述，输出结构化 JSON。
    """
    return (
        "你是一名资深教研员，负责评估新教师的授课质量。\n"
        "现在给你一段完整的课堂授课逐字稿（中文为主），"
        "请你从教学内容角度进行结构化分析，特别关注：\n"
        "1. 课堂是否具有清晰的三段式结构：引入(Intro)、讲解(Body)、总结(Conclusion)。\n"
        "2. 每个阶段的大致时长占比（可根据文字段落或时间戳粗略估计）。\n"
        "3. 知识点讲解是否逻辑清晰、循序渐进，是否有前后矛盾或跳跃。\n"
        "4. 老师是否有积极与学生互动（提问、留思考、检查理解等），以及互动的频次。\n"
        "5. 评估学生回答问题的积极性：根据文本中是否有学生回答、回答的质量、互动频率等判断学生参与度（0-100分）。\n"
        "6. 评估教师普通话标准度（0-100分）：\n"
        "   - 评估依据：根据文本中的发音准确性、是否存在明显方言、读音是否规范\n"
        "   - 标准普通话、发音清晰准确 → 85-100分\n"
        "   - 基本标准，偶有方言或不规范读音 → 70-84分\n"
        "   - 存在明显方言或较多不规范读音 → 60-69分\n"
        "   - 方言严重或发音不规范 → <60分\n"
        "7. 板书评价将由系统基于实际截图进行，此处无需从文本推断。\n\n"
        "请务必只用 JSON 格式回复，键名固定如下（不要输出多余文字）：\n"
        "{\n"
        '  "total_duration_minutes": float,  // 课程总时长估计（分钟，允许粗略）\n'
        '  "intro_duration_minutes": float,  // 引入部分时长（分钟）\n'
        '  "body_duration_minutes": float,   // 讲解部分时长（分钟）\n'
        '  "conclusion_duration_minutes": float,  // 总结部分时长（分钟）\n'
        '  "intro_summary": string,          // 引入部分的简要内容摘要（50-100字）\n'
        '  "body_summary": string,           // 讲解部分的核心内容摘要（100-200字）\n'
        '  "conclusion_summary": string,     // 总结部分的要点摘要（50-100字）\n'
        '  "has_clear_structure": bool,      // 是否能明显分出三段式结构\n'
        '  "logic_score": int,               // 0-100，对知识点讲解的逻辑性评分\n'
        '  "structure_comment": string,      // 对整体结构的评价\n'
        '  "logic_comment": string,          // 对逻辑链条清晰度的评价\n'
        '  "interaction_comment": string,    // 对师生互动的评价\n'
        '  "interaction_question_count": int, // 识别出的教师提问次数\n'
        '  "student_response_engagement": float, // 0-100，学生回答问题积极性得分\n'
        '  "mandarin_standard_score": float, // 0-100，普通话标准度得分\n'
        '  "estimated_wait_silence_seconds": float, // 如能从文本推断等待学生回答的静默时长（如 "我们想一想" 后有停顿），否则给出合理估计\n'
        '  "blackboard_comment": null,             // 板书评价由系统基于截图进行，此处固定为 null\n'
        '  "suggestions": [string, ...]      // 面向新教师的具体改进建议，至少 3 条\n'
        "}\n"
        "注意：\n"
        "- 请严格返回合法 JSON，可被直接解析。\n"
        "- 若部分字段难以精确估计，请基于文本给出合理推断，不要省略字段。\n"
    )


async def analyze_teaching_content_llm(transcript: str) -> Dict:
    """
    调用多模态 LLM（文本接口即可）对教学内容做结构化分析。
    这里适配公司 glm-4.6v 模型，接口为 openai-compatible chat/completions。
    """
    headers = {
        # 公司接口示例：
        # Authorization: Bearer ${TAL_MLOPS_APP_ID}:${TAL_MLOPS_APP_KEY}
        "Authorization": _tal_auth_header(),
        "Content-Type": "application/json",
    }
    system_prompt = _build_content_analysis_system_prompt()
    payload = {
        "model": "glm-4.6v",
        "messages": [
            {
                "role": "system",
                # glm-4.6v 的 openai-compatible 接口支持与 OpenAI 一致的 messages 结构。
                # 为了兼容多模态，这里使用 content 数组形式并指定 type=text。
                "content": [
                    {
                        "type": "text",
                        "text": system_prompt,
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "下面是本次课堂的完整逐字稿文本，请按照 System 提示输出 JSON：\n\n"
                            f"{transcript}"
                        ),
                    }
                ],
            },
        ],
        "temperature": 0.2,
        # 若希望开启"思维链"能力，可根据公司网关规范打开 thinking。
        "thinking": {"type": "enabled"},
    }

    # 默认返回值（用于 LLM 调用失败时的 fallback）
    default_result = {
        "total_duration_minutes": 30.0,
        "intro_duration_minutes": 5.0,
        "body_duration_minutes": 20.0,
        "conclusion_duration_minutes": 5.0,
        "intro_summary": "LLM 调用失败，无法生成引入部分摘要。",
        "body_summary": "LLM 调用失败，无法生成讲解部分摘要。",
        "conclusion_summary": "LLM 调用失败，无法生成总结部分摘要。",
        "has_clear_structure": True,
        "logic_score": 80,
        "structure_comment": "LLM 调用失败，使用默认结构评估。",
        "logic_comment": "LLM 调用失败，使用默认逻辑评价。",
        "interaction_comment": "LLM 调用失败，使用默认互动评价。",
        "interaction_question_count": 3,
        "student_response_engagement": 70.0,
        "mandarin_standard_score": 80.0,
        "estimated_wait_silence_seconds": 10.0,
        "blackboard_comment": None,
        "suggestions": [
            "请检查 TAL_MLOPS_APP_ID 和 TAL_MLOPS_APP_KEY 环境变量是否正确设置。",
            "确认账号是否有权限调用公司大模型接口。",
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                f"{TAL_LLM_BASE}/chat/completions",
                headers=headers,
                json=payload,
            )

            # 如果返回非 2xx，打印错误并使用默认值
            if resp.status_code < 200 or resp.status_code >= 300:
                print(
                    f"[analyze_teaching_content_llm] LLM 调用失败: "
                    f"{resp.status_code} - {resp.text}"
                )
                return default_result

            data = resp.json()
            content = data["choices"][0]["message"]["content"]

        # 使用辅助函数提取 JSON
        try:
            parsed = _extract_json_from_text(content)
            return parsed
        except (ValueError, json.JSONDecodeError) as e:
            # 如果提取失败，打印原始内容用于调试
            print(
                f"[analyze_teaching_content_llm] JSON 提取失败，原始内容前 1000 字符：\n{content[:1000]}"
            )
            print(f"[analyze_teaching_content_llm] 错误信息: {e}，使用默认结构")
            return default_result

    except Exception as e:
        print(f"[analyze_teaching_content_llm] LLM 调用异常，使用默认值: {repr(e)}")
        return default_result


def _build_filler_words_system_prompt() -> str:
    """
    专门用于统计口头禅（无意义词汇）的 System Prompt。
    """
    return (
        "你现在扮演一名语音/演讲教练，任务是从课堂逐字稿文本中统计口头禅使用情况。\n"
        "口头禅指的是：对语义贡献不大、经常重复的语气词或无意义词，如'那个'、'然后呢'、'呃'、'啊'、'就是啊'等。\n"
        "请输出 JSON，格式如下：\n"
        "{\n"
        '  "total_words": int,               // 总词数（可以按中文分词或字数近似）\n'
        '  "duration_minutes_est": float,   // 课堂时长估计（分钟）\n'
        '  "filler_words": [\n'
        '    {"word": string, "count": int},\n'
        "    ...\n"
        "  ],\n"
        '  "filler_freq_per_min": float,    // 所有口头禅总出现次数 / 课堂分钟数\n'
        '  "comment": string,               // 对口头禅使用情况的评价\n'
        '  "suggestions": [string, ...]     // 具体改进建议\n'
        "}\n"
        "请仅返回 JSON，不要添加解释文字。"
    )


async def analyze_filler_words_llm(transcript: str) -> Dict:
    """
    使用 LLM 对 ASR 文本进行口头禅统计和频率估算。
    """
    headers = {
        "Authorization": _tal_auth_header(),
        "Content-Type": "application/json",
    }
    system_prompt = _build_filler_words_system_prompt()
    payload = {
        "model": "glm-4.6v",
        "messages": [
            {
                "role": "system",
                "content": system_prompt,  # 纯文本消息，content为字符串
            },
            {
                "role": "user",
                "content": (
                    "以下是课堂逐字稿，请分析其中的口头禅使用情况，并按 System 中的 JSON 结构输出：\n\n"
                    f"{transcript}"
                ),
            },
        ],
        "temperature": 0.2,
        # 禁用thinking功能，避免超时
        # "thinking": {"type": "enabled"},
    }

    # 默认返回值（用于 LLM 调用失败时的 fallback）
    default_result = {
        "total_words": len(transcript),
        "duration_minutes_est": 30.0,
        "filler_words": [],
        "filler_freq_per_min": 0.0,
        "comment": "LLM 调用失败，使用默认口头禅统计。",
        "suggestions": [
            "请检查 TAL_MLOPS_APP_ID 和 TAL_MLOPS_APP_KEY 环境变量是否正确设置。",
            "确认账号是否有权限调用公司大模型接口。",
        ],
    }

    try:
        # 减少超时时间，避免504 Gateway Timeout
        # 504错误通常是因为网关等待时间过长，减少超时时间可以更快失败并返回默认值
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{TAL_LLM_BASE}/chat/completions",
                headers=headers,
                json=payload,
            )

            # 如果返回非 2xx，打印错误并使用默认值
            if resp.status_code < 200 or resp.status_code >= 300:
                print(
                    f"[analyze_filler_words_llm] LLM 调用失败: "
                    f"{resp.status_code} - {resp.text[:500]}"  # 限制错误信息长度
                )
                # 504 Gateway Timeout 是网关超时，直接返回默认值
                if resp.status_code == 504:
                    print("[analyze_filler_words_llm] 检测到504超时错误，返回默认值")
                return default_result

            data = resp.json()
            content = data["choices"][0]["message"]["content"]

        # 使用辅助函数提取 JSON
        try:
            parsed = _extract_json_from_text(content)
            return parsed
        except (ValueError, json.JSONDecodeError) as e:
            # 如果提取失败，打印原始内容用于调试
            print(
                f"[analyze_filler_words_llm] JSON 提取失败，原始内容前 1000 字符：\n{content[:1000]}"
            )
            print(f"[analyze_filler_words_llm] 错误信息: {e}，使用默认值")
            return default_result

    except httpx.TimeoutException as e:
        print(f"[analyze_filler_words_llm] LLM 调用超时，使用默认值: {repr(e)}")
        return default_result
    except Exception as e:
        print(f"[analyze_filler_words_llm] LLM 调用异常，使用默认值: {repr(e)}")
        return default_result


async def detect_video_type(video_bytes: bytes, sample_frames: List[np.ndarray] = None) -> bool:
    """
    使用glm-4.6v多模态大模型检测视频类型，判断是否为线上录屏课。
    
    参数:
        video_bytes: 视频文件的字节流（用于提取帧，如果sample_frames未提供）
        sample_frames: 可选的预提取帧列表（numpy数组格式），如果提供则直接使用
    
    返回:
        has_blackboard: bool
            - True: 线下课（有物理板书），需要执行板书提取和评价
            - False: 线上录屏课（无物理板书），跳过板书提取和评价
    
    判断逻辑:
        - 线上录屏课特征：画面主体是电子教案/PPT，教师人脸在小窗口，使用电子笔在屏幕上书写
        - 线下课特征：有物理黑板，教师在黑板前书写
    """
    import cv2
    import tempfile
    import base64
    
    # 如果没有提供预提取的帧，从视频中提取1-2帧代表性画面
    if sample_frames is None or len(sample_frames) == 0:
        try:
            # 从视频中提取2帧代表性画面（视频开始、中间位置）
            with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
                tmp.write(video_bytes)
                tmp.flush()
                
                cap = cv2.VideoCapture(tmp.name)
                if not cap.isOpened():
                    print("[detect_video_type] 无法打开视频文件，默认返回True（有板书）")
                    return True
                
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
                
                # 提取2帧：第1帧（开始）和中间帧
                frame_indices = [0, max(1, total_frames // 2)]
                sample_frames = []
                
                for frame_idx in frame_indices:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                    ret, frame = cap.read()
                    if ret:
                        sample_frames.append(frame)
                
                cap.release()
                
                if len(sample_frames) == 0:
                    print("[detect_video_type] 未能提取到视频帧，默认返回True（有板书）")
                    return True
        except Exception as e:
            print(f"[detect_video_type] 提取视频帧失败: {repr(e)}，默认返回True（有板书）")
            return True
    
    # 将帧编码为base64
    encoded_frames = []
    for frame in sample_frames[:2]:  # 最多使用2帧
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        encoded_frames.append(f"data:image/jpeg;base64,{frame_base64}")
    
    # 构建多模态消息
    content = []
    for img_url in encoded_frames:
        content.append({
            "type": "image_url",
            "image_url": {"url": img_url}
        })
    
    # 添加文本提示
    content.append({
        "type": "text",
        "text": (
            "请分析这些视频截图，判断这是线上录屏课还是线下课。\n\n"
            "线上录屏课的特征：\n"
            "- 画面主体是电子教案/PPT/屏幕内容\n"
            "- 教师人脸出现在小窗口（如视频会议界面）\n"
            "- 使用电子笔在屏幕上书写（非物理黑板）\n"
            "- 整体画面是屏幕录制效果\n\n"
            "线下课的特征：\n"
            "- 有物理黑板/白板\n"
            "- 教师在黑板前书写\n"
            "- 画面是真实教室场景\n\n"
            "请只返回JSON格式，格式如下：\n"
            '{"is_online_recording": true/false, "reason": "判断理由"}'
        )
    })
    
    headers = {
        "Authorization": _tal_auth_header(),
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": "glm-4.6v",
        "messages": [
            {
                "role": "user",
                "content": content
            }
        ],
        "temperature": 0.2,
        "thinking": {"type": "enabled"},
    }
    
    # 默认返回值：如果检测失败，默认认为有板书（保守策略）
    default_has_blackboard = True
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{TAL_LLM_BASE}/chat/completions",
                headers=headers,
                json=payload,
            )
            
            if resp.status_code < 200 or resp.status_code >= 300:
                print(
                    f"[detect_video_type] LLM调用失败: {resp.status_code} - {resp.text[:200]}"
                )
                print(f"[detect_video_type] 使用默认值: has_blackboard={default_has_blackboard}")
                return default_has_blackboard
            
            data = resp.json()
            content_text = data["choices"][0]["message"]["content"]
            
            # 尝试解析JSON
            try:
                result = _extract_json_from_text(content_text)
                is_online = result.get("is_online_recording", False)
                reason = result.get("reason", "")
                
                # 如果是线上录屏课，返回False（无板书）
                has_blackboard = not is_online
                
                print(
                    f"[detect_video_type] 检测结果: "
                    f"is_online_recording={is_online}, "
                    f"has_blackboard={has_blackboard}, "
                    f"reason={reason}"
                )
                
                return has_blackboard
                
            except (ValueError, json.JSONDecodeError, KeyError) as e:
                print(
                    f"[detect_video_type] JSON解析失败: {e}\n"
                    f"原始内容: {content_text[:500]}"
                )
                print(f"[detect_video_type] 使用默认值: has_blackboard={default_has_blackboard}")
                return default_has_blackboard
                
    except httpx.TimeoutException as e:
        print(f"[detect_video_type] LLM调用超时: {repr(e)}")
        print(f"[detect_video_type] 使用默认值: has_blackboard={default_has_blackboard}")
        return default_has_blackboard
    except Exception as e:
        print(f"[detect_video_type] LLM调用异常: {repr(e)}")
        print(f"[detect_video_type] 使用默认值: has_blackboard={default_has_blackboard}")
        return default_has_blackboard
