/**
 * TanStack Query client — projedeki tüm useQuery'lerin paylaştığı tek instance.
 *
 * Tasarım kararları:
 *  - `staleTime` 60s default: piyasa verisi yarı-canlı; sayfa geçişlerinde
 *    aynı sembol için yeniden fetch yapmasın.
 *  - `gcTime` 5 dakika: kullanıcı sayfaya geri dönerse hâlâ cache var.
 *  - `refetchOnWindowFocus` false: tarayıcı sekmesi değişimde gereksiz trafik.
 *  - `refetchOnReconnect` true: ağ koparsa tekrar bağlanınca taze veri.
 *  - `retry` 1: http.ts kendi içinde de retry yapıyor; üst üste binmesin.
 *
 * Sayfa düzeyi override (örn. canlı endeks ekranı):
 *   useQuery({ ..., staleTime: 0, refetchInterval: 30_000 })
 */

import { QueryClient } from '@tanstack/react-query';
import { HttpError } from './http';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // 4xx → retry'a gerek yok
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
