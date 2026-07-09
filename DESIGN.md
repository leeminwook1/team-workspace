# 팀 업무일정 관리 시스템 — 설계 문서

> 여러 팀(사진 · 영상 · 디자인 · 문화예술 · 공연예술 · 방송예술 · 음향 등)의 업무 일정을
> 달력 기반으로 관리하는 웹 서비스. Next.js + React + MongoDB 스택, Vercel 배포.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | (미정 — 예: *TeamCal*, *WorkBoard*, *일정판*) |
| 목적 | 팀별 업무를 달력에 등록/조회하고, 담당자·마감·상태를 한눈에 관리 |
| 대상 사용자 | 여러 팀에 소속된 구성원 + 팀장 + 전체 관리자 |
| 핵심 흐름 | 로그인 → 소속 팀 선택 → 달력에서 날짜 클릭 → 업무 등록 → 담당자 지정 → 상태 추적 |
| 배포 | Vercel (프론트 + API Routes), MongoDB Atlas (DB) |

### 핵심 컨셉
- **달력이 중심**: 모든 업무는 특정 날짜/기간에 매핑된다.
- **팀은 확장 가능**: 팀 목록은 하드코딩이 아니라 DB에서 관리 (나중에 팀 추가/삭제 가능).
- **권한이 기능을 결정**: 같은 화면이라도 역할에 따라 보이는 것/할 수 있는 것이 다르다.

---

## 2. 기술 스택

| 레이어 | 기술 | 비고 |
|--------|------|------|
| 프레임워크 | **Next.js 14+ (App Router)** | SSR/RSC, API Routes 한 프로젝트에서 |
| UI | **React 18**, TypeScript | 타입 안정성 필수 |
| 스타일 | **Tailwind CSS** + shadcn/ui | 빠른 개발, 일관된 디자인 |
| 달력 UI | **FullCalendar** ✅(결정) | 월/주/일·드래그·리사이즈. core는 **MIT(무료)**, 자원 타임라인 등 프리미엄 플러그인만 유료(내부용이라 부담 없음) |
| 상태관리 | **TanStack Query** (서버 상태) + Zustand (클라이언트 상태) | 캐싱/동기화 |
| 인증 | **NextAuth.js (Auth.js v5)** | Credentials + OAuth 확장 가능 |
| DB | **MongoDB Atlas** | Mongoose ODM 권장 |
| 폼/검증 | **React Hook Form** + **Zod** | 프론트·백엔드 스키마 공유 |
| 배포 | **Vercel** | Git 연동 자동 배포 |
| 파일저장 | **Vercel Blob** 또는 AWS S3 / Cloudinary | 첨부파일·이미지 |

> **왜 이 조합?** Next.js API Routes를 쓰면 별도 백엔드 서버 없이 Vercel 하나로 끝난다.
> Mongoose는 스키마 검증을 DB단에서 잡아줘서 데이터 무결성에 유리하다.

---

## 3. 사용자 역할 및 권한 (RBAC)

### 3.1 역할 체계 — 2축 구조 (전사 역할 + 팀 역할)

권한을 **① 전사(조직) 역할**과 **② 팀 내 역할** 두 축으로 부여한다.
한 사람은 전사 역할(선택) + 팀별 역할(복수 겸직 가능)을 **동시에** 가질 수 있다.

**① 전사(조직) 역할 — 팀 경계를 넘어 모든 팀 조회**

| 역할 | 설명 | 핵심 권한 |
|------|------|-----------|
| **최고관리자 (Admin)** | 시스템 관리자 | 가입 승인, 팀 생성/삭제, 전 사용자·권한 관리, 전체 조회 |
| **과장 (Manager)** | 전사 관리 | 모든 팀 조회 + 전 팀 업무 등록·수정 + 가입 승인 (삭제 ✕) |
| **부과장 (Deputy)** | 전사 부관리 | 모든 팀 조회 + 전 팀 업무 등록·수정 + 가입 승인 (삭제 ✕) |
| **서기 (Secretary)** | 전사 기록 | 모든 팀 조회(읽기 전용) + 주간/월간 보고 작성 |

**② 팀 내 역할 — 소속 팀 단위**

| 역할 | 핵심 권한 |
|------|-----------|
| **팀장 (Leader)** | 업무 등록·수정·**삭제**, 팀원 관리 |
| **부팀장 (Vice Leader)** | 업무 등록·수정 (삭제 ✕) |
| **팀원 (Member)** | 조회 + **본인 담당** 업무 상태 변경 |

