import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEconomicCalendar } from '../lib/api/marketClient';
import { useAuthStore } from '../store/authStore';

export function useEconomicCalendar(startDate: Date, endDate: Date) {
  const queryClient = useQueryClient();
  const stream = useAuthStore(state => state.getStream());
  const isConnected = useAuthStore(state => state.isConnected);

  const queryKey = ['economic-calendar', startDate.toISOString(), endDate.toISOString()];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchEconomicCalendar(true, startDate, endDate),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!stream || !isConnected) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleCalendarUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey });
      }, 500);
    };

    stream.addEventListener('calendar_update', handleCalendarUpdate as EventListener);
    
    return () => {
      stream.removeEventListener('calendar_update', handleCalendarUpdate as EventListener);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [stream, isConnected, queryClient]);

  return query;
}
