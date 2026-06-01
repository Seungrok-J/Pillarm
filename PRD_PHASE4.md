# PRD Phase 4 — 스마트 복용 도우미

> **전제 조건:** Phase 3 배포 완료 후 진행한다.  
> **목표 (Feature 1):** 카메라로 조제약 봉투를 촬영하면 AI가 복용 정보를 자동 인식하여 일정 초안을 생성한다.  
> **목표 (Feature 2):** 홈 화면에서 영양제별 올바른 복용 방법·주의사항·출처를 즉시 조회할 수 있는 가이드를 제공한다.

---

---

# Feature 1 — 약봉투 촬영 자동 일정 생성

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

---

# Feature 2 — 영양제 복용 가이드

## 1. 기능 개요

영양제마다 최적 복용 시간과 주의사항이 다르지만 대부분의 사람이 이를 모르거나 잘못 복용한다. 홈 화면에서 버튼 하나로 주요 영양제의 올바른 복용법·상호작용·근거 출처를 즉시 확인할 수 있는 가이드를 제공한다.

### 핵심 흐름

```
홈 화면 상단 [ 영양제 가이드 📖 ] 버튼
  → 가이드 목록 화면 (카테고리 탭 + 검색)
  → 영양제 상세 화면
      - 권장 복용 시간 (식전/식후 N분, 공복 등)
      - 함께 복용하면 좋은 것
      - 함께 복용하면 안 좋은 것
      - 상세 설명
      - 출처 (기관명 + 링크)
```

### 홈 화면 진입점 위치

```
┌─────────────────────────────────┐
│  오늘 6월 1일 월요일              │
│  ┌──────────┐  ┌─────────────┐  │
│  │ 일정 관리 │  │ 영양제 가이드│  │  ← 나란히 배치
│  └──────────┘  └─────────────┘  │
│                                  │
│  ● 08:00  혈압약        [복용]   │
│  ...                             │
└─────────────────────────────────┘
```

---

## 2. 데이터 설계

### 2-1. 타입 정의

```ts
// src/features/supplementGuide/types.ts

type SupplementCategory =
  | 'vitamin_fat'    // 지용성 비타민 (A·D·E·K)
  | 'vitamin_water'  // 수용성 비타민 (B군·C)
  | 'mineral'        // 미네랄 (칼슘·철분·마그네슘·아연)
  | 'omega'          // 오메가지방산
  | 'probiotic'      // 프로바이오틱스
  | 'other';         // 루테인·콜라겐·코엔자임Q10 등

type TimingType =
  | 'after_meal'      // 식후
  | 'before_meal'     // 식전
  | 'with_meal'       // 식사 중
  | 'empty_stomach'   // 공복
  | 'bedtime'         // 취침 전
  | 'anytime';        // 무관

interface SupplementSource {
  name: string;         // 출처 기관명
  url:  string;         // 공식 URL
  note?: string;        // 보충 설명
}

interface SupplementGuide {
  id:       string;
  name:     string;       // 한글명 (예: 종합비타민)
  nameEn?:  string;       // 영문명 (예: Multivitamin)
  category: SupplementCategory;
  emoji:    string;       // 목록 아이콘

  timing: {
    type:         TimingType;
    minutesAfter?: number;   // 식후 N분 후
    minutesBefore?: number;  // 식전 N분 전
    detail:       string;    // 사람이 읽는 설명 (예: "식후 30분 이내")
  };

  goodWith:   string[];  // 함께 복용 시 효과 UP
  avoidWith:  string[];  // 함께 복용 시 흡수 방해 또는 부작용
  summary:    string;    // 1줄 요약
  details:    string;    // 3~5줄 상세 설명
  sources:    SupplementSource[];
}
```

### 2-2. 데이터 저장 방식

- **번들 JSON** (`src/features/supplementGuide/data/supplements.json`): 앱에 포함하여 오프라인 완전 동작
- **서버 업데이트** (선택): `/supplement-guide/list` API로 최신 데이터 덮어쓰기. 없으면 번들 사용.
- 데이터 버전 필드(`version: string`)로 앱 재시작 시 최신 여부 확인

### 2-3. 수록 영양제 목록 (초기 20종)