> 핵심 규칙: **등록/수정 = 팀장·부팀장**, **삭제 = 팀장만**, 팀원은 조회 + 본인 상태 변경.
> 전사 역할(과장·부과장·서기)은 소속과 무관하게 **모든 팀**을 본다.

### 3.2 권한 매트릭스

| 액션 | Admin | 과장·부과장 | 서기 | 팀장 | 부팀장 | 팀원 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 일정 조회 | 전체 | 전체 | 전체 | 자기팀 | 자기팀 | 자기팀 |
| 업무 등록 | ✅ | ✅ 전 팀 | ❌ | ✅ 자기팀 | ✅ 자기팀 | ❌ |
| 업무 수정 | ✅ | ✅ 전 팀 | ❌ | ✅ 자기팀 | ✅ 자기팀 | 본인 상태만 |
| 업무 삭제 | ✅ | ❌ | ❌ | ✅ 자기팀 | ❌ | ❌ |
| 상태 변경 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ 담당분 |
| 가입 승인 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 팀 생성/삭제 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 팀원 배정 | ✅ | ❌ | ❌ | ✅ 자기팀 | ❌ | ❌ |

> ✅ **확정**: 과장·부과장 = 모든 팀 조회 + 전 팀 업무 등록·수정 + 가입 승인. **업무 삭제는 불가**(삭제는 팀장·Admin만).

### 3.3 권한 체크 위치
- **프론트엔드**: UI 숨김/비활성화 (UX 목적, 보안 아님)
- **백엔드(API)**: 실제 권한 검증 — **모든 API에서 세션+역할 검증 필수** ⚠️
- 미들웨어(`middleware.ts`)에서 로그인 여부 1차 필터, API 핸들러에서 역할 2차 검증

---

## 4. 데이터 모델 (MongoDB 스키마)

### 4.1 User (사용자)
```js
{
  _id: ObjectId,
  email: String,          // 로그인 ID (unique)
  passwordHash: String,   // bcrypt 해시 (Credentials 로그인 시)
  name: String,
  avatarUrl: String,
  orgRole: String,        // 전사 역할: "admin" | "manager"(과장) | "deputy"(부과장) | "secretary"(서기) | null
  teams: [                // 팀별 소속 + 역할 (복수 겸직 가능)
    {
      teamId: ObjectId,   // ref: Team
      role: String        // "leader"(팀장) | "vice_leader"(부팀장) | "member"(팀원)
    }
  ],
  status: String,         // "pending"(승인대기) | "active" | "disabled"
  // 편의: orgRole != null 이면 모든 팀 조회 가능 (canViewAllTeams)
  createdAt: Date,
  updatedAt: Date
}
```

### 4.2 Team (팀)
```js
{
  _id: ObjectId,
  name: String,           // "사진", "영상", "디자인" ...
  slug: String,           // "photo", "video" (URL용, unique)
  color: String,          // 달력 표시 색상 (#3B82F6)
  description: String,
  isActive: Boolean,
  createdBy: ObjectId,    // ref: User
  createdAt: Date
}
```

### 4.3 Task (업무 = 달력 이벤트)
```js
{
  _id: ObjectId,
  title: String,          // 업무 제목
  description: String,    // 상세 내용
  teamId: ObjectId,       // ref: Team
  assignees: [ObjectId],  // 담당자들 (ref: User)
  createdBy: ObjectId,    // 등록자

  // 일정
  startDate: Date,        // 시작 일시
  endDate: Date,          // 종료/마감 일시
  allDay: Boolean,        // 하루 종일 여부

  // 상태 관리
  status: String,         // "todo" | "in_progress" | "done" | "hold"
  priority: String,       // "low" | "normal" | "high" | "urgent"

  // 부가
  tags: [String],
  attachments: [{ name, url, size }],
  location: String,       // 촬영지/공연장 등 (예술팀 특성상 유용)
  color: String,          // 개별 색상 오버라이드

  createdAt: Date,
  updatedAt: Date
}
```

### 4.4 Comment (업무 댓글 — 협업용)
```js
{
  _id: ObjectId,
  taskId: ObjectId,       // ref: Task
  authorId: ObjectId,     // ref: User
  content: String,
  createdAt: Date
}
```

