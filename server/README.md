# Pillarm Server

F02 보호자 공유 기능을 위한 Node.js + Express 백엔드.

## 예정 API

| Method | Path | 설명 |
|--------|------|------|
| POST | /auth/signup | 회원가입 |
| POST | /auth/login | 로그인 |
| POST | /care-circles/:id/invite | 초대 링크 생성 |
| POST | /care-circles/join | 초대 수락 |
| GET  | /care-circles/:id/members/:userId/today | 복용 현황 조회 |

## Phase 2 구현 예정
