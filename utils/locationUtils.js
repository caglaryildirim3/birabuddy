export async function getFuzzedLiveLocation() {
  try {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: Math.round(pos.coords.latitude * 100) / 100,
      longitude: Math.round(pos.coords.longitude * 100) / 100,
    };
  } catch {
    return null;
  }
}
