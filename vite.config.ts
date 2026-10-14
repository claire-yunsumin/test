import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],base:process.env.GITHUB_PAGES==='true'?'/test/':'/',test:{environment:'node'}});
