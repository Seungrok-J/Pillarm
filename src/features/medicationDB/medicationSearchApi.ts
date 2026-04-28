import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';

const DRBEASY_URL =
  'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';

export interface MedicationSearchResult {
  itemSeq:     string;
  itemName:    string;
  entpName:    string;
  dosageValue?: number;
  dosageUnit?:  string;
  efcyQesitm?: string;
  useMethodQesitm?: string;
  atpnQesitm?: string;
}

interface DrbEasyItem {
  ITEM_SEQ:            string;
  ITEM_NAME:           string;
  ENTP_NAME:           string;
  EFCY_QESITM?:        string;
  USE_METHOD_QESITM?:  string;
  ATPN_QESITM?:       string;
}

interface DrbEasyResponse {
  body?: {
    items?: DrbEasyItem[];
    totalCount?: number;
  };
}

function normalizeUnit(raw: string): string {
  switch (raw.toLowerCase()) {
    case 'mg':
    case '밀리그람':    return 'mg';
    case 'ml':
    case '밀리리터':    return 'mL';
    case 'mcg':
    case '마이크로그람': return 'mcg';
    case 'g':           return 'g';
    default:            return raw;
  }
}

function parseDosage(
  name: string,
): Pick<MedicationSearchResult, 'dosageValue' | 'dosageUnit'> {
  const m = name.match(
    /(\d+(?:\.\d+)?)\s*(mg|밀리그람|mL|밀리리터|mcg|마이크로그람|g)/,
  );
  if (!m) return {};
  return { dosageValue: parseFloat(m[1]), dosageUnit: normalizeUnit(m[2]) };
}

/**
 * 식품의약품안전처 e약은요 API로 약품명을 검색합니다.
 * 오프라인 시 빈 배열을 반환합니다 (토스트는 MedicationSearchInput에서 표시).
 * debounce 300ms는 MedicationSearchInput에서 lodash.debounce로 적용됩니다.
 */
export async function searchMedications(
  query: string,
): Promise<MedicationSearchResult[]> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) return [];

  const { data } = await axios.get<DrbEasyResponse>(DRBEASY_URL, {
    params: {
      serviceKey: process.env.EXPO_PUBLIC_MFDS_API_KEY ?? '',
      itemName:   query,
      type:       'json',
      numOfRows:  10,
      pageNo:     1,
    },
  });

  const items: DrbEasyItem[] = data?.body?.items ?? [];
  return items.map((item) => ({
    itemSeq:          item.ITEM_SEQ,
    itemName:         item.ITEM_NAME,
    entpName:         item.ENTP_NAME,
    efcyQesitm:       item.EFCY_QESITM,
    useMethodQesitm:  item.USE_METHOD_QESITM,
    atpnQesitm:       item.ATPN_QESITM,
    ...parseDosage(item.ITEM_NAME),
  }));
}
