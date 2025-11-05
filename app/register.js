import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, deleteUser } from 'firebase/auth';
import { auth, db } from '../firebase/firebaseConfig';
import { Link, useRouter } from 'expo-router';
import { setDoc, doc } from 'firebase/firestore';

export default function Register() {
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

  // Updated allowed domains array
  const allowedDomains = ["@std.bogazici.edu.tr", "@std.yildiz.edu.tr", "@itu.edu.tr"];

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
Aşağıdaki bilgiler yalnızca sizin görebileceğiniz bilgilerdir:
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

  // Updated validation function for multiple domains
const validateEmail = (email) => {
    const emailLower = email.toLowerCase();
    const isValidDomain = allowedDomains.some(domain => emailLower.endsWith(domain.toLowerCase()));
    
    if (!isValidDomain) {
      return false;
    }
    
    // Find which domain it matches and get the username part
    const matchedDomain = allowedDomains.find(domain => emailLower.endsWith(domain.toLowerCase()));
    const username = emailLower.replace(matchedDomain.toLowerCase(), '');
    
    if (username.length < 1) {
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateInstagramUsername = (username) => {
    if (username.length < 2) return false;
    if (username.length > 30) return false;
    // Instagram username validation: letters, numbers, underscores, periods
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

    // Field validation
    if (!trimmedEmail || !password || !trimmedInstagramUsername) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }

    // KVKK onay kontrolü
    if (!kvkkAccepted) {
      Alert.alert('KVKK Onayı Gerekli', 'Devam etmek için KVKK aydınlatma metnini kabul etmeniz gerekmektedir.');
      return;
    }

    // Yaş onay kontrolü
    if (!ageConfirmed) {
      Alert.alert('Yaş Onayı Gerekli', 'Bu uygulama sadece 18 yaş ve üzeri kişiler içindir. Yaş onayını vermeniz gerekmektedir.');
      return;
    }

    // Kullanım koşulları kontrolü
    if (!termsAccepted) {
      Alert.alert('Kullanım Koşulları', 'Devam etmek için Kullanım Koşulları ve Gizlilik Politikasını kabul etmeniz gerekmektedir.');
      return;
    }

    if (!validateInstagramUsername(trimmedInstagramUsername)) {
      Alert.alert(
        'Invalid Instagram Username', 
        'Instagram username must be 2-30 characters and contain only letters, numbers, dots, or underscores.'
      );
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert(
        'Invalid Email',
        'Please enter a valid university student email from: Boğaziçi University, Yıldız Technical University, or Istanbul Technical University'
      );
      return;
    }

    if (!validatePassword(password)) {
      Alert.alert(
        'Weak Password',
        'Password must be at least 6 characters long.'
      );
      return;
    }

    setLoading(true);
    let userCredential = null;

    try {
      // Step 1: Create user account
      console.log('Creating user account...');
      userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      console.log('User account created successfully');

      // Step 2: Send email verification immediately after account creation
      console.log('Sending verification email...');
      try {
        await sendEmailVerification(userCredential.user);
        console.log('Verification email sent');
      } catch (emailError) {
        console.log('Email verification error:', emailError);
        // If verification email fails, clean up and inform user
        try {
          await deleteUser(userCredential.user);
        } catch (cleanupError) {
          console.log('Could not clean up user after email failure:', cleanupError);
        }
        
        Alert.alert(
          'Registration Failed',
          'We couldn\'t send the verification email. Please try registering again or check your internet connection.'
        );
        return;
      }

      // Determine university based on email domain
      let university = 'University';
      const emailLower = trimmedEmail.toLowerCase();
      if (emailLower.includes('@std.bogazici.edu.tr')) {
        university = 'Boğaziçi University';
      } else if (emailLower.includes('@std.yildiz.edu.tr')) {
        university = 'Yıldız Technical University';
      } else if (emailLower.includes('@itu.edu.tr')) {
        university = 'Istanbul Technical University';
      }

      // Step 3: Save user data to Firestore - KVKK bilgileri ile birlikte
      console.log('Saving user data to Firestore...');
      console.log('Instagram username being saved:', trimmedInstagramUsername);
      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          instagram: trimmedInstagramUsername,  // Use 'instagram' field to match existing data structure
          email: trimmedEmail,
          university: university,
          emailVerified: false,
          createdAt: new Date(),
          lastLogin: null,
          // KVKK ve yasal onay bilgileri
          kvkkConsent: true,
          kvkkConsentDate: new Date(),
          kvkkConsentVersion: '1.0', // Metin versiyonu takibi için
          ageConfirmed: true,
          ageConfirmationDate: new Date(),
          termsAccepted: true,
          termsAcceptanceDate: new Date(),
          termsVersion: '1.0'
        });
        console.log('User data saved to Firestore successfully');
        console.log('User data saved to Firestore');
      } catch (firestoreError) {
        console.log('Firestore error (non-critical):', firestoreError);
      }

      // Step 4: Sign out user immediately
      console.log('Signing out user...');
      await signOut(auth);
      console.log('User signed out successfully');

      // Success message
      Alert.alert(
        '✅ Account Created Successfully!',
        `Verification email sent to ${trimmedEmail}.\n\nPlease check your inbox (including spam folder) and click the verification link before logging in.`,
        [
          {
            text: 'Got it!',
            onPress: () => router.push('/login')
          }
        ]
      );

    } catch (error) {
      console.log('Registration error:', error);
      
      // If user was created but something else failed, clean up
      if (userCredential?.user) {
        try {
          await deleteUser(userCredential.user);
          console.log('Cleaned up partially created user');
        } catch (cleanupError) {
          console.log('Could not clean up user:', cleanupError);
        }
      }

      // Handle specific Firebase errors
      let errorMessage = 'Registration failed. Please try again.';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Try logging in instead.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please choose a stronger password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many registration attempts. Please wait a moment and try again.';
      }
      
      Alert.alert('Registration Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>join meetups</Text>
      <Text style={styles.subtitle}>for university students</Text>
      
      <TextInput
        style={styles.input}
        placeholder="instagram username (will be public)"
        placeholderTextColor="#aaa"
        value={instagramUsername}
        onChangeText={setInstagramUsername}
        maxLength={30}
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="student email (bogazici/yildiz/itu)"
        placeholderTextColor="#aaa"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      
      <TextInput
        style={styles.input}
        placeholder="password (pls choose it different than uni email password)"
        placeholderTextColor="#aaa"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />

      {/* Tüm Onay Kutuları */}
      <View style={styles.agreementsContainer}>
        
        {/* Yaş Onayı */}
        <View style={styles.agreementItem}>
          <Pressable 
            style={styles.checkboxContainer}
            onPress={() => setAgeConfirmed(!ageConfirmed)}
          >
            <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
              {ageConfirmed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>
              18 yaşından büyük olduğumu onaylıyorum
            </Text>
          </Pressable>
        </View>

        {/* KVKK Onayı */}
        <View style={styles.agreementItem}>
          <Pressable 
            style={styles.checkboxContainer}
            onPress={() => setKvkkAccepted(!kvkkAccepted)}
          >
            <View style={[styles.checkbox, kvkkAccepted && styles.checkboxChecked]}>
              {kvkkAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>
              KVKK aydınlatma metnini okudum ve kabul ediyorum
            </Text>
          </Pressable>
          <Pressable 
            style={styles.detailButton}
            onPress={() => setShowKvkkModal(true)}
          >
            <Text style={styles.detailText}>Metni Oku</Text>
          </Pressable>
        </View>

        {/* Kullanım Koşulları */}
        <View style={styles.agreementItem}>
          <Pressable 
            style={styles.checkboxContainer}
            onPress={() => setTermsAccepted(!termsAccepted)}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>
              Kullanım Koşulları ve Gizlilik Politikasını kabul ediyorum
            </Text>
          </Pressable>
          <Pressable 
            style={styles.detailButton}
            onPress={() => setShowTermsModal(true)}
          >
            <Text style={styles.detailText}>Metni Oku</Text>
          </Pressable>
        </View>

      </View>
      
      <Pressable 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#e5f253ff" />
        ) : (
          <Text style={styles.buttonText}>create account</Text>
        )}
      </Pressable>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          📧 You'll receive a verification email that you must click before you can log in. Check your spam folder too!
        </Text>
      </View>

      <Link href="/login" asChild>
        <Pressable>
          <Text style={styles.link}>already have an account? log in</Text>
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
            <Text style={styles.modalTitle}>KVKK Aydınlatma Metni</Text>
            <ScrollView style={styles.modalScrollView}>
              <Text style={styles.modalText}>{kvkkFullText}</Text>
            </ScrollView>
            <View style={styles.modalButtons}>
              <Pressable 
                style={styles.modalCloseButton}
                onPress={() => setShowKvkkModal(false)}
              >
                <Text style={styles.modalCloseText}>Kapat</Text>
              </Pressable>
              <Pressable 
                style={styles.modalAcceptButton}
                onPress={() => {
                  setKvkkAccepted(true);
                  setShowKvkkModal(false);
                }}
              >
                <Text style={styles.modalAcceptText}>Kabul Et</Text>
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
            <Text style={styles.modalTitle}>Kullanım Koşulları ve Gizlilik Politikası</Text>
            <ScrollView style={styles.modalScrollView}>
              <Text style={styles.modalText}>{termsAndPrivacyText}</Text>
            </ScrollView>
            <View style={styles.modalButtons}>
              <Pressable 
                style={styles.modalCloseButton}
                onPress={() => setShowTermsModal(false)}
              >
                <Text style={styles.modalCloseText}>Kapat</Text>
              </Pressable>
              <Pressable 
                style={styles.modalAcceptButton}
                onPress={() => {
                  setTermsAccepted(true);
                  setShowTermsModal(false);
                }}
              >
                <Text style={styles.modalAcceptText}>Kabul Et</Text>
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
    backgroundColor: '#000000ff',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#DCD8A7',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#DCD8A7',
    marginBottom: 30,
    textAlign: 'center',
    opacity: 0.8,
  },
  input: {
    backgroundColor: '#4e04e1ff',
    color: '#dce38dff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 12,
  },
  // Yeni Stil Tanımları
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
    color: '#e5f253ff',
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
    borderColor: '#DCD8A7',
    borderRadius: 3,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#4e04e1ff',
  },
  checkmark: {
    color: '#e5f253ff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxText: {
    color: '#DCD8A7',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  kvkkDetailButton: {
    alignSelf: 'flex-start',
  },
  kvkkDetailText: {
    color: '#e5f253ff',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  button: {
    backgroundColor: '#4e04e1ff',
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
    color: '#e5f253ff',
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
    color: '#DCD8A7',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  link: {
    color: '#DCD8A7',
    textAlign: 'center',
    marginTop: 16,
    textDecorationLine: 'underline',
  },
  // Modal Stilleri
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    margin: 20,
    borderRadius: 10,
    padding: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DCD8A7',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalText: {
    color: '#DCD8A7',
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
    backgroundColor: '#4e04e1ff',
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
    color: '#e5f253ff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});