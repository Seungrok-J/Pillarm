-- Medication: 앱 로컬 SQLite 의 Medication 을 서버에 미러링 (기기 이전·복원용)
CREATE TABLE "Medication" (
    "id"          TEXT             NOT NULL,
    "userId"      TEXT             NOT NULL,
    "name"        TEXT             NOT NULL,
    "dosageValue" DOUBLE PRECISION,
    "dosageUnit"  TEXT,
    "color"       TEXT,
    "isActive"    BOOLEAN          NOT NULL DEFAULT true,
    "createdAt"   TEXT             NOT NULL,
    "updatedAt"   TEXT             NOT NULL,
    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- Schedule: 앱 로컬 SQLite 의 Schedule 을 서버에 미러링
CREATE TABLE "Schedule" (
    "id"           TEXT      NOT NULL,
    "userId"       TEXT      NOT NULL,
    "medicationId" TEXT      NOT NULL,
    "scheduleType" TEXT      NOT NULL DEFAULT 'fixed',
    "startDate"    TEXT      NOT NULL,
    "endDate"      TEXT,
    "times"        TEXT[]    NOT NULL DEFAULT '{}',
    "daysOfWeek"   INTEGER[] NOT NULL DEFAULT '{}',
    "withFood"     TEXT      NOT NULL DEFAULT 'none',
    "graceMinutes" INTEGER   NOT NULL DEFAULT 120,
    "isActive"     BOOLEAN   NOT NULL DEFAULT true,
    "createdAt"    TEXT      NOT NULL,
    "updatedAt"    TEXT      NOT NULL,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- DoseEvent: 앱 로컬 SQLite 의 DoseEvent 를 서버에 미러링 (최근 90일)
CREATE TABLE "DoseEvent" (
    "id"           TEXT    NOT NULL,
    "userId"       TEXT    NOT NULL,
    "scheduleId"   TEXT    NOT NULL,
    "medicationId" TEXT    NOT NULL,
    "plannedAt"    TEXT    NOT NULL,
    "status"       TEXT    NOT NULL,
    "takenAt"      TEXT,
    "snoozeCount"  INTEGER NOT NULL DEFAULT 0,
    "source"       TEXT    NOT NULL DEFAULT 'notification',
    "note"         TEXT,
    "createdAt"    TEXT    NOT NULL,
    "updatedAt"    TEXT    NOT NULL,
    CONSTRAINT "DoseEvent_pkey" PRIMARY KEY ("id")
);

-- Index on userId + updatedAt for efficient incremental sync queries
CREATE INDEX "Medication_userId_updatedAt_idx" ON "Medication"("userId", "updatedAt");
CREATE INDEX "Schedule_userId_updatedAt_idx"   ON "Schedule"("userId", "updatedAt");
CREATE INDEX "DoseEvent_userId_updatedAt_idx"  ON "DoseEvent"("userId", "updatedAt");
CREATE INDEX "DoseEvent_userId_plannedAt_idx"  ON "DoseEvent"("userId", "plannedAt");

-- Foreign keys
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