### 4.5 Notification (알림)
```js
{
  _id: ObjectId,
  userId: ObjectId,       // 받는 사람
  type: String,           // "assigned" | "comment" | "deadline" | "invite"
  message: String,
  relatedTaskId: ObjectId,
  isRead: Boolean,
  createdAt: Date
}
```

### 4.6 Resource & Reservation (자원·장비 예약 — MVP 신규기능 C)
```js
// 공유 자원: 스튜디오/촬영장비/공연장/편집실/음향장비 등
Resource {
  _id: ObjectId,
  name: String,           // "성수 스튜디오 A", "RED 카메라 1호"
  category: String,       // "studio" | "camera" | "venue" | "audio" | "edit" | "etc"
  ownerTeamId: ObjectId,  // 관리 주체 팀 (null = 공용)
  isActive: Boolean,
  createdAt: Date
}

// 예약: 자원을 기간 단위로 점유 → 중복 예약 충돌 방지
Reservation {
  _id: ObjectId,
  resourceId: ObjectId,   // ref: Resource
  reservedBy: ObjectId,   // ref: User
  teamId: ObjectId,       // 예약한 팀
  relatedTaskId: ObjectId,// (선택) 연결된 업무
  startAt: Date,
  endAt: Date,
  note: String,
  status: String,         // "booked" | "cancelled"
  createdAt: Date
}
```
> **충돌 방지 핵심**: 예약 생성 시 `resourceId`가 같고 `[startAt, endAt)` 구간이 겹치는 `status:"booked"` 예약이 있으면 **409 거절**.
> 서버리스 동시성 대비 — 겹침 검사 + 삽입을 트랜잭션 또는 유니크 조건으로 원자화 권장.

### 4.7 인덱스 전략 (성능)
```js
Task:  { teamId: 1, startDate: 1 }        // 팀별 달력 조회
Task:  { assignees: 1, startDate: 1 }      // 내 업무 조회
User:  { email: 1 } (unique)
User:  { status: 1 }                       // 가입 승인 대기열 조회
Team:  { slug: 1 } (unique)
Reservation: { resourceId: 1, startAt: 1, endAt: 1 }  // 자원 예약 충돌 검사
Notification: { userId: 1, isRead: 1 }
```

---

## 5. 인증 / 로그인 설계

### 5.1 방식
- **1차 (MVP)**: NextAuth **Credentials Provider** (이메일 + 비밀번호)
- **2차 (확장)**: Google / Kakao OAuth 추가 (`teams`가 비어있으면 관리자 승인 대기 상태로)

### 5.2 흐름
```
회원가입/초대 → 로그인 → JWT 세션 발급 → middleware가 보호된 경로 검사
   → 세션에 { userId, teams:[{teamId, role}], isSuperAdmin } 저장
   → 각 API가 세션 기반 권한 검증
```

### 5.3 가입 정책 — 자유가입 + 관리자 승인제 ✅ (결정됨)
1. 사용자가 이메일/비밀번호로 **가입 신청** → `status: "pending"`
2. **승인 권한자(최고관리자 · 과장 · 부과장)**가 **소속 팀 + 팀 역할 + (선택) 전사 역할**을 배정하며 승인 → `status: "active"`
3. 승인 전에는 로그인해도 **"승인 대기"** 화면만 노출 (달력 접근 불가).

> 신청이 몰릴 수 있으니 **관리자 승인 대기열(가입 요청 관리 화면)**이 필요 → 8번 신규기능 **A**.
> 보안상 pending 사용자는 모든 데이터 API에서 차단해야 함 (미들웨어 + API 이중 체크).

---

## 6. 화면 / 페이지 구조

```
/                      → 로그인 안 하면 로그인 페이지로 리다이렉트
/login                 → 로그인
/register              → (초대 토큰 기반) 회원가입

/dashboard             → 내 대시보드 (오늘 할 일, 마감 임박, 알림)
/calendar              → 메인 달력 (월/주/일 뷰, 팀 필터)
/calendar/[teamSlug]   → 특정 팀 달력
/tasks                 → 업무 리스트 뷰 (필터/정렬/검색)
/tasks/[id]            → 업무 상세 (댓글, 첨부, 상태 변경)

/teams                 → 팀 목록
/teams/[slug]          → 팀 상세 (팀원, 팀 일정)

/admin                 → 관리자 전용
  /admin/users         → 사용자·권한 관리
  /admin/teams         → 팀 생성/수정
/settings              → 내 프로필/알림 설정
```

