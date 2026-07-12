import useSWR from "swr";
import { apiFetch } from "./api";

const fetcher = <T,>(path: string) => apiFetch<T>(path);

export function useApi<T>(path: string | null) {
  return useSWR<T>(path, fetcher);
}

export interface Category {
  id: string;
  name: string;
  code: string;
  subcategories: { id: string; name: string }[];
}
export interface Karat {
  id: string;
  code: string;
  purityFactor: string;
}
export interface StoneType {
  id: string;
  name: string;
  category: "POLKI" | "DIAMOND" | "COLOURED_STONE";
  defaultRatePerCarat?: string;
}
export interface ProcessStage {
  id: string;
  name: string;
  sequenceOrder: number;
  wastageTolerancePct: string;
}
export interface Karigar {
  id: string;
  code: string;
  name: string;
  employmentType: "IN_HOUSE" | "EXTERNAL";
  specialization?: string;
  contactNumber?: string;
  stageRates?: { processStageId: string; rateBasis: string; rate: string }[];
}
export interface Customer {
  id: string;
  name: string;
  contact?: string;
}

export const useCategories = () => useApi<Category[]>("/api/masters/categories");
export const useKarats = () => useApi<Karat[]>("/api/masters/karats");
export const useStoneTypes = () => useApi<StoneType[]>("/api/masters/stone-types");
export const useProcessStages = () => useApi<ProcessStage[]>("/api/masters/process-stages");
export const useKarigars = () => useApi<Karigar[]>("/api/masters/karigars");
export const useCustomers = () => useApi<Customer[]>("/api/masters/customers");
