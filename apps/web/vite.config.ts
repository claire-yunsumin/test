import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 5173에 다른(구) dev 서버가 떠 있을 때 Vite가 5174로 떨어지면, 브라우저가 5173 북마크로 열면 UI가 "예전"처럼 보입니다. 로컬 HWE web은 5174로 통일합니다.
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    // dev에서 브라우저/프록시가 HTML·모듈을 잡고 있으면 하드리프레시해도 옛 UI처럼 보일 수 있음
    headers: {
      "Cache-Control": "no-store"
    }
  }
});