### 6.1 메인 달력 화면 구성 (핵심)
```
┌─────────────────────────────────────────────┐
│ [로고]        [팀 필터 ▾] [+ 업무추가]  [🔔][👤] │
├──────────┬──────────────────────────────────┤
│ 팀 목록    │        📅  월/주/일 달력            │
│ ☑ 사진    │   ┌──┬──┬──┬──┬──┬──┬──┐          │
│ ☑ 영상    │   │  │  │■ │  │■ │  │  │          │
│ ☑ 디자인  │   │  │■■│  │  │  │■ │  │          │
│ ☐ 음향    │   └──┴──┴──┴──┴──┴──┴──┘          │
│  ...      │   (팀 색상별로 업무 블록 표시)        │
├──────────┴──────────────────────────────────┤
│ 하단: 선택 날짜의 업무 입력창 / 오늘 업무 리스트     │
└─────────────────────────────────────────────┘
```
- 팀별로 **색상 구분** → 여러 팀 일정을 한 달력에서 겹쳐 보기 가능
- 왼쪽 체크박스로 **팀 필터링**
- 날짜 클릭 → 하단 또는 모달에서 바로 업무 입력 (요청하신 흐름)
- 드래그로 기간 조정, 클릭으로 상세 열기

---

## 7. API 설계 (Next.js API Routes / Route Handlers)

| Method | 경로 | 설명 | 권한 |
|--------|------|------|------|
| POST | `/api/auth/[...nextauth]` | 로그인/세션 | - |
| GET | `/api/tasks?team=&from=&to=` | 기간·팀별 업무 조회 | 로그인 |
| POST | `/api/tasks` | 업무 생성 | 팀원+ |
| PATCH | `/api/tasks/:id` | 업무 수정/상태변경 | 팀장 or 담당자 |
| DELETE | `/api/tasks/:id` | 업무 삭제 | 팀장+ |
| GET | `/api/teams` | 팀 목록 | 로그인 |
| POST | `/api/teams` | 팀 생성 | Admin |
| POST | `/api/teams/:id/members` | 팀원 초대 | 팀장+ |
| GET | `/api/users` | 사용자 목록 | Admin |
| PATCH | `/api/users/:id/role` | 권한 변경 | Admin |
| GET | `/api/admin/pending` | 가입 승인 대기열 | Admin·과장·부과장 |
| POST | `/api/admin/users/:id/approve` | 승인 + 팀·역할 배정 | Admin·과장·부과장 |
| GET | `/api/resources` | 자원·장비 목록 | 로그인 |
| GET | `/api/reservations?resource=&from=&to=` | 자원 예약 조회 | 로그인 |
| POST | `/api/reservations` | 자원 예약(중복 시 409) | 팀장·부팀장·과장·부과장 |
| GET | `/api/notifications` | 내 알림 | 로그인 |

> 응답은 일관된 형태로: `{ success, data, error }`
> Zod로 요청 body 검증 → 통과 못 하면 400.

---

## 8. 추가 추천 기능 (있으면 좋은 것)

우선순위 순으로 정리했습니다.

### ⭐ 강력 추천 (예술/제작팀 특성상 유용)
1. **업무 상태 워크플로우** — 할일 → 진행중 → 완료 (칸반 보드 뷰 추가)
2. **담당자 배정 + 알림** — 배정되면 알림, 마감 임박 시 알림
3. **반복 일정** — 정기 회의/촬영 등 매주 반복 (RRULE)
4. **첨부파일** — 촬영 콘티, 디자인 시안, 대본 등 파일 업로드
5. **필터/검색** — 담당자별·상태별·태그별 업무 필터

### 👍 추천
6. **리스트 뷰 / 칸반 뷰 전환** — 달력 외에 다른 관점으로 보기
7. **팀 간 협업 업무** — 여러 팀이 함께하는 프로젝트(예: 공연 = 영상+음향+공연) 태깅
8. **활동 로그** — 누가 언제 무엇을 바꿨는지 기록 (감사/추적)
9. **대시보드 통계** — 팀별 완료율, 이번 주 마감 개수 등
10. **모바일 반응형** — 현장에서 폰으로 확인 (예술팀 특성상 필수)

### 🔮 나중에
11. **캘린더 외부 연동** — Google Calendar 동기화, iCal 내보내기
12. **다크모드** — (Toss 톤으로 이미 시안에 반영됨)
13. **@멘션 & 실시간 알림** (Server-Sent Events / Pusher)
14. **간트 차트** — 프로젝트 단위 장기 일정 관리
15. **파일 버전 관리** — 시안 v1, v2... (디자인팀)

