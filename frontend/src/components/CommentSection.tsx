import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, Reply, Clock } from "lucide-react";
import { Comment } from "./CommunityFeed";

interface CommentSectionProps {
  comments: Comment[];
  onAddComment: (content: string, parentId?: string) => void;
  currentUserId: string;
  postAuthorId: string;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  comments,
  onAddComment,
  currentUserId,
  postAuthorId,
}) => {
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const formatTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `${minutes}分钟前`;
    } else if (hours < 24) {
      return `${hours}小时前`;
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return timestamp.toLocaleDateString("zh-CN");
    }
  };

  const handleSubmitComment = () => {
    if (newComment.trim()) {
      onAddComment(newComment);
      setNewComment("");
    }
  };

  const handleSubmitReply = (parentId: string) => {
    if (replyContent.trim()) {
      onAddComment(replyContent, parentId);
      setReplyContent("");
      setReplyingTo(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, isReply: boolean = false, parentId?: string) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      if (isReply && parentId) {
        handleSubmitReply(parentId);
      } else {
        handleSubmitComment();
      }
    }
  };

  const renderComment = (comment: Comment, level: number = 0) => {
    const isReply = level > 0;
    const isReplying = replyingTo === comment.id;

    return (
      <div
        key={comment.id}
        style={{
          marginBottom: "16px",
          marginLeft: isReply ? "32px" : "0",
          paddingLeft: isReply ? "16px" : "0",
          borderLeft: isReply ? "2px solid #e5e7eb" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: "#3b82f6",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "600",
              fontSize: "14px",
              flexShrink: 0,
            }}
          >
            {comment.authorName.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontWeight: "600", color: "#1f2937", fontSize: "14px" }}>
                {comment.authorName}
              </span>
              {comment.authorId === postAuthorId && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "#3b82f6",
                    backgroundColor: "#eff6ff",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  作者
                </span>
              )}
              <span style={{ fontSize: "12px", color: "#6b7280", display: "flex", alignItems: "center", gap: "4px" }}>
                <Clock size={12} />
                {formatTime(comment.timestamp)}
              </span>
            </div>
            <p style={{ margin: "4px 0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
              {comment.content}
            </p>
            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              <button
                onClick={() => {
                  setReplyingTo(isReplying ? null : comment.id);
                  setReplyContent("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#3b82f6",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#eff6ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Reply size={14} />
                回复
              </button>
            </div>

            {/* 回复输入框 */}
            <AnimatePresence>
              {isReplying && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ marginTop: "12px" }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        backgroundColor: "#3b82f6",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "600",
                        fontSize: "12px",
                        flexShrink: 0,
                      }}
                    >
                      {currentUserId.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        onKeyDown={(e) => handleKeyPress(e, true, comment.id)}
                        placeholder={`回复 ${comment.authorName}...`}
                        style={{
                          width: "100%",
                          minHeight: "60px",
                          padding: "8px 12px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          fontSize: "14px",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyContent("");
                          }}
                          style={{
                            padding: "6px 12px",
                            background: "none",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            color: "#6b7280",
                          }}
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleSubmitReply(comment.id)}
                          disabled={!replyContent.trim()}
                          style={{
                            padding: "6px 12px",
                            background: replyContent.trim() ? "#3b82f6" : "#e5e7eb",
                            border: "none",
                            borderRadius: "6px",
                            cursor: replyContent.trim() ? "pointer" : "not-allowed",
                            fontSize: "12px",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Send size={14} />
                          发送
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 递归渲染回复 */}
            {comment.replies && comment.replies.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                {comment.replies.map((reply) => renderComment(reply, level + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ fontSize: "16px", fontWeight: "600", color: "#1f2937", marginBottom: "12px" }}>
          <MessageCircle size={18} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
          评论 ({comments.length})
        </h4>

        {/* 评论列表 */}
        {comments.length > 0 ? (
          <div style={{ marginBottom: "16px" }}>
            {comments.map((comment) => renderComment(comment))}
          </div>
        ) : (
          <p style={{ color: "#9ca3af", fontSize: "14px", textAlign: "center", padding: "20px" }}>
            暂无评论，快来发表第一条评论吧！
          </p>
        )}

        {/* 添加评论输入框 */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: "#3b82f6",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "600",
              fontSize: "16px",
              flexShrink: 0,
            }}
          >
            {currentUserId.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e)}
              placeholder="写下你的评论... (Ctrl/Cmd + Enter 发送)"
              style={{
                width: "100%",
                minHeight: "80px",
                padding: "12px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "14px",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                onClick={handleSubmitComment}
                disabled={!newComment.trim()}
                style={{
                  padding: "8px 16px",
                  background: newComment.trim() ? "#3b82f6" : "#e5e7eb",
                  border: "none",
                  borderRadius: "6px",
                  cursor: newComment.trim() ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: "500",
                }}
              >
                <Send size={16} />
                发表评论
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentSection;

