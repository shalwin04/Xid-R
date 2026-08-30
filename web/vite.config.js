import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// Hardcode backend URL for development
var BACKEND_URL = "http://127.0.0.1:8080";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 3000,
        strictPort: false,
        proxy: {
            "/api": {
                target: BACKEND_URL,
                changeOrigin: true,
            },
            "/mcp": {
                target: BACKEND_URL,
                changeOrigin: true,
            },
            "/health": {
                target: BACKEND_URL,
                changeOrigin: true,
            },
        },
    },
});
