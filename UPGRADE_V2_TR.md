# IN MOTION 2.0 – yenilikler

- Açık/koyu tema seçimi (Settings > Dark mode)
- Instrumental Beneath the Mask; seçim efektleri
- Sol üstte Türkçe gün, tarih ve saat
- Güçlendirilmiş yıldırım ve hareketli kıvılcım
- Günlük 8 slot: işaretlenen her slot yalnızca bir kez +5 XP, günde azami 40 XP
- Her 100 XP'de bir level yükseltme; kayıtlar tamamen cihazda
- Gün değişiminde otomatik yeni boş sayfa; önceki sayfa galeride saklanır
- Manuel SAVE TODAY TO GALLERY; Gallery'den eski sayfaları görüntüleme
- V1 notları mümkünse ilk açılışta V2 gününe aktarılır

**Önemli Android güncelleme uyarısı:** GitHub Actions debug APK'ları her çalıştırmada farklı geçici imza ile imzalanabilir. Yeni APK eskiyi üstüne kuramazsa eski sürümü kaldırmak gerekebilir. Uygulamanın kaldırılması eski notları siler. Önemli V1 notların varsa önce yazıları dışarıya kopyala. Yeni sürümler için kalıcı release imzalama yapılandırması önerilir.

## GitHub'a sadece sesleri güncelleme
Projede app/src/main/assets/ altına `beneath_the_mask_instrumental.mp3` ve `select_sound.mp3` mutlaka eklenmelidir. Bu ZIP ikisini de içerir.

## Derleme
Actions > Build IN MOTION APK > en son yeşil çalıştırma > Artifacts > IN_MOTION_android_apk