| 영양제 | 카테고리 | 권장 복용 시기 | 핵심 주의사항 |
|--------|----------|--------------|--------------|
| 종합비타민 | vitamin_fat | 식후 30분 | 공복 복용 시 메스꺼움 |
| 비타민 A | vitamin_fat | 식후 | 과다복용 독성 주의 (지용성) |
| 비타민 D | vitamin_fat | 식후 (지방 있는 식사) | 마그네슘과 함께하면 활성화 촉진 |
| 비타민 E | vitamin_fat | 식후 | 혈액희석제 복용자 주의 |
| 비타민 K | vitamin_fat | 식후 | 와파린 복용자 주의 — 반드시 의사 상담 |
| 비타민 C | vitamin_water | 식후 | 철분과 함께하면 흡수 증가, 고용량 주의 |
| 비타민 B1 (티아민) | vitamin_water | 식사 중 또는 식후 | 커피·차와 함께하면 흡수 감소 |
| 비타민 B12 | vitamin_water | 공복 또는 식후 | 칼슘과 함께하면 흡수 증가 |
| 엽산 (B9) | vitamin_water | 식후 | 임신 초기 특히 중요 |
| 나이아신 (B3) | vitamin_water | 식사 중 | 공복 복용 시 홍조·가려움 |
| 칼슘 | mineral | 식후 | 철분과 동시 복용 금지, 소량씩 분할 복용 권장 |
| 철분 | mineral | 공복 또는 식전 30분 | 비타민 C와 함께하면 흡수 UP, 칼슘·커피·우유 금지 |
| 마그네슘 | mineral | 저녁 식후 또는 취침 전 | 고용량 시 설사 가능 |
| 아연 | mineral | 식후 | 공복 복용 시 메스꺼움, 구리 흡수 방해 |
| 오메가-3 | omega | 식사 중 또는 직후 | 혈액희석제 복용자 주의 |
| 프로바이오틱스 | probiotic | 공복 (식전 30분) 또는 취침 전 | 항생제와 2시간 이상 간격 유지 |
| 루테인 | other | 식후 (지용성) | 과다복용 시 피부 황변 가능 |
| 콜라겐 | other | 공복 또는 식전 30분 | 비타민 C와 함께하면 합성 촉진 |
| 코엔자임 Q10 | other | 식후 (지용성) | 스타틴 계열 약 복용자에게 권장 |
| 밀크씨슬 | other | 식전 30분 | 간 보호 작용, 일부 약물 대사 영향 가능 |

### 2-4. 출처 기관 (데이터 근거)

| 기관 | URL | 특징 |
|------|-----|------|
| NIH Office of Dietary Supplements | https://ods.od.nih.gov | 미국 국립보건원 영양제 팩트시트 (한국어 없음) |
| 식품의약품안전처 (MFDS) | https://www.mfds.go.kr | 국내 공식 의약품·건강기능식품 정보 |
| 국민건강보험공단 건강정보 | https://www.nhis.or.kr | 한국어 건강 가이드 |
| 서울아산병원 건강정보 | https://www.amc.seoul.kr/asan/healthinfo | 국내 병원 신뢰도 높은 건강 정보 |
| Mayo Clinic | https://www.mayoclinic.org | 미국 메이요 클리닉 (영문) |

---

## 3. 화면 설계

### S-GUIDE01: 가이드 목록

```
┌─────────────────────────────────────┐
│  영양제 복용 가이드                   │
│  🔍 [검색...                      ] │
│                                      │
│  [전체] [비타민] [미네랄] [오메가] [기타] │  ← 탭
│                                      │
│  💊 종합비타민                        │
│     식후 30분 이내 · 공복 복용 주의    │  ← 부제
│                                      │
│  ☀️ 비타민 D                          │
│     지방이 있는 식사 후 · 마그네슘과 시너지 │
│                                      │
│  🩸 철분                              │
│     공복 복용 권장 · 칼슘과 분리 필수   │
│  ...                                 │
└─────────────────────────────────────┘
```

### S-GUIDE02: 영양제 상세

```
┌─────────────────────────────────────┐
│  ← 철분 (Iron)                       │
│  ─────────────────────────────────  │
│                                      │
│  ⏰ 권장 복용 시기                    │
│  ┌───────────────────────────────┐  │
│  │  공복 또는 식전 30분          │  │
│  │  위산이 있을 때 흡수율 최대화  │  │
│  └───────────────────────────────┘  │
│                                      │
│  ✅ 함께 복용하면 좋아요              │
│  · 비타민 C — 비헴철 흡수율 2~3배 향상 │
│  · 공복에 물 한 잔과 함께             │
│                                      │
│  ❌ 함께 복용하면 안 돼요             │
│  · 칼슘 — 흡수 경쟁으로 둘 다 감소   │
│  · 커피, 홍차 — 탄닌이 흡수 방해     │
│  · 우유, 유제품                       │
│  · 제산제, 탄산음료                   │
│                                      │
│  📝 상세 설명                        │
│  철분은 적혈구 헤모글로빈을 구성하는  │
│  필수 미네랄입니다. 두 종류(헴철/비헴│
│  철)가 있으며 흡수율이 다릅니다...   │
│                                      │
│  📚 출처                             │
│  · NIH 영양제 팩트시트 →             │
│  · 식품의약품안전처 →                │
│  · 서울아산병원 건강정보 →           │
│                                      │
│  ⚠️ 이 정보는 일반적인 가이드이며    │
│  개인 상황에 따라 다를 수 있습니다.  │
│  의약품 복용 중이라면 의사·약사와    │
│  상담하세요.                          │
└─────────────────────────────────────┘
```

