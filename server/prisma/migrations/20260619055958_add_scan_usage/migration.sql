-- CreateTable
CREATE TABLE "ScanUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScanUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanUsage_userId_date_key" ON "ScanUsage"("userId", "date");

-- AddForeignKey
ALTER TABLE "ScanUsage" ADD CONSTRAINT "ScanUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
