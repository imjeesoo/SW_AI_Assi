# PRS & SRS — SIWOO AI ASSISTANT

> 작성일: 2026-06-18  
> 버전: v1.1  
> 작성자: 시우

---

## 목차

1. [제품 개요 (PRS)](#1-제품-개요)
2. [사용자 정의](#2-사용자-정의)
3. [핵심 기능 요구사항](#3-핵심-기능-요구사항)
4. [비기능 요구사항](#4-비기능-요구사항)
5. [시스템 아키텍처 (SRS)](#5-시스템-아키텍처)
6. [기술 스택](#6-기술-스택)
7. [디렉터리 구조](#7-디렉터리-구조)
8. [데이터 설계](#8-데이터-설계)
9. [API 명세](#9-api-명세)
10. [화면 설계서](#10-화면-설계서)
11. [보안 요구사항](#11-보안-요구사항)
12. [제약 및 가정](#12-제약-및-가정)
13. [구현 계획](#13-구현-계획)
14. [로깅 명세](#14-로깅-명세)

---

## 1. 제품 개요

### 1.1 목적

개인 전용 로컬 AI 비서 웹앱. 외부 서버에 개인정보가 저장되지 않으면서도, 대화가 누적될수록 사용자(시우)를 점점 더 잘 파악하는 비서를 목표로 한다.

### 1.2 배경 및 동기

- 클라우드 기반 AI 서비스는 대화 내용이 외부 서버에 저장될 수 있음
- 동일 WiFi 내에서 PC/모바일 모두 접속 가능한 로컬 비서가 필요
- 대화가 끊기지 않고 나에 대한 이해가 세션 간에도 지속되어야 함

### 1.3 범위

| 포함 | 제외 |
|------|------|
| Claude API 기반 채팅 | 음성 인식/TTS |
| 로컬 대화 히스토리 저장 | 외부 서비스 연동 (캘린더, 메일 등) |
| 세션별 요약 누적 메모리 | 멀티유저 |
| 메모리 뷰어 화면 | 파일 업로드 |
| 시스템 프롬프트 편집 UI | 플러그인 시스템 |
| 로컬 WiFi 모바일 접속 | |
| 간단한 비밀번호 인증 | |

---

## 2. 사용자 정의

| 항목 | 내용 |
|------|------|
| 사용자 | 시우 (1명, 단일 사용자) |
| 사용 환경 | PC 브라우저 (주), 동일 WiFi 모바일 (보조) |
| 기술 수준 | 개발자 (직접 실행 및 설정 가능) |
| 접속 방법 | `http://<로컬IP>:8000` 으로 직접 접속 |

---

## 3. 핵심 기능 요구사항

### 3.1 인증

- **FR-AUTH-01** 앱 첫 접속 시 비밀번호 입력 화면 표시
- **FR-AUTH-02** 비밀번호 일치 시 세션 토큰 발급, 이후 API 요청에 사용
- **FR-AUTH-03** 비밀번호는 `config.json`에 bcrypt 해시로 저장
- **FR-AUTH-04** 세션 토큰 유효 시간: 24시간 (설정 가능)

### 3.2 채팅

- **FR-CHAT-01** 메시지 전송 → Claude API 스트리밍 응답 (실시간 타이핑 효과)
- **FR-CHAT-02** 대화는 세션 단위로 관리 (세션 = 하나의 대화 묶음)
- **FR-CHAT-03** 왼쪽 사이드바에 세션 목록 표시 (날짜, 첫 메시지 일부)
- **FR-CHAT-04** 새 세션 시작 버튼 제공
- **FR-CHAT-05** 기존 세션 클릭 시 해당 대화 내용 로드
- **FR-CHAT-06** 현재 세션의 대화는 실시간으로 로컬 JSON에 저장
- **FR-CHAT-07** AI 응답은 Markdown을 파싱하여 렌더링 표시 (헤더·굵게·이탤릭·목록·인라인 코드·코드 블록·구분선). 코드 블록은 언어별 문법 강조 적용. DOMPurify로 XSS 방지 후 삽입
- **FR-CHAT-08** 스트리밍 응답 중 [중단] 버튼 활성화. 클릭 시 진행 중인 스트림 즉시 중단 (브라우저 `AbortController` + 서버 비동기 제너레이터 자연 종료)

### 3.3 누적 메모리 (세션별 요약)

- **FR-MEM-01** 세션 종료 시 (사용자가 "세션 종료" 버튼 클릭) Claude가 해당 세션을 요약
- **FR-MEM-02** 요약 내용은 `memory.json`에 세션 ID, 날짜와 함께 누적 저장
- **FR-MEM-03** 새 대화 시작 시 `memory.json`의 내용을 시스템 프롬프트에 자동 주입
- **FR-MEM-04** 메모리 주입 형식: "시우에 대해 알고 있는 것:" 섹션으로 구성
- **FR-MEM-05** 메모리가 너무 길어지면 가장 오래된 요약을 재요약 (압축)하여 토큰 절약

### 3.4 메모리 뷰어

- **FR-VIEW-01** 상단 내비게이션에서 [메모리] 버튼으로 접근
- **FR-VIEW-02** 누적된 세션별 요약 목록을 카드 형태로 표시
- **FR-VIEW-03** 각 요약 항목에 삭제 버튼 제공
- **FR-VIEW-04** 전체 메모리 초기화 버튼 제공 (확인 다이얼로그 포함)

### 3.5 시스템 프롬프트 편집

- **FR-SYS-01** 상단 내비게이션에서 [설정] 버튼으로 접근
- **FR-SYS-02** `system_prompt.txt` 내용을 텍스트에리어에 로드
- **FR-SYS-03** 수정 후 저장 시 파일에 즉시 반영
- **FR-SYS-04** 저장 후 현재 세션에도 즉시 적용

---

## 4. 비기능 요구사항

| 코드 | 항목 | 내용 |
|------|------|------|
| NFR-01 | 프라이버시 | 대화 데이터는 로컬 파일시스템에만 저장. Claude API로는 메시지만 전송 (Anthropic 정책 범위 내) |
| NFR-02 | 반응형 UI | PC (1024px+), 태블릿 (768px), 모바일 (360px+) 모두 정상 동작 |
| NFR-03 | 테마 | 라이트 테마 고정, 일반 HTML/CSS로 구현 (카드·패널 기반 클린 UI) |
| NFR-04 | 응답속도 | 스트리밍으로 첫 토큰 2초 이내 표시 |
| NFR-05 | 로컬 실행 | `python main.py` 한 명령으로 서버 구동 |
| NFR-06 | 의존성 | `requirements.txt`로 관리, Python 3.10+ |
| NFR-07 | 안정성 | API 오류 시 사용자에게 에러 메시지 표시, 앱 크래시 없음 |
| NFR-08 | SPA 라우팅 | `/login`, `/memory`, `/settings` 등 모든 비API 경로에 FastAPI catch-all 라우트 설정 → `index.html` 반환. 프론트엔드 JS가 `window.location.pathname`을 읽어 현재 뷰를 판단한다 |

---

## 5. 시스템 아키텍처

```
[브라우저 (PC/모바일)]
        │  HTTP / SSE (같은 WiFi, POST+ReadableStream)
        ▼
┌─────────────────────────────┐
│   FastAPI Server            │
│   (0.0.0.0:8000)            │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │ Auth     │ │ Chat     │  │
│  │ Router   │ │ Router   │  │
│  └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐  │
│  │ Memory   │ │ Config   │  │
│  │ Router   │ │ Router   │  │
│  └──────────┘ └──────────┘  │
│                             │
│  ┌──────────────────────┐   │
│  │  Claude API Client   │──────▶ Anthropic API
│  └──────────────────────┘   │
└─────────────────────────────┘
        │
        ▼ (로컬 파일시스템)
┌─────────────────────────────┐
│  /data/                     │
│    config.json              │
│    system_prompt.txt        │
│    memory.json              │
│    logs/                    │
│      YYYY-MM-DD.log         │
│    sessions/                │
│      {session_id}.json      │
└─────────────────────────────┘
```

### 5.1 메모리 주입 흐름

```
새 세션 시작
    │
    ▼
system_prompt.txt 로드
    │
    ▼
memory.json 전체 요약 로드
    │
    ▼
[최종 시스템 프롬프트 = system_prompt + "\n\n" + memory 섹션]
    │
    ▼
Claude API messages[] 에 system 파라미터로 전달
    │
    ▼
대화 진행 중 → sessions/{id}.json 에 실시간 저장
    │
    ▼
세션 종료 버튼 클릭
    │
    ▼
Claude에게 "이 대화를 요약해줘" 요청
    │
    ▼
요약 결과 → memory.json에 추가
```

---

## 6. 기술 스택

| 구분 | 기술 | 버전 | 용도 |
|------|------|------|------|
| 백엔드 | Python | 3.10+ | 런타임 |
| 백엔드 프레임워크 | FastAPI | 0.115+ | REST API 서버 |
| ASGI 서버 | Uvicorn | 0.30+ | HTTP 서버 |
| AI | anthropic SDK | 0.40+ | Claude API 클라이언트 |
| 인증 | PyJWT | 2.8+ | JWT 토큰 (python-jose는 유지보수 중단 상태로 대체) |
| 비밀번호 | bcrypt | 4.1+ | 비밀번호 해싱 (passlib은 2020년 이후 미유지로 bcrypt 패키지 직접 사용) |
| 환경변수 | python-dotenv | 1.0+ | `.env` 파일 로드 (`ANTHROPIC_API_KEY` 등). 없으면 `os.environ.get()`이 `None`을 반환하여 API 초기화 실패 |
| 비동기 파일 I/O | aiofiles | 24.0+ | FastAPI async 핸들러 내 비동기 파일 읽기/쓰기. 동기 `open()`은 이벤트 루프를 블록하므로 사용 금지 |
| 프론트엔드 | Vanilla HTML/CSS/JS | - | UI (별도 프레임워크 없음) |
| 데이터 저장 | JSON 파일 | - | 대화/메모리 로컬 저장 |
| 스트리밍 | SSE (Server-Sent Events) | - | 실시간 응답. POST 요청이므로 브라우저 기본 `EventSource` 사용 불가 → `fetch()` + `ReadableStream` + `AbortController` 방식으로 구현 |
| Markdown 렌더링 | marked.js | 14.x (CDN) | AI 응답 Markdown → HTML 변환 (헤더, 코드 블록, 목록 등) |
| 문법 강조 | highlight.js | 11.x (CDN) | 코드 블록 언어별 색상 강조 |
| HTML 소독 | DOMPurify | 3.x (CDN) | Markdown 변환 결과의 XSS 방지 (`innerHTML` 직접 삽입 전 소독) |

---

## 7. 디렉터리 구조

```
SIWOOAI/
├── main.py                  # FastAPI 앱 진입점, 서버 실행
├── requirements.txt
├── .env                     # ANTHROPIC_API_KEY (gitignore 대상)
│
├── app/
│   ├── __init__.py
│   ├── config.py            # 설정값 로드
│   ├── auth.py              # 인증 로직 (JWT, 비밀번호 검증)
│   │
│   ├── routers/
│   │   ├── auth.py          # POST /api/login
│   │   ├── chat.py          # POST /api/chat (SSE 스트리밍)
│   │   ├── sessions.py      # GET/POST /api/sessions
│   │   ├── memory.py        # GET/DELETE /api/memory
│   │   └── config.py        # GET/PUT /api/system-prompt
│   │
│   └── services/
│       ├── claude.py        # Claude API 호출 래퍼
│       ├── memory.py        # 요약 생성, memory.json 관리
│       └── session.py       # 세션 파일 읽기/쓰기
│
├── data/
│   ├── config.json          # 비밀번호 해시, 앱 설정
│   ├── system_prompt.txt    # 시우 비서 정체성 정의
│   ├── memory.json          # 누적 세션 요약
│   ├── logs/
│   │   └── YYYY-MM-DD.log   # 일별 로그 파일 (7일 초과 시 서버 시작 시 자동 삭제)
│   └── sessions/
│       └── {uuid}.json      # 세션별 대화 기록
│
└── static/
    ├── index.html           # SPA 진입점
    ├── style.css            # 라이트 테마 공통 스타일 (FINALUXUI.md 기준)
    └── app.js               # 채팅/메모리/설정 UI 로직
```

---

## 8. 데이터 설계

### 8.1 config.json

> **초기 비밀번호 설정 (최초 1회):**  
> `data/config.json`이 없을 때 서버를 시작하면 콘솔에 대화형 프롬프트가 뜨고, 입력한 비밀번호를 bcrypt 해시로 저장한 후 서버를 기동한다.  
> 이미 파일이 있으면 프롬프트 없이 바로 서버가 시작된다.
>
> ```
> $ python main.py
> [SETUP] data/config.json 이 없습니다. 초기 설정을 진행합니다.
> 비밀번호를 입력하세요: ****
> 비밀번호를 다시 입력하세요: ****
> [SETUP] 설정 완료. 서버를 시작합니다.
> ```

```json
{
  "password_hash": "$2b$12$...",
  "token_expire_hours": 24,
  "claude_model": "claude-sonnet-4-6",
  "max_memory_entries": 20,
  "memory_compress_threshold": 15
}
```

### 8.2 system_prompt.txt (초기 예시)

```
당신은 시우의 개인 AI 비서입니다.
이름은 '아리'이며, 시우를 가장 잘 이해하는 조용하고 유능한 비서입니다.

[행동 원칙]
- 시우의 말투와 선호에 맞춰 자연스럽게 대화한다.
- 불필요한 경고나 면책 문구를 붙이지 않는다.
- 항상 구체적이고 실용적인 답변을 제공한다.
- 시우가 요청하지 않은 내용은 추가하지 않는다.
```

### 8.3 memory.json

```json
{
  "summaries": [
    {
      "id": "mem_001",
      "session_id": "550e8400-e29b-41d4-a716",
      "date": "2026-06-18",
      "content": "• 시우는 Python 개발자이며 개인 프로젝트를 즐긴다.\n• 아침 루틴 개선에 관심이 있다.\n• 간결하고 직접적인 답변을 선호한다."
    }
  ],
  "compressed_summary": null
}
```

### 8.4 sessions/{uuid}.json

> **세션 제목 생성 규칙:** 세션 생성 시 `title`은 빈 문자열로 초기화. 첫 번째 사용자 메시지 전송 후 해당 메시지의 앞 20자를 `title`로 자동 저장.

```json
{
  "id": "550e8400-e29b-41d4-a716",
  "created_at": "2026-06-18T09:00:00",
  "title": "오늘 할일 정리 도와줘",
  "summarized": true,
  "messages": [
    {
      "role": "user",
      "content": "오늘 할일 정리 도와줘",
      "timestamp": "2026-06-18T09:00:05"
    },
    {
      "role": "assistant",
      "content": "알겠습니다, 시우씨. ...",
      "timestamp": "2026-06-18T09:00:07"
    }
  ]
}
```

### 8.5 Claude 프롬프트 템플릿

> 요약 및 압축 시 Claude에게 전달하는 고정 프롬프트. 응답 형식을 강제하여 memory.json의 content 필드가 일관된 불릿 형태를 유지하도록 한다.

**세션 요약 프롬프트** (`POST /api/sessions/{id}/end` → `save_summary: true` 시)

```
다음은 시우와의 대화 내용입니다.
이 대화에서 시우에 대해 새로 알게 된 사실, 선호, 관심사, 특성을 불릿 포인트로 요약해줘.
이미 일반적으로 알려진 내용은 반복하지 말고, 이 대화에서 드러난 구체적인 정보에 집중해줘.
3~7개 불릿으로 간결하게 작성해줘.
답변은 반드시 한국어로, 불릿 포인트만 출력해줘 (추가 설명·인사말 없이).
형식 예시:
• 시우는 오전에 집중력이 높다고 언급했다.
• 코드 리뷰 시 주석보다 변수명으로 의도를 표현하는 방식을 선호한다.
```

**메모리 압축 프롬프트** (`memory_compress_threshold` 초과 시 오래된 요약 재요약)

```
다음은 시우에 대한 여러 대화 세션의 요약 목록입니다.
이것들을 하나의 통합된 요약으로 압축해줘.
중복 내용은 제거하고, 모순되는 내용은 최신 정보를 우선해줘.
10개 이하의 핵심 불릿으로 정리해줘.
답변은 반드시 한국어로, 불릿 포인트만 출력해줘 (추가 설명·인사말 없이).
```

**메모리 주입 형식** (새 세션 시작 시 시스템 프롬프트에 추가)

```
---
[시우에 대해 알고 있는 것 — 이전 {N}개 대화에서 누적]
• 시우는 Python 개발자이며 개인 프로젝트를 즐긴다.
• 간결하고 직접적인 답변을 선호한다.
• 아침에 집중력이 높다고 언급했다.
---
```

---

## 9. API 명세

### 인증

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|-----------|
| POST | `/api/login` | 비밀번호 검증, JWT 발급 | ✗ |

**POST /api/login**
```json
// Request
{ "password": "my_secret" }

// Response 200
{ "access_token": "eyJ...", "token_type": "bearer" }

// Response 401
{ "detail": "비밀번호가 올바르지 않습니다." }
```

### 세션

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|-----------|
| GET | `/api/sessions` | 세션 목록 조회 | ✓ |
| POST | `/api/sessions` | 새 세션 생성 | ✓ |
| GET | `/api/sessions/{id}` | 세션 대화 내용 조회 | ✓ |
| POST | `/api/sessions/{id}/end` | 세션 종료 + 요약 생성 (저장 여부 body로 지정) | ✓ |

**GET /api/sessions**
```json
// Response 200
[
  {
    "id": "550e8400-e29b-41d4-a716",
    "created_at": "2026-06-18T09:00:00",
    "title": "오늘 할일 정리 도와줘",
    "summarized": true,
    "message_count": 12
  },
  {
    "id": "661f9511-...",
    "created_at": "2026-06-17T14:30:00",
    "title": "저녁 메뉴 추천해줘",
    "summarized": false,
    "message_count": 6
  }
]
// 최신 세션이 먼저 오도록 created_at 내림차순 정렬
```

**POST /api/sessions**
```json
// Request body 없음

// Response 201
{
  "id": "772g0622-...",
  "created_at": "2026-06-18T10:00:00",
  "title": "",
  "summarized": false,
  "message_count": 0
}
```

**GET /api/sessions/{id}**
```json
// Response 200
{
  "id": "550e8400-e29b-41d4-a716",
  "created_at": "2026-06-18T09:00:00",
  "title": "오늘 할일 정리 도와줘",
  "summarized": true,
  "messages": [
    { "role": "user",      "content": "오늘 할일 정리 도와줘",   "timestamp": "2026-06-18T09:00:05" },
    { "role": "assistant", "content": "알겠습니다, 시우씨. ...", "timestamp": "2026-06-18T09:00:07" }
  ]
}

// Response 404
{ "detail": "세션을 찾을 수 없습니다." }
```

**POST /api/sessions/{id}/end**
```json
// Request
{ "save_summary": true }   // false면 요약 없이 종료

// Response 200 — 저장한 경우
{
  "status": "summarized",
  "summary_id": "mem_002",
  "summary": "• 시우는 Python 개발자이며...\n• ..."
}

// Response 200 — 저장 안 한 경우
{ "status": "ended" }

// Response 404
{ "detail": "세션을 찾을 수 없습니다." }
```

### 채팅

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|-----------|
| POST | `/api/chat` | 메시지 전송, SSE 스트리밍 응답 | ✓ |

**POST /api/chat**

> **구현 주의:** 브라우저 기본 `EventSource` API는 GET만 지원하므로 사용 불가.  
> 프론트엔드는 `fetch()` + `response.body.getReader()`로 스트림을 직접 읽어야 한다.

```json
// Request
{
  "session_id": "550e8400-...",
  "message": "오늘 할일 정리 도와줘"
}

// Response: Content-Type: text/event-stream
// data: {"delta": "알겠"}
// data: {"delta": "습니다"}
// data: {"done": true, "full_text": "알겠습니다..."}
// (오류 시)
// data: {"error": "Claude API 오류가 발생했습니다."}
```

### 메모리

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|-----------|
| GET | `/api/memory` | 전체 메모리 요약 조회 | ✓ |
| DELETE | `/api/memory/{id}` | 특정 메모리 항목 삭제 | ✓ |
| DELETE | `/api/memory` | 전체 메모리 초기화 | ✓ |

**GET /api/memory**
```json
// Response 200
{
  "summaries": [
    {
      "id": "mem_003",
      "session_id": "550e8400-e29b-41d4-a716",
      "date": "2026-06-18",
      "content": "• 시우는 Python 개발자이며 개인 프로젝트를 즐긴다.\n• 간결하고 직접적인 답변을 선호한다."
    },
    {
      "id": "mem_002",
      "session_id": "661f9511-...",
      "date": "2026-06-17",
      "content": "• 운동 루틴 개선에 관심이 있음."
    }
  ],
  "compressed_summary": null,
  "total": 2
}
// summaries는 date 내림차순 (최신이 먼저)
```

**DELETE /api/memory/{id}**
```json
// Response 204 No Content

// Response 404
{ "detail": "해당 메모리 항목을 찾을 수 없습니다." }
```

**DELETE /api/memory**
```json
// Response 204 No Content
```

### 설정

| 메서드 | 경로 | 설명 | 인증 필요 |
|--------|------|------|-----------|
| GET | `/api/system-prompt` | 시스템 프롬프트 조회 | ✓ |
| PUT | `/api/system-prompt` | 시스템 프롬프트 수정 | ✓ |

**GET /api/system-prompt**
```json
// Response 200
{
  "content": "당신은 시우의 개인 AI 비서입니다. 이름은 '아리'이며..."
}

// Response 500 (system_prompt.txt 읽기 실패)
{ "detail": "시스템 프롬프트 파일을 읽을 수 없습니다." }
```

**PUT /api/system-prompt**
```json
// Request
{ "content": "당신은 시우의 개인 AI 비서입니다..." }

// Response 200
{ "status": "saved", "len": 387 }

// Response 500 (쓰기 실패)
{ "detail": "시스템 프롬프트 저장에 실패했습니다." }
```

---

## 10. 화면 설계서

> 아래 와이어프레임은 레이아웃 구조 파악을 위해 ASCII 박스로 표현한 것이며,  
> **실제 UI는 일반 HTML/CSS 라이트 테마**로 구현한다. (박스 드로잉 문자 사용 안 함)  
> 실제 구현 시 색상·폰트·컴포넌트 스펙은 **`FINALUXUI.md`를 단일 레퍼런스**로 사용한다.

---

### SCR-01 로그인 화면

**URL:** `/login`  
**조건:** 미인증 사용자가 접속 시 자동 리다이렉트

```
╔══════════════════════════════════════════════════╗
║                                                  ║
║              SIWOO  AI  ASSISTANT                ║
║                                                  ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║                  접속 비밀번호                   ║
║                                                  ║
║          ┌──────────────────────────┐            ║
║          │ ●●●●●●●●                 │            ║
║          └──────────────────────────┘            ║
║                                                  ║
║                  [ 접  속 ]                      ║
║                                                  ║
║          오류 시: 비밀번호가 틀렸습니다.         ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

**동작:**
- Enter 키 또는 [접속] 버튼으로 제출
- 틀렸을 때 입력 필드 흔들림 애니메이션 + 오류 메시지
- 성공 시 `/` (메인 채팅 화면) 리다이렉트

---

### SCR-02 메인 채팅 화면

**URL:** `/`  
**레이아웃:** 좌측 사이드바 + 우측 채팅 영역

**PC 레이아웃 (1024px+)**

```
╔══════════════════════════════════════════════════════════════════╗
║  SIWOO AI                          [메모리]  [설정]  [로그아웃] ║
╠═══════════════╦══════════════════════════════════════════════════╣
║  세션 목록    ║                                                  ║
║               ║  [AI]  안녕하세요, 시우씨!                      ║
║  [+ 새 대화]  ║        오늘은 무엇을 도와드릴까요?              ║
║               ║                                                  ║
║  ┌───────────┐║                                                  ║
║  │▶ 오늘 대화│║                   [나]  할일 목록 정리해줘      ║
║  │  09:00    │║                                                  ║
║  └───────────┘║  [AI]  알겠습니다. 오늘의 할일을                ║
║  ┌───────────┐║        정리해 드리겠습니다. ▌                   ║
║  │  어제 대화│║                                                  ║
║  │  2026/6/17│║                                                  ║
║  └───────────┘║                                                  ║
║               ╠══════════════════════════════════════════════════╣
║               ║  ┌──────────────────────────────────┐  [전송]  ║
║               ║  │ 메시지를 입력하세요...            │  [종료]  ║
║               ║  └──────────────────────────────────┘          ║
╚═══════════════╩══════════════════════════════════════════════════╝
```

**모바일 레이아웃 (360px~767px)**

```
╔══════════════════════════════╗
║ SIWOO AI      [☰] [★] [⚙]  ║
╠══════════════════════════════╣
║                              ║
║ [AI]  안녕하세요, 시우씨!   ║
║                              ║
║         [나]  할일 정리해줘 ║
║                              ║
║ [AI]  알겠습니다. ▌          ║
║                              ║
╠══════════════════════════════╣
║ ┌──────────────────┐ [전송] ║
║ │ 입력...          │ [종료] ║
║ └──────────────────┘        ║
╚══════════════════════════════╝

(☰ 클릭 시 세션 목록 드로어 표시)
```

**컴포넌트 상세:**

| 컴포넌트 | 동작 |
|----------|------|
| [+ 새 대화] | 새 세션 생성, 채팅 영역 초기화 |
| 세션 목록 항목 | 클릭 시 해당 세션 로드 (현재 세션은 굵게 강조) |
| 채팅 말풍선 [AI] | 좌측 정렬, 배경 연회색 |
| 채팅 말풍선 [나] | 우측 정렬, 배경 연파랑 |
| 스트리밍 커서 `▌` | 응답 중 깜박임, 완료 시 사라짐 |
| [전송] | 메시지 전송 (Enter도 동일). 스트리밍 중에는 비활성화 |
| [중단] | 스트리밍 중에만 [전송] 자리에 표시. 클릭 시 AbortController로 스트림 즉시 중단, AI 말풍선에 "중단됨" 표시 |
| [종료] | 세션 종료 + 요약 생성 확인 다이얼로그 표시 |

---

### SCR-03 세션 종료 확인 다이얼로그

**URL:** `modal` (SCR-02 위 오버레이)  
**접근:** 채팅 화면 입력 바의 [종료] 버튼 클릭

```
╔══════════════════════════════════════╗
║           세션 종료                  ║
╠══════════════════════════════════════╣
║                                      ║
║  이 대화를 종료하고 요약을           ║
║  메모리에 저장하시겠습니까?          ║
║                                      ║
║  (요약 생성에 수초가 소요됩니다)     ║
║                                      ║
║        [ 저장 후 종료 ]              ║
║        [ 저장 안 하고 종료 ]         ║
║        [ 취 소 ]                     ║
║                                      ║
╚══════════════════════════════════════╝
```

---

### SCR-04 메모리 뷰어

**URL:** `/memory`  
**접근:** 상단 네비게이션 [메모리] 버튼

```
╔══════════════════════════════════════════════════════════════╗
║  누적 메모리                              [← 채팅으로]      ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  시우에 대해 누적된 이해  (총 3개 세션)  [전체 초기화]      ║
║                                                              ║
║  ╔════════════════════════════════════════════════════╗      ║
║  ║  #3  2026-06-18  (오늘 대화)              [삭제]  ║      ║
║  ╠════════════════════════════════════════════════════╣      ║
║  ║  • 시우는 Python 개발자이며 개인 프로젝트를 즐김  ║      ║
║  ║  • 간결하고 직접적인 답변을 선호한다              ║      ║
║  ║  • 아침에 집중력이 높다고 언급함                  ║      ║
║  ╚════════════════════════════════════════════════════╝      ║
║                                                              ║
║  ╔════════════════════════════════════════════════════╗      ║
║  ║  #2  2026-06-17                           [삭제]  ║      ║
║  ╠════════════════════════════════════════════════════╣      ║
║  ║  • 운동 루틴 개선에 관심이 있음                   ║      ║
║  ║  • 저녁에 책 읽는 습관이 있음                     ║      ║
║  ╚════════════════════════════════════════════════════╝      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**동작:**
- [삭제] 클릭 → 확인 없이 즉시 삭제 (UX 간소화)
- [전체 초기화] → 확인 다이얼로그 후 memory.json 초기화

---

### SCR-05 설정 화면 (시스템 프롬프트 편집)

**URL:** `/settings`  
**접근:** 상단 네비게이션 [설정] 버튼

```
╔══════════════════════════════════════════════════════════════╗
║  설정                                     [← 채팅으로]      ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  비서 정체성 (시스템 프롬프트)                               ║
║  ─────────────────────────────────────────────────────────  ║
║  ┌─────────────────────────────────────────────────────┐    ║
║  │ 당신은 시우의 개인 AI 비서입니다.                   │    ║
║  │ 이름은 '아리'이며...                                │    ║
║  │                                                     │    ║
║  │ (여러 줄 편집 가능)                                 │    ║
║  │                                                     │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                              ║
║                               [ 저 장 ]  [ 초기화 ]         ║
║                                                              ║
║  ✓ 저장되었습니다.  (저장 후 표시)                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 11. 보안 요구사항

| 코드 | 항목 | 내용 |
|------|------|------|
| SEC-01 | API 키 보호 | `ANTHROPIC_API_KEY`는 `.env` 파일로 관리, 코드에 하드코딩 금지 |
| SEC-02 | 비밀번호 저장 | bcrypt 해시로만 저장 (평문 저장 금지) |
| SEC-03 | JWT 인증 | 모든 `/api/*` 엔드포인트에 Bearer 토큰 검증 |
| SEC-04 | 네트워크 노출 | 프론트·API가 같은 FastAPI 서버에서 제공되어 same-origin이므로 CORS 설정 불필요. 서버 시작 시 로컬 IP를 콘솔에 출력해 모바일 접속 URL을 안내한다. |
| SEC-05 | 경로 탐색 방지 | 파일 읽기/쓰기 시 경로를 `data/` 디렉터리 내로 제한 (`Path.resolve()`로 상위 경로 이탈 차단) |
| SEC-06 | .env 보호 | `.env`를 `.gitignore`에 포함. `data/` 폴더는 민감 데이터 포함이므로 백업 시 주의 |
| SEC-07 | Markdown XSS 방지 | Claude 응답을 `marked.js`로 HTML 변환 후, `DOMPurify.sanitize()`를 적용한 뒤에만 `innerHTML`에 삽입. 소독 없이 삽입 금지 |

---

## 12. 제약 및 가정

| 번호 | 내용 |
|------|------|
| C-01 | Anthropic API 호출 비용은 사용자(시우)가 직접 부담 |
| C-02 | `memory.json`의 내용이 시스템 프롬프트에 포함되므로, 메모리가 많을수록 입력 토큰 증가 |
| C-03 | Claude API는 외부 네트워크 연결이 필요하며, 대화 내용이 Anthropic 서버를 경유함 (Anthropic 개인정보처리방침 적용) |
| C-04 | 모바일 접속은 PC와 동일 WiFi 네트워크에 있어야 함 |
| C-05 | PC가 켜져 있어야 모바일에서 접속 가능 |
| C-06 | 단일 사용자 가정 — 동시 접속 충돌 처리 없음 |

---

## 13. 구현 계획

> 1인 개발 기준, 각 Phase는 약 1 manday 규모.  
> **UI 구현은 반드시 `FINALUXUI.md`를 단일 레퍼런스로 사용한다.**  
> 각 Phase는 구현 → 자체 코드리뷰 → 기능 검증 → 단위 테스트 → 사이드 이펙트 확인 → 지금까지 완료된 전체 Phase 통합 테스트 순으로 진행한다.

---

### Phase 1 — 프로젝트 기반 + 인증

**목표:** 서버 실행 및 로그인 화면까지 동작하는 최소 골격 완성.

#### 구현 항목

| 분류 | 작업 |
|------|------|
| 환경 | Python 3.10+ 가상환경, `requirements.txt` 작성 (`python-dotenv`, `aiofiles` 포함) |
| 구조 | 디렉터리 골격 생성 (`app/`, `data/`, `static/`) |
| 설정 | `.env` (ANTHROPIC_API_KEY, LOG_LEVEL=INFO) 생성. `python-dotenv`로 서버 시작 시 로드 |
| 백엔드 | `main.py` FastAPI 앱 + Uvicorn 실행 (`0.0.0.0:8000`) |
| 백엔드 | 서버 시작 시 `data/config.json` 없으면 콘솔 대화형 비밀번호 설정 후 해시 저장 (§8.1 초기 설정 흐름) |
| 백엔드 | `app/config.py` — 설정값 로드 |
| 백엔드 | `app/auth.py` — bcrypt 해시 검증, JWT 발급/검증 |
| 백엔드 | `POST /api/login` 엔드포인트 |
| 백엔드 | `static/` 파일 서빙 (FastAPI StaticFiles) |
| 백엔드 | SPA catch-all 라우트 — `/api/` 외 모든 경로에 `index.html` 반환 (NFR-08) |
| 프론트 | **SCR-01 로그인 화면** (`FINALUXUI.md §3` 기준) |
| 프론트 | `window.location.pathname` 기반 클라이언트 라우팅 (`/login`, `/`, `/memory`, `/settings`) |
| 프론트 | JWT 토큰 `localStorage` 저장, 미인증 시 `/login` 리다이렉트 |
| **로깅** | **§14 로깅 명세에 따라 Phase 1 이벤트 구현:** 로그 시스템 초기화 (`TimedRotatingFileHandler` + stdout 동시 출력), 서버 시작 시 7일 초과 로그 자동 삭제 (`LOG_CLEANUP`), `SERVER_START/STOP`, `SETUP_START/COMPLETE`, 인증 이벤트 전체 (`LOGIN_ATTEMPT/SUCCESS/FAIL`, `TOKEN_ISSUED/EXPIRED/INVALID`) |

#### 검증 · 테스트

- 로그인 성공 → 토큰 발급 → `/` 리다이렉트
- 로그인 실패 → shake 애니메이션 + 오류 메시지
- 토큰 없이 `/api/*` 접근 → 401 응답
- 토큰 만료(24h) 후 재로그인 유도

#### 사이드 이펙트 확인

- `.env` 미설정 시 서버 시작 오류 메시지 명확히 출력되는지 확인
- `data/config.json` 없을 때 초기화 자동 실행되는지 확인

---

### Phase 2 — 세션 관리 + Claude API 채팅 백엔드

**목표:** 메시지를 보내면 Claude가 SSE 스트리밍으로 응답하고, 세션이 JSON 파일로 저장됨.

#### 구현 항목

| 분류 | 작업 |
|------|------|
| 백엔드 | `app/services/claude.py` — Anthropic SDK 초기화, `system_prompt.txt` 로드 후 system 파라미터 구성, 스트리밍 래퍼 |
| 백엔드 | `app/services/session.py` — 세션 파일 읽기/쓰기/목록 조회 (`aiofiles` 사용, async def 내 동기 `open()` 금지) |
| 백엔드 | `GET /api/sessions` — 세션 목록 |
| 백엔드 | `POST /api/sessions` — 새 세션 생성 (UUID) |
| 백엔드 | `GET /api/sessions/{id}` — 세션 대화 내용 조회 |
| 백엔드 | `POST /api/chat` — SSE 스트리밍 응답 (`text/event-stream`). 클라이언트 연결 끊김 시 `asyncio.CancelledError` 또는 제너레이터 자연 종료로 스트림 중단 처리 |
| 백엔드 | 모든 `/api/*`에 JWT Bearer 토큰 검증 미들웨어 적용 |
| 데이터 | `data/system_prompt.txt` 초기 파일 생성 (기본 아리 프롬프트, §8.2 기준) |
| 데이터 | 대화 메시지 실시간 `data/sessions/{uuid}.json` 저장 |
| **로깅** | **§14 로깅 명세에 따라 Phase 2 이벤트 구현:** `SESSION_CREATE`, `SESSION_LOAD/LOAD_FAIL`, `SESSION_LIST`, `SESSION_SAVE/SAVE_FAIL`, `SESSION_TITLE_SET`, `STREAM_START`, `STREAM_CHUNK` (DEBUG), `STREAM_END`, `STREAM_ERROR`, `PROMPT_BUILD` |

#### 검증 · 테스트

- 새 세션 생성 → UUID 파일 생성 확인
- 메시지 전송 → SSE 토큰 스트리밍 수신 확인
- 응답 완료 후 `sessions/{uuid}.json`에 messages 저장 확인
- 기존 세션 조회 → 전체 대화 내용 반환 확인
- 잘못된 JWT → 401, Claude API 오류 → 에러 이벤트 스트리밍 확인

#### 사이드 이펙트 확인

- Phase 1 로그인/인증 흐름 재확인
- `data/sessions/` 디렉터리 자동 생성 여부 확인

---

### Phase 3 — 메인 채팅 프론트엔드

**목표:** SCR-02 채팅 화면이 완전히 동작. 스트리밍 실시간 표시, 세션 전환 가능.

#### 구현 항목

| 분류 | 작업 |
|------|------|
| 프론트 | **SCR-02 전체 레이아웃** (`FINALUXUI.md §4` 기준) — 상단 네비바, 사이드바, 채팅 영역 |
| 프론트 | AI 말풍선(좌, 흰 카드) / 사용자 말풍선(우, #eef9fc) 스타일 |
| 프론트 | SSE 수신 — `fetch()` + `response.body.getReader()` + `AbortController`. 스트리밍 커서 `▌` 실시간 타이핑 표시 |
| 프론트 | **Markdown 렌더링** — `marked.js`로 AI 응답 파싱 → `DOMPurify.sanitize()` → 말풍선 `innerHTML` 삽입 (FR-CHAT-07, SEC-07). `index.html`에 CDN 로드: marked.js, highlight.js, DOMPurify |
| 프론트 | **highlight.js** — marked.js에 `highlight` 옵션 연결하여 코드 블록 자동 언어 감지 및 색상 강조 |
| 프론트 | **[중단] 버튼** — 스트리밍 중에만 [전송] 자리에 표시. 클릭 시 `abortController.abort()` → fetch 취소 → AI 말풍선 끝에 "(중단됨)" 텍스트 추가 (FR-CHAT-08) |
| 프론트 | 입력 바 — Enter 전송 / Shift+Enter 줄바꿈 |
| 프론트 | [+ 새 대화] 버튼 — 새 세션 생성 + 채팅 영역 초기화 |
| 프론트 | 세션 목록 렌더링 — 날짜 + 첫 메시지 미리보기, 활성 세션 강조 |
| 프론트 | 세션 항목 클릭 → 해당 세션 대화 내용 로드 |
| 프론트 | 빈 새 대화 상태 — 인사 메시지 + 추천 프롬프트 3개 노출 |
| 프론트 | 새 메시지 추가 시 채팅 영역 자동 스크롤 to bottom |
| **로깅** | **Phase 3은 프론트 전용 Phase.** 서버 신규 로그 이벤트 없음. Phase 2 로그 (`STREAM_START/END/ERROR`, `SESSION_SAVE`) 로 백엔드 동작 검증. 클라이언트 AbortController 중단 → 서버측 `STREAM_ERROR` 또는 조기 종료 로그 확인 |

#### 검증 · 테스트

- 메시지 전송 → 스트리밍 커서 표시 → 완료 후 커서 사라짐
- 세션 목록에서 이전 세션 클릭 → 대화 내용 정상 로드
- 새 대화 생성 → 채팅 영역 초기화 → 빈 상태 노출
- Enter / Shift+Enter 동작 각각 확인

#### 사이드 이펙트 확인

- Phase 1 로그인 화면과 라우팅 충돌 없는지 확인
- Phase 2 세션 API 응답과 프론트 렌더링 정합성 확인

---

### Phase 4 — 누적 메모리 시스템

**목표:** 세션 종료 시 Claude가 요약을 생성하고 memory.json에 누적. 다음 대화에 자동 주입.

#### 구현 항목

| 분류 | 작업 |
|------|------|
| 백엔드 | `app/services/memory.py` — 요약 생성, `memory.json` 읽기/쓰기/압축 (`aiofiles` 사용) |
| 백엔드 | `POST /api/sessions/{id}/end` — 세션 종료 + 요약 생성 트리거 |
| 백엔드 | 최종 시스템 프롬프트 조합 로직 (`system_prompt.txt` + `memory.json` 주입, §8.5 메모리 주입 형식 기준) |
| 백엔드 | 요약 프롬프트: §8.5 세션 요약 프롬프트 템플릿 사용 |
| 백엔드 | 메모리 압축 로직 (`memory_compress_threshold` 초과 시 오래된 요약 재요약, §8.5 압축 프롬프트 템플릿 사용) |
| 프론트 | **SCR-03 세션 종료 다이얼로그** (`FINALUXUI.md §5` 기준) |
| 프론트 | 요약 생성 중 로딩 인디케이터 |
| 프론트 | 완료 후 토스트 "메모리에 저장되었습니다" |
| 프론트 | 새 세션 시작 시 메모리 주입 안내 칩 노출 ("이전 대화 기억을 불러왔어요 · N개 세션") |
| **로깅** | **§14 로깅 명세에 따라 Phase 4 이벤트 구현:** `MEMORY_LOAD/LOAD_EMPTY`, `MEMORY_SUMMARIZE_START/END/ERROR`, `MEMORY_COMPRESS_START/END`, `MEMORY_DELETE`, `MEMORY_CLEAR`, `MEMORY_SAVE` |

#### 검증 · 테스트

- 세션 종료(저장) → Claude 요약 생성 → `memory.json` 추가 확인
- 새 세션 시작 → 시스템 프롬프트에 메모리 내용 포함 확인 (로그 확인)
- 세션 종료(저장 안 함) → `memory.json` 미변경 확인
- `memory_compress_threshold` 초과 시 압축 실행 확인

#### 사이드 이펙트 확인

- Phase 3 채팅 플로우(메시지 전송, 스트리밍) 정상 동작 재확인
- 메모리 주입으로 시스템 프롬프트 길이 증가 → 토큰 한도 이상 발생하지 않는지 확인

---

### Phase 5 — 메모리 뷰어 + 설정 화면

**목표:** SCR-04, SCR-05 화면 완성. 메모리 관리 및 시스템 프롬프트 편집 가능.

#### 구현 항목

| 분류 | 작업 |
|------|------|
| 백엔드 | `GET /api/memory` — 전체 메모리 요약 조회 (date 내림차순, §9 응답 포맷 기준) |
| 백엔드 | `DELETE /api/memory/{id}` — 특정 메모리 항목 삭제 → 204 |
| 백엔드 | `DELETE /api/memory` — 전체 메모리 초기화 → 204 |
| 백엔드 | `GET /api/system-prompt` — `system_prompt.txt` 내용 조회 (§9 응답 포맷 기준) |
| 백엔드 | `PUT /api/system-prompt` — `system_prompt.txt` 수정 + 현재 세션 즉시 반영 (§9 응답 포맷 기준) |
| 프론트 | **SCR-04 메모리 뷰어** (`FINALUXUI.md §6` 기준) — 요약 카드 목록, × 삭제, 전체 초기화 |
| 프론트 | **SCR-05 설정 화면** (`FINALUXUI.md §7` 기준) — 프롬프트 에디터, 저장/초기화 |
| 프론트 | 전체 초기화 확인 다이얼로그 |
| 프론트 | 저장 후 "✓ 저장되었습니다" 그린 인라인 메시지 (3초 자동 사라짐) |
| 프론트 | 빈 메모리 상태 — 점선 카드 안내 |
| **로깅** | **§14 로깅 명세에 따라 Phase 5 이벤트 구현:** `PROMPT_LOAD/LOAD_FAIL`, `PROMPT_SAVE/SAVE_FAIL` |

#### 검증 · 테스트

- 메모리 카드 정상 렌더링 확인
- 항목 삭제 → `memory.json` 반영 + 화면 갱신 확인
- 전체 초기화 → 확인 다이얼로그 → 초기화 확인
- 시스템 프롬프트 수정 저장 → 다음 메시지에 반영 확인
- 초기화 버튼 → 텍스트에리어 리셋 (미저장 상태) 확인

#### 사이드 이펙트 확인

- 메모리 삭제 후 새 채팅 세션의 시스템 프롬프트 주입 내용 재확인
- Phase 3 채팅 화면의 상단 네비 탭 전환(메모리/설정) 정상 동작 재확인

---

### Phase 6 — 반응형 + 마감 · 전체 통합 테스트

**목표:** 모바일 반응형 완성, 보안·오류 처리 정비, 실기기 테스트. 전 Phase 통합 검증.

#### 구현 항목

| 분류 | 작업 |
|------|------|
| 반응형 | 모바일(360–767px) — 사이드바 → 햄버거 드로어 (`FINALUXUI.md §8` 기준) |
| 반응형 | 드로어 열기/닫기 (스크림 오버레이, 슬라이드 인 애니메이션) |
| 반응형 | 모바일 네비바 아이콘 전용 모드 |
| 보안 | 파일 경로 탐색 방지 — `Path.resolve()`로 `data/` 이탈 차단 (SEC-05) |
| 보안 | 서버 시작 시 로컬 IP 콘솔 출력, same-origin이므로 별도 CORS 불필요 (SEC-04) |
| 보안 | `.env` `.gitignore` 등록 확인 (SEC-06) |
| 애니메이션 | 다이얼로그 scale-in 등장 / 배경 blur 딤 |
| 애니메이션 | 로그인 오류 shake 애니메이션 |
| 공통 | 토스트 알림 컴포넌트 공통화 |
| 오류 처리 | Claude API 오류 → 채팅 영역 인라인 에러 메시지 (앱 크래시 없음, NFR-07) |
| 오류 처리 | 파일 I/O 실패 → 서버 500 + 사용자 에러 메시지 |
| 오류 처리 | JWT 토큰 만료 mid-session 처리 — API 401 수신 시 프론트에서 자동 `/login` 리다이렉트 + "세션이 만료되었습니다" 안내 |
| 테스트 | 동일 WiFi 모바일 실기기 접속 (`http://<로컬IP>:8000`) |
| **로깅** | **§14 로깅 전체 통합 검토:** `LOG_LEVEL=DEBUG`로 `STREAM_CHUNK` 추적, 401 mid-session 발생 시 `TOKEN_EXPIRED` 로그 확인, 7일 초과 로그 자동 삭제(`LOG_CLEANUP`) 확인, 모바일 접속 시 `LOGIN_SUCCESS ip=<모바일IP>` 확인 |

#### 최종 통합 테스트 체크리스트

- [ ] 로그인 → 채팅 → 세션 종료(요약) → 새 세션 → 메모리 주입 전체 플로우
- [ ] 메모리 뷰어에서 항목 삭제 후 채팅 메모리 주입 내용 변화 확인
- [ ] 시스템 프롬프트 변경 후 AI 응답 톤 변화 확인
- [ ] 서버 재시작 후 세션·메모리 데이터 유지 확인
- [ ] PC Chrome / 모바일 Safari 크로스브라우저 확인
- [ ] Claude API 강제 오류 상황 에러 처리 확인
- [ ] 토큰 만료 시 재로그인 유도 흐름 확인

---

### 구현 순서 요약

```
Phase 1  환경·인증·로그인 화면
   ↓
Phase 2  세션 관리 + Claude API 백엔드
   ↓
Phase 3  메인 채팅 프론트엔드
   ↓
Phase 4  누적 메모리 시스템
   ↓
Phase 5  메모리 뷰어 + 설정 화면
   ↓
Phase 6  반응형 + 마감 + 전체 통합 테스트
```

---

## 14. 로깅 명세

> 문제 발생 시 로그만으로 원인을 추적할 수 있도록 상세하게 기록한다.  
> 로그 파일은 일별로 생성되며, 서버 시작 시 **7일 초과 파일을 자동 삭제**한다.

---

### 14.1 로그 저장 위치 및 파일 구조

```
data/logs/
  2026-06-18.log   ← 오늘
  2026-06-17.log
  2026-06-16.log
  ...              (7일치만 유지, 그 이상은 서버 시작 시 자동 삭제)
```

- 파일명: `YYYY-MM-DD.log` (서버 로컬 날짜 기준)
- 자정이 넘으면 새 파일로 자동 전환 (Python `TimedRotatingFileHandler` 또는 직접 구현)
- 콘솔(stdout)에도 동시 출력 (서버 실행 중 실시간 확인용)

---

### 14.2 로그 포맷

```
[2026-06-18 09:00:05.123] [INFO ] [auth.py:42       ] LOGIN_SUCCESS | ip=192.168.1.5
[2026-06-18 09:00:06.234] [INFO ] [sessions.py:87   ] SESSION_CREATE | id=550e8400
[2026-06-18 09:00:07.345] [INFO ] [claude.py:63     ] STREAM_START | session=550e8400 msg_count=3 user_len=14
[2026-06-18 09:00:09.567] [INFO ] [claude.py:91     ] STREAM_END | session=550e8400 elapsed=2.22s
[2026-06-18 09:01:23.789] [ERROR] [claude.py:105    ] STREAM_ERROR | session=550e8400 error="APIConnectionError: Connection timeout"
[2026-06-18 09:01:23.790] [ERROR] [claude.py:106    ] TRACEBACK | Traceback (most recent call last): ...
```

**포맷 구성:**

| 필드 | 형식 | 설명 |
|------|------|------|
| 타임스탬프 | `YYYY-MM-DD HH:MM:SS.mmm` | 밀리초 포함 |
| 레벨 | `DEBUG`/`INFO `/`WARN `/`ERROR` | 5자 고정폭 |
| 위치 | `파일명:라인번호` | 15자 고정폭 |
| 이벤트 | `EVENT_NAME` | 대문자 스네이크케이스 |
| 컨텍스트 | `key=value` 쌍 | 파이프(`\|`)로 이벤트와 구분 |

**로그 레벨 기준:**

| 레벨 | 사용 기준 |
|------|-----------|
| DEBUG | 스트리밍 청크 단위 데이터, 파일 읽기 바이트 수 등 세부 추적 (기본 비활성, `.env`의 `LOG_LEVEL=DEBUG`로 활성) |
| INFO | 정상 동작의 모든 주요 이벤트 |
| WARN | 예상 가능한 이상 상황 (토큰 만료, 빈 메모리 등) |
| ERROR | 예외·실패·스택 트레이스 |

---

### 14.3 로그 이벤트 목록

#### 서버

| 이벤트 | 레벨 | 기록 내용 | 예시 |
|--------|------|-----------|------|
| `SERVER_START` | INFO | host, port, model, local_ip | `host=0.0.0.0 port=8000 model=claude-sonnet-4-6 local_ip=192.168.1.10` |
| `SERVER_STOP` | INFO | 종료 신호 종류 | `signal=SIGINT` |
| `SETUP_START` | INFO | config.json 미존재로 설정 진행 | — |
| `SETUP_COMPLETE` | INFO | 초기 설정 완료 | — |
| `LOG_CLEANUP` | INFO | 삭제된 로그 파일 목록 | `deleted=["2026-06-10.log","2026-06-11.log"] count=2` |

#### 인증

| 이벤트 | 레벨 | 기록 내용 | 예시 |
|--------|------|-----------|------|
| `LOGIN_ATTEMPT` | INFO | 접속 IP | `ip=192.168.1.5` |
| `LOGIN_SUCCESS` | INFO | 접속 IP | `ip=192.168.1.5` |
| `LOGIN_FAIL` | WARN | 접속 IP, 실패 사유 (비밀번호 미기록) | `ip=192.168.1.5 reason=wrong_password` |
| `TOKEN_ISSUED` | INFO | 만료 시각 | `expires=2026-06-19T09:00:05` |
| `TOKEN_EXPIRED` | WARN | 토큰 만료 감지 endpoint | `endpoint=/api/chat` |
| `TOKEN_INVALID` | WARN | 잘못된 토큰 감지 | `endpoint=/api/sessions reason=decode_error` |

#### 세션

| 이벤트 | 레벨 | 기록 내용 | 예시 |
|--------|------|-----------|------|
| `SESSION_CREATE` | INFO | session_id | `id=550e8400` |
| `SESSION_LOAD` | INFO | session_id, 메시지 수 | `id=550e8400 msg_count=12` |
| `SESSION_LOAD_FAIL` | ERROR | session_id, 오류 | `id=550e8400 error="FileNotFoundError: ..."` |
| `SESSION_LIST` | INFO | 세션 총 수 | `count=7` |
| `SESSION_SAVE` | INFO | session_id, 메시지 수, 파일 크기 | `id=550e8400 msg_count=13 bytes=4821` |
| `SESSION_SAVE_FAIL` | ERROR | session_id, 오류 | `id=550e8400 error="PermissionError: ..."` |
| `SESSION_TITLE_SET` | INFO | session_id, 제목 앞 20자 | `id=550e8400 title="오늘 할일 정리 도와"` |

#### 채팅 (Claude API)

| 이벤트 | 레벨 | 기록 내용 | 예시 |
|--------|------|-----------|------|
| `STREAM_START` | INFO | session_id, 전체 메시지 수, 사용자 메시지 글자 수 | `session=550e8400 msg_count=3 user_len=14` |
| `STREAM_CHUNK` | DEBUG | session_id, 청크 번호, 청크 텍스트 길이 | `session=550e8400 chunk=7 len=4` |
| `STREAM_END` | INFO | session_id, 경과시간, 응답 글자 수 | `session=550e8400 elapsed=2.22s resp_len=312` |
| `STREAM_ABORT` | WARN | session_id, 중단 시점 응답 글자 수 (클라이언트가 AbortController로 연결 끊음) | `session=550e8400 resp_len=47` |
| `STREAM_ERROR` | ERROR | session_id, 오류 타입, 메시지 + 스택 트레이스 | `session=550e8400 error="APIStatusError: 529 Overloaded"` |
| `PROMPT_BUILD` | INFO | system 프롬프트 총 글자 수 (내용 미기록) | `system_len=1842 memory_entries=3` |

#### 메모리

| 이벤트 | 레벨 | 기록 내용 | 예시 |
|--------|------|-----------|------|
| `MEMORY_LOAD` | INFO | 요약 항목 수 | `count=3` |
| `MEMORY_LOAD_EMPTY` | INFO | memory.json 없거나 빈 경우 | — |
| `MEMORY_SUMMARIZE_START` | INFO | session_id, 대화 메시지 수 | `session=550e8400 msg_count=24` |
| `MEMORY_SUMMARIZE_END` | INFO | session_id, 요약 ID, 요약 글자 수, 경과시간 | `session=550e8400 mem_id=mem_004 summary_len=187 elapsed=4.51s` |
| `MEMORY_SUMMARIZE_ERROR` | ERROR | session_id, 오류 + 스택 트레이스 | `session=550e8400 error="APIConnectionError: ..."` |
| `MEMORY_COMPRESS_START` | INFO | 압축 전 항목 수 | `before_count=15` |
| `MEMORY_COMPRESS_END` | INFO | 압축 전/후 항목 수, 경과시간 | `before=15 after=8 elapsed=6.13s` |
| `MEMORY_DELETE` | INFO | 삭제한 메모리 ID | `mem_id=mem_001` |
| `MEMORY_CLEAR` | INFO | 삭제된 항목 수 | `cleared_count=7` |
| `MEMORY_SAVE` | INFO | 저장 후 항목 수, 파일 크기 | `count=4 bytes=2341` |

#### 설정

| 이벤트 | 레벨 | 기록 내용 | 예시 |
|--------|------|-----------|------|
| `PROMPT_LOAD` | INFO | system_prompt.txt 글자 수 | `len=342` |
| `PROMPT_LOAD_FAIL` | ERROR | 오류 내용 | `error="FileNotFoundError: ..."` |
| `PROMPT_SAVE` | INFO | 저장 후 글자 수 | `len=387` |
| `PROMPT_SAVE_FAIL` | ERROR | 오류 내용 | `error="PermissionError: ..."` |

---

### 14.4 로그 보존 및 자동 삭제

```python
# 서버 시작 시 실행 — 7일 초과 로그 파일 삭제 예시
cutoff = datetime.now() - timedelta(days=7)
for log_file in Path("data/logs").glob("*.log"):
    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d")
    if file_date < cutoff:
        log_file.unlink()
        # LOG_CLEANUP 이벤트 기록
```

- 삭제 기준: **파일명 날짜**가 오늘로부터 7일을 초과한 경우
- 삭제 시점: **서버 시작 직후** (로그 시스템 초기화 후 최초 1회)
- 삭제 결과는 `LOG_CLEANUP` 이벤트로 당일 로그에 기록

---

### 14.5 Phase별 로깅 구현 시점

| Phase | 구현 범위 |
|-------|-----------|
| Phase 1 | 로그 시스템 초기화, 로그 파일 생성, `LOG_CLEANUP`, `SERVER_START/STOP`, `SETUP_START/COMPLETE`, 인증 이벤트 전체 (`LOGIN_ATTEMPT`, `LOGIN_SUCCESS`, `LOGIN_FAIL`, `TOKEN_ISSUED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`) |
| Phase 2 | `SESSION_CREATE`, `SESSION_LOAD`, `SESSION_LOAD_FAIL`, `SESSION_LIST`, `SESSION_SAVE`, `SESSION_SAVE_FAIL`, `SESSION_TITLE_SET`, `STREAM_START`, `STREAM_CHUNK` (DEBUG), `STREAM_END`, `STREAM_ABORT`, `STREAM_ERROR`, `PROMPT_BUILD` |
| Phase 3 | 프론트 전용 Phase — 서버 신규 로그 이벤트 없음. Phase 2 로그로 백엔드 동작 검증. AbortController 중단 시 `STREAM_ABORT` 로그 발생 여부 확인 |
| Phase 4 | `MEMORY_LOAD`, `MEMORY_LOAD_EMPTY`, `MEMORY_SUMMARIZE_START`, `MEMORY_SUMMARIZE_END`, `MEMORY_SUMMARIZE_ERROR`, `MEMORY_COMPRESS_START`, `MEMORY_COMPRESS_END`, `MEMORY_DELETE`, `MEMORY_CLEAR`, `MEMORY_SAVE` |
| Phase 5 | `PROMPT_LOAD`, `PROMPT_LOAD_FAIL`, `PROMPT_SAVE`, `PROMPT_SAVE_FAIL` |
| Phase 6 | 전체 로그 통합 검토. `LOG_LEVEL=DEBUG` 활성화 후 `STREAM_CHUNK` 추적. 401 mid-session 발생 시 `TOKEN_EXPIRED` 로그 확인. 모바일 접속 IP `LOGIN_SUCCESS` 로그 확인. 7일 초과 로그 `LOG_CLEANUP` 자동 삭제 확인 |

---

---

### 14.6 requirements.txt 기준

```
fastapi>=0.115.0
uvicorn>=0.30.0
anthropic>=0.40.0
PyJWT>=2.8.0
bcrypt>=4.1.0
python-dotenv>=1.0.0
aiofiles>=24.0.0
```

> 프론트엔드 라이브러리(marked.js, highlight.js, DOMPurify)는 `index.html`에서 CDN으로 직접 로드. `requirements.txt`에 포함하지 않는다.

---

*문서 끝 — v1.1*
