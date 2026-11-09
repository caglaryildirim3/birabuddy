import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import BeerColors from '../constants/BeerColors';

const toFileUri = (path) => (path.startsWith('file://') ? path : `file://${path}`);

export default function DualCameraCapture({ onClose, onCapture }) {
  const { t } = useTranslation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const devices = useCameraDevices();
  const backDevice = useCameraDevice('back', {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });
  const frontDevice = useCameraDevice('front');
  const photoOptions = useMemo(
    () => ({
      quality: 0.85,
      qualityPrioritization: 'speed',
    }),
    [],
  );
  const backPhotoOutput = usePhotoOutput(photoOptions);
  const frontPhotoOutput = usePhotoOutput(photoOptions);

  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [mountCamera, setMountCamera] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [phase, setPhase] = useState('back');
  const [backUri, setBackUri] = useState(null);
  const [flashMode, setFlashMode] = useState('off');
  const [isHalfZoom, setIsHalfZoom] = useState(false);
  const [wideZoom, setWideZoom] = useState(1);
  const [ultraWideZoom, setUltraWideZoom] = useState(1);
  const cameraRef = useRef(null);
  const cameraReadyRef = useRef(false);
  const readyResolverRef = useRef(null);
  const closingRef = useRef(false);

  const supportsHalfZoom = wideZoom > ultraWideZoom + 0.01;

  const activeDevice = phase === 'back' ? backDevice : frontDevice;
  const activePhotoOutput = phase === 'back' ? backPhotoOutput : frontPhotoOutput;

  const zoom = useMemo(() => {
    if (phase !== 'back') return 1;
    if (!supportsHalfZoom) return wideZoom;
    return isHalfZoom ? ultraWideZoom : wideZoom;
  }, [phase, isHalfZoom, supportsHalfZoom, ultraWideZoom, wideZoom]);

  const resetState = () => {
    setCapturing(false);
    setCameraReady(false);
    cameraReadyRef.current = false;
    setPhase('back');
    setBackUri(null);
    setFlashMode('off');
    setIsHalfZoom(false);
    setWideZoom(1);
    setUltraWideZoom(1);
    readyResolverRef.current = null;
  };

  const cycleFlash = () => {
    setFlashMode((prev) => {
      if (prev === 'off') return 'on';
      if (prev === 'on') return 'auto';
      return 'off';
    });
  };

  const toggleHalfZoom = () => {
    if (!supportsHalfZoom || capturing || !cameraReady) return;
    setIsHalfZoom((prev) => !prev);
  };

  const flashIcon =
    flashMode === 'on' ? 'flash' : flashMode === 'auto' ? 'flash-outline' : 'flash-off';

  // Component is only mounted when the camera should be active (conditional
  // rendering in parent). Initialise on mount, clean up on unmount.
  useEffect(() => {
    closingRef.current = false;
    resetState();
    setSessionKey((key) => key + 1);

    const mountTimer = setTimeout(() => setMountCamera(true), 150);
    if (!hasPermission) {
      requestPermission();
    }

    return () => {
      clearTimeout(mountTimer);
      setMountCamera(false);
    };
  }, []);

  const handleClose = () => {
    if (capturing || closingRef.current) return;
    closingRef.current = true;
    // Stop the camera first, then let the parent unmount this component after
    // a short delay. Do NOT call resetState() here — changing `phase` mid-
    // teardown mutates the Camera key, which triggers a remount of the native
    // camera before it has released its resources, causing a crash.
    setMountCamera(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert(t('permissionRequired'), t('cameraPermissionRequired'));
    }
  };

  const waitForCameraReady = () =>
    new Promise((resolve) => {
      if (cameraReadyRef.current) {
        resolve();
        return;
      }
      readyResolverRef.current = resolve;
      setTimeout(() => {
        if (readyResolverRef.current) {
          readyResolverRef.current();
          readyResolverRef.current = null;
        }
      }, 3000);
    });

  const handleCameraStarted = () => {
    if (phase === 'back' && backDevice) {
      const controller = cameraRef.current?.controller;
      const switchFactors = backDevice.zoomLensSwitchFactors ?? [];
      const resolvedUltraWide = controller?.minZoom ?? backDevice.minZoom ?? 1;
      const resolvedWide = switchFactors[0] ?? resolvedUltraWide;

      setUltraWideZoom(resolvedUltraWide);
      setWideZoom(resolvedWide);

      if (resolvedWide <= resolvedUltraWide + 0.01) {
        setIsHalfZoom(false);
      }
    }

    cameraReadyRef.current = true;
    setCameraReady(true);
    readyResolverRef.current?.();
    readyResolverRef.current = null;
  };

  const handleCameraStopped = () => {
    cameraReadyRef.current = false;
    setCameraReady(false);
  };

  const resetCameraReady = () => {
    cameraReadyRef.current = false;
    setCameraReady(false);
    readyResolverRef.current = null;
  };

  const takePhoto = async () => {
    const output = phase === 'back' ? backPhotoOutput : frontPhotoOutput;
    if (!output) {
      throw new Error('photo output not ready');
    }

    if (phase === 'back') {
      const controller = cameraRef.current?.controller;
      if (controller) {
        await controller.setZoom(zoom).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }

    const canUseFlash =
      phase === 'back' && !isHalfZoom && backDevice?.hasFlash !== false && flashMode !== 'off';
    const captureFlash = canUseFlash ? flashMode : 'off';

    const photo = await output.capturePhoto(
      {
        flashMode: captureFlash,
        enableShutterSound: false,
      },
      {},
    );

    try {
      const path = await photo.saveToTemporaryFileAsync();
      if (!path) {
        throw new Error('missing photo path');
      }
      return toFileUri(path);
    } finally {
      photo.dispose();
    }
  };

  const handleCapturePress = async () => {
    if (!activeDevice || capturing || !cameraReady || !mountCamera) return;

    setCapturing(true);
    try {
      await waitForCameraReady();
      const uri = await takePhoto();

      if (phase === 'back') {
        setBackUri(uri);
        resetCameraReady();
        setMountCamera(false);
        await new Promise((resolve) => setTimeout(resolve, 300));
        setPhase('selfie');
        setSessionKey((key) => key + 1);
        await new Promise((resolve) => setTimeout(resolve, 150));
        setMountCamera(true);
        return;
      }

      onCapture({ backUri, frontUri: uri });
      handleClose();
    } catch {
      Alert.alert(t('error'), t('failedToCapturePhoto'));
    } finally {
      setCapturing(false);
    }
  };

  const renderBody = () => {
    if (!hasPermission) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permissionText}>{t('cameraPermissionRequired')}</Text>
          <Pressable style={styles.permissionButton} onPress={handleRequestPermission}>
            <Text style={styles.permissionButtonText}>{t('allowCamera')}</Text>
          </Pressable>
        </View>
      );
    }

    if (devices.length === 0 || !activeDevice) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={BeerColors.accent} />
        </View>
      );
    }

    if (!mountCamera) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={BeerColors.accent} />
        </View>
      );
    }

    return (
      <>
        <Camera
          key={`${sessionKey}-${phase}`}
          ref={cameraRef}
          style={styles.mainCamera}
          device={activeDevice}
          outputs={[activePhotoOutput]}
          isActive={mountCamera}
          zoom={phase === 'back' ? zoom : 1}
          torchMode={phase === 'back' && flashMode === 'on' ? 'on' : 'off'}
          resizeMode="cover"
          onStarted={handleCameraStarted}
          onStopped={handleCameraStopped}
        />

        {phase === 'selfie' && backUri ? (
          <View style={styles.pipFrame}>
            <Image source={{ uri: backUri }} style={styles.pipImage} contentFit="cover" />
          </View>
        ) : null}

        <View style={styles.topBar}>
          {phase === 'back' ? (
            <View style={styles.topBarControls}>
              <Pressable style={styles.controlButton} onPress={cycleFlash} disabled={capturing}>
                <Ionicons name={flashIcon} size={22} color="#fff" />
              </Pressable>
              {phase === 'back' && supportsHalfZoom ? (
                <Pressable
                  style={[styles.controlButton, isHalfZoom && styles.controlButtonActive]}
                  onPress={toggleHalfZoom}
                  disabled={capturing || !cameraReady}
                >
                  <Text style={[styles.zoomLabel, isHalfZoom && styles.zoomLabelActive]}>0.5×</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.topBarControls} />
          )}
          <Pressable style={styles.closeButton} onPress={handleClose} disabled={capturing}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.bottomBar}>
          <Pressable
            style={[styles.captureButton, capturing && styles.captureButtonDisabled]}
            onPress={handleCapturePress}
            disabled={capturing || !cameraReady}
          >
            {capturing ? (
              <ActivityIndicator color="#111" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </Pressable>
        </View>
      </>
    );
  };

  return <View style={styles.overlay}>{renderBody()}</View>;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
    backgroundColor: '#000',
  },
  mainCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  pipFrame: {
    position: 'absolute',
    top: 56,
    left: 16,
    width: 108,
    height: 144,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#000',
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  pipImage: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  controlButton: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  zoomLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  zoomLabelActive: {
    color: BeerColors.accent,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    alignItems: 'center',
  },
  captureButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  captureButtonDisabled: {
    opacity: 0.7,
  },
  captureInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: BeerColors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '700',
  },
});
