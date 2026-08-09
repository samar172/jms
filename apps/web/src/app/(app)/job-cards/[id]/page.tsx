"use client";

import { use } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { PageFormSkeleton } from "@/components/shared/page-skeleton";
import { JobCardPanel } from "@/components/shared/job-card-panel";

interface JobCardHeader {
  productId: string;
  product: { serialNo: string; designName: string };
}

export default function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: jobCard } = useApi<JobCardHeader>(`/api/job-cards/${id}`);

  if (!jobCard) return <PageFormSkeleton sections={3} />;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/products/${jobCard.product.serialNo}`} className="font-mono font-semibold text-primary">
          {jobCard.product.serialNo}
        </Link>
        <h1 className="text-xl font-semibold">{jobCard.product.designName}</h1>
      </div>
      <JobCardPanel jobCardId={id} />
    </div>
  );
}
