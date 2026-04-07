import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

/**
 * 视频分析任务状态
 */
export interface VideoAnalysisTask {
  id: string; // 任务唯一ID
  teacherId: string;
  fileName: string;
  file: File | null; // 文件对象（可能为null，如果是从历史记录恢复）
  status: "idle" | "uploading" | "analyzing" | "extracting_blackboard" | "completed" | "error";
  progress: number; // 0-100
  error: string | null;
  result: any | null;
  blackboardFrames: any[];
  extractingBlackboard: boolean;
  isNoBlackboard: boolean;
  startTime: number; // 任务开始时间戳
  completedTime?: number; // 任务完成时间戳
}

/**
 * 全局视频分析状态
 */
interface VideoAnalysisState {
  tasks: VideoAnalysisTask[]; // 所有任务列表（支持多任务）
  activeTaskId: string | null; // 当前活动的任务ID
}

interface VideoAnalysisContextType {
  state: VideoAnalysisState;
  // 创建新任务
  createTask: (teacherId: string, file: File) => string;
  // 更新任务状态
  updateTask: (taskId: string, updates: Partial<VideoAnalysisTask>) => void;
  // 获取任务
  getTask: (taskId: string) => VideoAnalysisTask | undefined;
  // 获取当前活动任务
  getActiveTask: () => VideoAnalysisTask | undefined;
  // 设置活动任务
  setActiveTask: (taskId: string | null) => void;
  // 清除任务
  clearTask: (taskId: string) => void;
  // 清除所有任务
  clearAllTasks: () => void;
  // 获取指定教师的所有任务
  getTasksByTeacher: (teacherId: string) => VideoAnalysisTask[];
}

const VideoAnalysisContext = createContext<VideoAnalysisContextType | undefined>(undefined);

/**
 * VideoAnalysisProvider - 提供全局视频分析状态管理
 */
export const VideoAnalysisProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<VideoAnalysisState>(() => {
    // 从localStorage恢复状态（可选，仅恢复已完成的任务）
    try {
      const saved = localStorage.getItem("videoAnalysisTasks");
      if (saved) {
        const parsed = JSON.parse(saved);
        // 只恢复已完成的任务，不恢复进行中的任务
        const completedTasks = parsed.tasks?.filter((t: VideoAnalysisTask) => 
          t.status === "completed" || t.status === "error"
        ) || [];
        return {
          tasks: completedTasks,
          activeTaskId: parsed.activeTaskId || null,
        };
      }
    } catch (e) {
      console.warn("恢复视频分析状态失败:", e);
    }
    return {
      tasks: [],
      activeTaskId: null,
    };
  });

  // 持久化到localStorage（仅保存已完成的任务，排除File对象）
  useEffect(() => {
    const completedTasks = state.tasks
      .filter((t) => t.status === "completed" || t.status === "error")
      .map(({ file, ...taskWithoutFile }) => taskWithoutFile); // 排除File对象，因为无法序列化
    try {
      localStorage.setItem(
        "videoAnalysisTasks",
        JSON.stringify({
          tasks: completedTasks,
          activeTaskId: state.activeTaskId,
        })
      );
    } catch (e) {
      console.warn("保存视频分析状态失败:", e);
    }
  }, [state]);

  const createTask = useCallback((teacherId: string, file: File): string => {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTask: VideoAnalysisTask = {
      id: taskId,
      teacherId,
      fileName: file.name,
      file,
      status: "idle",
      progress: 0,
      error: null,
      result: null,
      blackboardFrames: [],
      extractingBlackboard: false,
      isNoBlackboard: false,
      startTime: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      tasks: [...prev.tasks, newTask],
      activeTaskId: taskId,
    }));

    return taskId;
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<VideoAnalysisTask>) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      ),
    }));
  }, []);

  const getTask = useCallback(
    (taskId: string): VideoAnalysisTask | undefined => {
      return state.tasks.find((t) => t.id === taskId);
    },
    [state.tasks]
  );

  const getActiveTask = useCallback((): VideoAnalysisTask | undefined => {
    if (!state.activeTaskId) return undefined;
    return state.tasks.find((t) => t.id === state.activeTaskId);
  }, [state.activeTaskId, state.tasks]);

  const setActiveTask = useCallback((taskId: string | null) => {
    setState((prev) => ({
      ...prev,
      activeTaskId: taskId,
    }));
  }, []);

  const clearTask = useCallback((taskId: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
      activeTaskId: prev.activeTaskId === taskId ? null : prev.activeTaskId,
    }));
  }, []);

  const clearAllTasks = useCallback(() => {
    setState({
      tasks: [],
      activeTaskId: null,
    });
    localStorage.removeItem("videoAnalysisTasks");
  }, []);

  const getTasksByTeacher = useCallback(
    (teacherId: string): VideoAnalysisTask[] => {
      return state.tasks.filter((t) => t.teacherId === teacherId);
    },
    [state.tasks]
  );

  const value: VideoAnalysisContextType = {
    state,
    createTask,
    updateTask,
    getTask,
    getActiveTask,
    setActiveTask,
    clearTask,
    clearAllTasks,
    getTasksByTeacher,
  };

  return (
    <VideoAnalysisContext.Provider value={value}>
      {children}
    </VideoAnalysisContext.Provider>
  );
};

/**
 * Hook to use video analysis context
 */
export const useVideoAnalysis = () => {
  const context = useContext(VideoAnalysisContext);
  if (!context) {
    throw new Error("useVideoAnalysis must be used within VideoAnalysisProvider");
  }
  return context;
};

