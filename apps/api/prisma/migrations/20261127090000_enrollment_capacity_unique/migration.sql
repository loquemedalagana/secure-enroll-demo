-- DropIndex
-- (userId, courseId) 유일 인덱스가 userId로 찾는 조회에도 쓰이므로 userId만의 인덱스는 뺀다.
DROP INDEX "enrollments_userId_idx";

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 30;

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");
