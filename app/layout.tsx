import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "사진과 — 업무일정",
  description: "사진과의 촬영 일정·장비·진행 상황을 한곳에서 관리합니다.",
  // PWA — 홈 화면에 추가하면 앱처럼(주소창 없이) 실행
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" }, // SVG 파비콘 미지원 브라우저 폴백
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "사진과", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#3182f6",
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
