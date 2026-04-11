import { Link, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, deleteUser, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import BeerColors from '../constants/BeerColors';
import { auth, db } from '../firebase/firebaseConfig';

export default function Register() {
  const { t } = useTranslation();
  const [instagramUsername, setInstagramUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // KVKK ve yasal onay state'leri
  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [showKvkkModal, setShowKvkkModal] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  
  const router = useRouter();

  // KVKK Tam Metni
  const kvkkFullText = `
# BiraBuddy Kişisel Verilerin Korunması Politikası

## 1. Genel Bilgiler

Bu Kişisel Verilerin Korunması Politikası, BiraBuddy mobil uygulaması tarafından toplanan, işlenen ve saklanan kişisel verilerinizin korunması amacıyla, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca hazırlanmıştır.

**Veri Sorumlusu:** birabuddy  
**İletişim:** birabuddy@gmail.com

## 2. Önemli Uyarılar ve Sorumluluk Reddi

### 2.1 Yaş Sınırı
- Bu uygulama yalnızca 18 yaş üzeri üniversite öğrencileri içindir.
- Kayıt sırasında 18 yaşını doldurduğunuzu beyan etmeniz zorunludur.
- Yaş beyanınızın doğruluğu tamamen sizin sorumluluğunuzdadır.

### 2.2 Uygulama Amacı
- BiraBuddy, üniversite öğrencilerinin sosyal buluşmalar organize etmesini sağlayan bir platformdur.
- Uygulamamız alkol tüketimini teşvik etmez, özendirmez veya reklamını yapmaz.
- Kullanıcıların buluşmalarda yapacakları aktiviteler ve tüketecekleri içecekler tamamen kendi kişisel tercihleri ve sorumluluklarıdır.
- Platform yalnızca sosyal buluşma imkanı sunar, buluşmalardaki davranışlardan sorumlu değildir.

### 2.3 Kişisel Sorumluluk
- Buluşmalara katılım tamamen gönüllüdür ve kendi sorumluluğunuzdadır.
- Güvenliğiniz için daima kalabalık ve güvenli mekanlarda buluşmanız önerilir.
- Tanımadığınız kişilerle buluşurken gerekli güvenlik önlemlerini almanız gerekmektedir.

## 3. Toplanan Kişisel Veriler

### 3.1 Kayıt Sırasında Toplanan Veriler
- Üniversite e-posta adresi
- Şifre (şifrelenmiş)
- Instagram kullanıcı adı
- Yaş bilgisi

### 3.2 Oda Oluşturma ve Katılım Sırasında Toplanan Veriler
- Buluşma yeri (adı ,yalnızca oda katılımcıları görebilir, ve mahalle bilgisi)
- Buluşma tarihi ve saati
- Katılımcı sayısı

### 3.3 Uygulama Kullanımı Sırasında Oluşan Veriler
- Chat mesajları (yalnızca oda katılımcıları arasında)
- Oda katılım istekleri
- Uygulama kullanım logları
- Okuduğu bölüm

## 4. Kişisel Verilerin İşlenme Amaçları

Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:

### 4.1 Ana Amaçlar
- Sosyal buluşma odalarının oluşturulması ve yönetimi
- Kullanıcılar arası etkileşimin sağlanması
- Güvenli ve düzenli platform sunumu
- Yaş sınırının kontrolü (üniversite e-postası ve kişisel beyan ile)

### 4.2 Güvenlik Amaçları
- Platformun kötüye kullanımının önlenmesi
- Şikayet ve raporların değerlendirilmesi
- Teknik güvenlik tedbirlerinin uygulanması

## 5. Veri Paylaşımı ve Görünürlük

### 5.1 Herkese Açık Bilgiler
Aşağıdaki bilgileriniz diğer kullanıcılar tarafından görülebilir:
- Instagram kullanıcı adı
- Yaş
- Okuduğu bölüm
- En sevilen içecek
- Buluşma yerinin bulunduğu mahalle

### 5.2 Oda Katılımcılarına Özel Bilgiler
- Buluşma yerinin adı 
- Chat mesajları
- Oda detayları

### 5.3 Özel Bilgiler
Aşağıdaki bilgiler yalnızca sizin göreceğiniz bilgilerdir:
- E-posta adresi
- Şifre bilgileri

## 6. Veri Saklama Süreleri

- **Aktif hesaplar:** Hesabınız silinene kadar
- **Silinen hesaplar:** Silme talebinden itibaren makul süre içinde
- **Chat verileri:** Oda kapandıktan sonra makul bir süre (güvenlik amaçlı)
- **Log kayıtları:** Güvenlik amaçlı olarak sınırlı süre

## 7. Veri Güvenliği

### 7.1 Teknik Önlemler
- Verileriniz Firebase Firestore altyapısı kullanılarak saklanır
- Şifreler güvenli yöntemlerle şifrelenir
- Düzenli güvenlik güncellemeleri yapılır

### 7.2 İdari Önlemler
- Verilere erişim sınırlıdır ve kontrol altındadır
- Düzenli güvenlik denetimleri yapılır

## 8. Veri Aktarımı

Verileriniz, Firebase Firestore hizmeti kapsamında Google'ın Amerika Birleşik Devletleri'ndeki sunucularında saklanmaktadır. Bu aktarım, hizmetin teknik gereksinimlerini karşılamak amacıyla gerçekleştirilmektedir.

## 9. KVKK Kapsamındaki Haklarınız

KVKK'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:

### 9.1 Temel Haklar
- Kişisel verilerinizin işlenip işlenmediğini öğrenme
- İşlenen kişisel verileriniz hakkında bilgi talep etme
- İşleme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme
- Yurt içinde veya yurt dışında kişisel verilerinizin aktarıldığı üçüncü kişileri bilme

### 9.2 Düzeltme ve Silme Hakları
- Kişisel verilerinizin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme
- Kişisel verilerinizin silinmesini veya yok edilmesini isteme
- Düzeltme, silme veya yok etme işlemlerinin kişisel verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme

### 9.3 İtiraz Hakkı
- İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle kişi aleyhine bir sonucun ortaya çıkması hâlinde buna itiraz etme
- Kişisel verilerinizin kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme

## 10. İletişim ve Başvuru

Kişisel verileriniz ile ilgili her türlü soru, talep ve şikayetlerinizi aşağıdaki iletişim bilgileri üzerinden iletebilirsiniz:

**E-posta:** birabuddy@gmail.com

Başvurularınız en kısa sürede, en geç 30 gün içinde yanıtlanacaktır.

## 11. Şikayet Hakkı

KVKK kapsamındaki haklarınızın kullanımına ilişkin başvurularınızdan sonuç alamazsanız, Kişisel Verileri Koruma Kurulu'na şikayette bulunma hakkınız saklıdır.

## 12. Politika Güncellemeleri

Bu Politika, yasal düzenlemelerdeki değişiklikler ve uygulama güncellemeleri doğrultusunda güncellenebilir. Önemli değişiklikler uygulama üzerinden kullanıcılara bildirilecektir.

## 13. Yürürlük

Bu Politika, uygulama kullanımına başladığınız tarihten itibaren yürürlüktedir.

---

**Son Güncelleme:** 28.08.2025 
**Versiyon:** 1.0

*Bu politika, 6698 sayılı Kişisel Verilerin Korunması Kanunu ve ilgili mevzuat uyarınca hazırlanmıştır.*
  `;

  // Kullanım Koşulları ve Gizlilik Politikası Metni
  const termsAndPrivacyText = `
# BiraBuddy Kullanım Koşulları ve Gizlilik Politikası

## 1. GENEL BİLGİLER

BiraBuddy, üniversite öğrencilerinin sosyal buluşmalar organize etmesini sağlayan bir mobil uygulamadır. Bu döküman hem Kullanım Koşullarımızı hem de Gizlilik Politikamızı içermektedir.

**Uygulama:** birabuddy  
**İletişim:** birabuddy@gmail.com  
**Son Güncelleme:** 28.08.2025

---

## 2. KULLANIM KOŞULLARI

### 2.1 Kabul ve Onay

birabuddy uygulamasını kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız:
- Bu kullanım koşullarını okuduğunuzu ve anladığınızı
- 18 yaşını doldurduğunuzu ve üniversite öğrencisi olduğunuzu
- Türkiye Cumhuriyeti yasalarına uygun davranacağınızı

### 2.2 Uygulamanın Amacı ve Kapsamı

**BiraBuddy'nin Amacı:**
- Üniversite öğrencilerinin sosyal buluşmalar organize etmesi
- Güvenli ve düzenli sosyal etkileşim platformu sunması
- Akademik ve sosyal topluluklar oluşturması

**ÖNEMLİ UYARI:** BiraBuddy alkol tüketimini teşvik etmez, özendirmez veya reklamını yapmaz. Uygulama yalnızca sosyal buluşma imkanı sunar.

### 2.3 Kullanıcı Sorumlulukları

#### 2.3.1 Yaş ve Kimlik Sorumluluğu
- 18 yaşını doldurduğunuzu beyan etmek tamamen sizin sorumluluğunuzdadır
- Sahte bilgi vermek yasaktır ve hesap kapatılmasına neden olur
- Üniversite e-posta adresi geçerli olmalıdır

#### 2.3.2 Güvenlik Sorumluluğu
- Buluşmalara katılım tamamen gönüllü ve kendi sorumluluğunuzdadır
- Tanımadığınız kişilerle buluşurken güvenlik önlemleri almanız önerilir
- Kalabalık ve güvenli mekanlarda buluşmanız önerilir
- Kişisel güvenliğiniz tamamen sizin sorumluluğunuzdadır

#### 2.3.3 İçerik Sorumluluğu
- Paylaştığınız tüm içeriklerden sorumlusunuz
- Yasalara aykırı, hakaret içeren, tehdit edici içerik paylaşamazsınız
- Başkalarının kişisel bilgilerini izinsiz paylaşamazsınız

### 2.4 Yasak Davranışlar

Aşağıdaki davranışlar kesinlikle yasaktır:

#### 2.4.1 Hesap ve Kimlik İhlalleri
- Sahte yaş beyanı
- Başkasının kimliğini kullanma
- Sahte üniversite e-posta adresi kullanma
- Birden fazla hesap açma

#### 2.4.2 Platform Kötüye Kullanımı
- Spam mesajlar gönderme
- Uygunsuz içerik paylaşma
- Taciz edici davranışlarda bulunma
- Ticari amaçlı kullanım
- Alkol satışı veya temin etme

#### 2.4.3 Teknik İhlaller
- Uygulamayı hacklemek veya kırmaya çalışmak
- Otomatik bot kullanma
- Sistemde açık arama

### 2.5 Hesap Askıya Alma ve Kapatma

Hesabınız aşağıdaki durumlarda askıya alınabilir veya kapatılabilir:

- Yaş hilesi yapılması
- Spam veya uygunsuz davranış
- Taciz veya hakaret
- Sahte bilgi kullanımı
- Teknik ihlaller
- Diğer kullanıcılardan çoklu şikayet alma

### 2.6 Sorumluluk Reddi

- BiraBuddy, kullanıcıların buluşmalardaki davranışlarından sorumlu değildir
- Kullanıcılar arası anlaşmazlıklarda taraf değiliz
- Uygulamadan kaynaklanan herhangi bir zarar için sorumluluk kabul etmeyiz
- Üçüncü parti mekanlardaki (bar, kafe vs.) olaylardan sorumlu değiliz

### 2.7 Hizmet Değişiklikleri

- Uygulama özelliklerini değiştirme hakkımızı saklı tutarız
- Hizmeti geçici veya kalıcı olarak durdurma hakkımızı saklı tutarız
- Kullanım koşullarını güncelleme hakkımızı saklı tutarız

---

## 3. GİZLİLİK POLİTİKASI

### 3.1 Topladığımız Bilgiler

#### 3.1.1 Kayıt Bilgileri
- Üniversite e-posta adresi
- Şifre (şifreli olarak saklanır)
- Instagram kullanıcı adı
- Yaş bilgisi
- Okuduğu bölüm

#### 3.1.2 Oda ve Buluşma Bilgileri
- Buluşma yeri (adı ve mahalle)
- Buluşma tarihi ve saati
- Katılımcı sayısı
- En sevilen içecek tercihi

#### 3.1.3 İletişim Bilgileri
- Chat mesajları (sadece oda katılımcıları arasında)
- Oda katılım istekleri

### 3.2 Bilgilerin Kullanımı

Topladığımız bilgileri şu amaçlarla kullanırız:

- Hesabınızı oluşturmak ve yönetmek
- Sosyal buluşma odaları oluşturmak
- Diğer kullanıcılarla eşleştirme yapmak
- Güvenlik ve dolandırıcılık önleme
- Uygulama performansını iyileştirmek
- Yasal yükümlülükleri yerine getirmek

### 3.3 Bilgi Paylaşımı

#### 3.3.1 Herkese Açık Bilgiler
- Instagram kullanıcı adı
- Yaş
- Bölüm bilgisi
- En sevilen içecek

#### 3.3.2 Oda Katılımcılarına Açık Bilgiler
- Buluşma yerinin adı
- Chat mesajları
- Oda detayları

#### 3.3.3 Gizli Bilgiler
- E-posta adresi (sadece sizin görebildiğiniz)
- Şifre bilgileri (şifreli)

### 3.4 Bilgi Güvenliği

- Verileriniz Firebase Firestore ile güvenli şekilde saklanır
- Şifreler güvenli yöntemlerle şifrelenir
- Düzenli güvenlik kontrolları yapılır
- Yetkisiz erişimlere karşı önlemler alınır

### 3.5 Bilgi Saklama

- Hesabınız silinene kadar verilerinizi saklarız
- Silinen hesaplar makul süre içinde tamamen silinir
- Chat mesajları oda kapandıktan sonra sınırlı süre saklanır
- Güvenlik logları sınırlı süre tutulur

### 3.6 Üçüncü Taraf Hizmetler

- Firebase/Google servisleri kullanılır (Amerika sunucuları)
- Analitik veya reklam hizmeti şu an kullanılmamaktır
- İleride reklam hizmetleri eklenebilir (önceden bildirilir)

### 3.7 Bildirimler

- Uygulama içi bildirimler gönderebiliriz
- Oda davetleri, mesajlar için bildirim alabilirsiniz
- Bildirim ayarlarınızı kontrol edebilirsiniz

---

## 4. HAKLARINIZ

### 4.1 Veri Hakları (KVKK Kapsamında)

- Verilerinizin işlenip işlenmediğini öğrenme
- İşlenen veriler hakkında bilgi alma
- İşlenme amacını öğrenme
- Yanlış verilerin düzeltilmesini isteme
- Verilerin silinmesini isteme
- İtiraz etme hakkı

### 4.2 Hesap Hakları

- Hesabınızı istediğiniz zaman silebilirsiniz
- Profil bilgilerinizi güncelleyebilirsiniz
- Gizlilik ayarlarınızı değiştirebilirsiniz
- Bildirimleri kapatabilirsiniz

---

## 5. İLETİŞİM

Sorularınız, şikayetleriniz veya veri talepleriniz için:

**E-posta:** birabuddy@gmail.com

- Talepleriniz 30 gün içinde yanıtlanır
- KVKK hakları için Veri Koruma Kurulu'na başvurabilirsiniz

---

## 6. DEĞİŞİKLİKLER

- Bu koşulları istediğimiz zaman güncelleyebiliriz
- Önemli değişiklikler uygulama üzerinden bildirilir
- Güncellemelerden sonra kullanım devam etmesi kabul sayılır

---

## 7. YASAL UYUM

- Bu koşullar Türkiye Cumhuriyeti yasalarına tabidir
- Uyuşmazlıklar Türk mahkemelerinde çözülür
- 6698 sayılı KVKK'ya uygun olarak hazırlanmıştır

---

**Bu dökümanı okuyarak ve uygulamayı kullanarak tüm koşulları kabul etmiş sayılırsınız.**

Son güncelleme: ${new Date().toLocaleDateString('tr-TR')}
  `;

  // Updated validation function to accept .edu.tr AND .edu
  const validateEmail = (email) => {
    const emailLower = email.toLowerCase().trim();
    
    // Allow either .edu.tr OR .edu
    const isEduTr = emailLower.endsWith('.edu.tr');
    const isEdu = emailLower.endsWith('.edu');

    if (!isEduTr && !isEdu) {
      return false;
    }
    
    // Standard regex for email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateInstagramUsername = (username) => {
    if (username.length < 2) return false;
    if (username.length > 30) return false;
    const instagramRegex = /^[a-zA-Z0-9._]+$/;
    return instagramRegex.test(username);
  };

  const validatePassword = (password) => {
    if (password.length < 6) return false;
    return true;
  };

const handleRegister = async () => {
    const trimmedEmail = email.trim();
    const trimmedInstagramUsername = instagramUsername.trim();

    if (!trimmedEmail || !password || !trimmedInstagramUsername) {
      Alert.alert(t('missingFields'), t('missingFieldsRegister'));
      return;
    }

    if (!kvkkAccepted) {
      Alert.alert(t('kvkkRequired'), t('kvkkRequiredMessage'));
      return;
    }

    if (!ageConfirmed) {
      Alert.alert(t('ageConfirmRequired'), t('ageConfirmMessage'));
      return;
    }

    if (!termsAccepted) {
      Alert.alert(t('termsRequired'), t('termsRequiredMessage'));
      return;
    }

    if (!validateInstagramUsername(trimmedInstagramUsername)) {
      Alert.alert(
        t('invalidUsername'), 
        t('invalidInstagramUsername')
      );
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert(
        t('invalidEmail'),
        t('invalidEmailRegister')
      );
      return;
    }

    if (!validatePassword(password)) {
      Alert.alert(
        t('weakPassword'),
        t('weakPassword')
      );
      return;
    }

    setLoading(true);
    let userCredential = null;

    try {
      console.log('Creating user account...');
      userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      console.log('User account created successfully');

      console.log('Sending verification email...');
      try {
        await sendEmailVerification(userCredential.user);
        console.log('Verification email sent');
      } catch (emailError) {
        console.log('Email verification error:', emailError);
        try {
          await deleteUser(userCredential.user);
        } catch (cleanupError) {}
        
        Alert.alert(
          t('registrationFailed'),
          t('registrationFailed')
        );
        return;
      }

      // AUTOMATICALLY DETECT UNIVERSITY FROM DOMAIN
      let university = 'University Student';
      try {
        const domainPart = trimmedEmail.split('@')[1]; 
        if (domainPart) {
            // Remove common prefixes
            let cleanDomain = domainPart.replace('std.', '').replace('mail.', '').replace('ogrenci.', '');
            // Remove .edu.tr OR .edu
            let uniName = cleanDomain.replace('.edu.tr', '').replace('.edu', '');
            // Capitalize
            university = uniName.toUpperCase() + ' UNIV.';
        }
      } catch (e) {
        console.log("Could not parse university name, using default.");
      }

      console.log('Saving user data to Firestore...');
      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          instagram: trimmedInstagramUsername,
          email: trimmedEmail,
          university: university,
          emailVerified: false,
          createdAt: new Date(),
          lastLogin: null,
          kvkkConsent: true,
          kvkkConsentDate: new Date(),
          kvkkConsentVersion: '1.0',
          ageConfirmed: true,
          ageConfirmationDate: new Date(),
          termsAccepted: true,
          termsAcceptanceDate: new Date(),
          termsVersion: '1.0'
        });
      } catch (firestoreError) {
        console.log('Firestore error (non-critical):', firestoreError);
      }

      console.log('Signing out user...');
      await signOut(auth);

      Alert.alert(
        t('accountCreatedSuccess'),
        t('verificationSentTo', { email: trimmedEmail }),
        [
          {
            text: t('gotIt'),
            onPress: () => router.push('/login')
          }
        ]
      );

    } catch (error) {
      console.log('Registration error:', error);
      
      if (userCredential?.user) {
        try {
          await deleteUser(userCredential.user);
        } catch (cleanupError) {}
      }

      let errorMessage = t('registrationFailedGeneric');
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = t('emailAlreadyInUse');
      } else if (error.code === 'auth/weak-password') {
        errorMessage = t('passwordTooWeak');
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = t('invalidEmailAddress');
      }
      
      Alert.alert(t('registrationFailed'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('joinMeetups')}</Text>
      <Text style={styles.subtitle}>{t('forUniversityStudents')}</Text>
      
      <TextInput
        style={styles.input}
        placeholder={t('instagramUsernamePlaceholder')}
        placeholderTextColor={BeerColors.textMuted}
        value={instagramUsername}
        onChangeText={setInstagramUsername}
        maxLength={30}
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder={t('studentEmailRegister')}
        placeholderTextColor={BeerColors.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      
      <TextInput
        style={styles.input}
        placeholder={t('passwordPlaceholder')}
        placeholderTextColor={BeerColors.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />

      <View style={styles.agreementsContainer}>
        
        <View style={styles.agreementItem}>
          <Pressable 
            style={styles.checkboxContainer}
            onPress={() => setAgeConfirmed(!ageConfirmed)}
          >
            <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
              {ageConfirmed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>
              {t('ageConfirmation')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.agreementItem}>
          <Pressable 
            style={styles.checkboxContainer}
            onPress={() => setKvkkAccepted(!kvkkAccepted)}
          >
            <View style={[styles.checkbox, kvkkAccepted && styles.checkboxChecked]}>
              {kvkkAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>
              {t('kvkkAcceptance')}
            </Text>
          </Pressable>
          <Pressable 
            style={styles.detailButton}
            onPress={() => setShowKvkkModal(true)}
          >
            <Text style={styles.detailText}>{t('readText')}</Text>
          </Pressable>
        </View>

        <View style={styles.agreementItem}>
          <Pressable 
            style={styles.checkboxContainer}
            onPress={() => setTermsAccepted(!termsAccepted)}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>
              {t('termsAcceptance')}
            </Text>
          </Pressable>
          <Pressable 
            style={styles.detailButton}
            onPress={() => setShowTermsModal(true)}
          >
            <Text style={styles.detailText}>{t('readText')}</Text>
          </Pressable>
        </View>

      </View>
      
      <Pressable 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={BeerColors.textPrimary} />
        ) : (
          <Text style={styles.buttonText}>{t('createAccount')}</Text>
        )}
      </Pressable>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          📧 {t('verificationEmailInfo')}
        </Text>
      </View>

      <Link href="/login" asChild>
        <Pressable>
          <Text style={styles.link}>{t('alreadyHaveAccount')}</Text>
        </Pressable>
      </Link>

      {/* KVKK Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showKvkkModal}
        onRequestClose={() => setShowKvkkModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('kvkkText')}</Text>
            <ScrollView style={styles.modalScrollView}>
              <Text style={styles.modalText}>{kvkkFullText}</Text>
            </ScrollView>
            <View style={styles.modalButtons}>
              <Pressable 
                style={styles.modalCloseButton}
                onPress={() => setShowKvkkModal(false)}
              >
                <Text style={styles.modalCloseText}>{t('close')}</Text>
              </Pressable>
              <Pressable 
                style={styles.modalAcceptButton}
                onPress={() => {
                  setKvkkAccepted(true);
                  setShowKvkkModal(false);
                }}
              >
                <Text style={styles.modalAcceptText}>{t('accept')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Kullanım Koşulları Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showTermsModal}
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('termsAndPrivacy')}</Text>
            <ScrollView style={styles.modalScrollView}>
              <Text style={styles.modalText}>{termsAndPrivacyText}</Text>
            </ScrollView>
            <View style={styles.modalButtons}>
              <Pressable 
                style={styles.modalCloseButton}
                onPress={() => setShowTermsModal(false)}
              >
                <Text style={styles.modalCloseText}>{t('close')}</Text>
              </Pressable>
              <Pressable 
                style={styles.modalAcceptButton}
                onPress={() => {
                  setTermsAccepted(true);
                  setShowTermsModal(false);
                }}
              >
                <Text style={styles.modalAcceptText}>{t('accept')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BeerColors.background,
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: BeerColors.textSecondary,
    marginBottom: 30,
    textAlign: 'center',
    opacity: 0.8,
  },
  input: {
    backgroundColor: BeerColors.panel,
    color: BeerColors.textPrimary,
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 12,
  },
  agreementsContainer: {
    marginBottom: 16,
    backgroundColor: 'rgba(78, 4, 225, 0.2)',
    padding: 12,
    borderRadius: 8,
  },
  agreementItem: {
    marginBottom: 12,
  },
  detailButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  detailText: {
    color: BeerColors.textPrimary,
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: BeerColors.borderSoft,
    borderRadius: 3,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: BeerColors.panelElevated,
  },
  checkmark: {
    color: BeerColors.textPrimary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxText: {
    color: BeerColors.textPrimary,
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  button: {
    backgroundColor: BeerColors.panelElevated,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: BeerColors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: 'rgba(78, 4, 225, 0.3)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    color: BeerColors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  link: {
    color: BeerColors.textPrimary,
    textAlign: 'center',
    marginTop: 16,
    textDecorationLine: 'underline',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    backgroundColor: BeerColors.panel,
    margin: 20,
    borderRadius: 10,
    padding: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BeerColors.textPrimary,
    textAlign: 'center',
    marginBottom: 15,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalText: {
    color: BeerColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'left',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalCloseButton: {
    backgroundColor: '#666',
    padding: 12,
    borderRadius: 8,
    flex: 0.45,
  },
  modalAcceptButton: {
    backgroundColor: BeerColors.panelElevated,
    padding: 12,
    borderRadius: 8,
    flex: 0.45,
  },
  modalCloseText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  modalAcceptText: {
    color: BeerColors.textPrimary,
    textAlign: 'center',
    fontWeight: 'bold',
  },
});