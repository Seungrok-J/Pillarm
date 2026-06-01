# PRD Phase 4 — 약봉투 촬영 자동 일정 생성

> **전제 조건:** Phase 3 배포 완료 후 진행한다.  
> **목표:** 카메라로 조제약 봉투(또는 일반의약품 포장)를 촬영하면 AI가 약 이름·용량·복용 횟수·기간·식전후를 자동으로 인식하여 복용 일정 초안을 생성한다. 사용자는 인식 결과를 확인·수정 후 한 번에 일정을 등록할 수 있다.

---

## 1. 기능 개요

### 핵심 흐름

```
[홈 / 일정 추가] → "약봉투 스캔" 버튼
  → 카메라 실행 (또는 갤러리 선택)
  → 이미지 캡처
  → 서버 AI 분석 (Claude Vision API)
  → 인식 결과 확인 화면
  → 사용자 수정 가능
  → "일정 만들기" → 기존 등록 플로우 연결
```

### 인식 대상 정보

| 필드 | 예시 | 필수 여부 |
|------|------|-----------|
| 약 이름 | "아목시실린 캡슐 500mg" | 필수 |
| 용량 | "500mg", "1정" | 선택 |
| 1일 복용 횟수 | "1일 3회" → 3 | 선택 |
| 1회 복용량 | "1캡슐", "2정" | 선택 |
| 복용 기간 | "5일분" → 종료일 자동 계산 | 선택 |
| 식전/식후 | "식후 30분" → after | 선택 |
| 특이사항 | "취침 전 복용", "공복 금지" | 선택 (메모) |

### 인식 예시

**조제약 봉투 텍스트:**
```
환자명: 홍길동
약국명: 행복약국
처방일: 2026.06.01
━━━━━━━━━━━━━━━━━━━━
아목시실린캡슐 500mg
1일 3회 / 1회 1캡슐 / 5일분
식후 30분에 복용하세요
━━━━━━━━━━━━━━━━━━━━
타이레놀 160mg
1일 3회 / 1회 2정 / 5일분
```

**AI 파싱 결과 (JSON):**
```json
[
  {
    "medicationName": "아목시실린캡슐",
    "dosageValue": 500,
    "dosageUnit": "mg",
    "timesPerDay": 3,
    "dosePerIntake": "1캡슐",
    "durationDays": 5,
    "withFood": "after",
    "note": "식후 30분"
  },
  {
    "medicationName": "타이레놀",
    "dosageValue": 160,
    "dosageUnit": "mg",
    "timesPerDay": 3,
    "dosePerIntake": "2정",
    "durationDays": 5,
    "withFood": "none"
  }
]
```

---

## 2. 기술 구현

### 2-1. AI 분석 방식

**채택: Claude Vision API (서버 프록시)**

| 항목 | 내용 |
|------|------|
| 모델 | `claude-haiku-4-5` 우선, 실패 시 `claude-sonnet-4-6` 재시도 |
| 입력 | 이미지 base64 (JPEG, 최대 4MB) |
| 출력 | 구조화된 JSON (약 목록) |
| 호출 경로 | 앱 → Railway 서버 → Anthropic API |
| 비용 절감 | 하이쿠 모델 우선, 이미지 리사이즈 (최대 1024px) 후 전송 |

**서버 프록시로 처리하는 이유:**
- Anthropic API 키를 앱에 노출하지 않음
- 서버에서 프롬프트 버전 관리 가능
- 요청 레이트 리밋 및 비용 제어 가능

**비교 검토 (채택 안 한 방법)**

| 방법 | 장점 | 단점 |
|------|------|------|
| Google Cloud Vision OCR + 규칙 파싱 | 비용 낮음 | 한국어 약봉투 형식 다양 → 파싱 규칙 유지 어려움 |
| On-device OCR (expo-camera + tesseract) | 오프라인 동작 | 정확도 낮음, 번들 크기 증가 |
| **Claude Vision API** (채택) | 유연한 한국어 이해, 다양한 포맷 대응 | API 비용, 인터넷 필요 |

---

### 2-2. 서버 API

#### POST /ai/scan-medication

