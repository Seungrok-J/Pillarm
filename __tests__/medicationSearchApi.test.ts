// Unit tests for medicationSearchApi — axios + NetInfo are fully mocked.
// jest.mock calls are hoisted above imports by Jest, so factories must be self-contained.

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { searchMedications } from '../src/features/medicationDB/';
import type { MedicationSearchResult } from '../src/features/medicationDB/';

const mockGet   = axios.get   as jest.MockedFunction<typeof axios.get>;
const mockFetch = NetInfo.fetch as jest.MockedFunction<typeof NetInfo.fetch>;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

const ONLINE  = { isConnected: true,  isInternetReachable: true  } as any;
const OFFLINE = { isConnected: false, isInternetReachable: false } as any;

interface RawItem {
  ITEM_SEQ:           string;
  ITEM_NAME:          string;
  ENTP_NAME:          string;
  EFCY_QESITM?:       string;
  USE_METHOD_QESITM?: string;
  ATPN_QESITM?:      string;
}

function makeItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    ITEM_SEQ:          '200911634',
    ITEM_NAME:         '이부프로펜정400mg',
    ENTP_NAME:         '한국파마',
    EFCY_QESITM:       '해열, 진통, 소염',
    USE_METHOD_QESITM: '1회 1정, 1일 3회 식후 복용',
    ATPN_QESITM:       '위장 장애가 있을 수 있음',
    ...overrides,
  };
}

function apiResponse(items: RawItem[]) {
  return { data: { body: { items } } };
}

// ── 테스트 ─────────────────────────────────────────────────────────────────────

describe('searchMedications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(ONLINE);
  });

  // ── 오프라인 ──────────────────────────────────────────────────────────────

  describe('오프라인', () => {
    it('isConnected false 이면 빈 배열 반환', async () => {
      mockFetch.mockResolvedValue(OFFLINE);
      const result = await searchMedications('이부');
      expect(result).toEqual([]);
    });

    it('오프라인이면 axios를 호출하지 않는다', async () => {
      mockFetch.mockResolvedValue(OFFLINE);
      await searchMedications('이부');
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  // ── API 호출 ──────────────────────────────────────────────────────────────

  describe('API 호출', () => {
    it('e약은요 엔드포인트를 호출한다', async () => {
      mockGet.mockResolvedValue(apiResponse([]));
      await searchMedications('이부프로펜');
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('getDrbEasyDrugList'),
        expect.any(Object),
      );
    });

    it('itemName 파라미터에 query를 그대로 전달한다', async () => {
      mockGet.mockResolvedValue(apiResponse([]));
      await searchMedications('아목시실린');
      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ itemName: '아목시실린', numOfRows: 10 }),
        }),
      );
    });

    it('body.items 가 없으면 빈 배열 반환', async () => {
      mockGet.mockResolvedValue({ data: { body: {} } });
      const result = await searchMedications('없는약');
      expect(result).toEqual([]);
    });

    it('body 자체가 없으면 빈 배열 반환', async () => {
      mockGet.mockResolvedValue({ data: {} });
      const result = await searchMedications('없는약');
      expect(result).toEqual([]);
    });

    it('axios 에러를 그대로 throw 한다', async () => {
      mockGet.mockRejectedValue(new Error('Network Error'));
      await expect(searchMedications('이부')).rejects.toThrow('Network Error');
    });
  });

  // ── 응답 매핑 ─────────────────────────────────────────────────────────────

  describe('응답 매핑', () => {
    it('itemSeq / itemName / entpName 을 올바르게 매핑한다', async () => {
      mockGet.mockResolvedValue(apiResponse([makeItem()]));
      const [r] = await searchMedications('이부');
      expect(r.itemSeq).toBe('200911634');
      expect(r.itemName).toBe('이부프로펜정400mg');
      expect(r.entpName).toBe('한국파마');
    });

    it('efcyQesitm / useMethodQesitm / atpnQesitm 을 올바르게 매핑한다', async () => {
      mockGet.mockResolvedValue(apiResponse([makeItem()]));
      const [r] = await searchMedications('이부');
      expect(r.efcyQesitm).toBe('해열, 진통, 소염');
      expect(r.useMethodQesitm).toBe('1회 1정, 1일 3회 식후 복용');
      expect(r.atpnQesitm).toBe('위장 장애가 있을 수 있음');
    });

    it('이름에서 mg 용량을 파싱한다', async () => {
      mockGet.mockResolvedValue(
        apiResponse([makeItem({ ITEM_NAME: '아목시실린캡슐250mg' })]),
      );
      const [r] = await searchMedications('아목');
      expect(r.dosageValue).toBe(250);
      expect(r.dosageUnit).toBe('mg');
    });

    it('한글 단위 "밀리그람"을 "mg"로 정규화한다', async () => {
      mockGet.mockResolvedValue(
        apiResponse([makeItem({ ITEM_NAME: '아스피린정100밀리그람' })]),
      );
      const [r] = await searchMedications('아스');
      expect(r.dosageValue).toBe(100);
      expect(r.dosageUnit).toBe('mg');
    });

    it('mL 단위를 파싱한다', async () => {
      mockGet.mockResolvedValue(
        apiResponse([makeItem({ ITEM_NAME: '시럽제5mL' })]),
      );
      const [r] = await searchMedications('시럽');
      expect(r.dosageValue).toBe(5);
      expect(r.dosageUnit).toBe('mL');
    });

    it('이름에 용량 정보가 없으면 dosageValue/dosageUnit 이 undefined', async () => {
      mockGet.mockResolvedValue(
        apiResponse([makeItem({ ITEM_NAME: '혈압약정' })]),
      );
      const [r] = await searchMedications('혈압');
      expect(r.dosageValue).toBeUndefined();
      expect(r.dosageUnit).toBeUndefined();
    });

    it('여러 항목을 순서대로 반환한다', async () => {
      mockGet.mockResolvedValue(
        apiResponse([
          makeItem({ ITEM_SEQ: '1', ITEM_NAME: '약A100mg' }),
          makeItem({ ITEM_SEQ: '2', ITEM_NAME: '약B200mg' }),
          makeItem({ ITEM_SEQ: '3', ITEM_NAME: '약C' }),
        ]),
      );
      const results: MedicationSearchResult[] = await searchMedications('약');
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.itemSeq)).toEqual(['1', '2', '3']);
      expect(results[0].dosageValue).toBe(100);
      expect(results[2].dosageValue).toBeUndefined();
    });
  });
});
