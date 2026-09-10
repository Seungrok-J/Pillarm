import { useWindowDimensions } from 'react-native';
import { useFontScale } from './fontScale';

/**
 * 가로 공간이 빠듯한 상태인지 알려준다.
 *
 * 두 가지 원인이 같은 증상(글자 잘림·줄바꿈·요소 겹침)을 만들기 때문에 하나로 묶는다.
 *   1. 글씨 크기를 '크게'·'아주 크게' 로 올린 경우 — 글자만 커지고 컨테이너는 그대로다
 *   2. 화면이 좁은 기기 — 폴더폰(480×800 hdpi)은 320dp 밖에 안 된다
 *
 * 이 값이 참이면 각 화면은 장식(아이콘 등)을 접고, 한 줄에 욱여넣던 것을 풀어서
 * 세로로 배치한다. 판정 기준을 화면마다 흩어놓으면 서로 어긋나므로 여기서만 정의한다.
 */

/** 이 폭 아래로는 한 줄 배치가 무너지기 시작한다(폴더폰 320dp < 360dp) */
export const NARROW_WIDTH_DP = 360;

export function useCompactLayout(): boolean {
  const fontScale = useFontScale();
  const { width } = useWindowDimensions();
  return fontScale > 1 || width < NARROW_WIDTH_DP;
}
