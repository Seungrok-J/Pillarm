/**
 * useMedicationStore 단위 테스트
 * fetch / add / update / delete + 각 에러/롤백 케이스
 */

jest.mock('../../src/db', () => ({
  getAllMedications: jest.fn(),
  upsertMedication: jest.fn().mockResolvedValue(undefined),
  deleteMedication: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/notifications', () => ({
  cancelForSchedule: jest.fn().mockResolvedValue(undefined),
}));

import * as db from '../../src/db';
import { useMedicationStore } from '../../src/store';
import type { Medication } from '../../src/domain';

const mockGetAll = db.getAllMedications as jest.Mock;
const mockUpsert = db.upsertMedication as jest.Mock;
const mockDelete = db.deleteMedication as jest.Mock;

function makeMed(id = 'med-1'): Medication {
  return {
    id,
    name: `약 ${id}`,
    isActive: true,
    createdAt: '2026-04-23T00:00:00Z',
    updatedAt: '2026-04-23T00:00:00Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useMedicationStore.setState({ medications: [], isLoading: false, error: null });
});

// ── fetchMedications ──────────────────────────────────────────────────────────

describe('fetchMedications', () => {
  it('DB 에서 약 목록을 가져와 상태를 갱신한다', async () => {
    const meds = [makeMed('m-1'), makeMed('m-2')];
    mockGetAll.mockResolvedValue(meds);

    await useMedicationStore.getState().fetchMedications();

    expect(useMedicationStore.getState().medications).toEqual(meds);
    expect(useMedicationStore.getState().isLoading).toBe(false);
  });

  it('DB 오류 시 error 상태를 설정한다', async () => {
    mockGetAll.mockRejectedValue(new Error('DB error'));

    await useMedicationStore.getState().fetchMedications();

    expect(useMedicationStore.getState().error).toBe('DB error');
    expect(useMedicationStore.getState().isLoading).toBe(false);
  });
});

// ── addMedication ─────────────────────────────────────────────────────────────

describe('addMedication', () => {
  it('upsertMedication 호출 후 목록에 추가한다', async () => {
    const med = makeMed();

    await useMedicationStore.getState().addMedication(med);

    expect(mockUpsert).toHaveBeenCalledWith(med);
    expect(useMedicationStore.getState().medications).toContainEqual(med);
  });

  it('DB 오류 시 error 를 설정하고 예외를 re-throw 한다', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('insert error'));

    await expect(useMedicationStore.getState().addMedication(makeMed())).rejects.toThrow(
      'insert error',
    );
    expect(useMedicationStore.getState().error).toBe('insert error');
  });
});

// ── updateMedication ──────────────────────────────────────────────────────────

describe('updateMedication', () => {
  const original = makeMed();
  const updated = { ...original, name: '수정된 약' };

  beforeEach(() => {
    useMedicationStore.setState({ medications: [original] });
  });

  it('낙관적 업데이트 후 upsertMedication 을 호출한다', async () => {
    await useMedicationStore.getState().updateMedication(updated);

    expect(useMedicationStore.getState().medications[0]?.name).toBe('수정된 약');
    expect(mockUpsert).toHaveBeenCalledWith(updated);
  });

  it('DB 오류 시 이전 목록으로 롤백한다', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('update fail'));

    await expect(useMedicationStore.getState().updateMedication(updated)).rejects.toThrow(
      'update fail',
    );
    expect(useMedicationStore.getState().medications[0]?.name).toBe(original.name);
  });
});

// ── deleteMedication ──────────────────────────────────────────────────────────

describe('deleteMedication', () => {
  const med = makeMed();

  beforeEach(() => {
    useMedicationStore.setState({ medications: [med] });
  });

  it('낙관적 삭제 후 deleteMedication DB 함수를 호출한다', async () => {
    await useMedicationStore.getState().deleteMedication('med-1');

    expect(useMedicationStore.getState().medications).toHaveLength(0);
    expect(mockDelete).toHaveBeenCalledWith('med-1');
  });

  it('DB 오류 시 목록을 복원한다', async () => {
    mockDelete.mockRejectedValueOnce(new Error('delete fail'));

    await expect(useMedicationStore.getState().deleteMedication('med-1')).rejects.toThrow(
      'delete fail',
    );
    expect(useMedicationStore.getState().medications).toHaveLength(1);
  });
});
