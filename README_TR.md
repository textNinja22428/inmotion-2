# IN MOTION — Android Uygulaması (v1)

Bu proje, kullanıcının sağladığı iki görsel ve MP3 ile hazırlanan, çevrimdışı çalışan kişisel ajanda uygulamasıdır.

## Özellikler

- Açılışta orijinal **IN MOTION** görseli; hafif yaprak/rüzgâr animasyonu; altın şimşeğin belirli aralıklarla çakması.
- Açılıştan itibaren sağlanan **Beneath the Mask.mp3** çalar; uygulama arka plandaysa duraklar; tekrar açılınca devam eder.
- İlk ekrana **çift dokunma** ile sekiz kutucuklu ajandaya geçiş.
- Her birine dokununca büyüyerek açılan not editörü; **SAVE** ile kalıcı kayıt.
- Notlar sadece cihazda yerel olarak saklanır (WebView localStorage). Sunucu ve internet gerektirmez.
- Sağ üstteki ayarlardan **müziği kapatıp açma** (seçim hatırlanır).
- Sağ üstten ayarlar, sol üstten kapağa dönme; Android geri tuşu/geri hareketi desteklenir.

## Android Studio'da APK oluşturma

1. Bilgisayarınıza [Android Studio](https://developer.android.com/studio) kurun.
2. **IN_MOTION_Android_Project** klasörünü açın (**Open**); `app` klasörünü tek başına açmayın.
3. Android Studio'nun SDK 35 / Gradle 8.10.2 bileşenlerini indirmesine ve **Gradle Sync** işlemini bitirmesine izin verin.
4. Menüden **Build > Build Bundle(s) / APK(s) > Build APK(s)** seçin.
5. Çıktı: `app/build/outputs/apk/debug/app-debug.apk`.
6. APK dosyasını Samsung Android telefonunuza aktarın ve açıp yükleyin. Telefonunuzun güvenlik ayarlarında kurulum izni vermeniz gerekebilir.

İlk derleme için internet bağlantısı gerekir; uygulamanın çalışması için gerekmez. Bu proje klasörü içerisinde Gradle Wrapper JAR bulunmadığından, Android Studio'nun Gradle dağıtımını ayarlaması gerekir. Android Studio'da "Gradle distribution" ayarını `Wrapper` olarak seçip ilgili dağıtımı indirmesini sağlayabilirsiniz. Gerekirse yerel bir Gradle 8.10.2 kurulumunu kullanın.

## Kod / Dosyalar

- `app/src/main/assets/cover.png`: orijinal açılış görseli.
- `app/src/main/assets/board.jpg`: orijinal 8 slotluk görsel.
- `app/src/main/assets/lightning_glow.png`: orijinal resmin altın şimşek bölgelerinden türetilmiş animasyon katmanı.
- `app/src/main/assets/beneath_the_mask.mp3`: kullanıcının sağladığı müzik.
- `app/src/main/assets/index.html`: ekranlar.
- `app/src/main/assets/style.css`: düzen/animasyonlar.
- `app/src/main/assets/app.js`: çift dokunma, 8 slot, editör, kayıt, ayarlar.
- `app/src/main/java/com/inmotion/personalagenda/MainActivity.java`: Android WebView ve otomatik müzik oynatımı.

## Not

Bu kaynak proje, bu ortamda Android SDK / Gradle yüklü olmadığından **gerçek cihazda derlenip test edilemedi**. Bu nedenle bu paket bir APK değildir; Android Studio ile derlenmek üzere hazırlanan proje kaynak kodudur.

## Alternatif: GitHub Actions ile APK derleme (Android Studio gerekmez)

Kaynak kodu bir GitHub repository'sine yükleyip **Actions > Build IN MOTION APK > Run workflow** seçeneğiyle derletebilirsiniz. İşlem tamamlandığında workflow'un `IN_MOTION_android_apk` adlı artifact bölümünden `app-debug.apk` indirilir. Burada çalışma ortamında Android SDK bulunmadığı için bu iş akışı da henüz çalıştırılmamıştır.
