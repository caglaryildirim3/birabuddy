export function hasGpsLiveLocation(user) {
  return (
    user?.liveLocationShared === true &&
    user?.liveLocation?.latitude != null &&
    user?.liveLocation?.longitude != null
  );
}

export function resolveFriendMapCoordinate(friend) {
  if (!hasGpsLiveLocation(friend)) return null;
  return {
    latitude: friend.liveLocation.latitude,
    longitude: friend.liveLocation.longitude,
  };
}

export function getMapRegionForCoordinate(coordinate, delta = 0.04) {
  if (!coordinate) return null;
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}
