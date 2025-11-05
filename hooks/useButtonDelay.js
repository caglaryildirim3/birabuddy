import { useState, useCallback } from 'react';

export const useButtonDelay = (delayMs = 2000) => {
  const [isDisabled, setIsDisabled] = useState(false);

  const executeWithDelay = useCallback((callback) => {
    if (isDisabled) return;

    setIsDisabled(true);
    callback();

    setTimeout(() => {
      setIsDisabled(false);
    }, delayMs);
  }, [isDisabled, delayMs]);

  return {
    isDisabled,
    executeWithDelay
  };
};