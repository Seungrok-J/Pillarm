import { generateId } from '../../src/utils/uuid';

describe('generateId', () => {
  it('UUID 형식의 문자열을 반환한다', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('expo-crypto.randomUUID 를 사용한다 (mock 값 확인)', () => {
    const id = generateId();
    // expo-crypto mock 은 고정 값을 반환함
    expect(id).toBe('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
  });
});
