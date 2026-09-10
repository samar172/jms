-- CreateTable
CREATE TABLE "_JobCardLinks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_JobCardLinks_AB_unique" ON "_JobCardLinks"("A", "B");

-- CreateIndex
CREATE INDEX "_JobCardLinks_B_index" ON "_JobCardLinks"("B");

-- AddForeignKey
ALTER TABLE "_JobCardLinks" ADD CONSTRAINT "_JobCardLinks_A_fkey" FOREIGN KEY ("A") REFERENCES "ProdJobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCardLinks" ADD CONSTRAINT "_JobCardLinks_B_fkey" FOREIGN KEY ("B") REFERENCES "ProdJobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

