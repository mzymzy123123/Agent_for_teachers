import React, { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, X } from "lucide-react";
import PostEditor from "./PostEditor";
import PostCard from "./PostCard";
import SearchBar from "./SearchBar";
import TagFilter from "./TagFilter";
import ReportDetailModal from "./ReportDetailModal";

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: Date;
  parentId?: string; // 如果存在，表示这是对某条评论的回复
  replies?: Comment[]; // 回复列表
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  tags: string[];
  timestamp: Date;
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  commentList?: Comment[]; // 评论列表
  mentions?: string[]; // @的用户ID列表
  media?: {
    type: "image" | "video" | "link";
    url: string;
    thumbnail?: string;
  }[];
  report?: {
    videoName: string;
    overallScore: number;
    overallLevel: string;
    presentationScore: number;
    contentScore: number;
    evaluationId?: number;
  };
}

interface CommunityFeedProps {
  teacherId: string;
  onBack?: () => void;
}

// 预设标签
export const PRESET_TAGS = [
  "班主任",
  "语文",
  "数学",
  "英语",
  "生物",
  "小学",
  "初中",
  "高中",
];

// localStorage 键名
const STORAGE_KEY = "teacher_community_posts";

// 递归处理评论中的 Date 对象
const processCommentDates = (comment: any): Comment => {
  return {
    ...comment,
    timestamp: new Date(comment.timestamp),
    replies: comment.replies
      ? comment.replies.map((reply: any) => processCommentDates(reply))
      : undefined,
  };
};

// 从 localStorage 加载帖子数据
const loadPostsFromStorage = (): Post[] | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 将 timestamp 字符串转换回 Date 对象，并处理评论
      return parsed.map((post: any) => ({
        ...post,
        timestamp: new Date(post.timestamp),
        commentList: post.commentList
          ? post.commentList.map((comment: any) => processCommentDates(comment))
          : undefined,
      }));
    }
  } catch (error) {
    console.error("加载帖子数据失败：", error);
  }
  return null;
};

// 递归处理评论中的 Date 对象以便序列化
const serializeComment = (comment: Comment): any => {
  return {
    ...comment,
    timestamp: comment.timestamp.toISOString(),
    replies: comment.replies
      ? comment.replies.map((reply) => serializeComment(reply))
      : undefined,
  };
};

