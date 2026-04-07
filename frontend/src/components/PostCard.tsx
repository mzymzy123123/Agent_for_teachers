import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Heart,
  MessageCircle,
  Share2,
  Image as ImageIcon,
  Video as VideoIcon,
  Link as LinkIcon,
  Clock,
  AtSign,
} from "lucide-react";
import { Post } from "./CommunityFeed";
import ReportPreview from "./ReportPreview";
import CommentSection from "./CommentSection";

interface PostCardProps {
  post: Post;
  onLike: (postId: string) => void;
  onTagClick: (tag: string) => void;
  onReportClick?: (report: Post["report"], authorName: string) => void;
  onAddComment?: (postId: string, content: string, parentId?: string) => void;
  currentUserId?: string;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  onLike,
  onTagClick,
  onReportClick,
  onAddComment,
  currentUserId,
}) => {
  const [showComments, setShowComments] = useState(false);
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

  const getLevelColor = (level: string): string => {
    switch (level) {
      case "好":
        return "#10b981";
      case "较好":
        return "#3b82f6";
      case "合格":
        return "#f59e0b";
      case "待提升":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <motion.div
      className="post-card card"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      {/* 头部 */}
      <div className="post-header">
        <div className="post-author">
          <div className="author-avatar">
            {post.authorName.charAt(0)}
          </div>
          <div className="author-info">
            <div className="author-name">{post.authorName}</div>
            <div className="post-time">
              <Clock size={12} />
              <span>{formatTime(post.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 内容 */}
      <div className="post-content">
        <p>
          {post.content.split(/(@\w+)/g).map((part, index) => {
            if (part.startsWith("@")) {
              const userId = part.substring(1).toLowerCase();
              return (
                <span
                  key={index}
                  style={{
                    color: userId === "root" ? "#3b82f6" : "#059669",
                    fontWeight: "500",
                    backgroundColor: userId === "root" ? "#eff6ff" : "#f0fdf4",
                    padding: "2px 4px",
                    borderRadius: "4px",
                  }}
                >
                  {part}
                </span>
              );
            }
            return <span key={index}>{part}</span>;
          })}
        </p>
      </div>

      {/* @的用户 */}
      {post.mentions && post.mentions.length > 0 && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            backgroundColor: "#eff6ff",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <AtSign size={14} style={{ color: "#3b82f6" }} />
          <span style={{ fontSize: "12px", color: "#6b7280" }}>@了：</span>
          {post.mentions.map((userId) => (
            <span
              key={userId}
              style={{
                fontSize: "12px",
                color: "#3b82f6",
                fontWeight: "500",
                padding: "2px 8px",
                backgroundColor: "white",
                borderRadius: "4px",
                border: "1px solid #bfdbfe",
              }}
            >
              {userId === "root" ? "root老师（管理员）" : userId}
            </span>
          ))}
          {post.mentions.includes("root") && (
            <span
              style={{
                fontSize: "11px",
                color: "#059669",
                marginLeft: "auto",
                padding: "2px 6px",
                backgroundColor: "#d1fae5",
                borderRadius: "4px",
              }}
            >
              申请人工点评
            </span>
          )}
        </div>
      )}

      {/* 标签 */}
      {post.tags.length > 0 && (
        <div className="post-tags">
          {post.tags.map((tag) => (
            <button
              key={tag}
              className="post-tag"
              onClick={() => onTagClick(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* 媒体附件 */}
      {post.media && post.media.length > 0 && (
        <div className="post-media">
          {post.media.map((item, index) => (
            <div key={index} className="media-item">
              {item.type === "image" && (
                <div
                  style={{
                    borderRadius: "8px",
                    overflow: "hidden",
                    marginTop: "12px",
                    maxWidth: "100%",
                  }}
                >
                  <img
                    src={item.url}
                    alt="帖子图片"
                    style={{
                      width: "100%",
                      maxHeight: "500px",
                      objectFit: "contain",
                      display: "block",
                    }}
                    onError={(e) => {
                      // 如果图片加载失败，显示占位符
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      const placeholder = target.parentElement?.querySelector(".image-placeholder");
                      if (placeholder) {
                        (placeholder as HTMLElement).style.display = "flex";
                      }
                    }}
                  />
                  <div
                    className="media-placeholder image-placeholder"
                    style={{ display: "none" }}
                  >
                    <ImageIcon size={24} />
                    <span>图片加载失败</span>
                  </div>
                </div>
              )}
              {item.type === "video" && (
                <div className="media-placeholder video-placeholder">
                  <VideoIcon size={24} />
                  <span>视频</span>
                </div>
              )}
              {item.type === "link" && (
                <div className="media-placeholder link-placeholder">
                  <LinkIcon size={24} />
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.url}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 报告卡片 */}
      {post.report && (
        <div
          className="post-report-card"
          onClick={() => onReportClick && onReportClick(post.report, post.authorName)}
          style={{
            cursor: onReportClick ? "pointer" : "default",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (onReportClick) {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
            }
          }}
          onMouseLeave={(e) => {
            if (onReportClick) {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "";
            }
          }}
        >
          <ReportPreview report={post.report} />
          {onReportClick && (
            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "#3b82f6",
                textAlign: "center",
                fontWeight: "500",
              }}
            >
              点击查看详情 →
            </div>
          )}
        </div>
      )}

      {/* 操作栏 */}
      <div className="post-actions">
        <motion.button
          className={`action-button like-button ${post.isLiked ? "liked" : ""}`}
          onClick={() => onLike(post.id)}
          whileTap={{ scale: 0.95 }}
        >
          <Heart size={18} fill={post.isLiked ? "currentColor" : "none"} />
          <span>{post.likes}</span>
        </motion.button>
        <motion.button
          className="action-button"
          onClick={() => setShowComments(!showComments)}
          whileTap={{ scale: 0.95 }}
          style={{
            cursor: "pointer",
          }}
        >
          <MessageCircle size={18} />
          <span>{post.comments}</span>
        </motion.button>
        <button className="action-button">
          <Share2 size={18} />
          <span>{post.shares}</span>
        </button>
      </div>

      {/* 评论区域 */}
      {showComments && onAddComment && currentUserId && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          style={{
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <CommentSection
            comments={post.commentList || []}
            onAddComment={(content, parentId) => onAddComment(post.id, content, parentId)}
            currentUserId={currentUserId}
            postAuthorId={post.authorId}
          />
        </motion.div>
      )}
    </motion.div>
  );
};

export default PostCard;

