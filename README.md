
---

## 1. 개요

본 프로젝트는 중고거래가 가능한 웹 플랫폼 **"Tiny Second-hand Shopping Platform"**을 개발하되,
소프트웨어 개발 전 과정(요구사항 분석 → 시스템 설계 → 구현 → 테스트 → 유지보수)에서
발생할 수 있는 보안 약점을 선제적으로 식별하고 제거(시큐어 코딩)하는 것을 목표로 한다.

- **기술 스택**: Node.js(Express), Socket.IO, SQLite(better-sqlite3), EJS
- **주요 보안 라이브러리/기법**: helmet, express-session, bcrypt, 커스텀 CSRF 토큰, express-rate-limit
- **개발 방법론**: 기능 구현 후 해당 기능의 보안 요소를 적용하고, 사용·테스트 중 발견된 문제는 유지보수 단계에서 재설계·수정

과제 PDF의 최소 기능 요구사항 7가지를 모두 충족하였으며, 구매·관리자 대시보드·문의·관리자 충전 등 추가 기능을 구현하였다.
실행 방법 및 환경 설정은 GitHub 저장소의 `README.md`에 명시하였다.

---

## 2. 요구사항 분석

### 2.1 기능적 요구사항 (과제 최소 요구)

| # | 과제 요구사항 | 구현 여부 | 구현 내용 |
|---|--------------|-----------|-----------|
| 1 | 사용자가 플랫폼에 가입할 수 있어야 함 | ✅ | 회원가입, 로그인, 로그아웃, 마이페이지(소개글·비밀번호), 프로필 조회 |
| 2 | 상품을 등록하고 볼 수 있어야 함 | ✅ | 상품 등록(이미지), 목록(이름), 상세, 내 상품 관리·삭제 |
| 3 | 사용자 간 소통(채팅)이 가능해야 함 | ✅ | Socket.IO 기반 전체 채팅 + 1:1 채팅 |
| 4 | 악성 유저/상품을 신고·차단할 수 있어야 함 | ✅ | 신고(사유 필수), 3회 누적 시 상품 자동 차단·유저 자동 휴면 |
| 5 | 사용자 간 송금이 가능해야 함 | ✅ | 잔액 이체, 거래 내역 조회 |
| 6 | 상품 검색이 가능해야 함 | ✅ | 상품명 LIKE 검색 |
| 7 | 관리자가 모든 요소를 관리할 수 있어야 함 | ✅ | 전용 대시보드: 유저/상품/신고/문의/송금내역/전체채팅 |

### 2.2 추가 구현 기능 (과제 최소 요구 외)

| 기능 | 설명 | 보안 고려 |
|------|------|-----------|
| **상품 구매** | 구매 시 구매자 잔액 → 판매자 자동 송금, 상품 `sold` 처리 | 원자적 트랜잭션, 이중지불·중복판매 방지 |
| **관리자 전용 UI** | 관리자 로그인 시 `/admin`으로 이동, 일반 쇼핑 메뉴와 분리 | `requireAdmin` 인가 |
| **관리자 문의/답변** | 유저가 관리자에게 문의, 관리자가 대시보드에서 답변 | 로그인 필수, 관리자만 답변 가능 |
| **관리자 잔액 충전** | 관리자만 특정 유저 잔액 충전 (일반 유저 자가 충전 불가) | 관리자 전용 라우트, 금액 검증 |
| **관리자 송금 내역** | 전체 송금·구매 거래 내역 모니터링 | 관리자 전용 조회 |
| **신고 대상 고정** | 상품/프로필에서 신고 시 대상 ID 수동 입력 불가 | 신고 대상 조작·오입력 방지 |

### 2.3 비기능적 요구사항

- **보안**: 인증/인가, 입력 검증, 세션 보호, OWASP Top 10 관련 웹 취약점 대응
- **사용성**: 직관적 UI, 관리자·일반 유저 역할별 메뉴 분리
- **무결성**: 송금·구매 시 잔액 정합성 보장(단일 DB 트랜잭션)
- **유지보수성**: 환경변수(`.env`)로 시크릿 분리, README에 실행 방법 문서화

---

## 3. 시스템 설계

### 3.1 아키텍처

```
[브라우저]
    │  HTTP (페이지·폼)          WebSocket (실시간 채팅)
    ▼
[Express 서버]
    ├─ 보안 미들웨어: helmet, session, CSRF, rate-limit
    ├─ 라우트: auth / users / products / transfer / report / inquiry / chat / admin
    └─ Socket.IO: 전체 채팅, 1:1 채팅
    ▼
[SQLite DB]  +  [public/uploads] (상품 이미지)
```

