import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, FileText, History, Users } from "lucide-react";
import SmartLessonUploader from "./components/SmartLessonUploader";
import TeacherLogin from "./components/TeacherLogin";
import PPTAnalyzer from "./components/PPTAnalyzer";
import HistoryList from "./components/HistoryList";
import EvaluationReportView from "./components/EvaluationReportView";
import CommunityFeed from "./components/CommunityFeed";
import AdminDashboard from "./components/AdminDashboard";
import { VideoAnalysisProvider } from "./store/VideoAnalysisStore";
import { ToastContainer, useToast } from "./components/Toast";
import { videoAnalysisService } from "./services/VideoAnalysisService";

type TabType = "video" | "ppt" | "history" | "community";

// App内容组件（内部使用Toast）
const AppContent: React.FC = () => {
  const [teacherId, setTeacherId] = useState<string | null>(
    localStorage.getItem("teacherId")
  );
  const [activeTab, setActiveTab] = useState<TabType>("video");
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<number | null>(null);
  const { toasts, showToast, closeToast } = useToast();
  
  // 检查是否是管理员
  const isAdmin = teacherId === "root";

  // 注册视频分析服务的通知回调
  useEffect(() => {
    const unsubscribe = videoAnalysisService.onNotification((taskId, message, type) => {
      showToast(message, type, type === "error" ? 5000 : 3000);
    });
    return unsubscribe;
  }, [showToast]);

  const handleLogin = (id: string) => {
    setTeacherId(id);
    localStorage.setItem("teacherId", id);
  };

  const handleLogout = () => {
    setTeacherId(null);
    localStorage.removeItem("teacherId");
    setActiveTab("video");
    setSelectedEvaluationId(null);
  };

  const handleViewReport = (evaluationId: number) => {
    setSelectedEvaluationId(evaluationId);
    if (isAdmin) {
      // 管理员直接显示报告，不需要切换tab
    } else {
      setActiveTab("history");
    }
  };

  const handleBackToList = () => {
    setSelectedEvaluationId(null);
  };

  const tabs = [
    { id: "video" as TabType, label: "视频分析", icon: Video },
    { id: "ppt" as TabType, label: "PPT 辅助分析", icon: FileText },
    { id: "history" as TabType, label: "历史记录", icon: History },
  ];

  return (
    <>
      <div className="app-root">
        <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <img src="/images/logo_apu/up前进！.png" alt="Logo" className="header-logo" />
            <div>
              <h1>评课星球</h1>
              <p className="app-subtitle">SmartLessonEvaluator - 一键分析授课视频</p>
            </div>
          </div>
          {teacherId && (
            <div className="header-user">
              {!isAdmin && (
                <button
                  className="community-button"
                  onClick={() => setActiveTab("community")}
                  title="教师社区"
                >
                  <Users size={18} />
                  <span>教师社区</span>
                </button>
              )}
              <span className="user-id">
                {isAdmin ? "管理员" : `教师ID: ${teacherId}`}
              </span>
              <button className="logout-button" onClick={handleLogout}>
                退出
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        {!teacherId ? (
          <section className="card">
            <TeacherLogin onLogin={handleLogin} />
          </section>
        ) : isAdmin ? (
          // 管理员视图：只显示社区和管理员控制台
          <>
            {/* 管理员导航 */}
            <div className="tabs-container">
              <div className="tabs">
                <button
                  className={`tab-button ${activeTab !== "community" ? "active" : ""}`}
                  onClick={() => setActiveTab("video")}
                >
                  <span>批课报告管理</span>
                </button>
                <button
                  className={`tab-button ${activeTab === "community" ? "active" : ""}`}
                  onClick={() => setActiveTab("community")}
                >
                  <Users size={18} />
                  <span>教师社区</span>
                </button>
              </div>
            </div>
            
            {activeTab === "community" ? (
              <CommunityFeed 
                teacherId={teacherId} 
                onBack={() => setActiveTab("video")}
              />
            ) : (
              <AdminDashboard onViewReport={handleViewReport} />
            )}
          </>
        ) : activeTab === "community" ? (
          <CommunityFeed 
            teacherId={teacherId} 
            onBack={() => setActiveTab("video")}
          />
        ) : (
          <>
            {/* Tab导航 */}
            <div className="tabs-container">
              <div className="tabs">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon size={18} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab内容 */}
            <AnimatePresence mode="wait">
              <motion.section
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="card"
              >
                {activeTab === "video" && (
                  <SmartLessonUploader teacherId={teacherId} />
                )}
                {activeTab === "ppt" && (
                  <PPTAnalyzer teacherId={teacherId} />
                )}
                {activeTab === "history" && (
                  selectedEvaluationId ? (
                    <EvaluationReportView 
                      evaluationId={selectedEvaluationId}
                      teacherId={teacherId}
                      onBack={handleBackToList}
                    />
                  ) : (
                    <HistoryList 
                      teacherId={teacherId}
                      onViewReport={handleViewReport}
                    />
                  )
                )}
              </motion.section>
            </AnimatePresence>

            {activeTab === "video" && !isAdmin && (
              <section className="tips">
                <h2>使用小贴士</h2>
                <ul>
                  <li>支持常见视频格式（mp4 / mov 等）。</li>
                  <li>建议视频时长 5–30 分钟，保证分析效果。</li>
                  <li>上传后请耐心等待，系统会并行进行语音识别、视觉分析和内容评估。</li>
                </ul>
              </section>
            )}
          </>
        )}
      </main>
      </div>
      <ToastContainer toasts={toasts} onClose={closeToast} />
    </>
  );
};

// 主App组件（包装Provider）
const App: React.FC = () => {
  return (
    <VideoAnalysisProvider>
      <AppContent />
    </VideoAnalysisProvider>
  );
};

export default App;


