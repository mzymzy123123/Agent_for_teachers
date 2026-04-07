import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image, Video, Link, X, Hash, Send, Upload, AlertCircle, AtSign } from "lucide-react";
import { Post, PRESET_TAGS } from "./CommunityFeed";
import ReportPreview from "./ReportPreview";

interface PostEditorProps {
  teacherId: string;
  onPost: (post: Omit<Post, "id" | "timestamp" | "likes" | "comments" | "shares" | "isLiked">) => void;
}

const PostEditor: React.FC<PostEditorProps> = ({ teacherId, onPost }) => {
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [includeReport, setIncludeReport] = useState(false);
  const [latestReport, setLatestReport] = useState<any>(null);
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [mediaType, setMediaType] = useState<"image" | "video" | "link">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageError, setImageError] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 最大文件大小：5MB
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  // 获取最新批课报告
  useEffect(() => {
    const fetchLatestReport = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        const response = await fetch(
          `${API_BASE_URL}/api/teacher/${teacherId}/evaluations?limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.evaluations && data.evaluations.length > 0) {
            const latest = data.evaluations[0];
            setLatestReport({
              videoName: latest.video_name || "未命名视频",
              overallScore: latest.overall_score,
              overallLevel: latest.overall_level,
              presentationScore: latest.presentation_score,
              contentScore: latest.content_score,
              evaluationId: latest.id,
            });
          }
        }
      } catch (error) {
        console.error("获取最新报告失败：", error);
      }
    };
    fetchLatestReport();
  }, [teacherId]);

  const handleAddTag = (tag: string) => {
    const cleanTag = tag.replace(/^#/, "").trim();
    if (cleanTag && !tags.includes(cleanTag)) {
      setTags([...tags, cleanTag]);
      setTagInput("");
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handlePresetTagClick = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  // 处理图片文件选择
  const handleImageFileChange = (file: File) => {
    setImageError("");
    
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      setImageError("请选择图片文件（jpg, png, gif 等）");
      return;
    }
    
    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      setImageError(`图片大小不能超过 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`);
      return;
    }
    
    setImageFile(file);
    setMediaType("image");
    
    // 使用 FileReader 转换为 Data URL
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setMediaUrl(dataUrl);
      setImagePreview(dataUrl);
    };
    reader.onerror = () => {
      setImageError("图片读取失败，请重试");
    };
    reader.readAsDataURL(file);
  };

  // 文件输入处理
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFileChange(file);
    }
  };

  // 拖拽处理
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
      const file = e.dataTransfer.files[0];
      if (mediaType === "image") {
        handleImageFileChange(file);
      }
    }
  };

  // 清除图片
  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview("");
    setMediaUrl("");
    setImageError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 提取@的用户
  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionedUser = match[1].toLowerCase();
      if (mentionedUser === "root" && !mentions.includes("root")) {
        mentions.push("root");
      }
    }
    return mentions;
  };

  // 插入@root
  const handleMentionRoot = () => {
    const mentionText = "@root ";
    const textarea = document.querySelector(".post-editor-textarea") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = 
        content.substring(0, start) + 
        mentionText + 
        content.substring(end);
      setContent(newContent);
      // 设置光标位置
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + mentionText.length, start + mentionText.length);
      }, 0);
    } else {
      setContent(content + mentionText);
    }
  };

  const handleSubmit = () => {
    if (!content.trim() && !includeReport) {
      return;
    }

    // 提取@的用户
    const mentions = extractMentions(content);

    const postData: Omit<Post, "id" | "timestamp" | "likes" | "comments" | "shares" | "isLiked"> = {
      authorId: teacherId,
      authorName: `${teacherId}老师`,
      content: content.trim(),
      tags: tags,
      mentions: mentions.length > 0 ? mentions : undefined,
      media: mediaUrl
        ? [
            {
              type: mediaType,
              url: mediaUrl,
            },
          ]
        : undefined,
      report: includeReport && latestReport ? latestReport : undefined,
    };

    onPost(postData);
    setContent("");
    setTags([]);
    setTagInput("");
    setIncludeReport(false);
    setMediaUrl("");
    setImageFile(null);
    setImagePreview("");
    setImageError("");
    setShowMediaInput(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="post-editor card">
      <h3 className="post-editor-title">发布新帖子</h3>

      <div style={{ position: "relative" }}>
        <textarea
          className="post-editor-textarea"
          placeholder="分享您的教学心得、经验或问题...（输入 @root 可以@管理员申请人工点评）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
        />
        <button
          type="button"
          onClick={handleMentionRoot}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            padding: "6px 12px",
            background: "#eff6ff",
            border: "1px solid #3b82f6",
            borderRadius: "6px",
            cursor: "pointer",
            color: "#3b82f6",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#dbeafe";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#eff6ff";
          }}
          title="@root老师申请人工点评"
        >
          <AtSign size={14} />
          <span>@root</span>
        </button>
      </div>

      {/* 标签输入 */}
      <div className="post-editor-tags">
        <div className="tags-input-wrapper">
          <Hash size={16} className="tag-icon" />
          <input
            type="text"
            className="tags-input"
            placeholder="输入标签（如：高中、数学）或按回车添加"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagInputKeyDown}
          />
        </div>
        <div className="preset-tags">
          {PRESET_TAGS.map((tag) => (
            <button
              key={tag}
              className={`preset-tag ${tags.includes(tag) ? "selected" : ""}`}
              onClick={() => handlePresetTagClick(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="selected-tags">
            {tags.map((tag) => (
              <span key={tag} className="selected-tag">
                #{tag}
                <button
                  className="remove-tag"
                  onClick={() => handleRemoveTag(tag)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 多媒体支持 */}
      <div className="post-editor-media">
        <button
          className="media-button"
          onClick={() => {
            setShowMediaInput(!showMediaInput);
            setMediaType("image");
          }}
        >
          <Image size={18} />
          <span>图片</span>
        </button>
        <button
          className="media-button"
          onClick={() => {
            setShowMediaInput(!showMediaInput);
            setMediaType("video");
          }}
        >
          <Video size={18} />
          <span>视频</span>
        </button>
        <button
          className="media-button"
          onClick={() => {
            setShowMediaInput(!showMediaInput);
            setMediaType("link");
          }}
        >
          <Link size={18} />
          <span>链接</span>
        </button>
      </div>

      <AnimatePresence>
        {showMediaInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="media-input-wrapper"
          >
            {mediaType === "image" ? (
              <div style={{ width: "100%" }}>
                {/* 图片上传区域 */}
                <div
                  style={{
                    border: `2px dashed ${dragActive ? "#3b82f6" : "#e5e7eb"}`,
                    borderRadius: "8px",
                    padding: "20px",
                    textAlign: "center",
                    backgroundColor: dragActive ? "#eff6ff" : "#f9fafb",
                    transition: "all 0.2s",
                    cursor: "pointer",
                    marginBottom: "12px",
                  }}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    style={{ display: "none" }}
                  />
                  {imagePreview ? (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img
                        src={imagePreview}
                        alt="预览"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "300px",
                          borderRadius: "8px",
                          objectFit: "contain",
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearImage();
                        }}
                        style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                          background: "rgba(0, 0, 0, 0.6)",
                          border: "none",
                          borderRadius: "50%",
                          width: "28px",
                          height: "28px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "white",
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} style={{ color: "#9ca3af", marginBottom: "8px" }} />
                      <div style={{ color: "#6b7280", fontSize: "14px" }}>
                        <strong style={{ display: "block", marginBottom: "4px", color: "#3b82f6" }}>
                          点击或拖拽上传图片
                        </strong>
                        <span style={{ fontSize: "12px" }}>
                          支持 JPG、PNG、GIF 等格式，最大 5MB
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 错误提示 */}
                {imageError && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      backgroundColor: "#fef2f2",
                      borderRadius: "6px",
                      marginBottom: "12px",
                      color: "#ef4444",
                      fontSize: "14px",
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{imageError}</span>
                  </div>
                )}

                {/* 或输入URL */}
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                    或输入图片URL：
                  </div>
                  <input
                    type="text"
                    className="media-url-input"
                    placeholder="输入图片URL（如：https://example.com/image.jpg）"
                    value={mediaUrl && !imagePreview ? mediaUrl : ""}
                    onChange={(e) => {
                      setMediaUrl(e.target.value);
                      if (e.target.value) {
                        setImagePreview("");
                        setImageFile(null);
                        setImageError("");
                      }
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  className="media-url-input"
                  placeholder={`输入${mediaType === "video" ? "视频" : "链接"}URL`}
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
                {mediaUrl && (
                  <button
                    className="remove-media"
                    onClick={() => {
                      setMediaUrl("");
                      setShowMediaInput(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 一键分享报告 */}
      <div className="post-editor-report">
        <label className="report-checkbox-label">
          <input
            type="checkbox"
            checked={includeReport}
            onChange={(e) => setIncludeReport(e.target.checked)}
            disabled={!latestReport}
          />
          <span>附带我的最新批课报告</span>
        </label>
        {!latestReport && (
          <p className="report-hint">您还没有批课记录，请先完成一次视频分析</p>
        )}
      </div>

      <AnimatePresence>
        {includeReport && latestReport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="report-preview-wrapper"
          >
            <ReportPreview report={latestReport} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="post-editor-actions">
        <button
          className="submit-button"
          onClick={handleSubmit}
          disabled={!content.trim() && !includeReport}
        >
          <Send size={18} />
          <span>发布</span>
        </button>
      </div>
    </div>
  );
};

export default PostEditor;

