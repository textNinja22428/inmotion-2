package com.inmotion.personalagenda;

import android.app.Activity;
import android.os.Bundle;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.SoundPool;
import android.content.ClipData;
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
    private MediaPlayer music;
    private SoundPool soundPool;
    private int selectSoundId = 0;
    private volatile boolean selectLoaded = false;
    private SharedPreferences preferences;
    private boolean isResumed = false;
    private boolean lockdownActive = false;
    private MediaPlayer lockdownMusic;
    private static final int VOICE_REQUEST_CODE = 7201;
    private boolean speechPromptActive = false;
    private String pendingSpeechTarget = "editor";

    private void syncLockdownMusic(){
        if(lockdownMusic==null) return;
        boolean shouldPlay=isResumed && lockdownActive && !speechPromptActive;
        try{
            if(shouldPlay && !lockdownMusic.isPlaying()) lockdownMusic.start();
            else if(!shouldPlay && lockdownMusic.isPlaying()) lockdownMusic.pause();
        }catch(Exception e){Log.w("IN_MOTION","Lockdown soundtrack state change failed",e);}
    }

    private void changeLockdown(boolean enabled) {
        lockdownActive=enabled;
        syncPlayback();
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
        try {
            // New instrumental track; old track remains a fallback until assets are uploaded.
            AssetFileDescriptor afd;
            try { afd = getAssets().openFd("beneath_the_mask_instrumental.mp3"); }
            catch (Exception missing) { afd = getAssets().openFd("beneath_the_mask.mp3"); }
            music = new MediaPlayer();
            music.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            music.setLooping(true);
            music.prepare();
        } catch (Exception e) { Log.e("IN_MOTION", "Background music unavailable", e); }

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
        boolean shouldPlay = isResumed && !lockdownActive && !speechPromptActive && !preferences.getBoolean("muted", false);
        try {
            if (shouldPlay && !music.isPlaying()) music.start();
            else if (!shouldPlay && music.isPlaying()) music.pause();
        } catch (Exception e) { Log.w("IN_MOTION", "Audio playback change", e); }
    }

    public class AudioBridge {
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
            runOnUiThread(() -> syncPlayback());
        }
        @JavascriptInterface public void startVoiceInput(String target) {
            if (!("editor".equals(target) || "lockdown".equals(target) || "agent".equals(target))) return;
            runOnUiThread(() -> {
                if (speechPromptActive) return;
                pendingSpeechTarget = target;
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag());
                intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak to IN MOTION");
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                speechPromptActive = true;
                syncPlayback();
                syncLockdownMusic();
                try {
                    startActivityForResult(intent, VOICE_REQUEST_CODE);
                } catch (Exception e) {
                    speechPromptActive = false;
                    syncPlayback();
                    syncLockdownMusic();
                    notifySpeechFailure("Speech recognition service is not installed.");
                    Log.w("IN_MOTION", "Speech recognizer unavailable", e);
                }
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
        if (requestCode != VOICE_REQUEST_CODE) return;
        speechPromptActive = false;
        syncPlayback();
        syncLockdownMusic();
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
        syncLockdownMusic();
        if(webView != null) webView.onResume();
    }
    @Override protected void onPause() {
        isResumed = false;
        syncPlayback(); syncLockdownMusic();
        if(webView != null) webView.onPause(); super.onPause();
    }
    @Override @SuppressWarnings("deprecation") public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("window.handleAndroidBack()", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        if(lockdownMusic!=null){lockdownMusic.release();lockdownMusic=null;}
        if (music != null) { music.release(); music = null; }
        if (soundPool != null) { soundPool.release(); soundPool = null; }
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
