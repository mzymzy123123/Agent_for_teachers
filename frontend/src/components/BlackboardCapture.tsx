import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Camera, Clock, X, Loader2, AlertCircle } from "lucide-react";

interface BlackboardCaptureProps {
  teacherId: string;
}

interface CaptureItem {
  id: string;
  timestamp: string;
  imageUrl: string;
  frameIndex: number;
}

/**
 * 板书智能截图组件
 * 从上传的视频中提取板书较为完整的帧
 */
const BlackboardCapture: React.FC<BlackboardCaptureProps> = ({ teacherId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setCaptures([]);
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
      setCaptures([]);
      setError(null);
    }
  };

  const handleExtract = async () => {
    if (!file) {
      setError("请先选择一个视频文件");
      return;
    }

    if (loading) {
      setError("已有提取任务正在进行中，请等待完成。");
      return;
    }

    setLoading(true);
    setError(null);
    setCaptures([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("teacher_id", teacherId);

      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(`${API_BASE_URL}/api/extract-blackboard?teacher_id=${teacherId}`, {
        method: "POST",
        body: formData,
      });

      if (!isMountedRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(`后端返回错误状态码: ${response.status}`);
      }

      const data = await response.json();
      
      if (!isMountedRef.current) {
        return;
      }
      
      if (data.success && data.frames && data.frames.length > 0) {
        const newCaptures: CaptureItem[] = data.frames.map((frame: any, idx: number) => ({
          id: `capture-${frame.frame_index || idx}`,
          timestamp: `${Math.floor(frame.timestamp / 60)}:${String(Math.floor(frame.timestamp % 60)).padStart(2, '0')}`,
          imageUrl: frame.image_base64 || "",
          frameIndex: frame.frame_index || idx,
        }));
        setCaptures(newCaptures);
      } else {
        setError("未能从视频中提取到板书截图，请确保视频中包含教师面向黑板的画面。");
      }
    } catch (err: any) {
      if (!isMountedRef.current) {
        return;
      }
      setError(err.message || "提取板书失败，请稍后重试");
      console.error("提取板书错误详情：", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleDeleteCapture = (id: string) => {
    setCaptures(captures.filter((c) => c.id !== id));
  };

  return (
    <div className="blackboard-capture">
      <div className="blackboard-capture-header">
        <h2>板书分析</h2>
        <p className="blackboard-capture-desc">
          上传授课视频，系统将自动提取板书较为完整的截图
        </p>
      </div>

      <div className="blackboard-upload-area">
        <div
          className={`blackboard-dropzone ${dragActive ? "drag-active" : ""} ${file ? "has-file" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="blackboard-file-input"
            id="blackboard-file-input"
          />
          <label htmlFor="blackboard-file-input" className="blackboard-dropzone-label">
            {file ? (
              <>
                <Camera size={48} className="blackboard-icon" />
                <div className="blackboard-file-name">{file.name}</div>
                <div className="blackboard-file-size">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </>
            ) : (
              <>
                <Upload size={48} className="blackboard-icon" />
                <div className="blackboard-dropzone-text">
                  <strong>点击或拖拽上传视频文件</strong>
                  <span>支持常见视频格式（mp4 / mov 等）</span>
                </div>
              </>
            )}
          </label>
        </div>

        <button
          className="primary-button blackboard-extract-button"
          onClick={handleExtract}
          disabled={loading || !file}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              <span>正在提取板书截图...</span>
            </>
          ) : (
            <>
              <Camera size={18} />
              <span>提取板书截图</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="status status-error">
          <AlertCircle size={18} />
          <strong>错误：</strong>
          {error}
        </div>
      )}

      {captures.length > 0 && (
        <div className="blackboard-captures-section">
          <h3>提取的板书截图（共 {captures.length} 张）</h3>
          <div className="captures-grid">
            <AnimatePresence>
              {captures.map((capture) => (
                <motion.div
                  key={capture.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="capture-item"
                >
                  <div className="capture-image-wrapper">
                    <img
                      src={capture.imageUrl}
                      alt={`板书截图 ${capture.id}`}
                      className="capture-image"
                    />
                    <button
                      className="capture-delete-button"
                      onClick={() => handleDeleteCapture(capture.id)}
                      aria-label="删除截图"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="capture-info">
                    <Clock size={14} />
                    <span>{capture.timestamp}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlackboardCapture;

