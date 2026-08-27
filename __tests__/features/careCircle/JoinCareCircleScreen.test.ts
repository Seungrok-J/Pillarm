/**
 * extractInviteCode 단위 테스트
 *
 * 실제 버그: CareCircleScreen의 InviteModal은 QR을
 * `https://pillarm.app/join?code=XXXXXX` (쿼리 파라미터) 형식으로 생성하는데,
 * 예전 파서는 `/join/XXXXXX` (경로) 형식만 인식해 실제 초대 QR을 스캔하면
 * 항상 "인식 실패"가 떴다. 쿼리·경로·코드 원문 세 가지 형식을 모두 지원하는지 검증한다.
 */

import { extractInviteCode } from '../../../src/features/careCircle/JoinCareCircleScreen';

describe('extractInviteCode', () => {
  it('쿼리 파라미터 형식(실제 InviteModal이 생성하는 QR 형식)에서 코드를 추출한다', () => {
    expect(extractInviteCode('https://pillarm.app/join?code=VC56TD')).toBe('VC56TD');
  });

  it('쿼리 파라미터가 소문자여도 대문자로 변환한다', () => {
    expect(extractInviteCode('https://pillarm.app/join?code=vc56td')).toBe('VC56TD');
  });

  it('다른 쿼리 파라미터와 함께 있어도 code를 찾는다', () => {
    expect(extractInviteCode('https://pillarm.app/join?utm=share&code=VC56TD')).toBe('VC56TD');
  });

  it('딥링크 경로 형식(pillarm://join/XXXXXX)도 지원한다', () => {
    expect(extractInviteCode('pillarm://join/VC56TD')).toBe('VC56TD');
  });

  it('코드 원문만 있어도 인식한다', () => {
    expect(extractInviteCode('VC56TD')).toBe('VC56TD');
  });

  it('앞뒤 공백이 있는 코드 원문도 인식한다', () => {
    expect(extractInviteCode('  VC56TD  ')).toBe('VC56TD');
  });

  it('유효하지 않은 QR 내용은 null을 반환한다', () => {
    expect(extractInviteCode('https://pillarm.app/join?code=TOOLONGCODE')).toBeNull();
    expect(extractInviteCode('https://example.com')).toBeNull();
    expect(extractInviteCode('')).toBeNull();
  });
});
