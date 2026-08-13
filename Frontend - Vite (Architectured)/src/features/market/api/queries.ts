import { useQuery } from "@tanstack/react-query";
import { fetchBrokerSymbols, fetchEconomicCalendar } from "./marketClient";

export const marketKeys = {
  all: ["market"] as const,
  symbols: () => [...marketKeys.all, "symbols"] as const,
  calendar: (fromDate: string, toDate: string) => [...marketKeys.all, "calendar", fromDate, toDate] as const,
};

export function useBrokerSymbols() {
  return useQuery({
    queryKey: marketKeys.symbols(),
    queryFn: () => fetchBrokerSymbols(),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

export function useEconomicCalendar(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: marketKeys.calendar(fromDate, toDate),
    queryFn: () => fetchEconomicCalendar(fromDate, toDate),
    staleTime: 60 * 1000, // 1 minute cache
    refetchInterval: 60 * 1000, // Refetch every minute automatically
  });
}
