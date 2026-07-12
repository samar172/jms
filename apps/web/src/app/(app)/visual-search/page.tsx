import { Camera } from "lucide-react";

export default function VisualSearchPage() {
  return (
    <div className="max-w-xl mx-auto text-center py-20">
      <div className="w-16 h-16 rounded-full bg-gold-tint text-gold flex items-center justify-center mx-auto mb-4">
        <Camera size={28} />
      </div>
      <h1 className="text-xl font-semibold mb-2">Visual Search — coming in Phase 6</h1>
      <p className="text-text-muted text-sm">
        AI-based design image search (Module 9) is a separate embedding/vector-search subsystem
        (self-hosted CLIP or DINOv2 + pgvector) that the BRD deliberately phases in once the design
        catalogue has enough indexed photographs to evaluate against (Section 12, Phase 1 feasibility
        spike). The Product and Job Card modules already tag and store Sketch / Work-in-Progress /
        Final Product images so this module can index them without any data migration when it lands.
      </p>
    </div>
  );
}