### 3.2 역할별 화면 설계

**일반 사용자**
- 홈, 상품 목록·검색·등록·상세·구매, 전체/1:1 채팅, 송금, 문의, 마이페이지, 프로필, 신고

**관리자**
- 로그인 시 `/admin` 대시보드로 자동 이동
- 탭: 사용자 / 상품 / 신고 / 문의 / 송금내역 / 전체채팅
- 1:1 채팅은 열람 불가, 전체 채팅만 모니터링·참여

### 3.3 데이터베이스 설계

| 테이블 | 주요 컬럼 | 설명 |
|--------|-----------|------|
| **user** | id, username, password_hash, bio, balance, is_admin, status | status: `active` / `suspended` |
| **product** | id, name, description, price, image, seller_id, status | status: `active` / `blocked` / `sold` |
| **report** | id, reporter_id, target_type, target_id, reason | UNIQUE(reporter_id, target_type, target_id) |
| **message** | id, sender_id, room, content | room: `global` 또는 `dm:작은id:큰id` |
| **transfer** | id, sender_id, receiver_id, amount | 송금·구매 시 기록 |
| **inquiry** | id, user_id, subject, content, answer, status | status: `open` / `answered` |

**설계 시 보안 고려**
- 비밀번호는 `password_hash`만 저장 (평문 금지)
- 신고는 사용자당 대상 1회로 제한 (중복 신고로 임계치 조작 방지)
- 외래키 + WAL 모드로 무결성·동시성 보조

### 3.4 주요 API/경로 설계

| 경로 | 메서드 | 설명 | 인가 |
|------|--------|------|------|
| `/register`, `/login` | GET/POST | 회원가입·로그인 | 공개 |
| `/products`, `/products/:id` | GET | 목록·상세·검색 | 로그인 |
| `/products` | POST | 상품 등록 (multipart) | 로그인 |
| `/products/:id/buy` | POST | 상품 구매 | 로그인 |
| `/transfer` | GET/POST | 송금·내역 | 로그인 |
| `/report` | GET/POST | 신고 (대상 고정) | 로그인 |
| `/inquiry` | GET/POST | 관리자 문의 | 로그인 |
| `/chat`, `/chat/:userId` | GET | 전체/1:1 채팅 | 로그인 |
| `/admin` | GET | 관리자 대시보드 | 관리자 |
| `/admin/users/:id/charge` | POST | 잔액 충전 | 관리자 |
| `/admin/inquiries/:id/answer` | POST | 문의 답변 | 관리자 |

---

## 4. 시스템 구현

### 4.1 프로젝트 구조

```
src/
  app.js                 # 서버 진입점, 보안 미들웨어, 라우트 등록
  config.js              # 환경변수 기반 설정 (SESSION_SECRET 등)
  db.js                  # SQLite 스키마 초기화, 관리자 시드
  socket.js              # Socket.IO 전체/1:1 채팅
  middleware/
    auth.js              # requireLogin, requireAdmin, 정지 계정 강제 로그아웃
    csrf.js              # CSRF 토큰 발급·검증 (multipart 지연 검증 포함)
  routes/
    auth.js              # 회원가입, 로그인(관리자→/admin), 로그아웃
    users.js             # 마이페이지, 프로필
    products.js          # 상품 CRUD, 검색, 구매(buy)
    transfer.js          # 송금, 거래 내역
    report.js            # 신고, 자동 차단/휴면
    inquiry.js           # 유저→관리자 문의
    chat.js              # 채팅 페이지
    admin.js             # 대시보드, 충전, 답변, 상태 변경
  utils/validation.js    # 입력값 검증
  views/                 # EJS 템플릿 (admin.ejs, inquiry.ejs 등)
public/
  css/style.css
  js/chat.js, dm.js, main.js   # CSP 준수 (인라인 스크립트 없음)
  uploads/                     # 상품 이미지 (git 제외)
data/app.db                    # SQLite (git 제외)
```

### 4.2 기능별 구현 요약

| 기능 | 핵심 로직 | 파일 |
|------|-----------|------|
| 회원가입/로그인 | bcrypt 해싱, 세션 재생성, 관리자는 `/admin` 리다이렉트 | `routes/auth.js` |
| 상품 등록 | multer 업로드, 랜덤 파일명, MIME·용량 제한 | `routes/products.js` |
| 상품 구매 | 트랜잭션: 잔액 확인→차감→입금→sold→transfer 기록 | `routes/products.js` |
| 송금 | 트랜잭션: 잔액 재확인 후 이체 | `routes/transfer.js` |
| 신고 | 사유 필수, UNIQUE 제약, 임계치 자동 차단 | `routes/report.js` |
| 문의/답변 | 유저 작성, 관리자만 답변 및 status 변경 | `routes/inquiry.js`, `routes/admin.js` |
| 실시간 채팅 | 세션 연동 Socket.IO, textContent 렌더링 | `socket.js`, `public/js/*` |
| 관리자 대시보드 | 유저 정지/충전, 상품 차단/삭제, 신고·문의·송금 조회 | `routes/admin.js`, `views/admin.ejs` |