// 保存帖子数据到 localStorage
const savePostsToStorage = (posts: Post[]) => {
  try {
    // 将 Date 对象转换为字符串以便序列化
    const serializable = posts.map((post) => ({
      ...post,
      timestamp: post.timestamp.toISOString(),
      commentList: post.commentList
        ? post.commentList.map((comment) => serializeComment(comment))
        : undefined,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error("保存帖子数据失败：", error);
  }
};

// 模拟数据
const generateMockPosts = (): Post[] => {
  const now = new Date();
  return [
    {
      id: "1",
      authorId: "teacher_zhang",
      authorName: "张老师",
      content: "今天尝试了新的互动教学方法，学生们的参与度明显提高了！分享给大家参考。",
      tags: ["高中", "数学"],
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      likes: 24,
      comments: 5,
      shares: 3,
      isLiked: false,
    },
    {
      id: "2",
      authorId: "teacher_li",
      authorName: "李老师",
      content: "刚刚完成了一次批课，整体表现还不错，但还有一些需要改进的地方。",
      tags: ["初中", "语文"],
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      likes: 18,
      comments: 8,
      shares: 2,
      isLiked: true,
      report: {
        videoName: "《春》课文讲解.mp4",
        overallScore: 85.5,
        overallLevel: "好",
        presentationScore: 88.0,
        contentScore: 83.0,
      },
    },
    {
      id: "3",
      authorId: "teacher_wang",
      authorName: "王老师",
      content: "推荐一个很好的教学资源网站，里面有很多实用的课件和教案。链接：https://example.com",
      tags: ["小学", "英语"],
      timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      likes: 32,
      comments: 12,
      shares: 15,
      isLiked: false,
      media: [
        {
          type: "link",
          url: "https://example.com",
        },
      ],
    },
    {
      id: "4",
      authorId: "teacher_zhao",
      authorName: "赵老师",
      content: "生物课上如何让学生更好地理解细胞结构？大家有什么好的方法吗？#生物 #高中",
      tags: ["高中", "生物"],
      timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      likes: 15,
      comments: 20,
      shares: 1,
      isLiked: false,
    },
    {
      id: "5",
      authorId: "teacher_sun",
      authorName: "孙老师",
      content: "分享我的最新批课报告，这次在互动环节做得比较好，得分有所提升！",
      tags: ["初中", "数学"],
      timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      likes: 28,
      comments: 6,
      shares: 4,
      isLiked: true,
      report: {
        videoName: "二次函数讲解.mp4",
        overallScore: 78.5,
        overallLevel: "较好",
        presentationScore: 75.0,
        contentScore: 82.0,
      },
    },
    {
      id: "6",
      authorId: "teacher_qian",
      authorName: "钱老师",
      content: "班主任工作心得：如何建立良好的师生关系？关键在于沟通和理解。",
      tags: ["班主任"],
      timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      likes: 45,
      comments: 18,
      shares: 8,
      isLiked: false,
    },
    {
      id: "7",
      authorId: "teacher_zhou",
      authorName: "周老师",
      content: "今天批课发现自己在口头禅方面还需要改进，频率有点高。继续努力！",
      tags: ["高中", "语文"],
      timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      likes: 22,
      comments: 9,
      shares: 2,
      isLiked: false,
      report: {
        videoName: "古诗词鉴赏.mp4",
        overallScore: 72.0,
        overallLevel: "合格",
        presentationScore: 68.0,
        contentScore: 76.0,
      },
    },
    {
      id: "8",
      authorId: "teacher_wu",
      authorName: "吴老师",
      content: "分享一个有趣的数学游戏，可以帮助小学生更好地理解加减法。",
      tags: ["小学", "数学"],
      timestamp: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      likes: 38,
      comments: 14,
      shares: 12,
      isLiked: true,
      media: [
        {
          type: "image",
          url: "/placeholder-image.jpg",
          thumbnail: "/placeholder-image.jpg",
        },
      ],
    },
  ];
};

const CommunityFeed: React.FC<CommunityFeedProps> = ({ teacherId, onBack }) => {
  // 初始化：优先从 localStorage 读取，如果为空则使用默认数据
  const [posts, setPosts] = useState<Post[]>(() => {
    const stored = loadPostsFromStorage();
    return stored && stored.length > 0 ? stored : generateMockPosts();
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedReport, setSelectedReport] = useState<Post["report"] | null>(null);
  const [selectedAuthorName, setSelectedAuthorName] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showMentionNotification, setShowMentionNotification] = useState(false);

  // 检查是否是root管理员
  const isAdmin = teacherId === "root";

  // 检查是否有艾特root的帖子
  const mentionPosts = useMemo(() => {
    if (!isAdmin) return [];
    return posts.filter(
      (post) => post.mentions && post.mentions.includes("root")
    );
  }, [posts, isAdmin]);

  // 当有新的艾特时显示通知（每次进入界面或帖子更新时）
  useEffect(() => {
    if (isAdmin && mentionPosts.length > 0) {
      setShowMentionNotification(true);
    } else if (isAdmin && mentionPosts.length === 0) {
      // 如果没有艾特了，隐藏通知
      setShowMentionNotification(false);
    }
  }, [mentionPosts.length, isAdmin]);

  // 当 posts 更新时，同步到 localStorage
  useEffect(() => {
    savePostsToStorage(posts);
  }, [posts]);

  // 过滤帖子
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesContent = post.content.toLowerCase().includes(query);
        const matchesTags = post.tags.some((tag) =>
          tag.toLowerCase().includes(query)
        );
        if (!matchesContent && !matchesTags) {
          return false;
        }
      }

      // 标签过滤
      if (selectedTags.length > 0) {
        const hasSelectedTag = selectedTags.some((tag) =>
          post.tags.includes(tag)
        );
        if (!hasSelectedTag) {
          return false;
        }
      }

      return true;
    });
  }, [posts, searchQuery, selectedTags]);

  const handleNewPost = (newPost: Omit<Post, "id" | "timestamp" | "likes" | "comments" | "shares" | "isLiked">) => {
    const post: Post = {
      ...newPost,
      id: `post_${Date.now()}`,
      timestamp: new Date(),
      likes: 0,
      comments: 0,
      shares: 0,
      isLiked: false,
      commentList: [],
    };
    const updatedPosts = [post, ...posts];
    setPosts(updatedPosts);
    // 注意：useEffect 会自动同步到 localStorage，但为了确保立即保存，这里也调用一次
    savePostsToStorage(updatedPosts);
  };

  const handleLike = (postId: string) => {
    const updatedPosts = posts.map((post) => {
      if (post.id === postId) {
        return {
          ...post,
          isLiked: !post.isLiked,
          likes: post.isLiked ? post.likes - 1 : post.likes + 1,
        };
      }
      return post;
    });
    setPosts(updatedPosts);
    // useEffect 会自动同步到 localStorage
  };

  const handleReportClick = (report: Post["report"], authorName: string) => {
    if (report) {
      setSelectedReport(report);
      setSelectedAuthorName(authorName);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedReport(null);
    setSelectedAuthorName("");
  };

  const handleAddComment = (postId: string, content: string, parentId?: string) => {
    const newComment: Comment = {
      id: `comment_${Date.now()}_${Math.random()}`,
      authorId: teacherId,
      authorName: `${teacherId}老师`,
      content: content.trim(),
      timestamp: new Date(),
      parentId: parentId,
    };

    const updatedPosts = posts.map((post) => {
      if (post.id === postId) {
        const commentList = post.commentList || [];
        let updatedCommentList: Comment[];

        if (parentId) {
          // 回复评论：找到父评论并添加到其 replies 中
          updatedCommentList = commentList.map((comment) => {
            if (comment.id === parentId) {
              return {
                ...comment,
                replies: [...(comment.replies || []), newComment],
              };
            }
            // 递归查找嵌套的回复
            const updateReplies = (c: Comment): Comment => {
              if (c.id === parentId) {
                return {
                  ...c,
                  replies: [...(c.replies || []), newComment],
                };
              }
              if (c.replies) {
                return {
                  ...c,
                  replies: c.replies.map(updateReplies),
                };
              }
              return c;
            };
            return updateReplies(comment);
          });
        } else {
          // 直接评论帖子
          updatedCommentList = [...commentList, newComment];
        }

        // 计算总评论数（包括回复）
        const countTotalComments = (comments: Comment[]): number => {
          return comments.reduce((count, comment) => {
            return count + 1 + (comment.replies ? countTotalComments(comment.replies) : 0);
          }, 0);
        };

        return {
          ...post,
          commentList: updatedCommentList,
          comments: countTotalComments(updatedCommentList),
        };
      }
      return post;
    });

    setPosts(updatedPosts);
  };

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSearchTag = (tag: string) => {
    setSearchQuery(`#${tag}`);
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  return (
    <div className="community-feed">
      {/* 艾特消息通知栏 - 仅对root管理员显示 */}
      {isAdmin && showMentionNotification && mentionPosts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            backgroundColor: "#eff6ff",
            border: "1px solid #3b82f6",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 2px 4px rgba(59, 130, 246, 0.1)",
          }}
        >
          <Bell size={20} style={{ color: "#3b82f6", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, color: "#1e40af", marginBottom: "4px" }}>
              您有 {mentionPosts.length} 条艾特消息
            </div>
            <div style={{ fontSize: "13px", color: "#3b82f6" }}>
              {mentionPosts.length === 1
                ? `${mentionPosts[0].authorName} 在帖子中@了您，申请人工点评`
                : `有 ${mentionPosts.length} 位教师@了您，申请人工点评`}
            </div>
          </div>
          <button
            onClick={() => setShowMentionNotification(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#3b82f6",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="关闭通知"
          >
            <X size={18} />
          </button>
        </motion.div>
      )}

      <div className="community-header">
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              marginBottom: "16px",
              background: "none",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              cursor: "pointer",
              color: "#6b7280",
              fontSize: "14px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f9fafb";
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.color = "#1f2937";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.color = "#6b7280";
            }}
          >
            <ArrowLeft size={18} />
            <span>返回智能批课</span>
          </button>
        )}
        <h2>教师社区</h2>
        <p className="community-subtitle">
          与同行交流教学经验，分享批课心得
        </p>
      </div>

      <div className="community-layout">
        {/* 左侧：搜索和发布区 */}
        <div className="community-left">
          <PostEditor teacherId={teacherId} onPost={handleNewPost} />
          <TagFilter
            tags={PRESET_TAGS}
            selectedTags={selectedTags}
            onTagClick={handleTagClick}
          />
        </div>

        {/* 中间：主内容流 */}
        <div className="community-main">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索帖子或标签（如 #高中）..."
          />

          <div className="posts-list">
            {filteredPosts.length === 0 ? (
              <div className="empty-state">
                <p>暂无符合条件的帖子</p>
              </div>
            ) : (
              filteredPosts.map((post, index) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <PostCard
                    post={post}
                    onLike={handleLike}
                    onTagClick={handleSearchTag}
                    onReportClick={handleReportClick}
                    onAddComment={handleAddComment}
                    currentUserId={teacherId}
                  />
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 报告详情模态框 */}
      {selectedReport && (
        <ReportDetailModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          report={selectedReport}
          authorName={selectedAuthorName}
        />
      )}
    </div>
  );
};

export default CommunityFeed;

