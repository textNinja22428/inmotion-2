package com.inmotion.personalagenda;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.os.Handler;
import android.os.Looper;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONException;
import java.util.UUID;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.DialogInterface;
import android.app.Dialog;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.graphics.Color;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.VideoView;
import android.widget.MediaController;
import android.widget.Toast;
import android.media.SoundPool;
import android.content.ClipboardManager;
import android.content.Intent;
import android.speech.RecognizerIntent;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONObject;
import android.net.Uri;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private Vibrator engineVibrator;
    private final Handler engineHandler=new Handler(Looper.getMainLooper());
    private boolean engineRunning=false;
    private int engineGeneration=0;
    private final Runnable engineTimeout=()->stopEngine();
    private void stopEngine(){engineGeneration++;engineRunning=false;engineHandler.removeCallbacks(engineTimeout);if(engineVibrator!=null)engineVibrator.cancel();}
    private void setEngineStage(int stage){
        if(!engineRunning||engineVibrator==null||!engineVibrator.hasVibrator())return;
        engineVibrator.cancel();
        int amplitude=stage==1?75:stage==2?130:stage==3?200:255;
        long[] pattern=stage==1?new long[]{0,110,490}:stage==2?new long[]{0,170,240}:stage==3?new long[]{0,270,115}:new long[]{0,340,45};
        if(Build.VERSION.SDK_INT>=26){
            int[] amplitudes=new int[]{0,amplitude,0};
            engineVibrator.vibrate(VibrationEffect.createWaveform(pattern,amplitudes,0));
        }else engineVibrator.vibrate(pattern,0);
    }
    private void startEngine(){
        stopEngine();
        engineRunning=true;
        int generation=engineGeneration;
        setEngineStage(1);
        engineHandler.postDelayed(()->{if(generation==engineGeneration)setEngineStage(2);},2000);
        engineHandler.postDelayed(()->{if(generation==engineGeneration)setEngineStage(3);},4000);
        engineHandler.postDelayed(()->{if(generation==engineGeneration)setEngineStage(4);},6000);
        engineHandler.postDelayed(engineTimeout,12000);
    }
    private MediaPlayer music;
    private static final int MUSIC_PICKER_REQUEST=7307;
    private final ArrayList<String> playlistFiles=new ArrayList<>();
    private final ArrayList<String> playlistTitles=new ArrayList<>();
    private int musicIndex=-1;
    private String lastSongTitle="Beneath the Mask - Instrumental";
    private File userMusicFolder(){File d=new File(getFilesDir(),"music_library");if(!d.exists())d.mkdirs();return d;}
    private void collectPlaylist(){
        playlistFiles.clear();playlistTitles.clear();
        playlistFiles.add("asset:beneath_the_mask_instrumental.mp3");
        playlistTitles.add("Beneath the Mask - Instrumental");
        File[] imported=userMusicFolder().listFiles((dir,name)->name.endsWith(".mp3"));
        if(imported!=null){
            java.util.Arrays.sort(imported,(a,b)->a.getName().compareToIgnoreCase(b.getName()));
            for(File file:imported){playlistFiles.add(file.getAbsolutePath());playlistTitles.add(file.getName().replace(".mp3","").replace('_',' '));}
        }
    }
    private void notifySong(){
        if(webView!=null)webView.evaluateJavascript("window.onInMotionSongChanged("+JSONObject.quote(lastSongTitle)+","+playlistFiles.size()+")",null);
    }
    private void playSong(int index){
        collectPlaylist();
        if(playlistFiles.isEmpty())return;
        index=Math.floorMod(index,playlistFiles.size());
        if(music!=null){try{music.stop();}catch(Exception ignored){}music.release();music=null;}
        String filename=playlistFiles.get(index);
        try{
            MediaPlayer next=new MediaPlayer();
            if(filename.startsWith("asset:")){
                AssetFileDescriptor afd;
                try{afd=getAssets().openFd(filename.substring(6));}
                catch(Exception missing){afd=getAssets().openFd("beneath_the_mask.mp3");}
                next.setDataSource(afd.getFileDescriptor(),afd.getStartOffset(),afd.getLength());afd.close();
            }else next.setDataSource(filename);
            next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            next.setLooping(true);next.prepare();
            music=next;musicIndex=index;lastSongTitle=playlistTitles.get(index);
            syncPlayback();notifySong();
        }catch(Exception e){Log.w("IN_MOTION","Unable to load song "+filename,e);if(index!=0)playSong(0);}
    }
    private void changeSong(){
        collectPlaylist();
        if(playlistFiles.size()<2){notifySong();return;}
        playSong((musicIndex+1)%playlistFiles.size());
    }
    private void importSong(Uri uri){
        String name=originalDisplayName(uri);
        if(!name.toLowerCase(Locale.ROOT).endsWith(".mp3"))return;
        String clean=name.replaceAll("[^a-zA-Z0-9._ -]","_");
        if(clean.length()>90)clean=clean.substring(clean.length()-90);
        File dest=new File(userMusicFolder(),clean);
        try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(dest)){
            if(in==null)return;
            byte[] bytes=new byte[32768];int n;long total=0;
            while((n=in.read(bytes))!=-1){
                total+=n;if(total>45L*1024*1024)throw new IllegalStateException("Audio too large");
                out.write(bytes,0,n);
            }
        }catch(Exception e){dest.delete();Log.w("IN_MOTION","Music import failed",e);}
    }

    private SoundPool soundPool;
    private int selectSoundId = 0;
    private volatile boolean selectLoaded = false;
    private SharedPreferences preferences;
    private boolean isResumed = false;
    private boolean lockdownActive = false;
    private MediaPlayer lockdownMusic;
    private MediaPlayer workMusic;
    private MediaPlayer eeMusic;
    private MediaPlayer studyMusic;
    private String journalMode = "";
    private static final int WORK_PHOTO_PICKER_REQUEST = 7302;
    private static final int PROGRAM_PICKER_REQUEST = 7303;
    private static final int MEDIA_PICKER_REQUEST = 7304;
    private static final long MAX_VIDEO_BYTES = 150L * 1024 * 1024;
    private static final long MAX_MEDIA_TOTAL_BYTES = 750L * 1024 * 1024;
    private static final int MAX_MEDIA_COUNT = 1000;
    private volatile boolean mediaViewerActive = false;
    private String pendingMediaCategory = "work";
    private String pendingMediaDate = "";
    private String pendingMediaKind = "image";
    private String pendingWorkPhotoDate = "";
    private String pendingPhotoJournal = "work";
    private SharedPreferences aiSettings;
    private static final int MAX_STORED_WORK_PHOTOS = 750;
    private static final int VOICE_REQUEST_CODE = 7201;
    private boolean speechPromptActive = false;
    private String pendingSpeechTarget = "editor";

    private void syncWorkMusic() {
        boolean active=isResumed&&!lockdownActive&&!speechPromptActive&&!mediaViewerActive&&!preferences.getBoolean("muted",false);
        syncJournalTrack(workMusic,active&&"work".equals(journalMode));
        syncJournalTrack(eeMusic,active&&"ee".equals(journalMode));
        syncJournalTrack(studyMusic,active&&"study".equals(journalMode));
    }
    private void syncJournalTrack(MediaPlayer player,boolean play) {
        if(player==null)return;
        try{
            if(play&&!player.isPlaying())player.start();
            else if(!play&&player.isPlaying())player.pause();
        }catch(Exception e){Log.w("IN_MOTION","Journal soundtrack state",e);}
    }
    private void changeJournalMode(String mode){
        if(!("work".equals(mode)||"ee".equals(mode)||"study".equals(mode)))mode="";
        journalMode=mode;
        syncPlayback();syncWorkMusic();
    }
    private MediaPlayer loadJournalSong(String filename){
        MediaPlayer player=null;
        try {
            AssetFileDescriptor afd=getAssets().openFd(filename);
            player=new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setDataSource(afd.getFileDescriptor(),afd.getStartOffset(),afd.getLength());
            afd.close();player.setLooping(true);player.prepare();
            return player;
        }catch(Exception e){
            Log.w("IN_MOTION","Journal music missing: "+filename,e);
            if(player!=null)player.release();
            return null;
        }
    }

    private void syncLockdownMusic(){
        if(lockdownMusic==null) return;
        boolean shouldPlay=isResumed && lockdownActive && !speechPromptActive && !mediaViewerActive;
        try{
            if(shouldPlay && !lockdownMusic.isPlaying()) lockdownMusic.start();
            else if(!shouldPlay && lockdownMusic.isPlaying()) lockdownMusic.pause();
        }catch(Exception e){Log.w("IN_MOTION","Lockdown soundtrack state change failed",e);}
    }

    private void changeLockdown(boolean enabled) {
        lockdownActive=enabled;
        syncPlayback();syncWorkMusic();
        if(enabled && lockdownMusic!=null){
            try{lockdownMusic.seekTo(0);}catch(Exception e){Log.w("IN_MOTION","Lockdown soundtrack rewind",e);}
        }
        syncLockdownMusic();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                             WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        preferences = getSharedPreferences("in_motion_settings", MODE_PRIVATE);
        if(Build.VERSION.SDK_INT>=31)engineVibrator=getSystemService(VibratorManager.class).getDefaultVibrator();
        else engineVibrator=(Vibrator)getSystemService(VIBRATOR_SERVICE);
        aiSettings = getSharedPreferences("in_motion_private_ai", MODE_PRIVATE);
        webView = new WebView(this);
        webView.setBackgroundColor(0xffffffff);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AudioBridge(), "NativeAudio");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
        collectPlaylist();
        playSong(new java.util.Random().nextInt(Math.max(1,playlistFiles.size())));

        try {
            AssetFileDescriptor guardian = getAssets().openFd("guardians_lockdown.mp3");
            lockdownMusic = new MediaPlayer();
            lockdownMusic.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            lockdownMusic.setDataSource(guardian.getFileDescriptor(), guardian.getStartOffset(), guardian.getLength());
            guardian.close();
            lockdownMusic.setLooping(true);
            lockdownMusic.prepare();
        } catch (Exception e) {
            Log.w("IN_MOTION", "Guardian lockdown soundtrack is not yet in assets", e);
            if(lockdownMusic!=null){lockdownMusic.release(); lockdownMusic=null;}
        }

        workMusic=loadJournalSong("work_screen.mp3");
        eeMusic=loadJournalSong("ee_theme.mp3");
        studyMusic=loadJournalSong("study_theme.mp3");

        soundPool = new SoundPool.Builder().setMaxStreams(6)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()).build();
        soundPool.setOnLoadCompleteListener((pool, sampleId, status) -> {
            if (sampleId > 0 && status == 0) selectLoaded = true;
            if (status != 0) Log.w("IN_MOTION", "Selection sound load error: " + status);
        });
        try {
            AssetFileDescriptor effect;
            try { effect = getAssets().openFd("select_sound_loud.wav"); }
            catch (Exception missing) { effect = getAssets().openFd("select_sound.mp3"); }
            selectSoundId = soundPool.load(effect, 1);
            effect.close();
        } catch (Exception e) { Log.w("IN_MOTION", "Selection audio could not be loaded", e); }
    }

    private void syncPlayback() {
        if (music == null) return;
        boolean shouldPlay = isResumed && !lockdownActive && journalMode.isEmpty() && !speechPromptActive && !mediaViewerActive && !preferences.getBoolean("muted", false);
        try {
            if (shouldPlay && !music.isPlaying()) music.start();
            else if (!shouldPlay && music.isPlaying()) music.pause();
        } catch (Exception e) { Log.w("IN_MOTION", "Audio playback change", e); }
    }



    /* Private replaceable training-program image: image picker -> app filesDir.
       Unlike keeping a temporary URI, copying survives app restarts and reboots. */
    private File programImageFile() {
        return new File(getFilesDir(),"ee_program_custom.jpg");
    }
    private boolean writeProgramImage(Uri uri) {
        Bitmap bitmap=null;
        File temp=new File(getFilesDir(),"ee_program_new.jpg");
        try {
            BitmapFactory.Options probe=new BitmapFactory.Options();
            probe.inJustDecodeBounds=true;
            try(InputStream input=getContentResolver().openInputStream(uri)){
                BitmapFactory.decodeStream(input,null,probe);
            }
            if(probe.outWidth<=0||probe.outHeight<=0)return false;
            int sample=1;
            while(Math.max(probe.outWidth,probe.outHeight)/sample>1900)sample*=2;
            BitmapFactory.Options options=new BitmapFactory.Options();
            options.inSampleSize=sample;
            try(InputStream input=getContentResolver().openInputStream(uri)){
                bitmap=BitmapFactory.decodeStream(input,null,options);
            }
            if(bitmap==null)return false;
            int largest=Math.max(bitmap.getWidth(),bitmap.getHeight());
            if(largest>1600){
                double scale=1600.0/largest;
                Bitmap reduced=Bitmap.createScaledBitmap(bitmap,
                   Math.max(1,(int)(bitmap.getWidth()*scale)),
                   Math.max(1,(int)(bitmap.getHeight()*scale)),true);
                bitmap.recycle();bitmap=reduced;
            }
            try(OutputStream stream=new FileOutputStream(temp)){
                if(!bitmap.compress(Bitmap.CompressFormat.JPEG,82,stream))return false;
            }
            if(temp.length()>2200000) {
                temp.delete();
                return false;
            }
            File target=programImageFile();
            if(target.exists()&&!target.delete())return false;
            if(!temp.renameTo(target)){
                try(InputStream from=new FileInputStream(temp);
                    OutputStream to=new FileOutputStream(target)){
                    byte[] bytes=new byte[8192];int n;
                    while((n=from.read(bytes))>0)to.write(bytes,0,n);
                }
                temp.delete();
            }
            return target.exists()&&target.length()>0;
        }catch(Exception e){Log.w("IN_MOTION","Failed to save custom E,E program",e);return false;}
        finally{if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle();}
    }
    private void notifyProgramImage(boolean ok) {
        if(webView!=null)webView.evaluateJavascript("window.onProgramImageChanged("+ok+")",null);
    }

    /* The Android picker copies images into private filesDir. Saved photos
       are never uploaded; content is provided to the local WebView on request. */
    private JSONArray readWorkEntries(){
        try{
            JSONArray arr=new JSONArray(preferences.getString("work_photos_v1","[]"));
            return arr.length()>MAX_STORED_WORK_PHOTOS?new JSONArray():arr;
        }catch(Exception e){return new JSONArray();}
    }
    private void workNotify(String msg){
        if(webView!=null){
            webView.evaluateJavascript("window.onWorkPhotosChanged("+JSONObject.quote(msg)+")",null);
        }
    }
    private boolean saveWorkImage(Uri uri,String date,String category) {
        File folder=new File(getFilesDir(),"work_photos");
        if(!folder.exists()&&!folder.mkdirs())return false;
        Bitmap bitmap=null;
        try {
            BitmapFactory.Options probe=new BitmapFactory.Options();
            probe.inJustDecodeBounds=true;
            try(InputStream input=getContentResolver().openInputStream(uri)){
                BitmapFactory.decodeStream(input,null,probe);
            }
            if(probe.outWidth<1||probe.outHeight<1)return false;
            int sample=1;while(Math.max(probe.outWidth,probe.outHeight)/sample>1700)sample*=2;
            BitmapFactory.Options opts=new BitmapFactory.Options();
            opts.inSampleSize=sample;
            try(InputStream stream=getContentResolver().openInputStream(uri)){
                bitmap=BitmapFactory.decodeStream(stream,null,opts);
            }
            if(bitmap==null)return false;
            int max=Math.max(bitmap.getWidth(),bitmap.getHeight());
            if(max>1250) {
                double ratio=1250.0/max;
                Bitmap reduced=Bitmap.createScaledBitmap(bitmap,(int)(bitmap.getWidth()*ratio),(int)(bitmap.getHeight()*ratio),true);
                bitmap.recycle();bitmap=reduced;
            }
            String id=UUID.randomUUID().toString();
            File output=new File(folder,id+".jpg");
            try(OutputStream file=new FileOutputStream(output)){
                if(!bitmap.compress(Bitmap.CompressFormat.JPEG,76,file))return false;
            }
            JSONObject info=new JSONObject();
            info.put("id",id);info.put("date",date);info.put("category",category);
            info.put("createdAt",System.currentTimeMillis());
            JSONArray entries=readWorkEntries();
            if(entries.length()>=MAX_STORED_WORK_PHOTOS){output.delete();return false;}
            entries.put(info);
            preferences.edit().putString("work_photos_v1",entries.toString()).apply();
            return true;
        }catch(Exception e){Log.w("IN_MOTION","Work photo save failed",e);return false;}
        finally{if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle();}
    }
    private File photoForId(String id){
        if(id==null||!id.matches("[a-fA-F0-9-]{36}"))return null;
        JSONArray stored=readWorkEntries();
        for(int n=0;n<stored.length();n++)
            if(id.equals(stored.optJSONObject(n)==null?null:stored.optJSONObject(n).optString("id")))
                return new File(new File(getFilesDir(),"work_photos"),id+".jpg");
        return null;
    }

    /* Local media is private to the app. Legacy Work photos remain untouched
       in work_photos_v1 / work_photos, and are merged into the visible list. */
    private final Object mediaWriteLock=new Object();
    private JSONArray readNewMedia() {
        try {
            JSONArray arr=new JSONArray(preferences.getString("inmotion_media_v1","[]"));
            return arr.length()<=MAX_MEDIA_COUNT?arr:new JSONArray();
        }catch(Exception e){return new JSONArray();}
    }
    private boolean validMediaCategory(String category){
        if("work".equals(category)||"ee".equals(category)||"study".equals(category))return true;
        return category!=null&&(category.matches("slot[0-7]")||category.matches("program[0-5]")||category.matches("project-[a-f0-9-]{36}"));
    }
    private JSONArray mergedMedia() {
        JSONArray merged=new JSONArray();
        JSONArray legacy=readWorkEntries();
        for(int i=0;i<legacy.length();i++){
            JSONObject obj=legacy.optJSONObject(i);
            if(obj==null)continue;
            try{
                JSONObject entry=new JSONObject(obj.toString());
                entry.put("category",entry.optString("category","work"));
                entry.put("kind","image");
                entry.put("legacy",true);
                merged.put(entry);
            }catch(Exception e){}
        }
        JSONArray newer=readNewMedia();
        for(int i=0;i<newer.length();i++){
            JSONObject entry=newer.optJSONObject(i);
            if(entry!=null)merged.put(entry);
        }
        return merged;
    }
    private File mediaFolder() {
        File folder=new File(getFilesDir(),"media_v1");
        if(!folder.exists())folder.mkdirs();
        return folder;
    }
    private File storedMediaFile(JSONObject entry) {
        if(entry==null)return null;
        String id=entry.optString("id","");
        if(!id.matches("[a-f0-9\\-]{36}"))return null;
        if(entry.optBoolean("legacy",false))return photoForId(id);
        String kind=entry.optString("kind","");
        String mime=entry.optString("mime","");
        String ext="image".equals(kind)?".jpg":
             "video/mp4".equals(mime)?".mp4":
             "video/webm".equals(mime)?".webm":
             "video/3gpp".equals(mime)?".3gp":
             "file".equals(kind)?".bin":null;
        return ext==null?null:new File(mediaFolder(),id+ext);
    }
    private JSONObject findMedia(String id) {
        if(id==null||!id.matches("[a-f0-9\\-]{36}"))return null;
        JSONArray all=mergedMedia();
        for(int i=0;i<all.length();i++){
            JSONObject obj=all.optJSONObject(i);
            if(obj!=null&&id.equals(obj.optString("id")))return obj;
        }
        return null;
    }
    private String readMediaJPEG(String id){
        try{
            JSONObject entry=findMedia(id);
            if(entry==null||!"image".equals(entry.optString("kind")))return "";
            File file=storedMediaFile(entry);
            if(file==null||!file.isFile()||file.length()>2500000)return "";
            byte[] bytes=new byte[(int)file.length()];
            try(FileInputStream input=new FileInputStream(file)){
                int position=0;
                while(position<bytes.length){
                    int count=input.read(bytes,position,bytes.length-position);
                    if(count<0)return "";
                    position+=count;
                }
            }
            return "data:image/jpeg;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP);
        }catch(Exception e){Log.w("IN_MOTION","Media image read failed",e);return "";}
    }
    private String originalDisplayName(Uri uri) {
        try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){
            if(c!=null&&c.moveToFirst())return c.getString(0);
        }catch(Exception ignored){}
        return "Attachment";
    }
    private long originalSize(Uri uri) {
        try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.SIZE},null,null,null)){
            if(c!=null&&c.moveToFirst())return c.isNull(0)?-1:c.getLong(0);
        }catch(Exception ignored){}
        return -1;
    }
    private long totalStoredMediaSize() {
        long size=0;
        File[] files=mediaFolder().listFiles();
        if(files!=null)for(File file:files)if(file.isFile())size+=file.length();
        return size;
    }
    private boolean saveMediaAttachment(Uri uri,String category,String date,String kind) {
        synchronized(mediaWriteLock) {
            if(!validMediaCategory(category)||!date.matches("\\d{4}-\\d{2}-\\d{2}"))return false;
            if(readNewMedia().length()>=MAX_MEDIA_COUNT)return false;
            String id=UUID.randomUUID().toString();
            String mime=getContentResolver().getType(uri);
            if(mime==null)mime="";
            if("file".equals(kind)){
                long limit=35L*1024*1024;
                long size=originalSize(uri);
                if(size>limit||totalStoredMediaSize()+Math.max(0,size)>MAX_MEDIA_TOTAL_BYTES)return false;
                File file=new File(mediaFolder(),id+".bin");
                long copied=0;
                try(InputStream input=getContentResolver().openInputStream(uri);
                    OutputStream output=new FileOutputStream(file)){
                    if(input==null)return false;
                    byte[] buffer=new byte[32768];int n;
                    while((n=input.read(buffer))!=-1){
                        copied+=n;
                        if(copied>limit||copied+totalStoredMediaSize()>MAX_MEDIA_TOTAL_BYTES)
                            throw new IllegalStateException("Attachment exceeds local limit");
                        output.write(buffer,0,n);
                    }
                }catch(Exception e){file.delete();Log.w("IN_MOTION","File import failed",e);return false;}
                if(copied<=0){file.delete();return false;}
                try {
                    JSONObject entry=new JSONObject();
                    entry.put("id",id);entry.put("category",category);entry.put("date",date);
                    entry.put("kind","file");entry.put("mime",mime.isEmpty()?"application/octet-stream":mime);
                    entry.put("name",originalDisplayName(uri).substring(0,Math.min(100,originalDisplayName(uri).length())));
                    entry.put("bytes",copied);entry.put("createdAt",System.currentTimeMillis());
                    JSONArray entries=readNewMedia();entries.put(entry);
                    preferences.edit().putString("inmotion_media_v1",entries.toString()).apply();
                    return true;
                }catch(Exception e){file.delete();return false;}
            }
            if("video".equals(kind)) {
                if(!("video/mp4".equals(mime)||"video/webm".equals(mime)||"video/3gpp".equals(mime))){
                    Log.w("IN_MOTION","Unsupported video MIME "+mime);return false;
                }
                long size=originalSize(uri);
                if(size>MAX_VIDEO_BYTES||totalStoredMediaSize()+Math.max(0,size)>MAX_MEDIA_TOTAL_BYTES)return false;
                String extension="video/mp4".equals(mime)?".mp4":"video/webm".equals(mime)?".webm":".3gp";
                File file=new File(mediaFolder(),id+extension);
                long copied=0;
                try(InputStream input=getContentResolver().openInputStream(uri);
                    OutputStream output=new FileOutputStream(file)) {
                    if(input==null)throw new IllegalArgumentException("Media cannot be opened");
                    byte[] bytes=new byte[65536];int n;
                    while((n=input.read(bytes))!=-1){
                        copied+=n;
                        if(copied>MAX_VIDEO_BYTES||copied+totalStoredMediaSize()>MAX_MEDIA_TOTAL_BYTES)
                            throw new IllegalStateException("Video too large");
                        output.write(bytes,0,n);
                    }
                }catch(Exception e){file.delete();Log.w("IN_MOTION","Video import failed",e);return false;}
                if(copied==0){file.delete();return false;}
                try{
                    JSONObject obj=new JSONObject();
                    obj.put("id",id);obj.put("date",date);obj.put("category",category);
                    obj.put("kind","video");obj.put("mime",mime);
                    obj.put("name",originalDisplayName(uri).substring(0,Math.min(100,originalDisplayName(uri).length())));
                    obj.put("bytes",copied);obj.put("createdAt",System.currentTimeMillis());
                    JSONArray all=readNewMedia();all.put(obj);
                    preferences.edit().putString("inmotion_media_v1",all.toString()).apply();
                    return true;
                }catch(Exception e){file.delete();return false;}
            }
            if(!"image".equals(kind)||!mime.startsWith("image/"))return false;
            Bitmap bitmap=null;
            File file=new File(mediaFolder(),id+".jpg");
            try {
                BitmapFactory.Options probe=new BitmapFactory.Options();
                probe.inJustDecodeBounds=true;
                try(InputStream input=getContentResolver().openInputStream(uri)){
                    BitmapFactory.decodeStream(input,null,probe);
                }
                if(probe.outWidth<=0||probe.outHeight<=0)return false;
                int sample=1;
                while(Math.max(probe.outWidth,probe.outHeight)/sample>1700)sample*=2;
                BitmapFactory.Options opts=new BitmapFactory.Options();opts.inSampleSize=sample;
                try(InputStream input=getContentResolver().openInputStream(uri)){
                    bitmap=BitmapFactory.decodeStream(input,null,opts);
                }
                if(bitmap==null)return false;
                int max=Math.max(bitmap.getWidth(),bitmap.getHeight());
                if(max>1300){
                    double scale=1300.0/max;
                    Bitmap reduced=Bitmap.createScaledBitmap(bitmap,
                      Math.max(1,(int)(bitmap.getWidth()*scale)),
                      Math.max(1,(int)(bitmap.getHeight()*scale)),true);
                    bitmap.recycle();bitmap=reduced;
                }
                try(OutputStream output=new FileOutputStream(file)){
                    if(!bitmap.compress(Bitmap.CompressFormat.JPEG,77,output))return false;
                }
                JSONObject obj=new JSONObject();
                obj.put("id",id);obj.put("date",date);obj.put("category",category);
                obj.put("kind","image");obj.put("mime","image/jpeg");
                obj.put("name","Photo");obj.put("createdAt",System.currentTimeMillis());
                JSONArray all=readNewMedia();all.put(obj);
                preferences.edit().putString("inmotion_media_v1",all.toString()).apply();
                return true;
            }catch(Exception e){file.delete();Log.w("IN_MOTION","Image import failed",e);return false;}
            finally{if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle();}
        }
    }
    private boolean deleteMediaAttachment(String id) {
        synchronized(mediaWriteLock){
            JSONObject item=findMedia(id);
            if(item==null)return false;
            boolean old=item.optBoolean("legacy",false);
            String key=old?"work_photos_v1":"inmotion_media_v1";
            JSONArray original=old?readWorkEntries():readNewMedia(),next=new JSONArray();
            for(int i=0;i<original.length();i++){
                JSONObject obj=original.optJSONObject(i);
                if(obj!=null&&!id.equals(obj.optString("id")))next.put(obj);
            }
            if(next.length()>=original.length())return false;
            File file=storedMediaFile(item);
            if(file!=null&&file.exists()&&!file.delete())return false;
            preferences.edit().putString(key,next.toString()).apply();
            return true;
        }
    }
    private void notifyMediaSaved(String message) {
        if(webView!=null)webView.evaluateJavascript(
            "window.onInMotionMediaChanged("+JSONObject.quote(message)+")",null);
    }
    private void syncAllPlayback(){
        syncPlayback();syncWorkMusic();syncLockdownMusic();
    }
    private void showMediaVideo(String id) {
        JSONObject entry=findMedia(id);
        if(entry==null||!"video".equals(entry.optString("kind")))return;
        File file=storedMediaFile(entry);
        if(file==null||!file.isFile()) {
            Toast.makeText(this,"Video no longer available",Toast.LENGTH_SHORT).show();return;
        }
        Dialog dialog=new Dialog(this,android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);
        VideoView video=new VideoView(this);
        FrameLayout.LayoutParams videoParams=new FrameLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT,Gravity.CENTER);
        root.addView(video,videoParams);
        MediaController controls=new MediaController(this);controls.setAnchorView(video);
        video.setMediaController(controls);
        Button close=new Button(this);close.setText("✕ CLOSE");
        close.setTextColor(Color.WHITE);close.setBackgroundColor(0xff30343a);
        FrameLayout.LayoutParams closeParams=new FrameLayout.LayoutParams(
          ViewGroup.LayoutParams.WRAP_CONTENT,ViewGroup.LayoutParams.WRAP_CONTENT,
          Gravity.TOP|Gravity.END);
        closeParams.setMargins(12,42,14,10);root.addView(close,closeParams);
        close.setOnClickListener(v->dialog.dismiss());
        dialog.setContentView(root);
        dialog.setOnDismissListener(d->{video.stopPlayback();mediaViewerActive=false;syncAllPlayback();});
        video.setOnPreparedListener(mp->{mp.setLooping(false);video.start();controls.show(2800);});
        video.setOnErrorListener((mp,what,extra)->{
            Toast.makeText(this,"Video format unsupported on this phone",Toast.LENGTH_LONG).show();
            dialog.dismiss();return true;
        });
        mediaViewerActive=true;syncAllPlayback();
        dialog.show();
        video.setVideoPath(file.getAbsolutePath());
    }

    private void deliverAI(boolean ok,String text){
        if(webView!=null){
            webView.evaluateJavascript("window.onInMotionAIResult("+ok+","+JSONObject.quote(text)+")",null);
        }
    }

    public class AudioBridge {
        @JavascriptInterface public String getSongInfo(){return lastSongTitle;}
        @JavascriptInterface public void nextSong(){runOnUiThread(()->changeSong());}
        @JavascriptInterface public void importSongs(){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("audio/mpeg");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);try{startActivityForResult(i,MUSIC_PICKER_REQUEST);}catch(Exception e){Log.w("IN_MOTION","Audio picker unavailable",e);}});}

        @JavascriptInterface public void startEngine(){runOnUiThread(()->MainActivity.this.startEngine());}
        @JavascriptInterface public void stopEngine(){runOnUiThread(()->MainActivity.this.stopEngine());}


        @JavascriptInterface public void setWorkMode(boolean enabled){
            runOnUiThread(()->changeJournalMode(enabled?"work":""));
        }
        @JavascriptInterface public void pickProgramImage(){
            runOnUiThread(()->{
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.setType("image/*");
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                try{startActivityForResult(pick,PROGRAM_PICKER_REQUEST);}
                catch(Exception e){Log.w("IN_MOTION","No image picker",e);notifyProgramImage(false);}
            });
        }
        @JavascriptInterface public String getProgramImageData(){
            File file=programImageFile();
            if(!file.isFile()||file.length()==0||file.length()>2200000)return "";
            try(FileInputStream stream=new FileInputStream(file)){
                byte[] content=new byte[(int)file.length()];int off=0;
                while(off<content.length){
                    int n=stream.read(content,off,content.length-off);
                    if(n<0)return "";off+=n;
                }
                return "data:image/jpeg;base64,"+Base64.encodeToString(content,Base64.NO_WRAP);
            }catch(Exception e){return "";}
        }
        @JavascriptInterface public void resetProgramImage(){
            programImageFile().delete();
        }

        @JavascriptInterface public String listAllMedia(){
            return mergedMedia().toString();
        }
        @JavascriptInterface public String getMediaImageData(String id){
            return readMediaJPEG(id);
        }
        @JavascriptInterface public void pickInMotionMedia(String kind,String date,String category){
            if(!("image".equals(kind)||"video".equals(kind)||"file".equals(kind)))return;
            if(date==null||!date.matches("\\d{4}-\\d{2}-\\d{2}")||!validMediaCategory(category))return;
            runOnUiThread(()->{
                pendingMediaKind=kind;pendingMediaDate=date;pendingMediaCategory=category;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image".equals(kind)?"image/*":"video".equals(kind)?"video/*":"*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,"image".equals(kind));
                try{startActivityForResult(intent,MEDIA_PICKER_REQUEST);}
                catch(Exception e){notifyMediaSaved("Media picker unavailable");}
            });
        }
        @JavascriptInterface public void playInMotionVideo(String id){
            runOnUiThread(()->showMediaVideo(id));
        }
        @JavascriptInterface public void openInMotionFile(String id){
            runOnUiThread(()->{
                JSONObject entry=findMedia(id);
                if(entry==null||!"file".equals(entry.optString("kind")))return;
                File file=storedMediaFile(entry);
                if(file==null||!file.isFile())return;
                try{
                    Uri uri=new Uri.Builder().scheme("content")
                      .authority(getPackageName()+".attachments").appendPath(id).build();
                    Intent intent=new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri,entry.optString("mime","application/octet-stream"));
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(intent,"Open project attachment"));
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,"No compatible file viewer installed",Toast.LENGTH_LONG).show();
                }
            });
        }
        @JavascriptInterface public boolean deleteInMotionMedia(String id){
            return deleteMediaAttachment(id);
        }
        @JavascriptInterface public void setJournalMode(String mode){
            runOnUiThread(()->changeJournalMode(mode));
        }
        @JavascriptInterface public String listWorkPhotos(){
            return readWorkEntries().toString();
        }
        @JavascriptInterface public String getWorkPhotoData(String id){
            try{
                File file=photoForId(id);
                if(file==null||!file.isFile()||file.length()>1300000)return "";
                byte[] bytes=new byte[(int)file.length()];
                try(FileInputStream fis=new FileInputStream(file)){
                    int off=0;
                    while(off<bytes.length){int n=fis.read(bytes,off,bytes.length-off);if(n<0)return "";off+=n;}
                }
                return "data:image/jpeg;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP);
            }catch(Exception e){Log.w("IN_MOTION","Photo read failed",e);return "";}
        }
        @JavascriptInterface public void pickWorkPhotos(String date,String category){
            if(date==null||!date.matches("\\d{4}-\\d{2}-\\d{2}"))return;
            if(!("work".equals(category)||"ee".equals(category)||"study".equals(category)))return;
            runOnUiThread(()->{
                pendingWorkPhotoDate=date;
                pendingPhotoJournal=category;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.setType("image/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
                try{startActivityForResult(intent,WORK_PHOTO_PICKER_REQUEST);}
                catch(Exception e){workNotify("No photo picker available");}
            });
        }
        @JavascriptInterface public String getAIConfiguration(){
            JSONObject object=new JSONObject();
            try{
                String url=aiSettings.getString("endpoint","");
                object.put("endpoint",url);
                object.put("configured",url.startsWith("https://")&&!aiSettings.getString("pairing","").isEmpty());
            }catch(Exception e){}
            return object.toString();
        }
        @JavascriptInterface public boolean saveAIConfiguration(String endpoint,String token){
            if(endpoint==null||token==null)return false;
            if(!endpoint.matches("https://[^\\s/]+/chat/?")||token.length()<12||token.length()>250)return false;
            aiSettings.edit().putString("endpoint",endpoint).putString("pairing",token).apply();
            return true;
        }
        @JavascriptInterface public void clearAIConfiguration(){
            aiSettings.edit().clear().apply();
        }
        @JavascriptInterface public void askInMotionAI(String payload){
            if(payload==null||payload.length()>12000){
                runOnUiThread(()->deliverAI(false,"This request is too long. Shorten the notes or turn off recent conversation sharing."));
                return;
            }
            final String endpoint=aiSettings.getString("endpoint","");
            final String token=aiSettings.getString("pairing","");
            if(!endpoint.matches("https://[^\\s/]+/chat/?")||token.isEmpty()){
                runOnUiThread(()->deliverAI(false,"Configure the HTTPS AI Worker in Settings."));
                return;
            }
            new Thread(()->{
                HttpURLConnection conn=null;
                try{
                    JSONObject in=new JSONObject(payload);
                    String question=in.optString("question","");
                    if(question.trim().isEmpty()||question.length()>1300)throw new IllegalArgumentException("Invalid question");
                    String context=in.optString("context","");
                    if(context.length()>5100)throw new IllegalArgumentException("Context too long");
                    JSONObject body=new JSONObject();body.put("question",question);body.put("context",context);
                    // Only user-chosen identity settings and bounded, opt-in GPT
                    // conversation history are forwarded to our private Worker.
                    JSONObject identity=in.optJSONObject("identity");
                    if(identity!=null)body.put("identity",identity);
                    JSONArray history=in.optJSONArray("history");
                    if(history!=null)body.put("history",history);
                    URL address=new URL(endpoint);
                    conn=(HttpURLConnection)address.openConnection();
                    conn.setRequestMethod("POST");conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(12000);conn.setReadTimeout(45000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type","application/json; charset=utf-8");
                    conn.setRequestProperty("Authorization","Bearer "+token);
                    byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);
                    if(bytes.length>16000)throw new IllegalArgumentException("Request too long. Please share fewer notes.");
                    conn.setFixedLengthStreamingMode(bytes.length);
                    try(OutputStream stream=conn.getOutputStream()){stream.write(bytes);}
                    int status=conn.getResponseCode();
                    InputStream response=status>=200&&status<300?conn.getInputStream():conn.getErrorStream();
                    if(response==null)throw new IllegalStateException("No response");
                    java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream();
                    byte[] chunk=new byte[4096];int total=0,n;
                    try(InputStream source=response){
                        while((n=source.read(chunk))!=-1 && total<22000){
                            int allowed=Math.min(n,22000-total);
                            buffer.write(chunk,0,allowed);total+=allowed;
                        }
                    }
                    byte[] data=buffer.toByteArray();
                    String json=new String(data,StandardCharsets.UTF_8);
                    JSONObject parsed=new JSONObject(json);
                    if(status!=200)throw new IllegalStateException(parsed.optString("error","HTTP "+status));
                    String answer=parsed.optString("answer","");
                    if(answer.isEmpty())throw new IllegalStateException("No answer from server");
                    runOnUiThread(()->deliverAI(true,answer));
                }catch(Exception e){
                    String msg=String.valueOf(e.getMessage());
                    runOnUiThread(()->deliverAI(false,msg));
                }finally{if(conn!=null)conn.disconnect();}
            },"inmotion-private-ai").start();
        }
        @JavascriptInterface public boolean isMuted() { return preferences.getBoolean("muted", false); }
        @JavascriptInterface public void setLockdown(boolean enabled) {
            runOnUiThread(() -> changeLockdown(enabled));
        }
        @JavascriptInterface public boolean copyText(String text){
            if(text==null || text.length()==0 || text.length()>200000) return false;
            try {
                ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
                if(clipboard==null)return false;
                clipboard.setPrimaryClip(ClipData.newPlainText("IN MOTION — The Disruption", text));
                return true;
            } catch(Exception e){Log.w("IN_MOTION","Could not copy Reassurer text",e);return false;}
        }
        @JavascriptInterface public void saveGalleryImage(String json) {
            GalleryExporter.export(MainActivity.this,json,success -> {
                if(webView!=null){
                    webView.evaluateJavascript("window.onGallerySaved('"+(success?"ok":"error")+"')",null);
                }
            });
        }
        @JavascriptInterface public void setMuted(boolean muted) {
            preferences.edit().putBoolean("muted", muted).apply();
            runOnUiThread(() -> {syncPlayback();syncWorkMusic();});
        }
        @JavascriptInterface public void startVoiceInput(String target) {
            if (!("editor".equals(target) || "lockdown".equals(target) || "agent".equals(target) || "dynamic".equals(target))) return;
            runOnUiThread(() -> {
                if (speechPromptActive) return;
                pendingSpeechTarget = target;
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag());
                intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to IN MOTION");
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                speechPromptActive = true;
                syncPlayback();syncLockdownMusic();syncWorkMusic();
                try {
                    startActivityForResult(intent, VOICE_REQUEST_CODE);
                } catch (Exception e) {
                    speechPromptActive = false;
                    syncPlayback();syncLockdownMusic();syncWorkMusic();
                    notifySpeechFailure("Speech recognition service is not installed.");
                    Log.w("IN_MOTION", "Speech recognizer unavailable", e);
                }
            });
        }
        @JavascriptInterface public void openChatGPT(){
            runOnUiThread(() -> {
                try {
                    Intent app=getPackageManager().getLaunchIntentForPackage("com.openai.chatgpt");
                    if(app!=null){startActivity(app);return;}
                    startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://chatgpt.com")));
                }catch(Exception e){Log.w("IN_MOTION","ChatGPT shortcut unavailable",e);}
            });
        }
        @JavascriptInterface public void openYouTube() {
            runOnUiThread(() -> {
                Uri link = Uri.parse("https://www.youtube.com");
                Intent youtube = new Intent(Intent.ACTION_VIEW, link);
                youtube.setPackage("com.google.android.youtube");
                try {
                    startActivity(youtube);
                } catch (Exception missingApp) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, link));
                    } catch (Exception missingBrowser) {
                        Log.w("IN_MOTION", "No available app or browser for YouTube", missingBrowser);
                    }
                }
            });
        }
        @JavascriptInterface public boolean playSelect() {
            if (soundPool == null || !selectLoaded || selectSoundId == 0) return false;
            try {
                return soundPool.play(selectSoundId, 1f, 1f, 1, 0, 1.0f) > 0;
            } catch (Exception e) {
                Log.w("IN_MOTION", "Select effect could not play", e);
                return false;
            }
        }
    }

    private void notifySpeechFailure(String message) {
        if (webView == null) return;
        String script = "window.onInMotionSpeechError(" +
                JSONObject.quote(pendingSpeechTarget) + "," +
                JSONObject.quote(message) + ");";
        webView.evaluateJavascript(script, null);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if(requestCode==MUSIC_PICKER_REQUEST){
            if(resultCode!=Activity.RESULT_OK||data==null)return;
            final ArrayList<Uri> songs=new ArrayList<>();
            if(data.getClipData()!=null){ClipData clips=data.getClipData();for(int i=0;i<Math.min(20,clips.getItemCount());i++)songs.add(clips.getItemAt(i).getUri());}
            else if(data.getData()!=null)songs.add(data.getData());
            new Thread(()->{for(Uri uri:songs)importSong(uri);runOnUiThread(()->{collectPlaylist();playSong(new java.util.Random().nextInt(playlistFiles.size()));});},"music-import").start();
            return;
        }
        if(requestCode==MEDIA_PICKER_REQUEST){
            if(resultCode!=Activity.RESULT_OK||data==null)return;
            final String date=pendingMediaDate,category=pendingMediaCategory,kind=pendingMediaKind;
            final Uri single=data.getData();
            final ArrayList<Uri> selection=new ArrayList<>();
            if(data.getClipData()!=null){
                ClipData clips=data.getClipData();
                for(int i=0;i<Math.min(12,clips.getItemCount());i++)
                    selection.add(clips.getItemAt(i).getUri());
            }else if(single!=null)selection.add(single);
            new Thread(()->{
                int saved=0;
                for(Uri uri:selection)if(saveMediaAttachment(uri,category,date,kind))saved++;
                final int count=saved;
                String message=count>0
                  ?count+" "+("video".equals(kind)?"video":"file".equals(kind)?"file":"photo")+" attachment(s) saved"
                  :"Could not save attachment (limit: 150 MB/video, 750 MB total; MP4 preferred)";
                runOnUiThread(()->notifyMediaSaved(message));
            },"inmotion-media-import").start();
            return;
        }
        if(requestCode==PROGRAM_PICKER_REQUEST){
            if(resultCode!=Activity.RESULT_OK||data==null||data.getData()==null)return;
            final Uri source=data.getData();
            new Thread(()->{
                final boolean ok=writeProgramImage(source);
                runOnUiThread(()->notifyProgramImage(ok));
            },"inmotion-program-save").start();
            return;
        }
        if(requestCode==WORK_PHOTO_PICKER_REQUEST){
            if(resultCode!=Activity.RESULT_OK||data==null)return;
            String date=pendingWorkPhotoDate;
            String category=pendingPhotoJournal;
            new Thread(()->{
                int saved=0;
                ClipData selected=data.getClipData();
                if(selected!=null){
                    for(int i=0;i<selected.getItemCount()&&i<20;i++)
                        if(saveWorkImage(selected.getItemAt(i).getUri(),date,category))saved++;
                }else if(data.getData()!=null&&saveWorkImage(data.getData(),date,category))saved++;
                final int count=saved;
                runOnUiThread(()->workNotify(count>0?count+" work photo(s) saved on this device":"No photos could be saved"));
            },"inmotion-photo-save").start();
            return;
        }
        if (requestCode != VOICE_REQUEST_CODE) return;
        speechPromptActive = false;
        syncPlayback();syncLockdownMusic();syncWorkMusic();
        if (webView == null) return;
        if (resultCode != Activity.RESULT_OK || data == null) {
            notifySpeechFailure("Voice input cancelled.");
            return;
        }
        ArrayList<String> recognized =
                data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (recognized == null || recognized.isEmpty() || recognized.get(0).trim().isEmpty()) {
            notifySpeechFailure("No speech recognized. Please try again.");
            return;
        }
        String speech = recognized.get(0);
        if (speech.length() > 12000) speech = speech.substring(0, 12000);
        String script = "window.onInMotionSpeechResult(" +
                JSONObject.quote(pendingSpeechTarget) + "," +
                JSONObject.quote(speech) + ");";
        webView.evaluateJavascript(script, null);
    }

    @Override protected void onResume() {
        super.onResume(); isResumed = true; syncPlayback();
        syncLockdownMusic();syncWorkMusic();
        if(webView != null) webView.onResume();
    }
    @Override protected void onPause() {
        stopEngine();
        isResumed = false;
        syncPlayback();syncLockdownMusic();syncWorkMusic();
        if(webView != null) webView.onPause(); super.onPause();
    }
    @Override @SuppressWarnings("deprecation") public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("window.handleAndroidBack()", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        stopEngine();
        if(lockdownMusic!=null){lockdownMusic.release();lockdownMusic=null;}
        if(workMusic!=null){workMusic.release();workMusic=null;}
        if(eeMusic!=null){eeMusic.release();eeMusic=null;}
        if(studyMusic!=null){studyMusic.release();studyMusic=null;}
        if (music != null) { music.release(); music = null; }
        if (soundPool != null) { soundPool.release(); soundPool = null; }
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