### 🆕 2차 추천 (결정된 구조·조직 특성 반영)

결정 사항(승인제 가입, 전사 역할, 제작팀 특성)을 반영해 새로 제안합니다.

**필수 (결정에 따라 반드시 필요)**
- **A. 가입 요청 관리 화면** — 승인 대기(pending) 목록에서 팀·역할 배정 후 승인/거절. *승인제를 택했으므로 필수.*
- **B. 승인 대기 안내 화면** — pending 사용자가 로그인 시 보는 대기 페이지.

**강력 추천 (제작팀 도메인 특화)**
- **C. 자원·장비 예약** — 스튜디오/촬영장비/공연장/편집실/음향장비 등 공유 자원을 날짜별로 예약, **중복 예약 충돌 방지**. (사진·영상·공연·음향 팀에 특히 유용. FullCalendar 리소스 뷰와 잘 맞음)
- **D. 휴가·부재 관리** — 연차/촬영출장/외부일정 등 부재를 팀 캘린더에 표시 → 업무 배정 시 충돌 사전 경고.
- **E. 카카오톡 알림톡 / 이메일 알림** — 업무 배정·마감임박·가입승인 알림. 한국 내부 팀은 웹푸시보다 **알림톡 도달률**이 높음.
- **F. 확인(ack)·결재 라인** — 상급자(과장/서기)가 특정 업무를 **확인/승인**해야 확정. 팀원이 배정 업무를 봤는지 **읽음 표시**.

**추천**
- **G. 서브태스크/체크리스트** — 촬영 준비물, 공연 큐시트 같은 세부 항목 체크.
- **H. 주간·월간 업무 보고 자동 생성** — 서기 역할과 연결, PDF/엑셀 내보내기.
- **I. 드래그&드롭 일정 이동** — 달력에서 끌어 날짜/기간 변경 (FullCalendar 기본 기능).
- **J. PWA (홈화면 설치 + 오프라인 캐시)** — 현장에서 앱처럼. Vercel과 궁합 좋음.
- **K. iCal 구독 링크** — 개인 구글/애플 캘린더에서 팀 일정 구독.
- **L. 전체 검색 + 저장된 필터** — 권한·팀이 많아 빠른 탐색 필요.
- **M. 활동 로그(감사)** — 역할이 많아 "누가 언제 무엇을" 추적 필요.

---

## 9. 폴더 구조 (Next.js App Router)

```
team-workspace/
├─ app/
│  ├─ (auth)/
│  │  ├─ login/page.tsx
│  │  └─ register/page.tsx
│  ├─ (main)/
│  │  ├─ dashboard/page.tsx
│  │  ├─ calendar/page.tsx
│  │  ├─ tasks/
│  │  │  ├─ page.tsx
│  │  │  └─ [id]/page.tsx
│  │  ├─ teams/...
│  │  └─ admin/...
│  ├─ api/
│  │  ├─ auth/[...nextauth]/route.ts
│  │  ├─ tasks/route.ts
│  │  ├─ tasks/[id]/route.ts
│  │  ├─ teams/route.ts
│  │  └─ ...
│  ├─ layout.tsx
│  └─ globals.css
├─ components/
│  ├─ calendar/CalendarView.tsx
│  ├─ tasks/TaskForm.tsx
│  ├─ tasks/TaskCard.tsx
│  └─ ui/            (shadcn 컴포넌트)
├─ lib/
│  ├─ mongodb.ts     (DB 연결 캐싱)
│  ├─ auth.ts        (NextAuth 설정)
│  ├─ permissions.ts (권한 체크 유틸)
│  └─ validations.ts (Zod 스키마)
├─ models/           (Mongoose 모델)
│  ├─ User.ts
│  ├─ Team.ts
│  └─ Task.ts
├─ middleware.ts     (인증 가드)
├─ types/
├─ .env.local
└─ package.json
```

> **MongoDB 연결 주의**: Vercel 서버리스 환경에서는 연결을 전역 캐싱해야 함
> (`lib/mongodb.ts`에서 `global._mongoClientPromise` 패턴 사용) — 안 하면 커넥션 폭발.

---

## 10. 개발 로드맵 (단계별)

