import Link from "next/link";

export const dynamic = "force-dynamic";

// 사용 안내 — 정적 가이드 페이지 (모든 로그인 사용자)
export default function HelpPage() {
  const toc = [
    ["start", "🚀", "시작하기"],
    ["calendar", "📅", "달력·업무"],
    ["personal", "👤", "내 캘린더"],
    ["team", "👥", "팀 현황·부재"],
    ["resources", "📦", "장비 예약"],
    ["events", "🎪", "행사 관리"],
    ["todo", "📥", "TODO(지시)"],
    ["telegram", "✈️", "텔레그램 봇"],
    ["ical", "🗓", "캘린더 구독"],
    ["roles", "🔑", "권한 한눈에"],
    ["tips", "💡", "팁·단축키"],
  ] as const;

  return (
    <div className="help">
      <div className="help-hero">
        <h1>CHQ 사용 안내</h1>
        <p>문화과 일정·장비·행사를 한곳에서. 처음 오셨다면 <b>시작하기</b>부터, 궁금한 기능은 아래 목차에서 골라 보세요.</p>
      </div>

      {/* 목차 — 붙어 다니는 칩 */}
      <nav className="help-toc" aria-label="목차">
        {toc.map(([id, emoji, label]) => (
          <a key={id} href={`#${id}`} className="help-toc-chip">{emoji} {label}</a>
        ))}
      </nav>

      {/* ── 시작하기 ── */}
      <section id="start" className="help-sec">
        <h2>🚀 시작하기</h2>
        <div className="help-steps">
          <div className="help-step"><b>1</b><div><strong>가입 신청</strong><p>이름·이메일·팀을 골라 신청하면 과장·부과장·관리자가 승인해요. 승인되면 바로 로그인.</p></div></div>
          <div className="help-step"><b>2</b><div><strong>홈 꾸미기</strong><p>홈의 <b>위젯 편집</b>으로 미니 달력·내 담당 업무·오늘 예약 등을 원하는 순서·크기로 배치해요.</p></div></div>
          <div className="help-step"><b>3</b><div><strong>알림 연결</strong><p><Link href="/settings">설정</Link>에서 <b>텔레그램 연동</b>(알림·명령)과 <b>캘린더 구독</b>(폰 캘린더 연동)을 켜면 완성.</p></div></div>
        </div>
      </section>

      {/* ── 달력·업무 ── */}
      <section id="calendar" className="help-sec">
        <h2>📅 달력 · 업무</h2>
        <div className="help-grid">
          <div className="help-card">
            <h3>업무 등록</h3>
            <ul>
              <li>제목·팀(여러 팀 협업 가능)·기간(하루 종일/시간)·우선순위·카테고리·장소·담당자를 지정해요.</li>
              <li><b>반복</b>(매일·매주·격주·매월)도 등록 시 설정 — 이후 회차는 자동으로 이어져요.</li>
              <li>담당자 이름에 🏖가 붙으면 그 기간에 <b>부재(연차 등)</b>라는 뜻 — 지정하면 경고로 알려줘요.</li>
            </ul>
          </div>
          <div className="help-card">
            <h3>장비 함께 예약</h3>
            <ul>
              <li>업무에 <b>대여 장비</b>를 고르면 그 시간에 자원 예약이 자동으로 잡혀요 (최대 40개).</li>
              <li>장비마다 <b>담당자</b>를 지정하면 그 사람 이름으로 예약돼 반납 책임이 넘어가요. "담당자 한 번에 지정"으로 일괄 처리.</li>
              <li>이미 예약 중이거나 수리중인 장비는 목록에서 배지로 표시되고 선택이 막혀요.</li>
            </ul>
          </div>
          <div className="help-card">
            <h3>진행 관리</h3>
            <ul>
              <li>일정을 클릭해 <b>상태</b>(예정→진행중→완료→보류)를 바꾸고 댓글을 남겨요. 담당자 본인도 상태 변경 가능.</li>
              <li>달력에서 일정을 <b>드래그해 날짜 이동·기간 조절</b>이 돼요.</li>
              <li>필터(팀·분류·상태·내 일정만)와 목록 보기로 원하는 것만 골라 봐요.</li>
            </ul>
          </div>
          <div className="help-card">
            <h3>휴지통</h3>
            <ul>
              <li>삭제한 업무는 <b>30일간 휴지통</b>에 보관 — 달력 상단 [휴지통]에서 복구할 수 있어요.</li>
              <li>연동됐던 장비 예약은 복구되지 않으니 필요하면 수정에서 다시 선택하세요.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 내 캘린더 ── */}
      <section id="personal" className="help-sec">
        <h2>👤 내 캘린더 (개인 일정)</h2>
        <div className="help-card">
          <ul>
            <li>병원·경조사 같은 <b>개인 일정</b>을 따로 관리해요. 텔레그램 <code>/개인 병원 내일 15-16</code>으로도 등록 가능.</li>
            <li>열람 범위: <b>본인 + 같은 팀 팀장 + 최고관리자</b>. 과장·부과장·서기는 <b>팀장의 개인 캘린더만</b> 볼 수 있어요.</li>
            <li>팀장은 팀 현황의 "겹쳐보기"에서 팀원 개인 일정을 한 달력에 모아 봐요.</li>
          </ul>
        </div>
      </section>

      {/* ── 팀 현황·부재 ── */}
      <section id="team" className="help-sec">
        <h2>👥 팀 현황 · 부재(휴가)</h2>
        <div className="help-grid">
          <div className="help-card">
            <h3>팀원 일정 겹쳐보기</h3>
            <ul>
              <li>팀원별 색으로 개인 일정을 한 달력에 겹쳐 보여줘요. 이름 칩을 눌러 켜고 끌 수 있어요.</li>
              <li>전사 역할(과장단·서기·관리자)은 팀을 바꿔가며 볼 수 있어요.</li>
            </ul>
          </div>
          <div className="help-card">
            <h3>부재·휴가 등록</h3>
            <ul>
              <li>연차·오전/오후 반차·출장·교육을 등록하면 달력에 🏖로 표시되고, <b>업무 담당자로 지정할 때 경고</b>가 떠요.</li>
              <li>등록 권한: 본인 / 팀장·부팀장(자기 팀원) / 과장단·서기(전체). 팀 그룹방 아침 브리핑에도 부재 명단이 나가요.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 장비 예약 ── */}
      <section id="resources" className="help-sec">
        <h2>📦 자원 · 장비 예약</h2>
        <div className="help-grid">
          <div className="help-card">
            <h3>타임라인 (기본 화면)</h3>
            <ul>
              <li>행=장비, 가로=시간(00~24시). 왼쪽 트리에서 <b>전체/분류</b>를 고르고, <b>장비 이름을 클릭하면 그 장비의 주간 보기</b>로 들어가요.</li>
              <li>빈 곳을 <b>클릭</b> = 그 시각부터 예약, <b>드래그</b> = 원하는 시간대 그대로 예약 (겹치면 빨간 경고).</li>
              <li>내 예약 막대는 <b>좌우로 끌어 시간 이동</b>, <b>끝을 잡아 늘리고 줄이기</b>. 모바일은 <b>길게 눌러</b> 드래그.</li>
              <li>★를 눌러 자주 쓰는 장비를 <b>즐겨찾기</b>에 고정, "빈 장비만"으로 그 날 비어 있는 것만 보기.</li>
            </ul>
          </div>
          <div className="help-card">
            <h3>예약·반납</h3>
            <ul>
              <li>[예약하기]로 카메라·렌즈·배터리를 <b>한 번에 여러 개</b> 기간 대여할 수 있어요.</li>
              <li><b>반납</b>은 예약자 본인·장비 관리 담당자·과장단이 처리 — 미반납이면 아침에 텔레그램 [반납] 버튼이 와요.</li>
              <li>수정·삭제는 본인(관리자는 전체). 수리중·고장 장비는 빗금으로 표시되고 예약이 막혀요.</li>
              <li>지난 날짜로 가면 <b>반납 완료 이력</b>이 흐린 막대(✓)로 남아 있어요.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 행사 관리 ── */}
      <section id="events" className="help-sec">
        <h2>🎪 행사 관리</h2>
        <div className="help-card">
          <ul>
            <li>행사마다 <b>할 일 보드</b>(할 일→진행중→보류→완료)를 운영해요. 카드를 드래그하거나 ◀▶로 옮겨요.</li>
            <li>할 일에 팀·담당자·마감일을 붙이면 마감일 아침에 담당자에게 알림이 가요. D-day 뱃지로 임박한 행사를 확인.</li>
            <li>끝난 행사는 <b>종료(보관)</b>, 비슷한 행사는 <b>복제</b>로 할 일 목록을 재활용. 삭제해도 30일 내 복구 가능해요.</li>
          </ul>
        </div>
      </section>

      {/* ── TODO ── */}
      <section id="todo" className="help-sec">
        <h2>📥 TODO (지시) <span className="help-tag">팀장 이상</span></h2>
        <div className="help-card">
          <ul>
            <li>과장·부과장·서기·관리자가 <b>팀장에게 할 일을 내려주는</b> 메뉴예요. 팀장이 읽으면 발신자에게 "읽음"이 표시돼요.</li>
            <li>팀장은 상태를 바꾸고, 팀원에게 <b>분배</b>하거나 <b>일정으로 등록</b>해 달력에 올릴 수 있어요.</li>
            <li>"팀별 리포트" 탭에서 완료율·평균 처리일을 확인해요. 마감일 아침엔 팀장에게 리마인더 발송.</li>
          </ul>
        </div>
      </section>

      {/* ── 텔레그램 ── */}
      <section id="telegram" className="help-sec">
        <h2>✈️ 텔레그램 봇</h2>
        <div className="help-card">
          <h3>연동하기</h3>
          <p className="help-p">
            <Link href="/settings">설정</Link> → 텔레그램 알림 → <b>[연동 코드 발급]</b> → 텔레그램에서 <b>@teamcal_noti_bot</b>에게 <code>/연동 123456</code> 전송. 끝!
            이후 담당 배정·마감·장비 알림이 오고, 설정에서 종류별로 켜고 끌 수 있어요.
          </p>
          <h3 style={{ marginTop: 16 }}>명령어</h3>
          <div className="help-tbl-wrap">
            <table className="help-tbl">
              <thead><tr><th>명령</th><th>하는 일</th><th>예시</th></tr></thead>
              <tbody>
                <tr><td><code>/일정</code></td><td>팀 일정 등록 (담당:·장비:·@팀·#분류·!긴급 옵션)</td><td><code>/일정 노방활동 금요일 14-16 담당:이민욱 장비:캐논 R6</code></td></tr>
                <tr><td><code>/개인</code></td><td>내 캘린더에 개인 일정 등록</td><td><code>/개인 병원 내일 15-16</code></td></tr>
                <tr><td><code>/예약</code></td><td>장비 예약 (쉼표로 여러 개)</td><td><code>/예약 캐논 R6, 배터리(7-1) 내일 14-16</code></td></tr>
                <tr><td><code>/오늘 /내일 /이번주</code></td><td>일정 조회</td><td><code>/이번주</code></td></tr>
                <tr><td><code>/내일정</code></td><td>내 담당 미완료 업무 (번호 표시)</td><td><code>/내일정</code></td></tr>
                <tr><td><code>/완료</code></td><td>번호나 제목으로 완료 처리</td><td><code>/완료 3</code></td></tr>
                <tr><td><code>/검색</code></td><td>일정 제목 검색</td><td><code>/검색 촬영</code></td></tr>
                <tr><td><code>/내예약</code></td><td>내 장비 예약 + [반납]/[취소] 버튼</td><td><code>/내예약</code></td></tr>
                <tr><td><code>/예약현황</code></td><td>날짜별 장비 예약 현황</td><td><code>/예약현황 7/20</code></td></tr>
              </tbody>
            </table>
          </div>
          <p className="help-p" style={{ marginTop: 10 }}>
            <b>팀 그룹방 브리핑</b>: 그룹방에 봇을 초대하고 <code>/챗아이디</code>로 ID를 확인해 관리자에게 전달하면, 매일 아침 팀 일정·장비·부재 브리핑이 와요 (월요일엔 주간 요약).
          </p>
        </div>
      </section>

      {/* ── iCal ── */}
      <section id="ical" className="help-sec">
        <h2>🗓 캘린더 구독 (iCal)</h2>
        <div className="help-card">
          <ul>
            <li><Link href="/settings">설정</Link> → 캘린더 구독에서 <b>URL을 발급</b>받아 구글/애플 캘린더에 "URL로 추가"하면, 폰 기본 캘린더에서 <b>내 담당 업무·개인 일정·부재</b>를 볼 수 있어요.</li>
            <li>CHQ → 폰 방향의 <b>단방향</b>이고, 갱신 주기는 캘린더 앱이 정해요(보통 몇 시간). URL은 비밀 — 유출됐다면 재발급하면 즉시 무효화돼요.</li>
          </ul>
        </div>
      </section>

      {/* ── 권한 ── */}
      <section id="roles" className="help-sec">
        <h2>🔑 권한 한눈에</h2>
        <div className="help-tbl-wrap">
          <table className="help-tbl help-roles">
            <thead>
              <tr><th>할 수 있는 일</th><th>팀원</th><th>부팀장</th><th>팀장</th><th>서기</th><th>부과장·과장</th><th>최고관리자</th></tr>
            </thead>
            <tbody>
              <tr><td>일정 조회</td><td>자기 팀</td><td>자기 팀</td><td>자기 팀</td><td>전체</td><td>전체</td><td>전체</td></tr>
              <tr><td>일정 등록</td><td>자기 팀</td><td>자기 팀</td><td>자기 팀</td><td>전 팀</td><td>전 팀</td><td>전 팀</td></tr>
              <tr><td>일정 수정</td><td>본인 등록건</td><td>자기 팀</td><td>자기 팀</td><td>전 팀</td><td>전 팀</td><td>전 팀</td></tr>
              <tr><td>일정 삭제</td><td>본인 등록건</td><td>본인 등록건</td><td>자기 팀</td><td>본인 등록건</td><td>본인 등록건</td><td>전체</td></tr>
              <tr><td>장비 예약</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
              <tr><td>부재 등록</td><td>본인</td><td>자기 팀</td><td>자기 팀</td><td>전체</td><td>전체</td><td>전체</td></tr>
              <tr><td>개인 캘린더 열람</td><td>본인</td><td>본인</td><td>본인+팀원</td><td>본인+팀장들</td><td>본인+팀장들</td><td>전체</td></tr>
              <tr><td>TODO(지시)</td><td>—</td><td>—</td><td>받기·분배</td><td>내리기</td><td>내리기</td><td>내리기</td></tr>
              <tr><td>가입 승인</td><td>—</td><td>—</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
              <tr><td>관리자 메뉴</td><td>—</td><td>—</td><td>—</td><td>—</td><td>승인·통계</td><td>전체</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted-note" style={{ marginTop: 8 }}>업무 상태 변경(완료 처리 등)은 담당자 본인도 항상 가능해요.</p>
      </section>

      {/* ── 팁 ── */}
      <section id="tips" className="help-sec">
        <h2>💡 팁 · 단축키</h2>
        <div className="help-grid">
          <div className="help-card">
            <ul>
              <li><kbd>Ctrl</kbd>+<kbd>K</kbd> — 어디서든 전역 검색 (↑↓로 이동, Enter로 열기)</li>
              <li><kbd>ESC</kbd> 또는 바깥 클릭 — 모든 창 닫기</li>
              <li>오른쪽 위 ☀/🌙 — 다크 모드 전환</li>
            </ul>
          </div>
          <div className="help-card">
            <ul>
              <li>다른 사람이 등록·수정하면 <b>새로고침 없이 몇 초 안에</b> 화면에 반영돼요.</li>
              <li>비밀번호를 잊었다면 관리자에게 <b>임시 비밀번호 발급</b>을 요청하세요.</li>
              <li>더 필요한 기능이 있으면 관리자에게 알려주세요 — 계속 업데이트되고 있어요.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
