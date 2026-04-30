-- AlterTable
ALTER TABLE "CareMember" ADD COLUMN     "nickname" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT,
ADD COLUMN     "provider" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;
