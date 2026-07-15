# Tiny Second-hand Shopping Platform

WHS(화이트햇 스쿨) Secure Coding 과제 — 시큐어 코딩을 적용한 간단한 중고거래 플랫폼입니다.

Node.js(Express) + Socket.IO + SQLite로 구현했으며, 개발 전 과정에서 발생할 수 있는 보안 약점을 식별하고 제거하는 데 초점을 두었습니다.

## 주요 기능

- **회원 관리**: 회원가입 / 로그인 / 로그아웃, 마이페이지(소개글·비밀번호 수정), 공개 프로필 조회
- **상품 관리**: 상품 등록(이미지 업로드), 목록/검색, 상세 조회, 내 상품 관리 및 삭제
- **실시간 채팅**: 전체 채팅 + 사용자 간 1:1 채팅 (Socket.IO)
- **신고/차단**: 유저·상품 신고(사유 필수), 임계치 이상 신고 시 상품 자동 차단 / 유저 자동 휴면(정지)
- **송금**: 사용자 간 잔액 이체 (원자적 트랜잭션, 잔액 검증)
- **관리자**: 전체 유저/상품/신고 관리, 유저 정지·해제, 상품 차단·삭제

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 런타임 | Node.js 18+ |
| 서버 | Express 4 |
| 실시간 | Socket.IO 4 |
| DB | SQLite (better-sqlite3) |
| 템플릿 | EJS |
| 보안 | helmet, express-session, bcrypt, 커스텀 CSRF, express-rate-limit |

## 프로젝트 구조

```
src/
  app.js              # 서버 진입점 + 보안 미들웨어 구성
  config.js           # 환경변수 기반 설정
  db.js               # SQLite 스키마 초기화 + 관리자 시드
  socket.js           # Socket.IO 전체/1:1 채팅 핸들러
  middleware/
    auth.js           # 로그인/관리자 인가, 정지 계정 강제 로그아웃
    csrf.js           # 동기화 토큰 방식 CSRF 방어
  routes/             # auth, users, products, transfer, report, chat, admin
  utils/validation.js # 입력값 검증 로직
  views/              # EJS 템플릿
public/
  css/style.css       # 스타일
  js/                 # chat.js, dm.js, main.js (CSP 준수 위해 인라인 스크립트 없음)
  uploads/            # 업로드된 상품 이미지 (git 추적 제외)
data/                 # SQLite DB 파일 (git 추적 제외)
```

## 환경 설정 및 실행 방법

### 1. 요구 사항
- Node.js 18 이상, npm

### 2. 의존성 설치
```bash
npm install
```

### 3. 환경 변수 설정
`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

`SESSION_SECRET`은 반드시 긴 랜덤 문자열로 설정하세요.
```bash
# 랜덤 시크릿 생성 예시
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ Windows PowerShell에서 `>` 리디렉션으로 `.env`를 만들면 UTF-16으로 저장되어 dotenv가 읽지 못합니다. 반드시 UTF-8로 저장하세요.

| 변수 | 설명 |
|------|------|
| `PORT` | 서버 포트 (기본 3000) |
| `NODE_ENV` | `development` / `production` |
| `SESSION_SECRET` | 세션 서명 시크릿 (필수, 랜덤) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 최초 1회 생성되는 관리자 계정 |
| `REPORT_BLOCK_THRESHOLD` | 상품 자동 차단 신고 임계치 (기본 3) |
| `REPORT_SUSPEND_THRESHOLD` | 유저 자동 휴면 신고 임계치 (기본 3) |

### 4. 실행
```bash
npm start        # 프로덕션 실행
npm run dev      # 파일 변경 감지 실행 (개발용)
```

서버 실행 후 브라우저에서 `http://localhost:3000` 접속.

### 5. 외부 공개 (ngrok, 선택)
```bash
ngrok http 3000
```

## 적용한 시큐어 코딩 요소

| 위협 | 대응 방법 | 위치 |
|------|-----------|------|
| 비밀번호 유출 | bcrypt 해싱(cost 12), 평문 저장 금지 | `db.js`, `routes/auth.js`, `routes/users.js` |
| SQL Injection | 모든 쿼리 파라미터 바인딩(`?`), 문자열 조합 금지, LIKE 와일드카드 이스케이프 | 전 라우트 |
| XSS | EJS 자동 이스케이프(`<%= %>`), 채팅은 `textContent` 렌더링 + 서버측 sanitize | `views/*`, `public/js/*`, `socket.js` |
| CSRF | 세션 기반 동기화 토큰, 상태 변경 요청 시 검증(constant-time 비교) | `middleware/csrf.js` |
| 인증/인가 | 로그인 필수 라우트, 본인 자원만 수정/삭제, 관리자 전용 라우트 | `middleware/auth.js` |
| 세션 고정 | 로그인/가입 시 세션 재생성, HttpOnly·SameSite·(prod)Secure 쿠키 | `routes/auth.js`, `app.js` |
| 파일 업로드 취약점 | 랜덤 파일명, 확장자·MIME·용량(2MB) 제한 | `routes/products.js` |
| 송금 동시성(이중지불) | 단일 트랜잭션 내 잔액 재확인 후 차감/입금 | `routes/transfer.js` |
| 입력값 검증 | 아이디/비밀번호/가격/금액/길이 검증 | `utils/validation.js` |
| 정보 노출 | 프로덕션에서 스택트레이스 숨김, 일반화된 에러 메시지 | `app.js` |
| 무차별 대입 | 로그인/가입 rate limiting | `app.js` |
| 보안 헤더 | helmet + Content-Security-Policy(인라인 스크립트 차단) | `app.js` |
| 계정 열거 | 로그인 실패 시 동일 메시지, 더미 해시 비교 | `routes/auth.js` |

## 라이선스
MIT
