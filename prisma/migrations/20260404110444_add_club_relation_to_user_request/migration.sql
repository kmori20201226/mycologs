-- AddForeignKey
ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
