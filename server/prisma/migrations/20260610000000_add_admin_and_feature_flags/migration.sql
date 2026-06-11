-- AlterTable: User에 isAdmin 컬럼 추가
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: FeatureFlag
CREATE TABLE "FeatureFlag" (
    "key"         TEXT NOT NULL,
    "enabled"     BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);
