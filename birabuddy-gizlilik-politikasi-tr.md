# birabuddy — Gizlilik Politikası ve KVKK Aydınlatma Metni

**Son Güncelleme:** Haziran 2026
**Yürürlük Tarihi:** Hesap oluşturulduğu tarih itibarıyla

Bu belge; hem Gizlilik Politikamız hem de 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hazırlanması zorunlu olan Aydınlatma Metni olarak işlev görmektedir.

---

## 1. Veri Sorumlusu

Kişisel verilerinizin işlenmesinden sorumlu veri sorumlusu:

**Çağlar Yıldırım** (bireysel işletici)
İletişim: birabuddy@gmail.com
Adres: İstanbul, Türkiye

---

## 2. Toplanan Veriler

### 2.1 Kayıt Sırasında (zorunlu)

- **Üniversite e-posta adresi** — .edu veya .edu.tr uzantılı olması zorunludur. Öğrenci statüsünün doğrulanması, adınızın ve üniversitenizin tespit edilmesi amacıyla kullanılır.
- **Ad** — e-posta adresinizin @ önceki bölümünden otomatik olarak türetilir.
- **Üniversite** — e-posta alan adınızdan otomatik olarak tespit edilir.
- **Instagram kullanıcı adı** — Platformdaki görünür kullanıcı adınız olarak kullanılır ve buluşma taleplerinde diğer kullanıcıların kimliğinizi doğrulayabilmesi amacıyla profilinizde gösterilir.
- **Şifre** — Tamamen Firebase Authentication tarafından yönetilmektedir. Şifreniz tarafımızca hiçbir şekilde saklanmaz.
- **Onay kayıtları** — KVKK onayınızın, yaş doğrulamanızın ve kullanım koşulları kabulünüzün tarihi ve sürüm numarası.

### 2.2 Kayıt Sonrasında (tümü isteğe bağlı)

- **Profil fotoğrafları** — Firebase Storage'da saklanan en fazla 5 fotoğraf.
- **Yaş** — Girilmesi halinde 18 veya üzeri olması zorunludur.
- **Akademik bölüm**
- **Biyografi** — En fazla 150 karakter serbest metin.
- **Favori içki**
- **Favori mekân veya mahalle**
- **Vibe etiketleri** — Sabit bir listeden seçtiğiniz ilgi alanı kategorileri.

### 2.3 Uygulama Kullanımı Sırasında

- **Paylaşımlar** — Paylaşmayı tercih ettiğiniz metin, fotoğraflar (çift kamera görüntüleri dahil), mekân etiketleri ve içki kayıtları.
- **Yorumlar** — Paylaşımlara yazdığınız metinler.
- **Oda verileri** — Oluşturduğunuz veya katıldığınız odalara ait oda adı, açıklama, şehir, mahalle, mekân adı, tarih, saat ve katılımcı listeleri.
- **Mesajlar** — Oda içi sohbet mesajları ve arkadaşlarla yapılan bire bir yazışmalar.
- **Arkadaşlık verileri** — Gönderdiğiniz ve aldığınız arkadaşlık istekleri ile kabul edilmiş arkadaş listeniz.
- **"Go Live" durumu** — İsteğe bağlı not ve izin vermeniz halinde yaklaşık konumunuz (bkz. Bölüm 5).
- **Engelleme kayıtları** — Engellediğiniz kullanıcılara ait kayıtlar.
- **Şikâyet kayıtları** — Diğer kullanıcılar veya içerikler hakkında ilettiğiniz şikâyetler.
- **Buluşma geçmişi** — Katıldığınız odalara ilişkin istatistiksel amaçla hesabınızda saklanan kayıt.

### 2.4 Teknik Veriler

- **Expo Push Token** — Anlık bildirim iletimi için kullanılan cihaz tanımlayıcısı.
- **Giriş zaman damgaları** — Son giriş tarihi ve saati.

---

## 3. Verilerinizin Kullanım Amaçları

Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:

- Hesabınızın oluşturulması ve yönetilmesi
- Katıldığınız odalarda veya kullanıcı aramalarında profilinizin diğer doğrulanmış kullanıcılara gösterilmesi
- Sosyal buluşmalar için diğer üniversite öğrencileriyle eşleştirilmeniz
- Uygulama içi mesajlaşma ve arkadaşlık bağlantılarının sağlanması
- "Go Live" durumunuzu ve yaklaşık konumunuzu etkinleştirdiğinizde arkadaşlarınıza gösterilmesi
- Oda etkinlikleri, arkadaşlık istekleri, buluşma hatırlatmaları ve arkadaş aktivitelerine ilişkin anlık bildirimlerin gönderilmesi
- Moderasyon, şikâyet ve engelleme mekanizmaları aracılığıyla topluluk güvenliğinin sağlanması
- Hukuki taleplere yanıt verilmesi ve Türk mevzuatına uyum sağlanması
- Platformun teknik işleyişinin sürdürülmesi ve iyileştirilmesi

---

