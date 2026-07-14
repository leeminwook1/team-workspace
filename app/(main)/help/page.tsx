import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

export const dynamic = "force-dynamic";

// 사용 안내 — 정적 가이드 (모든 로그인 사용자)

function Sec({ id, icon, tint, title, tag, children }: {
  id: string; icon: IconName; tint: string; title: string; tag?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="help-sec card">
      <div className="help-sec-head">
        <span className="help-sec-ico" style={{ background: `color-mix(in srgb, ${tint} 11%, transparent)`, color: tint }}>
          <Icon name={icon} size={16} />
        </span>
        <h2>{title}</h2>
        {tag && <span className="help-tag">{tag}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="help-row">
      <b className="help-row-k">{k}</b>
      <p className="help-row-v">{children}</p>
    </div>
  );
}

export default function HelpPage() {
  const toc = [
    ["start", "시작하기"],
    ["calendar", "달력·업무"],
    ["personal", "내 캘린더"],
    ["team", "팀 현황·부재"],
    ["resources", "장비 예약"],
    ["events", "행사"],
    ["todo", "TODO"],
    ["telegram", "텔레그램"],
    ["ical", "캘린더 구독"],
    ["roles", "권한"],
    ["tips", "팁"],
  ] as const;

  return (
    <div className="help">
      <h1 className="help-title">사용 안내</h1>
      <p className="help-sub">문화과의 일정·장비·행사를 한곳에서 관리해요.<br />처음이라면 시작하기부터, 궁금한 기능은 목차에서 골라 보세요.</p>

      <nav className="help-toc" aria-label="목차">
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="help-toc-chip">{label}</a>
        ))}
      </nav>

      <Sec id="start" icon="home" tint="var(--primary)" title="시작하기">
        <div className="help-rows">
          <Row k="1. 가입">이름·이메일·팀으로 신청하면 과장·부과장이 승인해요. 승인 후 바로 로그인.</Row>
          <Row k="2. 홈 꾸미기">홈의 <b>위젯 편집</b>으로 미니 달력, 내 담당 업무, 오늘 예약을 원하는 순서로 배치해요.</Row>
          <Row k="3. 알림 연결"><Link href="/settings">설정</Link>에서 텔레그램(알림·명령)과 캘린더 구독(폰 연동)을 켜면 준비 끝.</Row>
        </div>
        <p className="help-note">
          <b>설정은 어디에?</b> 왼쪽 아래(모바일은 오른쪽 위)에 있는 <b>내 이름 동그라미(⚙)</b>를 누르면 내 계정 설정이 열려요.
          이름·비밀번호 변경, 텔레그램 연동, 캘린더 구독을 여기서 해요.
        </p>
      </Sec>

      <Sec id="calendar" icon="calendar" tint="var(--primary)" title="달력 · 업무">
        <div className="help-rows">
          <Row k="등록">제목·팀·기간·담당자를 넣어 팀 일정을 올려요. 매일·매주·매월 <b>반복</b>도 등록할 때 설정해요.</Row>
          <Row k="장비 연동">대여 장비를 고르면 그 시간에 자원 예약이 함께 잡혀요. 장비마다 <b>담당자</b>를 정하면 반납 책임도 그 사람에게 넘어가요.</Row>
          <Row k="진행">일정을 클릭해 상태(예정·진행중·완료·보류)를 바꾸고 댓글을 남겨요. 달력에서 <b>드래그</b>로 날짜를 옮길 수 있어요.</Row>
          <Row k="필터">팀·분류·상태·내 일정만 골라 보거나 목록 보기로 전환해요.</Row>
          <Row k="복구">삭제한 업무는 30일간 <b>휴지통</b>에 남아요. 달력 상단에서 되살릴 수 있어요.</Row>
        </div>
        <p className="help-note">담당자 이름에 🏖가 있으면 그 기간 연차·출장 중이라는 뜻이에요. 지정하면 경고로 알려드려요.</p>
      </Sec>

      <Sec id="personal" icon="userLine" tint="#8b5cf6" title="내 캘린더">
        <div className="help-rows">
          <Row k="개인 일정">병원·경조사처럼 나만 보면 되는 일정을 따로 관리해요. 텔레그램 <code>/개인 병원 내일 15-16</code>으로도 등록돼요.</Row>
          <Row k="공개 범위">본인, 같은 팀 팀장, 최고관리자까지만 볼 수 있어요. 과장단·서기는 팀장의 캘린더만 볼 수 있어요.</Row>
        </div>
      </Sec>

      <Sec id="team" icon="users" tint="#12b3a6" title="팀 현황 · 부재">
        <div className="help-rows">
          <Row k="겹쳐보기">팀원들의 개인 일정을 색으로 구분해 한 달력에 모아 봐요. 이름 칩으로 켜고 끌 수 있어요.</Row>
          <Row k="부재 등록">연차·반차·출장·교육을 등록하면 달력에 표시되고, 업무 담당자로 지정할 때 경고가 떠요.</Row>
          <Row k="권한">본인은 자기 것, 팀장·부팀장은 팀원 것, 과장단·서기는 전체를 등록할 수 있어요.</Row>
        </div>
      </Sec>

      <Sec id="resources" icon="resources" tint="#e8951b" title="자원 · 장비 예약">
        <div className="help-rows">
          <Row k="타임라인">행은 장비, 가로는 시간이에요. 왼쪽에서 분류를 고르고, <b>장비 이름을 누르면 주간 보기</b>로 들어가요.</Row>
          <Row k="바로 예약">빈 곳을 클릭하면 그 시각부터, <b>드래그하면 끌어놓은 시간대 그대로</b> 예약 창이 열려요. 겹치면 빨간 경고가 떠요.</Row>
          <Row k="끌어서 수정">내 예약 막대는 좌우로 끌어 시간을 옮기고, 끝을 잡아 늘리거나 줄여요. 모바일은 길게 누른 뒤 끌어요.</Row>
          <Row k="여러 개 대여">[예약하기]에서 카메라·렌즈·배터리를 한 번에 골라 기간 대여해요.</Row>
          <Row k="반납">예약자 본인, 장비 담당자, 과장단이 처리해요. 미반납이면 아침에 텔레그램 [반납] 버튼이 와요.</Row>
          <Row k="편의">자주 쓰는 장비는 ★ 즐겨찾기로 고정하고, "빈 장비만"으로 비어 있는 것만 골라 봐요. 수리중 장비는 빗금으로 표시돼요.</Row>
        </div>
      </Sec>

      <Sec id="events" icon="board" tint="#f0466e" title="행사 관리">
        <div className="help-rows">
          <Row k="할 일 보드">행사마다 할 일 → 진행중 → 보류 → 완료 보드를 운영해요. 카드를 끌거나 화살표로 옮겨요.</Row>
          <Row k="마감 알림">할 일에 담당자·마감일을 붙이면 마감일 아침에 알림이 가요. D-day 뱃지로 임박한 행사를 확인해요.</Row>
          <Row k="정리">끝난 행사는 종료(보관), 비슷한 행사는 복제로 할 일 목록을 재활용해요. 삭제해도 30일 안엔 복구돼요.</Row>
        </div>
      </Sec>

      <Sec id="todo" icon="inbox" tint="#3182f6" title="TODO (지시)" tag="팀장 이상">
        <div className="help-rows">
          <Row k="하달">과장단·서기가 팀장에게 할 일을 내려줘요. 팀장이 확인하면 발신자에게 읽음이 표시돼요.</Row>
          <Row k="처리">팀장은 상태를 바꾸고 팀원에게 분배하거나, 일정으로 등록해 달력에 올려요.</Row>
          <Row k="리포트">팀별 리포트 탭에서 완료율과 평균 처리일을 확인해요.</Row>
        </div>
      </Sec>

      <Sec id="telegram" icon="bell" tint="#229ed9" title="텔레그램 봇">
        <div className="help-rows">
          <Row k="연동"><Link href="/settings">설정</Link>에서 코드를 발급받아 <b>@teamcal_noti_bot</b>에게 <code>/연동 123456</code>을 보내면 연결돼요.</Row>
          <Row k="알림">담당 배정·마감·지연·장비 알림이 와요. 설정에서 종류별로 켜고 끌 수 있어요.</Row>
          <Row k="팀 브리핑">그룹방에 봇을 초대하고 <code>/챗아이디</code>로 확인한 ID를 관리자에게 전달하면, 매일 아침 팀 브리핑이 와요.</Row>
        </div>
        <div className="help-tbl-wrap">
          <table className="help-tbl">
            <thead><tr><th>명령</th><th>하는 일</th></tr></thead>
            <tbody>
              <tr><td><code>/일정 제목 날짜 시간</code></td><td>팀 일정 등록 — <code>담당:이름</code> <code>장비:이름</code> 옵션</td></tr>
              <tr><td><code>/개인 제목 날짜 시간</code></td><td>내 캘린더에 개인 일정 등록</td></tr>
              <tr><td><code>/예약 장비명 날짜 시간</code></td><td>장비 예약 — 쉼표로 여러 개</td></tr>
              <tr><td><code>/오늘 · /내일 · /이번주</code></td><td>일정 조회</td></tr>
              <tr><td><code>/내일정</code></td><td>내 담당 업무 (번호 표시)</td></tr>
              <tr><td><code>/완료 3</code></td><td>번호나 제목으로 완료 처리</td></tr>
              <tr><td><code>/검색 키워드</code></td><td>일정 제목 검색</td></tr>
              <tr><td><code>/내예약</code></td><td>내 장비 예약 — 반납·취소 버튼</td></tr>
              <tr><td><code>/예약현황 7/20</code></td><td>날짜별 장비 예약 현황</td></tr>
            </tbody>
          </table>
        </div>
      </Sec>

      <Sec id="ical" icon="clock" tint="#22c55e" title="캘린더 구독">
        <div className="help-rows">
          <Row k="연결"><Link href="/settings">설정</Link>에서 구독 URL을 발급받아 구글 캘린더(URL로 추가)나 아이폰(구독 캘린더 추가)에 붙여넣어요.</Row>
          <Row k="내용">내 담당 업무, 개인 일정, 부재가 폰 기본 캘린더에 나타나요. 갱신은 캘린더 앱 주기를 따라요.</Row>
          <Row k="보안">URL을 아는 사람은 내 일정을 볼 수 있어요. 유출됐다면 재발급하면 이전 주소는 바로 무효가 돼요.</Row>
        </div>
      </Sec>

      <Sec id="roles" icon="admin" tint="#64748b" title="권한 한눈에">
        <div className="help-tbl-wrap">
          <table className="help-tbl help-roles">
            <thead>
              <tr><th></th><th>팀원</th><th>부팀장</th><th>팀장</th><th>서기</th><th>부과장·과장</th><th>최고관리자</th></tr>
            </thead>
            <tbody>
              <tr><td>일정 조회</td><td>자기 팀</td><td>자기 팀</td><td>자기 팀</td><td>전체</td><td>전체</td><td>전체</td></tr>
              <tr><td>일정 등록</td><td>자기 팀</td><td>자기 팀</td><td>자기 팀</td><td>전 팀</td><td>전 팀</td><td>전 팀</td></tr>
              <tr><td>일정 수정</td><td>본인 등록건</td><td>자기 팀</td><td>자기 팀</td><td>전 팀</td><td>전 팀</td><td>전 팀</td></tr>
              <tr><td>일정 삭제</td><td>본인 등록건</td><td>본인 등록건</td><td>자기 팀</td><td>본인 등록건</td><td>본인 등록건</td><td>전체</td></tr>
              <tr><td>부재 등록</td><td>본인</td><td>자기 팀</td><td>자기 팀</td><td>전체</td><td>전체</td><td>전체</td></tr>
              <tr><td>개인 캘린더 열람</td><td>본인</td><td>본인</td><td>본인·팀원</td><td>본인·팀장들</td><td>본인·팀장들</td><td>전체</td></tr>
              <tr><td>TODO</td><td>—</td><td>—</td><td>받기·분배</td><td>내리기</td><td>내리기</td><td>내리기</td></tr>
              <tr><td>가입 승인</td><td>—</td><td>—</td><td>—</td><td>—</td><td>가능</td><td>가능</td></tr>
              <tr><td>관리자 메뉴</td><td>—</td><td>—</td><td>—</td><td>—</td><td>승인·통계</td><td>전체</td></tr>
            </tbody>
          </table>
        </div>
        <p className="help-note">장비 예약은 팀에 소속된 누구나 할 수 있고, 업무 상태 변경은 담당자 본인도 항상 가능해요.</p>
      </Sec>

      <Sec id="tips" icon="check" tint="#0ea5e9" title="팁">
        <div className="help-rows">
          <Row k="빠른 검색"><kbd>Ctrl</kbd> + <kbd>K</kbd>로 어디서든 검색 창을 열어요. 방향키로 고르고 Enter로 이동해요.</Row>
          <Row k="창 닫기"><kbd>ESC</kbd>나 바깥을 클릭하면 어떤 창이든 닫혀요.</Row>
          <Row k="자동 반영">다른 사람이 등록·수정하면 새로고침 없이 몇 초 안에 화면에 나타나요.</Row>
          <Row k="비밀번호">잊었다면 관리자에게 임시 비밀번호 발급을 요청하세요.</Row>
        </div>
      </Sec>
    </div>
  );
}
