-- CreateTable
CREATE TABLE "user_requests" (
    "id" SERIAL NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "club_id" INTEGER,
    "message" TEXT,
    "reply_message" TEXT,
    "replier_id" INTEGER,
    "accepted" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replied_at" TIMESTAMP(3),

    CONSTRAINT "user_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_replier_id_fkey" FOREIGN KEY ("replier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
