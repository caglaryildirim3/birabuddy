import { useCallback, useEffect, useRef } from 'react';

export function useChatAutoScroll(flatListRef, messages, { enabled = true } = {}) {
  const prevMessageCountRef = useRef(0);
  const prevLastMessageIdRef = useRef(null);
  const pendingInitialScrollRef = useRef(false);
  const wasEnabledRef = useRef(false);
  const initialScrollTimersRef = useRef([]);

  const clearInitialScrollTimers = useCallback(() => {
    initialScrollTimersRef.current.forEach(clearTimeout);
    initialScrollTimersRef.current = [];
  }, []);

  const scrollToEnd = useCallback(
    (animated = true) => {
      flatListRef.current?.scrollToEnd({ animated });
    },
    [flatListRef]
  );

  const scrollToLatest = useCallback(
    (animated = false) => {
      if (messages.length === 0) return;
      const lastIndex = messages.length - 1;
      flatListRef.current?.scrollToIndex({
        index: lastIndex,
        animated,
        viewPosition: 1,
      });
    },
    [flatListRef, messages.length]
  );

  const finishInitialScroll = useCallback(() => {
    pendingInitialScrollRef.current = false;
    prevMessageCountRef.current = messages.length;
    prevLastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
  }, [messages]);

  const runInitialScroll = useCallback(() => {
    if (!pendingInitialScrollRef.current || messages.length === 0) return;

    scrollToLatest(false);
    requestAnimationFrame(() => {
      scrollToEnd(false);
    });

    clearInitialScrollTimers();
    initialScrollTimersRef.current = [
      setTimeout(() => scrollToEnd(false), 50),
      setTimeout(() => scrollToEnd(false), 150),
      setTimeout(() => {
        scrollToEnd(false);
        finishInitialScroll();
      }, 300),
    ];
  }, [clearInitialScrollTimers, finishInitialScroll, messages.length, scrollToEnd, scrollToLatest]);

  useEffect(() => {
    if (enabled && !wasEnabledRef.current && messages.length > 0) {
      pendingInitialScrollRef.current = true;
    }
    wasEnabledRef.current = enabled;

    if (!enabled) return;

    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    const prevCount = prevMessageCountRef.current;
    const grew = messages.length > prevCount;
    const newLastMessage = lastId !== prevLastMessageIdRef.current;
    const isInitialLoad = prevCount === 0 && messages.length > 0;

    if (isInitialLoad) {
      pendingInitialScrollRef.current = true;
      return;
    }

    if (messages.length > 0 && (grew || newLastMessage)) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: grew });
      });
      prevMessageCountRef.current = messages.length;
      prevLastMessageIdRef.current = lastId;
    }
  }, [messages, enabled, flatListRef]);

  useEffect(() => () => clearInitialScrollTimers(), [clearInitialScrollTimers]);

  const onContentSizeChange = useCallback(() => {
    if (!enabled || !pendingInitialScrollRef.current || messages.length === 0) return;
    runInitialScroll();
  }, [enabled, messages.length, runInitialScroll]);

  const onScrollToIndexFailed = useCallback(
    (info) => {
      if (!enabled || !pendingInitialScrollRef.current) return;

      flatListRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index),
        animated: false,
      });
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: false,
          viewPosition: 1,
        });
      }, 100);
    },
    [enabled, flatListRef]
  );

  return { scrollToEnd, onContentSizeChange, onScrollToIndexFailed };
}