---

## 4. 클라이언트 구현

### 파일 구조

```
src/
├── features/
│   └── supplementGuide/
│       ├── types.ts                  ← 타입 정의
│       ├── supplementGuideApi.ts     ← 서버에서 최신 데이터 fetch (선택)
│       ├── useSupplementGuide.ts     ← 데이터 로드 훅 (번들 우선, 서버 보완)
│       └── data/
│           └── supplements.json      ← 번들 데이터 (오프라인 기본값)
└── app/
    └── supplementGuide/
        ├── GuideListScreen.tsx       ← 목록 + 카테고리 탭 + 검색
        └── GuideDetailScreen.tsx     ← 상세 + 출처 링크
```

### 데이터 로드 훅 (`useSupplementGuide.ts`)

```ts
export function useSupplementGuide() {
  const [data, setData] = useState<SupplementGuide[]>(
    bundledData as SupplementGuide[],  // 즉시 번들 데이터로 렌더
  );

  useEffect(() => {
    // 서버에서 최신 데이터 시도 (실패해도 번들 데이터 유지)
    fetchLatestGuideData()
      .then((latest) => { if (latest.length) setData(latest); })
      .catch(() => {});
  }, []);

  return data;
}
```

### 홈 화면 버튼 (`HomeScreen.tsx` 수정)

```tsx
{/* 홈 상단 바로가기 버튼 영역 */}
<View style={styles.shortcutRow}>
  <TouchableOpacity
    style={styles.shortcutBtn}
    onPress={() => navigation.navigate('ScheduleManage')}
  >
    <Text style={styles.shortcutText}>📋 일정 관리</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.shortcutBtn, styles.shortcutBtnGuide]}
    onPress={() => navigation.navigate('GuideList')}
  >
    <Text style={styles.shortcutText}>📖 영양제 가이드</Text>
  </TouchableOpacity>
</View>
```

---

## 5. 서버 API (선택 — 데이터 업데이트용)

```
GET /supplement-guide/list
Response: { version: string; items: SupplementGuide[] }
```

데이터 업데이트가 필요할 때(잘못된 정보 수정, 신규 영양제 추가) 앱 배포 없이 서버에서 JSON을 교체하면 앱이 자동으로 최신 데이터를 받습니다.

---

## 6. 구현 순서 (Feature 1 + 2 통합)

| 순서 | 작업 | Feature | 예상 소요 |
|------|------|---------|-----------|
| 1 | 영양제 JSON 데이터 작성 (20종, 출처 포함) | 2 | 1.5일 |
| 2 | `GuideListScreen` + `GuideDetailScreen` | 2 | 1.5일 |
| 3 | 홈 화면 바로가기 버튼 추가 | 2 | 0.5일 |
| 4 | 서버: `GET /supplement-guide/list` (선택) | 2 | 0.5일 |
| 5 | 서버: `POST /ai/scan-medication` + Claude API | 1 | 1일 |
| 6 | `ScanScreen` + `ScanLoadingScreen` + `ScanResultScreen` | 1 | 2.5일 |
| 7 | 홈 / 일정 추가 스캔 진입점 버튼 추가 | 1 | 0.5일 |
| 8 | 실기기 테스트 (영양제 가이드 + 약봉투 스캔) | 1+2 | 1일 |

**총 예상: 약 9일**

---

## 7. 완료 기준 (Feature 2)

- [ ] 주요 영양제 20종 이상 수록 (카테고리·복용 시기·상호작용·출처 포함)
- [ ] 모든 데이터 항목에 1개 이상의 공식 출처 링크 포함
- [ ] 출처 링크 탭 시 기기 브라우저로 이동
- [ ] 카테고리 탭 필터링 동작
- [ ] 검색 (이름 기준, 실시간 필터)
- [ ] 오프라인에서도 번들 데이터로 완전 동작
- [ ] 상세 화면 하단에 "이 정보는 일반적인 가이드이며 의사·약사 상담을 권장합니다" 면책 문구 표시
- [ ] 홈 화면 일정 관리 버튼 옆에 가이드 버튼 노출

---

## 8. 주의 사항 (Feature 1 + 2 공통)

- **의학적 정확성**: 모든 정보는 공신력 있는 출처(NIH, 식약처, 대학병원)만 사용. 분기별 내용 검토 필요.
- **면책 고지**: "의료 행위를 대체하지 않음" 문구를 상세 화면마다 표시.
- **개인정보**: 약봉투 이미지는 분석 후 서버에 저장하지 않음.
- **오프라인**: 가이드는 오프라인 완전 동작. 스캔은 인터넷 필요.
- **이미지 크기**: Anthropic API 제한(5MB) 준수, 클라이언트에서 사전 리사이즈.
