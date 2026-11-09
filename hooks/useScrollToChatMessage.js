import { useCallback, useEffect, useRef, useState } from 'react';

export function useScrollToChatMessage(flatListRef, messages, { onScrolled } = {}) {
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const highlightTimerRef = useRef(null);
  const pendingScrollIdRef = useRef(null);
  const onScrolledRef = useRef(onScrolled);

  useEffect(() => {
    onScrolledRef.current = onScrolled;
  }, [onScrolled]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

  const highlightMessage = useCallback((messageId) => {
    if (!messageId) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedMessageId(messageId);
    highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 1200);
  }, []);

  const finishScroll = useCallback(() => {
    pendingScrollIdRef.current = null;
    onScrolledRef.current?.();
  }, []);

  const onScrollToIndexFailed = useCallback(
    (info) => {
      flatListRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index),
        animated: false,
      });
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: true,
          viewPosition: 0.5,
        });
      }, 100);
    },
    [flatListRef]
  );

  const attemptScrollToMessage = useCallback(
    (messageId) => {
      if (!messageId) return false;
      const index = messages.findIndex((m) => m.id === messageId);
      if (index < 0) return false;

      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
      highlightMessage(messageId);
      return true;
    },
    [flatListRef, messages, highlightMessage]
  );

  const scrollToMessage = useCallback(
    (messageId) => {
      if (!messageId) return false;
      pendingScrollIdRef.current = messageId;
      const scrolled = attemptScrollToMessage(messageId);
      if (scrolled) finishScroll();
      return scrolled;
    },
    [attemptScrollToMessage, finishScroll]
  );

  const onTargetContentSizeChange = useCallback(() => {
    const pendingId = pendingScrollIdRef.current;
    if (!pendingId) return;
    if (attemptScrollToMessage(pendingId)) {
      finishScroll();
    }
  }, [attemptScrollToMessage, finishScroll]);

  return {
    scrollToMessage,
    highlightedMessageId,
    onScrollToIndexFailed,
    onTargetContentSizeChange,
  };
}
