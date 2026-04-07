import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileImage, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface PPTAnalyzerProps {
  teacherId: string;
}

/**
 * PPT 辅助分析组件
 * 允许用户上传PPT图片/内容，调用Gemini3pro进行评分
 */
const PPTAnalyzer: React.FC<PPTAnalyzerProps> = ({ teacherId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("请先选择一个文件");
      return;
    }

    if (loading) {
      setError("已有分析任务正在进行中，请等待完成。");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("teacher_id", teacherId);

      const response = await fetch(`${API_BASE_URL}/api/analyze-ppt?teacher_id=${teacherId}`, {
        method: "POST",
        body: formData,
      });

      if (!isMountedRef.current) {
        return;
      }

      if (!response.ok) {
        // 尝试读取错误响应
        let errorMsg = `后端返回错误状态码: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMsg = errorData.error;
          } else {
            errorMsg = JSON.stringify(errorData);
          }
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMsg += ` - ${errorText.substring(0, 200)}`;
          }
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      
      // 检查返回数据中是否有错误信息
      if (data.success === false && data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
      
      if (isMountedRef.current) {
        setResult(data);
      }
    } catch (err: any) {
      if (!isMountedRef.current) {
        return;
      }
      
      // 显示错误信息
      const errorMessage = err.message || "分析失败，请稍后重试";
      setError(errorMessage);
      console.error("PPT分析错误:", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="ppt-analyzer">
      <div className="ppt-analyzer-header">
        <div className="page-header-with-logo">
          <img src="/images/logo_apu/各种阿噗-08.png" alt="Logo" className="page-logo" />
          <div>
            <h2>PPT 辅助分析</h2>
            <p className="ppt-analyzer-desc">
              上传您的PPT文件或图片，系统将使用Gemini3pro进行智能评分和分析
            </p>
          </div>
        </div>
      </div>

      <div className="ppt-upload-area">
        <div
          className={`ppt-dropzone ${dragActive ? "drag-active" : ""} ${file ? "has-file" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*,.ppt,.pptx,.pdf"
            onChange={handleFileChange}
            className="ppt-file-input"
            id="ppt-file-input"
          />
          <label htmlFor="ppt-file-input" className="ppt-dropzone-label">
            {file ? (
              <>
                <FileImage size={48} className="ppt-icon" />
                <div className="ppt-file-name">{file.name}</div>
                <div className="ppt-file-size">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </>
            ) : (
              <>
                <Upload size={48} className="ppt-icon" />
                <div className="ppt-dropzone-text">
                  <strong>点击或拖拽上传PPT文件</strong>
                  <span>支持图片格式（jpg, png）、PPT文件（.ppt, .pptx）和PDF文件（.pdf）</span>
                </div>
              </>
            )}
          </label>
        </div>

        <button
          className="primary-button ppt-analyze-button"
          onClick={handleAnalyze}
          disabled={loading || !file}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              <span>分析中，请稍候...</span>
            </>
          ) : (
            "开始分析"
          )}
        </button>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="ppt-loading-status"
          >
            <Loader2 className="animate-spin" size={20} />
            <span>正在调用Gemini3pro进行分析，请稍候...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="status status-error">
          <AlertCircle size={18} />
          <strong>错误：</strong>
          {error}
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="ppt-result card"
        >
          <h3>分析结果</h3>
          <div className="ppt-scores">
            <div className="ppt-score-item">
              <div className="ppt-score-label">设计分</div>
              <div className="ppt-score-value">{result.design_score || 0}</div>
            </div>
            <div className="ppt-score-item">
              <div className="ppt-score-label">内容分</div>
              <div className="ppt-score-value">{result.content_score || 0}</div>
            </div>
            <div className="ppt-score-item">
              <div className="ppt-score-label">逻辑分</div>
              <div className="ppt-score-value">{result.logic_score || 0}</div>
            </div>
          </div>
          <div className="ppt-comment">
            <strong>点评：</strong>
            <div className="ppt-comment-content">
              {result.overall_comment || "暂无点评"}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default PPTAnalyzer;

