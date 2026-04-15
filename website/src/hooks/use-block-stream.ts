import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-config";

/**
 * SSE hook — real-time block stream.
 * Stats updated directly from SSE event (instant).
 * Blocks & transactions invalidated with throttle.
 */
export function useBlockStream() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastInvalidateRef = useRef(0);
  const retriesRef = useRef(0);
  const MAX_RETRIES = 3;

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;
    if (retriesRef.current >= MAX_RETRIES) return;

    let es: EventSource;
    try {
      es = new EventSource(apiUrl("/api/blockchain/stream"));
    } catch {
      return; // SSE not supported or URL invalid
    }
    eventSourceRef.current = es;

    es.onopen = () => {
      retriesRef.current = 0; // reset on successful connection
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_block") {
          queryClient.setQueryData(
            ["/api/blockchain/stats"],
            (old: Record<string, unknown> | undefined) => {
              if (!old) return old;
              return {
                ...old,
                latestBlock: data.number,
                totalTransactions: data.number,
              };
            }
          );

          const now = Date.now();
          if (now - lastInvalidateRef.current > 1000) {
            lastInvalidateRef.current = now;
            queryClient.invalidateQueries({
              queryKey: ["/api/blockchain/blocks"],
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/blockchain/transactions"],
            });
          }
        }
      } catch {
        // heartbeat
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      retriesRef.current += 1;
      if (retriesRef.current < MAX_RETRIES) {
        setTimeout(connect, 3000);
      }
    };
  }, [queryClient]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);
}
