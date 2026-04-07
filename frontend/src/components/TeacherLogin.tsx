import React, { useState } from "react";

interface TeacherLoginProps {
  onLogin: (teacherId: string) => void;
}

/**
 * 教师登录组件
 * 轻量级登录，仅需输入 teacher_id
 */
const TeacherLogin: React.FC<TeacherLoginProps> = ({ onLogin }) => {
  const [teacherId, setTeacherId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId.trim()) {
      setError("请输入教师ID");
      return;
    }
    
    // 管理员root登录（密码为root或空）
    if (teacherId.trim().toLowerCase() === "root") {
      if (password.trim() !== "root" && password.trim() !== "") {
        setError("管理员密码错误");
        return;
      }
      setError(null);
      onLogin("root");
      return;
    }
    
    // 普通教师登录（暂时不需要密码验证）
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }
    setError(null);
    onLogin(teacherId.trim());
  };

  return (
    <div className="login-container">
      <div className="login-card card">
        <div className="login-logo">
          <img src="/images/logo_apu/丘比特阿噗.png" alt="Logo" className="logo-image" />
        </div>
        <h2>教师登录</h2>
        <p className="login-desc">请输入您的教师ID和密码以进入评估系统</p>
        <form onSubmit={handleSubmit}>
          <div className="login-input-group">
            <label htmlFor="teacherId">教师ID</label>
            <input
              id="teacherId"
              type="text"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              placeholder="请输入教师ID"
              className="login-input"
            />
          </div>
          <div className="login-input-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="login-input"
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="primary-button login-button">
            进入评估系统
          </button>
        </form>
      </div>
    </div>
  );
};

export default TeacherLogin;
