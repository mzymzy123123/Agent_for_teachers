import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// Vite 配置
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0', // 允许外部访问
  },
});


