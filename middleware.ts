// 최상단(root) middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware' // 경로 확인 필수!

export async function middleware(request: NextRequest) {
  // 여기서 실제 세션 업데이트 로직을 호출합니다.
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에서 미들웨어 실행:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화 파일)
     * - favicon.ico (파비콘)
     * 이미지 파일 확장자들
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}