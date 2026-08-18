import { PrismaClient } from "@prisma/client";
import { nextVoucherNumber } from "../src/services/voucherNumber";

const prisma = new PrismaClient();

async function main() {
  const jobCards = await prisma.jobCard.findMany({
    where: { jobNo: null },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${jobCards.length} job cards without jobNo`);

  for (const jc of jobCards) {
    const jobNo = await nextVoucherNumber("JOB");
    await prisma.jobCard.update({
      where: { id: jc.id },
      data: { jobNo },
    });
    console.log(`Updated ${jc.id} with ${jobNo}`);
  }

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