```
Headers: Authorization: Bearer <accessToken>

Body (multipart/form-data 또는 JSON):
{
  image: string  // base64 인코딩된 JPEG 이미지
}

Response 200:
{
  results: [
    {
      medicationName: string
      dosageValue?: number
      dosageUnit?: string        // "mg" | "정" | "캡슐" | "mL"
      timesPerDay?: number       // 1일 복용 횟수
      dosePerIntake?: string     // "1정", "2캡슐" 등
      durationDays?: number      // 복용 기간 (일)
      withFood?: "before" | "after" | "none"
      suggestedTimes?: string[]  // 횟수 기반 추천 시간 ["08:00","13:00","20:00"]
      note?: string              // 특이사항
    }
  ]
  confidence: "high" | "medium" | "low"
  rawText?: string  // 디버그용 OCR 원문
}

Response 422:
{
  error: "약봉투 정보를 인식하지 못했습니다. 사진을 다시 찍거나 직접 입력해주세요."
}
```

#### Claude 프롬프트 설계

```
한국 약봉투 또는 의약품 포장 이미지에서 복약 정보를 추출해주세요.

다음 JSON 형식으로 정확하게 응답해주세요. 인식할 수 없는 필드는 null로 반환하세요.

{
  "results": [
    {
      "medicationName": "약 이름 (필수)",
      "dosageValue": 숫자 또는 null,
      "dosageUnit": "mg|정|캡슐|mL|g 중 하나 또는 null",
      "timesPerDay": 숫자 또는 null,
      "dosePerIntake": "1정 등 문자열 또는 null",
      "durationDays": 숫자 또는 null,
      "withFood": "before|after|none 중 하나 또는 null",
      "note": "특이사항 문자열 또는 null"
    }
  ]
}

이미지에서 약 정보를 전혀 찾을 수 없으면 { "results": [] }를 반환하세요.
JSON 외 다른 텍스트는 포함하지 마세요.
```

---

### 2-3. 클라이언트 구현

#### 신규 파일 구조

```
src/
├── features/
│   └── medicationScan/
│       ├── scanApi.ts         ← POST /ai/scan-medication API 호출
│       ├── scanUtils.ts       ← timesPerDay → suggestedTimes 변환 등
│       └── index.ts
└── app/
    └── scan/
        ├── ScanScreen.tsx     ← 카메라 실행, 이미지 선택
        ├── ScanLoadingScreen.tsx  ← 분석 중 로딩
        └── ScanResultScreen.tsx  ← 인식 결과 확인·수정
```

#### 복용 시간 자동 추천 로직 (`scanUtils.ts`)

```ts
// timesPerDay → 추천 시간 배열
function suggestTimes(timesPerDay: number): string[] {
  switch (timesPerDay) {
    case 1:  return ['08:00'];
    case 2:  return ['08:00', '20:00'];
    case 3:  return ['08:00', '13:00', '20:00'];
    case 4:  return ['08:00', '12:00', '18:00', '22:00'];
    default: return ['08:00'];
  }
}
```

#### 이미지 최적화 (`scanUtils.ts`)

```ts
// expo-image-manipulator로 리사이즈 후 base64 변환
import * as ImageManipulator from 'expo-image-manipulator';

async function prepareImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return result.base64!;
}
```

---

## 3. 화면 설계

### S-SCAN01: 스캔 진입점

홈 FAB 메뉴 또는 일정 추가 화면 상단에 "약봉투 스캔" 버튼 추가.

```
┌─────────────────────────────────┐
│  일정 추가                       │
│  ─────────────────────────────  │
│  [ 📷 약봉투 스캔하기 (자동 입력) ] │  ← 새 버튼
│  ─────────────────────────────  │
│  [ ✏️  직접 입력하기             ] │
└─────────────────────────────────┘
```

---

### S-SCAN02: 카메라 / 갤러리 선택

```
┌─────────────────────────────────┐
│  약봉투를 촬영해주세요            │
│                                  │
│  [  카메라로 촬영하기  ]          │
│  [ 갤러리에서 선택하기 ]          │
│                                  │
│  💡 봉투 전체가 나오도록 촬영하면  │
│     인식 정확도가 높아집니다        │
└─────────────────────────────────┘
```

---

### S-SCAN03: 분석 중 로딩

```
┌─────────────────────────────────┐
│                                  │
│         💊 분석 중...            │
│    약봉투 정보를 읽고 있어요       │
│         ●●●●●                   │
│                                  │
│  [  취소  ]                      │
└─────────────────────────────────┘
```

