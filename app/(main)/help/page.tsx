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
    ["pipeline", "촬영 진행"],
    ["team", "과원 현황·부재"],
    ["resources", "장비 예약"],
    ["assignments", "과제"],
    ["stats", "통계"],
    ["events", "행사"],
    ["todo", "TODO"],
    ["notices", "공지·피드백"],
    ["telegram", "텔레그램"],
    ["ical", "캘린더 구독"],
    ["roles", "권한"],
    ["tips", "팁"],
  ] as const;

  return (
    <div className="help">
      <h1 className="help-title">사용 안내</h1>
      <p className="help-sub">사진과의 일정·장비·행사를 한곳에서 관리해요.<br />처음이라면 시작하기부터, 궁금한 기능은 목차에서 골라 보세요.</p>

      <nav className="help-toc" aria-label="목차">
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="help-toc-chip">{label}</a>
        ))}
      </nav>

      <Sec id="start" icon="home" tint="var(--primary)" title="시작하기">
        <div className="help-rows">
          <Row k="1. 가입">이름·이메일·직급으로 신청하면 과장이 승인해요 (부장단 직급은 관리자가 승인). 승인 후 바로 로그인.</Row>
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
          <Row k="등록">제목·기간·담당자를 넣어 과 일정을 올려요. 매일·매주·매월 <b>반복</b>도 등록할 때 설정해요.</Row>
          <Row k="중복 방지">같은 기간에 비슷한 제목의 일정이 이미 있으면 등록 전에 알려드려요. 같은 촬영이면 새로 만들지 말고 기존 일정에 담당자만 추가하세요.</Row>
          <Row k="장비 연동">대여 장비를 고르면 그 시간에 자원 예약이 함께 잡혀요. <b>📦 세트</b>를 누르면 묶인 장비가 한 번에 선택돼요. 장비마다 <b>담당자</b>를 정하면 반납 책임도 그 사람에게 넘어가요.</Row>
          <Row k="진행">일정을 클릭해 상태(예정·진행중·완료·보류)를 바꾸고 댓글을 남겨요. 달력에서 <b>드래그</b>로 날짜를 옮길 수 있어요.</Row>
          <Row k="필터">분류·상태·내 일정만 골라 보거나 목록 보기로 전환해요.</Row>
          <Row k="복구">삭제한 업무는 30일간 <b>휴지통</b>에 남아요. 달력 상단에서 되살릴 수 있어요.</Row>
        </div>
        <p className="help-note">담당자 이름에 🏖가 있으면 그 기간 연차·출장 중이라는 뜻이에요. 지정하면 경고로 알려드려요.</p>
      </Sec>

      <Sec id="personal" icon="userLine" tint="#8b5cf6" title="내 캘린더">
        <div className="help-rows">
          <Row k="개인 일정">병원·경조사처럼 나만 보면 되는 일정을 따로 관리해요. 텔레그램 <code>/개인 병원 내일 15-16</code>으로도 등록돼요.</Row>
          <Row k="공개 범위">본인, 과장(과원 것), 시스템 관리자까지만 볼 수 있어요. 부장단은 과장의 캘린더만 볼 수 있어요.</Row>
        </div>
      </Sec>

      <Sec id="pipeline" icon="check" tint="#7c5cff" title="촬영 진행">
        <div className="help-rows">
          <Row k="단계">촬영 → 백업 → 셀렉 → 보정 → 보고 순서로 체크해요. 뒤 단계를 체크하면 앞 단계도 함께 체크돼요.</Row>
          <Row k="켜기">분류가 <b>촬영</b>인 일정은 자동으로 켜지고, 다른 일정은 등록할 때 "촬영 진행 관리"를 켜면 돼요. 일정 상세 창에서도 바로 체크할 수 있어요.</Row>
          <Row k="보고 마감">기본은 촬영 끝난 뒤 7일이에요. 마감일·지연되면 담당자에게 알림이 가고, 보고를 체크하면 일정이 완료되고 연동 장비도 반납돼요.</Row>
        </div>
      </Sec>

      <Sec id="team" icon="users" tint="#12b3a6" title="과원 현황 · 부재">
        <div className="help-rows">
          <Row k="겹쳐보기">과원들의 개인 일정을 색으로 구분해 한 달력에 모아 봐요. 이름 칩으로 켜고 끌 수 있어요.</Row>
          <Row k="부재 등록">연차·반차·출장·교육을 등록하면 달력에 표시되고, 업무 담당자로 지정할 때 경고가 떠요.</Row>
          <Row k="권한">본인은 자기 것, 과장·부과장은 과원 것, 부장단은 전체를 등록할 수 있어요.</Row>
        </div>
      </Sec>

      <Sec id="resources" icon="resources" tint="#e8951b" title="자원 · 장비 예약">
        <div className="help-rows">
          <Row k="타임라인">행은 장비, 가로는 시간이에요. 왼쪽에서 분류를 고르고, <b>장비 이름을 누르면 주간 보기</b>로 들어가요.</Row>
          <Row k="바로 예약">빈 곳을 클릭하면 그 시각부터, <b>드래그하면 끌어놓은 시간대 그대로</b> 예약 창이 열려요. 겹치면 빨간 경고가 떠요.</Row>
          <Row k="끌어서 수정">내 예약 막대는 좌우로 끌어 시간을 옮기고, 끝을 잡아 늘리거나 줄여요. 모바일은 길게 누른 뒤 끌어요.</Row>
          <Row k="여러 개 대여">[예약하기]에서 카메라·렌즈·배터리를 한 번에 고르거나, <b>📦 세트</b>를 눌러 묶음째 골라요. 세트는 관리자 → 장비에서 만들어요.</Row>
          <Row k="반납">예약자 본인, 장비 담당자, 부장단이 처리해요. 반납할 때 <b>체크리스트</b>(배터리 충전·메모리 백업/포맷·이상 유무)를 확인하고, 문제가 있으면 적어주세요 — 장비 담당자와 과장에게 바로 알림이 가요. 미반납이면 아침에 텔레그램 [반납] 버튼이 와요.</Row>
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

      <Sec id="assignments" icon="camera" tint="#f59e0b" title="과제">
        <div className="help-rows">
          <Row k="출제">과장·부과장이 레퍼런스 사진과 컨셉을 올리면 과원에게 알림이 가요.</Row>
          <Row k="제출·점검">과원은 사진을 올려 제출하고, 과장은 점검 모드에서 레퍼런스와 나란히 보며 피드백을 남겨요.</Row>
          <Row k="베스트 컷">잘 찍은 사진에 ★를 누르면 베스트 컷으로 선정돼요. 선정되면 본인에게 알림이 가고, 과제 목록의 <b>★ 베스트 컷</b> 탭에 모여요.</Row>
        </div>
      </Sec>

      <Sec id="stats" icon="chart" tint="#0ea5e9" title="통계" tag="과장 이상">
        <div className="help-rows">
          <Row k="촬영">월별 촬영 건수, 사람별 촬영 횟수(담당자 기준), 평균 보고 소요일과 지연 건수를 봐요.</Row>
          <Row k="장비">장비별 가동률(실제로 빌려간 시간 비율)과 대여 횟수를 봐요. 일찍 반납하면 반납 시각까지만 계산돼요.</Row>
          <Row k="기간">위쪽에서 최근 3·6·12개월을 골라요.</Row>
        </div>
      </Sec>

      <Sec id="todo" icon="inbox" tint="#3182f6" title="TODO (지시)" tag="과장 이상">
        <div className="help-rows">
          <Row k="하달">부장단이 과장에게 할 일을 내려줘요. 과장이 확인하면 발신자에게 읽음이 표시돼요.</Row>
          <Row k="처리">과장은 상태를 바꾸고 과원에게 배분하거나, 일정으로 등록해 달력에 올려요.</Row>
        </div>
      </Sec>

      <Sec id="notices" icon="megaphone" tint="#f0466e" title="공지사항 · 피드백">
        <div className="help-rows">
          <Row k="공지사항">부장단·과장이 올리는 과 전체 소식이에요. 새 공지가 올라오면 알림이 가고, 안 읽은 공지는 메뉴에 숫자로 표시돼요. 중요한 공지는 📌 고정으로 맨 위에 둬요.</Row>
          <Row k="피드백">쓰다가 느낀 <b>기능 제안 · 버그 · 개선사항</b>을 누구나 남길 수 있어요. 다른 사람 피드백에 👍 공감과 댓글도 달 수 있어요.</Row>
          <Row k="처리">남긴 피드백은 접수 → 진행중 → 반영 완료 순으로 처리되고, 상태가 바뀌면 작성자에게 알림이 가요.</Row>
        </div>
      </Sec>

      <Sec id="telegram" icon="bell" tint="#229ed9" title="텔레그램 봇">
        <div className="help-rows">
          <Row k="연동"><Link href="/settings">설정</Link>에서 코드를 발급받아 <b>@teamcal_noti_bot</b>에게 <code>/연동 123456</code>을 보내면 연결돼요.</Row>
          <Row k="알림">담당 배정·마감·지연·장비 알림이 와요. 설정에서 종류별로 켜고 끌 수 있어요.</Row>
          <Row k="과 브리핑">그룹방에 봇을 초대하고 <code>/챗아이디</code>로 확인한 ID를 관리자에게 전달하면, 매일 아침 과 브리핑이 와요.</Row>
        </div>
        <div className="help-tbl-wrap">
          <table className="help-tbl">
            <thead><tr><th>명령</th><th>하는 일</th></tr></thead>
            <tbody>
              <tr><td><code>/일정 제목 날짜 시간</code></td><td>과 일정 등록 — <code>담당:이름</code> <code>장비:이름</code> 옵션, 줄바꿈으로 여러 건 한 번에. 비슷한 일정이 있으면 버튼으로 참여, 제목 앞 <code>!</code>는 강제 등록</td></tr>
              <tr><td><code>/개인 제목 날짜 시간</code></td><td>내 캘린더에 개인 일정 등록 — 줄바꿈으로 여러 건 한 번에</td></tr>
              <tr><td><code>/예약 장비명 날짜 시간</code></td><td>장비 예약 — 쉼표로 여러 개, 세트 이름을 쓰면 세트째</td></tr>
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
              <tr><th></th><th>과원</th><th>부과장</th><th>과장</th><th>부장단</th><th>시스템 관리자</th></tr>
            </thead>
            <tbody>
              <tr><td>일정 조회·등록</td><td>가능</td><td>가능</td><td>가능</td><td>가능</td><td>가능</td></tr>
              <tr><td>일정 수정</td><td>본인 등록건</td><td>전체</td><td>전체</td><td>전체</td><td>전체</td></tr>
              <tr><td>일정 삭제</td><td>본인 등록건</td><td>본인 등록건</td><td>전체</td><td>본인 등록건</td><td>전체</td></tr>
              <tr><td>촬영 진행 체크</td><td>담당 건</td><td>전체</td><td>전체</td><td>전체</td><td>전체</td></tr>
              <tr><td>개인 캘린더 열람</td><td>본인</td><td>본인</td><td>본인·과원</td><td>본인·과장</td><td>전체</td></tr>
              <tr><td>TODO</td><td>배분받기</td><td>—</td><td>받기·배분</td><td>내리기</td><td>전체</td></tr>
              <tr><td>과제</td><td>제출</td><td>출제·점검</td><td>출제·점검</td><td>열람</td><td>전체</td></tr>
              <tr><td>통계</td><td>—</td><td>가능</td><td>가능</td><td>가능</td><td>가능</td></tr>
              <tr><td>가입 승인</td><td>—</td><td>—</td><td>가능</td><td>가능</td><td>가능</td></tr>
            </tbody>
          </table>
        </div>
        <p className="help-note">장비 예약은 누구나 할 수 있고, 업무 상태 변경은 담당자 본인도 항상 가능해요.</p>
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