## 4. İşlemenin Hukuki Dayanakları (KVKK Madde 5)

| Veri | Hukuki Dayanak |
|------|----------------|
| Kayıt verileri, temel hesap işlevselliği | Sözleşmenin kurulması veya ifası |
| Profil fotoğrafları, isteğe bağlı profil alanları | Açık rıza |
| Go Live sırasında konum verisi | Etkinleştirme anında alınan açık rıza |
| Anlık bildirim tokeni | İzin verildiğinde alınan açık rıza |
| Moderasyon verileri, şikâyetler, güvenlik kayıtları | Veri sorumlusunun ve kullanıcıların meşru menfaati |
| Hesap silme sonrası yasal saklama | Hukuki yükümlülük |
| Uluslararası veri aktarımları (Firebase, Expo) | Kayıt sırasında alınan açık rıza |

---

## 5. Konum Verisi

Konumunuza yalnızca **"Go Live" butonuna aktif olarak bastığınızda** ve önceden konum iznini vermiş olmanız halinde erişilmektedir. Bu anda:

- GPS koordinatlarınız yalnızca bir kez okunur
- Hassasiyet hemen yaklaşık 1 kilometreye indirilir (koordinatlar 2 ondalık basamağa yuvarlanarak)
- Yalnızca bu bulanık, düşük hassasiyetli koordinat saklanır; kesin konumunuz hiçbir zaman işlenmez
- Bu yaklaşık konum yalnızca arkadaşlarınızla paylaşılır

Konumunuz arka planda veya sürekli olarak takip edilmez. Çevrimdışı olduğunuzda veya ertesi sabah saat 06:00'da konum bilginiz sistemlerimizden silinir. Konum iznini istediğiniz zaman cihaz ayarlarınızdan geri alabilirsiniz.

---

## 6. Anlık Bildirimler

Anlık bildirimler şu durumlarda gönderilmektedir: arkadaşlık istekleri ve kabulleri, oda katılım talepleri ve onayları, oda doluluk güncellemeleri, buluşma etkinlik hatırlatmaları, arkadaş paylaşım özetleri ve arkadaşların Go Live olması. Hesabınızı etkilemeksizin anlık bildirimleri istediğiniz zaman cihaz ayarlarınızdan devre dışı bırakabilirsiniz.

---

## 7. Diğer Kullanıcıların Sizin Hakkınızda Görebilecekleri

birabuddy'yi kullanırken aşağıdaki bilgiler platformun tüm doğrulanmış kullanıcılarına görünürdür:

- Ad, üniversite, bölüm, yaş, biyografi, profil fotoğrafları, vibe etiketleri, favori içki, favori mekân
- Instagram kullanıcı adı (Instagram profilinize yönlendiren tıklanabilir bağlantı)
- Aktif olduğunda "Go Live" durumunuz ve notunuz
- Bunu paylaşmayı tercih ettiğinizde Go Live sırasında yaklaşık konumunuz
- Herkese açık görünürlükle yaptığınız paylaşımlar
- Yalnızca arkadaşlar görünürlüğüyle yaptığınız paylaşımlar (sadece arkadaşlarınıza görünür)

Aşağıdakiler **hiçbir kullanıcıya görünmez:**

- E-posta adresiniz
- Engellediğiniz kullanıcılar
- Moderasyon veya ceza geçmişiniz
- Onay kayıtlarınız ve zaman damgaları
- Anlık bildirim tokeniniz
- Giriş zaman damgalarınız

---

## 8. Üçüncü Taraf Hizmetleri

Aşağıdaki üçüncü taraf hizmetleri kullanmaktayız. birabuddy'yi kullanarak verilerinizin bu hizmetler tarafından açıklandığı şekilde işlenmesini kabul etmiş olursunuz:

**Firebase (Google LLC, ABD)**
Platformun işletilmesi amacıyla Firebase Authentication, Cloud Firestore, Firebase Storage ve Firebase Cloud Functions hizmetlerini kullanmaktayız. Hesap verileriniz, paylaşımlarınız, mesajlarınız ve fotoğraflarınız Türkiye dışında bulunabilecek Firebase sunucularında saklanmaktadır. Google'ın gizlilik politikasına policies.google.com/privacy adresinden ulaşabilirsiniz.

**Expo (Expo Inc., ABD)**
Cihazınıza bildirim iletimi için Expo'nun anlık bildirim hizmetini kullanmaktayız. Anlık bildirim tokeniniz, Apple (APNs) veya Google (FCM) aracılığıyla cihazınıza ulaşmadan önce Expo sunucularından geçmektedir. Expo'nun gizlilik politikasına expo.dev/privacy adresinden ulaşabilirsiniz.

**Apple Haritalar / Google Haritalar (react-native-maps aracılığıyla)**
Canlı harita özelliğinin görüntülenmesi amacıyla kullanılmaktadır. Harita oluşturma istekleri, cihaz platformunuza göre Apple veya Google tarafından işlenmektedir. Haritanın görüntülenmesi için gereken minimum verinin ötesinde herhangi bir kişisel konum bilgisi bu hizmetlerle paylaşılmamaktadır.