---

### S-SCAN04: 인식 결과 확인 및 수정

복수의 약이 인식된 경우 탭으로 전환.

```
┌─────────────────────────────────┐
│  인식 결과 확인                   │
│  [약1: 아목시실린] [약2: 타이레놀] │  ← 탭
│  ─────────────────────────────  │
│  약 이름: [아목시실린캡슐   ✎]   │
│  용량:    [500mg            ✎]   │
│  복용 시간: [08:00] [13:00] [20:00] │
│  복용 기간: [5일 (~ 06.06)  ✎]   │
│  식전/식후: [ 식전  ● 식후  ○ ]  │
│                                  │
│  [  이 약 건너뛰기  ]            │
│  ─────────────────────────────  │
│  [    2개 약 일정 만들기    ]     │
└─────────────────────────────────┘
```

---

### 실패/저신뢰도 처리

```
┌─────────────────────────────────┐
│  인식에 실패했어요               │
│                                  │
│  사진이 흐리거나 글씨가 작으면   │
│  인식이 어려울 수 있어요          │
│                                  │
│  [  다시 촬영하기  ]             │
│  [  직접 입력하기  ]             │
└─────────────────────────────────┘
```

---

## 4. 데이터 모델 변경

### 클라이언트 — 신규 타입

```ts
// src/domain/index.ts 추가
interface MedicationScanResult {
  medicationName: string;
  dosageValue?: number;
  dosageUnit?: string;
  timesPerDay?: number;
  dosePerIntake?: string;
  durationDays?: number;
  withFood?: 'before' | 'after' | 'none';
  suggestedTimes: string[];  // scanUtils가 timesPerDay로부터 계산
  note?: string;
}
```

### 서버 — 신규 패키지

```bash
cd server
npm install @anthropic-ai/sdk
```

### 서버 환경 변수 추가

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | 필수 | Anthropic API 키 |

---

## 5. 구현 순서

| 순서 | 작업 | 예상 소요 |
|------|------|-----------|
| 1 | 서버: `/ai/scan-medication` 엔드포인트 + Claude API 연동 | 1일 |
| 2 | 클라이언트: `scanApi.ts` + `scanUtils.ts` | 0.5일 |
| 3 | `ScanScreen.tsx` — 카메라/갤러리 연동 + 이미지 최적화 | 1일 |
| 4 | `ScanLoadingScreen.tsx` — 로딩 UX | 0.5일 |
| 5 | `ScanResultScreen.tsx` — 결과 확인·수정 + 일정 생성 연결 | 1.5일 |
| 6 | 홈 / 일정 추가 화면에 진입점 버튼 추가 | 0.5일 |
| 7 | 실기기 테스트 (다양한 약봉투 샘플) | 1일 |

**총 예상: 약 6일**

---

## 6. 완료 기준 (AC)

- [ ] 조제약 봉투 촬영 시 약 이름, 복용 횟수, 기간이 80% 이상 정확하게 인식
- [ ] 인식 결과는 반드시 사용자가 확인·수정 후 저장 (자동 저장 금지)
- [ ] 약이 복수 인식된 경우 탭으로 전환하며 각각 확인 가능
- [ ] API 오류 또는 인식 실패 시 수동 입력 화면으로 안내
- [ ] 이미지는 서버 전송 전 최대 1024px로 리사이즈
- [ ] 로그인하지 않은 상태에서도 스캔 기능 사용 가능 (서버 인증은 필요)
- [ ] 스캔 결과로 만든 일정은 기존 일정과 동일하게 알림·기록·통계에 반영
- [ ] 비용 제어: 하이쿠 모델 우선 사용, 1회 스캔 비용 $0.01 미만 목표

---

## 7. 주의 사항

- **의학적 정확성**: AI 인식 결과는 참고용이며 사용자가 반드시 확인해야 함. 앱 내 안내 문구 표시.
- **개인정보**: 약봉투에 환자명·주민번호 등이 포함될 수 있음. 이미지는 분석 후 서버에 저장하지 않음.
- **오프라인**: 스캔 기능은 인터넷 연결 필요. 오프라인 시 "인터넷 연결이 필요합니다" 안내.
- **이미지 크기**: Anthropic API 이미지 최대 크기 제한 준수 (5MB, base64 기준 ~6.7MB). 클라이언트에서 사전 리사이즈.