### Phase 1 — 기반 (MVP)
- [ ] 프로젝트 셋업 (Next.js + TS + Tailwind + MongoDB 연결)
- [ ] User(orgRole+팀역할 2축)/Team/Task 모델 정의
- [ ] NextAuth 로그인 (Credentials) + **가입 신청(pending)**
- [ ] **가입 승인 대기열 화면 (A)** + 승인 대기 안내 화면 (B) — 승인 권한: Admin·과장·부과장
- [ ] 팀 CRUD (관리자)
- [ ] 기본 달력 뷰(FullCalendar) + 업무 등록/조회

### Phase 2 — 핵심 기능 (1차 완성)
- [ ] 권한(RBAC) 적용 — 2축 역할 API 검증 (등록·수정=팀장·부팀장·과장·부과장 / 삭제=팀장·Admin)
- [ ] 업무 상세/수정/삭제, 담당자 배정
- [ ] 팀별 색상·필터, 전사 역할의 전 팀 조회
- [ ] 상태 워크플로우 (todo/progress/done)
- [ ] **자원·장비 예약 (C)** — Resource/Reservation + 중복 충돌 방지

### Phase 3 — 협업
- [ ] 댓글, 첨부파일
- [ ] 알림 시스템
- [ ] 리스트/칸반 뷰
- [ ] 대시보드

### Phase 4 — 고도화
- [ ] 반복 일정, 검색/필터 고도화
- [ ] 활동 로그, 통계
- [ ] 외부 캘린더 연동

---

## 11. Vercel 배포 설정

### 환경 변수 (Vercel Dashboard에 등록)
```
MONGODB_URI=mongodb+srv://...        # MongoDB Atlas 연결
NEXTAUTH_SECRET=...                  # openssl rand -base64 32
NEXTAUTH_URL=https://your-app.vercel.app
BLOB_READ_WRITE_TOKEN=...            # Vercel Blob (파일 저장 시)
```

### 배포 체크리스트
- [ ] MongoDB Atlas에서 Vercel IP 화이트리스트 (`0.0.0.0/0` 또는 Vercel IP)
- [ ] Git 저장소 Vercel 연결 → main 브랜치 자동 배포
- [ ] 서버리스 함수 타임아웃 고려 (무거운 작업은 분리)
- [ ] `NEXTAUTH_URL`을 실제 도메인으로 설정

---

## 12. 핵심 결정 사항 — ✅ 결정 완료 (3·4·5장에 반영됨)

아래 5개 항목 모두 답변 완료. 역할 체계는 **3장**, 가입정책은 **5.3**, 달력은 **2장**, 디자인은 시안(Toss 톤)에 반영했다.

1. **가입 방식** — 초대제 vs 자유가입+승인제? (권장: 초대제)
-> 가입신청 후 관리자 승인
2. **팀원이 직접 업무를 등록**할 수 있게 할지, **팀장만** 등록하고 팀원은 상태만 바꿀지?
-> 팀장과 부팀장 권한 추가해서 두권한만 등록 수정 가능 삭제는 팀장만
3. **한 사람이 여러 팀 겸직**을 실제로 허용할지? (설계엔 반영해둠)
-> 모든 팀을 다 볼 수 있는 과장,부과장, 서기 있음
4. **달력 라이브러리** — FullCalendar(기능 풍부, 상업용 라이선스 주의) vs react-big-calendar(무료, 가벼움)?
-> 상업용으로 팔거나 하지 않고 내부용으로 사용예정 기능 풍부한걸로 
5. **디자인 톤** — 심플/미니멀 vs 컬러풀? (예술팀이라 후자도 어울림)
-> 심플/미니멀에 포인트 추가 (**Toss 톤 확정** — `design-draft.html` 시안 참조)

### 12.1 2차 결정 — ✅ 확정 완료
- **과장·부과장 권한** → 모든 팀 조회 + 전 팀 업무 등록·수정 + 가입 승인 (**삭제 ✕**)
- **가입 승인 권한자** → 최고관리자 + 과장 + 부과장
- **서기** → 모든 팀 읽기 전용 + 주간/월간 보고 작성
- **MVP 신규기능** → **A**(가입 승인 화면, 기본) + **C**(자원·장비 예약). D·E·F(부재관리·알림톡·확인결재)는 Phase 3+로.

---

*이 문서는 초기 설계안입니다. 위 12번 결정사항이 정해지면 곧바로 프로젝트 스캐폴딩(폴더/모델/로그인)부터 구현을 시작할 수 있습니다.*
