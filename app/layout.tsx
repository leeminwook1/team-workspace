import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "CHQ — 문화과 업무일정",
  description: "문화과 모든 팀의 업무 일정을 하나의 달력에서 관리합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {/* Pretendard 동적 서브셋 — 쓰인 글리프 조각만 다운로드(unicode-range),
            font-display:swap 내장이라 로딩 중에도 시스템 폰트로 먼저 그려짐.
            (font-family 스택의 "Pretendard Variable"이 이 CSS로 채워진다) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          crossOrigin="anonymous"
        />
        {/* 테마 플래시 방지: 저장된 테마를 페인트 전에 적용 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