개발 순서는 **기능 구현 → 해당 기능 보안 적용 → 테스트 → 유지보수(버그·권한 수정)** 순으로 진행하였다.

---

## 5. 발견한 보안 약점과 수정 내역 (핵심)

개발·테스트·실사용 과정에서 식별한 보안 이슈와 조치 내역이다.
과제의 핵심인 "어떤 약점을 확인했고, 어떻게 변경했는지"를 아래 형식(문제 → 발견 → 조치 → 검증)으로 정리한다.

### 5.1 비밀번호 평문 저장 위험
- **문제**: DB 유출 시 비밀번호 평문 저장 시 전 계정 탈취.
- **발견**: 설계 단계에서 KISA/OWASP 가이드 참고.
- **조치**: `bcrypt`(cost 12) 해싱 저장, 로그인 시 `compareSync` 검증. (`db.js`, `routes/auth.js`)
- **검증**: DB에서 `password_hash`만 존재, 평문 없음 확인.

### 5.2 SQL Injection
- **문제**: 검색어·아이디 등을 쿼리 문자열에 직접 결합 시 인젝션 가능.
- **발견**: 설계 단계.
- **조치**: 모든 쿼리 파라미터 바인딩(`?`), LIKE 와일드카드(`% _ \`) 이스케이프. (전 라우트)
- **검증**: 검색 `' OR '1'='1` 입력 → 200, 비정상 데이터 노출 없음.

### 5.3 XSS (Cross-Site Scripting)
- **문제**: 소개글·상품명·채팅 등 사용자 입력의 스크립트 실행.
- **발견**: 설계 단계.
- **조치**: EJS `<%= %>` 자동 이스케이프, 채팅은 `textContent` 렌더링, 서버 sanitize, helmet CSP(인라인 스크립트 차단). (`views/*`, `public/js/*`, `socket.js`, `app.js`)
- **검증**: `<script>alert(1)</script>` 입력 시 실행되지 않음.

### 5.4 CSRF — 멀티파트 폼 버그 (실제 사용 중 발견)
- **문제**: 세션 쿠키만으로 POST 처리 시 위조 요청 가능. 또한 상품 등록(파일 업로드) 시 CSRF 검증이 항상 실패.
- **발견**: **실제 사용 중** — 로그인 후 상품 등록 시 "유효하지 않은 CSRF 토큰" 403 오류.
- **원인**: 상품 등록만 `multipart/form-data`인데, 전역 CSRF 미들웨어가 `multer` 파싱 **이전**에 `req.body._csrf`를 검사하여 항상 비어 있음.
- **조치**:
  1. 전역 미들웨어: `multipart/form-data`는 검증 보류
  2. `routes/products.js`: multer 파싱 **직후** `tokenValid()`로 CSRF 검증, 실패 시 업로드 파일 삭제 후 403
  3. constant-time 토큰 비교 (`crypto.timingSafeEqual`)
- **검증**: 유효 토큰 + 이미지 업로드 → 302 성공, 토큰 없음 → 403.

### 5.5 세션 고정(Session Fixation) / 세션 탈취
- **문제**: 로그인 전후 동일 세션 ID, JS 접근 가능 쿠키.
- **발견**: 설계 단계.
- **조치**: 로그인·가입 시 `session.regenerate()`, 쿠키 `HttpOnly`/`SameSite=lax`/운영 시 `Secure`, 2시간 만료. (`routes/auth.js`, `app.js`)
- **검증**: 로그인 후 세션 ID 변경, `document.cookie`로 sid 접근 불가.

### 5.6 인가(Authorization) 미비
- **문제**: 타인 상품 삭제, `/admin` 무단 접근, 정지 계정 이용.
- **발견**: 설계 + 테스트.
- **조치**: `requireLogin`/`requireAdmin`, 본인 자원만 수정/삭제, `status=suspended` 시 강제 로그아웃. (`middleware/auth.js`)
- **검증**: 일반 유저 `/admin` → 403, 타인 상품 삭제 → 403.

### 5.7 파일 업로드 취약점
- **문제**: 경로 조작, 실행 파일 업로드, 대용량 파일.
- **발견**: 설계 단계.
- **조치**: 랜덤 파일명, MIME·확장자 화이트리스트, 2MB 제한, multer 2.x 사용. (`routes/products.js`)
- **검증**: 비이미지 파일 업로드 거부, `npm audit` 0건.

### 5.8 송금·구매 동시성 (이중지불 / 중복판매)
- **문제**: 동시 요청 시 잔액 검증과 차감 사이 경쟁 조건 → 이중지불 또는 동일 상품 중복 판매.
- **발견**: 구매 기능 추가 시 설계 검토.
- **조치**:
  - **송금** (`routes/transfer.js`): 단일 트랜잭션 내 잔액 재조회 → 차감 → 입금 → 내역
  - **구매** (`routes/products.js`): 단일 트랜잭션 내 잔액 확인 → 차감 → 입금 → `product.status='sold'` → transfer 기록. 트랜잭션 내부에서 상품 상태 재확인.
- **검증**:
  - 잔액 0원 구매 → 실패, 상품 active 유지
  - 충분 충전 후 구매 → buyer/seller 잔액 정확, status=sold
  - sold 상품 재구매 → 실패

### 5.9 잔액 충전 권한 (유지보수 중 발견·수정)
- **문제**: 초기에는 일반 유저도 `/transfer/charge`로 자가 충전 가능 → 누구나 무한 잔액 생성 가능 (심각한 권한/비즈니스 로직 취약점).
- **발견**: **유지보수 단계** — "관리자만 충전" 요구사항 반영.
- **조치**:
  1. `/transfer/charge` 라우트 및 유저 UI **완전 제거**
  2. `/admin/users/:id/charge`로 이동, `requireAdmin` 적용
  3. 금액 정수·범위 검증
- **검증**: 일반 유저 충전 시도 → 403/404, 관리자 충전 → 잔액 증가, 음수 금액 → 거부.

### 5.10 신고 대상 ID 조작 가능 (유지보수 중 수정)
- **문제**: 신고 폼에서 대상 ID를 숫자 입력으로 직접 지정 가능 → 잘못된 대상 신고 또는 임의 ID 신고.
- **발견**: **유지보수 단계** — UX·보안 개선.
- **조치**: 상품 상세/프로필의 "신고" 버튼으로만 접근, `targetType`/`targetId`는 hidden 고정, 화면에는 "상품명 (판매자: xxx)" 등 읽기 전용 표시. (`routes/report.js`, `views/report.ejs`)
- **검증**: URL 쿼리로 대상 전달, 수동 ID 입력 필드 없음.

### 5.11 계정 열거(User Enumeration)
- **문제**: 로그인 실패 메시지·응답 시간으로 아이디 존재 추측.
- **조치**: 동일 실패 메시지, 미존재 사용자에도 더미 bcrypt 비교. (`routes/auth.js`)

### 5.12 무차별 대입 / 정보 노출 / 의존성 취약점
- **조치**: 로그인·가입 rate limiting, 운영 환경 스택트레이스 숨김, helmet 보안 헤더, bcrypt 6.x·multer 2.x 업그레이드 → `npm audit` 0 vulnerabilities.

### 5.13 (개발 환경) .env 인코딩 이슈
- **문제**: Windows PowerShell `>` 리디렉션으로 `.env` 생성 시 UTF-16 → dotenv 파싱 실패 → `SESSION_SECRET` 미로딩.
- **조치**: UTF-8 저장, README에 주의사항 명시.

---

## 6. 체크리스트 작성 및 테스트

### 6.1 기능 체크리스트

| # | 항목 | 결과 |
|---|------|------|
| 1 | 회원가입 / 로그인 / 로그아웃 | ✅ |
| 2 | 아이디 중복 가입 차단 | ✅ |
| 3 | 상품 등록(이미지) / 목록 / 상세 / 검색 | ✅ |
| 4 | 상품 구매 → 판매자 송금, status=sold | ✅ |
| 5 | 잔액 부족 시 구매·송금 실패 | ✅ |
| 6 | 내 상품만 삭제 가능 | ✅ |
| 7 | 전체 / 1:1 실시간 채팅 | ✅ |
| 8 | 신고 3회 → 상품 blocked / 유저 suspended | ✅ |
| 9 | 신고 대상 고정 (ID 수동 입력 불가) | ✅ |
| 10 | 유저 문의 → 관리자 답변 → 유저 확인 | ✅ |
| 11 | 관리자 로그인 → /admin, 전용 UI | ✅ |
| 12 | 관리자만 잔액 충전 | ✅ |
| 13 | 관리자 송금 내역 조회 | ✅ |
| 14 | 관리자: 유저 정지/해제, 상품 차단/삭제 | ✅ |

### 6.2 보안 체크리스트

| # | 항목 | 결과 |
|---|------|------|
| 1 | 비밀번호 bcrypt 해싱 저장 | ✅ |
| 2 | SQL Injection (`' OR '1'='1`) 무해 처리 | ✅ |
| 3 | CSRF 토큰 없는 POST → 403 (일반 폼 + multipart) | ✅ |
| 4 | 타인 상품 삭제 → 403 | ✅ |
| 5 | 일반 유저 /admin, /admin/.../charge → 403 | ✅ |
| 6 | 파일 업로드 확장자·용량 제한 | ✅ |
| 7 | 송금·구매 트랜잭션 (잔액·상태 정합성) | ✅ |
| 8 | 정지 계정 로그인·세션 차단 | ✅ |
| 9 | npm audit 0 vulnerabilities | ✅ |

### 6.3 테스트 시나리오 및 결과 (발췌)

| 시나리오 | 기대 결과 | 실제 결과 |
|----------|-----------|-----------|
| 3개 계정이 동일 상품 신고 | status=blocked | ✅ report count=3, blocked |
| multipart 상품등록 + CSRF | 토큰 O→302, X→403 | ✅ |
| buyer 15000원, 10000원 상품 구매 | buyer 5000, seller +10000, sold | ✅ |
| sold 상품 재구매 | 실패, sold 유지 | ✅ |
| 일반 유저 /transfer/charge | 차단 | ✅ |
| admin → tester1 7000원 충전 | 잔액 +7000 | ✅ |
| 유저 문의 → admin 답변 | 유저 화면 "답변완료" | ✅ |



---

## 7. 유지보수

실제 사용·테스트 중 발견한 문제를 해당 개발 단계로 돌아가 수정하였다.

| 순서 | 발견 내용 | 조치 | 되돌아간 단계 |
|------|-----------|------|---------------|
| 1 | 상품 등록 시 CSRF 403 (multipart) | CSRF 미들웨어 순서 재설계 | 구현 → 설계 |
| 2 | 일반 유저 자가 잔액 충전 가능 | 관리자 전용 충전으로 변경 | 유지보수 → 인가 |
| 3 | 신고 폼 ID 수동 입력 | 대상 고정·읽기 전용 표시 | 유지보수 → 설계 |
| 4 | 관리자·일반 UI 혼재 | 관리자 전용 대시보드·메뉴 분리 | 유지보수 → 설계 |
| 5 | npm audit high (tar, multer 1.x) | bcrypt 6.x, multer 2.x 업그레이드 | 유지보수 |
| 6 | .env UTF-16 파싱 실패 | UTF-8 저장, README 주의사항 | 유지보수 |


---

## 8. GitHub 저장소 및 실행 방법

### 8.1 GitHub
- 저장소는 **public**으로 공개
- `.gitignore`로 `.env`, `node_modules`, `data/*.db`, `public/uploads/*` 제외 (비밀·런타임 데이터 미포함)
- **저장소 URL**: https://github.com/gitterable/TinySecond-handShoppingPlatform.git

### 8.2 환경 설정 및 실행 (요약)

상세 내용은 저장소의 **`README.md`** 참조.

```bash
npm install
# .env.example → .env 복사 (UTF-8), SESSION_SECRET 랜덤 설정
npm start
# http://localhost:3000
```

- **관리자 계정**: `.env`의 `ADMIN_USERNAME` / `ADMIN_PASSWORD` (최초 DB 생성 시 1회 시드)
- **테스트 흐름**: 관리자 로그인 → 유저 잔액 충전 → 일반 유저 로그인 → 상품 등록·구매·채팅·문의

---

## 9. 결론

본 프로젝트는 과제 PDF의 **7가지 최소 기능 요구사항을 모두 충족**하였으며,
구매·관리자 대시보드·문의·관리자 충전 등 추가 기능을 구현하였다.

개발 전 과정에서 bcrypt·CSRF·SQLi·XSS·세션·파일 업로드·트랜잭션 등을 **설계 단계부터 적용**하였고,
**실제 사용 중 발견한 multipart CSRF 버그**, **일반 유저 자가 충전 권한 문제**, **신고 대상 조작 가능성** 등을
유지보수 단계에서 직접 진단·수정하였다.

이를 통해 "기능만 구현하면 보안은 자연스럽게 따라온다"는 가정이 성립하지 않으며,
특히 AI 도구로 빠르게 MVP를 만들더라도 **사람이 보안 요구사항을 명시하고 검증하는 단계**가 반드시 필요함을 확인하였다.

---

