import React from "react";
import { Hash } from "lucide-react";

interface TagFilterProps {
  tags: string[];
  selectedTags: string[];
  onTagClick: (tag: string) => void;
}

const TagFilter: React.FC<TagFilterProps> = ({
  tags,
  selectedTags,
  onTagClick,
}) => {
  return (
    <div className="tag-filter card">
      <div className="tag-filter-header">
        <Hash size={18} />
        <h4>热门标签</h4>
      </div>
      <div className="tag-filter-tags">
        {tags.map((tag) => (
          <button
            key={tag}
            className={`tag-filter-tag ${
              selectedTags.includes(tag) ? "active" : ""
            }`}
            onClick={() => onTagClick(tag)}
          >
            #{tag}
          </button>
        ))}
      </div>
      {selectedTags.length > 0 && (
        <button
          className="clear-tags-button"
          onClick={() => {
            selectedTags.forEach((tag) => onTagClick(tag));
          }}
        >
          清除筛选
        </button>
      )}
    </div>
  );
};

export default TagFilter;

