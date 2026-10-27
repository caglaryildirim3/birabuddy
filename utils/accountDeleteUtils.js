import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

export async function deleteMyAccount() {
  const functions = getFunctions(getApp());
  const deleteAccountFn = httpsCallable(functions, 'deleteMyAccount');
  const result = await deleteAccountFn();
  return result.data;
}

export function getAccountDeleteErrorMessage(error, t) {
  const code = error?.code || '';
  const message = error?.message || '';

  if (code === 'functions/unauthenticated') {
    return t('accountDeleteSignInRequired');
  }
  if (code === 'functions/unavailable' || message.includes('network')) {
    return t('accountDeleteNetworkError');
  }

  return t('failedToDelete', { error: message || t('loginFailed') });
}
