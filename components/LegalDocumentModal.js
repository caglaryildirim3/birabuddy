import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../contexts/ThemeContext';
import { resolveLegalDocumentUri } from '../utils/legalDocumentUtils';

function LegalDocumentModalContent({ onClose, documentPath, title }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [uri, setUri] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentPath) {
      setUri(null);
      setLoading(true);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    resolveLegalDocumentUri(documentPath)
      .then((resolvedUri) => {
        if (cancelled) return;
        setUri(resolvedUri);
        if (!resolvedUri) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentPath]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={16}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.webviewWrap}>
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : null}

        {uri ? (
          <WebView
            source={{ uri }}
            style={styles.webview}
            originWhitelist={['*']}
            onLoadEnd={() => setLoading(false)}
            onError={() => setLoading(false)}
            allowingReadAccessToURL={Platform.OS === 'ios' ? uri : undefined}
          />
        ) : !loading ? (
          <View style={styles.loader}>
            <Text style={styles.errorText}>Unable to load document.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function LegalDocumentModal({ visible, onClose, documentPath, title }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <SafeAreaProvider>
        <LegalDocumentModalContent
          onClose={onClose}
          documentPath={documentPath}
          title={title}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
      gap: 12,
    },
    title: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panelElevated,
    },
    closeText: {
      fontSize: 18,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    webviewWrap: {
      flex: 1,
      backgroundColor: '#ffffff',
    },
    webview: {
      flex: 1,
      backgroundColor: '#ffffff',
    },
    loader: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffffff',
    },
    errorText: {
      color: colors.textSecondary,
      fontSize: 15,
    },
  });
}
