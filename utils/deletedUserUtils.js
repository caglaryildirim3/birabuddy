export const DELETED_USER_NAME = 'Deleted User';

export const DELETED_USER_SNAPSHOT = {
  name: DELETED_USER_NAME,
  university: '',
  photoURL: null,
};

export function isDeletedUser(userData) {
  return userData?.isDeleted === true || userData?.name === DELETED_USER_NAME;
}

export function isDeletedPost(post) {
  return post?.isDeleted === true;
}

export function isDeletedComment(comment) {
  return comment?.isDeleted === true;
}

export function isVisiblePost(post) {
  return Boolean(post) && !isDeletedPost(post);
}

export function getDeletedAwareName(userData, snapshot, t) {
  if (isDeletedUser(userData) || snapshot?.name === DELETED_USER_NAME) {
    return t('deletedUser');
  }
  return userData?.name || snapshot?.name || 'User';
}

export function getDeletedAwareSnapshot(snapshot, t) {
  if (!snapshot || snapshot.name === DELETED_USER_NAME) {
    return {
      ...DELETED_USER_SNAPSHOT,
      name: t('deletedUser'),
    };
  }
  return snapshot;
}
