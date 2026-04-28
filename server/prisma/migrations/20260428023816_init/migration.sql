-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('admin', 'viewer', 'notifyOnly');

-- CreateEnum
CREATE TYPE "ShareScope" AS ENUM ('all', 'specificMedication', 'specificSchedule');

-- CreateEnum
CREATE TYPE "NotificationPolicy" AS ENUM ('realtime', 'dailySummary');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareCircle" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareCircle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareMember" (
    "id" TEXT NOT NULL,
    "careCircleId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharePolicy" (
    "id" TEXT NOT NULL,
    "careCircleId" TEXT NOT NULL,
    "shareScope" "ShareScope" NOT NULL DEFAULT 'all',
    "allowedFields" TEXT[],
    "notificationPolicy" "NotificationPolicy" NOT NULL DEFAULT 'realtime',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoseEventSnapshot" (
    "id" TEXT NOT NULL,
    "careCircleId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoseEventSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "careCircleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CareMember_careCircleId_memberUserId_key" ON "CareMember"("careCircleId", "memberUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DoseEventSnapshot_careCircleId_patientId_date_key" ON "DoseEventSnapshot"("careCircleId", "patientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- AddForeignKey
ALTER TABLE "CareCircle" ADD CONSTRAINT "CareCircle_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareMember" ADD CONSTRAINT "CareMember_careCircleId_fkey" FOREIGN KEY ("careCircleId") REFERENCES "CareCircle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareMember" ADD CONSTRAINT "CareMember_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePolicy" ADD CONSTRAINT "SharePolicy_careCircleId_fkey" FOREIGN KEY ("careCircleId") REFERENCES "CareCircle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEventSnapshot" ADD CONSTRAINT "DoseEventSnapshot_careCircleId_fkey" FOREIGN KEY ("careCircleId") REFERENCES "CareCircle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEventSnapshot" ADD CONSTRAINT "DoseEventSnapshot_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_careCircleId_fkey" FOREIGN KEY ("careCircleId") REFERENCES "CareCircle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