Herhangi bir analitik, reklam veya davranışsal izleme hizmeti kullanılmamaktadır. Üçüncü taraflara reklam veya profilleme amacıyla veri aktarımı yapılmamaktadır.

---

## 9. Yurt Dışına Veri Aktarımı (KVKK Madde 9)

Firebase ve Expo sunucuları Amerika Birleşik Devletleri'nde konumlanmaktadır. Kayıt olarak ve birabuddy'yi kullanarak; kişisel verilerinizin hizmetin işletilmesi amacıyla Türkiye dışına, başta Amerika Birleşik Devletleri olmak üzere diğer ülkelere aktarılmasına ve bu ülkelerde işlenmesine açık rıza vermiş olursunuz.

---

## 10. Veri Saklama ve Silme

**Hesabınız aktifken:** Hesabınızı aktif tuttuğunuz sürece verileriniz saklanmaktadır.

**Hesap silme işleminin ardından:**

- Profiliniz derhal anonimleştirilir (ad "Silinmiş Kullanıcı" olarak değiştirilir, fotoğraflar kaldırılır, biyografi ve kişisel alanlar temizlenir)
- Paylaşımlarınız ve yorumlarınız diğer tüm kullanıcılardan derhal gizlenir
- E-postanızı, üniversitenizi, onay kayıtlarınızı ve etkinlik günlüklerinizi içeren yumuşak silinmiş kayıt; yasal uyum, güvenlik ve uyuşmazlık çözümü amacıyla silme tarihinden itibaren **2 yıl** süreyle saklanır
- 2 yılın ardından tüm kalan veriler sistemlerimizden kalıcı ve geri dönüşü olmayan biçimde silinir

**Hiçbir zaman silinmeyen veriler:**

- Hakkınızda yapılan şikâyet kayıtları — hesap silme işleminden bağımsız olarak Türk hukuki yükümlülükleri ve diğer kullanıcıların korunması amacıyla süresiz olarak saklanmaktadır

---

## 11. KVKK Kapsamındaki Haklarınız (Madde 11)

6698 sayılı KVKK uyarınca ilgili kişi olarak aşağıdaki haklara sahipsiniz:

a) Kişisel verilerinizin işlenip işlenmediğini öğrenme
b) Kişisel verileriniz işlenmişse buna ilişkin bilgi talep etme
c) Kişisel verilerinizin işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme
d) Yurt içinde veya yurt dışında kişisel verilerinizin aktarıldığı üçüncü kişileri bilme
e) Kişisel verilerinizin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme
f) KVKK'nın 7. maddesinde öngörülen şartlar çerçevesinde kişisel verilerinizin silinmesini veya yok edilmesini isteme
g) Yukarıdaki düzeltme ve silme işlemlerinin, kişisel verilerinizin aktarıldığı üçüncü kişilere bildirilmesini isteme
h) İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle kişinin aleyhine bir sonucun ortaya çıkmasına itiraz etme
i) Kişisel verilerinizin kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme

Bu haklarınızı kullanmak için **birabuddy@gmail.com** adresine talebinizi iletebilirsiniz. Talepler 30 gün içinde yanıtlanacaktır. Taleplerin büyük çoğunluğu için herhangi bir ücret alınmamaktadır.

---

## 12. Çocukların Gizliliği

birabuddy yalnızca 18 yaş ve üzeri kullanıcılara yöneliktir. 18 yaşından küçük kişilerden bilerek veri toplamıyoruz. 18 yaşından küçük birinin kayıt olduğuna inanıyorsanız derhal birabuddy@gmail.com adresinden bizimle iletişime geçiniz; gerekli işlemi hemen gerçekleştireceğiz.

---

## 13. Veri Güvenliği

Verilerinizin korunması için; aktarımda ve duran halde şifreleme, erişim kontrolleri ve düzenli güvenlik güncellemelerini kapsayan Firebase güvenlik altyapısından yararlanmaktayız. Bununla birlikte hiçbir sistem tamamen güvenli değildir ve mutlak koruma sağlayamayız. Hesap kimlik bilgilerinizi gizli tutmak sizin sorumluluğunuzdadır.

---

## 14. Politikada Yapılacak Değişiklikler

Veri uygulamalarımız değiştiğinde bu politikayı güncelleyebiliriz. Önemli değişiklikleri yürürlüğe girmeden önce uygulama aracılığıyla size bildireceğiz. Değişikliklerin yürürlüğe girmesinin ardından birabuddy'yi kullanmaya devam etmeniz, güncellenmiş politikayı kabul ettiğiniz anlamına gelir. Bu belgenin başındaki "Son Güncelleme" tarihi her zaman güncel sürümü yansıtmaktadır.

---

## 15. İletişim

Tüm gizlilik ile KVKK ile ilgili talepler, sorular veya şikâyetler için:

**Çağlar Yıldırım**
birabuddy@gmail.com
İstanbul, Türkiye
