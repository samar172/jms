import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password@123", 10);

  const users = await Promise.all(
    [
      { email: "admin@jms.local", name: "Owner Admin", role: "SUPER_ADMIN" as const },
      { email: "manager@jms.local", name: "Manoj Manager", role: "MANAGER" as const },
      { email: "costing@jms.local", name: "Priya Costing", role: "COSTING" as const },
      { email: "store@jms.local", name: "Store Keeper", role: "STORE" as const },
      { email: "production@jms.local", name: "Production Staff", role: "PRODUCTION" as const },
      { email: "sales@jms.local", name: "Sales Desk", role: "SALES" as const },
      { email: "auditor@jms.local", name: "Read Only Auditor", role: "AUDITOR" as const },
    ].map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        create: { ...u, passwordHash },
        update: {},
      })
    )
  );
  const admin = users[0];

  const karats = await Promise.all(
    [
      { code: "24K", purityFactor: 1.0 },
      { code: "22K", purityFactor: 0.9166 },
      { code: "18K", purityFactor: 0.75 },
      { code: "14K", purityFactor: 0.585 },
    ].map((k) => prisma.karat.upsert({ where: { code: k.code }, create: k, update: k }))
  );
  const karat18k = karats.find((k) => k.code === "18K")!;

  const categoryDefs = [
    { name: "Necklace", code: "NK", subs: ["Choker", "Rani Haar", "Long Haar", "Mangalsutra", "Collar"] },
    { name: "Ring", code: "RG", subs: ["Solitaire", "Band", "Cocktail"] },
    { name: "Earring", code: "ER", subs: ["Stud", "Jhumka", "Chandbali"] },
    { name: "Bangle / Kada", code: "KD", subs: ["Plain Kada", "Polki Kada"] },
    { name: "Pendant", code: "PD", subs: ["Solitaire Pendant", "Set Pendant"] },
    { name: "Bracelet", code: "BR", subs: ["Tennis", "Charm"] },
    { name: "Nose Pin", code: "NP", subs: ["Stud", "Hoop"] },
    { name: "Anklet", code: "AK", subs: ["Chain", "Beaded"] },
  ];
  let necklaceCategory;
  for (const c of categoryDefs) {
    const category = await prisma.category.upsert({
      where: { code: c.code },
      create: { name: c.name, code: c.code },
      update: {},
    });
    if (c.code === "NK") necklaceCategory = category;
    for (const subName of c.subs) {
      await prisma.subcategory.upsert({
        where: { categoryId_name: { categoryId: category.id, name: subName } },
        create: { categoryId: category.id, name: subName },
        update: {},
      });
    }
  }
  const chokerSub = await prisma.subcategory.findFirstOrThrow({
    where: { categoryId: necklaceCategory!.id, name: "Choker" },
  });

  await Promise.all(
    [
      { name: "Polki", category: "POLKI" as const, defaultRatePerCarat: 4000 },
      { name: "Ruby", category: "COLOURED_STONE" as const, defaultRatePerCarat: 1500 },
      { name: "Emerald", category: "COLOURED_STONE" as const, defaultRatePerCarat: 1800 },
      { name: "Sapphire", category: "COLOURED_STONE" as const, defaultRatePerCarat: 1600 },
      { name: "Diamond", category: "DIAMOND" as const, defaultRatePerCarat: 45000 },
    ].map((s) =>
      prisma.stoneType.findFirst({ where: { name: s.name } }).then((existing) =>
        existing ? existing : prisma.stoneType.create({ data: s })
      )
    )
  );

  const stages = await Promise.all(
    [
      { name: "Casting", sequenceOrder: 0, wastageTolerancePct: 2.0 },
      { name: "Filing", sequenceOrder: 1, wastageTolerancePct: 2.5 },
      { name: "Setting", sequenceOrder: 2, wastageTolerancePct: 1.5 },
      { name: "Polishing", sequenceOrder: 3, wastageTolerancePct: 2.0 },
      { name: "QC", sequenceOrder: 4, wastageTolerancePct: 0.5 },
    ].map((s) => prisma.processStage.upsert({ where: { name: s.name }, create: s, update: s }))
  );
  const polishingStage = stages.find((s) => s.name === "Polishing")!;

  await prisma.goldRate.upsert({
    where: { id: "seed-gold-rate" },
    create: {
      id: "seed-gold-rate",
      ratePerGram24k: 9200,
      effectiveFrom: new Date("2026-07-08"),
      createdById: admin.id,
    },
    update: { ratePerGram24k: 9200 },
  });

  let suresh = await prisma.karigar.findFirst({ where: { code: "KR-001" } });
  if (!suresh) {
    suresh = await prisma.karigar.create({
      data: {
        code: "KR-001",
        name: "Suresh Kumar",
        contactNumber: "+91 98765 43210",
        specialization: "Setting, Polishing",
        employmentType: "EXTERNAL",
        stageRates: {
          create: [
            { processStageId: polishingStage.id, rateBasis: "PER_GRAM", rate: 150 },
          ],
        },
      },
    });
  }

  await Promise.all(
    [
      { name: "Hallmarking" },
      { name: "Certification" },
      { name: "Packing" },
      { name: "Rhodium" },
      { name: "Freight" },
    ].map((c) => prisma.chargeType.upsert({ where: { name: c.name }, create: c, update: {} }))
  );

  await prisma.vendor.upsert({
    where: { id: "seed-refiner" },
    create: { id: "seed-refiner", name: "Mumbai Bullion Refiners", type: "REFINER" },
    update: {},
  });

  const customer = await prisma.customer.findFirst({ where: { name: "Anita Sharma" } }).then(
    (c) => c ?? prisma.customer.create({ data: { name: "Anita Sharma", contact: "+91 90000 11111" } })
  );

  // A demo product carried partway through the workflow so the UI has real
  // numbers to render (dashboard KPIs, catalogue, job board, costing sheet).
  const existingDemo = await prisma.product.findFirst({ where: { designName: "Peacock Polki Choker" } });
  if (!existingDemo) {
    const yymm = (() => {
      const now = new Date();
      return `${String(now.getFullYear() % 100).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();
    const seqRows: { lastValue: number }[] = await prisma.$queryRawUnsafe(
      `INSERT INTO "SerialSequence" ("bucketKey","lastValue") VALUES ($1, 1)
       ON CONFLICT ("bucketKey") DO UPDATE SET "lastValue" = "SerialSequence"."lastValue" + 1
       RETURNING "lastValue"`,
      `NK-18K-${yymm}`
    );
    const seq = String(seqRows[0].lastValue).padStart(4, "0");
    const serialNo = `NK-18K-${yymm}-${seq}`;

    const product = await prisma.product.create({
      data: {
        serialNo,
        designName: "Peacock Polki Choker",
        categoryId: necklaceCategory!.id,
        subcategoryId: chokerSub.id,
        purityId: karat18k.id,
        grossWeightG: 24.35,
        netWeightG: 21.2,
        stoneWeightCt: 2.15,
        size: "14 inch",
        designSource: "IN_HOUSE",
        customerId: customer.id,
        status: "IN_PRODUCTION",
        createdById: admin.id,
      },
    });

    const jobCard = await prisma.jobCard.create({
      data: {
        productId: product.id,
        customerId: customer.id,
        createdById: admin.id,
        stages: { create: stages.map((s, i) => ({ processStageId: s.id, sequenceOrder: i })) },
      },
      include: { stages: true },
    });

    const polishStage = jobCard.stages.find((s) => s.processStageId === polishingStage.id)!;
    await prisma.jobStage.update({
      where: { id: polishStage.id },
      data: { karigarId: suresh.id, status: "ISSUED", assignedAt: new Date() },
    });

    const issue = await prisma.materialIssue.create({
      data: {
        issueNo: "MI-000001",
        jobStageId: polishStage.id,
        karigarId: suresh.id,
        materialType: "GOLD",
        purityId: karat18k.id,
        grossWeightG: 26.0,
        fineWeightG: 26.0 * 0.75,
        issuedById: admin.id,
      },
    });
    await prisma.karigarLedgerEntry.create({
      data: {
        karigarId: suresh.id,
        type: "METAL_DEBIT",
        fineGoldG: issue.fineWeightG,
        referenceType: "MaterialIssue",
        referenceId: issue.id,
        note: "Gold issued — MI-000001",
      },
    });

    const labour = await prisma.labourEntry.create({
      data: {
        jobStageId: polishStage.id,
        karigarId: suresh.id,
        rateBasis: "PER_GRAM",
        quantity: 21.2,
        rate: 150,
        amount: 21.2 * 150,
        status: "APPROVED",
        enteredById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    await prisma.karigarLedgerEntry.create({
      data: {
        karigarId: suresh.id,
        type: "LABOUR_EARNED",
        amount: labour.amount,
        referenceType: "LabourEntry",
        referenceId: labour.id,
        note: "Labour approved",
      },
    });

    console.log(`Seeded demo product ${serialNo} with job card ${jobCard.id}`);
  }

  console.log("Seed complete. Demo login: admin@jms.local / Password@123 (all seeded users share this password).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
