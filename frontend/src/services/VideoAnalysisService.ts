/**
 * 视频分析后台服务
 * 确保API请求在组件卸载后继续运行
 */

import { VideoAnalysisTask } from "../store/VideoAnalysisStore";

export interface TaskUpdateCallback {
  (updates: Partial<VideoAnalysisTask>): void;
}

export interface TaskNotificationCallback {
  (taskId: string, message: string, type: "success" | "error" | "info"): void;
}

/**
 * 视频分析服务类
 * 管理后台任务，确保即使组件卸载，任务也能继续执行
 */
export class VideoAnalysisService {
  private static instance: VideoAnalysisService;
  private activeRequests: Map<string, AbortController> = new Map();
  private notificationCallbacks: Set<TaskNotificationCallback> = new Set();

  private constructor() {
    // 单例模式
  }

  static getInstance(): VideoAnalysisService {
    if (!VideoAnalysisService.instance) {
      VideoAnalysisService.instance = new VideoAnalysisService();
    }
    return VideoAnalysisService.instance;
  }

  /**
   * 注册通知回调
   */
  onNotification(callback: TaskNotificationCallback): () => void {
    this.notificationCallbacks.add(callback);
    return () => {
      this.notificationCallbacks.delete(callback);
    };
  }

  /**
   * 发送通知
   */
  private notify(taskId: string, message: string, type: "success" | "error" | "info"): void {
    this.notificationCallbacks.forEach((callback) => {
      try {
        callback(taskId, message, type);
      } catch (e) {
        console.error("通知回调执行失败:", e);
      }
    });
  }

  /**
   * 上传并分析视频
   */
  async analyzeVideo(
    taskId: string,
    file: File,
    teacherId: string,
    onUpdate: TaskUpdateCallback
  ): Promise<void> {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    const apiUrl = `${API_BASE_URL}/api/evaluate?lang=zh&teacher_id=${teacherId}`;

    // 创建AbortController，但不用于取消（允许后台继续）
    const abortController = new AbortController();
    this.activeRequests.set(taskId, abortController);

    try {
      onUpdate({ status: "uploading", progress: 10, error: null });

      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(apiUrl, {
        method: "POST",
        body: formData,
        // 不使用signal，让请求在后台继续
      });

      onUpdate({ status: "analyzing", progress: 50 });

      if (!resp.ok) {
        let errorMsg = `后端返回错误状态码: ${resp.status}`;
        try {
          const errorData = await resp.json();
          errorMsg += ` - ${JSON.stringify(errorData)}`;
        } catch {
          const errorText = await resp.text();
          if (errorText) {
            errorMsg += ` - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(errorMsg);
      }

      const data = await resp.json();
      onUpdate({ 
        status: "completed", 
        progress: 100, 
        result: data,
        completedTime: Date.now(),
        error: null 
      });

      // 检查是否为无板书场景
      const blackboardComment = data["LLM内容分析与改进建议"]?.["板书评价"] || 
                                data.llm_content_eval?.blackboard_comment;
      const isNoBlackboardScene = blackboardComment && 
        (blackboardComment.includes("无板书") || 
         blackboardComment.includes("电子教案") || 
         blackboardComment.includes("略过板书评估"));

      if (isNoBlackboardScene) {
        onUpdate({ 
          isNoBlackboard: true,
          blackboardFrames: [],
          extractingBlackboard: false 
        });
        this.notify(taskId, "视频分析完成（无板书场景）", "success");
      } else {
        // 有板书场景，自动提取板书截图
        onUpdate({ extractingBlackboard: true });
        await this.extractBlackboardFrames(taskId, file, teacherId, onUpdate);
        this.notify(taskId, "视频分析完成", "success");
      }
    } catch (err: any) {
      const errorMessage = err.message || "上传失败，请稍后重试";
      onUpdate({ 
        status: "error", 
        error: errorMessage,
        progress: 0 
      });
      this.notify(taskId, `分析失败: ${errorMessage}`, "error");
      console.error("视频分析错误:", err);
    } finally {
      this.activeRequests.delete(taskId);
    }
  }

  /**
   * 提取板书截图
   */
  async extractBlackboardFrames(
    taskId: string,
    videoFile: File,
    teacherId: string,
    onUpdate: TaskUpdateCallback
  ): Promise<void> {
    try {
      const formData = new FormData();
      formData.append("file", videoFile);
      formData.append("teacher_id", teacherId);

      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(`${API_BASE_URL}/api/extract-blackboard?teacher_id=${teacherId}`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.frames && data.frames.length > 0) {
          onUpdate({ 
            blackboardFrames: data.frames,
            extractingBlackboard: false 
          });
          console.log(`成功提取 ${data.frames.length} 张板书截图`);
        } else {
          onUpdate({ 
            extractingBlackboard: false,
            blackboardFrames: [] 
          });
          console.warn("提取板书截图失败：", data.error || "未提取到合适的板书帧");
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        console.warn("提取板书截图请求失败：", errorData.error || `HTTP ${response.status}`);
        onUpdate({ extractingBlackboard: false });
      }
    } catch (err) {
      console.error("提取板书失败：", err);
      onUpdate({ extractingBlackboard: false });
      // 不显示错误，因为这是自动提取，失败不影响主流程
    }
  }

  /**
   * 取消任务（可选，用于用户主动取消）
   */
  cancelTask(taskId: string): void {
    const controller = this.activeRequests.get(taskId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(taskId);
    }
  }

  /**
   * 获取所有活动任务ID
   */
  getActiveTaskIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }
}

// 导出单例实例
export const videoAnalysisService = VideoAnalysisService.getInstance();

