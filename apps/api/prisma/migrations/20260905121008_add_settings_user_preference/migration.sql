-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateTable
CREATE TABLE "user_preference" (
    "userId" TEXT NOT NULL,
    "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
