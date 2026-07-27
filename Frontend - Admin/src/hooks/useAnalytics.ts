import { useQuery } from "@tanstack/react-query";
import { fetchAnalytics, type AnalyticsParams } from "../api/metrics";

export function useAnalytics(params: AnalyticsParams) {
  return useQuery({
    queryKey: ["analytics", params],
    queryFn: () => fetchAnalytics(params),
  });
}
